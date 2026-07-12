/**
 * Reward allocation — the SECOND of Pulse's two ledgers ([[neugrid-mechanism]]).
 *
 * The same verified actions that build soulbound **Reputation** also accrue a
 * sybil-filtered, quality-weighted **GRID allocation** that vests into the
 * platform token at the one-time TGE. GRID is therefore EARNED, not sold — the
 * merit engine AND the "utility, not security" posture. Pre-TGE the allocation is
 * non-transferable points (not a security); it converts to GRID at the TGE.
 *
 * Derived from Pulse events (the single source of truth) so Reputation and Reward
 * can never drift apart. No public sale, no faucet — contribution is the only way in.
 */

import { db } from "../store";
import { nowISO } from "../id";
import { GridToken } from "../chain";
import * as Humanity from "./humanity";
import * as Params from "./params";
import * as Wallets from "./wallets";
import * as Referrals from "./referrals";
import type { PulseEvent, Vesting } from "../types";

/** GRID allocation units per quality-weighted Pulse point. (TGE conversion rate TBD.) */
export const GRID_PER_PULSE = 10;

/** Verified-contribution actions that earn allocation — delivery + curation only,
 *  never creation/join/role, decay, or penalties. */
const REWARDABLE = new Set<PulseEvent["action_type"]>([
  "submission_approved",
  "campaign_completed",
  "referral_verified",
  "raise_backed",
  "backer_delivery", // backing WINNERS earns allocation as milestones deliver
  "job_delivered",
  "milestone_approved",
  "build_completed",
  "product_listed",
  "product_reviewed",
]);

/** THE EARNING SCHEDULE — the canonical "what each action pays" table, published
 *  in-app (/rewards). `pulse` is the fixed weight; formula rows describe the
 *  reward-scaled emitters. GRID allocation = pulse × GRID_PER_PULSE, sybil-filtered. */
export const SCHEDULE: { action: string; pulse: number | null; formula?: string; dimension: string }[] = [
  { action: "Deliver a paid job", pulse: null, formula: "1 Pulse per $10 of reward (min 5)", dimension: "builder" },
  { action: "Ship an Echo build", pulse: 40, dimension: "builder" },
  { action: "Milestone released by backers", pulse: 30, dimension: "builder" },
  { action: "Publish a product on GridX", pulse: 20, dimension: "creator" },
  { action: "Your product earns a 4–5★ verified review", pulse: 3, dimension: "creator" },
  { action: "Back a raise that fills", pulse: 2, dimension: "backer" },
  { action: "A project you backed delivers a milestone", pulse: null, formula: "share-scaled — back winners, earn more", dimension: "backer" },
  { action: "Verify an audit / review a milestone", pulse: 15, dimension: "reviewer" },
  { action: "Create a Grid", pulse: 25, dimension: "creator" },
  { action: "Referral verified (you referred them)", pulse: 15, dimension: "creator" },
  { action: "Referral verified (you were referred)", pulse: 5, dimension: "creator" },
  { action: "Complete a promo campaign", pulse: null, formula: "reward-scaled (8–50)", dimension: "creator" },
  { action: "Rejected delivery", pulse: -30, dimension: "builder" },
  { action: "Spam / fraud", pulse: -60, dimension: "builder" },
];

/** Who an event's allocation belongs to: the user target, an agent's owner, or
 *  (for grid/subgrid/campaign events) the human actor who did the work. */
function beneficiaryOf(e: PulseEvent): string | undefined {
  if (!(e.weight > 0) || e.reward_excluded || !REWARDABLE.has(e.action_type)) return undefined; // subsidized work earns rep, not allocation
  if (e.target_type === "user") return e.target_id;
  if (e.target_type === "agent") return db.agents.find((a) => a.agent_id === e.target_id)?.owner_id;
  return e.user_id;
}

function eventsFor(user_id: string): PulseEvent[] {
  return (db.pulseEvents ?? []).filter((e) => beneficiaryOf(e) === user_id);
}

/** Does this event pay GRID allocation to this user? The display predicate for
 *  feeds/curves — keeps them consistent with the ledger (reward_excluded and
 *  non-rewardable actions earn reputation, not GRID). */
export function allocatesTo(e: PulseEvent, user_id: string): boolean {
  return beneficiaryOf(e) === user_id;
}

