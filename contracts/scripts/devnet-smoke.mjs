/* Milestone Vault DEVNET smoke — drives the DEPLOYED program with real test-USDC.
 * Founder = the deploy wallet (~/.config/solana/id.json); backer = the classic-
 * mint payer (holds tUSDC 3Sksad8…). Lifecycle: create (2 tranches) → back to
 * fill → auto-FUNDED → sole-backer vote releases tranche 0 to the founder.
 *   NEUGRID_X402_PAYER_SECRET=... node scripts/devnet-smoke.mjs   (from contracts/)
 */
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = anchor;
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync, getAccount,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const MINT = new PublicKey("3Sksad8nc4Ytzx5JDQkbLzr8CuDE2oZp85Vo8sSwaE7q");
const IDL = JSON.parse(readFileSync(new URL("../target/idl/milestone_vault.json", import.meta.url)));

const founder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`))));
const backer = Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_X402_PAYER_SECRET));
const conn = new Connection(RPC, "confirmed");
const provider = new AnchorProvider(conn, new Wallet(founder), { commitment: "confirmed" });
const program = new Program(IDL, provider);

const vaultId = new BN(Date.now() % 1_000_000_000); // unique per run
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), founder.publicKey.toBuffer(), vaultId.toArrayLike(Buffer, "le", 8)],
  program.programId,
);
const [backing] = PublicKey.findProgramAddressSync(
  [Buffer.from("backing"), vault.toBuffer(), backer.publicKey.toBuffer()],
  program.programId,
);
const vaultAta = getAssociatedTokenAddressSync(MINT, vault, true);
console.log("program:", program.programId.toBase58());
console.log("vault:", vault.toBase58(), "id:", vaultId.toString());

const founderAta = (await getOrCreateAssociatedTokenAccount(conn, founder, MINT, founder.publicKey)).address;
const backerAta = getAssociatedTokenAddressSync(MINT, backer.publicKey);
const bal = async (ata) => Number((await getAccount(conn, ata)).amount) / 1e6;

// backer needs a little SOL for fees + Backing rent
if ((await conn.getBalance(backer.publicKey)) < 10_000_000) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: founder.publicKey, toPubkey: backer.publicKey, lamports: 30_000_000 }));
  await provider.sendAndConfirm(tx, [founder]);
  console.log("funded backer with 0.03 SOL for fees");
}

// 1. create: 2 + 1 tUSDC tranches
await program.methods
  .createVault(vaultId, [new BN(2_000_000), new BN(1_000_000)], new BN(3600), new BN(3600))
  .accounts({
    founder: founder.publicKey, vault, usdcMint: MINT, vaultToken: vaultAta,
    tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .signers([founder])
  .rpc();
console.log("✓ vault created (ask 3 tUSDC, tranches 2 + 1)");

// 2. back the full ask → auto-FUNDED
await program.methods
  .back(new BN(3_000_000))
  .accounts({
    backer: backer.publicKey, vault, backing, backerToken: backerAta, vaultToken: vaultAta,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
  })
  .signers([backer])
  .rpc();
let v = await program.account.vault.fetch(vault);
console.log(`✓ backed 3 tUSDC → status=${v.status} (1=FUNDED), escrow=${await bal(vaultAta)} tUSDC`);

// 3. sole backer approves milestone 0 → 2 tUSDC releases to the founder
const before = await bal(founderAta);
await program.methods
  .vote(0, true)
  .accounts({
    backer: backer.publicKey, vault, backing, vaultToken: vaultAta, founderToken: founderAta,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .signers([backer])
  .rpc();
v = await program.account.vault.fetch(vault);
console.log(`✓ vote → milestone0 status=${v.milestones[0].status} (2=RELEASED); founder +${(await bal(founderAta)) - before} tUSDC; escrow=${await bal(vaultAta)}`);
console.log(`✓ milestone1 now voting (status=${v.milestones[1].status})`);
console.log("DEVNET SMOKE PASSED — vault:", `https://explorer.solana.com/address/${vault.toBase58()}?cluster=devnet`);
