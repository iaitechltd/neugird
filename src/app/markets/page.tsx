"use client";

/**
 * Markets (Trade) — gated token markets from real data (GET /api/markets).
 * Masonry of vertical market tiles. Markets are EARNED: a token only appears
 * here after its project delivered and launched on Alpha.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import MarketTicker from "@/components/app/MarketTicker";
import { Panel, Mark, DataRow, IconChart, IconActivity , kpiColor } from "@/components/app/ui";
import { PanelChart, TMeter } from "@/components/app/terminal";
import Meter from "@/components/app/Meter";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Area, Gauge, DivergingBars, Depth, Bubble, Funnel, Candles, type Candle } from "@/components/app/charts";
import { CountUp, Decrypt } from "@/components/app/typefx";
import type { Market, MarketStage } from "@/lib/types";

type Credibility = { founder: { id: string; username: string; reputation: number }; credentials: number; audit_passed: boolean; origin: string } | null;
type Mkt = Market & { grid_name: string; grid_slug: string; marketcap?: number; cap_target?: number; cap_pct?: number; vol24h?: number; volTotal?: number; series?: number[]; credibility?: Credibility };
const STAGES: (MarketStage | "all")[] = ["all", "alpha", "spot", "futures"];

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/* The standing last tile — markets are earned, so the "add" action is a pointer
 * back to the pipeline (deliver + audit → graduate), never a listing form. */
function EarnMarketCard() {
  return (
    <Link href="/grids/explore" className="ng-card group flex min-h-[280px] flex-col items-center justify-center gap-2 !border-dashed p-4 text-center opacity-70 transition hover:!border-neon/40 hover:opacity-100">
      <span className="grid h-9 w-9 place-items-center rounded-lg text-lg text-neon" style={{ background: "radial-gradient(circle, rgba(0,255,0,0.10), rgba(0,255,0,0.02))" }}>+</span>
      <div className="ng-title text-sm font-bold text-neon">Earn your market</div>
      <p className="max-w-[200px] text-[10px] leading-relaxed text-ink-faint">Deliver your project and pass the audit — graduates launch here. No listings, no buy-ins.</p>
      <span className="mt-1 text-[11px] text-ink-dim group-hover:text-neon">Explore Grids ›</span>
    </Link>
  );
}

/* A tokenized market card — identity, ROI, price spark, and the Ascension Arc
 * (real progress toward the next stage's market-cap target). The spark + ROI are
 * the market's REAL 30D candle closes (flat line when it has no trade history). */
