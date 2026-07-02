"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuGridDock from "@/components/app/NeuGridDock";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Mark, Tag, Bracket,
  IconCheck, IconBolt, IconRocket, IconCoins, IconShield,
  IconLayers, IconArrowRight, IconStore, IconPlay, IconNetwork,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import type { Build, Grid, Product } from "@/lib/types";

type View = { product: Product; grid: Grid | null; build: Build | null; market: { market_id: string; stage: string } | null; launch: { ok: boolean; reason?: string } | null };

export default function GridXDetail() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2400); }

  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/gridx/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setView(d?.product ? d : null); setLoaded(true); }).catch(() => setLoaded(true));
  }, [id]);

  const backBar = (
    <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/gridx" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to GridX</Link></div>
  );

  // loading / not-found — clean states
  if (!loaded || !view) {
    return (
      <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
        <NeuHeader />
        {backBar}
        <div className="grid flex-1 place-items-center px-4 py-16 text-center">
          {!loaded ? (
            <div className="text-sm text-ink-dim"><IconStore className="mx-auto mb-3 h-9 w-9 animate-pulse text-neon/60" />Loading product…</div>
          ) : (
            <div>
              <IconStore className="mx-auto h-10 w-10 text-neon/50" />
              <div className="mt-3 text-sm text-ink">Product not found.</div>
              <p className="mt-1 text-[11px] text-ink-dim">It may not be listed on GridX (yet).</p>
              <Link href="/gridx" className="ng-btn ng-btn-primary ng-btn--sm mt-4">Browse GridX</Link>
            </div>
          )}
        </div>
        <NeuGridDock />
      </div>
    );
  }

  const { product: p, grid, build, market, launch } = view;
  const a = p.artifact_ref;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search the grid")} onBell={() => notify("Notifications")} />
      {backBar}

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Product" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-panel p-4">
            <div className="flex items-center gap-3">
              <MatrixAvatar seed={p.product_id} size={44} shape="square" />
              <div className="min-w-0"><div className="truncate text-sm font-bold text-neon">{p.name}</div><div className="text-[10px] text-ink-dim">{p.category} · {a?.kind ?? "app"}</div></div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px]"><IconBolt className="h-3 w-3 text-neon" /><Mark plain accent="cyan">Echo-built</Mark></div>
            {a?.proof_of_build && <div className="mt-1 break-all text-[11px] text-ink-dim">Proof: <Mark plain>{a.proof_of_build}</Mark></div>}
            <div className="mt-2 flex items-center gap-1.5 text-[10px]"><IconCheck className="h-3.5 w-3.5 text-neon" /><Mark plain accent="neon">Listed on GridX</Mark></div>
          </div>

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-4 w-4" /></span>Actions</div>
            {grid && <Link href={`/grid/${grid.slug}`} className="ng-btn ng-btn-primary ng-btn--block"><IconNetwork className="h-3.5 w-3.5" /> Open Project Grid</Link>}
            {market ? (
              <Link href={`/market/${market.market_id}`} className="ng-btn ng-btn-cyan ng-btn--block mt-2"><IconBolt className="h-3.5 w-3.5" /> Trading on {market.stage} →</Link>
            ) : grid && launch ? (
              <Link href={`/grid/${grid.slug}`} className="ng-btn ng-btn-cyan ng-btn--block mt-2"><IconRocket className="h-3.5 w-3.5" /> Tokenize on TradeX</Link>
            ) : null}
            {build?.proposal_id && <Link href="/genesis/board" className="ng-btn ng-btn--block mt-2"><IconCoins className="h-3.5 w-3.5" /> View on GenesisX</Link>}
            {a?.preview_url && <button onClick={() => notify(`Preview: ${a.preview_url}`)} className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-2"><IconPlay className="h-3.5 w-3.5" /> Live Preview</button>}
          </div>

          {build && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconRocket className="h-4 w-4" /></span>From Build</div>
              <div className="text-sm text-ink">{build.title}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">{build.stack.map((s) => <Tag key={s}>{s}</Tag>)}</div>
            </div>
          )}
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-6 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-start gap-4">
              <MatrixAvatar seed={p.product_id} size={56} shape="square" className="shrink-0" />
              <div><div className="ng-title text-3xl font-bold text-neon text-glow"><Decrypt text={p.name} /></div><p className="text-sm text-ink-dim">{p.description}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-dim"><span>Category: <span className="text-ink">{p.category}</span></span><span>Type: <span className="text-ink">{a?.kind ?? "app"}</span></span><span>Listed: <Mark plain>{new Date(p.listed_at).toLocaleDateString()}</Mark></span></div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]"><Mark accent="cyan"><IconBolt className="h-3 w-3" />Echo-built</Mark><Mark accent="neon">Proof sealed</Mark>{build?.proposal_id && <Mark accent="amber">On GenesisX</Mark>}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {grid && <Link href={`/grid/${grid.slug}`} className="ng-btn ng-btn-primary"><IconNetwork className="h-3.5 w-3.5" /> Open Project Grid</Link>}
              {build?.proposal_id && <Link href="/genesis/board" className="ng-btn"><IconCoins className="h-3.5 w-3.5" /> View on GenesisX</Link>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{([["Active users", String(p.active_users ?? 0)], ["Revenue 30D", `$${(p.onchain_revenue ?? 0).toLocaleString()}`], ["Followers", String(p.followers ?? 0)], ["Status", build?.status ?? "listed"]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="ng-row !py-1.5"><span className="ng-row__k">{k}</span><span className="ng-row__v !text-neon">{v}</span></div>
            ))}</div>
          </Bracket>

          {/* proof of build + provenance — real */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconShield className="h-4 w-4" />Proof of Build &amp; Provenance</div>
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              <div className="ng-card p-3.5">
                <div className="ng-label mb-2 !text-ink-dim">Artifact</div>
                <div className="divide-y divide-line text-[11px]">
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Attestation</span><span className="ng-row__v"><Mark plain>{a?.proof_of_build}</Mark></span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Artifact ID</span><span className="ng-row__v">{a?.artifact_id}</span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Kind</span><span className="ng-row__v">{a?.kind}</span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Built with Echo</span><span className="ng-row__v !text-neon">{a?.built_with_echo ? "Yes" : "No"}</span></div>
                  {build && <div className="ng-row !py-1.5"><span className="ng-row__k">Witnessed</span><span className="ng-row__v">{build.steps.length} steps</span></div>}
                </div>
              </div>
              <div className="ng-card p-3.5">
                <div className="ng-label mb-2 !text-ink-dim">Provenance</div>
                {grid ? <Link href={`/grid/${grid.slug}`} className="flex items-center justify-between text-[12px] text-ink transition hover:text-neon">Home Grid <span className="flex items-center gap-1 text-neon">{grid.name}<IconArrowRight className="h-3 w-3" /></span></Link> : <div className="text-[11px] text-ink-dim">No home Grid</div>}
                {build && <div className="mt-2 text-[11px] text-ink-dim">From build: <Mark plain>{build.title}</Mark></div>}
                {build?.proposal_id ? <Link href="/genesis/board" className="mt-2 flex items-center gap-1 text-[11px] text-neon transition hover:text-glow"><IconCoins className="h-3 w-3" />Raising on GenesisX</Link> : <div className="mt-2 text-[11px] text-ink-faint">Not raising yet</div>}
              </div>
            </div>
          </section>

          {/* witnessed build stream — real */}
          {build && (
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconRocket className="h-4 w-4" />How it was built</div>
              <div className="ng-card p-3.5">
                <div className="divide-y divide-line">{build.steps.map((s) => (
                  <div key={s.label} className="flex items-center justify-between py-2.5">
                    <div><div className="text-[13px] text-ink">{s.label}</div>{s.detail && <div className="text-[10px] text-ink-dim">{s.detail}</div>}</div>
                    <Mark className="!text-[10px]"><IconCheck className="h-3 w-3" />Done</Mark>
                  </div>
                ))}</div>
              </div>
            </section>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 !text-ink-dim">Metrics</div>
            <div className="divide-y divide-line text-[12px]">
              {([["On-chain revenue", `$${(p.onchain_revenue ?? 0).toLocaleString()}`], ["Active users", (p.active_users ?? 0).toLocaleString()], ["Followers", (p.followers ?? 0).toLocaleString()], ["Rating", p.review_count ? `${p.rating ?? 0} (${p.review_count})` : "—"]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="py-2.5 first:pt-0 last:pb-0"><div className="ng-stat__k">{k}</div><div className="text-lg font-bold text-neon text-glow tnum">{v}</div></div>
              ))}
            </div>
          </div>

          {grid && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconNetwork className="h-4 w-4" /></span>Home Grid</div>
              <Link href={`/grid/${grid.slug}`} className="block">
                <div className="text-sm text-ink transition hover:text-neon">{grid.name}</div>
                <div className="text-[10px] text-ink-dim">{grid.category} · {grid.member_count} members</div>
              </Link>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconLayers className="h-4 w-4" /></span>Trust</div>
            <div className="flex items-center gap-1.5 text-[11px]"><IconCheck className="h-3.5 w-3.5 text-neon" /><Mark plain accent="neon">Proof of build verified</Mark></div>
            <p className="mt-1 text-[10px] text-ink-dim">Witnessed by Echo end-to-end; attestation {a?.proof_of_build}.</p>
          </div>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
      <NeuGridDock />
    </div>
  );
}
