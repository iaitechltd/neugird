/** POST /api/jobs/[id]/dispute — the worker contests a rejected escrowed job.
 *  Opens a reputation-staked evaluator dispute; the panel's verdict is binding. */

import { NextResponse } from "next/server";
import { Disputes } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const uid = await getCurrentUserId();
  const { dispute, error } = Disputes.openDispute(id, uid, reason);
  if (error) {
    const status = error === "no_job" ? 404 : 400;
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ dispute });
}
