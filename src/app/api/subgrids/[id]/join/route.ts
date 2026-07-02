/** POST /api/subgrids/[id]/join — the current user joins the team (gate-enforced).
 *  DELETE → leave. Returns the refreshed SubGrid view. */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, already_member: 409, invite_only: 403, need_reputation: 403, need_grid: 402, join_grid_first: 403, sole_admin: 409 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = GridRegistry.joinSubGrid(id, uid);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = GridRegistry.leaveSubGrid(id, uid);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}
