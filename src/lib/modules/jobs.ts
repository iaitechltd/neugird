/**
 * Jobs — the universal work protocol:
 *   describe → assign → execute → submit proof → verify → pay → reputation
 *
 * One primitive for talent contracts, SubGrid tasks, and campaign deliverables
 * (human or agent executors). Pre-treasury, "pay" = award the assignee
 * reputation Pulse equal to the quality-weighted reward — the FIRST place real
 * builder reputation is earned, by verified work rather than a click.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Referrals from "./referrals";
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { Application, ExecutorType, Job, JobContext, JobStatus, ProofType, Settlement } from "../types";

/* --------------------------- USDC escrow (x402) --------------------------- */
// A USDC-funded Job (reward_token "USDC") locks the reward in a protocol escrow
// account at post time; it releases to the worker on approval (a real on-chain
// receipt) or refunds the funder on rejection. Tracked via the settlements ledger
// (the same rail x402 uses) — no Job-schema change, and it's Stage-B-anchorable.
export const JOB_ESCROW = "neugrid:escrow";

function recordReceipt(payer: string, payee: string, resource: string, amount: number): void {
  (db.settlements ??= []).push({
    settlement_id: newId("setl"), payer_id: payer, payee, resource,
    amount, asset: "USDC", network: "solana", scheme: "exact",
    proof: newId("rcpt"), status: "settled", created_at: nowISO(),
  } as Settlement);
}

/** The still-held escrow for a Job (funder + amount), or null if none / already settled. */
function heldEscrow(job_id: string): { funder: string; amount: number } | null {
  const led = db.settlements ?? [];
  const dep = led.find((s) => s.resource === `job_escrow:${job_id}` && s.payee === JOB_ESCROW);
  if (!dep) return null;
  const done = led.some((s) => s.resource === `job_payout:${job_id}` || s.resource === `job_refund:${job_id}`);
  return done ? null : { funder: dep.payer_id, amount: dep.amount };
}
/** Public: the escrow still locked on a job (for the dispute layer's UI + gates). */
export function heldEscrowFor(job_id: string): { funder: string; amount: number } | null {
  return heldEscrow(job_id);
}

const disputeWindowMs = () => Params.get("dispute_window_days") * 86_400_000;

/**
 * The FINAL effects of a rejection: fade the worker's reputation, slash an
 * agent's bond, and refund the escrow to the funder. Deferred for escrowed jobs
 * (applied only once the dispute window lapses undisputed OR a dispute is
 * dismissed) so a worker can contest an unfair rejection before losing anything.
 * Idempotent by construction — the refund no-ops once the escrow is settled.
 */
export function applyRejectionEffects(job_id: string, reviewer_id: string): void {
  const job = getJob(job_id);
  if (!job || !job.assignee_id) return;
  const esc = heldEscrow(job.job_id);
  if (job.reward_token === "USDC" && job.reward_amount > 0 && !esc) return; // already finalized
  const penalty = -Math.max(5, Math.round((esc?.amount ?? job.reward_amount) * 0.4));
  Pulse.recordEvent({
    target_type: job.assignee_type === "agent" ? "agent" : "user",
    target_id: job.assignee_id,
    user_id: reviewer_id,
    action_type: "submission_rejected",
    weight: penalty,
    reason: `Delivery rejected on "${job.title}"`,
    verification_source: `reviewer:${reviewer_id}`,
    dimension: job.assignee_type === "agent" ? "agent" : "builder",
  });
  if (job.assignee_type === "agent") {
    const agent = db.agents.find((a) => a.agent_id === job.assignee_id);
    if (agent) {
      agent.bond_amount = Math.max(0, (agent.bond_amount ?? 0) - 100);
      if (agent.trust_tier === "trusted") agent.trust_tier = "probation";
      agent.rating = Math.round(Math.min(5, (agent.rating || 0) * 0.7) * 10) / 10;
    }
  }
  if (esc) {
    // Conservation guard: only refund the funder if the escrow wallet actually held
    // (and released) the funds. Crediting without a successful debit would mint USDC.
    if (Wallets.debitUsdc(JOB_ESCROW, esc.amount)) {
      Wallets.creditUsdc(esc.funder, esc.amount);
      recordReceipt(JOB_ESCROW, esc.funder, `job_refund:${job.job_id}`, esc.amount);
    } else {
      console.error(`[jobs] escrow refund skipped — JOB_ESCROW short of ${esc.amount} USDC for job ${job.job_id}; funder ${esc.funder} NOT credited`);
    }
  }
  job.dispute_deadline = undefined;
  job.updated_at = nowISO();
}

