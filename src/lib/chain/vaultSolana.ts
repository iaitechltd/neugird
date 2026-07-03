/**
 * Milestone-Vault chain adapter — mirrors Fund escrow lifecycle onto the
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

/* --------------- ICP release authority (A3 — trustless custody) ---------------- */
// When the neugrid_signer canister is armed, new vaults name its threshold-Ed25519
// Solana address as `release_authority`: the program then refuses any releasing
// vote the canister has not co-signed, and the canister only signs release-shaped
// messages (its policy layer). Env: NEUGRID_ICP_SIGNER_CANISTER_ID (+ the shared
// NEUGRID_ICP_HOST — a localhost host means local replica → fetchRootKey).

interface IcpSignerConfig { canisterId: string; host: string; local: boolean }

export function icpSignerConfig(): IcpSignerConfig | null {
  const canisterId = process.env.NEUGRID_ICP_SIGNER_CANISTER_ID;
  if (!canisterId) return null;
  const host = process.env.NEUGRID_ICP_HOST || "https://icp0.io";
  return { canisterId, host, local: /localhost|127\.0\.0\.1/.test(host) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let signerActorPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function signerActor(cfg: IcpSignerConfig): Promise<any> {
  signerActorPromise ??= (async () => {
    const agentPkg = "@dfinity/agent";
    const { HttpAgent, Actor } = await nodeImport(agentPkg);
    const agent = await HttpAgent.create({ host: cfg.host, shouldFetchRootKey: cfg.local });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idl = ({ IDL }: any) =>
      IDL.Service({
        solana_address: IDL.Func([], [IDL.Text], []),
        sign_vault_release: IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Vec(IDL.Nat8)], []),
      });
    return Actor.createActor(idl, { agent, canisterId: cfg.canisterId });
  })();
  return signerActorPromise;
}

let releaseAuthorityCache: string | null = null;
/** The canister's Solana address (the vaults' release authority). Null when unarmed. */
export async function releaseAuthorityAddress(): Promise<string | null> {
  const cfg = icpSignerConfig();
  if (!cfg) return null;
  if (!releaseAuthorityCache) {
    releaseAuthorityCache = (await (await signerActor(cfg)).solana_address()) as string;
  }
  return releaseAuthorityCache;
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
  const authority = await releaseAuthorityAddress(); // ICP canister, when armed
  const sig = await c.program.methods
    .createVault(
      new c.BN(id.toString()), tranches, new c.BN(raiseSeconds), new c.BN(stallSeconds),
      authority ? new c.web3.PublicKey(authority) : null,
    )
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
  p.onchain = { vault: vault.toBase58(), program: cfg.programId, cluster: cfg.cluster, txs: [sig], ...(authority ? { release_authority: authority } : {}) };
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

/** Mirror a released milestone: the aggregate on-chain vote releases the tranche.
 *  Vaults with an ICP release authority route through the signer canister — the
 *  releasing vote is co-signed by its threshold-Ed25519 key (policy-checked). */
export async function mirrorRelease(p: Proposal, milestoneOrder: number): Promise<void> {
  const cfg = vaultConfig();
  if (!cfg || !p.onchain?.vault) return;
  const c = await client(cfg);
  const vault = new c.web3.PublicKey(p.onchain.vault);
  const founderAta = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.mint, c.payer.publicKey)).address;
  const onchainVault = await c.program.account.vault.fetch(vault);
  const authority: InstanceType<typeof c.web3.PublicKey> = onchainVault.releaseAuthority;
  const needsCoSign = !authority.equals(c.web3.PublicKey.default);

  const builder = c.program.methods
    .vote(milestoneOrder, true)
    .accounts({
      backer: c.payer.publicKey,
      vault,
      backing: c.backingPda(vault),
      vaultToken: c.vaultAta(vault),
      founderToken: founderAta,
      releaseAuthority: needsCoSign ? authority : null,
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    });

  let sig: string;
  if (needsCoSign) {
    const signerCfg = icpSignerConfig();
    if (!signerCfg) throw new Error("vault requires the ICP release authority but NEUGRID_ICP_SIGNER_CANISTER_ID is unset");
    const tx = await builder.transaction();
    tx.feePayer = c.payer.publicKey;
    tx.recentBlockhash = (await c.connection.getLatestBlockhash("confirmed")).blockhash;
    tx.partialSign(c.payer);
    const canisterSig = await (await signerActor(signerCfg)).sign_vault_release([...tx.serializeMessage()]);
    tx.addSignature(authority, Buffer.from(canisterSig));
    sig = await c.connection.sendRawTransaction(tx.serialize());
    await c.connection.confirmTransaction(sig, "confirmed");
  } else {
    sig = await builder.rpc();
  }
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
