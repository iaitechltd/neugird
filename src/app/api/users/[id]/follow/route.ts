/** POST /api/users/[id]/follow — toggle following that user (session-authed).
 *  Returns { following, followers } so the button can update in place. */

import { NextResponse } from "next/server";
import { Social } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const r = Social.toggleFollow(uid, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ following: r.following, followers: Social.followCounts(id).followers });
}