/** Pay a worker + award the earned reputation on a dispute UPHELD — a contested
 *  rejection overturned by the evaluator panel. Reuses the normal approval path
 *  (real-escrow basis + pairwise decay + rating), attributed to "system:dispute". */
export function payWorkerOnUpheld(job_id: string): Job | undefined {
  const job = getJob(job_id);
  if (!job) return undefined;
  job.status = "submitted"; // reviewJob's approve path requires a submitted job
  job.dispute_deadline = undefined;
  return reviewJob(job_id, { reviewer_id: "system:dispute", approve: true, quality_score: 80 });
}

/* --- Anti-farm: reputation from delivered work must reflect REAL, non-circular
 * value, or a sockpuppet pair (A posts, B delivers, A approves) mints unbounded
 * free reputation → GRID allocation → ownership. Three layers, all here so the
 * invariant lives at the module boundary, not in scattered route checks:
 *  (1) the reputation BASIS is the escrow actually funded+released (real money
 *      that moved), NOT the nominal `reward_amount` a poster can type unbacked;
 *      an unfunded job confers only a small flat delivery credit.
 *  (2) repeated approvals between the SAME creator→worker principal DECAY toward
 *      zero (1, ½, ⅓, …) — so even cycling real USDC can't wash rep at scale.
 *  (3) a self-dealt approval (reviewer == worker principal) mints NOTHING. */
const UNFUNDED_DELIVERY_PULSE = 5; // flat rep for delivering an unbacked (Pulse) job

/** The economic principal behind a job's worker (an agent's owner, else the user). */
/** Resolve any actor id to its HUMAN principal: an agent → its owner, else itself.
 *  Both sides of a self-deal check must be principals — the agent-gateway review
 *  route passes an AGENT id as the reviewer, so comparing raw ids let an owner
 *  farm reputation across their own poster + worker agents. */
function principalOf(id: string): string {
  return db.agents.find((a) => a.agent_id === id)?.owner_id ?? id;
}
function workerPrincipalOf(job: Job): string | undefined {
  if (!job.assignee_id) return undefined;
  return job.assignee_type === "agent" ? principalOf(job.assignee_id) : job.assignee_id;
}
/** Distinct OTHER creator-principals who have paid this worker principal — the
 *  worker's income diversity. 0 = this worker only ever earns from one creator
 *  (the sybil-ring signature). */
function otherPayersOf(worker_principal: string, creatorPrincipal: string, except_job: string): number {
  const payers = new Set<string>();
  for (const j of db.jobs) {
    if (j.job_id === except_job || j.status !== "paid") continue;
    if (workerPrincipalOf(j) !== worker_principal) continue;
    const cp = principalOf(j.created_by);
    if (cp !== creatorPrincipal) payers.add(cp);
  }
  return payers.size;
}
/** The decay basis for a (creator → worker) approval. Normally the count of prior
 *  paid jobs on this exact pair (so repeat business with ONE worker decays). But a
 *  farmer evades that by rotating fresh sockpuppet WORKERS — so when the worker has
 *  NO independent income (its only payer is this creator = the ring signature), we
 *  ALSO decay by how many such single-payer workers this creator already paid. A
 *  worker with any other real client is treated as legit and only pair-decayed, so
 *  a genuine employer of many independent freelancers is never penalised. */
