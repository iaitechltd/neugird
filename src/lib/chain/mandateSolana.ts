/**
 * Mandate-wallet chain adapter — mirrors Agent-Mode mandates onto the REAL
 * `mandate_wallet` program (contracts/, devnet-deployed): arming a mandate
 * creates a chain wallet whose VAULT BALANCE IS THE BUDGET (funded with real
 * tUSDC), each executed buy spends through it under the per-tx cap, and the
 * owner's kill-switch blocks the chain wallet too.
 *
 * v1 mirror: the operational key plays owner AND agent (documented in the
 * program header); external agents already hold their own Solana signers, so
 * true key separation is a config change, not a build.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_MANDATE_PROGRAM_ID ·
 * NEUGRID_X402_ASSET · NEUGRID_SOLANA_RPC · NEUGRID_VAULT_PAYER_SECRET
 * (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import idlJson from "./mandate-idl.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface MandateConfig { programId: string; rpc: string; mint: string; payerSecret: string }

export function mandateConfig(): MandateConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_MANDATE_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const mint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !mint || !payerSecret) return null;
  return { programId, rpc, mint, payerSecret };
}

export function mandateIdOf(mandate_id: string): bigint {
  return createHash("sha256").update(`mandate:${mandate_id}`).digest().readBigUInt64LE(0);
}

const usdc = (n: number) => Math.round(n * 1e6);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: MandateConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const mint = new web3.PublicKey(cfg.mint);
  const mandatePda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mandate"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  return { spl, web3, BN, payer, connection, program, mint, mandatePda };
}

/** Devnet: the operational payer tops itself up when it is the mint authority. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureFunds(c: any, atomic: number): Promise<any> {
  const ata = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  const have = Number((await c.spl.getAccount(c.connection, ata)).amount);
  if (have < atomic) {
    const info = await c.spl.getMint(c.connection, c.mint);
    if (info.mintAuthority?.equals(c.payer.publicKey)) {
      await c.spl.mintTo(c.connection, c.payer, c.mint, ata, c.payer, BigInt(atomic - have));
    }
  }
  return ata;
}

/** Arm the chain wallet: create the mandate + fund its vault with the budget. */
export async function mirrorCreate(mandate_id: string, budgetUsd: number, perTxCapUsd: number, expiryISO: string): Promise<void> {
  const cfg = mandateConfig();
  if (!cfg || !(budgetUsd > 0)) return;
  const c = await client(cfg);
  const id = mandateIdOf(mandate_id);
  const mandate = c.mandatePda(id);
  if (await c.connection.getAccountInfo(mandate)) return; // idempotent
  const vault = c.spl.getAssociatedTokenAddressSync(c.mint, mandate, true);
  await c.program.methods
    .createMandate(new c.BN(id.toString()), c.payer.publicKey, new c.BN(usdc(perTxCapUsd)), new c.BN(Math.floor(Date.parse(expiryISO) / 1000)))
    .accounts({
      owner: c.payer.publicKey, mandate, mint: c.mint, vault,
      tokenProgram: c.spl.TOKEN_PROGRAM_ID, associatedTokenProgram: c.spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
  // fund the vault — the balance IS the budget
  const src = await ensureFunds(c, usdc(budgetUsd));
  await c.spl.transfer(c.connection, c.payer, src, vault, c.payer, BigInt(usdc(budgetUsd)));
}

/** Mirror an executed buy: the AGENT key spends through the chain wallet. */
export async function mirrorSpend(mandate_id: string, amountUsd: number): Promise<void> {
  const cfg = mandateConfig();
  if (!cfg || !(amountUsd > 0)) return;
  const c = await client(cfg);
  const mandate = c.mandatePda(mandateIdOf(mandate_id));
  if (!(await c.connection.getAccountInfo(mandate))) return;
  const venue = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  await c.program.methods
    .agentSpend(new c.BN(usdc(amountUsd)))
    .accounts({
      agent: c.payer.publicKey, mandate,
      vault: c.spl.getAssociatedTokenAddressSync(c.mint, mandate, true),
      destination: venue, tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Mirror the kill-switch + reclaim the unspent remainder to the owner. */
export async function mirrorKill(mandate_id: string): Promise<void> {
  const cfg = mandateConfig();
  if (!cfg) return;
  const c = await client(cfg);
  const mandate = c.mandatePda(mandateIdOf(mandate_id));
  if (!(await c.connection.getAccountInfo(mandate))) return;
  await c.program.methods.kill().accounts({ owner: c.payer.publicKey, mandate }).rpc();
  const vault = c.spl.getAssociatedTokenAddressSync(c.mint, mandate, true);
  const remaining = Number((await c.spl.getAccount(c.connection, vault)).amount);
  if (remaining > 0) {
    const ownerToken = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
    await c.program.methods
      .ownerWithdraw(new c.BN(remaining))
      .accounts({ owner: c.payer.publicKey, mandate, vault, ownerToken, tokenProgram: c.spl.TOKEN_PROGRAM_ID })
      .rpc();
  }
}
