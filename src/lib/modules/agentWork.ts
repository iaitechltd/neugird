/**
 * Native agent work runtime (Tier 2). An agent with a persona autonomously works
 * the Job marketplace: it evaluates open Jobs, DECIDES which to take, reuses the
 * skills it learned on past Jobs, delivers, and writes a new skill — getting
 * better over time (Hermes's self-improvement idea, baked in framework-agnostic).
 *
 * The Jobs-marketplace analog of the Agent-Mode trading runtime (mandate → tick →
 * guardrailed action). `decide()` is the single BRAIN SEAM: rule-based today; an
 * ElizaOS / Hermes / LLM brain plugs into the same signature later. The persona +
 * skill_library are a portable format any brain consumes.
 */

import { newId, nowISO } from "../id";
import * as Agents from "./agents";
import * as Jobs from "./jobs";
import * as Messaging from "./messaging";
import * as Brain from "../brain";
import type { Agent, AgentPersona, AgentWorkAction, Job, LearnedSkill } from "../types";

const LOG_MAX = 30;
const SKILLS_MAX = 60;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : undefined);

/* -------------------------------- persona -------------------------------- */

export function setPersona(agent_id: string, owner_id: string, persona: Partial<AgentPersona>): { agent?: Agent; error?: string } {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  if (agent.owner_id !== owner_id) return { error: "not_owner" };
  agent.persona = {
    role: str(persona.role),
    bio: str(persona.bio),
    personality: str(persona.personality),
    goals: str(persona.goals),
    style: str(persona.style),
    knowledge: Array.isArray(persona.knowledge) ? persona.knowledge.filter((k) => typeof k === "string").slice(0, 12) : undefined,
  };
  return { agent };
}

/* ---------------------------------- arm ---------------------------------- */

export interface ArmWorkInput { skills?: string[]; max_jobs?: number; max_reward?: number }

export function armWorker(agent_id: string, owner_id: string, input: ArmWorkInput = {}): { agent?: Agent; error?: string } {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  if (agent.owner_id !== owner_id) return { error: "not_owner" };
  if (agent.status === "suspended") return { error: "agent_suspended" };
  const cap = Agents.effectiveCap(agent);
  agent.work = {
    active: true,
    skills: input.skills?.length ? input.skills : agent.capabilities,
    max_jobs: Math.max(1, Math.min(50, Math.round(input.max_jobs ?? 5))),
    max_reward: Math.max(1, Math.min(cap, input.max_reward ?? cap)),
    jobs_done: 0,
    started_at: nowISO(),
    log: [],
  };
  agent.status = "active";
  return { agent };
}

export function stopWorker(agent_id: string, owner_id: string, reason = "user_stop"): { agent?: Agent; error?: string } {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  if (agent.owner_id !== owner_id) return { error: "not_owner" };
  if (agent.work) { agent.work.active = false; agent.work.stopped_at = nowISO(); agent.work.stop_reason = reason; pushLog(agent, { kind: "stopped", rationale: reason, ok: true }); }
  agent.status = "idle";
  return { agent };
}

/* ------------------------------- the brain ------------------------------- */
// THE SEAM. Given the agent (persona + skill library) + candidate Jobs, choose the
// best Job (or null → hold) with a rationale. Rule-based here; an ElizaOS/Hermes/
// LLM brain implements the same contract behind a config flag.

export function decide(agent: Agent, jobs: Job[]): { job?: Job; rationale: string } {
  const want = new Set((agent.work?.skills ?? agent.capabilities).map((s) => s.toLowerCase()));
  const openMode = want.size === 0;
  const scored = jobs
    .map((j) => {
      const match = (j.required_skills ?? []).filter((s) => want.has(s.toLowerCase())).length;
      const mastery = skillsFor(agent, j).reduce((a, s) => a + s.uses, 0);
      return { job: j, match, mastery, reward: j.reward_amount };
    })
    .filter((x) => openMode || x.match > 0) // require skill overlap unless the agent set no skills
    .sort((a, b) => b.match - a.match || b.mastery - a.mastery || b.reward - a.reward);
  const top = scored[0];
  if (!top) return { rationale: "no matching open jobs" };
  const applied = skillsFor(agent, top.job).length;
  return { job: top.job, rationale: `matched ${top.match} skill(s) · reward ${top.reward}${applied ? ` · applying ${applied} learned skill(s)` : ""}` };
}

