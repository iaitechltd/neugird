/** GET/POST /api/markets/[id]/agent — Agent Mode: read state, or arm a mandate.
 *  GET returns the caller's Agent-Mode state for this market (mandate + activity
 *  + their available agents). POST authorizes an agent to trade under a bounded
 *  mandate (the consent + risk boundary). Cookie session = the owner. */

import { NextResponse } from "next/server";
import { AgentTrading } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { MarketStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  no_market: 404,
  agent_not_found: 404,
  not_owner: 403,
  agent_suspended: 403,
  bad_budget: 400,
  no_stages: 400,
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  return NextResponse.json(AgentTrading.marketAgentState(id, uid));
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  if (!body?.agent_id) return NextResponse.json({ error: "agent_id required" }, { status: 400 });

  const { mandate, error } = AgentTrading.createMandate({
    market_id: id,
    owner_id: uid,
    agent_id: String(body.agent_id),
    budget_usdc: Number(body.budget_usdc),
    max_position_usd: body.max_position_usd != null ? Number(body.max_position_usd) : undefined,
    max_leverage: body.max_leverage != null ? Number(body.max_leverage) : undefined,
    allowed_stages: Array.isArray(body.allowed_stages) ? (body.allowed_stages as MarketStage[]) : undefined,
    stop_loss_pct: body.stop_loss_pct != null ? Number(body.stop_loss_pct) : undefined,
    daily_loss_cap: body.daily_loss_cap != null ? Number(body.daily_loss_cap) : undefined,
    strategy: body.strategy,
    duration_hours: body.duration_hours != null ? Number(body.duration_hours) : undefined,
  });
  if (error || !mandate) return NextResponse.json({ error: error ?? "failed" }, { status: STATUS[error ?? ""] ?? 400 });
  // Return the ENRICHED state (its `mandate` carries budget_used_pct etc.) — do
  // not append the raw mandate, which would clobber the enriched one.
  return NextResponse.json(AgentTrading.marketAgentState(id, uid));
}
