/** POST /api/subgrids/[id]/splits — a SubGrid admin sets the ownership split
 *  agreement. Body { splits: [{ party_id, party_type, beneficiary_id?, basis_points, role? }] }
 *  (basis points must sum to 10000). Empty array clears it. */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { ContributorSplit } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_admin: 403, unknown_party: 400, must_sum_10000: 400 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const splits: ContributorSplit[] = Array.isArray(body?.splits) ? body.splits : [];
  const r = GridRegistry.setSubGridSplits(id, uid, splits);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}
