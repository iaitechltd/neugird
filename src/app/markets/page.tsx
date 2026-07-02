"use client";

/**
 * Markets (TradeX) — gated token markets from real data (GET /api/markets).
 * Masonry of vertical market tiles. Markets are EARNED: a token only appears
 * here after its project delivered and launched on Alpha.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, DataRow, IconChart, IconActivity } from "@/components/app/ui";
import { Area, Gauge } from "@/components/app/charts";
import { Decrypt } from "@/components/app/typefx";
import type { Market, MarketStage } from "@/lib/types";

type Mkt = Market & { grid_name: string; grid_slug: string; marketcap?: number; cap_target?: number; cap_pct?: number; vol24h?: number };
const STAGES: (MarketStage | "all")[] = ["all", "alpha", "spot", "futures"];

const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);

/* Deterministic neon price series from the market id — SSR-safe (no Date/random). */
function genSeries(seed: string, n = 18): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  let v = 40 + (h % 30);
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    v = Math.max(6, v + ((h % 1000) / 1000 - 0.4) * 9);
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

/* A tokenized market card — identity, ROI, price spark, and the Ascension Arc
 * (real progress toward the next stage's market-cap target). */
function MarketCard({ m }: { m: Mkt }) {
  const s = genSeries(m.market_id);
  const roi = s[0] ? ((s[s.length - 1] - s[0]) / s[0]) * 100 : 0;
  const up = roi >= 0;
  const color = up ? "#00ff00" : "#ff4d5e";
  const ascended = m.stage === "futures";
  return (
    <Link href={`/market/${m.market_id}`} className="ng-card group mb-3 flex break-inside-avoid flex-col p-4 transition hover:!border-neon/40">
      {/* identity + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-neon" style={{ background: "radial-gradient(circle, rgba(0,255,0,0.14), rgba(0,255,0,0.03))" }}>{m.base_symbol.slice(0, 3)}</span>
          <div className="min-w-0"><div className="ng-title truncate text-sm font-bold text-neon">{m.base_symbol}</div><div className="truncate text-[10px] text-ink-faint">{m.grid_name}</div></div>
        </div>
        <Mark plain accent={ascended ? "neon" : "amber"} className="!text-[9px] shrink-0">{ascended ? "Ascended" : "Ascending"}</Mark>
      </div>
      {/* ROI headline + witnessed arc */}
      <div className="mt-3 ng-stat__v !text-2xl tnum" style={{ color }}>{up ? "+" : ""}{roi.toFixed(2)}%</div>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>ROI</span><span>30D</span></div>
      <div className="mt-1.5"><Area data={s} gid={m.market_id} color={color} h={50} /></div>
      {/* stats */}
      <div className="mt-2 divide-y divide-line text-[11px]">
        <div className="ng-row !py-1"><span className="ng-row__k">Market cap</span><Mark plain className="!text-[11px]">{money(m.marketcap ?? 0)}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Liquidity</span><Mark plain className="!text-[11px]">{money(m.liquidity_usd ?? 0)}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">24h Vol</span><Mark plain className="!text-[11px]">{money(m.vol24h ?? 0)}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Holders</span><Mark plain className="!text-[11px]">{(m.holders ?? 0).toLocaleString()}</Mark></div>
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

  const list = markets ?? [];
  const filtered = stage === "all" ? list : list.filter((m) => m.stage === stage);
  const totals = useMemo(() => ({ markets: list.length, liq: list.reduce((s, m) => s + (m.liquidity_usd ?? 0), 0), holders: list.reduce((s, m) => s + (m.holders ?? 0), 0) }), [list]);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="TradeX" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Markets" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="MARKETS" icon={<IconChart className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Live Markets" v={totals.markets} accent="neon" />
              <DataRow k="Total Liquidity" v={`$${Math.round(totals.liq)}`} />
              <DataRow k="Holders" v={totals.holders} />
            </div>
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Stage</div>
            <div className="space-y-1">
              {STAGES.map((s) => (
                <button key={s} onClick={() => setStage(s)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] capitalize transition ${stage === s ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span>{s}</span><Mark plain className="!text-[10px]">{s === "all" ? list.length : list.filter((m) => m.stage === s).length}</Mark>
                </button>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="TradeX" /></h1>
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

          {markets === null && <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{[0, 1, 2, 3].map((i) => <div key={i} className="ng-card mb-3 h-72 animate-pulse opacity-40" />)}</div>}
          {markets && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No markets yet — a project graduates here after it delivers and launches on Alpha.</div></Panel>}
          {filtered.length > 0 && (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {filtered.map((m) => <MarketCard key={m.market_id} m={m} />)}
            </div>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="Graduation" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="GRADUATION" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <ol className="space-y-2 text-[11px] text-ink-dim">
              <li className="flex gap-2"><Mark plain accent="amber" className="!text-[9px]">alpha</Mark> gated first liquidity — graduates only</li>
              <li className="flex gap-2"><Mark plain accent="neon" className="!text-[9px]">spot</Mark> unlocked by real traction (holders)</li>
              <li className="flex gap-2"><Mark plain accent="cyan" className="!text-[9px]">futures</Mark> deep liquidity + licensing, last</li>
            </ol>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">A token reaches TradeX only after its project delivered its milestones — markets are earned, not bought.</p>
          </Panel>
        </OrbPanel>
      </div>
      <NeuGridDock />
    </div>
  );
}
