/**
 * /api/studio/[id] — one workshop.
 * GET  → the room view (turns, trail, checkpoints, files, build, live progress).
 * POST → an owner action: { action: "run", instruction } | { action: "restore", checkpoint_id }
 *        | { action: "deploy" } | { action: "fix", decision: "approve" | "dismiss" }.
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
    const quality = body?.quality === "verified" || body?.quality === "best3" ? body.quality : "standard";
    const effort = body?.effort === "low" || body?.effort === "high" ? body.effort : undefined;
    const r = Studio.startRun(id, uid, String(body?.instruction ?? ""), "you", { quality, effort });
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "rules") {
    const r = Studio.setRules(id, uid, String(body?.rules ?? ""));
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "memory") {
    const r = Studio.setMemory(id, uid, !!body?.on);
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "mcp_add") {
    const r = Studio.addMcp(id, uid, {
      kind: String(body?.kind ?? ""), name: typeof body?.name === "string" ? body.name : undefined,
      value: typeof body?.value === "string" ? body.value : undefined,
      command: typeof body?.command === "string" ? body.command : undefined,
      args: typeof body?.args === "string" ? body.args : undefined,
      url: typeof body?.url === "string" ? body.url : undefined,
      header: typeof body?.header === "string" ? body.header : undefined,
    });
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "mcp_remove") {
    const r = Studio.removeMcp(id, uid, String(body?.name ?? ""));
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "mcp_check") {
    const r = await Studio.checkMcp(id, uid); // spawns the engine's doctor — may take ~30s on first run
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "toolbox_toggle") {
    // switch an inherited toolbox connection/skill on or off for THIS project
    const r = Studio.toggleToolboxItem(id, uid, String(body?.name ?? ""), !!body?.on);
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "fix") {
    // the owner answers the chief's "revise" verdict — approve = a paid fix run
    const decision = body?.decision === "approve" ? "approve" as const : "dismiss" as const;
    const r = Studio.resolveFix(id, uid, decision);
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "launch_assets") {
    // content + marketing draft the launch post (free) — parks for the owner's approval
    const r = Studio.draftLaunchAssets(id, uid);
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "post") {
    const decision = body?.decision === "approve" ? "approve" as const : "dismiss" as const;
    const r = Studio.resolvePost(id, uid, decision);
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "hire") {
    // HIRE HELP — a real escrowed Job (USDC locks now, pays on delivery approval)
    const r = Studio.hireHelp(id, uid, {
      title: String(body?.title ?? ""), description: String(body?.description ?? ""),
      reward_usdc: Number(body?.reward_usdc ?? 0),
    });
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "install_plugin") {
    const r = Studio.installWorkspacePlugin(id, uid, String(body?.published_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: r.error === "not_found" ? 404 : 400 });
    return NextResponse.json({ ...r, view: Studio.view(id, uid) });
  }

  if (action === "install_skill") {
    const r = Studio.installSkill(id, uid, String(body?.published_id ?? ""));
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
