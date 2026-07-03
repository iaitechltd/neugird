/**
 * Campaign — the promotional-work marketplace, a lens over the Jobs engine.
 *
 *   a project POSTS promotional work (a Job with context "campaign_task") →
 *   humans or AI agents APPLY → the project PICKS one (the USDC reward locks
 *   in escrow) → the worker DELIVERS → approve releases the escrow (+ soulbound
 *   credential) / reject refunds it → and reputation grows AND fades with
 *   delivery, on both sides (worker rep + the Grid's employer trust).
 *
 * Postings are disclosed on-platform by default (paid promotion is transparent
 * here, which is the credibility feature). Echo matchmakes communities for a
 * project. The former flat-Deal exchange (createDeal/acceptDeal/verifyDeal +
 * /api/deals) was retired 2026-07-02 — superseded by this apply→select flow.
 */

import { db } from "../store";
import * as Jobs from "./jobs";
import type { Job, JobStatus } from "../types";

/** Echo matchmaking — community Grids ranked by audience size. */
export function suggestGrids(limit = 5) {
  return db.grids
    .filter((g) => (g.grid_type ?? "community") === "community")
    .sort((a, b) => (b.member_count || 0) - (a.member_count || 0))
    .slice(0, limit)
    .map((g) => ({ grid_id: g.grid_id, slug: g.slug, name: g.name, members: g.member_count, pulse: g.pulse_score }));
}

/* --------- Promotional postings: Campaign as a lens over the Jobs engine --------- */
// A project posts promotional work (a Job with context "campaign_task") FROM a Grid it
// owns, declaring who it wants (executor_kind: human/agent/any) and the required skills.
// This reuses the Jobs engine (delivery → escrow release → reputation); hiring is
// apply→select (see jobs.applyToJob/selectApplicant), never first-come claim.

export interface PostPromoInput {
  grid_id: string;
  created_by: string;
  title: string;
  brief: string;
  seeking: "human" | "agent" | "any";
  skills: string[];
  reward: number;
  reward_token?: string;
}

export function postPromo(input: PostPromoInput): { job?: Job; error?: string } {
  const grid = db.grids.find((g) => g.grid_id === input.grid_id);
  if (!grid) return { error: "no_grid" };
  if (grid.owner_id !== input.created_by) return { error: "not_owner" };
  if (!input.title.trim() || !(input.reward > 0)) return { error: "bad_input" };
  const job = Jobs.createJob({
    context: "campaign_task",
    grid_id: input.grid_id,
    campaign_id: input.grid_id,
    title: input.title.trim(),
    description: input.brief?.trim() ?? "",
    required_skills: input.skills.map((s) => s.trim()).filter(Boolean).slice(0, 12),
    executor_kind: input.seeking,
    reward_amount: Math.round(input.reward),
    reward_token: input.reward_token ?? "USDC",
    created_by: input.created_by,
  });
  return { job };
}

/** Open promotional postings across the platform (or one Grid), newest first. */
export function listPromos(f: { grid_id?: string; status?: JobStatus } = {}): Job[] {
  return Jobs.listJobs({ context: "campaign_task", grid_id: f.grid_id, status: f.status });
}

/* --------- V6 employer trust: how a Grid treats the people it hires --------- */
// The employer half of Campaign's two-sided reputation, derived straight from the
// Grid's campaign_task postings: paying on delivery builds trust, ghosting a delivery
// (left unreviewed past the deadline → auto-paid by the reputation sweep) erodes it.
// Rejections are recorded but judged neutral — a fair employer may reject bad work.

export interface EmployerTrust {
  postings: number;
  paid: number; // reviewed + paid by the project itself
  ghosted: number; // never reviewed — the sweep auto-paid the worker
  rejected: number;
  in_flight: number;
  tier: "trusted_employer" | "reliable" | "ghost_risk" | "unrated";
  recent: { title: string; outcome: "paid" | "ghosted" | "rejected"; reward: number; at?: string }[];
}

export function employerTrust(grid_id: string): EmployerTrust {
  const jobs = db.jobs.filter((j) => j.context === "campaign_task" && j.grid_id === grid_id);
  const decided: EmployerTrust["recent"] = [];
  let paid = 0, ghosted = 0, rejected = 0, in_flight = 0;
  for (const j of jobs) {
    const reviewer = j.verification?.reviewer_stakes?.[0]?.reviewer_id ?? "";
    if (j.status === "paid") {
      const ghost = reviewer.startsWith("system");
      if (ghost) ghosted += 1; else paid += 1;
      decided.push({ title: j.title, outcome: ghost ? "ghosted" : "paid", reward: j.reward_amount, at: j.verification?.decided_at });
    } else if (j.status === "rejected") {
      rejected += 1;
      decided.push({ title: j.title, outcome: "rejected", reward: j.reward_amount, at: j.verification?.decided_at });
    } else {
      in_flight += 1;
    }
  }
  decided.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const tier: EmployerTrust["tier"] =
    paid + ghosted === 0 ? "unrated"
      : ghosted >= paid ? "ghost_risk"
      : paid >= 3 && ghosted === 0 ? "trusted_employer"
      : "reliable";
  return { postings: jobs.length, paid, ghosted, rejected, in_flight, tier, recent: decided.slice(0, 5) };
}
