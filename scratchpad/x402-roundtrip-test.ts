/* Devnet x402 round-trip — the payer half + the facilitator half, standalone.
 * Builds PaymentRequirements exactly as NeuGrid's requirementsRaw()+enrich() would,
 * signs via the official x402 SVM client, then drives facilitator /verify + /settle.
 *   NEUGRID_X402_PAYER_SECRET=... npx tsx scratchpad/x402-roundtrip-test.ts
 */
import bs58 from "bs58";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { exact } from "x402/schemes";

const FACILITATOR = process.env.NEUGRID_X402_FACILITATOR_URL || "https://x402.org/facilitator";
const RPC = "https://api.devnet.solana.com";
const NETWORK = "solana-devnet";
const MINT = "H1KwjEAzyT3XvtujFh6hUro81f2NZHWpbVp2SDEPgayK";      // devnet test-USDC (6dp)
const PAY_TO = "2Xr2TZ2fLsXF1TB42xmZ757vN7ygn79z3aH9Cz6fMptQ";     // treasury owner

async function main() {
  const payer = await createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(process.env.NEUGRID_X402_PAYER_SECRET!)));
  console.log("payer:", payer.address);

  // 1. what NeuGrid's challenge() would emit — incl. the facilitator's feePayer (enrich)
  const sup = await (await fetch(`${FACILITATOR}/supported`)).json();
  const kind = (sup.kinds ?? []).find((k: any) => k.scheme === "exact" && k.network === NETWORK);
  if (!kind) throw new Error(`facilitator has no exact/${NETWORK} kind`);
  console.log("feePayer:", kind.extra?.feePayer);
  const requirements = {
    scheme: "exact", network: NETWORK,
    maxAmountRequired: "10000", // 0.01 tUSDC atomic
    resource: "https://neugrid-188737658015.us-central1.run.app/api/agent-gateway/signals",
    description: "Live trading + funding signals feed", mimeType: "application/json",
    payTo: PAY_TO, maxTimeoutSeconds: 120, asset: MINT,
    extra: { ...kind.extra },
  };

  // 2. payer half — the official SVM exact client signs the transfer
  const header = await exact.svm.createPaymentHeader(payer, 1, requirements as any, { svmConfig: { rpcUrl: RPC } } as any);
  console.log("X-PAYMENT built, len:", header.length);
  const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));

  // 3. facilitator half — exactly what NeuGrid's settleReqs() does
  const v = await (await fetch(`${FACILITATOR}/verify`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }) })).json();
  console.log("verify:", JSON.stringify(v));
  if (!v.isValid) throw new Error("verify failed: " + v.invalidReason);

  const s = await (await fetch(`${FACILITATOR}/settle`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements }) })).json();
  console.log("settle:", JSON.stringify(s));
  if (!s.success) throw new Error("settle failed: " + (s.errorReason || "?"));
  console.log("✓ ROUND-TRIP SETTLED — devnet tx:", s.transaction);
  console.log("explorer: https://explorer.solana.com/tx/" + s.transaction + "?cluster=devnet");
}
main().catch((e) => { console.error("ROUND-TRIP FAILED:", e?.message ?? e); process.exit(1); });
