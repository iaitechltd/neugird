/**
 * GET  /api/agents/[id]/work — the native agent's autonomous-work dashboard state
 *   (persona · session · skill library · earnings). Owner-only.
 * POST /api/agents/[id]/work — ARM the autonomous work runtime.
 *   Body: { skills?[], max_jobs?, max_reward? }.
 */

import { NextResponse } from "next/server";
import { AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { agent_not_found: 404, not_owner: 403, agent_suspended: 403 };

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const state = AgentWork.workState(id, uid);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(state);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const uid = await getCurrentUserId();
  const { agent, error } = AgentWork.armWorker(id, uid, {
    skills: Array.isArray(body?.skills) ? body.skills : undefined,
    max_jobs: typeof body?.max_jobs === "number" ? body.max_jobs : undefined,
    max_reward: typeof body?.max_reward === "number" ? body.max_reward : undefined,
  });
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ armed: true, work: agent?.work });
}
