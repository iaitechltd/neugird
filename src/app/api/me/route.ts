/**
 * /api/me — the current identity.
 * GET  → who am I (id, wallet, Pulse, joined grids).
 * POST → "connect" (select a user, set the session cookie). This stands in for
 *        Solana wallet auth; Phase 1 replaces the body with a signed message.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { demoMode, getCurrentUser, SESSION_COOKIE, userExists } from "@/lib/session";
import { Wallets, Rewards, Pulse, Social, Onboarding, Markets } from "@/lib/modules";
import { db } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "no_user", demo: demoMode() }, { status: 404 });
  return NextResponse.json({
    demo: demoMode(), // demo posture — clients hide dev-only controls when false
    id: user.id,
    username: user.username,
    wallet: user.wallet_addresses[0] ?? null,
    pulse: user.pulse_score,
    reputation: user.reputation ?? null,
    joined_grids: user.joined_grids,
    skills: user.skills,
    balances: Wallets.balances(user.id), // spendable GRID/USDC (dev faucet)
    reward: Rewards.ledgerFor(user.id), // earned GRID allocation — vests at TGE
    // V6 — recent Pulse movement (gains AND fades), so /me shows reputation is alive
    rep_events: Pulse.forTarget("user", user.id).slice(0, 6).map((e) => ({ action: e.action_type, weight: e.weight, reason: e.reason, at: e.timestamp })),
    // reputation curve — cumulative Pulse over time (oldest → now), chartable
    rep_series: (() => {
      const evs = Pulse.forTarget("user", user.id).slice().reverse(); // oldest first
      let run = 0;
      const s = evs.map((e) => Math.max(0, (run += e.weight)));
      while (s.length < 2) s.unshift(0);
      return s;
    })(),
    income: Social.incomeFor(user.id), // real money in — settlements + agent earnings
    // THE EMPIRE (audit Wave 3) — the whole holding in ONE view: token wealth,
    // claimable carves, staking income, company treasuries. incomeFor is money
    // that MOVED; this is what you HOLD.
    empire: (() => {
      const uid = user.id;
      const holdings = db.holdings.filter((h) => h.user_id === uid && h.base > 1e-9);
      const holdings_usd = holdings.reduce((s, h) => s + h.base * (db.markets.find((m) => m.market_id === h.market_id)?.price ?? 0), 0);
      let claimable_markets = 0;
      for (const m of db.markets) {
        if ((Markets.backerAllocation(m.market_id, uid)?.claimable ?? 0) >= 1 || (Markets.founderAllocation(m.market_id, uid)?.claimable ?? 0) >= 1) claimable_markets++;
      }
      const staking_fees_usd = db.listingStakes.filter((s) => s.staker_id === uid).reduce((a, s) => a + (s.fees_earned ?? 0), 0);
      const myVentures = (db.ventures ?? []).filter((x) => x.owner_id === uid);
      const venture_treasury_grid = myVentures.reduce((a, x) => a + Wallets.balances(x.treasury_id).grid, 0);
      const open_raises = db.proposals.filter((p) => p.status === "open" && p.author_id === uid).length;
      return {
        holdings_usd: Math.round(holdings_usd * 100) / 100,
        positions: holdings.length,
        claimable_markets,
        staking_fees_usd: Math.round(staking_fees_usd * 100) / 100,
        ventures: myVentures.length,
        venture_treasury_grid: Math.round(venture_treasury_grid),
        open_raises,
      };
    })(),
    follows: Social.followCounts(user.id),
    starter: Onboarding.starterState(user.id), // the 3-step starter path (drives the /home strip)
  });
}

export async function POST(request: Request) {
  // Demo-only backdoor: pick any seeded identity. Staging/launch posture
  // (NEUGRID_DEMO=off) disables it — SIWS via /api/auth is the only door.
  if (!demoMode()) {
    return NextResponse.json({ error: "demo_only" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const id: unknown = body?.user_id;
  if (typeof id === "string") {
    if (!userExists(id)) {
      return NextResponse.json({ error: "unknown_user" }, { status: 400 });
    }
    const c = await cookies();
    c.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  const user = await getCurrentUser();
  return NextResponse.json({ ok: true, user_id: user?.id ?? null });
}
