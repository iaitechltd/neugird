/**
 * Perp-vault chain adapter (T2 of docs/TRADING_ENGINE_AUDIT.md §5) — gives
 * TradeX futures a REAL counterparty (audit F1): margin lands in a segregated
 * on-chain collateral vault, profits are PAID from the treasury-seeded LP
 * pool, losses flow INTO it, liquidation remainders fund the insurance vault
 * and bad debt draws it down. The platform engine stays the price/PnL
 * authority in v1 (the TWAP-banded mark — T3 moves it on-chain); this program
 * enforces CONSERVATION on every settlement it mirrors.
 *
 * Engine is global (one per authority, all markets share the LP pool). First
 * use auto-inits it and, on devnet, seeds the LP vault (NEUGRID_PERP_LP_SEED,
 * default 50,000 quote — mainnet seeding is an explicit treasury op).
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_PERP_PROGRAM_ID ·
 * NEUGRID_X402_ASSET (quote mint) · NEUGRID_SOLANA_RPC ·
 * NEUGRID_VAULT_PAYER_SECRET (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import idlJson from "./perp-idl.json";
import { poolIdOf } from "./ammSolana"; // the SAME id links pool ↔ oracle ↔ position
import type { Position } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface PerpConfig { programId: string; rpc: string; quoteMint: string; payerSecret: string; cluster: string; lpSeed: number }

export function perpConfig(): PerpConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_PERP_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const quoteMint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !quoteMint || !payerSecret) return null;
  return {
    programId, rpc, quoteMint, payerSecret,
    cluster: process.env.NEUGRID_X402_NETWORK || "solana",
    lpSeed: Number(process.env.NEUGRID_PERP_LP_SEED ?? 50_000),
  };
}

/** Stable u64 id from the platform position id. */
export function posIdOf(position_id: string): bigint {
  return createHash("sha256").update(`perp:${position_id}`).digest().readBigUInt64LE(0);
}

const units = (n: number) => BigInt(Math.max(0, Math.round(n * 1e6)));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: PerpConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const quoteMint = new web3.PublicKey(cfg.quoteMint);

  const engine = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("engine"), payer.publicKey.toBuffer()],
    program.programId,
  )[0];
  const vault = (tag: string) =>
    web3.PublicKey.findProgramAddressSync([Buffer.from(tag), engine.toBuffer()], program.programId)[0];
  const posPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pos"), engine.toBuffer(), buf],
      program.programId,
    )[0];
  };
  const markPda = (marketId: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(marketId);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mark"), engine.toBuffer(), buf],
      program.programId,
    )[0];
  };

  return { spl, web3, BN, payer, connection, program, quoteMint, engine, vault, posPda, markPda };
}

/** Devnet nicety (same as the AMM adapter): mint-authority payers top up quote. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureQuote(c: any, needed: bigint): Promise<any> {
  const acct = await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.quoteMint, c.payer.publicKey);
  const have = BigInt(acct.amount.toString());
  if (have < needed) {
    try {
      await c.spl.mintTo(c.connection, c.payer, c.quoteMint, acct.address, c.payer, needed - have);
    } catch { /* not the mint authority (mainnet) — funding is an ops concern */ }
  }
  return acct.address;
}

/** Idempotent engine init + first LP seed (devnet). Returns the engine PDA. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureEngine(c: any, cfg: PerpConfig): Promise<void> {
  const info = await c.connection.getAccountInfo(c.engine);
  if (!info) {
    await c.program.methods
      .initEngine(2500) // 25% of LP depth — mirrors the platform default posture
      .accounts({ authority: c.payer.publicKey, quoteMint: c.quoteMint })
      .rpc();
  }
  const lpVault = c.vault("lp");
  const lp = await c.connection.getTokenAccountBalance(lpVault).catch(() => null);
  if (lp && Number(lp.value.amount) === 0 && cfg.lpSeed > 0) {
    const myQuote = await ensureQuote(c, units(cfg.lpSeed));
    await c.program.methods
      .lpDeposit(new c.BN(units(cfg.lpSeed).toString()))
      .accounts({ authority: c.payer.publicKey, engine: c.engine, authorityQuote: myQuote, lpVault })
      .rpc();
  }
}

/** Open mirror: real margin into the segregated collateral vault. */
export async function mirrorOpen(p: Position): Promise<void> {
  const cfg = perpConfig();
  if (!cfg || !(p.margin > 0)) return;
  const c = await client(cfg);
  await ensureEngine(c, cfg);
  const myQuote = await ensureQuote(c, units(p.margin));
  const notional = p.margin * p.leverage;
  const tx = await c.program.methods
    .openPosition(
      new c.BN(posIdOf(p.position_id).toString()),
      new c.BN(poolIdOf(p.market_id).toString()),
      p.side === "long" ? 0 : 1,
      new c.BN(units(p.margin).toString()),
      new c.BN(units(notional).toString()),
      new c.BN(units(p.entry_price).toString()),
    )
    .accounts({
      authority: c.payer.publicKey,
      engine: c.engine,
      position: c.posPda(posIdOf(p.position_id)),
      authorityQuote: myQuote,
      lpVault: c.vault("lp"),
      collateralVault: c.vault("collateral"),
    })
    .rpc();
  p.onchain = { position: c.posPda(posIdOf(p.position_id)).toBase58(), program: cfg.programId, cluster: cfg.cluster, txs: [tx] };
}

