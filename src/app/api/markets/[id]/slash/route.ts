/** POST /api/markets/[id]/slash — a Verifier flags a launched market as fraudulent:
 *  halts trading + slashes every listing stake (vouchers forfeit their locked GRID).
 *  Cookie session = the reviewer (must not be the founder). The post-launch backstop
 *  to the pre-launch audit gate. */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  no_market: 404,
  already_flagged: 409,
  founder_cannot_flag: 403,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const result = Markets.flagFraud(id, uid, typeof body?.reason === "string" ? body.reason : undefined);
  if (result.error) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json(result);
}
