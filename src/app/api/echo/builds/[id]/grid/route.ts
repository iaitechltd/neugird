/**
 * /api/echo/builds/[id]/grid
 * POST → create (or return) the build's home/project Grid — the Launchpad's
 *        "Create Project Grid" action. Only the builder may do this.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const { grid, created, error } = GridX.ensureHomeGrid(id, uid);
  if (error) return NextResponse.json({ error }, { status: error === "not_found" ? 404 : error === "not_owner" ? 403 : 400 });
  return NextResponse.json({ grid, created }, { status: created ? 201 : 200 });
}
