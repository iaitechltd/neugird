/** /api/tge — the one-time platform Token Generation Event (demo-runnable).
 *  GET  → TGE state + the caller's vesting + their current allocation.
 *  POST { action:"run" }   → execute the TGE (snapshots allocations → vesting; idempotent).
 *  POST { action:"claim" } → claim whatever GRID has vested → the caller's wallet. */

import { NextResponse } from "next/server";
import { Rewards, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({ tge: Rewards.tgeState(), vesting: Rewards.vestingView(uid), allocation: Math.round(Rewards.sybilAdjustedFor(uid)) });
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);

  if (body?.action === "claim") {
    const r = Rewards.claim(uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ...r, vesting: Rewards.vestingView(uid), balances: Wallets.balances(uid) });
  }

  const r = Rewards.runTGE(); // default action: run the one-time event
  return NextResponse.json({ ...r, vesting: Rewards.vestingView(uid) });
}
