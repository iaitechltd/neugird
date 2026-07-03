/* GRID claim-mirror test — drives chain/gridToken.ts against the devnet GRID
 * mint: a fresh recipient wallet receives real tokens; pseudo wallets skip.
 *   env: NEUGRID_CHAIN_MODE=solana NEUGRID_GRID_MINT=... NEUGRID_SOLANA_RPC=...
 *        NEUGRID_SAS_ISSUER_SECRET=...
 *   npx tsx scratchpad/grid-claim-test.ts
 */
import { mirrorClaim } from "../src/lib/chain/gridToken";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";

async function main() {
  const recipient = Keypair.generate().publicKey; // a fresh user wallet
  const sig = await mirrorClaim(recipient.toBase58(), 1234.5);
  console.log("claim mirrored — tx:", sig);
  if (!sig) throw new Error("no signature returned");

  const conn = new Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const ata = getAssociatedTokenAddressSync(new PublicKey(process.env.NEUGRID_GRID_MINT!), recipient);
  const bal = await getAccount(conn, ata);
  console.log("recipient wallet GRID balance:", Number(bal.amount) / 1e6);
  if (Number(bal.amount) !== 1_234_500_000) throw new Error("balance mismatch");

  const skipped = await mirrorClaim("not-a-real-wallet-1111", 10);
  console.log("pseudo wallet skipped:", skipped === undefined);
  console.log("✓ GRID CLAIM MIRROR PASSED");
  console.log("explorer:", `https://explorer.solana.com/address/${ata.toBase58()}?cluster=devnet`);
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
