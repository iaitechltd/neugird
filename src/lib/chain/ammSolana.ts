/**
 * Market-AMM chain adapter (T1 of docs/TRADING_ENGINE_AUDIT.md §5) — mirrors
 * TradeX's constant-product pools onto the REAL `market_amm` program
 * (contracts/, devnet-deployed): launching a token creates a real SPL mint +
 * an on-chain pool with REAL seeded vaults (closes audit F3 — reserves stop
 * being ledger fiction), and every curve movement (market orders AND limit
 * fills — both route through executeSwap) mirrors as an on-chain swap.
 *
 * Mirror-parity design: the on-chain pool is created with fee 0 and receives
 * the NET amounts that moved the platform curve, so vault balances track the
 * ledger reserves 1:1 (unit-rounded at 6dp per movement). Fee routing stays
 * platform-side in v1; the program's own fee machinery (built + tested) takes
 * over when trading goes fully on-chain at the wallet-adapter phase.
 *
 * Same v1 trust posture as the other six rails: the operational keypair plays
 * custodian-of-record; POOL STATE is publicly verifiable on-chain.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_AMM_PROGRAM_ID ·
 * NEUGRID_X402_ASSET (quote mint) · NEUGRID_SOLANA_RPC ·
 * NEUGRID_VAULT_PAYER_SECRET (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import idlJson from "./amm-idl.json";
import type { Market } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface AmmConfig { programId: string; rpc: string; quoteMint: string; payerSecret: string; cluster: string }

export function ammConfig(): AmmConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_AMM_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const quoteMint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !quoteMint || !payerSecret) return null;
  return { programId, rpc, quoteMint, payerSecret, cluster: process.env.NEUGRID_X402_NETWORK || "solana" };
}

/** Stable u64 pool id from the platform market id. */
export function poolIdOf(market_id: string): bigint {
  return createHash("sha256").update(`amm:${market_id}`).digest().readBigUInt64LE(0);
}

const units = (n: number) => BigInt(Math.max(0, Math.round(n * 1e6))); // 6dp mints

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: AmmConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const quoteMint = new web3.PublicKey(cfg.quoteMint);

  const poolPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  const feeVaultPda = (pool: InstanceType<typeof web3.PublicKey>) =>
    web3.PublicKey.findProgramAddressSync([Buffer.from("fees"), pool.toBuffer()], program.programId)[0];
  const ata = (mint: InstanceType<typeof web3.PublicKey>, owner: InstanceType<typeof web3.PublicKey>, off = false) =>
    spl.getAssociatedTokenAddressSync(mint, owner, off);

  return { spl, web3, BN, payer, connection, program, quoteMint, poolPda, feeVaultPda, ata };
}

/** Devnet nicety: when the payer is the quote mint's authority (our test mint),
 *  top up any shortfall so mirrors never stall on funding. No-op on real USDC. */
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

function noteTx(m: Market, tx: string): void {
  if (!m.onchain) return;
  m.onchain.txs = [...(m.onchain.txs ?? []), tx].slice(-25);
}

/** Launch mirror: real SPL mint + on-chain pool + REAL seeded reserves. */
export async function mirrorLaunch(m: Market, poolBase: number, quoteSeed: number): Promise<void> {
  const cfg = ammConfig();
  if (!cfg || !(poolBase > 0) || !(quoteSeed > 0)) return;
  const c = await client(cfg);

  // the market's real token — 6dp SPL, payer = mint authority (v1 custody)
  const baseMint = await c.spl.createMint(c.connection, c.payer, c.payer.publicKey, null, 6);
  const myBase = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, baseMint, c.payer.publicKey)).address;
  await c.spl.mintTo(c.connection, c.payer, baseMint, myBase, c.payer, units(poolBase));
  const myQuote = await ensureQuote(c, units(quoteSeed));

  const id = poolIdOf(m.market_id);
  const pool = c.poolPda(id);
  const createTx = await c.program.methods
    .createPool(new c.BN(id.toString()), 0) // fee 0 — net-amount parity mirror (see header)
    .accounts({ authority: c.payer.publicKey, baseMint, quoteMint: c.quoteMint })
    .rpc();
  const seedTx = await c.program.methods
    .seed(new c.BN(units(poolBase).toString()), new c.BN(units(quoteSeed).toString()))
    .accounts({
      authority: c.payer.publicKey,
      pool,
      authorityBase: myBase,
      authorityQuote: myQuote,
      baseVault: c.ata(baseMint, pool, true),
      quoteVault: c.ata(c.quoteMint, pool, true),
    })
    .rpc();

  m.onchain = {
    pool: pool.toBase58(),
    base_mint: baseMint.toBase58(),
    program: cfg.programId,
    cluster: cfg.cluster,
    txs: [createTx, seedTx],
  };
}

/** Swap mirror: the NET curve movement lands on the real vaults. */
export async function mirrorSwap(m: Market, side: "buy" | "sell", amount: number): Promise<void> {
  const cfg = ammConfig();
  if (!cfg || !m.onchain?.pool || !(amount > 0)) return;
  const c = await client(cfg);
  const pool = new c.web3.PublicKey(m.onchain.pool);
  const baseMint = new c.web3.PublicKey(m.onchain.base_mint);
  const myBase = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, baseMint, c.payer.publicKey)).address;
  const myQuote = side === "buy" ? await ensureQuote(c, units(amount)) : c.ata(c.quoteMint, c.payer.publicKey);
  const tx = await c.program.methods
    .swap(side === "buy" ? 0 : 1, new c.BN(units(amount).toString()), new c.BN(0))
    .accounts({
      authority: c.payer.publicKey,
      pool,
      baseVault: c.ata(baseMint, pool, true),
      quoteVault: c.ata(c.quoteMint, pool, true),
      feeVault: c.feeVaultPda(pool),
      userBase: myBase,
      userQuote: myQuote,
    })
    .rpc();
  noteTx(m, tx);
}

/** Fraud-halt mirror (both directions — quorum trips it, clearing restores). */
export async function mirrorHalt(m: Market, halted: boolean): Promise<void> {
  const cfg = ammConfig();
  if (!cfg || !m.onchain?.pool) return;
  const c = await client(cfg);
  const tx = await c.program.methods
    .setHalt(halted)
    .accounts({ authority: c.payer.publicKey, pool: new c.web3.PublicKey(m.onchain.pool) })
    .rpc();
  noteTx(m, tx);
}
