/**
 * GET /api/talent/[id] — one person's full, verifiable track record:
 * identity + multi-dim reputation, plus everything they've shipped — delivered
 * jobs, Echo proof-of-builds, Fund proposals, and agents they own. This IS
 * the "auto-generated résumé from verified work" the platform is built on.
 */

import { NextResponse } from "next/server";
import { Users, Jobs, Echo, Genesis, Agents, Attestations, Pulse, Social } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const short = (a?: string) => (a && a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a ?? "");

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const u = Users.getUser(id);
  if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const me = await getCurrentUserId();

  const assigned = Jobs.listJobs({ assignee_id: id });
  const delivered = assigned.filter((j) => j.status === "paid");
  const builds = Echo.buildsForUser(id);
  const proposals = Genesis.listProposals({ author_id: id });
  const agents = Agents.agentsByOwner(id);
  const credentials = Attestations.sync(id, "user").filter((a) => a.status === "active");

  return NextResponse.json({
    profile: {
      id: u.id,
      username: u.username,
      wallet: short(u.wallet_addresses[0]),
      bio: u.bio ?? "",
      skills: u.skills ?? [],
      pulse: u.pulse_score,
      reputation: u.reputation?.total ?? 0,
      by_dimension: u.reputation?.by_dimension ?? {},
      grids: u.joined_grids?.length ?? 0,
      created_at: u.created_at,
      earned_usdc: Social.incomeFor(id).total, // real money in — the résumé's bottom line
      follows: Social.followCounts(id),
      is_following: me !== id && Social.isFollowing(me, id),
    },
    track_record: {
      jobs_done: delivered.length,
      jobs: assigned.slice(0, 12).map((j) => ({ job_id: j.job_id, title: j.title, reward: j.reward_amount, status: j.status, skills: j.required_skills })),
      builds: builds.map((b) => ({ build_id: b.build_id, title: b.title, kind: b.artifact.kind, proof: b.artifact.proof_of_build, stack: b.stack, status: b.status })),
      proposals: proposals.map((p) => ({ proposal_id: p.proposal_id, title: p.title, status: p.status, ask: p.ask_amount, category: p.category })),
      agents: agents.map((a) => ({ agent_id: a.agent_id, name: a.name, rating: a.rating, capabilities: a.capabilities })),
    },
    credentials,
    // V6 — reputation is alive: the latest Pulse movement, gains and fades alike.
    rep_events: Pulse.forTarget("user", id).slice(0, 8).map((e) => ({ action: e.action_type, weight: e.weight, reason: e.reason, at: e.timestamp })),
    is_me: me === id,
  });
}
