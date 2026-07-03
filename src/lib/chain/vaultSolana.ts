/**
 * Milestone-Vault chain adapter — mirrors GenesisX escrow lifecycle onto the
 * REAL `milestone_vault` Anchor program (contracts/, devnet-deployed). Every
 * raise gets an on-chain vault whose state (escrowed / released / refunded) is
 * publicly verifiable per tranche.
 *
 * TRUST POSTURE (v1, stated plainly): the platform's operational keypair plays
 * founder + aggregate backer on-chain, moving real (dev) USDC through the
 * program as the platform's ledger moves. That makes escrow ACCOUNTING
 * verifiable — it does not yet make custody trustless. The next stages are
 * user-signed backings (wallet adapter) and the ICP canister as the release
 * authority (docs/ICP_INTEGRATION.md Rank 1).
 *
 * Config (all required, else inactive):
 *   NEUGRID_CHAIN_MODE=solana · NEUGRID_VAULT_PROGRAM_ID · NEUGRID_SOLANA_RPC ·
 *   NEUGRID_X402_ASSET (the escrow mint) ·
 *   NEUGRID_VAULT_PAYER_SECRET (falls back to NEUGRID_SAS_ISSUER_SECRET)
 *
 * `@coral-xyz/anchor` + `@solana/spl-token` load via NON-ANALYZABLE dynamic
 * imports (tracer-invisible — remember the Dockerfile overlay).
 */

import { createHash } from "node:crypto";
import * as Params from "../modules/params";
import type { Proposal } from "../types";
import idlJson from "./vault-idl.json";

// Native, UNBUNDLED dynamic import — the ignore comments stop the bundler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface VaultConfig { programId: string; rpc: string; mint: string; payerSecret: string; cluster: string }

export function vaultConfig(): VaultConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_VAULT_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const mint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !mint || !payerSecret) return null;
  return { programId, rpc, mint, payerSecret, cluster: process.env.NEUGRID_SOLANA_CLUSTER || "devnet" };
}

/** Stable u64 vault id from the proposal id (the PDA seed). */
export function vaultIdOf(proposal_id: string): bigint {
  return createHash("sha256").update(proposal_id).digest().readBigUInt64LE(0);
}

const usdc = (n: number) => Math.round(n * 1e6); // platform USD → 6dp atomic

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: VaultConfig): Promise<any> {
  const anchorPkg = "@coral-xyz/anchor";
  const splPkg = "@solana/spl-token";
  const [anchor, spl] = await Promise.all([nodeImport(anchorPkg), nodeImport(splPkg)]);
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const bs58 = (await nodeImport("bs58")).default;

  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const idl = { ...idlJson, address: cfg.programId };
  const program = new Program(idl, provider);
  const mint = new web3.PublicKey(cfg.mint);

  const vaultPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  const backingPda = (vault: InstanceType<typeof web3.PublicKey>) =>
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("backing"), vault.toBuffer(), payer.publicKey.toBuffer()],
      program.programId,
    )[0];
  const vaultAta = (vault: InstanceType<typeof web3.PublicKey>) =>
    spl.getAssociatedTokenAddressSync(mint, vault, true);

  /** Devnet-only: the operational payer tops itself up when it is the mint
   *  authority (mirror backings need real tokens; mainnet = real user custody). */
  async function ensureFunds(amount: number): Promise<InstanceType<typeof web3.PublicKey>> {
    const ata = (await spl.getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey)).address;
    const bal = Number((await spl.getAccount(connection, ata)).amount);
    if (bal < amount) {
      const info = await spl.getMint(connection, mint);
      if (info.mintAuthority?.equals(payer.publicKey)) {
        await spl.mintTo(connection, payer, mint, ata, payer, BigInt(amount - bal));
      }
    }
    return ata;
  }

  return { anchor, spl, web3, BN, payer, connection, program, mint, vaultPda, backingPda, vaultAta, ensureFunds };
}

/** Create the on-chain vault for a new raise; fills `proposal.onchain`. */
export async function mirrorCreate(p: Proposal): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || p.onchain?.vault) return;
  const c = await client(cfg);
  const id = vaultIdOf(p.proposal_id);
  const vault = c.vaultPda(id);
  const tranches = p.roadmap.map((m) => new c.BN(usdc(m.amount)));
  const raiseSeconds = Math.max(3600, Math.round((Date.parse(p.closes_at ?? "") - Date.now()) / 1000) || 0);
  const stallSeconds = Params.get("genesis_stall_days") * 86_400;
  const sig = await c.program.methods
    .createVault(new c.BN(id.toString()), tranches, new c.BN(raiseSeconds), new c.BN(stallSeconds))
    .accounts({
      founder: c.payer.publicKey,
      vault,
      usdcMint: c.mint,
      vaultToken: c.vaultAta(vault),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
      associatedTokenProgram: c.spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
  p.onchain = { vault: vault.toBase58(), program: cfg.programId, cluster: cfg.cluster, txs: [sig] };
}

/** Mirror a backing: real tokens move into the vault's escrow account. */
export async function mirrorBack(p: Proposal, amount: number): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || !p.onchain?.vault) return;
  const c = await client(cfg);
  const vault = new c.web3.PublicKey(p.onchain.vault);
  const atomic = usdc(amount);
  const payerAta = await c.ensureFunds(atomic);
  const sig = await c.program.methods
    .back(new c.BN(atomic))
    .accounts({
      backer: c.payer.publicKey,
      vault,
      backing: c.backingPda(vault),
      backerToken: payerAta,
      vaultToken: c.vaultAta(vault),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
  (p.onchain.txs ??= []).push(sig);
}

/** Mirror a released milestone: the aggregate on-chain vote releases the tranche. */
export async function mirrorRelease(p: Proposal, milestoneOrder: number): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || !p.onchain?.vault) return;
  const c = await client(cfg);
  const vault = new c.web3.PublicKey(p.onchain.vault);
  const founderAta = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  const sig = await c.program.methods
    .vote(milestoneOrder, true)
    .accounts({
      backer: c.payer.publicKey,
      vault,
      backing: c.backingPda(vault),
      vaultToken: c.vaultAta(vault),
      founderToken: founderAta,
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
  (p.onchain.txs ??= []).push(sig);
}

/** Mirror an expired raise: flip FAILED on-chain + reclaim the escrow. */
export async function mirrorExpire(p: Proposal): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || !p.onchain?.vault) return;
  const c = await client(cfg);
  const vault = new c.web3.PublicKey(p.onchain.vault);
  const sig = await c.program.methods.expireRaise().accounts({ vault }).rpc();
  (p.onchain.txs ??= []).push(sig);
  await claim(c, p, vault);
}

/** Mirror the kill-switch: fail the vault on-chain + reclaim the remainder. */
export async function mirrorKill(p: Proposal): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || !p.onchain?.vault) return;
  const c = await client(cfg);
  const vault = new c.web3.PublicKey(p.onchain.vault);
  const sig = await c.program.methods
    .killSwitch()
    .accounts({ backer: c.payer.publicKey, vault, backing: c.backingPda(vault) })
    .rpc();
  (p.onchain.txs ??= []).push(sig);
  await claim(c, p, vault);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function claim(c: any, p: Proposal, vault: any): Promise<void> {
  const backerAta = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  const sig = await c.program.methods
    .claimRefund()
    .accounts({
      backer: c.payer.publicKey,
      vault,
      backing: c.backingPda(vault),
      vaultToken: c.vaultAta(vault),
      backerToken: backerAta,
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
  (p.onchain!.txs ??= []).push(sig);
}
