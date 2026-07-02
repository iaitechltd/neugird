/* Devnet x402 END-TO-END through PROD: the SDK agent hits a metered gateway
 * resource → 402 with real PaymentRequirements → the official x402 SVM client
 * signs the devnet transfer → NeuGrid verifies+settles via the facilitator →
 * the resource returns paid; the settlement (with the on-chain tx) lands in the store.
 *   NEUGRID_AGENT_KEY=... NEUGRID_X402_PAYER_SECRET=... node scratchpad/x402-e2e-prod.mjs
 */
import bs58 from "bs58";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { exact } from "x402/schemes";
import { NeuGridAgent, createSolanaX402Payer } from "../sdk/neugrid-agent.mjs";

const BASE = "https://neugrid-188737658015.us-central1.run.app";
const RPC = "https://api.devnet.solana.com";
const TREASURY_ATA = "AydnJhats37Bm7jarmzgyHSePG2acrVMyA4J6WctEf83";

async function ataBalance() {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountBalance", params: [TREASURY_ATA] }) });
  return (await r.json()).result?.value?.uiAmountString;
}
async function x402Revenue() {
  const eco = await (await fetch(`${BASE}/api/economy`)).json();
  return JSON.stringify(eco.x402 ?? {}).slice(0, 200);
}

const payerSigner = await createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(process.env.NEUGRID_X402_PAYER_SECRET)));
console.log("payer:", payerSigner.address);
console.log("before — treasury ATA:", await ataBalance(), "| prod x402:", await x402Revenue());

const agent = new NeuGridAgent({
  apiKey: process.env.NEUGRID_AGENT_KEY,
  baseUrl: BASE,
  createX402Payment: createSolanaX402Payer({
    signer: payerSigner,
    createPaymentHeader: (signer, v, req) => exact.svm.createPaymentHeader(signer, v, req, { svmConfig: { rpcUrl: RPC } }),
  }),
});

console.log("agent:", (await agent.me()).name);
const data = await agent.resource("signals");
console.log("✓ resource returned paid — keys:", Object.keys(data).join(","));
await new Promise((s) => setTimeout(s, 4000));
console.log("after  — treasury ATA:", await ataBalance(), "| prod x402:", await x402Revenue());
