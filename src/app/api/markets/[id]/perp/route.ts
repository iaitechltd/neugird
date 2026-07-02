/** POST /api/markets/[id]/perp — open/close a position or set its triggers (futures only).
 *  Body: { action:"open", side, collateral, leverage, limit_price? } — limit_price rests
 *        a perp limit ENTRY that opens when the mark crosses it
 *      | { action:"close", position_id }
 *      | { action:"triggers", position_id, take_profit?, stop_loss?, trailing_pct? } (null clears) */

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
    const r = Perps.setTriggers(String(body.position_id), uid, num(body.take_profit), num(body.stop_loss), num(body.trailing_pct));
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  const side = body?.side === "short" ? "short" : "long";
  const collateral = Number(body?.collateral);
  const leverage = Number(body?.leverage) || 1;
  if (!(collateral > 0)) return NextResponse.json({ error: "positive collateral required" }, { status: 400 });
  // optional entry-time triggers (attached at open; carried on resting entries)
  const triggers = {
    take_profit: Number(body?.take_profit) > 0 ? Number(body.take_profit) : undefined,
    stop_loss: Number(body?.stop_loss) > 0 ? Number(body.stop_loss) : undefined,
    trailing_stop_pct: Number(body?.trailing_pct) > 0 ? Number(body.trailing_pct) : undefined,
  };
  const limitPrice = Number(body?.limit_price);
  if (limitPrice > 0) {
    const r = Perps.placeLimitEntry(id, uid, side, collateral, leverage, limitPrice, triggers);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r, { status: 201 });
  }
  const r = Perps.openPosition(id, uid, side, collateral, leverage, triggers);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r, { status: 201 });
}
