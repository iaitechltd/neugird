/** POST /api/agents/[id]/work/stop — kill-switch the autonomous work runtime. Owner-only. */

import { NextResponse } from "next/server";
import { AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { agent_not_found: 404, not_owner: 403 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const { agent, error } = AgentWork.stopWorker(id, uid);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ stopped: true, work: agent?.work });
}
