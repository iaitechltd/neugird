/** /api/markets/[id]/chat — the project's community thread (per Grid).
 *  GET → recent messages (author + reputation + role). POST { text } to send,
 *  or { action:"like", message_id } to upvote. */

import { NextResponse } from "next/server";
import { Markets, Chat } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const market = Markets.getMarket(id);
  if (!market) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  return NextResponse.json({ messages: Chat.listFor(market.grid_id, uid), me: uid });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const market = Markets.getMarket(id);
  if (!market) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);

  if (body?.action === "like") {
    const r = Chat.like(String(body.message_id), uid);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const r = Chat.post(market.grid_id, uid, String(body?.text ?? ""));
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ message: r.message }, { status: 201 });
}
