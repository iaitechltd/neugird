/** POST /api/markets/[id]/claim-dividends — a token holder claims their share of
 *  the product's REAL sales (the revenue-share pivot: the token is a piece of the
 *  income). USDC moves from the market's dividend pool to the holder; a settlement
 *  records it so income views count it. */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = Markets.claimDividends(id, uid);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.error === "no_dividends" ? 404 : 400 });
  return NextResponse.json({ claimed: r.claimed, dividends: Markets.dividendView(id, uid) });
}
