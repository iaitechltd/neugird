/**
 * /api/campaignx — CampaignX promotional postings (Jobs with context "campaign_task").
 * GET  → promotional jobs (enriched with the project Grid), the current user, their
 *        owned Grids, and Echo grid suggestions.
 * POST → post a promotional job for a Grid the current user owns.
 */

import { NextResponse } from "next/server";
import { CampaignX, GridRegistry, Jobs, Users, Agents } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { JobStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") as JobStatus | null) ?? undefined;
  const uid = await getCurrentUserId();
  const jobs = CampaignX.listPromos({ status }).map((j) => {
    const grid = j.grid_id ? GridRegistry.getGrid(j.grid_id) : undefined;
    const apps = Jobs.listApplications(j.job_id);
    const assignee_name = j.assignee_id
      ? (j.assignee_type === "agent" ? Agents.getAgent(j.assignee_id)?.name : Users.getUser(j.assignee_id)?.username) ?? j.assignee_id
      : null;
    return {
      ...j,
      project_name: grid?.name ?? j.grid_id ?? "—",
      project_slug: grid?.slug ?? "",
      applicant_count: apps.length,
      applied: apps.some((a) => a.applicant_id === uid && a.status !== "withdrawn"),
      assignee_name,
    };
  });
  const myGrids = GridRegistry.listGrids()
    .filter((g) => g.owner_id === uid)
    .map((g) => ({ grid_id: g.grid_id, name: g.name, slug: g.slug }));
  return NextResponse.json({ jobs, me: { id: uid }, my_grids: myGrids, suggested: CampaignX.suggestGrids() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.grid_id !== "string" || typeof body.title !== "string" || typeof body.reward !== "number") {
    return NextResponse.json({ error: "grid_id, title and numeric reward required" }, { status: 400 });
  }
  const created_by = await getCurrentUserId();
  const seeking: "human" | "agent" | "any" = ["human", "agent", "any"].includes(body.seeking) ? body.seeking : "any";
  const skills: string[] = Array.isArray(body.skills)
    ? body.skills.filter((s: unknown): s is string => typeof s === "string")
    : typeof body.skills === "string"
      ? body.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
  const { job, error } = CampaignX.postPromo({
    grid_id: body.grid_id,
    created_by,
    title: body.title,
    brief: typeof body.brief === "string" ? body.brief : "",
    seeking,
    skills,
    reward: body.reward,
    reward_token: typeof body.reward_token === "string" ? body.reward_token : undefined,
  });
  if (error) return NextResponse.json({ error }, { status: error === "not_owner" ? 403 : 400 });
  return NextResponse.json({ job }, { status: 201 });
}
