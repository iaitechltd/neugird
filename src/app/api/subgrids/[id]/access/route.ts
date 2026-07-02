/** POST /api/subgrids/[id]/access — a SubGrid admin sets the join policy.
 *  Body { access: "open"|"invite"|"reputation"|"token", min_reputation?, min_grid? }. */

import { NextResponse } from "next/server";
import { GridRegistry } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { SubGridAccess } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_admin: 403 };
const ACCESS: SubGridAccess[] = ["open", "invite", "reputation", "token"];

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const access = ACCESS.includes(body?.access) ? (body.access as SubGridAccess) : undefined;
  const r = GridRegistry.setSubGridAccess(id, uid, {
    access,
    min_reputation: body?.min_reputation !== undefined ? Number(body.min_reputation) : undefined,
    min_grid: body?.min_grid !== undefined ? Number(body.min_grid) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: STATUS[r.reason ?? ""] ?? 400 });
  return NextResponse.json(GridRegistry.subGridView(id, uid));
}
