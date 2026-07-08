/** POST /api/skills/[id]/install — install a published skill onto one of the
 *  caller's agents { target_agent_id }. Charges GRID (installer → author). */

import { NextResponse } from "next/server";
import { SkillsMarket } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body?.target_agent_id) return NextResponse.json({ error: "target_agent_id required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const result = SkillsMarket.install({ published_id: id, target_agent_id: body.target_agent_id, installer_id: uid });
  if (result.error) {
    const status = result.error === "not_available" || result.error === "no_agent" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result);
}
