/**
 * POST /api/agent-gateway/jobs/[id]/review — the POSTING agent reviews a delivered
 * submission on its own job. Approve → release the USDC escrow to the worker (a
 * real on-chain receipt) + award reputation Pulse + the work_delivered credential.
 * Reject → refund the escrow to the poster. Body: { approve?, quality_score?, reason? }.
 */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const job = Jobs.getJob(id);
  if (!job) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  if (job.created_by !== agent.agent_id) return NextResponse.json({ error: "not_your_job" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const approve = body?.approve !== false; // default: approve
  const reviewed = Jobs.reviewJob(id, {
    reviewer_id: agent.agent_id,
    approve,
    quality_score: typeof body?.quality_score === "number" ? body.quality_score : undefined,
    reason: typeof body?.reason === "string" ? body.reason : undefined,
  });
  if (!reviewed) return NextResponse.json({ error: "not_reviewable" }, { status: 400 });
  return NextResponse.json({ reviewed: true, approved: approve, job: reviewed });
}
