"use strict";
/**
 * SentientX — agents as first-class economic actors.
 *
 * Stage 1: NATIVE agents (built in-platform). An owner creates an agent, then
 * deploys it on a Job from the universal work protocol — the agent autonomously
 * claims → executes (STUBBED) → submits proof. On approval (via the normal Job
 * review), the agent earns reputation + a rating, and the reward splits between
 * the agent's wallet and the owner (the differentiator: agents earn ratings,
 * owners earn a revenue split). Stage 2 = external agents via an MCP server/SDK,
 * gated by a bond + probation trust tier.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.REJECT_SETBACK = exports.REJECT_SLASH = exports.PROMOTE_BOND_MIN = exports.PROMOTE_MIN_JOBS = exports.PROBATION_MAX_REWARD = exports.DEFAULT_OWNER_SPLIT_BPS = void 0;
exports.hashKey = hashKey;
exports.createAgent = createAgent;
exports.getAgent = getAgent;
exports.listAgents = listAgents;
exports.agentsByOwner = agentsByOwner;
exports.agentJobs = agentJobs;
exports.deployOnJob = deployOnJob;
exports.paidJobCount = paidJobCount;
exports.rewardCap = rewardCap;
exports.spendLimit = spendLimit;
exports.effectiveCap = effectiveCap;
exports.setSpendLimit = setSpendLimit;
exports.rejectedJobCount = rejectedJobCount;
exports.evaluateTrust = evaluateTrust;
exports.registerExternalAgent = registerExternalAgent;
exports.getByKey = getByKey;
exports.selfView = selfView;
exports.claimableJobs = claimableJobs;
exports.agentClaim = agentClaim;
exports.agentSubmit = agentSubmit;
const node_crypto_1 = require("node:crypto");
const store_1 = require("../store");
const id_1 = require("../id");
const Jobs = __importStar(require("./jobs"));
/** Hash a gateway key for storage/lookup — we never persist the plaintext. */
function hashKey(key) {
    return (0, node_crypto_1.createHash)("sha256").update(key).digest("hex");
}
/** Default owner revenue share (bps) for a native agent — owner keeps most. */
exports.DEFAULT_OWNER_SPLIT_BPS = 7000;
function createAgent(input) {
    const agent = {
        agent_id: (0, id_1.newId)("agent"),
        owner_id: input.owner_id,
        grid_id: input.grid_id,
        name: input.name,
        capabilities: input.capabilities ?? [],
        permissions: input.permissions ?? [],
        task_history: [],
        rating: 0,
        status: "idle",
        created_at: (0, id_1.nowISO)(),
        origin: "native",
        trust_tier: "trusted", // native agents are trusted (built in-platform)
        owner_split_bps: input.owner_split_bps ?? exports.DEFAULT_OWNER_SPLIT_BPS,
        spend_limit_per_job: input.spend_limit_per_job,
        reputation: { total: 0, by_dimension: {} },
        earnings: 0,
    };
    store_1.db.agents.push(agent);
    return agent;
}
function getAgent(id) {
    return store_1.db.agents.find((a) => a.agent_id === id);
}
function listAgents(filter = {}) {
    return store_1.db.agents.filter((a) => (!filter.owner_id || a.owner_id === filter.owner_id) && (!filter.origin || a.origin === filter.origin));
}
function agentsByOwner(user_id) {
    return listAgents({ owner_id: user_id });
}
/** Jobs an agent has worked, with current status. */
function agentJobs(agent_id) {
    return store_1.db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent");
}
/**
 * Deploy an agent on an open Job: it claims → executes (stubbed) → submits proof,
 * leaving the Job "submitted" for the creator to review. Owner-operated.
 */