/** The user's allocation-earning events (ledger-attributed: includes their
 *  agents' work), oldest → newest — the accrual curve's source of truth. */
export function rewardEventsFor(user_id: string): PulseEvent[] {
  return eventsFor(user_id).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

const unitsOf = (e: PulseEvent) => Math.max(0, e.weight) * GRID_PER_PULSE;

/** Raw accrued allocation (pre sybil-filter). */
export function accruedFor(user_id: string): number {
  return eventsFor(user_id).reduce((s, e) => s + unitsOf(e), 0);
}

/** Season points — rewardable allocation EARNED since `sinceISO` (a window). The
 *  number people race on the season leaderboard. */
export function pointsSince(user_id: string, sinceISO: string): number {
  return eventsFor(user_id).filter((e) => e.timestamp >= sinceISO).reduce((s, e) => s + unitsOf(e), 0);
}

/** Everyone ranked by points earned in the window (season leaderboard). */
export function leaderboardSince(sinceISO: string, limit = 25): { id: string; username: string; points: number }[] {
  return db.users
    .map((u) => ({ id: u.id, username: u.username, points: pointsSince(u.id, sinceISO) }))
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

/** Sybil / quality factor (0.7..1): rewards contribution spread across multiple
 *  reputation dimensions, haircuts concentration (anti-farm). Simple v1 of the
 *  quality-weighted, sybil-resistant filter the mechanism calls for. */
export function sybilFactor(user_id: string): number {
  const evs = eventsFor(user_id);
  if (!evs.length) return 1;
  const dims = new Set(evs.map((e) => e.dimension).filter(Boolean));
  return Math.min(1, 0.7 + dims.size * 0.1);
}

/** Allocation grouped by reputation dimension — the "how you earned it" breakdown. */
export function breakdownFor(user_id: string): { dimension: string; units: number; events: number }[] {
  const by = new Map<string, { units: number; events: number }>();
  for (const e of eventsFor(user_id)) {
    const k = e.dimension ?? "other";
    const cur = by.get(k) ?? { units: 0, events: 0 };
    cur.units += unitsOf(e);
    cur.events += 1;
    by.set(k, cur);
  }
  return [...by.entries()].map(([dimension, v]) => ({ dimension, ...v, units: Math.round(v.units) })).sort((a, b) => b.units - a.units);
}

/** A user's sybil-adjusted allocation (the number that converts to GRID at the TGE). */
export function sybilAdjustedFor(user_id: string): number {
  return accruedFor(user_id) * sybilFactor(user_id);
}

/** The PoH counting gate (docs/POH_GATE.md): rewards accrue for everyone, but
 *  when `rewards_gate_tier` > 0 only verified accounts COUNT (read-time
 *  predicate — verify any time before the TGE and the whole history counts). */
export function countingGate(user_id: string): { required: number; ok: boolean } {
  const required = Params.get("rewards_gate_tier");
  return { required, ok: Humanity.tierFor(user_id) >= required };
}

/** Total GRID allocation earned across all contributors (for the economy rollup).
 *  Counts only accounts that clear the PoH gate (everyone while it's off). */
export function totalIssued(): { allocation: number; recipients: number } {
  let allocation = 0;
  let recipients = 0;
  for (const u of db.users) {
    if (!countingGate(u.id).ok) continue;
    const a = sybilAdjustedFor(u.id);
    if (a > 0) { allocation += a; recipients += 1; }
  }
  return { allocation: Math.round(allocation), recipients };
}

/* ------------------------------ the TGE ---------------------------------- */
// The one-time platform Token Generation Event: each contributor's earned
// allocation FREEZES into a vesting schedule that converts to wallet GRID over
// time. Option A (no raise) — the split is contributor-heavy; here we vest the
// CONTRIBUTOR side per-user (treasury/team/liquidity are protocol-level buckets).
// `start_at` + cliff + linear + a small immediate TGE unlock so it's claimable.
const TGE_UNLOCK_PCT = 0.1; // 10% unlocks at TGE
const TGE_CLIFF_DAYS = 180; // 6-month cliff on the rest
const TGE_DURATION_DAYS = 730; // linear over 2 years from start

export function tgeState(): { executed: boolean; at: string } {
  return db.tge ?? { executed: false, at: "" };
}

/** Execute the one-time TGE: snapshot every contributor's allocation into a vesting
 *  schedule. Idempotent. (Demo trigger; production = a governance / founder action.) */
export function runTGE(): { executed: boolean; at: string; converted: number; recipients: number } {
  if (db.tge?.executed) return { executed: true, at: db.tge.at, converted: 0, recipients: 0 };
  const at = nowISO();
  db.tge = { executed: true, at };
  let converted = 0;
  let recipients = 0;
  for (const u of db.users) {
    // PoH gate: the snapshot only converts verified accounts when gated —
    // verification is retroactive right up to this freeze point.
    if (!countingGate(u.id).ok) continue;
    // pulse-earned (sybil-filtered) + the affiliate fee-share stream
    const total = Math.round(sybilAdjustedFor(u.id)) + Referrals.affiliateGridFor(u.id);
    if (total <= 0) continue;
    if (!u.reward) u.reward = { accrued: 0, sybil_adjusted: 0, claimed: 0 };
    u.reward.vesting = { start_at: at, cliff_days: TGE_CLIFF_DAYS, duration_days: TGE_DURATION_DAYS, released: 0, total };
    converted += total;
    recipients += 1;
  }
  return { executed: true, at, converted, recipients };
}

/** GRID vested by now: the immediate TGE unlock + linear (post-cliff) over the term. */
function vestedNow(v: Vesting): number {
  const elapsed = Date.now() - Date.parse(v.start_at);
  const unlock = v.total * TGE_UNLOCK_PCT;
  const rest = v.total - unlock;
  const vestedRest = elapsed >= v.cliff_days * 86_400_000 ? rest * Math.min(1, elapsed / (v.duration_days * 86_400_000)) : 0;
  return Math.min(v.total, unlock + vestedRest);
}

export function vestingView(user_id: string) {
  const v = db.users.find((u) => u.id === user_id)?.reward?.vesting;
  if (!v) return null;
  const vested = vestedNow(v);
  return {
    total: Math.round(v.total),
    released: Math.round(v.released),
    claimable: Math.max(0, Math.round(vested - v.released)),
    vested_pct: v.total > 0 ? Math.min(100, Math.round((vested / v.total) * 100)) : 0,
    unlock_pct: TGE_UNLOCK_PCT,
    cliff_days: v.cliff_days,
    duration_days: v.duration_days,
    start_at: v.start_at,
  };
}

/** Claim whatever GRID has vested → the user's wallet. */
export function claim(user_id: string): { claimed?: number; error?: string } {
  const u = db.users.find((x) => x.id === user_id);
  const v = u?.reward?.vesting;
  if (!u || !v) return { error: "no_vesting" };
  const claimable = Math.max(0, vestedNow(v) - v.released);
  if (!(claimable > 0)) return { error: "nothing_claimable" };
  v.released += claimable;
  u.reward!.claimed = (u.reward!.claimed ?? 0) + claimable;
  Wallets.creditGrid(user_id, claimable);
  void GridToken.claim(u.wallet_addresses[0], claimable); // chain mirror — real GRID to their wallet
  return { claimed: Math.round(claimable) };
}

/** The full allocation ledger for a user's profile. */
export function ledgerFor(user_id: string) {
  const accrued = accruedFor(user_id);
  const factor = sybilFactor(user_id);
  const claimed = db.users.find((u) => u.id === user_id)?.reward?.claimed ?? 0;
  const affiliate_grid = Referrals.affiliateGridFor(user_id);
  const sybil_adjusted = Math.round(accrued * factor);
  const total_allocation = sybil_adjusted + affiliate_grid;
  const gate = countingGate(user_id);
  return {
    accrued: Math.round(accrued),
    sybil_adjusted, // the pulse-earned allocation (sybil-filtered)
    affiliate_grid, // the affiliate fee-share stream (real fees — no dampening)
    total_allocation, // what converts at TGE (if the PoH gate clears)
    counted: gate.ok ? total_allocation : 0, // clears the PoH gate today
    pending_verification: gate.ok ? 0 : total_allocation, // earned, counts once verified
    humanity: { tier: Humanity.tierFor(user_id), required: gate.required, ok: gate.ok },
    sybil_factor: Math.round(factor * 100) / 100,
    claimed,
    rate: GRID_PER_PULSE,
    breakdown: breakdownFor(user_id),
    vests_at_tge: true, // non-transferable points pre-TGE → GRID at the platform TGE
    tge: tgeState(),
    vesting: vestingView(user_id),
  };
}
