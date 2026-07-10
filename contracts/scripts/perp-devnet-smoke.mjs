/* perp_vault DEVNET smoke — self-contained settlement cycle on the live cluster:
 * init engine → seed LP → open → profitable close (LP PAYS) → liquidation
 * (remainder → insurance) → exact vault assertions.
 *   node scripts/perp-devnet-smoke.mjs   (from contracts/; payer = ~/.config/solana/id.json)
 */
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, Wallet, BN } = anchor;
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createMint, mintTo, getOrCreateAssociatedTokenAccount, getAccount } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = "https://api.devnet.solana.com";
const IDL = JSON.parse(readFileSync(new URL("../target/idl/perp_vault.json", import.meta.url)));
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, "utf8"))),
);
const conn = new Connection(RPC, "confirmed");
const provider = new AnchorProvider(conn, new Wallet(payer), { commitment: "confirmed" });
const program = new Program(IDL, provider);

const U = (n) => new BN(Math.round(n * 1e6));
const bal = async (ata) => BigInt((await getAccount(conn, ata)).amount.toString());

const quote = await createMint(conn, payer, payer.publicKey, null, 6);
const myQuote = (await getOrCreateAssociatedTokenAccount(conn, payer, quote, payer.publicKey)).address;
await mintTo(conn, payer, quote, myQuote, payer, 20_000_000_000n); // 20,000 quote

const [engine] = PublicKey.findProgramAddressSync([Buffer.from("engine"), payer.publicKey.toBuffer()], program.programId);
const vault = (tag) => PublicKey.findProgramAddressSync([Buffer.from(tag), engine.toBuffer()], program.programId)[0];
const posPda = (id) => PublicKey.findProgramAddressSync([Buffer.from("pos"), engine.toBuffer(), id.toArrayLike(Buffer, "le", 8)], program.programId)[0];
const lp = vault("lp"), ins = vault("insurance"), col = vault("collateral");
console.log("program:", program.programId.toBase58(), "| engine:", engine.toBase58());

await program.methods.initEngine(2500).accounts({ authority: payer.publicKey, quoteMint: quote }).rpc();
console.log("✓ engine init (OI cap 25% of LP depth)");

await program.methods.lpDeposit(U(10_000)).accounts({ authority: payer.publicKey, engine, authorityQuote: myQuote, lpVault: lp }).rpc();
console.log("✓ LP seeded: 10,000 quote — the counterparty pool is REAL");

const p1 = new BN(1);
await program.methods
  .openPosition(p1, 0, U(100), U(1000), U(0.5))
  .accounts({ authority: payer.publicKey, engine, position: posPda(p1), authorityQuote: myQuote, lpVault: lp, collateralVault: col })
  .rpc();
if ((await bal(col)) !== 100_000_000n) throw new Error("collateral not segregated");
console.log("✓ position open: 100 margin segregated, notional 1000 within the LP-depth cap");

{
  const preLp = await bal(lp), preMe = await bal(myQuote);
  await program.methods
    .closePosition(U(150), new BN(0), new BN(0))
    .accounts({ authority: payer.publicKey, engine, position: posPda(p1), lpVault: lp, insuranceVault: ins, collateralVault: col, traderQuote: myQuote })
    .rpc();
  if (preLp - (await bal(lp)) !== 50_000_000n) throw new Error("LP did not pay the profit");
  if ((await bal(myQuote)) - preMe !== 150_000_000n) throw new Error("trader payout wrong");
  console.log("✓ profitable close: the LP pool PAID the 50 profit (F1 fixed on devnet)");
}

const p2 = new BN(2);
await program.methods
  .openPosition(p2, 1, U(100), U(1000), U(0.5))
  .accounts({ authority: payer.publicKey, engine, position: posPda(p2), authorityQuote: myQuote, lpVault: lp, collateralVault: col })
  .rpc();
{
  const preLp = await bal(lp);
  await program.methods
    .closePosition(new BN(0), U(20), new BN(0))
    .accounts({ authority: payer.publicKey, engine, position: posPda(p2), lpVault: lp, insuranceVault: ins, collateralVault: col, traderQuote: myQuote })
    .rpc();
  if ((await bal(ins)) !== 20_000_000n) throw new Error("insurance remainder missing");
  if ((await bal(lp)) - preLp !== 80_000_000n) throw new Error("LP loss share wrong");
  console.log("✓ liquidation: 20 remainder → insurance vault, 80 → LP");
}

console.log(`vaults: lp ${Number(await bal(lp)) / 1e6} · insurance ${Number(await bal(ins)) / 1e6} · collateral ${Number(await bal(col)) / 1e6}`);
console.log(`explorer: https://explorer.solana.com/address/${engine.toBase58()}?cluster=devnet`);
console.log("ALL SMOKE CHECKS PASSED");
