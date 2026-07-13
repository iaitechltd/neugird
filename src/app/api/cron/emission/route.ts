/**
 * POST /api/cron/emission — settle the GRID emission epoch when it has elapsed.
 * Each epoch releases a slice of the REMAINING community pool (emission_epoch_bps)
 * and splits it among that epoch's earners by activity. Point a Cloud Scheduler
 * job here on the epoch cadence; the scheduler is NOT created here. A no-op skip
 * until the TGE has run AND the epoch window has fully elapsed, so it's safe to
 * tick often. Protected by NEUGRID_CRON_KEY (`x-ng-cron-key`) when set; open in dev.
 */

import { NextResponse } from "next/server";
import { Emission } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = Emission.settle(false); // schedule-driven — fires only post-TGE + epoch elapsed
  return NextResponse.json({ ok: true, ...result });
}
