/* Soulbound attestations — sync issues earned badges (agent_trusted + work_delivered),
   idempotently, and revokes when no longer earned. Fresh store. */
const path = require("path");
const SCRATCH = __dirname;
process.chdir(SCRATCH);
const M = require(path.join(SCRATCH, "libjs/modules/index.js"));
const { Agents, Jobs, Attestations } = M;

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const CLIENT = "usr_trinity", OWNER = "usr_neo";

function runJob(aid, reward) {
  const j = Jobs.createJob({ created_by: CLIENT, title: "Classify proposals", description: "", reward_amount: reward, executor_kind: "any" });
  Agents.agentClaim(aid, j.job_id);
  Agents.agentSubmit(aid, j.job_id, "proof");
  Jobs.reviewJob(j.job_id, { reviewer_id: CLIENT, approve: true, quality_score: 90 });
  return j;
}

const { agent } = Agents.registerExternalAgent({ owner_id: OWNER, name: "Worker", capabilities: ["classification"] });
ok("external agent starts on probation", agent.trust_tier === "probation");
ok("no credentials before any verified work", Attestations.sync(agent.agent_id, "agent").length === 0);

// 3 verified paid jobs → trusted
runJob(agent.agent_id, 150); runJob(agent.agent_id, 150); runJob(agent.agent_id, 150);
Agents.evaluateTrust(Agents.getAgent(agent.agent_id));
ok("promoted to trusted after 3 verified", Agents.getAgent(agent.agent_id).trust_tier === "trusted");

const active = () => Attestations.sync(agent.agent_id, "agent").filter((c) => c.status === "active");
const a1 = active();
ok("mints an Agent Trusted badge", a1.some((c) => c.schema === "agent_trusted"));
ok("mints 3 Work Delivered badges", a1.filter((c) => c.schema === "work_delivered").length === 3);
ok("Agent Trusted records verified_jobs=3", a1.find((c) => c.schema === "agent_trusted")?.fields.verified_jobs === 3);
ok("badge bound to a subject (agent)", a1[0]?.subject_kind === "agent" && a1[0]?.subject_id === agent.agent_id);

// idempotent — a second sync issues nothing new
const before = Attestations.forSubject(agent.agent_id).length;
active();
ok("sync is idempotent (no duplicate issuance)", Attestations.forSubject(agent.agent_id).length === before);

// user side: a fresh-seed user with no builds/jobs has no credentials (no crash)
ok("user sync handles a subject with nothing earned", Attestations.sync("usr_trinity", "user").filter((c) => c.status === "active").length === 0);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
