/**
 * Disputes — a reputation-staked evaluator network that adjudicates contested
 * job rejections (the "staked network of evaluators" pattern, adapted to
 * NeuGrid's merit model).
 *
 * The problem: the payer alone judges whether a delivery is valid, so an unfair
 * rejection strands the worker with no recourse. Here, when an ESCROWED job is
 * rejected, the worker may CONTEST it. A panel of reputation-staked evaluators
 * (independent Verifiers — not the payer, not the worker) reviews the deliverable
 * and votes; each stakes their reputation on their verdict. At quorum the
 * majority (reputation-weighted) verdict is BINDING:
 *   - upheld  → the escrow releases to the worker + the earned reputation is
 *               awarded (the delivery was valid after all);
 *   - dismissed → the rejection finalizes (refund the payer, fade the worker).
 * Evaluators who voted WITH the outcome earn a little reviewer reputation; those
 * who voted AGAINST it are slashed — skin in the game keeps the panel honest.
 *
 * v1 scope: escrowed jobs. The rejection's effects (penalty + refund) are
 * DEFERRED by jobs.reviewJob until the window lapses or a dispute resolves.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Jobs from "./jobs";
import * as Pulse from "./pulse";
import * as Params from "./params";
import * as Attestations from "./attestations";
import type { Dispute, DisputeVerdict } from "../types";

const EVALUATOR_MIN_REP = 100; // only proven members adjudicate (same bar as proposing)
const WINNER_PULSE = 5; // voted WITH the panel → a little reviewer reputation
const LOSER_PULSE = -12; // voted AGAINST the outcome → faded harder than the reward (skin in the game)

const quorum = () => Params.get("dispute_quorum");
export function reputationOf(user_id: string): number {
  return db.users.find((u) => u.id === user_id)?.reputation?.total ?? 0;
}

export function getDispute(id: string): Dispute | undefined {
  return db.disputes.find((d) => d.dispute_id === id);
}
export function forSubject(subject_id: string): Dispute | undefined {
  return db.disputes.find((d) => d.subject_id === subject_id);
}
export function listOpen(): Dispute[] {
  return db.disputes.filter((d) => d.status === "open");
}
export function myVote(dispute_id: string, evaluator_id: string): DisputeVerdict | null {
  return getDispute(dispute_id)?.votes.find((v) => v.evaluator_id === evaluator_id)?.verdict ?? null;
}

/** Can this user contest job `job_id` right now? (worker of a rejected, still-
 *  escrowed job, inside the window, not already disputed). */
export function canDispute(job_id: string, user_id: string): { ok: boolean; reason?: string } {
  const job = Jobs.getJob(job_id);
  if (!job) return { ok: false, reason: "no_job" };
  if (job.status !== "rejected") return { ok: false, reason: "not_rejected" };
  if (job.assignee_id !== user_id) return { ok: false, reason: "not_worker" };
  if (!Jobs.heldEscrowFor(job_id)) return { ok: false, reason: "no_escrow" }; // nothing at stake / already settled
  if (forSubject(job_id)) return { ok: false, reason: "already_disputed" };
  if (job.dispute_deadline && Date.parse(job.dispute_deadline) < Date.now()) return { ok: false, reason: "window_closed" };
  return { ok: true };
}

/** The worker opens a dispute over a rejected escrowed job. */
export function openDispute(job_id: string, raised_by: string, reason: string): { dispute?: Dispute; error?: string } {
  const gate = canDispute(job_id, raised_by);
  if (!gate.ok) return { error: gate.reason };
  const job = Jobs.getJob(job_id)!;
  const esc = Jobs.heldEscrowFor(job_id);
  const dispute: Dispute = {
    dispute_id: newId("disp"),
    subject_type: "job",
    subject_id: job_id,
    raised_by,
    against: job.created_by,
    amount: esc?.amount,
    reason: (reason ?? "").trim().slice(0, 600) || "Rejection contested",
    status: "open",
    votes: [],
    quorum: quorum(),
    created_at: nowISO(),
  };
  db.disputes.unshift(dispute);
  job.status = "disputed";
  job.updated_at = nowISO();
  return { dispute };
}

/** Is `user_id` allowed to evaluate this dispute? (independent + proven + hasn't voted). */
export function eligibleEvaluator(dispute: Dispute, user_id: string): { ok: boolean; reason?: string } {
  if (dispute.status !== "open") return { ok: false, reason: "not_open" };
  if (user_id === dispute.raised_by || user_id === dispute.against) return { ok: false, reason: "not_independent" };
  if (reputationOf(user_id) < EVALUATOR_MIN_REP) return { ok: false, reason: "insufficient_reputation" };
  if (dispute.votes.some((v) => v.evaluator_id === user_id)) return { ok: false, reason: "already_voted" };
  return { ok: true };
}

