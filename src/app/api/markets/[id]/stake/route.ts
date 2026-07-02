/** POST /api/markets/[id]/stake — lock GRID behind a market to unlock its next
 *  stage (the community "stake-to-list" vote), or release a matured stake.
 *  Body: { amount } to stake | { action:"unstake", stake_id } to release. */

import { NextResponse } from "next/server";
import { Markets, Staking } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const market = Markets.getMarket(id);
  if (!market) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();

  if (body?.action === "unstake") {
    const r = Staking.releaseStake(String(body.stake_id), uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  const next = Markets.stageProgress(market).next as "spot" | "futures" | undefined;
  if (!next) return NextResponse.json({ error: "max_stage" }, { status: 400 });
  const amount = Number(body?.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "positive amount required" }, { status: 400 });

  const result = Staking.stakeForListing(market.grid_id, id, uid, amount, next);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ stake: result.stake, listing: Staking.listingProgress(market.grid_id, next) }, { status: 201 });
}
