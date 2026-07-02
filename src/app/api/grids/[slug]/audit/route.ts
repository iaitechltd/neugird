/** POST /api/grids/[slug]/audit — the founder requests a security audit (after delivery). */

import { NextResponse } from "next/server";
import { GridRegistry, Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const { audit, error } = Markets.requestAudit(grid.grid_id, uid);
  if (error) return NextResponse.json({ error }, { status: error === "only_founder" ? 403 : 400 });
  return NextResponse.json({ audit }, { status: 201 });
}
