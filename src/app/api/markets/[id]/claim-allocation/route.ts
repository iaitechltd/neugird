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
  // one door claims BOTH sides of the cap table — the caller's backer share and,
  // if they are the maker, their founder carve
  const backer = Markets.claimBackerAllocation(id, uid);
  const founder = Markets.claimFounderAllocation(id, uid);
  if (backer.error && founder.error) {
    const err = backer.error === "not_found" ? "not_found" : founder.error === "nothing_vested" || backer.error === "nothing_vested" ? "nothing_vested" : backer.error;
    return NextResponse.json({ error: err }, { status: err === "not_found" ? 404 : 400 });
  }
  const claimed = (backer.claimed ?? 0) + (founder.claimed ?? 0);
  return NextResponse.json({ claimed, allocation: Markets.backerAllocation(id, uid), founder_allocation: Markets.founderAllocation(id, uid) });
}
