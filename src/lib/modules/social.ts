/**
 * Social — the user→user follow graph + the profile income rollup.
 *
 * Follows are a lightweight signal graph: following someone surfaces their
 * verified activity (builds, launches, credentials) in your notifications.
 * Income is DERIVED from the settlements ledger (job payouts land on the
 * economic principal — an agent's job pay routes to its owner), plus the
 * owned agents' service earnings, so "what this builder made" is real money
 * movement, never a vanity number.
 */

import { db } from "../store";
import { nowISO } from "../id";
import type { Follow } from "../types";

function ledger(): Follow[] {
  return (db.follows ??= []);
}

/* -------------------------------- follows -------------------------------- */

export function isFollowing(follower_id: string, followee_id: string): boolean {
  return ledger().some((f) => f.follower_id === follower_id && f.followee_id === followee_id);
}

/** Follow/unfollow toggle. Returns the new state. */
export function toggleFollow(follower_id: string, followee_id: string): { following: boolean; error?: string } {
  if (follower_id === followee_id) return { following: false, error: "cannot_follow_self" };
  if (!db.users.some((u) => u.id === followee_id)) return { following: false, error: "no_user" };
  const i = ledger().findIndex((f) => f.follower_id === follower_id && f.followee_id === followee_id);
  if (i >= 0) { ledger().splice(i, 1); return { following: false }; }
  ledger().push({ follower_id, followee_id, created_at: nowISO() });
  return { following: true };
}

export function followCounts(user_id: string): { followers: number; following: number } {
  let followers = 0, following = 0;
  for (const f of ledger()) {
    if (f.followee_id === user_id) followers++;
    if (f.follower_id === user_id) following++;
  }
  return { followers, following };
}

export function followersOf(user_id: string): Follow[] {
  return ledger().filter((f) => f.followee_id === user_id);
}

export function followingOf(user_id: string): string[] {
  return ledger().filter((f) => f.follower_id === user_id).map((f) => f.followee_id);
}

/* -------------------------------- income --------------------------------- */

/** Money-IN settlements for a user: job/campaign payouts (agents' job pay lands on
 *  the owner) + paid agent services. Excludes refunds (their own escrow returning)
 *  and anything they paid out. */
function incomeRows(user_id: string) {
  // refunds (job escrow back, expired-raise backings back) are your own money
  // returning — never income. P2P dm_transfers are money but not MERIT —
  // "Earned" is the verified-work résumé, so gifts stay out of it.
  return db.settlements.filter(
    (s) => s.payee === user_id && s.status === "settled" && s.payer_id !== user_id && !s.resource.includes("refund") && s.resource !== "dm_transfer",
  );
}

export interface IncomeView {
  total: number; // direct + agents
  direct: number; // settlements paid to this user (jobs, campaigns, services)
  agents_total: number; // owned agents' retained service earnings
  series: number[]; // cumulative direct income, oldest → now (chartable)
  recent: { kind: string; amount: number; at: string }[];
}

export function incomeFor(user_id: string): IncomeView {
  const rows = incomeRows(user_id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const direct = rows.reduce((a, s) => a + s.amount, 0);
  const agents_total = db.agents.filter((a) => a.owner_id === user_id).reduce((a, x) => a + (x.earnings ?? 0), 0);
  // cumulative curve (fixed-width so the chart reads even with few events)
  let run = 0;
  const series = rows.map((s) => (run += s.amount));
  while (series.length < 2) series.unshift(0);
  const recent = rows.slice(-5).reverse().map((s) => ({ kind: s.resource.split(":")[0], amount: s.amount, at: s.created_at }));
  return { total: Math.round((direct + agents_total) * 100) / 100, direct: Math.round(direct * 100) / 100, agents_total, series, recent };
}
