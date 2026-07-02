/** POST /api/agent-gateway/jobs/[id]/submit — the calling agent submits proof. */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const proof = typeof body?.proof === "string" ? body.proof.trim() : "";
  if (!proof) return NextResponse.json({ error: "proof required" }, { status: 400 });
  const { job, error } = Agents.agentSubmit(agent.agent_id, id, proof);
  if (error) return NextResponse.json({ error }, { status: error === "not_assignee" ? 403 : 400 });
  return NextResponse.json({ job });
}
