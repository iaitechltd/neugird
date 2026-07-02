/**
 * POST /api/agents/[id]/work/tick — advance the autonomous work runtime one step:
 * the agent's brain picks a matching Job, applies its learned skills, delivers, and
 * writes a new skill. Owner-only. (A server-side scheduler can drive this in prod;
 * today it's owner/UI-driven, like the Agent-Mode trading tick.)
 */

import { NextResponse } from "next/server";
import { AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  if (!AgentWork.workState(id, uid)) return NextResponse.json({ error: "not_found" }, { status: 404 }); // owner gate
  const { action, done, error } = await AgentWork.runWorkTick(id);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ action, done, work: AgentWork.workState(id, uid)?.work });
}
