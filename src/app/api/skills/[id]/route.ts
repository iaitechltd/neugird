/** DELETE /api/skills/[id] — the author delists their published skill (installed
 *  copies keep working; it just stops being installable).
 *  PATCH /api/skills/[id] — the author reprices the listing { price_grid } (0 = free). */

import { NextResponse } from "next/server";
import { SkillsMarket } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const { ok, error } = SkillsMarket.delist(id, uid);
  if (error) return NextResponse.json({ error }, { status: error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.price_grid !== "number") return NextResponse.json({ error: "price_grid required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const { published, error } = SkillsMarket.updatePrice(id, uid, body.price_grid);
  if (error) return NextResponse.json({ error }, { status: error === "not_found" ? 404 : 400 });
  return NextResponse.json({ published: SkillsMarket.view(published!, uid) });
}
