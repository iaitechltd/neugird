/**
 * POST /api/cron/buyback — the GRID buyback-and-burn tick. Spends `buyback_bps`
 * of the treasury's USDC balance to BUY GRID off the pool and BURN it (supply
 * shrinks, price rises). Point a Cloud Scheduler job here (e.g. daily) to run it;
 * the scheduler is NOT created here. Default buyback_bps = 0 ⇒ every tick skips,
 * so the treasury is never spent until a passed governance proposal arms it > 0.
 * Protected by NEUGRID_CRON_KEY (`x-ng-cron-key`) when set; open in dev when unset.
 */

import { NextResponse } from "next/server";
import { GridMarket } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = GridMarket.runBuyback();
  return NextResponse.json({ ok: true, ...result });
}
