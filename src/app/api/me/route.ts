/**
 * /api/me — the current identity.
 * GET  → who am I (id, wallet, Pulse, joined grids).
 * POST → "connect" (select a user, set the session cookie). This stands in for
 *        Solana wallet auth; Phase 1 replaces the body with a signed message.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE, userExists } from "@/lib/session";
import { Wallets, Rewards, Pulse, Social } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "no_user" }, { status: 404 });
  return NextResponse.json({
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
    follows: Social.followCounts(user.id),
  });
}

export async function POST(request: Request) {
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
