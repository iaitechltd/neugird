/* In-process Agent-interop verification: native agent → claim/execute Job →
   verified → agent reputation + earnings + owner revenue split. Fresh store. */
const path = require("path");
const SCRATCH = __dirname;
process.chdir(SCRATCH);
const M = require(path.join(SCRATCH, "libjs/modules/index.js"));
const { Agents, Jobs, Users } = M;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const OWNER = "usr_neo";      // agent owner
const CLIENT = "usr_trinity"; // posts the job + reviews

// 1) Create a native agent
const agent = Agents.createAgent({ owner_id: OWNER, name: "Scout", capabilities: ["research", "analytics"], owner_split_bps: 7000 });
ok("agent created (native, trusted)", agent && agent.origin === "native" && agent.trust_tier === "trusted", agent && agent.agent_id);
ok("agent starts at zero reputation/earnings", (agent.reputation?.total ?? 0) === 0 && (agent.earnings ?? 0) === 0);
ok("agent in owner's roster", Agents.agentsByOwner(OWNER).some((a) => a.agent_id === agent.agent_id));

// 2) A client posts a Job open to agents
const job = Jobs.createJob({ created_by: CLIENT, title: "Summarize this week's governance", description: "Digest of proposals + votes.", reward_amount: 200, executor_kind: "any" });
ok("job open to agents", job.status === "open" && job.executor_kind === "any");

// 3) Deploy the agent → it claims + executes (stubbed) + submits
const dep = Agents.deployOnJob(agent.agent_id, job.job_id, OWNER);
ok("agent claimed the job as agent", dep.job && dep.job.assignee_id === agent.agent_id && dep.job.assignee_type === "agent");
ok("agent submitted proof (awaiting review)", dep.job.status === "submitted" && !!dep.job.proof?.payload, dep.job.proof?.payload?.slice(0, 28));
ok("job recorded in agent task history", Agents.getAgent(agent.agent_id).task_history.includes(job.job_id));

// 4) Client reviews + approves → economic settlement
const ownerRewardBefore = Users.getUser(OWNER).reward?.accrued ?? 0;
const reviewed = Jobs.reviewJob(job.job_id, { reviewer_id: CLIENT, approve: true, quality_score: 90 });
ok("job paid on approval", reviewed.status === "paid");
const a2 = Agents.getAgent(agent.agent_id);
ok("agent earned reputation", (a2.reputation?.total ?? 0) === 226, `total=${a2.reputation?.total} (expected 226 = 200×1.13)`);
ok("agent rating bumped from verified work", (a2.rating ?? 0) > 0, `rating=${a2.rating}`);
ok("agent kept its wallet share (30% of 200)", a2.earnings === 60, `earnings=${a2.earnings}`);
const ownerRewardAfter = Users.getUser(OWNER).reward?.accrued ?? 0;
ok("owner earned the revenue split (70% of 200)", ownerRewardAfter - ownerRewardBefore === 140, `Δ=${ownerRewardAfter - ownerRewardBefore}`);

// 5) Negative paths
const ownJob = Jobs.createJob({ created_by: OWNER, title: "Owner's own task", description: "x", reward_amount: 50, executor_kind: "any" });
ok("agent can't claim its owner's own job", Agents.deployOnJob(agent.agent_id, ownJob.job_id, OWNER).error === "cannot_claim_own_job");
const job2 = Jobs.createJob({ created_by: CLIENT, title: "Another task", description: "x", reward_amount: 80, executor_kind: "any" });
ok("non-owner can't deploy someone's agent", Agents.deployOnJob(agent.agent_id, job2.job_id, CLIENT).error === "not_owner");
const humanJob = Jobs.createJob({ created_by: CLIENT, title: "Humans only", description: "x", reward_amount: 80, executor_kind: "human" });
ok("agent rejected from human-only job", Agents.deployOnJob(agent.agent_id, humanJob.job_id, OWNER).error === "human_only");
ok("deploy unknown agent → error", Agents.deployOnJob("agent_nope", job2.job_id, OWNER).error === "agent_not_found");

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
