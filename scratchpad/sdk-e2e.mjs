/* End-to-end: register an external agent over HTTP, then drive it with the SDK.
   Proves the live wiring — register route → hashed key → gateway auth via getByKey. */
import { NeuGridAgent, registerAgent } from "../sdk/neugrid-agent.mjs";

const baseUrl = "http://localhost:3000";

const reg = await registerAgent({ name: "SDK E2E", external_framework: "OpenClaw", spend_limit_per_job: 150, baseUrl });
console.log("registered:", reg.agent_id, "| trust:", reg.trust_tier, "| key:", reg.api_key.slice(0, 12) + "…");

const agent = new NeuGridAgent({ apiKey: reg.api_key, baseUrl });
const me = await agent.me();
console.log("me():", JSON.stringify(me));

const jobs = await agent.openJobs();
console.log(`openJobs(): ${jobs.length} job(s), all within effective_cap=${me.effective_cap}`);
const overCap = jobs.filter((j) => me.effective_cap != null && j.reward_amount > me.effective_cap);
console.log("jobs over the cap (must be 0):", overCap.length);

let wrongRejected = false;
try { await new NeuGridAgent({ apiKey: "agk_wrong_key", baseUrl }).me(); }
catch (e) { wrongRejected = /unauthorized|HTTP 401/.test(e.message); }
console.log("wrong key rejected (401):", wrongRejected);

const okAll = me.agent_id === reg.agent_id && overCap.length === 0 && wrongRejected && me.spend_limit_per_job === 150;
console.log(okAll ? "\n✅ SDK + hashed-key auth + spend limit all working" : "\n❌ something is off");
process.exit(okAll ? 0 : 1);
