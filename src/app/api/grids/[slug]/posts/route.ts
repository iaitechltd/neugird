/** /api/grids/[slug]/posts — the Grid content hub.
 *  GET → the feed (pinned first, author + role + likes). POST { title?, body } to
 *  publish (members + owner only). */

import { NextResponse } from "next/server";
import { GridRegistry, Content } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { empty: 400, no_grid: 404, not_member: 403 };

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  return NextResponse.json({ posts: Content.listFor(grid.grid_id, uid), me: uid });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const r = Content.create(grid.grid_id, uid, { title: body?.title, body: String(body?.body ?? "") });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ posts: Content.listFor(grid.grid_id, uid) }, { status: 201 });
}
