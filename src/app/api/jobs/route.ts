/**
 * /api/jobs
 * GET  → list jobs (filters: grid_id, subgrid_id, status, mine=doing|created).
 * POST → post a job as the current user.
 */

import { NextResponse } from "next/server";
import { Jobs } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const grid_id = url.searchParams.get("grid_id") ?? undefined;
  const subgrid_id = url.searchParams.get("subgrid_id") ?? undefined;
  const status = (url.searchParams.get("status") as JobStatus | null) ?? undefined;
  const mine = url.searchParams.get("mine");
  let assignee_id: string | undefined;
  let created_by: string | undefined;
  if (mine === "doing") assignee_id = await getCurrentUserId();
  if (mine === "created") created_by = await getCurrentUserId();
  return NextResponse.json({ jobs: Jobs.listJobs({ grid_id, subgrid_id, status, assignee_id, created_by }) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || typeof body.reward_amount !== "number") {
    return NextResponse.json({ error: "title and numeric reward_amount required" }, { status: 400 });
  }
  const created_by = await getCurrentUserId();
  const skills = Array.isArray(body.required_skills)
    ? body.required_skills
    : typeof body.skills === "string"
      ? body.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  const job = Jobs.createJob({
    title: body.title,
    description: typeof body.description === "string" ? body.description : "",
    reward_amount: body.reward_amount,
    required_skills: skills,
    grid_id: typeof body.grid_id === "string" ? body.grid_id : undefined,
    subgrid_id: typeof body.subgrid_id === "string" ? body.subgrid_id : undefined,
    context: body.context,
    executor_kind: body.executor_kind,
    created_by,
  });
  return NextResponse.json({ job }, { status: 201 });
}
