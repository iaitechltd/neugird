/* Splitter chain-adapter test — drives chain/splitsSolana.ts against the
 * DEPLOYED devnet program with real tUSDC: configure a 60/40 table (one bound
 * wallet + one custody fallback) → distribute → read exact on-chain balances.
 *   env: NEUGRID_CHAIN_MODE=solana NEUGRID_SPLITTER_PROGRAM_ID=...
 *        NEUGRID_X402_ASSET=... NEUGRID_SOLANA_RPC=... NEUGRID_SAS_ISSUER_SECRET=...
 *   npx tsx scratchpad/splits-adapter-test.ts
 */
import { mirrorConfigure, mirrorDistribute, splitIdOf } from "../src/lib/chain/splitsSolana";
import { db } from "../src/lib/store";
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import bs58 from "bs58";

async function main() {
  const boundWallet = Keypair.generate().publicKey; // a member WITH a real wallet
  const sgid = `sub_adapter_${Date.now()}`;

  // synthetic members in the store: one bound, one without a wallet (custody)
  db.users.push(
    { id: "usr_split_a", wallet_addresses: [boundWallet.toBase58()], username: "split-a", skills: [], roles_by_grid: [], pulse_score: 0, joined_grids: [], created_at: new Date().toISOString() },
    { id: "usr_split_b", wallet_addresses: [], username: "split-b", skills: [], roles_by_grid: [], pulse_score: 0, joined_grids: [], created_at: new Date().toISOString() },
  );

  await mirrorConfigure(sgid, [
    { party_id: "usr_split_a", party_type: "user", basis_points: 6000 },
    { party_id: "usr_split_b", party_type: "user", basis_points: 4000 },
  ]);
  console.log("✓ split table configured on-chain (60% bound wallet / 40% custody)");

  await mirrorDistribute(sgid, 12.5);
  console.log("✓ distributed $12.50 through the on-chain splitter");

  const conn = new Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const mint = new PublicKey(process.env.NEUGRID_X402_ASSET!);
  const ata = getAssociatedTokenAddressSync(mint, boundWallet);
  const bal = Number((await getAccount(conn, ata)).amount);
  console.log("bound member's wallet received:", bal / 1e6, "tUSDC");
  if (bal !== 7_500_000) throw new Error(`expected 7.5, got ${bal / 1e6}`);

  const payer = Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET!));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(splitIdOf(sgid));
  const [splitter] = PublicKey.findProgramAddressSync(
    [Buffer.from("split"), payer.publicKey.toBuffer(), buf],
    new PublicKey(process.env.NEUGRID_SPLITTER_PROGRAM_ID!),
  );
  console.log("✓ SPLITS ADAPTER TEST PASSED —", `https://explorer.solana.com/address/${splitter.toBase58()}?cluster=devnet`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
