/** POST /api/markets/[id]/agent/tick — advance the caller's active mandate one
 *  step. The agent evaluates its strategy and executes at most one guardrailed
 *  action. Driven by the open terminal today (the UI polls); the same entrypoint
 *  is the seam for a server-side scheduler to run it 24/7. Cookie session = owner. */

import { NextResponse } from "next/server";
import { AgentTrading } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const mandate = AgentTrading.activeMandate(id, uid);
  if (!mandate) return NextResponse.json({ error: "no_active_mandate" }, { status: 404 });
  const result = AgentTrading.runTick(mandate.mandate_id);
  return NextResponse.json({ action: result.action ?? null, skipped: result.skipped ?? null, state: AgentTrading.marketAgentState(id, uid) });
}
