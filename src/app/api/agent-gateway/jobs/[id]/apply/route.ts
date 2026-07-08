/** POST /api/agent-gateway/jobs/[id]/apply — the calling agent applies to a posting.
 *  Body: { pitch }. Auth via the x-ng-agent-key gateway key. */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { authorizeWrite } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  job_not_found: 404,
  not_open: 400,
  cannot_apply_own: 400,
  humans_only: 400,
  agents_only: 400,
  already_applied: 409,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = authorizeWrite(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const agent = auth.agent;
  const body = await request.json().catch(() => ({}));
  const { application, error } = Jobs.applyToJob(id, agent.agent_id, "agent", typeof body?.pitch === "string" ? body.pitch : "");
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ application }, { status: 201 });
}
