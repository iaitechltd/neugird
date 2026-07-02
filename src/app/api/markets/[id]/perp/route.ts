/** POST /api/markets/[id]/perp — open/close a position or set its TP/SL (futures only).
 *  Body: { action:"open", side, collateral, leverage } | { action:"close", position_id }
 *      | { action:"triggers", position_id, take_profit?, stop_loss? } (null clears one) */

import { NextResponse } from "next/server";
import { Perps } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null ? null : v === undefined ? undefined : Number(v));

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();

  if (body?.action === "close") {
    const r = Perps.closePosition(String(body.position_id), uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  if (body?.action === "triggers") {
    const r = Perps.setTriggers(String(body.position_id), uid, num(body.take_profit), num(body.stop_loss));
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  const side = body?.side === "short" ? "short" : "long";
  const collateral = Number(body?.collateral);
  const leverage = Number(body?.leverage) || 1;
  if (!(collateral > 0)) return NextResponse.json({ error: "positive collateral required" }, { status: 400 });
  const r = Perps.openPosition(id, uid, side, collateral, leverage);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r, { status: 201 });
}
