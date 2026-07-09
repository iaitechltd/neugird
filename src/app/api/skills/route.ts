/** GET /api/skills — the skills marketplace: listed skills + my agents (install
 *  targets) + my publishable (unlisted, work-earned) skills + my publisher stats.
 *  POST /api/skills — publish a learned skill { agent_id, skill_id, price_grid?, summary? }. */

import { NextResponse } from "next/server";
import { SkillsMarket, Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  const listings = SkillsMarket.listListed().map((p) => SkillsMarket.view(p, uid));
  const myAgents = Agents.listAgents({ owner_id: uid }).map((a) => ({ agent_id: a.agent_id, name: a.name }));
  return NextResponse.json({
    listings,
    my_agents: myAgents,
    my_publishable: SkillsMarket.publishableFor(uid),
    stats: SkillsMarket.statsFor(uid),
    market: SkillsMarket.marketStats(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.agent_id || !body?.skill_id) return NextResponse.json({ error: "agent_id and skill_id required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const { published, error } = SkillsMarket.publish({
    agent_id: body.agent_id, skill_id: body.skill_id, owner_id: uid,
    price_grid: typeof body.price_grid === "number" ? body.price_grid : 0,
    summary: typeof body.summary === "string" ? body.summary : undefined,
  });
  if (error) return NextResponse.json({ error }, { status: error === "no_agent" ? 404 : 400 });
  return NextResponse.json({ published });
}
