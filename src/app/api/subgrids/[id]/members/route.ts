/** POST /api/subgrids/[id]/members — a SubGrid admin adds a parent-Grid member
 *  (body { user_id }) or an AGENT to the team (body { agent_id } — the agent's
 *  owner must be the admin or already on the team). Hybrid human+agent teams:
 *  agent members count in ownership splits and revenue distribution. */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_admin: 403, already_member: 409, not_grid_member: 400, no_agent: 404, owner_not_on_team: 403, not_member: 404 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const agent = String(body?.agent_id ?? "");
  const target = String(body?.user_id ?? "");
  if (!agent && !target) return NextResponse.json({ error: "user_id or agent_id required" }, { status: 400 });
  const r = agent
    ? (body?.remove ? GridRegistry.removeSubGridAgent(id, uid, agent) : GridRegistry.addSubGridAgent(id, uid, agent))
    : GridRegistry.addSubGridMember(id, uid, target);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}
