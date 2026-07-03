/* Devnet x402 round-trip through the COINBASE CDP facilitator (authenticated).
 * Same shape as x402-roundtrip-test.ts, but every facilitator call carries the
 * per-endpoint CDP JWT from @coinbase/x402 (requires CDP_API_KEY_ID/SECRET).
 *   NEUGRID_X402_PAYER_SECRET=... NEUGRID_X402_MINT=... npx tsx scratchpad/x402-cdp-roundtrip.ts
 */
import bs58 from "bs58";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { exact } from "x402/schemes";
import { facilitator } from "@coinbase/x402";

const FACILITATOR = "https://api.cdp.coinbase.com/platform/v2/x402";
const RPC = "https://api.devnet.solana.com";
const NETWORK = "solana-devnet";
const MINT = process.env.NEUGRID_X402_MINT!;
const PAY_TO = "2Xr2TZ2fLsXF1TB42xmZ757vN7ygn79z3aH9Cz6fMptQ"; // treasury owner (devnet issuer)

async function main() {
  const payer = await createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(process.env.NEUGRID_X402_PAYER_SECRET!)));
  console.log("payer:", payer.address);
  const auth = await facilitator.createAuthHeaders!();

  const sup = await (await fetch(`${FACILITATOR}/supported`, { headers: auth.supported })).json();
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

  const header = await exact.svm.createPaymentHeader(payer, 1, requirements as any, { svmConfig: { rpcUrl: RPC } } as any);
  console.log("X-PAYMENT built, len:", header.length);
  const payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"));

  const v = await (await fetch(`${FACILITATOR}/verify`, { method: "POST", headers: { "content-type": "application/json", ...auth.verify },
    body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: requirements }) })).json();
  console.log("verify:", JSON.stringify(v));
  if (!v.isValid) throw new Error("verify failed: " + (v.invalidReason ?? v.errorMessage));

  const s = await (await fetch(`${FACILITATOR}/settle`, { method: "POST", headers: { "content-type": "application/json", ...auth.settle },
    body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: requirements }) })).json();
  console.log("settle:", JSON.stringify(s));
  if (!s.success) throw new Error("settle failed: " + (s.errorReason || "?"));
  console.log("✓ CDP ROUND-TRIP SETTLED — devnet tx:", s.transaction);
  console.log("explorer: https://explorer.solana.com/tx/" + s.transaction + "?cluster=devnet");
}
main().catch((e) => { console.error("CDP ROUND-TRIP FAILED:", e?.message ?? e); process.exit(1); });
