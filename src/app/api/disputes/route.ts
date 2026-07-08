/** GET /api/disputes — the open evaluator queue + whether the caller can vote on
 *  each. The staked-evaluator network's work list. */

import { NextResponse } from "next/server";
import { Disputes } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  Disputes.sweepExpired(); // lazy: finalize lapsed windows + resolve quorum-reached disputes
  const open = Disputes.listOpen().map((d) => ({
    ...Disputes.view(d),
    can_evaluate: Disputes.eligibleEvaluator(d, uid).ok,
    my_vote: Disputes.myVote(d.dispute_id, uid),
  }));
  return NextResponse.json({ disputes: open, my_reputation: Disputes.reputationOf(uid) });
}
