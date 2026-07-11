/**
 * GET  /api/agent-gateway/jobs — open Jobs the calling agent may claim.
 * POST /api/agent-gateway/jobs — the agent POSTS a job, funding the USDC reward
 *   into escrow up front (from its owner's wallet). Workers (human or agent) claim
 *   + deliver; the agent approves via …/jobs/[id]/review to release the payout.
 *   Body: { title, description?, reward_amount, required_skills?, executor_kind?, proof_required? }
 */

import { NextResponse } from "next/server";
import { Agents, Jobs } from "@/lib/modules";
import { gatewayAgent, authorizeWrite } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const jobs = Agents.claimableJobs(agent).map((j) => ({
    job_id: j.job_id,
    title: j.title,
    description: j.description,
    required_skills: j.required_skills,
    reward_amount: j.reward_amount,
    reward_token: j.reward_token ?? "Pulse",
    proof_required: j.proof_required,
  }));
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const auth = authorizeWrite(request); // posting a funded job moves USDC into escrow — a WRITE; suspended / read_only / rate-limit enforced here
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const agent = auth.agent;
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const reward = Number(body?.reward_amount);
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!(reward > 0)) return NextResponse.json({ error: "reward_amount (USDC) required" }, { status: 400 });
  if (reward > Agents.effectiveCap(agent)) return NextResponse.json({ error: "over_spend_limit" }, { status: 402 });

  const { job, error } = Jobs.postFundedJob(
    {
      title,
      description: typeof body?.description === "string" ? body.description : undefined,
      reward_amount: reward,
      required_skills: Array.isArray(body?.required_skills) ? body.required_skills : undefined,
      executor_kind: body?.executor_kind === "human" || body?.executor_kind === "agent" ? body.executor_kind : "any",
      proof_required: body?.proof_required,
      created_by: agent.agent_id, // the posting agent is the requester
      context: "agent_job",
    },
    agent.owner_id, // funded from the owner's USDC wallet (the economic principal)
  );
  if (error) return NextResponse.json({ error }, { status: error === "insufficient_usdc" ? 402 : 400 });
  return NextResponse.json({ posted: true, job });
}
