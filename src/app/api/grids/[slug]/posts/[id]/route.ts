/** POST /api/grids/[slug]/posts/[id] — act on a feed post.
 *  Body { action: "like" | "pin" | "delete" }. pin = admin/founder; delete =
 *  author or admin. Returns the refreshed feed. */

import { NextResponse } from "next/server";
import { GridRegistry, Content } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_admin: 403, not_allowed: 403 };

export async function POST(request: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const action = body?.action;

  const r = action === "pin" ? Content.pin(id, uid) : action === "delete" ? Content.remove(id, uid) : Content.like(id, uid);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ posts: Content.listFor(grid.grid_id, uid) });
}
