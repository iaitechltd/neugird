/**
 * GET /api/rewards — the Rewards dashboard payload: the session user's full
 * earning picture. Everything derives from the Pulse event log + the rewards
 * ledger + settlements: the GRID accrual curve, weekly activity, the reward
 * feed (action → +Pulse → +GRID), the source breakdown, the published earning
 * SCHEDULE, referrals + the affiliate fee share, and TGE/vesting state.
 */

import { NextResponse } from "next/server";
import { Rewards, Referrals, Pulse } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const WEEK = 7 * 24 * 3600 * 1000;

export async function GET() {
  const uid = await getCurrentUserId();
  const ledger = Rewards.ledgerFor(uid);
  const referrals = Referrals.viewFor(uid);

  // the user's positive reward-earning events, oldest → newest
  const events = Pulse.forTarget("user", uid)
    .filter((e) => e.weight > 0)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // GRID accrual curve (cumulative) — the ledger's own event set (includes the
  // user's agents' work; excludes reward_excluded / non-rewardable actions), so
  // the curve ends exactly at the ledger's accrued number
  let run = 0;
  const accrual = Rewards.rewardEventsFor(uid).map((e) => (run += Math.max(0, e.weight) * Rewards.GRID_PER_PULSE));
  while (accrual.length < 2) accrual.unshift(0);

  // weekly activity — reward events per week, trailing 12 weeks
  const now = Date.now();
  const weekly = new Array(12).fill(0);
  for (const e of events) {
    const idx = 11 - Math.floor((now - Date.parse(e.timestamp)) / WEEK);
    if (idx >= 0 && idx < 12) weekly[idx] += 1;
  }

  // the reward feed — newest first, capped; grid=0 ⇒ reputation-only event
  const feed = [...events].reverse().slice(0, 25).map((e) => ({
    action: e.action_type,
    reason: e.reason,
    pulse: e.weight,
    grid: Rewards.allocatesTo(e, uid) ? Math.max(0, e.weight) * Rewards.GRID_PER_PULSE : 0,
    at: e.timestamp,
  }));

  return NextResponse.json({
    me: { id: uid },
    ledger, // accrued · sybil_adjusted · factor · rate · breakdown · tge · vesting
    accrual,
    weekly,
    feed,
    schedule: Rewards.SCHEDULE,
    referrals,
  });
}
