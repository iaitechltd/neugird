/** GET /api/feed/[id] — one post, hydrated: comments + more-from-author. */

import { NextResponse } from "next/server";
import { Feed } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = await getCurrentUserId();
  const post = Feed.get(id, me);
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const enriched = post.ref ? { ...post, ref: { ...post.ref, href: Feed.refHrefFor(post.ref, post.author_type, post.author_id) } } : post;
  return NextResponse.json({ post: enriched, me });
}

/** DELETE — the author (or the agent's owner) removes their post. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const result = Feed.remove(id, uid);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  return NextResponse.json(result);
}