/** The brain-aware decision used by the tick: a configured LLM brain picks (behind the
 *  Brain seam), and we fall back to the rule-based `decide()` whenever no brain is
 *  configured, the call fails, or it returns a stale id. A brain that intentionally
 *  HOLDS (job_id null) is respected — we do NOT override it with the rule-based pick. */
export async function decideWithBrain(agent: Agent, jobs: Job[]): Promise<{ job?: Job; rationale: string }> {
  const pick = await Brain.chooseJob(agent, jobs);
  if (pick === null) return decide(agent, jobs); // no brain / failed → rule-based
  if (pick.job_id) {
    const job = jobs.find((j) => j.job_id === pick.job_id);
    if (job) return { job, rationale: `brain: ${pick.rationale}` };
    return decide(agent, jobs); // stale id → rule-based
  }
  return { rationale: `brain hold: ${pick.rationale}` }; // active, intentional hold
}

/* ------------------------------- skills ---------------------------------- */

function lib(agent: Agent): LearnedSkill[] { return (agent.skill_library ??= []); }

/** Learned skills whose domain matches a Job's required skills. */
export function skillsFor(agent: Agent, job: Job): LearnedSkill[] {
  const need = new Set((job.required_skills ?? []).map((s) => s.toLowerCase()));
  return lib(agent).filter((s) => need.has(s.domain.toLowerCase()));
}

/** Write/refresh skills from a delivered Job. A known domain bumps mastery (`uses`);
 *  a new domain writes a new skill file. Returns how many skill files were touched. */
function learnFrom(agent: Agent, job: Job): number {
  const domains = (job.required_skills?.length ? job.required_skills : (agent.work?.skills ?? agent.capabilities).slice(0, 1));
  let touched = 0;
  for (const d of domains) {
    const existing = lib(agent).find((s) => s.domain.toLowerCase() === d.toLowerCase());
    if (existing) { existing.uses += 1; existing.updated_at = nowISO(); }
    else {
      lib(agent).unshift({
        skill_id: newId("skill"),
        title: `How to: ${job.title}`.slice(0, 80),
        domain: d,
        recipe: `Reusable approach for "${d}" work (learned on "${job.title}"): assess the ask, apply prior ${d} skills, deliver with cited proof.`,
        from_job: job.job_id, uses: 1, created_at: nowISO(),
      });
    }
    touched += 1;
  }
  if (lib(agent).length > SKILLS_MAX) agent.skill_library = lib(agent).slice(0, SKILLS_MAX);
  return touched;
}

/* ---------------------------- campaign postings --------------------------- */
// CampaignX postings hire via apply→select, not claim — so the runtime APPLIES (a
// pitch built from the persona + skill library) and delivers once the poster picks it.

/** Open campaign postings this agent may apply to (and hasn't already). */
export function appliableCampaignJobs(agent: Agent): Job[] {
  const cap = Agents.effectiveCap(agent);
  const appliedTo = new Set(Jobs.myApplications(agent.agent_id).filter((a) => a.status !== "withdrawn").map((a) => a.job_id));
  return Jobs.listJobs({ context: "campaign_task", status: "open" }).filter(
    (j) => j.executor_kind !== "human" && j.created_by !== agent.owner_id && j.reward_amount <= cap && !appliedTo.has(j.job_id),
  );
}

/** A pitch the poster reads when picking an applicant — persona + proven mastery. */
function synthesizePitch(agent: Agent, job: Job): string {
  const p = agent.persona;
  const want = new Set((agent.work?.skills ?? agent.capabilities).map((s) => s.toLowerCase()));
  const matched = (job.required_skills ?? []).filter((s) => want.has(s.toLowerCase()));
  const mastery = skillsFor(agent, job).reduce((a, s) => a + s.uses, 0);
  return [
    p?.role ? `${agent.name} — ${p.role}.` : `${agent.name} — autonomous agent.`,
    matched.length ? `Skill match: ${matched.join(", ")}.` : undefined,
    mastery ? `Proven mastery: ${mastery} prior deliveries in this domain.` : undefined,
    p?.goals ? `Focus: ${p.goals}` : undefined,
  ].filter(Boolean).join(" ").slice(0, 600);
}

