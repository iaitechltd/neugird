/** /api/grids/[slug]/chat — the Grid's community thread (per Grid, role-tagged).
 *  GET → recent messages (author + reputation + role). POST { text } to send,
 *  or { action:"like", message_id } to upvote. Mirrors /api/markets/[id]/chat. */

import { NextResponse } from "next/server";
import { GridRegistry, Chat } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  return NextResponse.json({ messages: Chat.listFor(grid.grid_id, uid), me: uid });
}

export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const grid = GridRegistry.getGrid(slug);
  if (!grid) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);

  if (body?.action === "like") {
    const r = Chat.like(String(body.message_id), uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const r = Chat.post(grid.grid_id, uid, String(body?.text ?? ""));
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ message: r.message }, { status: 201 });
}