/** An evaluator stakes their reputation on a verdict; resolves automatically at quorum. */
export function castVerdict(dispute_id: string, evaluator_id: string, forWorker: boolean, reason?: string): { dispute?: Dispute; resolved?: boolean; error?: string } {
  const dispute = getDispute(dispute_id);
  if (!dispute) return { error: "not_found" };
  const gate = eligibleEvaluator(dispute, evaluator_id);
  if (!gate.ok) return { error: gate.reason };
  dispute.votes.push({
    evaluator_id,
    verdict: forWorker ? "for_worker" : "for_creator",
    weight: Math.max(1, reputationOf(evaluator_id)), // reputation-weighted, min 1
    reason: (reason ?? "").trim().slice(0, 400) || undefined,
    at: nowISO(),
  });
  if (dispute.votes.length >= dispute.quorum) return { dispute, resolved: resolve(dispute) };
  return { dispute, resolved: false };
}

/** Tally the reputation-weighted verdict, settle it BINDINGLY, and reward/slash
 *  the panel. Returns true when it resolved. */
export function resolve(dispute: Dispute): boolean {
  if (dispute.status !== "open") return false;
  const forWorker = dispute.votes.filter((v) => v.verdict === "for_worker").reduce((s, v) => s + v.weight, 0);
  const forCreator = dispute.votes.filter((v) => v.verdict === "for_creator").reduce((s, v) => s + v.weight, 0);
  const workerWins = forWorker > forCreator; // a tie favors the payer's original call (rejection stands)
  const winning: DisputeVerdict = workerWins ? "for_worker" : "for_creator";
  dispute.status = workerWins ? "upheld" : "dismissed";
  dispute.outcome = { for_worker: forWorker, for_creator: forCreator };
  dispute.resolved_at = nowISO();
  dispute.resolution = workerWins
    ? "Panel upheld the worker — delivery was valid; escrow released."
    : "Panel dismissed the dispute — the rejection stands.";

  // Reward the evaluators who called it right; slash those who didn't (skin in the game).
  for (const v of dispute.votes) {
    const right = v.verdict === winning;
    Pulse.recordEvent({
      target_type: "user",
      target_id: v.evaluator_id,
      action_type: right ? "dispute_evaluated" : "dispute_slashed",
      weight: right ? WINNER_PULSE : LOSER_PULSE,
      reason: right ? "Evaluated a dispute with the panel" : "Evaluated a dispute against the outcome",
      verification_source: `dispute:${dispute.dispute_id}`,
      dimension: "reviewer",
      reward_excluded: true, // reviewer REPUTATION only — never GRID allocation (no panel-collusion farm)
    });
  }

  // Binding settlement.
  const job = Jobs.getJob(dispute.subject_id);
  if (workerWins) {
    Jobs.payWorkerOnUpheld(dispute.subject_id); // pays the escrow + awards the earned reputation
    if (job?.assignee_id) Attestations.mintNew(job.assignee_id, job.assignee_type === "agent" ? "agent" : "user");
  } else {
    Jobs.applyRejectionEffects(dispute.subject_id, dispute.against); // refund payer + fade worker (final)
  }
  return true;
}

/** Cron/lazy sweep: finalize rejected escrowed jobs whose window lapsed with NO
 *  dispute (the payer's rejection stands by default), and resolve any dispute
 *  that reached quorum but wasn't settled. */
export function sweepExpired(): { finalized: number; resolved: number } {
  let finalized = 0;
  let resolved = 0;
  const now = Date.now();
  for (const job of db.jobs) {
    if (job.status === "rejected" && job.dispute_deadline && Date.parse(job.dispute_deadline) <= now && !forSubject(job.job_id) && Jobs.heldEscrowFor(job.job_id)) {
      Jobs.applyRejectionEffects(job.job_id, job.created_by);
      finalized++;
    }
  }
  for (const d of db.disputes) {
    if (d.status === "open" && d.votes.length >= d.quorum && resolve(d)) resolved++;
  }
  return { finalized, resolved };
}

/** A dispute enriched for the UI (identities + subject job). */
export function view(d: Dispute) {
  const job = Jobs.getJob(d.subject_id);
  const nameOf = (id: string) => db.users.find((u) => u.id === id)?.username ?? id;
  return {
    ...d,
    worker: nameOf(d.raised_by),
    creator: nameOf(d.against),
    job_title: job?.title ?? d.subject_id,
    for_worker_votes: d.votes.filter((v) => v.verdict === "for_worker").length,
    for_creator_votes: d.votes.filter((v) => v.verdict === "for_creator").length,
    votes_needed: Math.max(0, d.quorum - d.votes.length),
  };
}