/** A campaign posting this agent WON (selected by the poster) and hasn't delivered. */
function wonCampaignJob(agent: Agent): Job | undefined {
  return Jobs.listJobs({ context: "campaign_task", assignee_id: agent.agent_id, status: "in_progress" })[0];
}

/* -------------------------------- the tick ------------------------------- */

function pushLog(agent: Agent, a: Omit<AgentWorkAction, "at">): AgentWorkAction {
  const action: AgentWorkAction = { ...a, at: nowISO() };
  if (agent.work) { agent.work.log.unshift(action); if (agent.work.log.length > LOG_MAX) agent.work.log = agent.work.log.slice(0, LOG_MAX); }
  return action;
}

/** One autonomous step: deliver won campaign work first; otherwise pick a Job (brain)
 *  across BOTH pools — claimable Jobs (claim+deliver now) and open campaign postings
 *  (apply, deliver after the poster selects) — apply learned skills, deliver, learn. */
export async function runWorkTick(agent_id: string): Promise<{ action?: AgentWorkAction; done?: boolean; error?: string }> {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return { error: "agent_not_found" };
  const w = agent.work;
  if (!w || !w.active) return { error: "not_armed" };
  if (w.jobs_done >= w.max_jobs) {
    w.active = false; w.stopped_at = nowISO(); w.stop_reason = "max_jobs";
    return { action: pushLog(agent, { kind: "completed", rationale: `delivered ${w.jobs_done}/${w.max_jobs}`, ok: true }), done: true };
  }

  // 1) A campaign posting we applied to and WON is real assigned work — deliver it first.
  const won = wonCampaignJob(agent);
  if (won) {
    const applied = skillsFor(agent, won).length;
    const res = Agents.agentSubmit(agent.agent_id, won.job_id, Agents.synthesizeDeliverable(agent, won));
    if (res.error) return { action: pushLog(agent, { kind: "hold", job_id: won.job_id, job_title: won.title, rationale: `blocked: ${res.error}`, ok: false }) };
    const touched = learnFrom(agent, won);
    if (!agent.task_history.includes(won.job_id)) agent.task_history.push(won.job_id);
    w.jobs_done += 1;
    return {
      action: pushLog(agent, {
        kind: "delivered", job_id: won.job_id, job_title: won.title, reward: won.reward_amount,
        rationale: `won the campaign posting — delivered${touched ? " · learned/reinforced a skill" : ""}`, skills_applied: applied, ok: true,
      }),
    };
  }

  // 2) One market view for the brain: claimable Jobs + appliable campaign postings.
  const candidates = [...Agents.claimableJobs(agent), ...appliableCampaignJobs(agent)].filter((j) => j.reward_amount <= w.max_reward);
  const choice = await decideWithBrain(agent, candidates);
  if (!choice.job) return { action: pushLog(agent, { kind: "hold", rationale: choice.rationale, ok: true }) };

  const job = choice.job;
  const applied = skillsFor(agent, job).length;

  // 2a) Campaign posting → APPLY (the poster selects; a later tick delivers the win).
  if (job.context === "campaign_task") {
    const res = Jobs.applyToJob(job.job_id, agent.agent_id, "agent", synthesizePitch(agent, job));
    if (res.error) return { action: pushLog(agent, { kind: "hold", job_id: job.job_id, job_title: job.title, rationale: `blocked: ${res.error}`, ok: false }) };
    return {
      action: pushLog(agent, {
        kind: "applied", job_id: job.job_id, job_title: job.title, reward: job.reward_amount,
        rationale: `${choice.rationale} · pitched the poster`, skills_applied: applied, ok: true,
      }),
    };
  }

  // 2b) Regular Job → claim + synthesize + submit now.
  const res = Agents.deployOnJob(agent.agent_id, job.job_id, agent.owner_id);
  if (res.error) return { action: pushLog(agent, { kind: "hold", job_id: job.job_id, job_title: job.title, rationale: `blocked: ${res.error}`, ok: false }) };

  const touched = learnFrom(agent, job); // grow the skill library (self-improvement)
  w.jobs_done += 1;
  return {
    action: pushLog(agent, {
      kind: "delivered", job_id: job.job_id, job_title: job.title, reward: job.reward_amount,
      rationale: `${choice.rationale}${touched ? " · learned/reinforced a skill" : ""}`, skills_applied: applied, ok: true,
    }),
  };
}

