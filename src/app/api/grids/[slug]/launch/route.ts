/**
 * /api/grids/[slug]/launch
 * GET  → launch eligibility + any existing market for this project Grid.
 * POST → launch the token on Alpha (founder only; requires all milestones released).
 */

import { NextResponse } from "next/server";
import { GridRegistry, Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ eligibility: Markets.canLaunch(grid.grid_id), market: Markets.marketForGrid(grid.grid_id) ?? null, audit: Markets.auditFor(grid.grid_id) ?? null });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const symbol = typeof body?.symbol === "string" ? body.symbol : undefined;
  const result = Markets.launchToken(grid.grid_id, uid, symbol);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "only_founder" ? 403 : 400 });
  return NextResponse.json(result, { status: 201 });
}
