/**
 * /api/grids/[slug]/subgrids
 * GET  → list the Grid's SubGrids (teams).
 * POST → create one (must be a member or the owner). Creator becomes admin.
 * Forming a team bumps the Grid's Pulse, not the creator's reputation.
 */

import { NextResponse } from "next/server";
import { GridRegistry, Pulse } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ subgrids: GridRegistry.listSubGrids(grid.grid_id) });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const uid = await getCurrentUserId();
  const allowed = grid.owner_id === uid || GridRegistry.isMember(grid.grid_id, uid);
  if (!allowed) return NextResponse.json({ error: "must_be_member" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const purpose = typeof body?.purpose === "string" ? body.purpose : "";

  const sub = GridRegistry.createSubGrid({ parent_grid_id: grid.grid_id, name, purpose, admin_id: uid });
  Pulse.recordEvent({
    target_type: "grid",
    target_id: grid.grid_id,
    user_id: uid,
    action_type: "subgrid_created",
    weight: 8,
    reason: `SubGrid "${name}" formed`,
    verification_source: "auto",
  });

  return NextResponse.json({ subgrid: sub }, { status: 201 });
}
