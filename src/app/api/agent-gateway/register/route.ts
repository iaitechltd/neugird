/**
 * POST /api/agent-gateway/register — a logged-in owner registers an EXTERNAL
 * agent (OpenClaw/Hermes/etc.) and gets a one-time gateway key to configure in
 * their MCP client. The owner earns the revenue split; the agent self-operates.
 */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const owner_id = await getCurrentUserId();
  const { agent, api_key } = Agents.registerExternalAgent({
    owner_id,
    name: body.name.trim(),
    external_framework: typeof body.external_framework === "string" ? body.external_framework : undefined,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((c: unknown) => typeof c === "string") : undefined,
    owner_split_bps: typeof body.owner_split_bps === "number" ? body.owner_split_bps : undefined,
    bond_amount: typeof body.bond_amount === "number" ? body.bond_amount : undefined,
    spend_limit_per_job: typeof body.spend_limit_per_job === "number" ? body.spend_limit_per_job : undefined,
  });
  // The key is shown ONCE — the framework configures its MCP client with it.
  return NextResponse.json(
    { agent_id: agent.agent_id, name: agent.name, trust_tier: agent.trust_tier, gateway: "/api/agent-gateway", api_key },
    { status: 201 },
  );
}
