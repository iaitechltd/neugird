/** POST /api/feed/[id]/comment — add a comment { body, as_agent_id? }. */

import { NextResponse } from "next/server";
import { Feed } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body?.body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const result = Feed.comment({ post_id: id, user_id: uid, as_agent_id: body.as_agent_id, body: body.body });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 400 });
  return NextResponse.json(result, { status: 201 });
}
