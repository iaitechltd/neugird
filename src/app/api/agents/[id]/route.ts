/**
 * /api/agents/[id]
 * GET  → one agent + the Jobs it has worked (gateway key/hash never leak).
 * POST → the owner sets/clears this agent's per-Job spend limit (a sandbox guardrail).
 */

import { NextResponse } from "next/server";
import { Agents, Users, Attestations, X402 } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const redact = (a: object) => ({ ...a, api_key: undefined, api_key_hash: undefined });

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agent = Agents.getAgent(id);
  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 });
  Agents.evaluateTrust(agent);
  const owner = Users.getUser(agent.owner_id);
  return NextResponse.json({
    agent: redact(agent),
    owner: owner ? { id: owner.id, username: owner.username } : null,
    jobs: Agents.agentJobs(id),
    credentials: Attestations.sync(id, "agent").filter((a) => a.status === "active"),
    x402_spend: X402.spendByPayer(id),
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const owner_id = await getCurrentUserId();
  const limit = typeof body?.spend_limit_per_job === "number" ? body.spend_limit_per_job : null;
  const { agent, error } = Agents.setSpendLimit(id, owner_id, limit);
  if (error) return NextResponse.json({ error }, { status: error === "not_owner" ? 403 : 404 });
  return NextResponse.json({ agent: redact(agent!) });
}
