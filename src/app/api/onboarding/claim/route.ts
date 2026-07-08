/** POST /api/onboarding/claim — claim the one-time starter Echo credit.
 *  Normally auto-granted on SIWS connect; this is the manual path for accounts
 *  that connected a wallet before the starter program existed. Gates live in
 *  Onboarding.claimStarterGrant (wallet required, one per account + per wallet). */

import { NextResponse } from "next/server";
import { Onboarding } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getCurrentUserId();
  const result = Onboarding.claimStarterGrant(uid);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result, starter: Onboarding.starterState(uid) });
}
