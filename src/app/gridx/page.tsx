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
import OrbPanel from "@/components/app/OrbPanel";
import { PanelChart } from "@/components/app/terminal";
import { Ring, Gauge } from "@/components/app/charts";
import type { Build, Product } from "@/lib/types";

type P = Product & {
  opens_30d?: number; purchases?: number; owner_id?: string;
  owned_by_me?: boolean; purchased_by_me?: boolean;
  market: { market_id: string; stage: string; symbol: string } | null;
};
type SortKey = "trending" | "revenue" | "new";

const Star = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
);

/* A product tile that earns the click: price · rating · REAL numbers · Open. */
function ProductCard({ product: p, onOpen }: { product: P; onOpen: (p: P) => void }) {
  const live = p.artifact_ref?.preview_url;
  return (
    <div className="ng-card mb-3 flex break-inside-avoid flex-col p-3.5 transition hover:!border-neon/40">
      <div className="flex items-center gap-3">
        <MatrixAvatar seed={p.product_id} size={42} shape="square" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/gridx/${p.product_id}`} className="flex min-w-0 items-center gap-1 truncate text-sm font-bold text-neon hover:underline">{p.name}<IconCheck className="h-3.5 w-3.5 shrink-0" /></Link>
            <span className="shrink-0 text-[11px] font-bold">{(p.price_usdc ?? 0) > 0 ? <span className="text-cyan">${p.price_usdc}</span> : <span className="text-neon">FREE</span>}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag>{p.category}</Tag>
            <Mark plain accent="cyan" className="!text-[9px]"><IconBolt className="h-2.5 w-2.5" />Echo-built</Mark>
            {p.market && <Mark plain accent="amber" className="!text-[9px]">{p.market.stage.toUpperCase()}</Mark>}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px]">
        {p.review_count ? (
          <><span className="flex items-center gap-0.5 text-amber-300">{[...Array(Math.round(p.rating ?? 0))].map((_, i) => <Star key={i} />)}</span><span className="text-ink-dim">{p.rating} ({p.review_count})</span></>
        ) : <span className="text-ink-faint">no reviews yet</span>}
        {p.purchased_by_me && <Mark plain accent="neon" className="ml-auto !text-[9px]">owned</Mark>}
        {p.owned_by_me && <Mark plain className="ml-auto !text-[9px]">yours</Mark>}
      </div>
      {p.description && <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-ink-dim">{p.description}</p>}
      <div className="mt-3 divide-y divide-line border-t border-line pt-2 text-[11px]">
        <div className="ng-row !py-1"><span className="ng-row__k">Revenue</span><Mark plain accent="cyan" className="!text-[11px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Active users 30d</span><Mark plain className="!text-[11px]">{(p.active_users ?? 0).toLocaleString()}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Opens 30d</span><span className="ng-row__v font-normal text-ink-dim">{p.opens_30d ?? 0}</span></div>
      </div>
      <div className="mt-3 flex gap-2">
        {live && <button onClick={() => onOpen(p)} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center"><IconBolt className="h-3 w-3" /> Open</button>}
        <Link href={`/gridx/${p.product_id}`} className="ng-btn ng-btn--sm flex-1 justify-center">Details</Link>
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
    const score = (p: P) => (p.purchases ?? 0) * 3 + (p.opens_30d ?? 0);
    return [...base].sort((a, b) =>
      sort === "revenue" ? (b.onchain_revenue ?? 0) - (a.onchain_revenue ?? 0)
      : sort === "new" ? Date.parse(b.listed_at) - Date.parse(a.listed_at)
      : score(b) - score(a),
    );
  }, [products, category, sort]);
  const topProducts = [...products].sort((a, b) => (b.onchain_revenue ?? 0) - (a.onchain_revenue ?? 0)).slice(0, 5);

  /* catalogue metrics — single-value arcs that read well at ANY product count
     (Bars/Area degenerate to a flat block when the catalogue is tiny). */
  const ratingPct = rated.length ? Math.round((avgRating / 5) * 100) : 0;
  const totalOpens = products.reduce((s, p) => s + (p.opens_30d ?? 0), 0);
  const reviewedCount = products.filter((p) => (p.review_count ?? 0) > 0).length;
  const revenuePct = Math.min(100, Math.round((totalRevenue / 1000) * 100)); // toward a $1K milestone
  const usagePct = Math.min(100, Math.round((totalOpens / 100) * 100));       // toward 100 opens / 30d
  const reviewedPct = products.length ? Math.round((reviewedCount / products.length) * 100) : 0;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — your shop */}
        <OrbPanel side="left" label="Your GridX" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="YOUR GRIDX" icon={<IconStore className="h-4 w-4" />} bodyClass="p-3.5">
            <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--block"><IconBolt className="h-3.5 w-3.5" /> Build &amp; publish with Echo</Link>

            <PanelChart title="Quality · avg rating" read={`${rated.length} rated`}>
              {rated.length ? <div className="flex items-center justify-center py-1"><Ring percent={ratingPct} label="avg rating" value={`${avgRating}★`} size={92} stroke={6} /></div> : <p className="text-[11px] text-ink-faint">No reviews yet.</p>}
            </PanelChart>
            <PanelChart title="Revenue · toward $1K" read={`$${Math.round(totalRevenue).toLocaleString()}`}>
              <div className="flex items-center justify-center py-1"><Gauge percent={revenuePct} value={`${revenuePct}%`} w={150} color="var(--ng-cyan)" /></div>
            </PanelChart>

            <Section icon={<IconLayers className="h-3.5 w-3.5" />}>Your Products</Section>
            {mine.length ? (
              <div className="space-y-2">
                {mine.map((p) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card block p-3">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-ink">{p.name}</span><span className="text-[10px] font-bold">{(p.price_usdc ?? 0) > 0 ? <span className="text-cyan">${p.price_usdc}</span> : <span className="text-neon">FREE</span>}</span></div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink-dim"><span>Sales <span className="text-ink">{p.purchases ?? 0}</span></span><span>Rev <Mark plain className="!text-[10px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark></span></div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">Nothing listed yet — build with Echo and publish.</p>}

            <Section icon={<IconRocket className="h-3.5 w-3.5" />}>Builds Ready to List</Section>
            {unlisted.length ? (
              <div className="space-y-2">
                {unlisted.slice(0, 5).map((b) => (
                  <div key={b.build_id} className="ng-card p-3">
                    <div className="truncate text-sm text-ink">{b.title}</div>
                    <div className="truncate text-[10px] text-ink-dim">{b.stack.join(" · ")}</div>
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
              {shown.map((p) => <ProductCard key={p.product_id} product={p} onOpen={openApp} />)}
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
            <PanelChart title="Reviewed · verified share" read={`${reviewedCount}/${products.length}`}>
              {products.length ? <div className="flex items-center justify-center py-1"><Ring percent={reviewedPct} label="reviewed" value={`${reviewedPct}%`} size={92} stroke={6} /></div> : <p className="text-[11px] text-ink-faint">No products yet.</p>}
            </PanelChart>
            <PanelChart title="Usage · toward 100 opens" read={`${totalOpens.toLocaleString()} opens 30d`}>
              <div className="flex items-center justify-center py-1"><Gauge percent={usagePct} value={`${usagePct}%`} w={150} /></div>
            </PanelChart>

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Top Products</Section>
            {topProducts.length ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card flex items-center gap-3 p-3">
                    <span className="text-[11px] font-bold text-neon/50">#{i + 1}</span>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm text-ink">{p.name}</div><div className="text-[10px] text-ink-dim">{p.category} · {p.purchases ?? 0} sales</div></div>
                    <Mark plain accent="cyan" className="text-[11px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No products yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />}>Categories</Section>
            {categories.length ? (
              <div className="flex flex-wrap gap-2">{categories.map(([c, n]) => (
                <button key={c} onClick={() => setCategory(category === c ? "All" : c)}><Tag className={category === c ? "!text-neon" : ""}>{c} · {n}</Tag></button>
              ))}</div>
            ) : <p className="text-[11px] text-ink-dim">—</p>}

            <Section icon={<IconRocket className="h-3.5 w-3.5" />}>Build Pipeline</Section>
            <div className="ng-card p-3.5">
              <div className="divide-y divide-line text-[12px]">
                <div className="ng-row !py-2"><span className="ng-row__k flex items-center gap-2 text-ink"><IconRocket className="h-3.5 w-3.5 text-neon/70" />Builds</span><Mark plain>{builds.length}</Mark></div>
                <div className="ng-row !py-2"><span className="ng-row__k flex items-center gap-2 text-ink"><IconStore className="h-3.5 w-3.5 text-neon/70" />Listed</span><Mark plain>{products.length}</Mark></div>
                <Link href="/echo" className="ng-row flex items-center !py-2 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><IconArrowRight className="h-3.5 w-3.5 text-neon/70" />Ready to list</span><Mark plain accent="amber">{unlisted.length}</Mark></Link>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Every number here is derived from settled receipts and real opens — products can&#39;t self-report success.</p>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
