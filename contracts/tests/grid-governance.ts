/* Lock-to-vote lifecycle — the platform's exact rules: FOR needs quorum AND
 * majority at the deadline; every lock returns after resolution, win or lose. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const G = (n: number) => new BN(Math.round(n * 1e6));
const FOR = 1, AGAINST = 0;

describe("grid_governance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GridGovernance as Program;
  const conn = provider.connection;

  const authority = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  let grid: PublicKey;
  const gridAta: Record<string, PublicKey> = {};

  const propPda = (id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("gov"), authority.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const lockPda = (proposal: PublicKey, voter: PublicKey, side: number) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("lock"), proposal.toBuffer(), voter.toBuffer(), Buffer.from([side])],
      program.programId,
    )[0];
  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  before(async () => {
    for (const kp of [authority, alice, bob]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL));
    }
    grid = await createMint(conn, authority, authority.publicKey, null, 6);
    for (const [name, kp] of [["alice", alice], ["bob", bob]] as const) {
      gridAta[name] = (await getOrCreateAssociatedTokenAccount(conn, kp, grid, kp.publicKey)).address;
      await mintTo(conn, authority, grid, gridAta[name], authority, 100_000_000_000); // 100K GRID each
    }
  });

  const propose = async (id: BN, quorum: BN, seconds: number) => {
    const proposal = propPda(id);
    await program.methods
      .propose(id, quorum, new BN(Math.floor(Date.now() / 1000) + seconds), Array.from(Buffer.alloc(32, 7)))
      .accounts({
        authority: authority.publicKey, proposal, gridMint: grid,
        voteVault: getAssociatedTokenAddressSync(grid, proposal, true),
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
    return proposal;
  };
  const vote = (proposal: PublicKey, who: Keypair, side: number, amount: BN) =>
    program.methods
      .vote(side, amount)
      .accounts({
        voter: who.publicKey, proposal,
        voteLock: lockPda(proposal, who.publicKey, side),
        voterGrid: gridAta[who === alice ? "alice" : "bob"],
        voteVault: getAssociatedTokenAddressSync(grid, proposal, true),
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();
  const reclaim = (proposal: PublicKey, who: Keypair, side: number) =>
    program.methods
      .reclaim()
      .accounts({
        voter: who.publicKey, proposal,
        voteLock: lockPda(proposal, who.publicKey, side),
        voterGrid: gridAta[who === alice ? "alice" : "bob"],
        voteVault: getAssociatedTokenAddressSync(grid, proposal, true),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  it("quorum + majority passes; locks return win AND lose", async () => {
    const proposal = await propose(new BN(1), G(50_000), 8);
    await vote(proposal, alice, FOR, G(60_000));
    await vote(proposal, bob, AGAINST, G(20_000));

    let earlyFailed = false;
    try { await program.methods.resolve().accounts({ proposal }).rpc(); } catch { earlyFailed = true; }
    assert.isTrue(earlyFailed, "early resolve must fail");

    await sleep(9000);
    await program.methods.resolve().accounts({ proposal }).rpc();
    let p: any = await (program.account as any).govProposal.fetch(proposal);
    assert.equal(p.status, 1, "passed (60K FOR ≥ 50K quorum, beats 20K)");

    // votes after close must fail
    let lateFailed = false;
    try { await vote(proposal, bob, AGAINST, G(1)); } catch { lateFailed = true; }
    assert.isTrue(lateFailed, "late vote must fail");

    // locks return to BOTH sides exactly
    const a0 = await bal(gridAta.alice), b0 = await bal(gridAta.bob);
    await reclaim(proposal, alice, FOR);
    await reclaim(proposal, bob, AGAINST);
    assert.equal((await bal(gridAta.alice)) - a0, 60_000e6, "winner's lock returned");
    assert.equal((await bal(gridAta.bob)) - b0, 20_000e6, "loser's lock returned");
    assert.equal(await bal(getAssociatedTokenAddressSync(grid, proposal, true)), 0, "vault drained");
  });

  it("below quorum rejects even when unopposed", async () => {
    const proposal = await propose(new BN(2), G(50_000), 6);
    await vote(proposal, alice, FOR, G(10_000)); // 10K < 50K quorum
    await sleep(7200);
    await program.methods.resolve().accounts({ proposal }).rpc();
    const p: any = await (program.account as any).govProposal.fetch(proposal);
    assert.equal(p.status, 2, "rejected below quorum");
    await reclaim(proposal, alice, FOR); // lock still returns
  });
});
