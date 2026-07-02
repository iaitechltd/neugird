/**
 * /api/echo/ask — the Personal / Analyst / Observer modes, made real.
 * GET  ?mode= → the LIVE data snapshot (feeds the mode's UI rails; free).
 * POST { mode, question } → a brain answer grounded in that snapshot. Metered in
 * GRID (`echo_ask_cost_grid`, default 5; refunded if the model call fails).
 */

import { NextResponse } from "next/server";
import { Echo, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const MODES = new Set(["personal", "analyst", "observer"]);
const STATUS: Record<string, number> = { question_required: 400, brain_inactive: 503, insufficient_grid: 402, synthesis_failed: 503 };

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") ?? "";
  if (!MODES.has(mode)) return NextResponse.json({ error: "bad_mode" }, { status: 400 });
  const uid = await getCurrentUserId();
  const { snapshot } = Echo.askSnapshot(mode as Echo.EchoAskMode, uid);
  return NextResponse.json({ mode, snapshot, cost: Echo.askCost() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = String(body?.mode ?? "");
  if (!MODES.has(mode)) return NextResponse.json({ error: "bad_mode" }, { status: 400 });
  const uid = await getCurrentUserId();
  const r = await Echo.askEcho(mode as Echo.EchoAskMode, uid, String(body?.question ?? ""));
  if (r.error) return NextResponse.json({ error: r.error, cost: r.cost, balances: Wallets.balances(uid) }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ answer: r.answer, cost: r.cost, balances: Wallets.balances(uid) });
}
