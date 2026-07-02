/** POST /api/jobs/[id]/submit — the assignee submits proof of work. */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const proof = typeof body?.proof === "string" ? body.proof.trim() : "";
  if (!proof) return NextResponse.json({ error: "proof required" }, { status: 400 });

  const uid = await getCurrentUserId();
  const job = Jobs.getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.assignee_id !== uid) return NextResponse.json({ error: "not_assignee" }, { status: 403 });

  const updated = Jobs.submitProof(id, uid, proof);
  if (!updated) return NextResponse.json({ error: "bad_state" }, { status: 400 });
  return NextResponse.json({ job: updated });
}
