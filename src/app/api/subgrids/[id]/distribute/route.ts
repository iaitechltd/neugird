/**
 * POST /api/subgrids/[id]/distribute — pay revenue THROUGH the split agreement:
 * the admin's USDC divides across the parties by basis points (agents' shares
 * land on their beneficiary/owner), each share a settlement receipt. Mirrors as
 * ONE atomic on-chain split when the chain rail is armed. Body: { amount }.
 */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { not_found: 404, not_admin: 403, no_splits: 409, insufficient_usdc: 402 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();
  const { paid, error } = GridRegistry.distributeSubGridRevenue(id, uid, Number(body?.amount));
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ paid });
}
