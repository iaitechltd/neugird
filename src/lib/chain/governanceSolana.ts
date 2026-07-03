/**
 * Governance chain adapter — mirrors the platform's lock-to-vote lifecycle onto
 * the REAL `grid_governance` program (contracts/, devnet-deployed): proposals
 * open on-chain with the same quorum/deadline + the title's sha256 pin, votes
 * lock actual GRID, resolution settles at the deadline with the platform's
 * exact rule, and locks reclaim to the treasury afterward.
 *
 * Same v1 trust posture as the other mirrors: the operational keypair carries
 * the aggregate FOR/AGAINST locks. Realms/SPL-Governance is the TGE-era path
 * (per-user wallets); enactment (set_param / treasury_transfer) stays platform-side.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_GOVERNANCE_PROGRAM_ID ·
 * NEUGRID_GRID_MINT · NEUGRID_SOLANA_RPC · NEUGRID_VAULT_PAYER_SECRET
 * (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import idlJson from "./governance-idl.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface GovConfig { programId: string; rpc: string; gridMint: string; payerSecret: string }

export function govConfig(): GovConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_GOVERNANCE_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const gridMint = process.env.NEUGRID_GRID_MINT;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !gridMint || !payerSecret) return null;
  return { programId, rpc, gridMint, payerSecret };
}

export function govIdOf(proposal_id: string): bigint {
  return createHash("sha256").update(`gov:${proposal_id}`).digest().readBigUInt64LE(0);
}

const grid = (n: number) => Math.round(n * 1e6);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: GovConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const gridMint = new web3.PublicKey(cfg.gridMint);

  const propPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("gov"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  const lockPda = (proposal: InstanceType<typeof web3.PublicKey>, side: number) =>
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lock"), proposal.toBuffer(), payer.publicKey.toBuffer(), Buffer.from([side])],
      program.programId,
    )[0];
  const vault = (proposal: InstanceType<typeof web3.PublicKey>) =>
    spl.getAssociatedTokenAddressSync(gridMint, proposal, true);

  return { spl, web3, BN, payer, connection, program, gridMint, propPda, lockPda, vault };
}

/** Mirror a new proposal: same quorum + deadline, title pinned by sha256. */
export async function mirrorPropose(proposal_id: string, title: string, quorumGrid: number, closesAtISO: string): Promise<void> {
  const cfg = govConfig();
  if (!cfg) return;
  const c = await client(cfg);
  const id = govIdOf(proposal_id);
  const proposal = c.propPda(id);
  if (await c.connection.getAccountInfo(proposal)) return; // idempotent
  const titleHash = Array.from(createHash("sha256").update(title).digest());
  await c.program.methods
    .propose(new c.BN(id.toString()), new c.BN(grid(quorumGrid)), new c.BN(Math.floor(Date.parse(closesAtISO) / 1000)), titleHash)
    .accounts({
      authority: c.payer.publicKey, proposal, gridMint: c.gridMint, voteVault: c.vault(proposal),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID, associatedTokenProgram: c.spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
}

/** Mirror a vote: real GRID locks on the voter's side (aggregated by the payer). */
export async function mirrorVote(proposal_id: string, support: boolean, amountGrid: number): Promise<void> {
  const cfg = govConfig();
  if (!cfg || !(amountGrid > 0)) return;
  const c = await client(cfg);
  const proposal = c.propPda(govIdOf(proposal_id));
  if (!(await c.connection.getAccountInfo(proposal))) return;
  const side = support ? 1 : 0;
  const myGrid = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.gridMint, c.payer.publicKey)).address;
  await c.program.methods
    .vote(side, new c.BN(grid(amountGrid)))
    .accounts({
      voter: c.payer.publicKey, proposal, voteLock: c.lockPda(proposal, side),
      voterGrid: myGrid, voteVault: c.vault(proposal),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID, systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
}

/** Mirror settlement: resolve on-chain, then reclaim both aggregate locks. */
export async function mirrorResolve(proposal_id: string): Promise<void> {
  const cfg = govConfig();
  if (!cfg) return;
  const c = await client(cfg);
  const proposal = c.propPda(govIdOf(proposal_id));
  const info = await c.connection.getAccountInfo(proposal);
  if (!info) return;
  try {
    await c.program.methods.resolve().accounts({ proposal }).rpc();
  } catch {
    // already resolved (or the deadline drifted a few seconds) — reclaim anyway
  }
  const myGrid = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.gridMint, c.payer.publicKey)).address;
  for (const side of [1, 0]) {
    const lock = c.lockPda(proposal, side);
    if (!(await c.connection.getAccountInfo(lock))) continue;
    await c.program.methods
      .reclaim()
      .accounts({
        voter: c.payer.publicKey, proposal, voteLock: lock,
        voterGrid: myGrid, voteVault: c.vault(proposal),
        tokenProgram: c.spl.TOKEN_PROGRAM_ID,
      })
      .rpc();
  }
}
