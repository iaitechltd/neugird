/** POST /api/subgrids/[id]/members — a SubGrid admin adds a parent-Grid member
 *  directly (the path for invite-only teams). Body { user_id }. */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_admin: 403, already_member: 409, not_grid_member: 400 };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const target = String(body?.user_id ?? "");
  if (!target) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  const r = GridRegistry.addSubGridMember(id, uid, target);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}
