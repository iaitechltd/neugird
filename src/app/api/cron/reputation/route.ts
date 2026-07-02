/**
 * POST /api/cron/reputation — the daily maintenance sweep: reputation upkeep (V6 —
 * gentle time-decay of inactive reputation + a ghost-sweep: a project that leaves a
 * delivery unreviewed past the deadline loses employer trust and the worker is
 * auto-paid) + governance auto-resolve (open proposals past their vote window settle,
 * so locked GRID returns even with zero traffic). Point a scheduler at this on a
 * daily cadence. Protected by NEUGRID_CRON_KEY (header x-ng-cron-key) when set.
 * Pass ?force=1 to run immediately, ignoring the time gates.
 */

import { NextResponse } from "next/server";
import { ReputationMaint, Governance } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const summary = ReputationMaint.runMaintenance({ force });
  const gov = Governance.sweepExpired();
  return NextResponse.json({ ok: true, ...summary, gov_settled: gov.settled });
}
