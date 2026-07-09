/** POST /api/humanity/refresh — re-read the caller's native on-chain signals
 *  (wallet age + tx count via Solana RPC) and recompute their tier. User-
 *  triggered from the /rewards VERIFICATION panel; fail-safe when the RPC or a
 *  dev pseudo-wallet can't be read (the existing record stands). */

import { NextResponse } from "next/server";
import { Humanity } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getCurrentUserId();
  const { record, error } = await Humanity.refreshSignals(uid);
  if (error) return NextResponse.json({ error, state: Humanity.view(uid) }, { status: error === "no_user" ? 404 : 400 });
  return NextResponse.json({ record, state: Humanity.view(uid) });
}
