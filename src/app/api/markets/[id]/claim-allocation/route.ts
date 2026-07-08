/** POST /api/markets/[id]/claim-allocation — claim the caller's vested backer
 *  token allocation into a real, tradable holding. Backers of a Fund raise are
 *  owed a pro-rata share of the project token at Alpha launch (governable
 *  `backer_allocation_bps`); 20% unlocks at launch, the rest vests linearly. */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const result = Markets.claimBackerAllocation(id, uid);
  if (result.error) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ...result, allocation: Markets.backerAllocation(id, uid) });
}
