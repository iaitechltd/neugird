/** POST /api/audits/[id]/review — a Verifier (not the founder) passes or fails the audit. */

import { NextResponse } from "next/server";
import { Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const pass = !!body?.pass;
  const notes = typeof body?.notes === "string" ? body.notes : undefined;
  const uid = await getCurrentUserId();
  const { audit, error } = Markets.reviewAudit(id, uid, pass, notes);
  if (error) return NextResponse.json({ error }, { status: error === "founder_cannot_review" ? 403 : 400 });
  return NextResponse.json({ audit });
}