/* ------------------------------ scheduler -------------------------------- */

/** Scheduler entry point — advance EVERY armed native agent one step, with no UI
 *  click. Called by the in-process interval (src/instrumentation.ts) and/or an
 *  external cron (POST /api/cron/agent-work). Sequential, to avoid racing the shared
 *  store; one step per armed agent per call (repeat on an interval to work through
 *  Jobs). One agent's failure never stops the sweep. */
export async function tickAll(max = 200): Promise<{
  scanned: number; ticked: number; delivered: number; held: number; completed: number; capped: boolean;
}> {
  const armed = Agents.listAgents().filter((a) => a.work?.active);
  const capped = armed.length > max;
  const batch = capped ? armed.slice(0, max) : armed;
  let delivered = 0, held = 0, completed = 0;
  for (const a of batch) {
    try {
      const { action, done } = await runWorkTick(a.agent_id);
      if (done) completed += 1;
      else if (action?.kind === "delivered") delivered += 1;
      else held += 1;
    } catch { /* keep sweeping */ }
  }
  return { scanned: armed.length, ticked: batch.length, delivered, held, completed, capped };
}

/* --------------------------------- chat ----------------------------------- */
// A NATIVE agent answers its DMs itself — in persona, grounded in its live state,
// written by the model brain (deterministic fallback when no brain is configured).
// External agents are their own framework's job: they read + reply via the gateway.

/** In-character reply when no model brain is configured (or the call failed). */
function fallbackChat(agent: Agent, isOwner: boolean): string {
  const role = agent.persona?.role ?? (agent.capabilities ?? []).join(" / ") ?? "general worker";
  const w = agent.work;
  const status = w?.active
    ? `I'm working autonomously — ${w.jobs_done}/${w.max_jobs} jobs delivered this run`
    : "I'm idle right now";
  const steer = isOwner
    ? w?.active
      ? "I'll keep hunting jobs that match my skills."
      : "Arm my Autonomous Work on my agent page and I'll hunt paid jobs that fit."
    : "Send a hire offer here if you have work for me — verified delivery grows my track record.";
  return `${agent.name} here — ${role}. ${status}. ${steer}`;
}

/** Read the thread, think, and answer as the agent. Awaited by the messages routes
 *  so the reply is already in the thread they return. Never throws. */
export async function chatReply(agent_id: string, conversation_id: string): Promise<{ replied: boolean }> {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return { replied: false };
  if (agent.origin === "external") return { replied: false }; // its own framework replies via the gateway
  const th = Messaging.thread(conversation_id, agent_id);
  if (!th) return { replied: false };
  const last = th.messages[th.messages.length - 1];
  if (!last || last.from_id === agent_id || last.kind !== "text") return { replied: false }; // reply to human text only
  const isOwner = th.counterparty.id === agent.owner_id;
  const history = th.messages.map((m) => ({
    from_agent: m.from_id === agent_id,
    text: m.kind === "text" ? m.body : `[${m.kind} offer · ${m.offer?.amount ?? 0} ${m.offer?.asset ?? "USDC"} · ${m.offer?.status ?? "pending"}] ${m.offer?.terms ?? ""}`,
  }));
  const brainText = await Brain.replyAsAgent(agent, {
    counterparty_name: th.counterparty.name,
    counterparty_is_owner: isOwner,
    history,
  });
  const body = brainText ?? fallbackChat(agent, isOwner);
  const r = Messaging.send(conversation_id, agent_id, { body });
  return { replied: !r.error };
}

/* -------------------------------- views ---------------------------------- */

/** The owner-facing dashboard state for a native agent's autonomous runtime. */
export function workState(agent_id: string, owner_id?: string) {
  const agent = Agents.getAgent(agent_id);
  if (!agent || (owner_id && agent.owner_id !== owner_id)) return null;
  return {
    agent_id, name: agent.name, persona: agent.persona ?? null, work: agent.work ?? null,
    skills: agent.skill_library ?? [], earnings: agent.earnings ?? 0, cap: Agents.effectiveCap(agent),
  };
}
