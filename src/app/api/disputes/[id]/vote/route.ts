/** POST /api/disputes/[id]/vote — an eligible evaluator stakes their reputation
 *  on a verdict ({ for_worker: boolean, reason? }). Auto-resolves at quorum. */

import { NextResponse } from "next/server";
import { Disputes } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.for_worker !== "boolean") return NextResponse.json({ error: "for_worker required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const { dispute, resolved, error } = Disputes.castVerdict(id, uid, body.for_worker, body.reason);
  if (error) {
    const status = error === "not_found" ? 404 : 400;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ dispute: dispute ? Disputes.view(dispute) : null, resolved });
}
