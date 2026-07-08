"use client";

/**
 * Skills Marketplace — the agent economy's second earning surface.
 * Browse learned skills other builders published; install one onto your agent for
 * GRID. Trust is provenance: mastery earned, install count, author reputation.
 * 3-panel signature layout.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconLayers, IconBolt, IconBot, IconActivity, kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { PanelChart } from "@/components/app/terminal";
import { LabeledBars } from "@/components/app/charts";

type Listing = {
  published_id: string; skill_id: string; title: string; domain: string; summary?: string;
  source_uses: number; price_grid: number; installs: number;
  author_id: string; author_name: string; author_reputation: number; author_agent_name: string; mine: boolean;
};
type Data = {
  listings: Listing[];
  my_agents: { agent_id: string; name: string }[];
  stats: { published: number; installs: number; earned_grid: number };
  market: { listings: number; installs: number; authors: number; volume_grid: number };
};

export default function SkillsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [target, setTarget] = useState<string>("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
      notify(p.price_grid > 0 ? `Installed · ${p.price_grid} GRID → ${p.author_name}` : "Installed (free)");
      reload();
    } finally { setBusy(false); }
  }

  const listings = useMemo(() => data?.listings ?? [], [data]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return listings;
    return listings.filter((p) => p.title.toLowerCase().includes(s) || p.domain.toLowerCase().includes(s) || p.author_name.toLowerCase().includes(s));
  }, [listings, q]);

  const kpis = [
    { Icon: IconLayers, title: "Skills listed", v: data?.market.listings ?? 0, sub: "published know-how" },
    { Icon: IconBolt, title: "Installs", v: data?.market.installs ?? 0, sub: "reused across agents" },
    { Icon: IconBot, title: "Authors", v: data?.market.authors ?? 0, sub: "earning builders" },
    { Icon: IconActivity, title: "Volume", v: data?.market.volume_grid ?? 0, sub: "GRID through the market" },
    { Icon: IconBolt, title: "You earned", v: data?.stats.earned_grid ?? 0, sub: "GRID from your skills" },
  ];
  const topInstalled = useMemo(() => [...listings].sort((a, b) => b.installs - a.installs).filter((p) => p.installs > 0).slice(0, 6).map((p) => ({ label: p.title, value: p.installs })), [listings]);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 pb-9 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Market" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="SKILLS" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills, domains, authors…" className="ng-input w-full !py-2 text-xs" />
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Install onto</div>
            {data && data.my_agents.length > 0 ? (
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="ng-input w-full !py-2 text-xs">
                {data.my_agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.name}</option>)}
              </select>
            ) : <p className="text-[11px] text-ink-dim"><Link href="/agents" className="text-neon">Create an agent</Link> to install skills onto.</p>}

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Your publisher stats</div>
            <div className="divide-y divide-line">
              <DataRow k="Skills published" v={data?.stats.published ?? 0} />
              <DataRow k="Total installs" v={data?.stats.installs ?? 0} accent="cyan" />
              <DataRow k="GRID earned" v={data?.stats.earned_grid ?? 0} accent="neon" />
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Publish a skill from any of your agents on its <Link href="/agents" className="text-neon">detail page</Link> → earn GRID each time another builder installs it.</p>
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
            <Panel><div className="p-8 text-center text-sm text-ink-dim">{listings.length === 0 ? "No skills published yet — be the first. Publish one from an agent's detail page." : "No skills match your search."}</div></Panel>
          )}
          {filtered.length > 0 && (
            <div className="columns-1 gap-3 sm:columns-2 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {filtered.map((p) => (
                <div key={p.published_id} className="ng-card mb-3 flex break-inside-avoid flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{p.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5"><Tag className="!text-[9px]">{p.domain}</Tag>{p.mine && <Mark plain accent="cyan" className="!text-[9px]">yours</Mark>}</div>
                    </div>
                    <Mark plain accent={p.price_grid > 0 ? "neon" : "cyan"} className="!text-[11px] shrink-0">{p.price_grid > 0 ? `${p.price_grid} GRID` : "Free"}</Mark>
                  </div>
                  {p.summary && <p className="mt-2 text-[11px] leading-relaxed text-ink-dim line-clamp-2">{p.summary}</p>}
                  <div className="mt-3 divide-y divide-line border-t border-line pt-2 text-[11px]">
                    <div className="ng-row !py-1"><span className="ng-row__k">By</span><Link href={`/talent/${p.author_id}`} className="ng-row__v font-normal text-neon hover:underline">{p.author_name}</Link></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Author rep</span><span className="ng-row__v font-normal text-ink-dim">{p.author_reputation.toLocaleString()}</span></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Mastery (proven)</span><Mark plain className="!text-[11px]">×{p.source_uses}</Mark></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Installs</span><Mark plain accent="cyan" className="!text-[11px]">{p.installs}</Mark></div>
                  </div>
                  <div className="mt-3">
                    {p.mine ? (
                      <span className="text-[10px] text-ink-faint">Your listing — manage it on the agent&apos;s page</span>
                    ) : (
                      <button disabled={busy || !target} onClick={() => install(p)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block justify-center disabled:opacity-40"><IconBolt className="h-3 w-3" /> Install{p.price_grid > 0 ? ` · ${p.price_grid} GRID` : " (free)"}</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="SIGNAL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Most installed" read={`${topInstalled.length}`}>
              {topInstalled.length > 0 ? <LabeledBars data={topInstalled} /> : <p className="py-3 text-center text-[10px] text-ink-faint">no installs yet</p>}
            </PanelChart>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">How it works</div>
            <div className="space-y-1.5 text-[11px] text-ink-dim">
              <div className="flex items-start gap-2"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">1</span>An agent learns a skill by delivering real Jobs (mastery grows with use).</div>
              <div className="flex items-start gap-2"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">2</span>Its owner publishes the skill here, setting a GRID price.</div>
              <div className="flex items-start gap-2"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">3</span>Another builder installs it onto their agent — GRID flows to the author.</div>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Trust is provenance: a skill&apos;s mastery, install count, and its author&apos;s reputation are all real and on the record — proven by work, not a badge.</p>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
