/* grid_staking DEVNET smoke — REAL tokens: stakes actual GRID (the C2 mint)
 * behind a market, deposits tUSDC trade fees, claims the pro-rata share.
 *   NEUGRID_SAS_ISSUER_SECRET=... node scripts/staking-devnet-smoke.mjs   (from contracts/)
 */
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = anchor;
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync, getAccount,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

const RPC = "https://api.devnet.solana.com";
const GRID = new PublicKey("32mPZoTdudFjyy8xNwpZFdv1QLfBP9zU2zjcoNqvYo2m"); // the real GRID mint (C2)
const USDC = new PublicKey("3Sksad8nc4Ytzx5JDQkbLzr8CuDE2oZp85Vo8sSwaE7q"); // classic tUSDC
const IDL = JSON.parse(readFileSync(new URL("../target/idl/grid_staking.json", import.meta.url)));

const authority = Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET));
const conn = new Connection(RPC, "confirmed");
const provider = new AnchorProvider(conn, new Wallet(authority), { commitment: "confirmed" });
const program = new Program(IDL, provider);

const marketId = new BN(Date.now() % 1_000_000_000);
const [pool] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), authority.publicKey.toBuffer(), marketId.toArrayLike(Buffer, "le", 8)],
  program.programId,
);
const [stakeAcc] = PublicKey.findProgramAddressSync(
  [Buffer.from("stake"), pool.toBuffer(), authority.publicKey.toBuffer()],
  program.programId,
);
const stakeVault = getAssociatedTokenAddressSync(GRID, pool, true);
const rewardVault = getAssociatedTokenAddressSync(USDC, pool, true);
const myGrid = (await getOrCreateAssociatedTokenAccount(conn, authority, GRID, authority.publicKey)).address;
const myUsdc = (await getOrCreateAssociatedTokenAccount(conn, authority, USDC, authority.publicKey)).address;
const bal = async (ata) => Number((await getAccount(conn, ata)).amount) / 1e6;

console.log("program:", program.programId.toBase58(), "| pool:", pool.toBase58());

await program.methods
  .initPool(marketId, new BN(0)) // no lock for the smoke
  .accounts({
    authority: authority.publicKey, pool, gridMint: GRID, usdcMint: USDC,
    stakeVault, rewardVault,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log("✓ pool opened");

await program.methods
  .stake(new BN(5_000_000_000)) // 5,000 GRID — the Alpha→Spot listing stake
  .accounts({
    staker: authority.publicKey, pool, stakeAccount: stakeAcc,
    stakerGrid: myGrid, stakerUsdc: myUsdc, stakeVault, rewardVault,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log(`✓ staked 5,000 REAL GRID — vault holds ${await bal(stakeVault)}`);

await program.methods
  .depositFees(new BN(2_000_000)) // $2 of trade fees
  .accounts({ authority: authority.publicKey, pool, authorityUsdc: myUsdc, rewardVault, tokenProgram: TOKEN_PROGRAM_ID })
  .rpc();
const before = await bal(myUsdc);
await program.methods
  .claimRewards()
  .accounts({ staker: authority.publicKey, pool, stakeAccount: stakeAcc, rewardVault, stakerUsdc: myUsdc, tokenProgram: TOKEN_PROGRAM_ID })
  .rpc();
console.log(`✓ fee share claimed: +${((await bal(myUsdc)) - before).toFixed(2)} tUSDC (sole staker → 100%)`);

await program.methods
  .unstake(new BN(5_000_000_000))
  .accounts({
    staker: authority.publicKey, pool, stakeAccount: stakeAcc,
    stakerGrid: myGrid, stakerUsdc: myUsdc, stakeVault, rewardVault,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
console.log("✓ principal unstaked — vault:", await bal(stakeVault));
console.log("DEVNET STAKING SMOKE PASSED —", `https://explorer.solana.com/address/${pool.toBase58()}?cluster=devnet`);
