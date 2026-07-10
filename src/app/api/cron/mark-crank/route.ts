/**
 * POST /api/cron/mark-crank — the T3 keeper: refresh every relevant market's
 * on-chain mark oracle from its AMM's TwapState (docs/TRADING_ENGINE_AUDIT.md
 * §5). Point a 5-minute scheduler here; perp settlements then validate against
 * a fresh on-chain TWAP instead of trusting the platform's report. Cranks
 * markets that have a real pool AND either live futures or open positions.
 * Permissionless on-chain — this route just pays the crank. Protected by
 * NEUGRID_CRON_KEY (`x-ng-cron-key`) when set; open in dev when unset.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { PerpChain } from "@/lib/chain";
import { isDuplicateTick } from "@/lib/cronTick";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const required = process.env.NEUGRID_CRON_KEY;
  if (required && request.headers.get("x-ng-cron-key") !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (isDuplicateTick(request)) return NextResponse.json({ ok: true, deduped: true });
  if (!PerpChain.configured()) return NextResponse.json({ ok: true, cranked: 0, configured: false });

  const targets = db.markets.filter(
    (m) =>
      m.onchain?.pool &&
      (m.stage === "futures" || (db.positions ?? []).some((p) => p.status === "open" && p.market_id === m.market_id)),
  );
  await Promise.allSettled(targets.map((m) => PerpChain.crank(m.market_id)));
  return NextResponse.json({ ok: true, cranked: targets.length });
}
