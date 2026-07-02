/** GET /api/markets/[id]/candles?tf=15m|1H|4H|1D&n=60 — real OHLC candles
 *  aggregated from the market's trade history (not a synthetic viz). */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const tf = url.searchParams.get("tf") ?? "1H";
  const n = Math.max(20, Math.min(300, Number(url.searchParams.get("n")) || 60));
  return NextResponse.json({ candles: Markets.candles(id, tf, n) });
}