function deployOnJob(agent_id, job_id, owner_id) {
    const agent = getAgent(agent_id);
    if (!agent)
        return { error: "agent_not_found" };
    if (agent.owner_id !== owner_id)
        return { error: "not_owner" };
    if (agent.status === "suspended")
        return { error: "agent_suspended" };
    const job = Jobs.getJob(job_id);
    if (!job)
        return { error: "job_not_found" };
    if (job.status !== "open")
        return { error: "job_not_open" };
    if (job.executor_kind === "human")
        return { error: "human_only" };
    if (job.created_by === owner_id)
        return { error: "cannot_claim_own_job" };
    if (job.reward_amount > effectiveCap(agent))
        return { error: "over_spend_limit" };
    Jobs.claimJob(job_id, agent_id, "agent"); // assignee = the agent
    Jobs.submitProof(job_id, agent_id, synthesizeDeliverable(agent, job)); // stubbed autonomous execution
    agent.status = "active";
    if (!agent.task_history.includes(job_id))
        agent.task_history.push(job_id);
    return { job: Jobs.getJob(job_id), agent };
}
/* ------------------- external agents (the MCP/SDK door) ------------------ */
// Outside frameworks (OpenClaw, Hermes, …) register an agent, get a gateway key,
// and plug it into their MCP client. The agent then self-operates on Jobs via the
// agent-gateway (claim → execute on their side → submit). External agents start on
// PROBATION; the owner still earns the revenue split. Cold-start bond/limits = 2b.
exports.PROBATION_MAX_REWARD = 200; // a probation agent's max reward per Job
exports.PROMOTE_MIN_JOBS = 3; // verified Jobs needed to earn "trusted"
exports.PROMOTE_BOND_MIN = 1000; // a bond that fast-tracks trust (with ≥1 Job)
exports.REJECT_SLASH = 100; // bond slashed when an agent's work is rejected
/** Count of this agent's Jobs that were verified + paid. */
function paidJobCount(agent_id) {
    return store_1.db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent" && j.status === "paid").length;
}
/** Max reward an agent may take on a single Job, given its trust tier. */
function rewardCap(agent) {
    return agent.trust_tier === "trusted" ? Infinity : exports.PROBATION_MAX_REWARD;
}
/** The owner's per-Job spend guardrail (max Job reward the agent may take on), if set. */
function spendLimit(agent) {
    return agent.spend_limit_per_job && agent.spend_limit_per_job > 0 ? agent.spend_limit_per_job : Infinity;
}
/** The effective per-Job cap: the tighter of the trust-tier cap and the owner's spend limit. */
function effectiveCap(agent) {
    return Math.min(rewardCap(agent), spendLimit(agent));
}
/** Owner sets (or clears, with null/0) the agent's per-Job spend limit. */
function setSpendLimit(agent_id, owner_id, limit) {
    const agent = getAgent(agent_id);
    if (!agent)
        return { error: "agent_not_found" };
    if (agent.owner_id !== owner_id)
        return { error: "not_owner" };
    agent.spend_limit_per_job = limit && limit > 0 ? limit : undefined;
    return { agent };
}
exports.REJECT_SETBACK = 3; // verified-Job progress wiped by each rejection
/** This agent's currently-rejected Jobs (each sets back trust progress). */
function rejectedJobCount(agent_id) {
    return store_1.db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent" && j.status === "rejected").length;
}
/** Promote probation→trusted once earned: a track record of verified Jobs (net of
 *  rejections), or a meaningful bond plus a delivery. Mutates + returns the agent. */
function evaluateTrust(agent) {
    if (agent.trust_tier !== "probation")
        return agent;
    const progress = paidJobCount(agent.agent_id) - rejectedJobCount(agent.agent_id) * exports.REJECT_SETBACK;
    const bond = agent.bond_amount ?? 0;
    if (progress >= exports.PROMOTE_MIN_JOBS || (bond >= exports.PROMOTE_BOND_MIN && progress >= 1))
        agent.trust_tier = "trusted";
    return agent;
}
function registerExternalAgent(input) {
    // Plaintext key is returned ONCE; we persist only its hash (never the secret).
    const api_key = `agk_${(0, id_1.newId)("k").slice(2)}${(0, id_1.newId)("k").slice(2)}`;
    const agent = {
        agent_id: (0, id_1.newId)("agent"),
        owner_id: input.owner_id,
        name: input.name,
        capabilities: input.capabilities ?? [],
        permissions: [],
        task_history: [],
        rating: 0,
        status: "idle",
        created_at: (0, id_1.nowISO)(),
        origin: "external",
        external_framework: input.external_framework,
        trust_tier: "probation", // external agents start on probation
        owner_split_bps: input.owner_split_bps ?? exports.DEFAULT_OWNER_SPLIT_BPS,
        bond_amount: input.bond_amount,
        spend_limit_per_job: input.spend_limit_per_job,
        reputation: { total: 0, by_dimension: {} },
        earnings: 0,
        api_key_hash: hashKey(api_key),
    };
    store_1.db.agents.push(agent);
    return { agent, api_key };
}
/** Resolve an agent from its gateway key — by key hash (new agents) or, for
 *  seeded fixtures only, a legacy plaintext match. The secret itself is never stored. */
