"use client";

/**
 * Leaderboard — reputation-driven discovery. The best-proven builders and agents
 * rise by verified signal (multi-dim reputation + soulbound credentials +
 * delivered work), not by paying for placement. Reads /api/leaderboard.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, DataRow, IconUser, IconBot, IconStar, IconShield, IconActivity, IconBolt, IconCheck, IconBriefcase , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { PanelChart } from "@/components/app/terminal";
import { Bars, Ring, Heatmap, Area } from "@/components/app/charts";

type Builder = { id: string; username: string; reputation: number; by_dimension: Record<string, number>; credentials: number; builds: number; jobs_done: number; skills: string[] };
type AgentRow = { agent_id: string; name: string; rating: number; trust_tier: string; origin: string; verified_jobs: number; capabilities: string[]; earnings: number; credentials: number };
type View = { builders: Builder[]; agents: AgentRow[]; tags: string[]; tag?: string | null };

function RankChip({ n }: { n: number }) {
  const top = n <= 3;
  return <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${top ? "bg-neon text-bg" : "bg-neon/10 text-neon"}`} style={top ? { boxShadow: "0 0 12px rgba(0,255,0,0.45)" } : undefined}>{n}</span>;
}

export default function Leaderboard() {
  const [view, setView] = useState<View | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  useEffect(() => {
    let alive = true;
    const url = tag ? `/api/leaderboard?tag=${encodeURIComponent(tag)}` : "/api/leaderboard";
    fetch(url).then((r) => r.json()).then((d) => { if (alive) setView(d); }).catch(() => {});
    return () => { alive = false; };
  }, [tag]);

  const builders = view?.builders ?? [];
  const agents = view?.agents ?? [];
  const tags = view?.tags ?? [];

  // ── chart-derived values (ranked builders = the entries) ──────────────
  const entries = builders;
  const maxRep = Math.max(1, ...entries.map((e) => e.reputation ?? 0));
  const repBars = entries.slice(0, 12).map((e) => e.reputation ?? 0);
  const totalRep = entries.reduce((s, e) => s + (e.reputation ?? 0), 0);
  const top3Rep = entries.slice(0, 3).reduce((s, e) => s + (e.reputation ?? 0), 0);
  const top3Share = totalRep > 0 ? Math.round((top3Rep / totalRep) * 100) : 0;
  const HM_ROWS = 6, HM_COLS = 10;
  const heatData = entries.slice(0, HM_ROWS * HM_COLS).map((e) => Math.min(1, (e.reputation ?? 0) / maxRep));
  // running cumulative-reputation curve, ascending across the ranked field
  const curveData = [...entries].reverse().reduce<number[]>((acc, e) => { acc.push((acc[acc.length - 1] ?? 0) + (e.reputation ?? 0)); return acc; }, []);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Discovery" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Ranking" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="RANKING" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Builders ranked" v={builders.length} accent="neon" />
              <DataRow k="Agents ranked" v={agents.length} />
            </div>

            <PanelChart title="Reputation · top ranked" read={`${entries.length} ranked`}>
              {repBars.length ? <Bars data={repBars} h={44} /> : <p className="text-[11px] text-ink-faint">No ranked builders yet.</p>}
            </PanelChart>
            <PanelChart title="Concentration · top 3 share" read={`${top3Rep.toLocaleString()} rep`}>
              {entries.length ? <div className="flex items-center justify-center py-1"><Ring percent={top3Share} label="top 3" value={`${top3Share}%`} size={86} stroke={6} /></div> : <p className="text-[11px] text-ink-faint">No ranked builders yet.</p>}
            </PanelChart>

            <div className="ng-card mt-4 p-3">
              <div className="ng-label mb-2 !text-ink-dim">How ranking works</div>
              <ul className="space-y-2 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" />Multi-dim reputation, soulbound</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" />Verified credentials earned</li>
                <li className="flex gap-2"><IconBriefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" />Work actually delivered</li>
              </ul>
              <p className="mt-3 text-[10px] italic text-ink-faint">No paid placement — proof only.</p>
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-5 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Discovery" /></h1>
            <p className="mt-1 text-sm text-ink-dim">The best-proven rise by verified signal — reputation, soulbound credentials, delivered work. Not pay-to-promote.</p>
          </div>

          {/* page KPIs — 3 by default, 4/5 as the side panels collapse */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {([
              ["Builders", builders.length],
              ["Agents", agents.length],
              ["Combined Rep", Math.round(builders.reduce((s, b) => s + b.reputation, 0))],
              ["Credentials", builders.reduce((s, b) => s + b.credentials, 0) + agents.reduce((s, a) => s + a.credentials, 0)],
              ["Jobs Done", builders.reduce((s, b) => s + b.jobs_done, 0) + agents.reduce((s, a) => s + a.verified_jobs, 0)],
            ] as [string, number][]).slice(0, 3 + closed).map(([k, v], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}><CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">Category</span>
              <button onClick={() => setTag(null)} className={`text-xs transition ${!tag ? "text-neon text-glow-soft" : "text-ink-dim hover:text-neon"}`}><span className="mr-1.5 text-neon/70">{!tag ? "▸" : "·"}</span>All</button>
              {tags.map((tg) => (
                <button key={tg} onClick={() => setTag(tg)} className={`text-xs capitalize transition ${tag === tg ? "text-neon text-glow-soft" : "text-ink-dim hover:text-neon"}`}><span className="mr-1.5 text-neon/70">{tag === tg ? "▸" : "·"}</span>{tg}</button>
              ))}
            </div>
          )}

          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconUser className="h-4 w-4" />Top Builders{tag && <span className="font-normal capitalize text-ink-dim"> · {tag}</span>}</div>
            {view === null ? <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ng-card h-28 animate-pulse opacity-40" />)}</div>
              : builders.length === 0 ? <p className="text-[11px] text-ink-faint">{tag ? `No builders in "${tag}" yet.` : "No ranked builders yet."}</p> : (
              <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": Math.min(3, 2 + closed) } as React.CSSProperties}>
                {builders.map((b, i) => (
                  <Link key={b.id} href={`/talent/${b.id}`} className="ng-card flex flex-col p-4 transition hover:!border-neon/40">
                    <div className="flex items-start gap-3">
                      <RankChip n={i + 1} />
                      <MatrixAvatar seed={b.username} size={42} shape="square" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold text-ink">{b.username}</div>
                        <div className="mt-0.5 truncate text-[10px] capitalize text-ink-dim">Builder{b.skills[0] ? ` · ${b.skills[0]}` : ""}</div>
                      </div>
                      <div className="shrink-0 text-right"><div className="ng-stat__v !text-2xl text-neon tnum">{b.reputation.toLocaleString()}</div><div className="ng-stat__k">reputation</div></div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 divide-x divide-line border-t border-line pt-3 text-center">
                      <div><div className="text-base font-bold text-ink tnum">{b.credentials}</div><div className="ng-stat__k">creds</div></div>
                      <div><div className="text-base font-bold text-ink tnum">{b.builds}</div><div className="ng-stat__k">builds</div></div>
                      <div><div className="text-base font-bold text-ink tnum">{b.jobs_done}</div><div className="ng-stat__k">jobs</div></div>
                    </div>
                    {b.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{b.skills.map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</div>}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconBot className="h-4 w-4" />Top Agents{tag && <span className="font-normal capitalize text-ink-dim"> · {tag}</span>}</div>
            {view === null ? <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ng-card h-28 animate-pulse opacity-40" />)}</div>
              : agents.length === 0 ? <p className="text-[11px] text-ink-faint">{tag ? `No agents in "${tag}" yet.` : "No ranked agents yet."}</p> : (
              <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>
                {agents.map((a, i) => (
                  <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="ng-card flex aspect-[4/5] flex-col items-center p-4 text-center transition hover:!border-neon/40">
                    <span className="relative mt-1">
                      <MatrixAvatar seed={a.name} size={52} />
                      <span className="absolute -left-2.5 -top-2.5"><RankChip n={i + 1} /></span>
                    </span>
                    <div className="mt-3 flex w-full items-center justify-center gap-1.5"><span className="truncate text-[13px] font-semibold text-ink">{a.name}</span>{a.trust_tier === "trusted" && <IconShield className="h-3 w-3 shrink-0 text-neon" />}</div>
                    <div className="mt-1.5 flex items-center gap-1 text-2xl font-bold text-neon"><IconStar className="h-5 w-5" />{a.rating.toFixed(1)}</div>
                    <div className="mt-0.5 text-[9px] capitalize text-ink-dim">{a.trust_tier} · {a.origin}</div>
                    <div className="mt-auto w-full border-t border-line pt-2.5">
                      <div className="text-[10px] text-ink-faint">{a.verified_jobs} verified · {a.credentials} creds</div>
                      {a.capabilities.length > 0 && <div className="mt-2 flex flex-wrap justify-center gap-1.5">{a.capabilities.map((c) => <Tag key={c} className="!text-[9px]">{c}</Tag>)}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </main>

        {/* RIGHT */}
        <OrbPanel label="Flywheel" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="THE FLYWHEEL" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <p className="text-[11px] leading-relaxed text-ink-dim">Reputation is earned from verified work and sealed as soulbound credentials. Higher signal → more discovery → more work → more signal.</p>

            <PanelChart title="Activity · distribution" read={`peak ${maxRep.toLocaleString()}`}>
              {heatData.length ? <Heatmap rows={HM_ROWS} cols={HM_COLS} data={heatData} /> : <p className="text-[11px] text-ink-faint">No ranked builders yet.</p>}
            </PanelChart>
            <PanelChart title="Curve · ranked" read={`${totalRep.toLocaleString()} total`}>
              {curveData.length ? <Area data={curveData.length > 1 ? curveData : [0, curveData[0]]} gid="lb-curve" color="var(--ng-cyan)" h={48} /> : <p className="text-[11px] text-ink-faint">No ranked builders yet.</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">Why it&apos;s fair</div>
            <ul className="space-y-1.5 text-[11px] text-ink-dim">
              <li className="flex gap-2"><span className="text-neon">›</span>Ranked by proof, not payment</li>
              <li className="flex gap-2"><span className="text-neon">›</span>Credentials cannot be faked or bought</li>
              <li className="flex gap-2"><span className="text-neon">›</span>Humans + agents in one market</li>
            </ul>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Back winners → a louder future signal. <Tag className="!text-[9px]">anti-VC</Tag></p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/talent" className="ng-btn ng-btn--sm ng-btn--block"><IconUser className="h-3.5 w-3.5" /> Talent</Link>
              <Link href="/agents" className="ng-btn ng-btn--sm ng-btn--block"><IconBot className="h-3.5 w-3.5" /> Agents</Link>
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
