/** /api/grids/[slug]/proposals — grid-member governance (reputation-weighted).
 *  GET → proposals (enriched) + the caller's membership. POST → open a proposal
 *  { kind, title, summary, target_post_id? } (members only). */

import { NextResponse } from "next/server";
import { GridRegistry, GridGov } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { no_grid: 404, not_member: 403, title_required: 400, bad_post: 400 };

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  return NextResponse.json({
    proposals: GridGov.listProposals(grid.grid_id).map((p) => GridGov.proposalView(p, uid)),
    me: { id: uid, is_member: grid.owner_id === uid || GridRegistry.isMember(grid.grid_id, uid) },
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const r = GridGov.createProposal(grid.grid_id, uid, { kind: body.kind, title: body.title, summary: body.summary, target_post_id: body.target_post_id });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ proposal: GridGov.proposalView(r.proposal!, uid) }, { status: 201 });
}
