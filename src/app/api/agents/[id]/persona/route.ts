/**
 * POST /api/agents/[id]/persona — set/update a native agent's persona (character).
 * Owner-only. Body: { role?, bio?, personality?, goals?, style?, knowledge?[] }.
 */

import { NextResponse } from "next/server";
import { AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { agent_not_found: 404, not_owner: 403 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const uid = await getCurrentUserId();
  // offer_policy travels on the same owner-authed surface as the persona
  if (body?.offer_policy !== undefined) {
    const r = AgentWork.setOfferPolicy(id, uid, body.offer_policy);
    if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
    if (Object.keys(body).length === 1) return NextResponse.json({ offer_policy: r.policy ?? null });
  }
  const { agent, error } = AgentWork.setPersona(id, uid, body ?? {});
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ persona: agent?.persona, offer_policy: agent?.offer_policy ?? null });
}
