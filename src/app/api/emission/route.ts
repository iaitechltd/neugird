/** /api/emission — continuous post-TGE GRID emissions from the community pool.
 *  GET  → the current epoch's state + the projected split by activity.
 *  POST { action:"settle" } → force-settle this epoch NOW (DEMO only — in
 *  production emissions settle on the epoch schedule via /api/cron/emission). */

import { NextResponse } from "next/server";
import { Emission } from "@/lib/modules";
import { demoMode, getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ emission: Emission.state() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (action !== "settle" && action !== "reset") return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  // Both settling and resetting an epoch by hand are demo actions — production
  // settles on the epoch schedule via /api/cron/emission and never resets.
  if (!demoMode()) return NextResponse.json({ error: "demo_only" }, { status: 403 });
  if (action === "reset") {
    const r = Emission.resetDemo(await getCurrentUserId());
    return NextResponse.json({ ...r, emission: Emission.state() });
  }
  const r = Emission.settle(true);
  return NextResponse.json({ ...r, emission: Emission.state() });
}
