/**
 * /api/proposals/[id]
 * GET → the full read model for one proposal: funding progress, milestones,
 * spawned Grid, the backer list, plus the current user's relationship to it
 * (author? backed it? eligible to propose?) for the detail page's actions.
 */

import { NextResponse } from "next/server";
import { Genesis } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = Genesis.proposalView(id);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  return NextResponse.json({
    ...view,
    milestones: view.milestones.map((m) => ({ ...m, my_vote: Genesis.myMilestoneVote(m.milestone_id, uid) })),
    i_backed: Genesis.hasBacked(id, uid),
    is_author: view.proposal.author_id === uid,
    backer_list: Genesis.backersFor(id).map((b) => ({ backer_id: b.backer_id, amount: b.amount, created_at: b.created_at })),
    me: { id: uid, reputation: Genesis.reputationOf(uid), can_propose: Genesis.canPropose(uid), min: Genesis.PROPOSE_REPUTATION_MIN },
  });
}
