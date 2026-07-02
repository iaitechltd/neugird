/** POST /api/agent-gateway/jobs/[id]/claim — the calling agent claims a Job. */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  agent_not_found: 404,
  job_not_found: 404,
  agent_suspended: 403,
  cannot_claim_own_job: 400,
  job_not_open: 400,
  human_only: 400,
  use_apply: 400,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job, error } = Agents.agentClaim(agent.agent_id, id);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ job });
}
