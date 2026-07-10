/* market_amm DEVNET smoke — self-contained: fresh base+quote mints, real pool,
 * seed → buy → sell with exact-math assertions against the live cluster.
 *   node scripts/amm-devnet-smoke.mjs   (from contracts/; payer = ~/.config/solana/id.json)
 */
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = anchor;
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint, mintTo, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const IDL = JSON.parse(readFileSync(new URL("../target/idl/market_amm.json", import.meta.url)));
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
);
const conn = new Connection(RPC, "confirmed");
const provider = new AnchorProvider(conn, new Wallet(payer), { commitment: "confirmed" });
const program = new Program(IDL, provider);

const U = (n) => new BN(Math.round(n * 1e6));
const bal = async (ata) => BigInt((await getAccount(conn, ata)).amount.toString());

console.log("program:", program.programId.toBase58(), "| payer:", payer.publicKey.toBase58());

// fresh mints — the smoke owns its whole world
const base = await createMint(conn, payer, payer.publicKey, null, 6);
const quote = await createMint(conn, payer, payer.publicKey, null, 6);
const myBase = (await getOrCreateAssociatedTokenAccount(conn, payer, base, payer.publicKey)).address;
const myQuote = (await getOrCreateAssociatedTokenAccount(conn, payer, quote, payer.publicKey)).address;
await mintTo(conn, payer, base, myBase, payer, 2_000_000_000n); // 2,000 base
await mintTo(conn, payer, quote, myQuote, payer, 500_000_000n); // 500 quote

const marketId = new BN(Date.now() % 1_000_000_000);
const [pool] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool"), payer.publicKey.toBuffer(), marketId.toArrayLike(Buffer, "le", 8)],
  program.programId,
);
const [feeVault] = PublicKey.findProgramAddressSync([Buffer.from("fees"), pool.toBuffer()], program.programId);
const baseVault = getAssociatedTokenAddressSync(base, pool, true);
const quoteVault = getAssociatedTokenAddressSync(quote, pool, true);
console.log("pool:", pool.toBase58());

await program.methods
  .createPool(marketId, 100) // 1% fee — smoke the full fee machinery
  .accounts({ authority: payer.publicKey, baseMint: base, quoteMint: quote })
  .rpc();
console.log("✓ pool created (fee 1%)");

await program.methods
  .seed(U(1000), U(100))
  .accounts({
    authority: payer.publicKey, pool,
    authorityBase: myBase, authorityQuote: myQuote, baseVault, quoteVault,
  })
  .rpc();
console.log("✓ seeded 1000 base / 100 quote — real reserves on devnet");

// BUY 10 quote — expected out computed the same way the program does it
{
  const bR = await bal(baseVault), qR = await bal(quoteVault), k = bR * qR;
  const amountIn = 10_000_000n, fee = amountIn / 100n, net = amountIn - fee;
  const newQ = qR + net, newB = (k + newQ - 1n) / newQ, expect = bR - newB;
  const pre = await bal(myBase);
  await program.methods
    .swap(0, new BN(amountIn.toString()), new BN(expect.toString()))
    .accounts({
      authority: payer.publicKey, pool, baseVault, quoteVault, feeVault,
      userBase: myBase, userQuote: myQuote,
    })
    .rpc();
  const got = (await bal(myBase)) - pre;
  if (got !== expect) throw new Error(`buy mismatch: got ${got}, expected ${expect}`);
  console.log(`✓ buy exact: 10 quote → ${Number(got) / 1e6} base (fee ${Number(fee) / 1e6} in the fee vault)`);
}

// SELL 40 base back
{
  const bR = await bal(baseVault), qR = await bal(quoteVault), k = bR * qR;
  const amountIn = 40_000_000n;
  const newB = bR + amountIn, newQmin = (k + newB - 1n) / newB;
  const gross = qR - newQmin, fee = gross / 100n, net = gross - fee;
  const pre = await bal(myQuote);
  await program.methods
    .swap(1, new BN(amountIn.toString()), new BN(net.toString()))
    .accounts({
      authority: payer.publicKey, pool, baseVault, quoteVault, feeVault,
      userBase: myBase, userQuote: myQuote,
    })
    .rpc();
  const got = (await bal(myQuote)) - pre;
  if (got !== net) throw new Error(`sell mismatch: got ${got}, expected ${net}`);
  console.log(`✓ sell exact: 40 base → ${Number(got) / 1e6} quote net`);
}

const fees = await bal(feeVault);
console.log(`✓ fee vault holds ${Number(fees) / 1e6} quote on-chain`);
console.log(`reserves: base ${Number(await bal(baseVault)) / 1e6} / quote ${Number(await bal(quoteVault)) / 1e6}`);
console.log(`explorer: https://explorer.solana.com/address/${pool.toBase58()}?cluster=devnet`);
console.log("ALL SMOKE CHECKS PASSED");
