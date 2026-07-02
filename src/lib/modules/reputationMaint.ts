/**
 * Reputation maintenance (V6 — the "fades" half). Scheduled upkeep so reputation
 * reflects RECENT behavior, not just lifetime accumulation:
 *
 *   - decayStale: a gentle time-fade of inactive reputation (users + agents). The
 *     `decay` action type + `last_decay_at` existed in the model but were never used.
 *   - sweepGhosted: a project that leaves a delivery UNREVIEWED past the deadline has
 *     GHOSTED — its Grid's employer trust drops, and the worker (who delivered) is paid
 *     out anyway (escrow auto-releases via reviewJob). A fairness backstop.
 *
 * Driven by POST /api/cron/reputation (point a scheduler at it), or manually with
 * ?force=1 to run immediately, ignoring the time gates.
 */

import { db } from "../store";
import { nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Jobs from "./jobs";
import * as Params from "./params";
import type { ReputationScore } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const DECAY_INTERVAL_MS = DAY; // a given target decays at most once per day
const DECAY_RATE = 0.03; // fade 3% of the live total per run
// Ghost deadline is GOVERNABLE (`campaign_ghost_days`, default 3) — a passed
// set_param proposal changes it for the very next sweep.
const ghostDeadlineMs = () => Params.get("campaign_ghost_days") * DAY;

function ageMs(iso?: string): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : Date.now() - t;
}

/** Gentle time-fade of the live reputation total for inactive users + agents. */
export function decayStale(opts: { force?: boolean; rate?: number } = {}): { decayed: number; total_removed: number } {
  const rate = Math.max(0, Math.min(0.5, opts.rate ?? DECAY_RATE));
  const targets: { type: "user" | "agent"; id: string; rep: ReputationScore }[] = [];
  for (const u of db.users) if (u.reputation && u.reputation.total > 0) targets.push({ type: "user", id: u.id, rep: u.reputation });
  for (const a of db.agents) if (a.reputation && a.reputation.total > 0) targets.push({ type: "agent", id: a.agent_id, rep: a.reputation });
  let decayed = 0;
  let removed = 0;
  for (const t of targets) {
    if (!opts.force && ageMs(t.rep.last_decay_at) < DECAY_INTERVAL_MS) continue;
    const delta = Math.max(1, Math.round(t.rep.total * rate));
    Pulse.recordEvent({
      target_type: t.type,
      target_id: t.id,
      action_type: "decay",
      weight: -delta,
      reason: `Reputation cooled — ${Math.round(rate * 100)}% inactivity fade`,
      verification_source: "auto",
    });
    t.rep.last_decay_at = nowISO();
    decayed += 1;
    removed += delta;
  }
  return { decayed, total_removed: removed };
}

/** A project that ghosts a delivery (never reviews it) past the deadline: its Grid's
 *  employer trust drops, and the worker is paid out (escrow auto-releases). */
export function sweepGhosted(opts: { force?: boolean } = {}): { ghosted: number; auto_paid: number } {
  const deadline = ghostDeadlineMs();
  const stale = db.jobs.filter(
    (j) => j.context === "campaign_task" && j.status === "submitted" && (opts.force || ageMs(j.proof?.submitted_at) >= deadline),
  );
  let ghosted = 0;
  let paid = 0;
  for (const job of stale) {
    if (job.grid_id) {
      Pulse.recordEvent({
        target_type: "grid",
        target_id: job.grid_id,
        action_type: "campaign_ghosted",
        weight: -Math.max(10, Math.round(job.reward_amount / 250)),
        reason: `Ghosted a delivery on "${job.title}" — left unreviewed past the deadline`,
        verification_source: "auto",
      });
      ghosted += 1;
    }
    // Fairness: the worker delivered — auto-approve so escrow releases + they earn reputation.
    const res = Jobs.reviewJob(job.job_id, { reviewer_id: "system:ghost-sweep", approve: true });
    if (res?.status === "paid") paid += 1;
  }
  return { ghosted, auto_paid: paid };
}

export function runMaintenance(opts: { force?: boolean } = {}) {
  const ghost = sweepGhosted(opts); // sweep first (may pay out deliveries), then decay
  const decay = decayStale(opts);
  return { ...ghost, ...decay };
}
