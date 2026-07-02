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

import { createHash } from "node:crypto";
import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Jobs from "./jobs";
import type { Agent, Job } from "../types";

/** Hash a gateway key for storage/lookup — we never persist the plaintext. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Default owner revenue share (bps) for a native agent — owner keeps most. */
export const DEFAULT_OWNER_SPLIT_BPS = 7000;

export interface CreateAgentInput {
  owner_id: string;
  name: string;
  capabilities?: string[];
  permissions?: string[];
  owner_split_bps?: number; // owner's share of agent earnings, in bps
  spend_limit_per_job?: number; // owner guardrail: max Job reward this agent may take on
  grid_id?: string;
}

export function createAgent(input: CreateAgentInput): Agent {
  const agent: Agent = {
    agent_id: newId("agent"),
    owner_id: input.owner_id,
    grid_id: input.grid_id,
    name: input.name,
    capabilities: input.capabilities ?? [],
    permissions: input.permissions ?? [],
    task_history: [],
    rating: 0,
    status: "idle",
    created_at: nowISO(),
    origin: "native",
    trust_tier: "trusted", // native agents are trusted (built in-platform)
    owner_split_bps: input.owner_split_bps ?? DEFAULT_OWNER_SPLIT_BPS,
    spend_limit_per_job: input.spend_limit_per_job,
    reputation: { total: 0, by_dimension: {} },
    earnings: 0,
  };
  db.agents.push(agent);
  return agent;
}

export function getAgent(id: string): Agent | undefined {
  return db.agents.find((a) => a.agent_id === id);
}

export function listAgents(filter: { owner_id?: string; origin?: Agent["origin"] } = {}): Agent[] {
  return db.agents.filter(
    (a) => (!filter.owner_id || a.owner_id === filter.owner_id) && (!filter.origin || a.origin === filter.origin),
  );
}

export function agentsByOwner(user_id: string): Agent[] {
  return listAgents({ owner_id: user_id });
}

/** Jobs an agent has worked, with current status. */
export function agentJobs(agent_id: string): Job[] {
  return db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent");
}

/**
 * Deploy an agent on an open Job: it claims → executes (stubbed) → submits proof,
 * leaving the Job "submitted" for the creator to review. Owner-operated.
 */
export function deployOnJob(
  agent_id: string,
  job_id: string,
  owner_id: string,
): { job?: Job; agent?: Agent; error?: string } {
  const agent = getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  if (agent.owner_id !== owner_id) return { error: "not_owner" };
  if (agent.status === "suspended") return { error: "agent_suspended" };

  const job = Jobs.getJob(job_id);
  if (!job) return { error: "job_not_found" };
  if (job.status !== "open") return { error: "job_not_open" };
  if (job.context === "campaign_task") return { error: "use_apply" }; // campaign jobs hire via apply→select
  if (job.executor_kind === "human") return { error: "human_only" };
  if (job.created_by === owner_id) return { error: "cannot_claim_own_job" };
  if (job.reward_amount > effectiveCap(agent)) return { error: "over_spend_limit" };

  Jobs.claimJob(job_id, agent_id, "agent"); // assignee = the agent
  Jobs.submitProof(job_id, agent_id, synthesizeDeliverable(agent, job)); // stubbed autonomous execution

  agent.status = "active";
  if (!agent.task_history.includes(job_id)) agent.task_history.push(job_id);
  return { job: Jobs.getJob(job_id), agent };
}

/* ------------------- external agents (the MCP/SDK door) ------------------ */
// Outside frameworks (OpenClaw, Hermes, …) register an agent, get a gateway key,
// and plug it into their MCP client. The agent then self-operates on Jobs via the
// agent-gateway (claim → execute on their side → submit). External agents start on
// PROBATION; the owner still earns the revenue split. Cold-start bond/limits = 2b.

export const PROBATION_MAX_REWARD = 200; // a probation agent's max reward per Job
export const PROMOTE_MIN_JOBS = 3; // verified Jobs needed to earn "trusted"
export const PROMOTE_BOND_MIN = 1000; // a bond that fast-tracks trust (with ≥1 Job)
export const REJECT_SLASH = 100; // bond slashed when an agent's work is rejected

/** Count of this agent's Jobs that were verified + paid. */
export function paidJobCount(agent_id: string): number {
  return db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent" && j.status === "paid").length;
}

/** Max reward an agent may take on a single Job, given its trust tier. */
export function rewardCap(agent: Agent): number {
  return agent.trust_tier === "trusted" ? Infinity : PROBATION_MAX_REWARD;
}

/** The owner's per-Job spend guardrail (max Job reward the agent may take on), if set. */
export function spendLimit(agent: Agent): number {
  return agent.spend_limit_per_job && agent.spend_limit_per_job > 0 ? agent.spend_limit_per_job : Infinity;
}

/** The effective per-Job cap: the tighter of the trust-tier cap and the owner's spend limit. */
export function effectiveCap(agent: Agent): number {
  return Math.min(rewardCap(agent), spendLimit(agent));
}

/** Owner sets (or clears, with null/0) the agent's per-Job spend limit. */
export function setSpendLimit(agent_id: string, owner_id: string, limit: number | null): { agent?: Agent; error?: string } {
  const agent = getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  if (agent.owner_id !== owner_id) return { error: "not_owner" };
  agent.spend_limit_per_job = limit && limit > 0 ? limit : undefined;
  return { agent };
}

export const REJECT_SETBACK = 3; // verified-Job progress wiped by each rejection

/** This agent's currently-rejected Jobs (each sets back trust progress). */
export function rejectedJobCount(agent_id: string): number {
  return db.jobs.filter((j) => j.assignee_id === agent_id && j.assignee_type === "agent" && j.status === "rejected").length;
}

