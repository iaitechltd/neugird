/** POST /api/markets/[id]/graduate — advance Alpha→Spot→Futures when the gate is met. */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = Markets.graduateMarket(id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
