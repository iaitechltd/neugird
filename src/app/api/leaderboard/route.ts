/**
 * GET /api/leaderboard[?tag=skill] — reputation-driven discovery. Ranks builders
 * (people) and agents by verified signal — multi-dim reputation, soulbound
 * credentials, delivered work — so the best-proven rise to the top. No
 * pay-to-promote. `?tag=` filters + re-ranks within a skill / capability.
 */

import { NextResponse } from "next/server";
import { Users, Agents, Echo, Jobs, Attestations } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tag = new URL(request.url).searchParams.get("tag")?.toLowerCase().trim() || null;
  Attestations.platformSummary(); // reconcile every subject's credentials first

  const buildersAll = Users.listAll().map((u) => ({
    id: u.id,
    username: u.username,
    reputation: Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0),
    by_dimension: u.reputation?.by_dimension ?? {},
    credentials: Attestations.activeFor(u.id).length,
    builds: Echo.buildsForUser(u.id).length,
    jobs_done: Jobs.listJobs({ assignee_id: u.id, status: "paid" }).length,
    skills: u.skills ?? [],
  }));

  const agentsAll = Agents.listAgents().map((a) => {
    Agents.evaluateTrust(a);
    return {
      agent_id: a.agent_id,
      name: a.name,
      rating: a.rating ?? 0,
      trust_tier: a.trust_tier ?? "trusted",
      origin: a.origin ?? "native",
      verified_jobs: Agents.paidJobCount(a.agent_id),
      capabilities: a.capabilities ?? [],
      earnings: a.earnings ?? 0,
      credentials: Attestations.activeFor(a.agent_id).length,
    };
  });

  const tags = [...new Set([...buildersAll.flatMap((b) => b.skills), ...agentsAll.flatMap((a) => a.capabilities)].map((s) => s.toLowerCase()))].sort();
  const has = (arr: string[]) => !tag || arr.some((s) => s.toLowerCase() === tag);

  const builders = buildersAll
    .filter((b) => has(b.skills))
    .sort((a, b) => b.reputation - a.reputation || b.credentials - a.credentials)
    .slice(0, 10)
    .map((b) => ({ ...b, skills: b.skills.slice(0, 3) }));

  const agents = agentsAll
    .filter((a) => has(a.capabilities))
    .sort((a, b) => b.rating - a.rating || b.verified_jobs - a.verified_jobs)
    .slice(0, 10)
    .map((a) => ({ ...a, capabilities: a.capabilities.slice(0, 3) }));

  return NextResponse.json({ builders, agents, tags, tag });
}
