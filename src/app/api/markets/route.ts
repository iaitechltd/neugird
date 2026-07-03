/** GET /api/markets — list markets, enriched with the token symbol. */

import { NextResponse } from "next/server";
import { Markets, GridRegistry, Provenance } from "@/lib/modules";
import type { MarketStage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stage = (url.searchParams.get("stage") as MarketStage | null) ?? undefined;
  const markets = Markets.listMarkets({ stage }).map((m) => {
    const grid = GridRegistry.getGrid(m.grid_id);
    const prog = Markets.stageProgress(m);
    const stats = Markets.tradeStats(m.market_id); // real rolling-24h
    const series = Markets.candles(m.market_id, "1D", 30).map((c) => c.c); // real 30D closes (card sparkline)
    const volTotal = m.volume ?? 0; // lifetime volume — the honest fallback when the 24h window is quiet
    return { ...m, grid_name: grid?.name ?? m.base_symbol, grid_slug: grid?.slug ?? "", marketcap: prog.marketcap, cap_target: prog.capTarget, cap_pct: prog.capPct, change: stats.change, vol24h: stats.volume, volTotal, series, credibility: Provenance.credibilityFor(m.grid_id) };
  });
  return NextResponse.json({ markets });
}
