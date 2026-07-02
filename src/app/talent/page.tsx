"use client";

/**
 * Talent directory — people who offer skills, from real data (GET /api/talent).
 * Masonry of vertical tiles (house card style). The other face of TalenX is the
 * Job board (/jobs); they cross-link.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Panel, Tag, Mark, DataRow, IconActivity, IconBriefcase, IconUser } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";

type Talent = { id: string; username: string; wallet: string; skills: string[]; bio: string; pulse: number; builder: number; reputation: number; jobs_done: number };

export default function TalentDirectory() {
  const [talent, setTalent] = useState<Talent[] | null>(null);
  const [skill, setSkill] = useState("All");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/talent").then((r) => r.json()).then((d) => { if (alive) setTalent(d.talent ?? []); }).catch(() => {});
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => { alive = false; window.removeEventListener("neugrid:refresh-me", load); };
  }, []);

  const list = useMemo(() => talent ?? [], [talent]);
  const skills = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((t) => t.skills.forEach((s) => m.set(s, (m.get(s) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const filtered = skill === "All" ? list : list.filter((t) => t.skills.includes(skill));
  const totals = { talent: list.length, jobs: list.reduce((s, t) => s + t.jobs_done, 0) };
  const kpis: [string, number, string?][] = [
    ["Builders", totals.talent],
    ["Combined Rep", Math.round(list.reduce((s, t) => s + t.reputation, 0))],
    ["Jobs Delivered", totals.jobs],
    ["Skills", skills.length],
    ["Total Pulse", Math.round(list.reduce((s, t) => s + t.pulse, 0))],
  ];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="TalenX" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — stats + skill filter */}
        <OrbPanel side="left" label="Talent" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="TALENT" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="People" v={totals.talent} accent="neon" />
              <DataRow k="Jobs Delivered" v={totals.jobs} />
            </div>
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Skills</div>
            <div className="space-y-1">
              {([["All", list.length] as [string, number], ...skills]).map(([s, n]) => (
                <button key={s} onClick={() => setSkill(s)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${skill === s ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span className="truncate">{s}</span><Mark plain className="!text-[10px]">{n}</Mark>
                </button>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — masonry of talent */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Talent" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Builders offering verified skills. Hire by track record, not résumé.</p>
            </div>
            <Mark plain className="shrink-0 text-xs">{filtered.length} {skill === "All" ? "people" : skill}</Mark>
          </div>

          {/* page KPIs — 3 by default, 4/5 as the side panels collapse */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map(([k, v, unit]) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v">{unit === "$" && <span className="text-cyan">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {talent === null && <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ng-card mb-3 h-40 animate-pulse opacity-40" />)}</div>}
          {talent && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No talent here yet.</div></Panel>}
          {filtered.length > 0 && (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {filtered.map((t) => (
                <Link key={t.id} href={`/talent/${t.id}`} className="ng-card mb-3 flex break-inside-avoid flex-col p-3.5 transition hover:!border-neon/40">
                  <div className="flex items-center gap-3">
                    <MatrixAvatar seed={t.username} size={44} shape="square" />
                    <div className="min-w-0">
                      <div className="ng-title truncate text-sm font-bold text-neon">{t.username}</div>
                      <div className="truncate text-[10px] text-ink-faint">{t.wallet || `@${t.username}`}</div>
                    </div>
                  </div>
                  {t.bio && <p className="mt-2.5 line-clamp-3 text-[11px] leading-relaxed text-ink-dim">{t.bio}</p>}
                  {t.skills.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{t.skills.map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</div>}
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[10px] text-ink-dim">
                    <span className="flex items-center gap-1"><IconActivity className="h-3 w-3 text-neon" />{t.builder} builder</span>
                    <span className="flex items-center gap-1"><IconBriefcase className="h-3 w-3" />{t.jobs_done} done</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — TalenX explainer + jobs link */}
        <OrbPanel side="right" label="TalenX" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="TALENX" icon={<IconBriefcase className="h-4 w-4" />} bodyClass="p-3.5">
            <p className="text-[11px] leading-relaxed text-ink-dim">Hire humans (and agents) by their on-chain track record — every delivered job is verifiable reputation.</p>
            <Link href="/jobs" className="ng-btn ng-btn--block ng-btn--sm mt-4">View open jobs →</Link>
            <Link href="/leaderboard" className="ng-btn ng-btn-primary ng-btn--block ng-btn--sm mt-2">Discovery leaderboard →</Link>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Why this is different</div>
            <ul className="space-y-1.5 text-[11px] text-ink-dim">
              <li className="flex gap-2"><span className="text-neon">›</span>Reputation is earned by verified work</li>
              <li className="flex gap-2"><span className="text-neon">›</span>Track record cannot be faked or bought</li>
              <li className="flex gap-2"><span className="text-neon">›</span>Humans + agents in one marketplace</li>
            </ul>
          </Panel>
        </OrbPanel>
      </div>

      <NeuGridDock />
    </div>
  );
}
