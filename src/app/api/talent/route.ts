/**
 * /api/talent — the Talent marketplace surface.
 * GET  → the talent directory (listing · verified badge · earned · followers) +
 *        market rollups (paid-to-talents, open roles, trending job requests) +
 *        the session user's GROWTH block (dimension gaps · revenue · engagement).
 * POST → self-serve listing: the session user sets headline/rate/availability/skills.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Users, Jobs, Social, Pulse } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Reputation that EARNS the verified badge — visible, gameable only by real delivered work. */
export const VERIFIED_REP = 100;

const short = (a?: string) => (a && a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a ?? "");
const DAY = 24 * 3600 * 1000;

/** Top requested skills across job postings in a window (count + $ demand). */
function trendingRequests(sinceMs: number) {
  const cutoff = Date.now() - sinceMs;
  const agg = new Map<string, { count: number; reward: number }>();
  for (const j of db.jobs) {
    if (Date.parse(j.created_at) < cutoff) continue;
    for (const s of j.required_skills ?? []) {
      const k = s.toLowerCase();
      const e = agg.get(k) ?? { count: 0, reward: 0 };
      e.count += 1;
      e.reward += j.reward_amount ?? 0;
      agg.set(k, e);
    }
  }
  return [...agg.entries()]
    .map(([skill, e]) => ({ skill, ...e, reward: Math.round(e.reward) }))
    .sort((a, b) => b.count - a.count || b.reward - a.reward)
    .slice(0, 6);
}

/** What the session user should do next, per weakest reputation dimensions. */
const GROW_ACTIONS: Record<string, string> = {
  builder: "Deliver jobs or ship an Echo build — builder rep gates Fund raises.",
  backer: "Back a raise you believe in — backer weight compounds your milestone voice.",
  reviewer: "Review audits and verify milestones — reviewer rep is scarce and trusted.",
  creator: "Post in your grids and run promo campaigns — creator rep drives discovery.",
};

/** Events-per-week over the trailing 8 weeks (the engagement pulse). */
function engagementSeries(user_id: string): number[] {
  const events = Pulse.forTarget("user", user_id);
  const now = Date.now();
  const weeks = new Array(8).fill(0);
  for (const e of events) {
    const age = now - Date.parse(e.timestamp);
    const idx = 7 - Math.floor(age / (7 * DAY));
    if (idx >= 0 && idx < 8) weeks[idx] += 1;
  }
  return weeks;
}

export async function GET() {
  const uid = await getCurrentUserId();

  const talent = Users.listAll().map((u) => {
    const rep = u.reputation?.total ?? 0;
    return {
      id: u.id,
      username: u.username,
      wallet: short(u.wallet_addresses[0]),
      skills: u.skills ?? [],
      bio: u.bio ?? "",
      pulse: u.pulse_score,
      builder: u.reputation?.by_dimension?.builder ?? 0,
      reputation: Math.round(rep),
      verified: rep >= VERIFIED_REP,
      jobs_done: Jobs.listJobs({ assignee_id: u.id, status: "paid" }).length,
      earned: Social.incomeFor(u.id).total,
      followers: Social.followCounts(u.id).followers,
      headline: u.listing?.headline,
      rate_usdc: u.listing?.rate_usdc,
      available: u.listing?.available,
    };
  });

  // money actually paid out to people (job + campaign payouts land as settlements)
  const paid_total = Math.round(
    db.settlements
      .filter((s) => s.resource.startsWith("job_payout") || s.resource.startsWith("campaign"))
      .reduce((a, s) => a + s.amount, 0),
  );
  const open_roles = Jobs.listJobs({ status: "open" }).length;

  // the session user's growth block (drives the "what to improve" rail)
  const me = Users.getUser(uid);
  const dims = me?.reputation?.by_dimension ?? {};
  const axes = ["builder", "backer", "reviewer", "creator"] as const;
  const gaps = axes
    .map((d) => ({ dim: d, score: Math.round(dims[d] ?? 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((g) => ({ ...g, action: GROW_ACTIONS[g.dim] }));
  const income = Social.incomeFor(uid);
  const engagement = engagementSeries(uid);
  const engPrev = engagement.slice(0, 4).reduce((a, b) => a + b, 0);
  const engNow = engagement.slice(4).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    talent,
    verified_rep: VERIFIED_REP,
    paid_total,
    open_roles,
    trending: { today: trendingRequests(DAY), month: trendingRequests(30 * DAY) },
    me: {
      id: uid,
      listed: !!me?.listing,
      headline: me?.listing?.headline ?? "",
      rate_usdc: me?.listing?.rate_usdc,
      available: me?.listing?.available ?? true,
      skills: me?.skills ?? [],
      dims: axes.map((d) => ({ dim: d, score: Math.round(dims[d] ?? 0) })),
      gaps,
      income_total: income.total,
      income_series: income.series,
      engagement,
      engagement_delta: engNow - engPrev,
      followers: Social.followCounts(uid).followers,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  const uid = await getCurrentUserId();
  const { user, error } = Users.updateListing(uid, body);
  if (error) return NextResponse.json({ error }, { status: 404 });
  return NextResponse.json({ listing: user?.listing, skills: user?.skills });
}
