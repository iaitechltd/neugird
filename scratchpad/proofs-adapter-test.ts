/* Deal-proof adapter test — anchors a synthetic agreement's sha256 via the Memo
 * program on devnet, then reads the tx back and verifies the memo content. */
import { anchorAgreement, hashAgreement } from "../src/lib/chain/proofsSolana";
import { Connection } from "@solana/web3.js";
import type { Agreement } from "../src/lib/types";

async function main() {
  const ag: Agreement = {
    agreement_id: `agr_test_${Date.now()}`, from_id: "usr_neo", to_id: "usr_trinity",
    amount: 250, asset: "USDC", terms: "Weekly market-analysis thread for 4 weeks",
    success_metric: "4 threads delivered", status: "active",
    source_message_id: "msg_x", created_at: new Date().toISOString(),
  };
  await anchorAgreement(ag);
  if (!ag.onchain?.tx) throw new Error("no onchain ref filled");
  console.log("✓ anchored — tx:", ag.onchain.tx.slice(0, 20) + "…", "| hash:", ag.onchain.hash.slice(0, 16) + "…");

  const conn = new Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const tx = await conn.getTransaction(ag.onchain.tx, { maxSupportedTransactionVersion: 0 });
  const logs = tx?.meta?.logMessages?.join("\n") ?? "";
  const expected = `neugrid:agreement:${ag.agreement_id}:sha256:${hashAgreement(ag)}`;
  if (!logs.includes(expected)) throw new Error("memo not found in tx logs");
  console.log("✓ memo verified in the transaction logs");
  console.log("✓ PROOFS ADAPTER TEST PASSED —", `https://explorer.solana.com/tx/${ag.onchain.tx}?cluster=devnet`);
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