function priorApprovedBetween(creator_id: string, worker_principal: string, except_job: string): number {
  const creatorPrincipal = principalOf(creator_id);
  const pair = db.jobs.filter((j) =>
    j.job_id !== except_job && j.status === "paid" &&
    principalOf(j.created_by) === creatorPrincipal && workerPrincipalOf(j) === worker_principal,
  ).length;
  if (otherPayersOf(worker_principal, creatorPrincipal, except_job) > 0) return pair; // independent income → legit
  const ring = new Set<string>();
  for (const j of db.jobs) {
    if (j.job_id === except_job || j.status !== "paid" || principalOf(j.created_by) !== creatorPrincipal) continue;
    const wp = workerPrincipalOf(j);
    if (wp && wp !== worker_principal && otherPayersOf(wp, creatorPrincipal, except_job) === 0) ring.add(wp);
  }
  return Math.max(pair, ring.size);
}
const pairwiseDecay = (priorPaid: number) => 1 / (1 + priorPaid); // 1, ½, ⅓, ¼ …

export interface JobFilter {
  context?: JobContext;
  grid_id?: string;
  subgrid_id?: string;
  status?: JobStatus;
  assignee_id?: string;
  created_by?: string;
}

export function listJobs(filter: JobFilter = {}): Job[] {
  return db.jobs.filter(
    (j) =>
      (!filter.context || j.context === filter.context) &&
      (!filter.grid_id || j.grid_id === filter.grid_id) &&
      (!filter.subgrid_id || j.subgrid_id === filter.subgrid_id) &&
      (!filter.status || j.status === filter.status) &&
      (!filter.assignee_id || j.assignee_id === filter.assignee_id) &&
      (!filter.created_by || j.created_by === filter.created_by)
  );
}

export function getJob(id: string): Job | undefined {
  return db.jobs.find((j) => j.job_id === id);
}

export interface CreateJobInput {
  context?: JobContext;
  grid_id?: string;
  subgrid_id?: string;
  campaign_id?: string;
  title: string;
  description: string;
  required_skills?: string[];
  executor_kind?: "human" | "agent" | "any";
  reward_amount: number;
  reward_token?: string;
  proof_required?: ProofType;
  created_by: string;
}

export function createJob(input: CreateJobInput): Job {
  const job: Job = {
    job_id: newId("job"),
    context: input.context ?? "talent_contract",
    grid_id: input.grid_id,
    subgrid_id: input.subgrid_id,
    campaign_id: input.campaign_id,
    title: input.title,
    description: input.description,
    required_skills: input.required_skills ?? [],
    executor_kind: input.executor_kind ?? "any",
    reward_amount: input.reward_amount,
    reward_token: input.reward_token ?? "Pulse",
    proof_required: input.proof_required ?? "link",
    status: "open",
    created_by: input.created_by,
    created_at: nowISO(),
  };
  db.jobs.unshift(job);
  return job;
}

/** Lock a job's reward in escrow from `funder_id` (accepted hire offers use this —
 *  the same debit → JOB_ESCROW → receipt shape as postFundedJob/selectApplicant). */
export function fundJobEscrow(job_id: string, funder_id: string): { escrow_id?: string; error?: string } {
  const job = getJob(job_id);
  if (!job) return { error: "not_found" };
  if (job.escrow_id) return { escrow_id: job.escrow_id }; // already funded
  if (!(job.reward_amount > 0)) return { error: "invalid_reward" };
  if (!Wallets.debitUsdc(funder_id, job.reward_amount)) return { error: "insufficient_usdc" };
  Wallets.creditUsdc(JOB_ESCROW, job.reward_amount);
  job.escrow_id = newId("esc");
  recordReceipt(funder_id, JOB_ESCROW, `job_escrow:${job.job_id}`, job.reward_amount);
  return { escrow_id: job.escrow_id };
}

/** Post a USDC-funded Job: escrow the reward from `funder_id` up front, then
 *  create the Job (reward_token "USDC"). The reward releases to the worker on
 *  approval, or refunds on rejection. Used by agents posting paid work. */
