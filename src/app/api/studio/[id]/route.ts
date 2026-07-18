/**
 * /api/studio/[id] — one workshop.
 * GET  → the room view (turns, trail, checkpoints, files, build, live progress).
 * POST → an owner action: { action: "run", instruction } | { action: "restore", checkpoint_id } | { action: "deploy" }.
 * Runs are asynchronous — POST run returns immediately; poll GET while status = "building".
 */

import { NextResponse } from "next/server";
import { Echo, Studio } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const v = Studio.view(id, uid);
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(v);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "run") {
    const r = Studio.startRun(id, uid, String(body?.instruction ?? ""));
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "restore") {
    const r = Studio.restoreCheckpoint(id, uid, String(body?.checkpoint_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "deploy") {
    const v = Studio.view(id, uid);
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!v.build) return NextResponse.json({ error: "no_build" }, { status: 400 });
    const r = Echo.deployBuild(v.build.build_id, uid); // the founder's go-live action — existing rail
    if (r.error && r.error !== "already_live") return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
