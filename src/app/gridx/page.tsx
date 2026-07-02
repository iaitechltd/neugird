"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuGridDock from "@/components/app/NeuGridDock";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket,
  IconChevronDown, IconGrid, IconCheck, IconBolt, IconRocket, IconStore,
  IconCoins, IconUser, IconLayers, IconArrowRight,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import type { Build, Product } from "@/lib/types";

/* A real GridX product (published from an Echo build) — clean vertical tile. */
function ProductCard({ product }: { product: Product }) {
  const a = product.artifact_ref;
  return (
    <Link href={`/gridx/${product.product_id}`} className="ng-card mb-3 flex break-inside-avoid flex-col p-3.5 transition hover:!border-neon/40">
      <div className="flex items-center gap-3">
        <MatrixAvatar seed={product.product_id} size={42} shape="square" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-bold text-neon">{product.name}<IconCheck className="h-3.5 w-3.5 shrink-0 text-neon" /></div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5"><Tag>{product.category}</Tag><Mark plain accent="cyan" className="!text-[9px]"><IconBolt className="h-2.5 w-2.5" />Echo-built</Mark></div>
        </div>
      </div>
      {product.description && <p className="mt-2.5 line-clamp-3 text-[11px] leading-relaxed text-ink-dim">{product.description}</p>}
      <div className="mt-3 divide-y divide-line border-t border-line pt-2.5 text-[11px]">
        <div className="ng-row !py-1"><span className="ng-row__k">Revenue 30D</span><Mark plain className="!text-[11px]">${(product.onchain_revenue ?? 0).toLocaleString()}</Mark></div>
        <div className="ng-row !py-1"><span className="ng-row__k">Active users</span><Mark plain className="!text-[11px]">{(product.active_users ?? 0).toLocaleString()}</Mark></div>
        {a?.proof_of_build && <div className="ng-row !py-1"><span className="ng-row__k">Proof</span><span className="ng-row__v max-w-[55%] truncate font-normal text-ink-dim">{a.proof_of_build}</span></div>}
      </div>
    </Link>
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
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2400); }

  const [products, setProducts] = useState<Product[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  useEffect(() => {
    fetch("/api/gridx").then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => {});
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => setBuilds(d.builds ?? [])).catch(() => {});
  }, []);

  const totalRevenue = products.reduce((s, p) => s + (p.onchain_revenue ?? 0), 0);
  const totalUsers = products.reduce((s, p) => s + (p.active_users ?? 0), 0);
  const unlisted = builds.filter((b) => !b.product_id);
  const categories = Array.from(new Set(products.map((p) => p.category)));
  const topProducts = [...products].sort((a, b) => (b.onchain_revenue ?? 0) - (a.onchain_revenue ?? 0)).slice(0, 5);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search the grid")} onBell={() => notify("Notifications")} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Your GridX" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="YOUR GRIDX" icon={<IconStore className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--block"><IconBolt className="h-3.5 w-3.5" /> Build &amp; publish with Echo</Link>

            <Section icon={<IconLayers className="h-3.5 w-3.5" />}>Your Products</Section>
            {products.length ? (
              <div className="space-y-2">
                {products.map((p) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card block p-3">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm text-ink">{p.name}</span><Mark className="!text-[9px]">Live</Mark></div>
                    <div className="text-[10px] text-ink-dim">{p.category}</div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink-dim"><span>Users <span className="text-ink">{(p.active_users ?? 0).toLocaleString()}</span></span><span>Rev 30D <Mark plain className="!text-[10px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark></span></div>
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
            <p className="mt-1 text-sm text-ink-dim">The on-chain app store — products shipped through Echo, with verifiable usage &amp; revenue.</p>
          </div>

          {/* real stats */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {([["Products", products.length.toLocaleString(), IconGrid], ["Active users", totalUsers.toLocaleString(), IconUser], ["On-chain revenue", `$${totalRevenue.toLocaleString()}`, IconCoins]] as [string, string, (p: { className?: string }) => React.JSX.Element][]).map(([k, v, Ico]) => (
              <div key={k} className="ng-card p-3.5">
                <div className="ng-tag ng-tag--neon mb-1.5"><Ico className="h-3 w-3" />{k}</div>
                <div className="ng-stat__v !text-xl">{v}</div>
              </div>
            ))}
          </div>

          <div className="ng-label flex items-center gap-2 !text-neon"><IconStore className="h-4 w-4" />All Products <Mark plain accent="cyan" className="text-[11px]">{products.length}</Mark></div>
          {products.length ? (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {products.map((p) => <ProductCard key={p.product_id} product={p} />)}
            </div>
          ) : (
            <Bracket className="ng-card p-8 text-center">
              <IconStore className="mx-auto h-10 w-10 text-neon/60" />
              <div className="mt-3 text-sm text-ink">No products on GridX yet.</div>
              <p className="mt-1 text-[11px] text-ink-dim">Build an MVP with Echo and publish it — it&#39;ll show up here with its proof of build.</p>
              <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--sm mt-3"><IconBolt className="h-3.5 w-3.5" /> Build with Echo</Link>
            </Bracket>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="SIGNAL" icon={<IconCoins className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Top Products</Section>
            {topProducts.length ? (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card flex items-center gap-3 p-3">
                    <span className="text-[11px] font-bold text-neon/50">#{i + 1}</span>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm text-ink">{p.name}</div><div className="text-[10px] text-ink-dim">{p.category}</div></div>
                    <Mark plain accent="cyan" className="text-[11px]">${(p.onchain_revenue ?? 0).toLocaleString()}</Mark>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No products yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />}>Categories</Section>
            {categories.length ? (
              <div className="flex flex-wrap gap-2">{categories.map((c) => <Tag key={c}>{c}</Tag>)}</div>
            ) : <p className="text-[11px] text-ink-dim">—</p>}

            <Section icon={<IconRocket className="h-3.5 w-3.5" />}>Build Pipeline</Section>
            <div className="ng-card p-3.5">
              <div className="divide-y divide-line text-[12px]">
                <div className="ng-row !py-2"><span className="ng-row__k flex items-center gap-2 text-ink"><IconRocket className="h-3.5 w-3.5 text-neon/70" />Builds</span><Mark plain>{builds.length}</Mark></div>
                <div className="ng-row !py-2"><span className="ng-row__k flex items-center gap-2 text-ink"><IconStore className="h-3.5 w-3.5 text-neon/70" />Listed</span><Mark plain>{products.length}</Mark></div>
                <Link href="/echo" className="ng-row flex items-center !py-2 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><IconArrowRight className="h-3.5 w-3.5 text-neon/70" />Ready to list</span><Mark plain accent="amber">{unlisted.length}</Mark></Link>
              </div>
            </div>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
      <NeuGridDock />
    </div>
  );
}
