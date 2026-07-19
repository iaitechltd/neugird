/**
 * /api/toolbox — the builder's person-level TOOLBOX (Phase 6b+).
 * GET  → your connections + installed build-skills + the catalog + the skill store.
 * POST → { action: "mcp_add" | "mcp_remove" | "skill_install" | "skill_remove", … }.
 * Set up once on the Echo hub; it flows into every workshop you open.
 */

import { NextResponse } from "next/server";
import { Toolbox } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json(Toolbox.view(uid));
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  if (action === "mcp_add") {
    const r = Toolbox.addMcp(uid, {
      kind: String(body?.kind ?? ""), name: typeof body?.name === "string" ? body.name : undefined,
      value: typeof body?.value === "string" ? body.value : undefined,
      command: typeof body?.command === "string" ? body.command : undefined,
      args: typeof body?.args === "string" ? body.args : undefined,
      url: typeof body?.url === "string" ? body.url : undefined,
      header: typeof body?.header === "string" ? body.header : undefined,
    });
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  if (action === "mcp_remove") {
    const r = Toolbox.removeMcp(uid, String(body?.name ?? ""));
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  if (action === "skill_install") {
    const r = Toolbox.installSkill(uid, String(body?.published_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  if (action === "plugin_install") {
    const r = Toolbox.installPlugin(uid, String(body?.published_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  if (action === "plugin_remove") {
    const r = Toolbox.removePlugin(uid, String(body?.published_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  if (action === "skill_remove") {
    const r = Toolbox.removeSkill(uid, String(body?.published_id ?? ""));
    if (r.error) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ ...r, view: Toolbox.view(uid) });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
