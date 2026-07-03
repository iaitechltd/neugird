/**
 * Revenue-splitter chain adapter — mirrors SubGrid split agreements + payouts
 * onto the REAL `revenue_splitter` program (contracts/, devnet-deployed): the
 * member table (bps) configures on-chain, and each platform distribution
 * executes as ONE atomic on-chain split of real tUSDC.
 *
 * Member destinations: a party with a bound Solana wallet receives directly;
 * unbound parties' shares route to the operational treasury (custody until they
 * bind) — the same posture as the GRID claim mirror.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_SPLITTER_PROGRAM_ID ·
 * NEUGRID_X402_ASSET (the revenue mint) · NEUGRID_SOLANA_RPC ·
 * NEUGRID_VAULT_PAYER_SECRET (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import { db } from "../store";
import type { ContributorSplit } from "../types";
import idlJson from "./splitter-idl.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface SplitsConfig { programId: string; rpc: string; mint: string; payerSecret: string }

export function splitsConfig(): SplitsConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_SPLITTER_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const mint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !mint || !payerSecret) return null;
  return { programId, rpc, mint, payerSecret };
}

export function splitIdOf(subgrid_id: string): bigint {
  return createHash("sha256").update(`split:${subgrid_id}`).digest().readBigUInt64LE(0);
}

const usdc = (n: number) => Math.round(n * 1e6);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: SplitsConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const mint = new web3.PublicKey(cfg.mint);
  const splitterPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("split"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  return { spl, web3, BN, payer, connection, program, mint, splitterPda };
}

/** A party's on-chain destination: their bound wallet, else treasury custody. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walletOf(c: any, s: ContributorSplit): InstanceType<any> {
  const partyUser = s.party_type === "user"
    ? db.users.find((u) => u.id === s.party_id)
    : db.users.find((u) => u.id === (s.beneficiary_id ?? db.agents.find((a) => a.agent_id === s.party_id)?.owner_id));
  const addr = partyUser?.wallet_addresses?.[0];
  if (addr) {
    try { return new c.web3.PublicKey(addr); } catch { /* pseudo wallet → custody */ }
  }
  return c.payer.publicKey;
}

/** Mirror the split table on-chain (create or replace). */
export async function mirrorConfigure(subgrid_id: string, splits: ContributorSplit[]): Promise<void> {
  const cfg = splitsConfig();
  if (!cfg || !splits.length) return;
  const c = await client(cfg);
  const id = splitIdOf(subgrid_id);
  const members = splits.map((s) => ({ wallet: walletOf(c, s), bps: Math.round(s.basis_points) }));
  const myUsdc = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  await c.program.methods
    .configure(new c.BN(id.toString()), members)
    .accounts({
      authority: c.payer.publicKey, splitter: c.splitterPda(id), mintToken: myUsdc,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
}

/** Mirror a distribution: one atomic on-chain split of real tokens. */
export async function mirrorDistribute(subgrid_id: string, amount: number): Promise<void> {
  const cfg = splitsConfig();
  if (!cfg || !(amount > 0)) return;
  const c = await client(cfg);
  const id = splitIdOf(subgrid_id);
  const splitter = c.splitterPda(id);
  if (!(await c.connection.getAccountInfo(splitter))) return; // not configured on-chain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = await (c.program.account as any).splitter.fetch(splitter);
  // recipients in member order; ATAs created idempotently (payer funds rent)
  const recipients = [];
  for (const m of state.members) {
    const ata = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, m.wallet)).address;
    recipients.push({ pubkey: ata, isSigner: false, isWritable: true });
  }
  const myUsdc = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  // devnet: the operational payer tops itself up when it is the mint authority
  const atomic = usdc(amount);
  const have = Number((await c.spl.getAccount(c.connection, myUsdc)).amount);
  if (have < atomic) {
    const info = await c.spl.getMint(c.connection, c.mint);
    if (info.mintAuthority?.equals(c.payer.publicKey)) {
      await c.spl.mintTo(c.connection, c.payer, c.mint, myUsdc, c.payer, BigInt(atomic - have));
    }
  }
  await c.program.methods
    .distribute(new c.BN(atomic))
    .accounts({ authority: c.payer.publicKey, splitter, source: myUsdc, tokenProgram: c.spl.TOKEN_PROGRAM_ID })
    .remainingAccounts(recipients)
    .rpc();
}
