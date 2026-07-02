/** POST /api/proposals/[id]/fund — back a proposal. A full raise spawns a project Grid. */

import { NextResponse } from "next/server";
import { Genesis } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!(amount > 0)) return NextResponse.json({ error: "positive amount required" }, { status: 400 });
  const backer_id = await getCurrentUserId();
  const result = Genesis.fundProposal(id, backer_id, amount);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
