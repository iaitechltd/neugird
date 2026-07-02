/** POST /api/milestones/[id]/approve — a backer casts a governance vote on a milestone
 *  release. Body { support: true|false } (FOR / AGAINST; default FOR). Weight = backing ×
 *  reputation; ≥50% of weighted stake FOR releases the tranche, AGAINST rejects it. */

import { NextResponse } from "next/server";
import { Genesis, Attestations } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const support = body?.support !== false; // default FOR
  const result = Genesis.voteMilestone(id, uid, support);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "not_a_backer" ? 403 : 400 });
  // live soulbound mint: a released tranche earns the founder a Milestone-Shipped credential
  const owner = result.released ? Genesis.ownerOfMilestone(id) : undefined;
  const minted = owner ? Attestations.mintNew(owner, "user") : [];
  return NextResponse.json({ ...result, minted });
}
