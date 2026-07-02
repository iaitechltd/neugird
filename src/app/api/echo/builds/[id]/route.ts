/**
 * /api/echo/builds/[id]
 * GET → one build (the witnessed step log + artifact + proof-of-build).
 */

import { NextResponse } from "next/server";
import { Echo } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const build = Echo.getBuild(id);
  if (!build) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ build });
}
