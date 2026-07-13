/* One-time (per cluster): create the GRID token mint — classic SPL, 6 decimals,
 * fixed 36.9B supply minted to the TGE treasury (the issuer's ATA), then mint
 * authority is retained by the issuer pre-TGE (real TGE hands it to governance /
 * burns it — documented in docs/ROADMAP.md C2).
 *   NEUGRID_GRID_AUTHORITY_SECRET=... node scripts/grid-mint-setup.mjs
 * (falls back to NEUGRID_SAS_ISSUER_SECRET — the devnet operational keypair)
 */
import { Connection, Keypair } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";

const RPC = process.env.NEUGRID_SOLANA_RPC || "https://api.devnet.solana.com";
const DECIMALS = 6;
const SUPPLY = 36_900_000_000n * 10n ** BigInt(DECIMALS); // 36.9B GRID — the FIXED total supply (matches src/lib/modules/supply.ts TOTAL_SUPPLY)

const secret = process.env.NEUGRID_GRID_AUTHORITY_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
if (!secret) { console.error("set NEUGRID_GRID_AUTHORITY_SECRET (or NEUGRID_SAS_ISSUER_SECRET)"); process.exit(1); }
const authority = Keypair.fromSecretKey(bs58.decode(secret));
const conn = new Connection(RPC, "confirmed");

console.log("authority:", authority.publicKey.toBase58());
const mint = await createMint(conn, authority, authority.publicKey, null, DECIMALS);
console.log("GRID mint:", mint.toBase58());
const treasury = await getOrCreateAssociatedTokenAccount(conn, authority, mint, authority.publicKey);
await mintTo(conn, authority, mint, treasury.address, authority, SUPPLY);
console.log("treasury ATA:", treasury.address.toBase58(), "— 1,000,000,000 GRID minted");
console.log("\nset NEUGRID_GRID_MINT=" + mint.toBase58());
