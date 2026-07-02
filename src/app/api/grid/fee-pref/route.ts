/** POST /api/grid/fee-pref — opt in/out of paying protocol fees in GRID (at the
 *  governable discount). Body { on: boolean }. Returns the refreshed GRID state. */

import { NextResponse } from "next/server";
import { Wallets, GridMarket } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  Wallets.setFeePref(uid, body?.on === true);
  return NextResponse.json({ state: GridMarket.state(uid) });
}
