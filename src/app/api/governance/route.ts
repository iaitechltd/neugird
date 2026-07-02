/** /api/governance — GRID-weighted protocol governance.
 *  GET  → all proposals (enriched views) + the caller's GRID balance / propose-eligibility.
 *  POST → open a proposal { kind, title, summary, quorum } (proposer must hold ≥ PROPOSE_MIN_GRID). */

import { NextResponse } from "next/server";
import { Governance, Wallets, Params } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { need_grid_to_propose: 402, title_required: 400, bad_param: 400, bad_value: 400, bad_amount: 400, bad_recipient: 400, bad_action: 400 };

export async function GET() {
  const uid = await getCurrentUserId();
  const grid = Wallets.balances(uid).grid;
  return NextResponse.json({
    proposals: Governance.listProposals().map((p) => Governance.proposalView(p, uid)),
    me: { grid, can_propose: grid >= Governance.PROPOSE_MIN_GRID, propose_min: Governance.PROPOSE_MIN_GRID },
    params: Params.all(), // live protocol parameters governance can turn
  });
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const r = Governance.createProposal(uid, { kind: body.kind, title: body.title, summary: body.summary, quorum: Number(body.quorum) || undefined, action: body.action });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ proposal: Governance.proposalView(r.proposal!, uid) });
}
