/** GET /api/markets/[id] — full terminal payload: market + cap/liquidity progress,
 *  your wallet + position, trades, holders, rolling stats, stake-to-list, and the
 *  project (Grid) details + roadmap. */

import { NextResponse } from "next/server";
import { Markets, GridRegistry, Wallets, Staking, Genesis, Perps, Provenance, Params } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const market = Markets.getMarket(id);
  if (!market) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const grid = GridRegistry.getGrid(market.grid_id);
  const progress = Markets.stageProgress(market);
  const next = progress.next as "spot" | "futures" | undefined;
  return NextResponse.json({
    market: { ...market, grid_name: grid?.name ?? market.base_symbol, grid_slug: grid?.slug ?? "", marketcap: progress.marketcap },
    grid: grid
      ? { name: grid.name, slug: grid.slug, description: grid.description, category: grid.category, pulse: grid.pulse_score, glyph: grid.visual_theme?.glyph ?? "▦", accent: grid.visual_theme?.accent ?? null }
      : null,
    trades: Markets.recentTrades(id, 30),
    holders: Markets.holdersDetail(id),
    holder_count: Markets.holdersOf(id).length,
    stats: Markets.tradeStats(id),
    holding: Markets.holdingOf(id, uid),
    allocation: Markets.backerAllocation(id, uid), // backer token allocation (null = not a backer)
    wallet: Wallets.balances(uid),
    progress,
    graduation: Markets.canGraduate(id),
    stake: next ? { stage: next, ...Staking.listingProgress(market.grid_id, next) } : null,
    my_stakes: Staking.myStakes(market.grid_id, uid).map((s) => ({ stake_id: s.stake_id, amount: s.amount, stage: s.stage_target, locked_until: s.locked_until, fees_earned: s.fees_earned ?? 0, released: !!s.released, slashed: !!s.slashed, matured: Date.parse(s.locked_until) <= Date.now() })),
    staker_fees: Staking.feesEarnedFor(market.grid_id, uid),
    can_flag: market.status === "active" && !!grid && grid.owner_id !== uid && !(market.fraud_flags ?? []).some((f) => f.reviewer_id === uid), // a non-founder Verifier may flag fraud once
    flagged: market.status === "paused",
    fraud_flags: (market.fraud_flags ?? []).length,
    fraud_quorum: Params.get("fraud_flag_quorum"),
    roadmap: Genesis.listMilestones(market.grid_id).map((m) => ({ title: m.title, status: m.status, amount: m.amount, order: m.order })),
    orderBook: Markets.orderBook(id),
    orders: Markets.ordersFor(id, uid),
    positions: Perps.positionView(id, uid),
    maxLeverage: Perps.MAX_LEVERAGE,
    funding: Perps.funding(id),
    provenance: Provenance.provenanceFor(market.grid_id),
  });
}
