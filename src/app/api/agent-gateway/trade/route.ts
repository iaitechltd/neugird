/** POST /api/agent-gateway/trade — the external door of Agent Mode.
 *
 * An outside agent (SDK/MCP), authed by its gateway key (`x-ng-agent-key`),
 * trades a market within the **active "external" mandate its owner armed**. The
 * agent supplies the decision; the server resolves the owner, enforces the SAME
 * mandate guardrails as the native runner, executes on the owner's wallet, and
 * records an attributed action. Non-custodial: the mandate is the scoped consent.
 *
 * Body: { market_id, action: "buy"|"sell"|"open"|"close", amount?, side?,
 *         collateral?, leverage?, position_id?, rationale? }.
 */

import { NextResponse } from "next/server";
import { AgentTrading } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  no_active_mandate: 404,
  not_external_mandate: 403,
  no_market: 404,
  no_position: 404,
  bad_amount: 400,
  bad_action: 400,
};

/** GET /api/agent-gateway/trade?market_id=… — the agent reads its scoped mandate
 *  + a market snapshot before deciding (no owner-level data). */
export async function GET(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const market_id = new URL(request.url).searchParams.get("market_id");
  if (!market_id) return NextResponse.json({ error: "market_id required" }, { status: 400 });
  return NextResponse.json(AgentTrading.externalMandateView(agent.agent_id, market_id));
}

export async function POST(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.market_id) return NextResponse.json({ error: "market_id required" }, { status: 400 });

  const result = AgentTrading.externalTrade(agent.agent_id, String(body.market_id), body);
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  }
  return NextResponse.json({ action: result.action, mandate: result.mandate });
}
