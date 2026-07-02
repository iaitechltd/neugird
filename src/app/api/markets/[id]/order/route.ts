/** POST /api/markets/[id]/order — place or cancel a limit order. Marketable
 *  limits fill instantly via the AMM; the rest rest in the book. Body:
 *  { action:"place", side:"buy"|"sell", price, qty } | { action:"cancel", order_id } */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();

  if (body?.action === "cancel") {
    const r = Markets.cancelOrder(String(body.order_id), uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  const side = body?.side === "sell" ? "sell" : "buy";
  const price = Number(body?.price);
  const qty = Number(body?.qty);
  if (!(price > 0) || !(qty > 0)) return NextResponse.json({ error: "price and qty required" }, { status: 400 });
  const r = Markets.placeLimit(id, uid, side, price, qty);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r, { status: 201 });
}
