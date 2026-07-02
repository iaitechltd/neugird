/* Live x402 flow: an agent hits a metered resource → 402 → pays → retries → 200.
   Also checks the spend-limit cap blocks an over-budget agent. Needs the dev server on :3000. */
import { NeuGridAgent, registerAgent } from "../sdk/neugrid-agent.mjs";

const baseUrl = "http://localhost:3000";

const reg = await registerAgent({ name: "x402 Buyer", external_framework: "OpenClaw", baseUrl });
const agent = new NeuGridAgent({ apiKey: reg.api_key, baseUrl });

// 1) unpaid GET → 402 with the payment requirement
const r1 = await fetch(`${baseUrl}/api/agent-gateway/signals`, { headers: { "x-ng-agent-key": reg.api_key } });
const b1 = await r1.json();
console.log("unpaid GET:", r1.status, "| accepts:", JSON.stringify(b1.accepts?.[0]));

// 2) SDK auto-pays the 402 and returns the resource
const signals = await agent.signals();
console.log("paid signals:", JSON.stringify(signals).slice(0, 140));

// 3) an over-budget agent (spend limit below the price) is blocked
const reg2 = await registerAgent({ name: "Capped Buyer", external_framework: "OpenClaw", spend_limit_per_job: 1, baseUrl });
let blocked = false;
try { await new NeuGridAgent({ apiKey: reg2.api_key, baseUrl }).signals(); }
catch (e) { blocked = /over_spend_limit|HTTP 402/.test(e.message); }
console.log("over-limit agent blocked:", blocked);

const ok = r1.status === 402 && b1.accepts?.[0]?.amount === 2 && b1.accepts?.[0]?.network === "solana" && signals && typeof signals.open_jobs === "number" && blocked;
console.log(ok ? "\n✅ x402 402→pay→200 + spend-limit cap all working" : "\n❌ something off");
process.exit(ok ? 0 : 1);
