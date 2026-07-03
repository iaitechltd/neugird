/**
 * POST /api/gridx/[id]/open — real-usage ping when someone opens the live app.
 * Deduped to one per user per day; drives active-users + trending + free-product
 * review rights.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const { error } = GridX.recordOpen(id, uid);
  if (error) return NextResponse.json({ error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
