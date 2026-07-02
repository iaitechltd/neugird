/**
 * GET /api/agent-gateway/x402/resource/[name] — the generic x402-metered resource
 * endpoint. `name` ∈ the x402 catalogue (signals, boost, market_data, provenance,
 * discovery). 402 → pay (real X-PAYMENT in solana mode, mock proof in memory mode)
 * → the resource payload. Some resources read query params (e.g. provenance ?market=).
 */

import { serveMeteredResource } from "@/lib/modules/gatewayResources";
import { gatewayAgent } from "@/lib/agentAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  return serveMeteredResource(request, agent, name);
}
