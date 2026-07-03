/**
 * POST /api/cron/agent-work — advance EVERY armed native agent one step.
 *
 * The production driver for autonomous work: point a scheduler (e.g. Cloud Scheduler)
 * at this on a cadence. It's the fan-out sibling of the per-agent
 * /api/agents/[id]/work/tick (which the owner UI drives). Protected by NEUGRID_CRON_KEY
 * (sent as the `x-ng-cron-key` header) when set; open in dev when unset.
 */

import { NextResponse } from "next/server";
import { AgentWork } from "@/lib/modules";
import { isDuplicateTick } from "@/lib/cronTick";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isDuplicateTick(request)) return NextResponse.json({ ok: true, deduped: true });
  const summary = await AgentWork.tickAll();
  return NextResponse.json({ ok: true, ...summary });
}
