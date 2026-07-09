/** POST /api/humanity/civic — check the caller's SIWS wallet for a valid Civic
 *  Uniqueness Pass (on-chain gateway token, mainnet) and attest tier 2 on
 *  success (docs/POH_GATE.md Phase 2). The user acquires the pass themselves at
 *  getpass.civic.com; we only READ chain state — nothing custodial. */

import { NextResponse } from "next/server";
import { Humanity } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const uid = await getCurrentUserId();
  const { record, error } = await Humanity.checkCivicPass(uid);
  if (error) return NextResponse.json({ error, state: Humanity.view(uid) }, { status: error === "no_user" ? 404 : 400 });
  return NextResponse.json({ record, state: Humanity.view(uid) });
}
