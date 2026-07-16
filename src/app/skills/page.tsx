"use client";

/**
 * Skills Marketplace — the agent economy's second earning surface.
 * Browse learned skills other builders published; install one onto your agent for
 * GRID. Trust is provenance: mastery earned, install count, author reputation.
 * Publish + price your own agents' work-earned skills right here.
 * 3-panel signature layout · rail charts: PolarArea · Histogram | Lollipop · Waterfall.
 */

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconLayers, IconBolt, IconBot, IconActivity, kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { PanelChart } from "@/components/app/terminal";
import { PolarArea, Histogram, Lollipop, Waterfall, Ring } from "@/components/app/charts";
import Meter from "@/components/app/Meter";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";

type Listing = {
  published_id: string; skill_id: string; title: string; domain: string; summary?: string;
  source_uses: number; price_grid: number; installs: number; created_at: string; recipe_chars: number;
  author_id: string; author_name: string; author_reputation: number; author_agent_name: string; mine: boolean;
};
type Publishable = { agent_id: string; agent_name: string; skill_id: string; title: string; domain: string; uses: number };
type Data = {
  listings: Listing[];
  my_agents: { agent_id: string; name: string }[];
  my_publishable: Publishable[];
  stats: { published: number; installs: number; earned_grid: number };
  market: { listings: number; installs: number; authors: number; volume_grid: number; author_take_grid: number; fees_grid: number };
};
type SortKey = "newest" | "installs" | "price" | "mastery";

/** Compact number for the tight step-chain nodes (e.g. 12.3k, 1.2M). */
const compactNum = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Inline reprice + delist for the viewer's own listing (key-remounted on price change). */
function OwnControls({ p, busy, onPrice, onDelist }: { p: Listing; busy: boolean; onPrice: (p: Listing, v: number) => void; onDelist: (p: Listing) => void }) {
  const [v, setV] = useState(String(p.price_grid));
  const parsed = Number(v);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Price in GRID" className="ng-input w-16 !py-1 text-center text-[11px]" />
      <span className="text-[9px] text-ink-faint">GRID</span>
      <button disabled={busy || !valid || parsed === p.price_grid} onClick={() => onPrice(p, parsed)} className="ng-btn ng-btn--sm disabled:opacity-40">set price</button>
      <button disabled={busy} onClick={() => onDelist(p)} className="ng-btn ng-btn-danger ng-btn--sm ml-auto disabled:opacity-40">delist</button>
    </div>
  );
}

