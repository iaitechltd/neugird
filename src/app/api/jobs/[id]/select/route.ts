/** POST /api/jobs/[id]/select — the poster selects an applicant, assigning the Job.
 *  Body: { application_id }. Creator-only. */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = {
  job_not_found: 404,
  not_creator: 403,
  not_open: 400,
  application_not_found: 404,
  insufficient_usdc: 402,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => ({}));
  if (typeof body?.application_id !== "string") {
    return NextResponse.json({ error: "application_id required" }, { status: 400 });
  }
  const { job, error } = Jobs.selectApplicant(id, body.application_id, uid);
  if (error) return NextResponse.json({ error }, { status: STATUS[error] ?? 400 });
  return NextResponse.json({ job });
}
