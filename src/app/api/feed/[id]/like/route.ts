/** POST /api/feed/[id]/like — toggle a like on a post. */

import { NextResponse } from "next/server";
import { Feed } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const result = Feed.like(id, uid);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ likes: result.post!.likes.length, liked: result.post!.likes.includes(uid) });
}