export default function SkillsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [target, setTarget] = useState<string>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // publish form
  const [pubSel, setPubSel] = useState("");
  const [pubPrice, setPubPrice] = useState("");
  const [pubSummary, setPubSummary] = useState("");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };

  const reload = useCallback(() => {
    return fetch("/api/skills").then((r) => r.json()).then((d: Data) => {
      setData(d);
      setTarget((t) => t || d.my_agents[0]?.agent_id || "");
    }).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function install(p: Listing) {
    if (busy) return;
    if (!target) { notify("Create an agent first — it's the install target"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/skills/${p.published_id}/install`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target_agent_id: target }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = d.error as string;
        notify(e === "insufficient_grid" ? "Not enough GRID" : e === "already_installed" ? "That agent already has this skill" : e === "own_skill" ? "You published this one" : "Install failed");
        return;
      }
      const tName = data?.my_agents.find((a) => a.agent_id === target)?.name ?? "your agent";
      notify(p.mine ? `Copied to ${tName} — skill in its library` : p.price_grid > 0 ? `Installed on ${tName} · ${p.price_grid} GRID → ${p.author_name}` : `Installed on ${tName} (free)`);
      reload();
    } finally { setBusy(false); }
  }

  async function publishSkill() {
    if (busy || !pubSel) return;
    const [agent_id, skill_id] = pubSel.split("::");
    setBusy(true);
    try {
      const r = await fetch("/api/skills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent_id, skill_id, price_grid: Math.max(0, Number(pubPrice) || 0), summary: pubSummary.trim() || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = d.error as string;
        notify(e === "already_listed" ? "Already listed" : e === "not_original" ? "Bought skills can't be re-sold" : "Publish failed");
        return;
      }
      notify("Published — your skill is on the market");
      setPubSel(""); setPubPrice(""); setPubSummary("");
      reload();
    } finally { setBusy(false); }
  }

  async function setPrice(p: Listing, v: number) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/skills/${p.published_id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ price_grid: v }) });
      notify(r.ok ? (v > 0 ? `Repriced · ${v} GRID` : "Repriced · free") : "Reprice failed");
      if (r.ok) reload();
    } finally { setBusy(false); }
  }

  async function delist(p: Listing) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/skills/${p.published_id}`, { method: "DELETE" });
      notify(r.ok ? "Delisted — installed copies keep working" : "Delist failed");
      if (r.ok) reload();
    } finally { setBusy(false); }
  }

  const listings = useMemo(() => data?.listings ?? [], [data]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? listings.filter((p) => p.title.toLowerCase().includes(s) || p.domain.toLowerCase().includes(s) || p.author_name.toLowerCase().includes(s)) : [...listings];
    if (sort === "installs") base.sort((a, b) => b.installs - a.installs);
    else if (sort === "price") base.sort((a, b) => a.price_grid - b.price_grid);
    else if (sort === "mastery") base.sort((a, b) => b.source_uses - a.source_uses);
    return base; // "newest" keeps store order (newest first)
  }, [listings, q, sort]);

  const kpis = [
    { Icon: IconLayers, title: "Skills listed", v: data?.market.listings ?? 0, sub: "published know-how" },
    { Icon: IconBolt, title: "Installs", v: data?.market.installs ?? 0, sub: "reused across agents" },
    { Icon: IconBot, title: "Authors", v: data?.market.authors ?? 0, sub: "earning builders" },
    { Icon: IconActivity, title: "Volume", v: data?.market.volume_grid ?? 0, sub: "GRID through the market" },
    { Icon: IconBolt, title: "You earned", v: data?.stats.earned_grid ?? 0, sub: "GRID from your skills" },
  ];

  // card visual scale — the market's most-proven listing (real payload values only)
  const maxUses = useMemo(() => Math.max(1, ...listings.map((l) => l.source_uses)), [listings]);
  // card record scale — the highest author reputation on the market
  const maxRep = useMemo(() => Math.max(1, ...listings.map((l) => l.author_reputation)), [listings]);

  // ---- rail-chart data (all REAL; each guarded non-empty) ----
  // LEFT 1 · PolarArea — what the market knows (listings per domain)
  const domainMix = useMemo(() => {
    const by = new Map<string, number>();
    for (const p of listings) by.set(p.domain, (by.get(p.domain) ?? 0) + 1);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { labels: top.map(([d]) => (d.length > 8 ? d.slice(0, 7) + "…" : d)), data: top.map(([, n]) => n) };
  }, [listings]);
  // LEFT 2 · Histogram — price spread across every listing (0 = free)
  const priceSpread = useMemo(() => listings.map((p) => p.price_grid), [listings]);
  const priceRead = useMemo(() => {
    if (!priceSpread.length) return "—";
    const min = Math.min(...priceSpread), max = Math.max(...priceSpread);
    if (max === 0) return "all free";
    return `${min === 0 ? "free" : min}–${max} GRID`;
  }, [priceSpread]);
  // RIGHT 1 · Lollipop — most installed vs the market average
  const topInstalled = useMemo(() =>
    [...listings].filter((p) => p.installs > 0).sort((a, b) => b.installs - a.installs).slice(0, 6)
      .map((p) => ({ label: p.title.length > 18 ? p.title.slice(0, 17) + "…" : p.title, value: p.installs })), [listings]);
  const avgInstalls = useMemo(() => {
    const m = data?.market;
    return m && m.listings > 0 ? m.installs / m.listings : 0;
  }, [data]);
  // RIGHT 2 · Waterfall — where install GRID goes (gross → authors → treasury fee)
  const gridFlow = useMemo(() => {
    const m = data?.market;
    if (!m || m.volume_grid <= 0) return null;
    return [
      { value: m.volume_grid, kind: "total" as const },
      { value: -m.author_take_grid },
      { value: m.fees_grid, kind: "total" as const },
    ];
  }, [data]);
  // "How it works" → the REAL skill-market pipeline (listed → installs → GRID volume → authors)
  const skillPipeline = useMemo<{ v: string; label: string; unit?: string }[]>(() => {
    const m = data?.market;
    return [
      { v: (m?.listings ?? 0).toLocaleString(), label: "Listed" },
      { v: (m?.installs ?? 0).toLocaleString(), label: "Installs" },
      { v: compactNum(m?.volume_grid ?? 0), label: "Volume", unit: "GRID" },
      { v: compactNum(m?.author_take_grid ?? 0), label: "To authors", unit: "GRID" },
    ];
  }, [data]);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 pb-9 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Market" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="SKILLS" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills, domains, authors…" className="ng-input w-full !py-2 text-xs" />
            <div className="mt-2 flex items-center gap-2">
              <span className="ng-label !mb-0 !text-ink-dim">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="ng-input flex-1 !py-1.5 text-[11px]">
                <option value="newest">Newest</option>
                <option value="installs">Most installed</option>
                <option value="price">Price · low first</option>
                <option value="mastery">Mastery</option>
              </select>
            </div>

            {/* PUBLISH — sell a skill your agent earned by real work */}
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Publish a skill</div>
            {data && data.my_publishable.length > 0 ? (
              <div className="space-y-2">
                <select value={pubSel} onChange={(e) => setPubSel(e.target.value)} className="ng-input w-full !py-2 text-xs">
                  <option value="">Pick a learned skill…</option>
                  {data.my_publishable.map((s) => (
                    <option key={s.skill_id} value={`${s.agent_id}::${s.skill_id}`}>{s.agent_name} · {s.title} (×{s.uses})</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input value={pubPrice} onChange={(e) => setPubPrice(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="0" aria-label="Price in GRID" className="ng-input w-20 !py-1.5 text-center text-[11px]" />
                  <span className="text-[10px] text-ink-faint">GRID per install · 0 = free</span>
                </div>
                <input value={pubSummary} onChange={(e) => setPubSummary(e.target.value)} placeholder="One-line pitch (optional)" maxLength={300} className="ng-input w-full !py-1.5 text-[11px]" />
                <button disabled={busy || !pubSel} onClick={publishSkill} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block justify-center disabled:opacity-40"><IconBolt className="h-3 w-3" /> Publish to market</button>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-ink-dim">{data && data.my_agents.length === 0 ? <><Link href="/agents" className="text-neon">Create an agent</Link> — it learns publishable skills by delivering real work.</> : "Nothing to publish yet — your agents learn skills by delivering Jobs; every unlisted, work-earned skill shows up here."}</p>
            )}

            <PanelChart title="Domain mix" read={`${domainMix.data.length} domains`}>
              {domainMix.data.length > 0 ? (
                <div className="flex justify-center py-1"><PolarArea data={domainMix.data} labels={domainMix.labels} size={132} /></div>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">no listings yet</p>}
            </PanelChart>
            <PanelChart title="Price spread" read={priceRead}>
              {priceSpread.length > 1 ? <Histogram data={priceSpread} bins={6} h={52} /> : <p className="py-3 text-center text-[10px] text-ink-faint">not enough listings</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">Your publisher stats</div>
            <div className="divide-y divide-line">
              <DataRow k="Skills published" v={<span className="inline-flex items-center gap-2"><Meter value={data?.stats.published ?? 0} max={data?.market.listings ?? 0} w={40} /><span>{data?.stats.published ?? 0}</span></span>} />
              <DataRow k="Total installs" v={<span className="inline-flex items-center gap-2"><Meter value={data?.stats.installs ?? 0} max={data?.market.installs ?? 0} w={40} color="#48f5ff" /><span>{data?.stats.installs ?? 0}</span></span>} accent="cyan" />
              <DataRow k="GRID earned" v={<span className="inline-flex items-center gap-2"><Meter value={data?.stats.earned_grid ?? 0} max={data?.market.volume_grid ?? 0} w={40} /><span>{data?.stats.earned_grid ?? 0}</span></span>} accent="neon" />
            </div>
            <p className="mt-1.5 text-[9px] leading-relaxed text-ink-faint">bars = your share of the whole market (listings · installs · GRID volume)</p>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="ng-panel p-5">
            <div className="ng-title text-2xl font-bold text-neon"><Decrypt text="Skills Market" /></div>
            <p className="text-[12px] text-ink-dim">Reusable know-how, earned by real work. Install a proven skill onto your agent — provenance, not promises.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map((s, i) => (
              <div key={s.title} className="ng-card p-4 text-center">
                <div className="ng-tag mb-2 justify-center" style={{ color: kpiColor(i) }}><s.Icon className="h-3 w-3" />{s.title}</div>
                <div className="ng-stat__v !text-2xl" style={{ color: kpiColor(i) }}><CountUp key={s.v} value={s.v} /></div>
                <div className="mt-1 text-[11px] text-ink-dim">{s.sub}</div>
              </div>
            ))}
          </div>

          {data && filtered.length === 0 && (
            <Panel><div className="p-8 text-center text-sm text-ink-dim">{listings.length === 0 ? "No skills published yet — be the first. Publish one from the left rail." : "No skills match your search."}</div></Panel>
          )}
          {filtered.length > 0 && (
            <div className="columns-1 gap-3 sm:columns-2 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {filtered.map((p) => (
                <div key={p.published_id} className="ng-card mb-3 flex break-inside-avoid flex-col p-4">
                  {/* identity — title + ONE price chip */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink" title={p.title}>{p.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5"><Tag className="!text-[9px]">{p.domain}</Tag>{p.mine && <Mark plain accent="cyan" className="!text-[9px]">yours</Mark>}</div>
                    </div>
                    <Mark plain accent={p.price_grid > 0 ? "neon" : "cyan"} className="!text-[11px] shrink-0">{p.price_grid > 0 ? `${p.price_grid} GRID` : "Free"}</Mark>
                  </div>
                  {/* hero — mastery ring + installs headline */}
                  <div className="mt-3 flex items-center gap-4">
                    <Ring percent={(p.source_uses / maxUses) * 100} value={`×${p.source_uses}`} size={62} stroke={5} />
                    <div className="min-w-0">
                      <div className="ng-stat__v !text-2xl text-neon tnum">{p.installs}<span className="ml-1 text-[11px] font-normal text-ink-dim">installs</span></div>
                      <div className="mt-0.5 text-[10px] text-ink-dim">mastery ×{p.source_uses} · market top ×{maxUses}</div>
                    </div>
                  </div>
                  {p.summary && <p className="mt-2 truncate text-[11px] text-ink-dim" title={p.summary}>{p.summary}</p>}
                  {/* the record */}
                  <div className="mt-3 divide-y divide-line border-t border-line text-[11px]">
                    <div className="ng-row !py-1.5"><span className="ng-row__k">By</span><span className="ng-row__v flex min-w-0 items-center gap-1.5 font-normal"><MatrixAvatar seed={p.author_id} size={14} shape="square" /><Link href={`/talent/${p.author_id}`} className="truncate text-neon hover:underline">{p.author_name}</Link></span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Author rep</span><span className="ng-row__v inline-flex items-center gap-2 font-normal text-ink-dim tnum" title="vs the highest-rep author on the market"><Meter value={p.author_reputation} max={maxRep} w={36} color="#48f5ff" /><span>{p.author_reputation.toLocaleString()}</span></span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Recipe</span><span className="ng-row__v font-normal text-ink-faint">{p.recipe_chars.toLocaleString()} chars · on install</span></div>
                  </div>
                  {/* footer — pick the receiving agent RIGHT HERE, then act */}
                  <div className="mt-3 border-t border-line pt-2.5">
                    {data && data.my_agents.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <select value={target} onChange={(e) => setTarget(e.target.value)} title="Which of your agents receives this skill" className="ng-input w-[45%] shrink-0 !py-1.5 text-[10px]">
                          {data.my_agents.map((a) => <option key={a.agent_id} value={a.agent_id}>→ {a.name}</option>)}
                        </select>
                        {p.mine ? (
                          <button disabled={busy || !target} onClick={() => install(p)} title="Free — copies the recipe into the selected agent's library" className="ng-btn ng-btn--sm flex-1 justify-center disabled:opacity-40"><IconBolt className="h-3 w-3" /> Copy (free)</button>
                        ) : (
                          <button disabled={busy || !target} onClick={() => install(p)} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-40"><IconBolt className="h-3 w-3" /> Install{p.price_grid > 0 ? ` · ${p.price_grid} GRID` : " (free)"}</button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-dim"><Link href="/agents" className="text-neon">Create an agent</Link> first — it&#39;s the install target.</p>
                    )}
                    {p.mine && <div className="mt-2"><OwnControls key={`${p.published_id}:${p.price_grid}`} p={p} busy={busy} onPrice={setPrice} onDelist={delist} /></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="SIGNAL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Most installed" read={`avg ${avgInstalls.toFixed(1)}/listing`}>
              {topInstalled.length > 0 ? (
                <div className="py-1"><Lollipop data={topInstalled} target={avgInstalls} /></div>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">no installs yet</p>}
            </PanelChart>
            <PanelChart title="GRID flow" read={data?.market.volume_grid ? `${data.market.volume_grid} GRID` : "—"}>
              {gridFlow ? (
                <>
                  <div className="py-1"><Waterfall steps={gridFlow} h={80} /></div>
                  <div className="mt-1 flex justify-around text-[9px] text-ink-faint"><span className="text-neon">volume</span><span style={{ color: "#ff4d5e" }}>→ authors</span><span className="text-neon">treasury fee</span></div>
                </>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">no paid installs yet</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-5 !text-ink-dim">How it works</div>
            <div className="ng-card p-3">
              <div className="flex items-start gap-1">
                {skillPipeline.map((s, i) => (
                  <Fragment key={s.label}>
                    <div className="flex-1 text-center">
                      <div className="mx-auto grid h-7 w-7 place-items-center rounded-full border border-neon/40 text-[11px] text-neon">{i + 1}</div>
                      <div className="mt-1.5 ng-stat__v !text-lg leading-tight text-neon tnum">{s.v}{s.unit && <span className="ml-0.5 text-[9px] font-normal text-ink-dim">{s.unit}</span>}</div>
                      <div className="text-[8.5px] uppercase tracking-wide text-ink-faint">{s.label}</div>
                    </div>
                    {i < skillPipeline.length - 1 && <div className="mt-3.5 h-px w-3 shrink-0 bg-neon/25" />}
                  </Fragment>
                ))}
              </div>
              <p className="mt-2.5 text-[9px] leading-relaxed text-ink-faint">Skills get listed, installed across agents, and GRID flows to their authors — every count live from the market.</p>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Trust is provenance: a skill&apos;s mastery, install count, and its author&apos;s reputation are all real and on the record — proven by work, not a badge. Bought skills can&apos;t be re-sold, and the recipe only unlocks on install.</p>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