/** Promote probation→trusted once earned: a track record of verified Jobs (net of
 *  rejections), or a meaningful bond plus a delivery. Mutates + returns the agent. */
export function evaluateTrust(agent: Agent): Agent {
  if (agent.trust_tier !== "probation") return agent;
  const progress = paidJobCount(agent.agent_id) - rejectedJobCount(agent.agent_id) * REJECT_SETBACK;
  const bond = agent.bond_amount ?? 0;
  if (progress >= PROMOTE_MIN_JOBS || (bond >= PROMOTE_BOND_MIN && progress >= 1)) agent.trust_tier = "trusted";
  return agent;
}

export interface RegisterExternalInput {
  owner_id: string;
  name: string;
  external_framework?: string;
  capabilities?: string[];
  owner_split_bps?: number;
  bond_amount?: number;
  spend_limit_per_job?: number;
}

export function registerExternalAgent(input: RegisterExternalInput): { agent: Agent; api_key: string } {
  // Plaintext key is returned ONCE; we persist only its hash (never the secret).
  const api_key = `agk_${newId("k").slice(2)}${newId("k").slice(2)}`;
  const agent: Agent = {
    agent_id: newId("agent"),
    owner_id: input.owner_id,
    name: input.name,
    capabilities: input.capabilities ?? [],
    permissions: [],
    task_history: [],
    rating: 0,
    status: "idle",
    created_at: nowISO(),
    origin: "external",
    external_framework: input.external_framework,
    trust_tier: "probation", // external agents start on probation
    owner_split_bps: input.owner_split_bps ?? DEFAULT_OWNER_SPLIT_BPS,
    bond_amount: input.bond_amount,
    spend_limit_per_job: input.spend_limit_per_job,
    reputation: { total: 0, by_dimension: {} },
    earnings: 0,
    api_key_hash: hashKey(api_key),
  };
  db.agents.push(agent);
  return { agent, api_key };
}

/** Resolve an agent from its gateway key — by key hash (new agents) or, for
 *  seeded fixtures only, a legacy plaintext match. The secret itself is never stored. */
export function getByKey(key: string | null | undefined): Agent | undefined {
  if (!key) return undefined;
  const h = hashKey(key);
  return db.agents.find((a) => (a.api_key_hash != null && a.api_key_hash === h) || a.api_key === key);
}

/** A redacted, agent-facing view (never leaks the key or other agents' data). */
export function selfView(agent: Agent) {
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
    reward_cap: agent.trust_tier === "trusted" ? null : PROBATION_MAX_REWARD,
    spend_limit_per_job: agent.spend_limit_per_job ?? null,
    effective_cap: effectiveCap(agent) === Infinity ? null : effectiveCap(agent),
    jobs_to_trusted: agent.trust_tier === "trusted" ? 0 : Math.max(0, PROMOTE_MIN_JOBS - verified),
  };
}

/** Open Jobs this agent is allowed to claim (not its owner's, not human-only). */
export function claimableJobs(agent: Agent): Job[] {
  evaluateTrust(agent);
  const cap = effectiveCap(agent);
  return db.jobs.filter(
    (j) => j.status === "open" && j.executor_kind !== "human" && j.context !== "campaign_task" && j.created_by !== agent.owner_id && j.reward_amount <= cap,
  );
}

/** External agent claims a Job itself (gateway). Distinct from owner-driven deployOnJob. */
export function agentClaim(agent_id: string, job_id: string): { job?: Job; error?: string } {
  const agent = getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  evaluateTrust(agent);
  if (agent.status === "suspended" || agent.trust_tier === "suspended") return { error: "agent_suspended" };
  const job = Jobs.getJob(job_id);
  if (!job) return { error: "job_not_found" };
  if (job.status !== "open") return { error: "job_not_open" };
  if (job.context === "campaign_task") return { error: "use_apply" }; // campaign jobs hire via apply→select
  if (job.executor_kind === "human") return { error: "human_only" };
  if (job.created_by === agent.owner_id) return { error: "cannot_claim_own_job" };
  if (job.reward_amount > effectiveCap(agent)) return { error: job.reward_amount > rewardCap(agent) ? "over_probation_limit" : "over_spend_limit" };
  Jobs.claimJob(job_id, agent_id, "agent");
  agent.status = "active";
  if (!agent.task_history.includes(job_id)) agent.task_history.push(job_id);
  return { job: Jobs.getJob(job_id) };
}

/** External agent submits its own proof of work (gateway). */
export function agentSubmit(agent_id: string, job_id: string, payload: string): { job?: Job; error?: string } {
  const agent = getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  const job = Jobs.getJob(job_id);
  if (!job) return { error: "job_not_found" };
  if (job.assignee_id !== agent_id) return { error: "not_assignee" };
  const updated = Jobs.submitProof(job_id, agent_id, payload);
  if (!updated) return { error: "bad_state" };
  return { job: updated };
}

/* ----------------------- stub execution (swap me) ------------------------ */
// Stage 2 replaces this with a real sandboxed agent run (scoped tools, spend
// limits, audit). For now it produces a deterministic, plausible deliverable.

export function synthesizeDeliverable(agent: Agent, job: Job): string {
  const cap = agent.capabilities[0] ?? "execution";
  return `[${agent.name}] autonomous ${cap} run for "${job.title}" — completed per spec, artifacts attached. ref: agentrun_${stamp(agent.agent_id + job.job_id)}`;
}

function stamp(material: string): string {
  let h = 5381;
  for (let i = 0; i < material.length; i++) h = ((h << 5) + h + material.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
