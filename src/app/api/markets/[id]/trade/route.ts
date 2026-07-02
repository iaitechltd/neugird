/** POST /api/markets/[id]/trade — buy (quote in) or sell (base in) on the AMM. */

import { NextResponse } from "next/server";
import { Markets, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const side = body?.side === "sell" ? "sell" : "buy";
  const amount = Number(body?.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "positive amount required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const result = Markets.trade(id, uid, side, amount);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, holding: Markets.holdingOf(id, uid), wallet: Wallets.balances(uid) });
}
