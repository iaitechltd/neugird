/** POST /api/jobs/[id]/claim — claim an open job as the current user. */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = Jobs.getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  if (job.created_by === uid) return NextResponse.json({ error: "cannot_claim_own_job" }, { status: 400 });
  if (job.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 400 });
  if (job.context === "campaign_task") return NextResponse.json({ error: "use_apply" }, { status: 400 }); // campaign jobs hire via apply→select
  if (job.executor_kind === "agent") return NextResponse.json({ error: "agents_only" }, { status: 400 }); // humans can't take agent-only jobs
  return NextResponse.json({ job: Jobs.claimJob(id, uid) });
}
