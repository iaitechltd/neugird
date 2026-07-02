/**
 * /api/agents
 * GET  → all agents (with the current user's id, to mark "mine").
 * POST → create a NATIVE agent owned by the current user.
 */

import { NextResponse } from "next/server";
import { Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mine = url.searchParams.get("mine") === "1";
  const uid = await getCurrentUserId();
  const agents = (mine ? Agents.agentsByOwner(uid) : Agents.listAgents()).map((a) => {
    Agents.evaluateTrust(a);
    const verified = Agents.paidJobCount(a.agent_id);
    return { ...a, api_key: undefined, api_key_hash: undefined, verified_jobs: verified, jobs_to_trusted: a.trust_tier === "trusted" ? 0 : Math.max(0, Agents.PROMOTE_MIN_JOBS - verified) };
  });
  return NextResponse.json({ agents, me: { id: uid } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const owner_id = await getCurrentUserId();
  const agent = Agents.createAgent({
    owner_id,
    name: body.name.trim(),
    capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter((c: unknown) => typeof c === "string") : undefined,
    permissions: Array.isArray(body.permissions) ? body.permissions.filter((p: unknown) => typeof p === "string") : undefined,
    owner_split_bps: typeof body.owner_split_bps === "number" ? body.owner_split_bps : undefined,
    spend_limit_per_job: typeof body.spend_limit_per_job === "number" ? body.spend_limit_per_job : undefined,
    grid_id: typeof body.grid_id === "string" ? body.grid_id : undefined,
  });
  return NextResponse.json({ agent }, { status: 201 });
}
