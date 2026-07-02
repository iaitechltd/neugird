/* Stage 2b — cold-start trust: probation reward cap, bond-aware promotion,
   slash + demotion on rejection (demotion sticks). Fresh store. */
const path = require("path");
const SCRATCH = __dirname;
process.chdir(SCRATCH);
const M = require(path.join(SCRATCH, "libjs/modules/index.js"));
const { Agents, Jobs } = M;

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };
const CLIENT = "usr_trinity", OWNER = "usr_neo";

function runJob(agentId, reward, quality, approve) {
  const job = Jobs.createJob({ created_by: CLIENT, title: "T", description: "", reward_amount: reward, executor_kind: "any" });
  const c = Agents.agentClaim(agentId, job.job_id);
  if (c.error) return { claimError: c.error };
  Agents.agentSubmit(agentId, job.job_id, "proof");
  Jobs.reviewJob(job.job_id, { reviewer_id: CLIENT, approve, quality_score: quality });
  return { job: Jobs.getJob(job.job_id) };
}

// 1) register external, no bond → probation + capped
const { agent } = Agents.registerExternalAgent({ owner_id: OWNER, name: "Probie", capabilities: ["x"] });
ok("registers on probation", agent.trust_tier === "probation");
ok("reward cap = probation max", Agents.rewardCap(agent) === Agents.PROBATION_MAX_REWARD, String(Agents.PROBATION_MAX_REWARD));

// 2) over-cap job is blocked (not claimable, claim rejected)
const big = Jobs.createJob({ created_by: CLIENT, title: "Big", description: "", reward_amount: 500, executor_kind: "any" });
ok("over-cap job hidden from claimable set", !Agents.claimableJobs(agent).some((j) => j.job_id === big.job_id));
ok("probation can't claim over-cap job", Agents.agentClaim(agent.agent_id, big.job_id).error === "over_probation_limit");

// 3) three verified jobs → promote to trusted, cap lifts
const r1 = runJob(agent.agent_id, 150, 85, true);
ok("1st small job paid", r1.job?.status === "paid");
ok("still probation after 1", Agents.getAgent(agent.agent_id).trust_tier === "probation");
runJob(agent.agent_id, 150, 85, true);
runJob(agent.agent_id, 150, 85, true);
Agents.evaluateTrust(Agents.getAgent(agent.agent_id));
ok("promoted to trusted after 3 verified", Agents.getAgent(agent.agent_id).trust_tier === "trusted", "verified=" + Agents.paidJobCount(agent.agent_id));
ok("trusted cap is uncapped", Agents.rewardCap(Agents.getAgent(agent.agent_id)) === Infinity);
ok("trusted can claim the big job", !Agents.agentClaim(agent.agent_id, big.job_id).error);
Agents.agentSubmit(agent.agent_id, big.job_id, "proof");
Jobs.reviewJob(big.job_id, { reviewer_id: CLIENT, approve: true, quality_score: 90 });

// 4) rejection → bond slashed + demoted, and demotion sticks
const t = Agents.getAgent(agent.agent_id);
t.bond_amount = 250;
const rj = runJob(agent.agent_id, 150, 20, false);
ok("job rejected", rj.job?.status === "rejected");
const after = Agents.getAgent(agent.agent_id);
ok("bond slashed on rejection", after.bond_amount === 150, "bond=" + after.bond_amount);
ok("trusted demoted to probation", after.trust_tier === "probation");
Agents.evaluateTrust(after);
ok("demotion sticks (rejection setback)", after.trust_tier === "probation");

// 5) bond fast-track: big bond + 1 delivery → trusted
const { agent: b } = Agents.registerExternalAgent({ owner_id: OWNER, name: "Bonded", capabilities: ["x"], bond_amount: 1500 });
ok("bonded agent still starts probation", b.trust_tier === "probation");
runJob(b.agent_id, 150, 85, true);
Agents.evaluateTrust(Agents.getAgent(b.agent_id));
ok("bond ≥ min + 1 delivery → trusted", Agents.getAgent(b.agent_id).trust_tier === "trusted");

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
