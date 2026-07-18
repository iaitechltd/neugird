/**
 * /api/studio — Echo Studio workspaces (docs/ECHO_STUDIO.md Phase 2).
 * GET  → the caller's workspaces + engine availability + run cost.
 * POST → open a new workspace: { name }.
 */

import { NextResponse } from "next/server";
import { Studio } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  const workspaces = Studio.listFor(uid).map((w) => ({
    workspace_id: w.workspace_id, name: w.name, status: w.status, build_id: w.build_id,
    turns: w.turns.length, trail_sha: w.trail_sha, spent_grid: w.spent_grid, updated_at: w.updated_at,
  }));
  return NextResponse.json({ workspaces, engine_ready: Studio.engineReady(), run_cost: Studio.runCost() });
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const r = Studio.createWorkspace(uid, String(body?.name ?? ""));
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ workspace: r.workspace }, { status: 201 });
}
