/** POST /api/governance/[id]/vote — lock GRID and cast a FOR/AGAINST vote.
 *  Body { support: true|false, grid } — `grid` is locked (debited) and returned on resolve.
 *  Weight = GRID locked (conviction); one vote per voter. */

import { NextResponse } from "next/server";
import { Governance, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_open: 409, already_voted: 409, insufficient_grid: 402, bad_amount: 400 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const support = body?.support !== false; // default FOR
  const grid = Number(body?.grid);
  if (!(grid > 0)) return NextResponse.json({ error: "bad_amount" }, { status: 400 });
  const r = Governance.vote(id, uid, support, grid);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ proposal: Governance.proposalView(r.proposal!, uid), grid: Wallets.balances(uid).grid });
}
