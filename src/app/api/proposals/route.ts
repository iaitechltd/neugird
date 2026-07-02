/**
 * /api/proposals
 * GET  → list proposals (each with raised), plus the current user's propose-eligibility.
 * POST → create a proposal (reputation-gated).
 */

import { NextResponse } from "next/server";
import { Genesis } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { ProposalStatus, MilestoneDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") as ProposalStatus | null) ?? undefined;
  const uid = await getCurrentUserId();
  const proposals = Genesis.listProposals({ status }).map((p) => ({
    ...Genesis.proposalView(p.proposal_id),
    i_backed: Genesis.hasBacked(p.proposal_id, uid),
  }));
  return NextResponse.json({
    proposals,
    me: { id: uid, reputation: Genesis.reputationOf(uid), can_propose: Genesis.canPropose(uid), min: Genesis.PROPOSE_REPUTATION_MIN },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || typeof body.ask_amount !== "number") {
    return NextResponse.json({ error: "title and numeric ask_amount required" }, { status: 400 });
  }
  const author_id = await getCurrentUserId();
  const roadmap: MilestoneDraft[] = Array.isArray(body.roadmap)
    ? body.roadmap.filter((m: { title?: unknown; amount?: unknown }) => m && typeof m.title === "string" && typeof m.amount === "number")
    : [];
  const { proposal, error } = Genesis.createProposal({
    author_id,
    title: body.title,
    summary: typeof body.summary === "string" ? body.summary : "",
    category: typeof body.category === "string" ? body.category : "Project",
    ask_amount: body.ask_amount,
    roadmap,
    build_id: typeof body.build_id === "string" ? body.build_id : undefined,
  });
  if (error) return NextResponse.json({ error }, { status: error === "insufficient_reputation" ? 403 : 400 });
  return NextResponse.json({ proposal }, { status: 201 });
}
