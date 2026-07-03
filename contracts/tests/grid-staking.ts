/* GRID staking lifecycle — mirrors the platform's stake-to-list rules:
 * lock GRID → pro-rata USDC fee share (exact) → lock gates unstake →
 * slash sweeps principal to the treasury while earned rewards survive. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const U = (n: number) => new BN(Math.round(n * 1e6));

describe("grid_staking", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GridStaking as Program;
  const conn = provider.connection;

  const authority = Keypair.generate(); // the platform's operational key
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  let grid: PublicKey, usdc: PublicKey;
  const atas: Record<string, { grid: PublicKey; usdc: PublicKey }> = {};

  const MARKET = new BN(777);
  const poolPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), authority.publicKey.toBuffer(), MARKET.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const stakePda = (pool: PublicKey, staker: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), pool.toBuffer(), staker.toBuffer()],
      program.programId,
    )[0];

  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  before(async () => {
    for (const kp of [authority, alice, bob]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL));
    }
    grid = await createMint(conn, authority, authority.publicKey, null, 6);
    usdc = await createMint(conn, authority, authority.publicKey, null, 6);
    for (const [name, kp] of [["authority", authority], ["alice", alice], ["bob", bob]] as const) {
      atas[name] = {
        grid: (await getOrCreateAssociatedTokenAccount(conn, kp, grid, kp.publicKey)).address,
        usdc: (await getOrCreateAssociatedTokenAccount(conn, kp, usdc, kp.publicKey)).address,
      };
    }
    await mintTo(conn, authority, grid, atas.alice.grid, authority, 1_000_000_000);
    await mintTo(conn, authority, grid, atas.bob.grid, authority, 1_000_000_000);
    await mintTo(conn, authority, usdc, atas.authority.usdc, authority, 1_000_000_000);
  });

  const stake = (who: Keypair, amount: BN) =>
    program.methods
      .stake(amount)
      .accounts({
        staker: who.publicKey, pool: poolPda(), stakeAccount: stakePda(poolPda(), who.publicKey),
        stakerGrid: atas[who === alice ? "alice" : "bob"].grid,
        stakerUsdc: atas[who === alice ? "alice" : "bob"].usdc,
        stakeVault: getAssociatedTokenAddressSync(grid, poolPda(), true),
        rewardVault: getAssociatedTokenAddressSync(usdc, poolPda(), true),
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .signers([who])
      .rpc();

  const unstake = (who: Keypair, amount: BN) =>
    program.methods
      .unstake(amount)
      .accounts({
        staker: who.publicKey, pool: poolPda(), stakeAccount: stakePda(poolPda(), who.publicKey),
        stakerGrid: atas[who === alice ? "alice" : "bob"].grid,
        stakerUsdc: atas[who === alice ? "alice" : "bob"].usdc,
        stakeVault: getAssociatedTokenAddressSync(grid, poolPda(), true),
        rewardVault: getAssociatedTokenAddressSync(usdc, poolPda(), true),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  const claim = (who: Keypair) =>
    program.methods
      .claimRewards()
      .accounts({
        staker: who.publicKey, pool: poolPda(), stakeAccount: stakePda(poolPda(), who.publicKey),
        rewardVault: getAssociatedTokenAddressSync(usdc, poolPda(), true),
        stakerUsdc: atas[who === alice ? "alice" : "bob"].usdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  it("stake → fee share (exact pro-rata) → lock → unstake → slash", async () => {
    await program.methods
      .initPool(MARKET, new BN(3)) // 3s lock for the test
      .accounts({
        authority: authority.publicKey, pool: poolPda(), gridMint: grid, usdcMint: usdc,
        stakeVault: getAssociatedTokenAddressSync(grid, poolPda(), true),
        rewardVault: getAssociatedTokenAddressSync(usdc, poolPda(), true),
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    // 60/40 stakes
    await stake(alice, U(600));
    await stake(bob, U(400));
    let pool: any = await (program.account as any).stakePool.fetch(poolPda());
    assert.equal(pool.totalStaked.toString(), U(1000).toString());

    // platform deposits $100 of trade fees → 60/40 claimable
    await program.methods
      .depositFees(U(100))
      .accounts({
        authority: authority.publicKey, pool: poolPda(),
        authorityUsdc: atas.authority.usdc,
        rewardVault: getAssociatedTokenAddressSync(usdc, poolPda(), true),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const a0 = await bal(atas.alice.usdc), b0 = await bal(atas.bob.usdc);
    await claim(alice);
    await claim(bob);
    assert.equal((await bal(atas.alice.usdc)) - a0, 60e6, "alice 60%");
    assert.equal((await bal(atas.bob.usdc)) - b0, 40e6, "bob 40%");

    // double claim pays nothing
    await claim(alice);
    assert.equal((await bal(atas.alice.usdc)) - a0, 60e6, "no double pay");

    // early unstake blocked, then matures
    try { await unstake(alice, U(100)); assert.fail("locked unstake should fail"); } catch { /* expected */ }
    await sleep(3600);
    const g0 = await bal(atas.alice.grid);
    await unstake(alice, U(100));
    assert.equal((await bal(atas.alice.grid)) - g0, 100e6, "principal back after lock");

    // SLASH: remaining principal (500+400) sweeps to the treasury
    const t0 = await bal(atas.authority.grid);
    await program.methods
      .slash()
      .accounts({
        authority: authority.publicKey, pool: poolPda(),
        stakeVault: getAssociatedTokenAddressSync(grid, poolPda(), true),
        treasuryGrid: atas.authority.grid,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();
    assert.equal((await bal(atas.authority.grid)) - t0, 900e6, "slashed principal swept");
    pool = await (program.account as any).stakePool.fetch(poolPda());
    assert.isTrue(pool.slashed);

    // post-slash: unstake forever blocked; earned rewards still claimable
    try { await unstake(bob, U(1)); assert.fail("post-slash unstake should fail"); } catch { /* expected */ }
    await claim(bob); // no pending → no-op, must not throw
  });
});
