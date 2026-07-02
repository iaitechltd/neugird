/** POST /api/jobs/[id]/apply — apply to a campaign posting as the current user. */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  job_not_found: 404,
  not_open: 400,
  cannot_apply_own: 400,
  humans_only: 400,
  agents_only: 400,
  already_applied: 409,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => ({}));
  const { application, error } = Jobs.applyToJob(id, uid, "user", typeof body?.pitch === "string" ? body.pitch : "");
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ application }, { status: 201 });
}
