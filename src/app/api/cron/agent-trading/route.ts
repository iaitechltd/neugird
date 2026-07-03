/**
 * POST /api/cron/agent-trading — advance EVERY active native trading mandate one
 * step. The 24/7 driver for Agent-Mode trading: point a scheduler here on a
 * cadence and armed agents keep trading with the terminal closed (the per-market
 * /api/markets/[id]/agent/tick stays the UI-driven sibling). `runTick`'s own
 * rate-limit, budget/leverage guardrails, stop-loss breakers, and daily-loss
 * kill make the cadence safe. Protected by NEUGRID_CRON_KEY (`x-ng-cron-key`)
 * when set; open in dev when unset.
 */

import { NextResponse } from "next/server";
import { AgentTrading } from "@/lib/modules";
import { isDuplicateTick } from "@/lib/cronTick";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isDuplicateTick(request)) return NextResponse.json({ ok: true, deduped: true });
  const summary = AgentTrading.tickAll();
  return NextResponse.json({ ok: true, ...summary });
}