/** Close mirror with the platform-computed settlement split at `exitPrice`.
 *  T3: when the market's oracle has been cranked, the program VALIDATES the
 *  close — exit within ±band of the on-chain TWAP, fresh oracle, LP outflow
 *  bounded. `toInsurance` = the liquidation remainder; `insuranceToLp` = bad
 *  debt to absorb (capped at the fund's real balance — never negative). */
export async function mirrorClose(p: Position, toTrader: number, toInsurance: number, insuranceToLp: number, exitPrice: number): Promise<void> {
  const cfg = perpConfig();
  if (!cfg) return;
  const c = await client(cfg);
  // Derive the position PDA deterministically (it does NOT depend on the open
  // mirror having set p.onchain) so a close that races ahead of its own open
  // mirror still targets the right account. If the position was never actually
  // opened on-chain there is nothing to close — skip gracefully.
  const position = c.posPda(posIdOf(p.position_id));
  if (!(await c.connection.getAccountInfo(position))) return;
  if (!p.onchain?.position) p.onchain = { position: position.toBase58(), program: cfg.programId, cluster: cfg.cluster, txs: [] };
  const myQuote = await ensureQuote(c, BigInt(0));
  let insLp = units(insuranceToLp);
  if (insLp > BigInt(0)) {
    const ins = await c.connection.getTokenAccountBalance(c.vault("insurance")).catch(() => null);
    const available = ins ? BigInt(ins.value.amount) : BigInt(0);
    if (insLp > available) insLp = available; // platform tracks the underwater gap
  }
  const oracle = c.markPda(poolIdOf(p.market_id));
  const oracleExists = !!(await c.connection.getAccountInfo(oracle));
  const tx = await c.program.methods
    .closePosition(
      new c.BN(units(exitPrice).toString()),
      new c.BN(units(toTrader).toString()),
      new c.BN(units(toInsurance).toString()),
      new c.BN(insLp.toString()),
    )
    .accounts({
      authority: c.payer.publicKey,
      engine: c.engine,
      position,
      markOracle: oracleExists ? oracle : null,
      lpVault: c.vault("lp"),
      insuranceVault: c.vault("insurance"),
      collateralVault: c.vault("collateral"),
      traderQuote: myQuote,
    })
    .rpc();
  p.onchain.txs = [...(p.onchain.txs ?? []), tx].slice(-10);
}

/** Permissionless keeper: refresh a market's mark oracle from the AMM's
 *  on-chain TwapState (the T3 crank — scheduler-driven, anyone may call). */
export async function crankMark(market_id: string): Promise<void> {
  const cfg = perpConfig();
  const ammProgram = process.env.NEUGRID_AMM_PROGRAM_ID;
  if (!cfg || !ammProgram) return;
  const c = await client(cfg);
  const id = poolIdOf(market_id);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(id);
  const ammPid = new c.web3.PublicKey(ammProgram);
  const ammPool = c.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), c.payer.publicKey.toBuffer(), buf],
    ammPid,
  )[0];
  if (!(await c.connection.getAccountInfo(ammPool))) return; // market has no on-chain pool
  const twapState = c.web3.PublicKey.findProgramAddressSync([Buffer.from("twap"), ammPool.toBuffer()], ammPid)[0];
  if (!(await c.connection.getAccountInfo(twapState))) return; // pre-T3 pool — no accumulator
  await c.program.methods
    .crankMark(new c.BN(id.toString()))
    .accounts({
      cranker: c.payer.publicKey,
      engine: c.engine,
      ammPool,
      twapState,
      markOracle: c.markPda(id),
    })
    .rpc();
}
