/** POST /api/governance/[id]/resolve — tally a proposal and RETURN every locked GRID.
 *  Passes when for_grid ≥ quorum_grid AND for_grid > against_grid; otherwise rejected.
 *  (Demo: callable any time. In production this fires automatically at closes_at.) */

import { NextResponse } from "next/server";
import { Governance, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, already_resolved: 409 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = Governance.resolve(id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ proposal: Governance.proposalView(r.proposal!, uid), passed: r.passed, returned: r.returned, grid: Wallets.balances(uid).grid });
}
