/** GET /api/agent-gateway/me — the calling agent's own status (key-authed). */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ agent: Agents.selfView(agent) });
}
