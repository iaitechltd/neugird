/**
 * GET /api/season — the current earning season: the live countdown, the
 * leaderboard people race up, the caller's own standing, and a points-per-day
 * cadence. Points = reward allocation earned inside the season window.
 */

import { NextResponse } from "next/server";
import { Season } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({
    season: Season.current(),
    leaderboard: Season.leaderboard(25),
    standing: Season.standing(uid),
    cadence: Season.cadence(14),
    me: uid,
  });
}
