"use client";

/**
 * GridX — the on-chain app store (rebuilt 2026-07-03): every number derived from
 * real settlements/usage, working category filters + sort (trending/revenue/new),
 * price + rating on cards, and an Open button that plays the real app.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket,
  IconGrid, IconCheck, IconBolt, IconRocket, IconStore,
  IconCoins, IconLayers, IconArrowRight,
  kpiColor,
} from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import LivePreview from "@/components/app/LivePreview";
import OrbPanel from "@/components/app/OrbPanel";
import { PanelChart } from "@/components/app/terminal";
import { RadialBars, ConcentricRings, Bubble, Bars, Ring, Funnel } from "@/components/app/charts";
import type { Build, Product } from "@/lib/types";

type P = Product & {
  opens_30d?: number; purchases?: number; owner_id?: string;
  owned_by_me?: boolean; purchased_by_me?: boolean;
  market: { market_id: string; stage: string; symbol: string } | null;
};
type SortKey = "trending" | "revenue" | "new";

/** The page's own trending metric — real usage only (settled purchases + opens). */
const trendScore = (p: P) => (p.purchases ?? 0) * 3 + (p.opens_30d ?? 0);

const Star = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
);

/* A product tile in trade-card form: identity · traction hero · the record · action. */
function ProductCard({ product: p, onOpen, trendMax }: { product: P; onOpen: (p: P) => void; trendMax: number }) {
  const live = p.artifact_ref?.preview_url;
  const hasTraction = (p.onchain_revenue ?? 0) > 0 || (p.active_users ?? 0) > 0 || (p.opens_30d ?? 0) > 0 || (p.purchases ?? 0) > 0;
  // REAL proportion: this product's traction as a share of the catalogue leader's
  const trendPct = Math.round((trendScore(p) / trendMax) * 100);
  return (
    <div className="ng-card mb-3 flex break-inside-avoid flex-col p-3.5 transition hover:!border-neon/40">
      {/* identity — avatar + name + price */}
      <div className="flex items-center gap-3">
        <MatrixAvatar seed={p.product_id} size={42} shape="square" />
        <div className="min-w-0 flex-1">
          <Link href={`/gridx/${p.product_id}`} className="flex min-w-0 items-center gap-1 text-sm font-bold text-neon hover:underline"><span className="truncate">{p.name}</span><IconCheck className="h-3.5 w-3.5 shrink-0" /></Link>
          <div className="truncate text-[10px] text-ink-faint">{p.category}</div>
        </div>
        <span className="shrink-0 text-[11px] font-bold">{(p.price_usdc ?? 0) > 0 ? <span className="text-cyan">${p.price_usdc}</span> : <span className="text-neon">FREE</span>}</span>
      </div>
      {p.description && <p className="mt-2 truncate text-[11px] text-ink-dim" title={p.description}>{p.description}</p>}
      {/* live window — the actual product, rendered small (only when hosted) */}
      {live && <LivePreview src={live} height={110} scale={0.32} className="mt-3" />}
      {/* hero — traction ring (share of the #1 product) + revenue headline */}
      <div className="mt-3 flex items-center gap-4">
        <Ring percent={trendPct} value={`${trendPct}%`} size={54} stroke={5} />
        <div className="min-w-0">
          <div className="ng-stat__v !text-2xl text-neon tnum">${(p.onchain_revenue ?? 0).toLocaleString()}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-faint">{hasTraction ? "revenue" : "newly listed"}</div>
        </div>
      </div>
      {/* the record */}
      <div className="mt-3 divide-y divide-line text-[11px]">
        <div className="ng-row !py-1"><span className="ng-row__k">Rating</span><span className="ng-row__v flex items-center gap-1 font-normal text-ink-dim">{p.review_count ? <><span className="flex items-center gap-0.5 text-amber-300">{[...Array(Math.round(p.rating ?? 0))].map((_, i) => <Star key={i} />)}</span>{p.rating} ({p.review_count})</> : "—"}</span></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Sales</span><span className="ng-row__v font-normal text-ink-dim tnum">{p.purchases ?? 0}</span></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Users 30D</span><span className="ng-row__v font-normal text-ink-dim tnum">{(p.active_users ?? 0).toLocaleString()}</span></div>
      </div>
      {/* footer — status chips + the action */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[10px]">
        <span className="flex min-w-0 items-center gap-2">
          {p.market && <Mark plain accent="amber" className="!text-[9px]">{p.market.stage.toUpperCase()}</Mark>}
          {p.purchased_by_me && <Mark plain accent="neon" className="!text-[9px]">owned</Mark>}
          {p.owned_by_me && <Mark plain className="!text-[9px]">yours</Mark>}
          {live && <Link href={`/gridx/${p.product_id}`} className="flex items-center gap-1 text-neon transition hover:text-glow">Details<IconArrowRight className="h-3 w-3" /></Link>}
        </span>
        {live
          ? <button onClick={() => onOpen(p)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0"><IconBolt className="h-3 w-3" /> Open</button>
          : <Link href={`/gridx/${p.product_id}`} className="ng-btn ng-btn--sm shrink-0">Details</Link>}
      </div>
    </div>
  );
}

function Section({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between gap-2 first:mt-1">
      <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon">{icon}</span>{children}</div>
      {action}
    </div>
  );
}

export default function GridXPage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  const [products, setProducts] = useState<P[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("trending");
  useEffect(() => {
    fetch("/api/gridx").then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => {});
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => setBuilds(d.builds ?? [])).catch(() => {});
  }, []);

  /* opening the live app IS the usage signal */
  const openApp = (p: P) => {
    fetch(`/api/gridx/${p.product_id}/open`, { method: "POST" }).catch(() => {});
    if (p.artifact_ref?.preview_url) window.open(p.artifact_ref.preview_url, "_blank", "noopener");
  };

  const totalRevenue = products.reduce((s, p) => s + (p.onchain_revenue ?? 0), 0);
  const totalPurchases = products.reduce((s, p) => s + (p.purchases ?? 0), 0);
  const rated = products.filter((p) => (p.review_count ?? 0) > 0);
  const avgRating = rated.length ? Math.round((rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length) * 10) / 10 : 0;
  const kpis: [string, number, string?][] = [
    ["Products", products.length],
    ["Revenue", Math.round(totalRevenue), "$"],
    ["Purchases", totalPurchases],
    ["Active Users 30D", products.reduce((s, p) => s + (p.active_users ?? 0), 0)],
    ["Avg Rating", avgRating],
  ];

  const mine = products.filter((p) => p.owned_by_me);
  const unlisted = builds.filter((b) => !b.product_id);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => m.set(p.category, (m.get(p.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const shown = useMemo(() => {
    const base = category === "All" ? products : products.filter((p) => p.category === category);
    return [...base].sort((a, b) =>
      sort === "revenue" ? (b.onchain_revenue ?? 0) - (a.onchain_revenue ?? 0)
      : sort === "new" ? Date.parse(b.listed_at) - Date.parse(a.listed_at)
      : trendScore(b) - trendScore(a),
    );
  }, [products, category, sort]);
  // Card rings compare each product to the catalogue's trend leader (whole store, not the filter).
  const trendMax = Math.max(1, ...products.map(trendScore));
  const topProducts = [...products].sort((a, b) => (b.onchain_revenue ?? 0) - (a.onchain_revenue ?? 0)).slice(0, 5);
  // Rail meters — each product's real revenue vs the store's revenue leader.
  const maxRevenue = Math.max(1, ...products.map((p) => p.onchain_revenue ?? 0));

  /* catalogue metrics — single-value arcs that read well at ANY product count
     (Bars/Area degenerate to a flat block when the catalogue is tiny). */
  const ratingPct = rated.length ? Math.round((avgRating / 5) * 100) : 0;
  const totalOpens = products.reduce((s, p) => s + (p.opens_30d ?? 0), 0);
  const reviewedCount = products.filter((p) => (p.review_count ?? 0) > 0).length;
  const usagePct = Math.min(100, Math.round((totalOpens / 100) * 100));       // toward 100 opens / 30d
  const reviewedPct = products.length ? Math.round((reviewedCount / products.length) * 100) : 0;

  /* futuristic rail-chart data — grounded, SSR-safe (radial burst · nested rings · sonar scope · waveform).
     Aggregate-driven so they read well at ANY product count (demo can be a single product). */
  const totalUsers = products.reduce((s, p) => s + (p.active_users ?? 0), 0);
  const kpiBurst = [
    Math.min(100, (totalRevenue / 1000) * 100),
    Math.min(100, (totalPurchases / 50) * 100),
    Math.min(100, (totalUsers / 100) * 100),
    usagePct,
    Math.min(100, (products.length / 10) * 100),
  ];
  const kpiLabels = ["REV", "BUY", "USR", "OPEN", "APPS"];
  const hasBurst = kpiBurst.some((v) => v > 0);
  const vitals = [{ pct: ratingPct, color: "#00ff00" }, { pct: reviewedPct, color: "#48f5ff" }, { pct: usagePct, color: "#ffb020" }];
  // REAL: tech-stack usage tallied across all builds (bubble) · build pipeline counts (bars)
  const techCounts = builds.flatMap((b) => b.stack ?? []).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
  const techTop = Object.entries(techCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const techBubbles = techTop.map(([t, n], i) => ({ value: n, label: t.slice(0, 4), color: ["#00ff00", "#48f5ff", "#ffb020", "#7cf57c"][i % 4] }));
  const pipelineBars = [builds.length, products.length, unlisted.length];
  // conversion funnel — how builds become earning products (all real data)
  const usedCount = products.filter((p) => (p.opens_30d ?? 0) > 0 || (p.active_users ?? 0) > 0 || (p.purchases ?? 0) > 0).length;
  const earningCount = products.filter((p) => (p.onchain_revenue ?? 0) > 0).length;
  const funnelSteps = [
    { value: builds.length, label: "Built", color: "rgba(0,255,65,0.85)" },
    { value: products.length, label: "Listed", color: "rgba(0,255,65,0.6)" },
    { value: usedCount, label: "In use", color: "rgba(0,255,65,0.42)" },
    { value: earningCount, label: "Earning", color: "rgba(0,255,65,0.28)" },
  ];
  // witnessed-step depth across the ready-to-list builds (proof maturity)
  const maxSteps = Math.max(1, ...unlisted.map((b) => b.steps?.length ?? 0));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — your shop */}
        <OrbPanel side="left" label="Your GridX" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="YOUR GRIDX" icon={<IconStore className="h-4 w-4" />} bodyClass="p-3.5">
            <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--block"><IconBolt className="h-3.5 w-3.5" /> Build &amp; publish with Echo</Link>

            <PanelChart title="Traction · signal burst" read={`$${Math.round(totalRevenue).toLocaleString()}`}>
              {hasBurst
                ? <div className="flex justify-center py-1"><RadialBars data={kpiBurst} labels={kpiLabels} size={156} /></div>
                : <p className="text-[11px] text-ink-faint">No activity yet.</p>}
            </PanelChart>
            <PanelChart title="Catalogue · vitals" read={`${products.length} products`}>
              {products.length
                ? <div className="flex items-center justify-center gap-3 py-1">
                    <ConcentricRings rings={vitals} size={140} />
                    <div className="space-y-1 text-[10px]">
                      <div className="flex items-center gap-1.5"><span className="inline-block h-2 w-2" style={{ background: "#00ff00" }} /><span className="text-ink-dim">rating</span><span className="ml-auto tnum text-ink-faint">{avgRating}★</span></div>
                      <div className="flex items-center gap-1.5"><span className="inline-block h-2 w-2" style={{ background: "#48f5ff" }} /><span className="text-ink-dim">reviewed</span><span className="ml-auto tnum text-ink-faint">{reviewedPct}%</span></div>
                      <div className="flex items-center gap-1.5"><span className="inline-block h-2 w-2" style={{ background: "#ffb020" }} /><span className="text-ink-dim">usage</span><span className="ml-auto tnum text-ink-faint">{usagePct}%</span></div>
                    </div>
                  </div>
                : <p className="text-[11px] text-ink-faint">No products yet.</p>}
            </PanelChart>

            <Section icon={<IconLayers className="h-3.5 w-3.5" />}>Your Products</Section>
            {mine.length ? (
              <div className="space-y-2">
                {mine.map((p) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card block p-3">
                    <div className="flex items-center gap-2"><MatrixAvatar seed={p.product_id} size={22} shape="square" /><span className="min-w-0 flex-1 truncate text-xs text-ink">{p.name}</span><span className="shrink-0 text-[10px] font-bold">{(p.price_usdc ?? 0) > 0 ? <span className="text-cyan">${p.price_usdc}</span> : <span className="text-neon">FREE</span>}</span></div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink-dim"><span>Sales <span className="text-ink">{p.purchases ?? 0}</span></span><span>Rev <Mark plain className="!text-[10px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark></span></div>
                    <div className="mt-1.5 flex items-center gap-2 text-[9px] uppercase tracking-wide text-ink-faint"><span className="shrink-0">Rev vs leader</span><Meter value={p.onchain_revenue ?? 0} max={maxRevenue} w={64} className="ml-auto" /></div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">Nothing listed yet — build with Echo and publish.</p>}

            <Section icon={<IconRocket className="h-3.5 w-3.5" />}>Builds Ready to List</Section>
            {unlisted.length ? (
              <div className="space-y-2">
                {unlisted.slice(0, 5).map((b) => (
                  <div key={b.build_id} className="ng-card p-3">
                    <div className="flex items-center gap-2">
                      <MatrixAvatar seed={b.build_id} size={22} shape="square" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-ink">{b.title}</div>
                        <div className="truncate text-[10px] text-ink-dim">{b.stack.join(" · ")}</div>
                      </div>
                    </div>
                    {/* proof maturity — how many build steps were witnessed */}
                    <div className="mt-2 flex items-center gap-2 text-[9px] uppercase tracking-wide text-ink-faint">
                      <IconCheck className="h-3 w-3 shrink-0 text-neon/70" />
                      <span className="shrink-0">{b.steps?.length ?? 0} steps witnessed{(b.version ?? 1) > 1 ? ` · v${b.version}` : ""}</span>
                      <Meter value={b.steps?.length ?? 0} max={maxSteps} w={52} className="ml-auto" />
                    </div>
                    <Link href="/echo" className="ng-btn ng-btn--sm ng-btn--block mt-2">List on GridX →</Link>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">All your builds are listed.</p>}
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-5 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h1 className="ng-title flex items-center gap-2 text-2xl font-bold text-neon text-glow-soft"><IconStore className="h-6 w-6" /><Decrypt text="GridX" /></h1>
            <p className="mt-1 text-sm text-ink-dim">The on-chain app store — try the real app, buy with USDC, review as a verified user.</p>
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

          {/* sort + category controls — they actually filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="ng-tabs !gap-4">
              {(["trending", "revenue", "new"] as SortKey[]).map((s) => (
                <button key={s} onClick={() => setSort(s)} data-active={sort === s} className="ng-tab capitalize">{s === "revenue" ? "Top revenue" : s}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["All", ...categories.map(([c]) => c)].map((c) => (
                <button key={c} onClick={() => setCategory(c)} className={`rounded px-2 py-1 text-[10px] uppercase tracking-wider transition ${category === c ? "bg-neon/15 text-neon" : "text-ink-dim hover:text-neon"}`}>{c}</button>
              ))}
            </div>
          </div>

          {shown.length ? (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {shown.map((p) => <ProductCard key={p.product_id} product={p} onOpen={openApp} trendMax={trendMax} />)}
            </div>
          ) : (
            <Bracket className="ng-card p-8 text-center">
              <IconStore className="mx-auto h-10 w-10 text-neon/60" />
              <div className="mt-3 text-sm text-ink">{products.length ? "Nothing in this category." : "No products on GridX yet."}</div>
              <p className="mt-1 text-[11px] text-ink-dim">Build an MVP with Echo and publish it — it&#39;ll show up here with its proof of build.</p>
              <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--sm mt-3"><IconBolt className="h-3.5 w-3.5" /> Build with Echo</Link>
            </Bracket>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="SIGNAL" icon={<IconCoins className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Tech · stack usage" read={`${techTop.length} stacks`}>
              {techTop.length
                ? <div className="py-1"><Bubble data={techBubbles} h={120} /></div>
                : <p className="text-[11px] text-ink-faint">No builds yet.</p>}
            </PanelChart>
            <PanelChart title="Pipeline · builds → listed" read={`${products.length}/${builds.length} listed`}>
              {builds.length
                ? <><Bars data={pipelineBars} h={72} />
                    <div className="mt-1 flex justify-around text-[9px] text-ink-faint"><span>builds</span><span>listed</span><span>ready</span></div></>
                : <p className="text-[11px] text-ink-faint">No builds yet.</p>}
            </PanelChart>

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Top Products</Section>
            {topProducts.length ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card flex items-center gap-3 p-3">
                    <span className="text-[11px] font-bold text-neon/50">#{i + 1}</span>
                    <MatrixAvatar seed={p.product_id} size={24} shape="square" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-ink">{p.name}</div>
                      <div className="truncate text-[10px] text-ink-dim">{p.category} · {p.purchases ?? 0} sales</div>
                      <Meter value={p.onchain_revenue ?? 0} max={maxRevenue} w={72} className="mt-1" />
                    </div>
                    <Mark plain accent="cyan" className="text-[11px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No products yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />}>Categories</Section>
            {categories.length ? (
              <div className="space-y-1">{categories.map(([c, n]) => (
                <button key={c} onClick={() => setCategory(category === c ? "All" : c)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] transition ${category === c ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span className="min-w-0 flex-1 truncate text-left">{c}</span>
                  <Meter value={n} max={Math.max(1, products.length)} w={48} />
                  <Tag className={`!text-[9px] ${category === c ? "!text-neon" : ""}`}>{n}</Tag>
                </button>
              ))}</div>
            ) : <p className="text-[11px] text-ink-dim">—</p>}

            <Section icon={<IconRocket className="h-3.5 w-3.5" />}>Build → Earning</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-stretch gap-2.5">
                {/* step labels */}
                <div className="grid grid-rows-4 py-0.5 text-right text-[9px] uppercase leading-none tracking-wide text-ink-faint" style={{ height: 108 }}>
                  {funnelSteps.map((s) => <span key={s.label} className="flex items-center justify-end">{s.label}</span>)}
                </div>
                {/* the narrowing funnel — built to earning */}
                <div className="min-w-0 flex-1 self-center"><Funnel data={funnelSteps} w={180} h={108} gap={5} /></div>
                {/* live counts */}
                <div className="grid grid-rows-4 py-0.5 text-[12px] font-bold leading-none text-neon tnum" style={{ height: 108 }}>
                  {funnelSteps.map((s) => <span key={s.label} className="flex items-center">{s.value}</span>)}
                </div>
              </div>
              <div className="mt-2.5 border-t border-line pt-2 text-[9px] leading-relaxed text-ink-faint">
                {earningCount}/{builds.length || 0} builds now earn revenue — every step is a settled receipt, not a self-reported claim.
              </div>
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
