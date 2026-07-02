/** POST /api/proposals/[id]/killswitch — a backer pulls the stall kill-switch:
 *  the funded project's UNRELEASED treasury returns to backers pro-rata.
 *  Only arms after `genesis_stall_days` with zero milestone activity. */

import { NextResponse } from "next/server";
import { Genesis } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = Genesis.triggerKillSwitch(id, uid);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
