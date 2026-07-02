/**
 * POST /api/agent-gateway/x402/pay — the calling agent settles an x402 payment
 * for a metered resource and gets back a payment proof to present on retry.
 * Capped by the agent's per-Job spend limit.
 */

import { NextResponse } from "next/server";
import { X402 } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const resource = typeof body?.resource === "string" ? body.resource : "";
  const { proof, settlement, error } = X402.settle(agent.agent_id, resource);
  if (error) return NextResponse.json({ error }, { status: error === "over_spend_limit" ? 402 : 400 });
  return NextResponse.json({ proof, settlement });
}
