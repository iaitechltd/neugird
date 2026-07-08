/** DELETE /api/skills/[id] — the author delists their published skill (installed
 *  copies keep working; it just stops being installable). */

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
