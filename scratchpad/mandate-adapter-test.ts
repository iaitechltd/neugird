/* Mandate-wallet adapter test — the full guardrail loop on devnet with real
 * tUSDC: arm ($40 budget, $15/tx cap) → spend $15 → over-cap blocked ON-CHAIN →
 * kill → post-kill spend blocked → remainder reclaimed. */
import { mirrorCreate, mirrorSpend, mirrorKill, mandateIdOf } from "../src/lib/chain/mandateSolana";
import * as anchorNs from "@coral-xyz/anchor";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anchor: any = (anchorNs as any).default ?? anchorNs;
import bs58 from "bs58";
import idl from "../src/lib/chain/mandate-idl.json";

async function main() {
  const mid = `man_adapter_${Date.now()}`;
  await mirrorCreate(mid, 40, 15, new Date(Date.now() + 3600_000).toISOString());
  console.log("✓ mandate armed on-chain — $40 vault, $15/tx cap");

  await mirrorSpend(mid, 15);
  console.log("✓ agent spent $15 through the chain wallet");

  let overCap = false;
  try { await mirrorSpendRaw(mid, 16); } catch { overCap = true; }
  console.log("✓ over-cap $16 blocked ON-CHAIN:", overCap);

  await mirrorKill(mid);
  console.log("✓ killed + remainder reclaimed");

  let postKill = false;
  try { await mirrorSpendRaw(mid, 5); } catch { postKill = true; }
  console.log("✓ post-kill spend blocked ON-CHAIN:", postKill);

  // read-back
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET!));
  const conn = new web3.Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program({ ...(idl as any), address: process.env.NEUGRID_MANDATE_PROGRAM_ID! }, provider);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(mandateIdOf(mid));
  const [mandate] = web3.PublicKey.findProgramAddressSync([Buffer.from("mandate"), payer.publicKey.toBuffer(), buf], program.programId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = await (program.account as any).mandateAccount.fetch(mandate);
  console.log("on-chain:", { spent: m.spent.toString(), killed: m.killed });
  if (m.spent.toString() !== "15000000" || !m.killed || !overCap || !postKill) throw new Error("state mismatch");
  console.log("✓ MANDATE ADAPTER TEST PASSED —", `https://explorer.solana.com/address/${mandate.toBase58()}?cluster=devnet`);
}

// raw spend that does NOT swallow errors (mirrorSpend is called through the
// guarded seam in prod; here we need the rejection to assert on)
async function mirrorSpendRaw(mid: string, amt: number) {
  await mirrorSpend(mid, amt); // mirrorSpend itself throws on program errors
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
