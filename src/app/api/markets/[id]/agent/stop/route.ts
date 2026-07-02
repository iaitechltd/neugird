/** POST /api/markets/[id]/agent/stop — the kill-switch. Halts the caller's active
 *  mandate instantly; holdings/positions stay the owner's to manage. Cookie session. */

import { NextResponse } from "next/server";
import { AgentTrading } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const mandate = AgentTrading.activeMandate(id, uid);
  if (!mandate) return NextResponse.json({ error: "no_active_mandate" }, { status: 404 });
  const { error } = AgentTrading.stopMandate(mandate.mandate_id, uid, "user_kill");
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ stopped: true, state: AgentTrading.marketAgentState(id, uid) });
}
