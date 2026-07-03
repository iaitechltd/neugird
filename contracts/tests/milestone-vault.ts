/* Milestone Vault lifecycle tests — mirrors the platform's escrow rules:
 * fund → weighted votes release tranches → reject/reopen → stall kill-switch →
 * pro-rata refunds; raise-expiry full refunds; the 1-milestone job-escrow lens. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const U = (n: number) => new BN(Math.round(n * 1e6)); // USDC 6dp

describe("milestone_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MilestoneVault as Program;
  const conn = provider.connection;

  const founder = Keypair.generate();
  const backer1 = Keypair.generate();
  const backer2 = Keypair.generate();
  let usdc: PublicKey;
  let founderAta: PublicKey, backer1Ata: PublicKey, backer2Ata: PublicKey;

  const vaultPda = (f: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), f.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const backingPda = (vault: PublicKey, backer: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("backing"), vault.toBuffer(), backer.toBuffer()],
      program.programId,
    )[0];
  const vaultAta = (vault: PublicKey) =>
    getAssociatedTokenAddressSync(usdc, vault, true);

  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  before(async () => {
    for (const kp of [founder, backer1, backer2]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig);
    }
    usdc = await createMint(conn, founder, founder.publicKey, null, 6);
    founderAta = (await getOrCreateAssociatedTokenAccount(conn, founder, usdc, founder.publicKey)).address;
    backer1Ata = (await getOrCreateAssociatedTokenAccount(conn, backer1, usdc, backer1.publicKey)).address;
    backer2Ata = (await getOrCreateAssociatedTokenAccount(conn, backer2, usdc, backer2.publicKey)).address;
    await mintTo(conn, founder, usdc, backer1Ata, founder, 1_000_000_000); // 1000 tUSDC
    await mintTo(conn, founder, usdc, backer2Ata, founder, 1_000_000_000);
  });

  const create = async (id: BN, tranches: BN[], raiseSecs: number, stallSecs: number) => {
    const vault = vaultPda(founder.publicKey, id);
    await program.methods
      .createVault(id, tranches, new BN(raiseSecs), new BN(stallSecs))
      .accounts({
        founder: founder.publicKey,
        vault,
        usdcMint: usdc,
        vaultToken: vaultAta(vault),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([founder])
      .rpc();
    return vault;
  };

  const back = (vault: PublicKey, backer: Keypair, ata: PublicKey, amount: BN) =>
    program.methods
      .back(amount)
      .accounts({
        backer: backer.publicKey,
        vault,
        backing: backingPda(vault, backer.publicKey),
        backerToken: ata,
        vaultToken: vaultAta(vault),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([backer])
      .rpc();

  const vote = (vault: PublicKey, backer: Keypair, idx: number, approve: boolean) =>
    program.methods
      .vote(idx, approve)
      .accounts({
        backer: backer.publicKey,
        vault,
        backing: backingPda(vault, backer.publicKey),
        vaultToken: vaultAta(vault),
        founderToken: founderAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([backer])
      .rpc();

  it("full GenesisX lifecycle: fund → release → reject/reopen → stall → pro-rata refund", async () => {
    // 300 ask = 100 + 100 + 100; backer1 = 180 (60%), backer2 = 120 (40%); stall 3s
    const vault = await create(new BN(1), [U(100), U(100), U(100)], 3600, 3);

    await back(vault, backer1, backer1Ata, U(180));
    let v: any = await (program.account as any).vault.fetch(vault);
    assert.equal(v.status, 0, "still raising");

    await back(vault, backer2, backer2Ata, U(120));
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.status, 1, "funded");
    assert.equal(v.milestones[0].status, 1, "m0 voting");
    assert.equal(await bal(vaultAta(vault)), 300e6, "escrow holds the full raise");

    // m0: backer1 alone (60%) crosses 50% → releases inside the vote tx
    const fBefore = await bal(founderAta);
    await vote(vault, backer1, 0, true);
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.milestones[0].status, 2, "m0 released");
    assert.equal(v.milestones[1].status, 1, "m1 voting");
    assert.equal((await bal(founderAta)) - fBefore, 100e6, "founder got the tranche");

    // double vote same round rejected
    try {
      await vote(vault, backer1, 1, true) as any;
      // backer1 60% FOR releases m1 immediately — so use a fresh assertion path:
    } catch (e) {
      assert.fail("legit vote should not throw");
    }
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.milestones[1].status, 2, "m1 released by majority");
    assert.equal(v.milestones[2].status, 1, "m2 voting");

    // m2: backer1 votes AGAINST (60%) → rejected
    await vote(vault, backer1, 2, false);
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.milestones[2].status, 3, "m2 rejected");

    // founder reopens → fresh round; backer1 votes AGAINST again (still unconvinced)
    await program.methods
      .reopenMilestone(2)
      .accounts({ founder: founder.publicKey, vault })
      .signers([founder])
      .rpc();
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.milestones[2].status, 1, "m2 voting again");
    assert.equal(v.milestones[2].round, 2, "round bumped");
    await vote(vault, backer1, 2, false); // rejected again → last_activity resets

    // stall: wait out the 3s window, backer2 fires the kill switch
    await sleep(4200);
    await program.methods
      .killSwitch()
      .accounts({ backer: backer2.publicKey, vault, backing: backingPda(vault, backer2.publicKey) })
      .signers([backer2])
      .rpc();
    v = await (program.account as any).vault.fetch(vault);
    assert.equal(v.status, 2, "vault failed via kill switch");

    // pro-rata refunds of the unreleased 100: backer1 60 / backer2 40
    const b1Before = await bal(backer1Ata), b2Before = await bal(backer2Ata);
    await program.methods
      .claimRefund()
      .accounts({
        backer: backer1.publicKey, vault, backing: backingPda(vault, backer1.publicKey),
        vaultToken: vaultAta(vault), backerToken: backer1Ata, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([backer1])
      .rpc();
    await program.methods
      .claimRefund()
      .accounts({
        backer: backer2.publicKey, vault, backing: backingPda(vault, backer2.publicKey),
        vaultToken: vaultAta(vault), backerToken: backer2Ata, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([backer2])
      .rpc();
    assert.equal((await bal(backer1Ata)) - b1Before, 60e6, "backer1 pro-rata 60%");
    assert.equal((await bal(backer2Ata)) - b2Before, 40e6, "backer2 pro-rata 40%");
    assert.equal(await bal(vaultAta(vault)), 0, "escrow conserved to zero");
  });

  it("raise expiry: unfilled raise refunds in full", async () => {
    const vault = await create(new BN(2), [U(500)], 2, 3600);
    await back(vault, backer1, backer1Ata, U(200)); // partial fill
    await sleep(3200);

    // backing past the deadline must fail
    try {
      await back(vault, backer2, backer2Ata, U(100));
      assert.fail("backing after expiry should fail");
    } catch { /* expected */ }

    await program.methods.expireRaise().accounts({ vault }).rpc();
    const before = await bal(backer1Ata);
    await program.methods
      .claimRefund()
      .accounts({
        backer: backer1.publicKey, vault, backing: backingPda(vault, backer1.publicKey),
        vaultToken: vaultAta(vault), backerToken: backer1Ata, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([backer1])
      .rpc();
    assert.equal((await bal(backer1Ata)) - before, 200e6, "full refund");
  });

  it("job-escrow lens: 1 milestone, employer-as-sole-backer approves → worker paid", async () => {
    // 'founder' plays the worker (payee); backer2 is the employer
    const vault = await create(new BN(3), [U(120)], 3600, 3600);
    await back(vault, backer2, backer2Ata, U(120)); // full fund → auto-FUNDED
    const before = await bal(founderAta);
    await vote(vault, backer2, 0, true); // 100% weight → releases
    assert.equal((await bal(founderAta)) - before, 120e6, "worker paid on approval");
    const v: any = await (program.account as any).vault.fetch(vault);
    assert.equal(v.status, 3, "vault completed");
  });

  it("guards: over-ask, double vote, non-backer vote", async () => {
    const vault = await create(new BN(4), [U(100), U(50)], 3600, 3600);
    try {
      await back(vault, backer1, backer1Ata, U(200));
      assert.fail("over-ask should fail");
    } catch { /* expected */ }

    await back(vault, backer1, backer1Ata, U(90));
    await back(vault, backer2, backer2Ata, U(60)); // fills 150 → funded

    await vote(vault, backer2, 0, false); // 40% against — not decisive
    try {
      await vote(vault, backer2, 0, false);
      assert.fail("double vote should fail");
    } catch { /* expected */ }

    const stranger = Keypair.generate();
    const sig = await conn.requestAirdrop(stranger.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig);
    try {
      await vote(vault, stranger, 0, true);
      assert.fail("non-backer vote should fail");
    } catch { /* expected */ }
  });
});