export function postFundedJob(input: CreateJobInput, funder_id: string): { job?: Job; error?: string } {
  const amount = input.reward_amount;
  if (!(amount > 0)) return { error: "invalid_reward" };
  if (!Wallets.debitUsdc(funder_id, amount)) return { error: "insufficient_usdc" };
  Wallets.creditUsdc(JOB_ESCROW, amount);
  const job = createJob({ ...input, reward_token: "USDC" });
  job.escrow_id = newId("esc");
  recordReceipt(funder_id, JOB_ESCROW, `job_escrow:${job.job_id}`, amount);
  return { job };
}

export function claimJob(id: string, user_id: string, type: ExecutorType = "user"): Job | undefined {
  const job = getJob(id);
  if (!job || job.status !== "open") return undefined;
  if (principalOf(job.created_by) === principalOf(user_id)) return undefined; // can't claim your own posting (self-review farm) — principal-resolved so a same-owner agent can't either
  job.assignee_id = user_id;
  job.assignee_type = type;
  job.status = "in_progress";
  job.updated_at = nowISO();
  return job;
}

/* --------------------------- apply → select --------------------------- */
// Campaign postings (context "campaign_task") hire via APPLICATION + SELECTION, not
// first-come claim: workers (human or agent) apply with a pitch, the poster reviews and
// selects one, which assigns the Job. Escrow-lock-on-select is the next step.

/** Case-insensitive overlap between what the job asks for and what the applicant has. */
export function skillMatch(required: string[] | undefined, have: string[] | undefined): { matched: string[]; count: number } {
  const set = new Set((have ?? []).map((s) => s.toLowerCase()));
  const matched = (required ?? []).filter((s) => set.has(s.toLowerCase()));
  return { matched, count: matched.length };
}

export function applyToJob(job_id: string, applicant_id: string, applicant_type: ExecutorType, pitch: string): { application?: Application; error?: string } {
  const job = getJob(job_id);
  if (!job) return { error: "job_not_found" };
  if (job.status !== "open") return { error: "not_open" };
  // No self-dealing: resolve BOTH sides to their human principal (an agent → its
  // owner) so neither an applicant agent nor a same-owner poster agent can hire
  // itself and farm employer trust + worker reputation.
  if (principalOf(job.created_by) === principalOf(applicant_id)) return { error: "cannot_apply_own" };
  const kind = job.executor_kind ?? "any";
  if (kind === "human" && applicant_type !== "user") return { error: "humans_only" };
  if (kind === "agent" && applicant_type !== "agent") return { error: "agents_only" };
  if (db.applications.some((a) => a.job_id === job_id && a.applicant_id === applicant_id && a.status !== "withdrawn"))
    return { error: "already_applied" };
  const application: Application = {
    application_id: newId("app"),
    job_id,
    applicant_id,
    applicant_type,
    pitch: (pitch ?? "").trim().slice(0, 600),
    status: "pending",
    created_at: nowISO(),
  };
  db.applications.unshift(application);
  return { application };
}

export function listApplications(job_id: string): Application[] {
  return db.applications.filter((a) => a.job_id === job_id);
}
export function myApplications(applicant_id: string): Application[] {
  return db.applications.filter((a) => a.applicant_id === applicant_id);
}

/** The poster selects one applicant → that application is 'selected', the rest 'rejected',
 *  and the Job is assigned to them and moves to in_progress. Creator-only. */
export function selectApplicant(job_id: string, application_id: string, creator_id: string): { job?: Job; error?: string } {
  const job = getJob(job_id);
  if (!job) return { error: "job_not_found" };
  if (job.created_by !== creator_id) return { error: "not_creator" };
  if (job.status !== "open") return { error: "not_open" };
  const app = db.applications.find((a) => a.application_id === application_id && a.job_id === job_id);
  if (!app) return { error: "application_not_found" };
  // Lock the reward in escrow at selection (USDC postings): the poster's funds are held
  // until delivery, then released to the worker on approval / refunded on rejection
  // (see reviewJob). Insufficient funds blocks selection before anything is assigned.
  if ((job.reward_token ?? "") === "USDC" && job.reward_amount > 0 && !heldEscrow(job.job_id)) {
    if (!Wallets.debitUsdc(creator_id, job.reward_amount)) return { error: "insufficient_usdc" };
    Wallets.creditUsdc(JOB_ESCROW, job.reward_amount);
    job.escrow_id = newId("esc");
    recordReceipt(creator_id, JOB_ESCROW, `job_escrow:${job.job_id}`, job.reward_amount);
  }
  const at = nowISO();
  app.status = "selected";
  app.updated_at = at;
  for (const other of db.applications) {
    if (other.job_id === job_id && other.application_id !== application_id && other.status === "pending") {
      other.status = "rejected";
      other.updated_at = at;
    }
  }
  job.assignee_id = app.applicant_id;
  job.assignee_type = app.applicant_type;
  job.status = "in_progress";
  job.updated_at = at;
  return { job };
}

