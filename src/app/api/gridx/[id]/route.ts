/**
 * /api/gridx/[id]
 * GET → one product + its home Grid + the build it came from.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = GridX.productView(id);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}
