"use client";

/**
 * GridX product page (rebuilt 2026-07-03) — a page that SELLS: the live app
 * embedded and playable, a real buy loop (USDC → owner, fee → treasury),
 * verified-purchase reviews, provenance (proof hash + builder + version
 * changelog from Echo revisions), and the tokenize/trade arc. All numbers are
 * DERIVED from real settlements/usage — never stored counters.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Mark, Bracket,
  IconCheck, IconBolt, IconRocket, IconCoins, IconShield,
  IconLayers, IconArrowRight, IconStore, IconNetwork,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import type { Build, Grid, Product } from "@/lib/types";

type EnrichedProduct = Product & { opens_30d?: number; purchases?: number };
type Review = { review_id: string; user_id: string; username: string; rating: number; text?: string; created_at: string };
type View = {
  product: EnrichedProduct; grid: Grid | null; build: Build | null;
  market: { market_id: string; stage: string } | null; launch: { ok: boolean; reason?: string } | null;
  reviews: Review[];
  owner: { id: string; username: string; reputation: number } | null;
  me: { id: string; owned: boolean; purchased: boolean; can_review: boolean; review_block?: string };
};

const Star = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
);
function Stars({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`inline-flex items-center gap-0.5 text-amber-300 ${className}`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} filled={i <= Math.round(value)} />)}</span>;
}

const REVIEW_BLOCK_COPY: Record<string, string> = {
  own_product: "You built this — owners can't review their own product.",
  already_reviewed: "You already reviewed this product.",
  not_purchased: "Buy the product to unlock your review — reviews here are verified purchases only.",
  not_used: "Open the app first — reviews are written by real users only.",
};

export default function GridXDetail() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2600); }

  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [priceDraft, setPriceDraft] = useState("");
  const pinged = useRef(false);

  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/gridx/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setView(d?.product ? d : null); setLoaded(true); }).catch(() => setLoaded(true));
  }, [id]);
  useEffect(load, [load]);

  // real-usage ping: rendering the live demo counts as an open (once per visit)
  useEffect(() => {
    if (!view || pinged.current) return;
    if (view.product.artifact_ref?.preview_url || view.build?.deployment) {
      pinged.current = true;
      fetch(`/api/gridx/${id}/open`, { method: "POST" }).catch(() => {});
    }
  }, [view, id]);

  const buy = async () => {
    if (!view) return;
    setBuying(true);
    try {
      const res = await fetch(`/api/gridx/${id}/buy`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) { notify(d.error === "insufficient_usdc" ? "Not enough USDC in your wallet" : `Could not buy (${d.error})`); return; }
      notify(d.paid > 0 ? `Purchased for $${d.paid} ✓` : "Added to your products ✓");
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      load();
    } finally { setBuying(false); }
  };

  const submitReview = async () => {
    if (!rating) { notify("Pick a star rating first"); return; }
    const res = await fetch(`/api/gridx/${id}/reviews`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, text: reviewText || undefined }),
    });
    if (!res.ok) { notify("Could not post the review"); return; }
    setRating(0); setReviewText(""); notify("Review posted ✓");
    load();
  };

  const savePrice = async () => {
    const res = await fetch(`/api/gridx/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_usdc: Number(priceDraft) || 0 }),
    });
    if (!res.ok) { notify("Could not set the price"); return; }
    notify("Price updated ✓"); load();
  };

  const backBar = (
    <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/gridx" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to GridX</Link></div>
  );

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
      </div>
    );
  }

  const { product: p, grid, build, market, launch, reviews, owner, me } = view;
  const a = p.artifact_ref;
  const price = p.price_usdc ?? 0;
  const liveUrl = build?.deployment ? `/d/${build.deployment.slug}` : a?.preview_url;
  const revisions = [...(build?.revisions ?? [])].reverse();

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      {backBar}

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — identity · buy state · builder */}
        <OrbPanel side="left" label="Product" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-panel p-4">
            <div className="flex items-center gap-3">
              <MatrixAvatar seed={p.product_id} size={44} shape="square" />
              <div className="min-w-0"><div className="truncate text-sm font-bold text-neon">{p.name}</div><div className="text-[10px] text-ink-dim">{p.category} · {a?.kind ?? "app"}</div></div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <Mark plain accent="cyan"><IconBolt className="h-2.5 w-2.5" />Echo-built</Mark>
              {p.review_count ? <span className="flex items-center gap-1"><Stars value={p.rating ?? 0} /><span className="text-ink-dim">{p.rating} ({p.review_count})</span></span> : <span className="text-ink-faint">no reviews yet</span>}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              {me.owned ? (
                <div>
                  <div className="ng-label mb-1.5 !text-ink-dim">Your product · set the price</div>
                  <div className="flex gap-2">
                    <input value={priceDraft} onChange={(e) => setPriceDraft(e.target.value.replace(/[^0-9.]/g, ""))} className="ng-input flex-1" placeholder={price ? String(price) : "0 = free"} />
                    <button onClick={savePrice} className="ng-btn ng-btn--sm">Set</button>
                  </div>
                  <p className="mt-1 text-[10px] text-ink-faint">Current: {price > 0 ? `$${price}` : "free"} · buyers pay you directly (2.5% protocol fee)</p>
                </div>
              ) : me.purchased ? (
                <div className="flex items-center gap-2 text-[12px] text-neon"><IconCheck className="h-4 w-4" />You own this{price > 0 ? ` · paid $${price}` : ""}</div>
              ) : (
                <button onClick={buy} disabled={buying} className="ng-btn ng-btn-primary ng-btn--block">
                  <IconCoins className="h-3.5 w-3.5" /> {buying ? "Processing…" : price > 0 ? `Buy · $${price}` : "Get it free"}
                </button>
              )}
            </div>
          </div>

          {owner && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 !text-ink-dim">Builder</div>
              <Link href={`/talent/${owner.id}`} className="flex items-center gap-2.5">
                <MatrixAvatar seed={owner.username} size={34} shape="square" />
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink transition hover:text-neon">{owner.username}</div>
                  <div className="text-[10px] text-ink-dim">{owner.reputation} verified reputation</div>
                </div>
              </Link>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-4 w-4" /></span>Actions</div>
            {grid && <Link href={`/grid/${grid.slug}`} className="ng-btn ng-btn-primary ng-btn--block"><IconNetwork className="h-3.5 w-3.5" /> Open Project Grid</Link>}
            {market ? (
              <Link href={`/market/${market.market_id}`} className="ng-btn ng-btn-cyan ng-btn--block mt-2"><IconBolt className="h-3.5 w-3.5" /> Trading on {market.stage} →</Link>
            ) : grid && launch ? (
              <Link href={`/grid/${grid.slug}`} className="ng-btn ng-btn-cyan ng-btn--block mt-2"><IconRocket className="h-3.5 w-3.5" /> Tokenize on Trade</Link>
            ) : null}
            {build?.proposal_id && <Link href="/genesis/board" className="ng-btn ng-btn--block mt-2"><IconCoins className="h-3.5 w-3.5" /> View on Fund</Link>}
          </div>
        </OrbPanel>

        {/* CENTER — hero · THE LIVE APP · reviews · provenance · versions */}
        <main className="@container order-1 space-y-6 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <MatrixAvatar seed={p.product_id} size={56} shape="square" className="shrink-0" />
                <div>
                  <div className="ng-title text-3xl font-bold text-neon text-glow"><Decrypt text={p.name} /></div>
                  <p className="text-sm text-ink-dim">{p.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                    <Mark accent="cyan"><IconBolt className="h-3 w-3" />Echo-built</Mark>
                    <Mark accent="neon">Proof sealed</Mark>
                    {market && <Mark accent="amber">{market.stage.toUpperCase()} market</Mark>}
                    {p.review_count ? <span className="flex items-center gap-1"><Stars value={p.rating ?? 0} /><span className="text-ink-dim">{p.rating} · {p.review_count} verified review{p.review_count === 1 ? "" : "s"}</span></span> : null}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="ng-stat__v !text-2xl">{price > 0 ? <><span className="text-cyan">$</span>{price}</> : <span className="text-neon">FREE</span>}</div>
                {!me.owned && !me.purchased && <button onClick={buy} disabled={buying} className="ng-btn ng-btn-primary ng-btn--sm mt-1.5">{buying ? "…" : price > 0 ? "Buy" : "Get"}</button>}
                {me.purchased && <div className="mt-1.5 text-[11px] text-neon"><IconCheck className="mr-1 inline h-3 w-3" />owned</div>}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-1 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>{([["Revenue", `$${(p.onchain_revenue ?? 0).toLocaleString()}`], ["Purchases", String(p.purchases ?? 0)], ["Active users 30d", String(p.active_users ?? 0)], ["Opens 30d", String(p.opens_30d ?? 0)]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="ng-row !py-1.5"><span className="ng-row__k">{k}</span><span className="ng-row__v !text-neon">{v}</span></div>
            ))}</div>
          </Bracket>

          {/* THE LIVE APP — try before you buy */}
          {liveUrl ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="ng-label flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconBolt className="h-4 w-4" />Live app</div>
                <a href={liveUrl} target="_blank" rel="noreferrer" className="ng-btn ng-btn--sm" onClick={() => fetch(`/api/gridx/${id}/open`, { method: "POST" }).catch(() => {})}>Open full screen →</a>
              </div>
              <div className="ng-card overflow-hidden p-0">
                <iframe src={liveUrl} sandbox="allow-scripts allow-forms allow-modals" title={`${p.name} — live`} className="h-[440px] w-full border-0 bg-black/40" />
              </div>
              <p className="mt-1.5 text-[10px] text-ink-faint">Running the real build, sandboxed. {build?.deployment ? `Live deployment v${build.deployment.version}.` : "Echo's generated demo."}</p>
            </section>
          ) : (
            <div className="ng-card p-5 text-center text-[11px] text-ink-dim">This product predates live previews — no embedded demo available.</div>
          )}

          {/* VERIFIED REVIEWS */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconCheck className="h-4 w-4" />Verified reviews {p.review_count ? <Mark plain className="!text-[11px]">{p.rating} · {p.review_count}</Mark> : null}</div>
            {me.can_review && (
              <div className="ng-card mb-3 p-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-dim">Your verdict:</span>
                  <span className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => (
                    <button key={i} onClick={() => setRating(i)} className={i <= rating ? "text-amber-300" : "text-ink-faint hover:text-amber-200"}><Star filled={i <= rating} /></button>
                  ))}</span>
                  <span className="text-[10px] text-ink-faint">{me.purchased ? "verified buyer" : "verified user"}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={reviewText} onChange={(e) => setReviewText(e.target.value)} maxLength={500} className="ng-input flex-1" placeholder="What worked, what didn't… (optional)" />
                  <button onClick={submitReview} className="ng-btn ng-btn-primary ng-btn--sm">Post</button>
                </div>
              </div>
            )}
            {!me.can_review && me.review_block && me.review_block !== "not_found" && (
              <p className="mb-3 text-[11px] text-ink-faint">{REVIEW_BLOCK_COPY[me.review_block] ?? ""}</p>
            )}
            {reviews.length ? (
              <div className="space-y-2">
                {reviews.map((r) => (
                  <div key={r.review_id} className="ng-card p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <MatrixAvatar seed={r.username} size={26} shape="square" />
                        <Link href={`/talent/${r.user_id}`} className="text-[12px] text-ink transition hover:text-neon">{r.username}</Link>
                        <Mark plain accent="neon" className="!text-[9px]">verified</Mark>
                      </div>
                      <div className="flex items-center gap-2"><Stars value={r.rating} /><span className="text-[10px] text-ink-faint">{new Date(r.created_at).toLocaleDateString()}</span></div>
                    </div>
                    {r.text && <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{r.text}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ng-card p-5 text-center text-[11px] text-ink-dim">No reviews yet — {price > 0 ? "the first verified buyer writes history." : "open the app, then rate it."}</div>
            )}
          </section>

          {/* PROOF OF BUILD + PROVENANCE */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconShield className="h-4 w-4" />Proof of Build &amp; Provenance</div>
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              <div className="ng-card p-3.5">
                <div className="ng-label mb-2 !text-ink-dim">Artifact</div>
                <div className="divide-y divide-line text-[11px]">
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Attestation</span><span className="ng-row__v max-w-[60%] truncate"><Mark plain>{a?.proof_of_build}</Mark></span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Kind</span><span className="ng-row__v">{a?.kind}</span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Built with Echo</span><span className="ng-row__v !text-neon">{a?.built_with_echo ? "Yes — witnessed" : "No"}</span></div>
                  {build && <div className="ng-row !py-1.5"><span className="ng-row__k">Witnessed steps</span><span className="ng-row__v">{build.steps.length}</span></div>}
                  {build?.version && <div className="ng-row !py-1.5"><span className="ng-row__k">Version</span><span className="ng-row__v">v{build.version}</span></div>}
                </div>
              </div>
              <div className="ng-card p-3.5">
                <div className="ng-label mb-2 !text-ink-dim">Provenance</div>
                {owner && <Link href={`/talent/${owner.id}`} className="flex items-center justify-between text-[12px] text-ink transition hover:text-neon">Builder <span className="flex items-center gap-1 text-neon">{owner.username} · {owner.reputation} rep<IconArrowRight className="h-3 w-3" /></span></Link>}
                {grid && <Link href={`/grid/${grid.slug}`} className="mt-2 flex items-center justify-between text-[12px] text-ink transition hover:text-neon">Home Grid <span className="flex items-center gap-1 text-neon">{grid.name}<IconArrowRight className="h-3 w-3" /></span></Link>}
                {build?.proposal_id ? <Link href="/genesis/board" className="mt-2 flex items-center gap-1 text-[11px] text-neon transition hover:text-glow"><IconCoins className="h-3 w-3" />Raising on Fund</Link> : <div className="mt-2 text-[11px] text-ink-faint">Not raising</div>}
                {market ? <Link href={`/market/${market.market_id}`} className="mt-2 flex items-center gap-1 text-[11px] text-cyan"><IconBolt className="h-3 w-3" />Tokenized — trading on {market.stage}</Link> : <div className="mt-1 text-[11px] text-ink-faint">Not tokenized yet</div>}
              </div>
            </div>
          </section>

          {/* VERSION HISTORY — Echo's iterate loop as the changelog */}
          {revisions.length > 0 && (
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconLayers className="h-4 w-4" />Version history</div>
              <div className="ng-card p-3.5">
                <div className="divide-y divide-line">
                  {revisions.map((r) => (
                    <div key={r.version} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-ink"><Mark plain className="mr-2 !text-[10px]">v{r.version}</Mark>{r.instruction}</span>
                        <span className="shrink-0 text-[10px] text-ink-faint">{r.files_changed} files · {new Date(r.at).toLocaleDateString()}</span>
                      </div>
                      {r.notes && <p className="mt-1 pl-9 text-[10.5px] text-ink-dim">{r.notes}</p>}
                    </div>
                  ))}
                  <div className="py-2.5 text-[11px] text-ink-dim"><Mark plain className="mr-2 !text-[10px]">v1</Mark>Original Echo build — {build?.steps.length ?? 0} witnessed steps</div>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* RIGHT — real metrics + home grid + trust */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 !text-ink-dim">Real metrics</div>
            <div className="divide-y divide-line text-[12px]">
              {([["Revenue (settled)", `$${(p.onchain_revenue ?? 0).toLocaleString()}`], ["Purchases", String(p.purchases ?? 0)], ["Active users 30d", (p.active_users ?? 0).toLocaleString()], ["Opens 30d", String(p.opens_30d ?? 0)], ["Rating", p.review_count ? `${p.rating} (${p.review_count})` : "—"]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="py-2.5 first:pt-0 last:pb-0"><div className="ng-stat__k">{k}</div><div className="text-lg font-bold text-neon text-glow tnum">{v}</div></div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-ink-faint">Derived from settled receipts + real opens — not self-reported.</p>
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
            <p className="mt-1 text-[10px] text-ink-dim">Witnessed by Echo end-to-end; attestation {a?.proof_of_build}. Reviews require a verified purchase or real usage.</p>
          </div>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
    </div>
  );
}
