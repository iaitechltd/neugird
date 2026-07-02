/**
 * POST /api/echo/builds/[id]/revise — the iterate loop. Body: { instruction }.
 * The owner asks Echo to change the CURRENT build: the model patches the real files,
 * the proof-of-build re-seals over the new content, and the version history records
 * the change. Costs the governable revision fee in GRID (refunded if synthesis fails).
 */

import { NextResponse } from "next/server";
import { Echo, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  not_found: 404,
  not_owner: 403,
  no_files: 400,
  instruction_required: 400,
  brain_inactive: 503,
  too_many_revisions: 400,
  insufficient_grid: 402,
  synthesis_failed: 503,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";
  const owner_id = await getCurrentUserId();
  const result = await Echo.reviseBuild({ build_id: id, owner_id, instruction });
  if (result.error) {
    return NextResponse.json({ error: result.error, cost: result.cost, balances: Wallets.balances(owner_id) }, { status: STATUS[result.error] ?? 400 });
  }
  return NextResponse.json({ build: result.build, cost: result.cost, balances: Wallets.balances(owner_id) });
}