function getByKey(key) {
    if (!key)
        return undefined;
    const h = hashKey(key);
    return store_1.db.agents.find((a) => (a.api_key_hash != null && a.api_key_hash === h) || a.api_key === key);
}
/** A redacted, agent-facing view (never leaks the key or other agents' data). */
function selfView(agent) {
    evaluateTrust(agent);
    const verified = paidJobCount(agent.agent_id);
    return {
        agent_id: agent.agent_id,
        name: agent.name,
        origin: agent.origin,
        trust_tier: agent.trust_tier,
        reputation: Math.round(agent.reputation?.total ?? 0),
        rating: agent.rating ?? 0,
        earnings: agent.earnings ?? 0,
        owner_split_bps: agent.owner_split_bps ?? 0,
        bond: agent.bond_amount ?? 0,
        jobs_done: agent.task_history.length,
        verified_jobs: verified,
        reward_cap: agent.trust_tier === "trusted" ? null : exports.PROBATION_MAX_REWARD,
        spend_limit_per_job: agent.spend_limit_per_job ?? null,
        effective_cap: effectiveCap(agent) === Infinity ? null : effectiveCap(agent),
        jobs_to_trusted: agent.trust_tier === "trusted" ? 0 : Math.max(0, exports.PROMOTE_MIN_JOBS - verified),
    };
}
/** Open Jobs this agent is allowed to claim (not its owner's, not human-only). */
function claimableJobs(agent) {
    evaluateTrust(agent);
    const cap = effectiveCap(agent);
    return store_1.db.jobs.filter((j) => j.status === "open" && j.executor_kind !== "human" && j.created_by !== agent.owner_id && j.reward_amount <= cap);
}
/** External agent claims a Job itself (gateway). Distinct from owner-driven deployOnJob. */
function agentClaim(agent_id, job_id) {
    const agent = getAgent(agent_id);
    if (!agent)
        return { error: "agent_not_found" };
    evaluateTrust(agent);
    if (agent.status === "suspended" || agent.trust_tier === "suspended")
        return { error: "agent_suspended" };
    const job = Jobs.getJob(job_id);
    if (!job)
        return { error: "job_not_found" };
    if (job.status !== "open")
        return { error: "job_not_open" };
    if (job.executor_kind === "human")
        return { error: "human_only" };
    if (job.created_by === agent.owner_id)
        return { error: "cannot_claim_own_job" };
    if (job.reward_amount > effectiveCap(agent))
        return { error: job.reward_amount > rewardCap(agent) ? "over_probation_limit" : "over_spend_limit" };
    Jobs.claimJob(job_id, agent_id, "agent");
    agent.status = "active";
    if (!agent.task_history.includes(job_id))
        agent.task_history.push(job_id);
    return { job: Jobs.getJob(job_id) };
}
/** External agent submits its own proof of work (gateway). */
function agentSubmit(agent_id, job_id, payload) {
    const agent = getAgent(agent_id);
    if (!agent)
        return { error: "agent_not_found" };
    const job = Jobs.getJob(job_id);
    if (!job)
        return { error: "job_not_found" };
    if (job.assignee_id !== agent_id)
        return { error: "not_assignee" };
    const updated = Jobs.submitProof(job_id, agent_id, payload);
    if (!updated)
        return { error: "bad_state" };
    return { job: updated };
}
/* ----------------------- stub execution (swap me) ------------------------ */
// Stage 2 replaces this with a real sandboxed agent run (scoped tools, spend
// limits, audit). For now it produces a deterministic, plausible deliverable.
function synthesizeDeliverable(agent, job) {
    const cap = agent.capabilities[0] ?? "execution";
    return `[${agent.name}] autonomous ${cap} run for "${job.title}" — completed per spec, artifacts attached. ref: agentrun_${stamp(agent.agent_id + job.job_id)}`;
}
function stamp(material) {
    let h = 5381;
    for (let i = 0; i < material.length; i++)
        h = ((h << 5) + h + material.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, "0");
}
