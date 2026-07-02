/* Stage 2c — agent hardening: hashed gateway keys + per-Job spend limits. Fresh store. */
const path = require("path");
const SCRATCH = __dirname;
process.chdir(SCRATCH);
const M = require(path.join(SCRATCH, "libjs/modules/index.js"));
const { Agents, Jobs } = M;

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const CLIENT = "usr_trinity", OWNER = "usr_neo";

// ---- hashed gateway keys ----
const { agent: ext, api_key } = Agents.registerExternalAgent({ owner_id: OWNER, name: "Hashed", capabilities: ["x"] });
ok("register returns a plaintext key once", typeof api_key === "string" && api_key.startsWith("agk_"));
ok("plaintext key is NOT stored on the agent", ext.api_key === undefined);
ok("key hash IS stored (sha256 hex)", typeof ext.api_key_hash === "string" && ext.api_key_hash.length === 64);
ok("stored hash != the plaintext", ext.api_key_hash !== api_key);
ok("getByKey resolves the key (hash match)", Agents.getByKey(api_key) && Agents.getByKey(api_key).agent_id === ext.agent_id);
ok("getByKey rejects a wrong key", Agents.getByKey("agk_wrong") === undefined);
ok("getByKey rejects empty/null", Agents.getByKey("") === undefined && Agents.getByKey(null) === undefined);
ok("hashKey is deterministic", Agents.hashKey(api_key) === ext.api_key_hash);

// ---- per-Job spend limits ----
const nat = Agents.createAgent({ owner_id: OWNER, name: "Capped", capabilities: ["x"], spend_limit_per_job: 100 });
ok("trusted agent has an Infinity trust cap", Agents.rewardCap(nat) === Infinity);
ok("spend limit sets the effective cap", Agents.effectiveCap(nat) === 100);

const small = Jobs.createJob({ created_by: CLIENT, title: "Small", description: "", reward_amount: 80, executor_kind: "any" });
const big = Jobs.createJob({ created_by: CLIENT, title: "Big", description: "", reward_amount: 150, executor_kind: "any" });
ok("under-limit Job is claimable", Agents.claimableJobs(nat).some((j) => j.job_id === small.job_id));
ok("over-limit Job hidden from claimable set", !Agents.claimableJobs(nat).some((j) => j.job_id === big.job_id));
ok("deploy over the spend limit is blocked", Agents.deployOnJob(nat.agent_id, big.job_id, OWNER).error === "over_spend_limit");

Agents.setSpendLimit(nat.agent_id, OWNER, 1000);
ok("owner can raise the spend limit", Agents.effectiveCap(Agents.getAgent(nat.agent_id)) === 1000);
ok("now deploys on the big Job", !!Agents.deployOnJob(nat.agent_id, big.job_id, OWNER).job);
ok("a non-owner cannot set the spend limit", Agents.setSpendLimit(nat.agent_id, CLIENT, 5).error === "not_owner");

// effective cap is the tighter of trust cap and spend limit
const prob = Agents.registerExternalAgent({ owner_id: OWNER, name: "ProbCapped", spend_limit_per_job: 50 }).agent;
ok("probation trust cap = 200", Agents.rewardCap(prob) === Agents.PROBATION_MAX_REWARD);
ok("effective cap = tighter spend limit (50)", Agents.effectiveCap(prob) === 50);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
