/**
 * /api/agents/[id]/deploy
 * POST { job_id } → deploy the agent on an open Job. Owner-only. The agent
 * claims → executes (stubbed) → submits proof, leaving the Job awaiting review.
 */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  agent_not_found: 404,
  job_not_found: 404,
  not_owner: 403,
  agent_suspended: 403,
  cannot_claim_own_job: 400,
  job_not_open: 400,
  human_only: 400,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.job_id !== "string") {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }
  const uid = await getCurrentUserId();
  const { job, agent, error } = Agents.deployOnJob(id, body.job_id, uid);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ job, agent });
}