export function submitProof(id: string, user_id: string, payload: string): Job | undefined {
  const job = getJob(id);
  if (!job || job.assignee_id !== user_id) return undefined;
  if (!["in_progress", "assigned", "rejected"].includes(job.status)) return undefined;
  job.proof = { kind: job.proof_required, payload, submitted_at: nowISO() };
  job.status = "submitted";
  job.updated_at = nowISO();
  return job;
}

export interface ReviewInput {
  reviewer_id: string;
  approve: boolean;
  quality_score?: number;
  reason?: string;
}

export function reviewJob(id: string, input: ReviewInput): Job | undefined {
  const job = getJob(id);
  if (!job || job.status !== "submitted") return undefined;
  const quality = input.quality_score ?? 80;
  job.verification = {
    method: "staked_review",
    outcome: input.approve ? "approved" : "rejected",
    quality_score: quality,
    reviewer_stakes: [
      {
        reviewer_id: input.reviewer_id,
        verdict: input.approve ? "approve" : "reject",
        staked_pulse: 0,
        reason: input.reason ?? (input.approve ? "Approved" : "Rejected"),
        created_at: nowISO(),
      },
    ],
    decided_at: nowISO(),
  };
  job.updated_at = nowISO();

  if (!input.approve) {
    job.status = "rejected";
    // For an ESCROWED job the worker may CONTEST the rejection: defer the penalty +
    // refund until the dispute window lapses (Disputes.sweepExpired) or a dispute
    // resolves. This gives a neutral, reputation-staked evaluator panel the final
    // say instead of the payer alone. Non-escrowed (Pulse) jobs finalize now.
    if (heldEscrow(job.job_id)) {
      job.dispute_deadline = new Date(Date.now() + disputeWindowMs()).toISOString();
    } else {
      applyRejectionEffects(job.job_id, input.reviewer_id);
    }
    return job;
  }

  job.status = "paid"; // pre-treasury: pay = reputation Pulse

  // Anti-farm reputation basis (see the helpers above): weight from the REAL
  // escrow (money that actually moved), not the typed reward; unfunded → a flat
  // delivery credit; decayed by prior same-pair deliveries; ZERO if self-dealt.
  const escrowHeld = heldEscrow(job.job_id); // read BEFORE the payout settles it
  const worker_principal = workerPrincipalOf(job);
  const self_dealt = !!worker_principal && worker_principal === principalOf(input.reviewer_id);
  const basis = (escrowHeld?.amount ?? 0) > 0 ? (escrowHeld as { amount: number }).amount : 0;
  const earned = basis > 0
    ? Pulse.weightForApproval(basis, quality)
    : { weight: UNFUNDED_DELIVERY_PULSE, reason: "unfunded delivery" };
  const decay = worker_principal ? pairwiseDecay(priorApprovedBetween(job.created_by, worker_principal, job.job_id)) : 1;
  const repWeight = Math.max(1, Math.round(earned.weight * decay));
  const repReason = basis > 0 ? `${earned.reason}${decay < 1 ? ` × ${decay.toFixed(2)} repeat-pair` : ""}` : earned.reason;

  if (self_dealt) {
    // reviewer IS the worker — self-review earns no reputation, rating, or credential.
    // (Public routes already block this at claim/apply/deploy; this is the boundary guard.)
  } else if (job.assignee_id && job.assignee_type !== "agent") {
    Referrals.checkVerify(job.assignee_id); // a paid delivery = a verified first action
    Pulse.recordEvent({
      target_type: "user",
      target_id: job.assignee_id,
      user_id: input.reviewer_id,
      action_type: "job_delivered",
      weight: repWeight,
      reason: `Job "${job.title}" approved · ${repReason}`,
      verification_source: `reviewer:${input.reviewer_id}`,
      dimension: "builder",
    });
  } else if (job.assignee_id && job.assignee_type === "agent") {
    // The agent earns reputation + a rating from verified work.
    Pulse.recordEvent({
      target_type: "agent",
      target_id: job.assignee_id,
      action_type: "job_delivered",
      weight: repWeight,
      reason: `Job "${job.title}" approved · ${repReason}`,
      verification_source: `reviewer:${input.reviewer_id}`,
      dimension: "agent",
    });
    const agent = db.agents.find((a) => a.agent_id === job.assignee_id);
    if (agent) {
      agent.rating = Math.round(Math.min(5, (agent.rating || 0) * 0.7 + (quality / 100) * 5 * 0.3) * 10) / 10;
      // GRID allocation is NOT mutated here — `Rewards` derives the owner's earned
      // allocation from the agent's `job_delivered` Pulse event above (one source
      // of truth for both reputation + reward; see rewards.ts).
    }
  }
  // Economic split: an agent's cash earnings track the REAL reward that settled,
  // not a self-dealt/unfunded number. (Kept out of the rep guard so a legitimately
  // funded job still pays the split even on the rare self-review edge.)
  if (job.assignee_id && job.assignee_type === "agent") {
    const agent = db.agents.find((a) => a.agent_id === job.assignee_id);
    if (agent && basis > 0) {
      const bps = Math.min(10000, Math.max(0, agent.owner_split_bps ?? 0));
      const ownerCut = Math.round((basis * bps) / 10000);
      agent.earnings = (agent.earnings ?? 0) + Math.max(0, basis - ownerCut);
    }
  }

  // USDC-funded Job: release the escrow to the worker (real money + an on-chain
  // receipt) on top of the reputation Pulse above. An agent worker's payout goes
  // to its owner's wallet (the economic principal).
  const esc = heldEscrow(job.job_id);
  if (esc && job.assignee_id) {
    const worker = job.assignee_type === "agent"
      ? (db.agents.find((a) => a.agent_id === job.assignee_id)?.owner_id ?? job.assignee_id)
      : job.assignee_id;
    // Conservation guard: only pay the worker if the escrow wallet actually held
    // (and released) the funds. Crediting without a successful debit would mint USDC.
    if (Wallets.debitUsdc(JOB_ESCROW, esc.amount)) {
      Wallets.creditUsdc(worker, esc.amount);
      recordReceipt(JOB_ESCROW, worker, `job_payout:${job.job_id}`, esc.amount);
    } else {
      console.error(`[jobs] escrow release skipped — JOB_ESCROW short of ${esc.amount} USDC for job ${job.job_id}; worker ${worker} NOT credited`);
    }
  }

  // V6 — employer trust: a project that pays fairly on delivery earns reputation for
  // its Grid. (The down-side — ghosting a delivery — is applied by the reputation sweep.)
  if (job.context === "campaign_task" && job.grid_id && !self_dealt && !input.reviewer_id.startsWith("system")) {
    Pulse.recordEvent({
      target_type: "grid",
      target_id: job.grid_id,
      user_id: input.reviewer_id,
      action_type: "campaign_completed",
      // weight from the REAL settled escrow, never the TYPED reward_amount, and
      // reward_excluded = employer-trust REPUTATION only, never GRID allocation.
      // Without both, a poster typed a huge reward + self-approved a sockpuppet
      // delivery to mint unbounded ownership at zero cost.
      weight: Math.max(8, Math.round(basis / 300)),
      reason: `Paid a promotional job on delivery: "${job.title}"`,
      verification_source: "auto",
      reward_excluded: true,
    });
  }
  return job;
}
