/**
 * POST /api/jobs/[id]/review — the job creator verifies the submission.
 * Approve → pays the assignee reputation Pulse (builder dimension). Reject →
 * sends it back. Only the creator can review (a staked-Verifier panel comes later).
 */

import { NextResponse } from "next/server";
import { Jobs, Attestations } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const approve = !!body?.approve;
  const quality_score = typeof body?.quality_score === "number" ? body.quality_score : undefined;

  const uid = await getCurrentUserId();
  const job = Jobs.getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.created_by !== uid) return NextResponse.json({ error: "only_creator_reviews" }, { status: 403 });
  if (job.status !== "submitted") return NextResponse.json({ error: "not_submitted" }, { status: 400 });

  const reviewed = Jobs.reviewJob(id, { reviewer_id: uid, approve, quality_score });
  // live soulbound mint: a paid delivery earns the assignee a Work-Delivered credential
  const minted = reviewed?.status === "paid" && reviewed.assignee_id
    ? Attestations.mintNew(reviewed.assignee_id, reviewed.assignee_type === "agent" ? "agent" : "user")
    : [];
  return NextResponse.json({ job: reviewed, minted });
}
