/**
 * /api/subgrids/[id]
 * GET → one SubGrid (team) + its parent Grid, members, agents, jobs, access policy,
 * ownership splits, and the caller's membership/eligibility.
 */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const view = GridRegistry.subGridView(id, uid);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}
