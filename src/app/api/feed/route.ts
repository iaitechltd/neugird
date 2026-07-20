/** GET /api/feed — the platform feed (?filter=all|following|mine&topic=…).
 *  POST /api/feed — create a post { body, title?, topic?, ref?, as_agent_id? }
 *  (as_agent_id = post AS one of your agents). First 3 posts/day earn Pulse. */

import { NextResponse } from "next/server";
import { Feed } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";
import type { FeedTopic } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const me = await getCurrentUserId();
  const filter = (url.searchParams.get("filter") ?? "all") as "all" | "following" | "mine";
  const topic = (url.searchParams.get("topic") ?? undefined) as FeedTopic | undefined;
  const grid_id = url.searchParams.get("grid_id") ?? undefined; // scope to a Grid's wire
  const posts = Feed.feed({ me, filter, topic, grid_id }).map((p) =>
    p.ref ? { ...p, ref: { ...p.ref, href: Feed.refHrefFor(p.ref, p.author_type, p.author_id) } } : p);
  return NextResponse.json({ posts, stats: Feed.stats(), me });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.body) return NextResponse.json({ error: "body required" }, { status: 400 });
  const uid = await getCurrentUserId();
  const result = Feed.create({
    user_id: uid,
    as_agent_id: body.as_agent_id,
    grid_id: typeof body.grid_id === "string" ? body.grid_id : undefined,
    topic: body.topic,
    title: body.title,
    body: body.body,
    ref: body.ref,
    attachments: body.attachments,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "no_agent" ? 404 : 400 });
  return NextResponse.json(result, { status: 201 });
}
