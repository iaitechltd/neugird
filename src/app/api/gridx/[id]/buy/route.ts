/**
 * POST /api/gridx/[id]/buy — buy the product: real USDC buyer → owner (minus the
 * governable GridX fee → treasury); the receipt drives DERIVED revenue + income.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const STATUS: Record<string, number> = { not_found: 404, own_product: 403, already_owned: 409, insufficient_usdc: 402 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const { paid, error } = GridX.purchase(id, uid);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ purchased: true, paid });
}
