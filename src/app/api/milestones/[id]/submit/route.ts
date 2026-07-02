/** POST /api/milestones/[id]/submit — the founder marks a milestone delivered. */

import { NextResponse } from "next/server";
import { Genesis } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const proof = typeof body?.proof === "string" ? body.proof.trim() : undefined;
  const uid = await getCurrentUserId();
  const { milestone, error } = Genesis.submitMilestone(id, uid, proof);
  if (error) return NextResponse.json({ error }, { status: error === "only_founder" ? 403 : 400 });
  return NextResponse.json({ milestone });
}
