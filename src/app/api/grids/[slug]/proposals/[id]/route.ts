/** POST /api/grids/[slug]/proposals/[id] — act on a grid proposal.
 *  Body { action: "vote", support } (members) | { action: "resolve" } (admin/proposer).
 *  Returns the refreshed proposal view. */

import { NextResponse } from "next/server";
import { GridGov } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_open: 409, not_member: 403, already_voted: 409, already_resolved: 409, not_allowed: 403 };

export async function POST(request: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const r = body?.action === "resolve" ? GridGov.resolve(id, uid) : GridGov.vote(id, uid, body?.support !== false);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ proposal: GridGov.proposalView(r.proposal!, uid) });
}