function MarketCard({ m, mx }: { m: Mkt; mx: { cap: number; liq: number; vol24: number; volT: number; holders: number } }) {
  const s = m.series && m.series.length > 1 ? m.series : [m.price ?? 0, m.price ?? 0];
  const roi = s[0] ? ((s[s.length - 1] - s[0]) / s[0]) * 100 : 0;
  const up = roi >= 0;
  const color = up ? "#00ff00" : "#ff4d5e";
  const ascended = m.stage === "futures";
  return (
    <Link href={`/market/${m.market_id}`} className="ng-card group flex flex-col p-4 transition hover:!border-neon/40">
      {/* identity + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-neon" style={{ background: "radial-gradient(circle, rgba(0,255,0,0.14), rgba(0,255,0,0.03))" }}>{m.base_symbol.slice(0, 3)}</span>
          <div className="min-w-0"><div className="ng-title truncate text-sm font-bold text-neon">{m.base_symbol}</div><div className="truncate text-[10px] text-ink-faint">{m.grid_name}</div></div>
        </div>
        <Mark plain accent={ascended ? "neon" : "amber"} className="!text-[9px] shrink-0">{ascended ? "Ascended" : "Ascending"}</Mark>
      </div>
      {/* credibility chip — WHO earned this market (the thesis, at discovery time).
          No "audited" badge: every launched market passed the gate; funded is the differentiator. */}
      {m.credibility?.founder && (
        <div className="mt-2 flex items-center gap-1.5 rounded border border-line bg-neon/[0.03] px-2 py-1.5 text-[10px]">
          <MatrixAvatar seed={m.credibility.founder.username} size={16} />
          <span className="max-w-[45%] shrink-0 truncate font-bold text-ink">{m.credibility.founder.username}</span>
          <span className="min-w-0 flex-1 truncate text-right">
            <span className="text-neon tnum">{m.credibility.founder.reputation.toLocaleString()} rep</span>
            <span className="text-ink-dim tnum"> · {m.credibility.credentials}✓</span>
            {m.credibility.origin === "proposal" && <span className="text-amber"> · funded</span>}
          </span>
        </div>
      )}
      {/* ROI headline + witnessed arc */}
      <div className="mt-3 ng-stat__v !text-2xl tnum" style={{ color }}>{up ? "+" : ""}{roi.toFixed(2)}%</div>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>ROI</span><span>30D</span></div>
      <div className="mt-1.5"><Area data={s} gid={m.market_id} color={color} h={50} /></div>
      {/* stats */}
      {/* per-row bars scale each stat against the top market on the page */}
      <div className="mt-2 divide-y divide-line text-[11px]">
        <div className="ng-row !py-1"><span className="ng-row__k">Market cap</span><span className="flex items-center gap-1.5" title="vs top market"><Meter value={m.marketcap ?? 0} max={mx.cap} w={36} /><Mark plain className="!text-[11px]">{money(m.marketcap ?? 0)}</Mark></span></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Liquidity</span><span className="flex items-center gap-1.5" title="vs top market"><Meter value={m.liquidity_usd ?? 0} max={mx.liq} w={36} /><Mark plain className="!text-[11px]">{money(m.liquidity_usd ?? 0)}</Mark></span></div>
        {(m.vol24h ?? 0) > 0 || !(m.volTotal ?? 0)
          ? <div className="ng-row !py-1"><span className="ng-row__k">24h Vol</span><span className="flex items-center gap-1.5" title="vs top market"><Meter value={m.vol24h ?? 0} max={mx.vol24} w={36} /><Mark plain className="!text-[11px]">{money(m.vol24h ?? 0)}</Mark></span></div>
          : <div className="ng-row !py-1"><span className="ng-row__k">Total Vol</span><span className="flex items-center gap-1.5" title="vs top market"><Meter value={m.volTotal ?? 0} max={mx.volT} w={36} /><Mark plain className="!text-[11px]">{money(m.volTotal ?? 0)}</Mark></span></div>}
        <div className="ng-row !py-1"><span className="ng-row__k">Holders</span><span className="flex items-center gap-1.5" title="vs top market"><Meter value={m.holders ?? 0} max={mx.holders} w={36} /><Mark plain className="!text-[11px]">{(m.holders ?? 0).toLocaleString()}</Mark></span></div>
      </div>
      {/* Ascension Arc → progress toward the next stage's market-cap target */}
      <div className="mt-3 flex flex-col items-center">
        <div className="text-[9px] uppercase tracking-wide text-ink-faint">Ascension Arc{ascended ? "" : ` → ${m.stage === "spot" ? "futures" : "spot"}`}</div>
        <Gauge percent={m.cap_pct ?? 0} w={120} />
        <div className="-mt-1 text-[11px] text-ink-dim">{money(m.marketcap ?? 0)} / {money(m.cap_target ?? 0)}</div>
      </div>
      <span className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-3">{ascended ? "Trade" : "Trade Now"}</span>
    </Link>
  );
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<Mkt[] | null>(null);
  const [leadCandles, setLeadCandles] = useState<Candle[]>([]);
  const [stage, setStage] = useState<MarketStage | "all">("all");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/markets").then((r) => r.json()).then((d) => { if (alive) setMarkets(d.markets ?? []); }).catch(() => {});
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => { alive = false; window.removeEventListener("neugrid:refresh-me", load); };
  }, []);

  const list = useMemo(() => markets ?? [], [markets]);
  const filtered = stage === "all" ? list : list.filter((m) => m.stage === stage);
  const totals = useMemo(() => ({ markets: list.length, liq: list.reduce((s, m) => s + (m.liquidity_usd ?? 0), 0), holders: list.reduce((s, m) => s + (m.holders ?? 0), 0) }), [list]);
  // fleet maxima — each card's stat bars scale against the page's top market (real values)
  const mx = useMemo(() => ({
    cap: Math.max(...list.map((m) => m.marketcap ?? 0), 1),
    liq: Math.max(...list.map((m) => m.liquidity_usd ?? 0), 1),
    vol24: Math.max(...list.map((m) => m.vol24h ?? 0), 1),
    volT: Math.max(...list.map((m) => m.volTotal ?? 0), 1),
    holders: Math.max(...list.map((m) => m.holders ?? 0), 1),
  }), [list]);
  const kpis: [string, number, string?][] = [
    ["Live Markets", totals.markets],
    ["Liquidity", Math.round(totals.liq), "$"],
    ["24h Vol", Math.round(list.reduce((s, m) => s + (m.vol24h ?? 0), 0)), "$"],
    ["Holders", totals.holders],
    ["Futures", list.filter((m) => m.stage === "futures").length],
  ];

  // lead market (highest cap) drives the REAL candlestick (fetched OHLC) + AMM depth
  const lead = [...list].sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0))[0];
  const leadId = lead?.market_id;
  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/markets/${leadId}/candles?tf=1D&n=40`).then((r) => r.json()).then((d) => setLeadCandles(d.candles ?? [])).catch(() => {});
  }, [leadId]);

  // trade-rail chart data — REAL: movers (24h ROI) · constant-product AMM depth (from liquidity+price) · cap bubbles
  const roiOf = (m: Mkt) => { const s = m.series && m.series.length > 1 ? m.series : null; return s && s[0] ? ((s[s.length - 1] - s[0]) / s[0]) * 100 : 0; };
  const movers = list.map(roiOf);
  const hasMovers = movers.some((v) => Math.abs(v) > 0.01);
  const stageColor = (st: string) => (st === "futures" ? "#48f5ff" : st === "spot" ? "#00ff00" : "#ffb020");
  const capBubbles = list.slice(0, 12).map((m) => ({ value: m.marketcap ?? 0, label: m.base_symbol.slice(0, 4), color: stageColor(m.stage) }));
  const depth = (() => {
    const p = lead?.price ?? 0, L = lead?.liquidity_usd ?? 0;
    if (!(p > 0) || !(L > 0)) return { bids: [] as number[], asks: [] as number[] };
    const Xr = (L / 2) / p, k = Xr * (L / 2), N = 20;
    const asks = Array.from({ length: N + 1 }, (_, i) => { const pp = p * (1 + (i / N) * 0.5); return Math.max(0, Xr - Math.sqrt(k / pp)); });
    const bids = Array.from({ length: N + 1 }, (_, i) => { const pp = p * (1 - (i / N) * 0.49); return Math.max(0, Math.sqrt(k / pp) - Xr); });
    return { bids, asks };
  })();
  const hasDepth = depth.asks.length > 1 && (depth.asks[depth.asks.length - 1] > 0 || depth.bids[depth.bids.length - 1] > 0);

  // graduation funnel — REAL count of live markets at each stage (alpha → spot → futures),
  // narrowing as tokens ascend. Green shades brighten toward the entry stage.
  const gradStages = ([
    ["alpha", "gated first liquidity — graduates only", "rgba(0,255,65,0.9)"],
    ["spot", "unlocked by real traction (holders)", "rgba(0,255,65,0.58)"],
    ["futures", "deep liquidity + licensing, last", "rgba(0,255,65,0.34)"],
  ] as const).map(([st, desc, color]) => ({ st, desc, color, n: list.filter((m) => m.stage === st).length }));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Trade" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <MarketTicker />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Markets" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="MARKETS" icon={<IconChart className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Live Markets" v={totals.markets} accent="neon" />
              <DataRow k="Total Liquidity" v={`$${Math.round(totals.liq)}`} />
              <DataRow k="Holders" v={totals.holders} />
            </div>
            {/* stage mix — how the live markets split across the lifecycle (real counts) */}
            {list.length > 0 && (
              <div className="mt-2">
                {(["alpha", "spot", "futures"] as const).map((st) => {
                  const n = list.filter((m) => m.stage === st).length;
                  return <TMeter key={st} label={st} pct={Math.round((n / list.length) * 100)} value={n} color={stageColor(st)} />;
                })}
              </div>
            )}

            <PanelChart title="Movers · 24h ROI" read={`${list.length} mkts`}>
              {hasMovers
                ? <div className="py-1"><DivergingBars data={movers} h={58} /></div>
                : <p className="py-2 text-[11px] text-ink-dim">No price moves yet.</p>}
            </PanelChart>

            <PanelChart title={`Depth · ${lead?.base_symbol ?? "market"}`} read={money(lead?.liquidity_usd ?? 0)}>
              {hasDepth
                ? <div className="py-1"><Depth bids={depth.bids} asks={depth.asks} h={92} /></div>
                : <p className="py-2 text-[11px] text-ink-dim">No liquidity yet.</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">Stage</div>
            <div className="space-y-1">
              {STAGES.map((s) => {
                const n = s === "all" ? list.length : list.filter((m) => m.stage === s).length;
                return (
                  <button key={s} onClick={() => setStage(s)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] capitalize transition ${stage === s ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                    <span>{s}</span><span className="flex items-center gap-1.5"><Meter value={n} max={list.length} w={32} /><Mark plain className="!text-[10px]">{n}</Mark></span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Trade" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Markets you can&apos;t buy your way onto — only delivery graduates a project here.</p>
            </div>
            <Mark plain className="shrink-0 text-xs">{filtered.length} markets</Mark>
          </div>

          {/* Stage tabs — Alpha → Spot → Futures (the lifecycle of an earned market) */}
          <div className="flex items-center gap-5 border-b border-line">
            {STAGES.map((s) => {
              const count = s === "all" ? list.length : list.filter((mk) => mk.stage === s).length;
              const active = stage === s;
              return (
                <button key={s} onClick={() => setStage(s)} className={`-mb-px border-b-2 pb-2 text-[13px] capitalize transition ${active ? "border-neon text-neon text-glow-soft" : "border-transparent text-ink-dim hover:text-neon"}`}>
                  {s === "all" ? "All" : s}<span className="ml-1.5 text-[10px] text-ink-faint">{count}</span>
                </button>
              );
            })}
          </div>

          {/* page KPIs — 3 by default, 4/5 as the side panels collapse */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map(([k, v, unit], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}>{unit === "$" && <span className="opacity-60">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {markets === null && <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{[0, 1, 2, 3].map((i) => <div key={i} className="ng-card h-72 animate-pulse opacity-40" />)}</div>}
          {markets && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No markets yet — a project graduates here after it delivers and launches on Alpha.</div></Panel>}
          {filtered.length > 0 && (
            // grid, not masonry: exact per-row counts (3 → 4 → 5 as panels close); multicol
            // balancing leaves columns empty with few markets, stretching cards to 2-up
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {filtered.map((m) => <MarketCard key={m.market_id} m={m} mx={mx} />)}
              <EarnMarketCard />
            </div>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="Graduation" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="GRADUATION" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            {/* graduation funnel — REAL count of live markets at each stage, narrowing as tokens ascend */}
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div className="ng-label !text-ink-dim">Graduation funnel</div>
              <span className="tnum text-[9.5px] text-ink-faint">markets per stage</span>
            </div>
            {list.length > 0 ? (
              <>
                <Funnel data={gradStages.map((g) => ({ value: g.n, color: g.color }))} h={84} gap={6} />
                <ol className="mt-2 space-y-1.5 text-[11px] text-ink-dim">
                  {gradStages.map((g) => (
                    <li key={g.st} className="flex items-center gap-2" title={`${g.n} live market${g.n === 1 ? "" : "s"}`}>
                      <span className="h-2 w-2 shrink-0" style={{ background: g.color }} />
                      <span className="w-12 shrink-0 text-[9px] uppercase tracking-wide text-neon">{g.st}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-faint">{g.desc}</span>
                      <span className="tnum shrink-0 text-neon">{g.n}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="py-2 text-[11px] text-ink-faint">No markets yet.</p>
            )}

            <PanelChart title={`Price · ${lead?.base_symbol ?? "leader"}`} read={lead ? money(lead.marketcap ?? 0) : "—"}>
              {leadCandles.length > 1
                ? <div className="py-1"><Candles data={leadCandles} h={92} /></div>
                : <p className="py-2 text-[11px] text-ink-dim">No price history yet.</p>}
            </PanelChart>

            <PanelChart title="Market cap · by stage" read={`${list.length} mkts`}>
              {list.length > 0
                ? <div className="py-1"><Bubble data={capBubbles} h={112} /></div>
                : <p className="py-2 text-[11px] text-ink-dim">No markets yet.</p>}
            </PanelChart>

            {/* live ranking — real cap progress toward each market's next stage */}
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Next to graduate</div>
            <div className="space-y-2.5">
              {list.filter((m) => m.stage !== "futures").sort((a, b) => (b.cap_pct ?? 0) - (a.cap_pct ?? 0)).slice(0, 5).map((m) => {
                const pct = Math.min(100, Math.round(m.cap_pct ?? 0));
                const next = m.stage === "alpha" ? "spot" : "futures";
                return (
                  <Link key={m.market_id} href={`/market/${m.market_id}`} className="block rounded px-2 py-1.5 transition hover:bg-neon/[0.06]">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-neon">{m.base_symbol}</span>
                      <span className="text-ink-faint">{m.stage} › {next}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-neon/10">
                      <div className="h-full rounded bg-neon/70" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-ink-faint">
                      <span>{money(m.marketcap ?? 0)} / {money(m.cap_target ?? 0)}</span>
                      <span className="tnum">{pct}%</span>
                    </div>
                  </Link>
                );
              })}
              {markets !== null && list.filter((m) => m.stage !== "futures").length === 0 && (
                <p className="text-[10px] text-ink-faint">Every live market has fully ascended.</p>
              )}
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">A token reaches Trade only after its project delivered its milestones — markets are earned, not bought.</p>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
