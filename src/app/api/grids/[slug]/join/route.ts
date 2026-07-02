/**
 * POST /api/grids/[slug]/join   — join the Grid as the current user.
 * DELETE /api/grids/[slug]/join — leave it.
 * Joining bumps the Grid's Pulse (network activity), not the joiner's reputation
 * (reputation must be earned through verified work, not by clicking Join).
 */

import { NextResponse } from "next/server";
import { GridRegistry, Pulse } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const uid = await getCurrentUserId();
  if (grid.owner_id === uid) {
    return NextResponse.json({ joined: true, member_count: grid.member_count, owner: true });
  }
  if (!GridRegistry.isMember(grid.grid_id, uid)) {
    GridRegistry.joinGrid(grid.grid_id, uid);
    Pulse.recordEvent({
      target_type: "grid",
      target_id: grid.grid_id,
      user_id: uid,
      action_type: "grid_joined",
      weight: 5,
      reason: "New member joined the Grid",
      verification_source: "auto",
    });
  }
  return NextResponse.json({ joined: true, member_count: GridRegistry.getGrid(slug)!.member_count });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const uid = await getCurrentUserId();
  GridRegistry.leaveGrid(grid.grid_id, uid);
  return NextResponse.json({ joined: false, member_count: GridRegistry.getGrid(slug)!.member_count });
}
