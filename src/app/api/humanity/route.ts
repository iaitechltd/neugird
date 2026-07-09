/** GET /api/humanity — the caller's proof-of-humanity state: tier + native
 *  signals + attestation + what each gate requires (docs/POH_GATE.md). */

import { NextResponse } from "next/server";
import { Humanity } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json(Humanity.view(uid));
}
