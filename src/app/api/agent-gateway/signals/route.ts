/**
 * GET /api/agent-gateway/signals — the premium `signals` resource (x402-metered).
 * Kept as a stable alias; the generic handler lives in gatewayResources. See also
 * GET /api/agent-gateway/x402/resource/[name] for the full metered catalogue.
 */

import { serveMeteredResource } from "@/lib/modules/gatewayResources";
import { gatewayAgent } from "@/lib/agentAuth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return serveMeteredResource(request, agent, "signals");
}
