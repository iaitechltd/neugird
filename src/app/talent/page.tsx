"use client";

/**
 * Talent — the talent marketplace (rebuilt 2026-07-03 per founder direction):
 * bigger info-dense portrait cards · self-serve skill listing · verified badges
 * earned by reputation · trending job requests · paid-to-talents KPI · a personal
 * GROWTH rail (what to improve + revenue/engagement trends). All from /api/talent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Panel, Tag, Mark, DataRow, IconActivity, IconBriefcase, IconUser, IconSparkle , kpiColor } from "@/components/app/ui";
import { Area, Radar, Spark, Beeswarm, Donut, RadialBars, Lollipop } from "@/components/app/charts";
import { PanelChart, TMeter } from "@/components/app/terminal";
import Meter from "@/components/app/Meter";
import { CountUp, Decrypt } from "@/components/app/typefx";

type Talent = {
  id: string; username: string; wallet: string; skills: string[]; bio: string;
  pulse: number; builder: number; reputation: number; verified: boolean;
  jobs_done: number; earned: number; followers: number;
  headline?: string; rate_usdc?: number; available?: boolean;
  dims?: Record<string, number>;
};

/** The six reputation dimensions — each card draws its real breakdown. */
const DIM_AXES = ["builder", "backer", "reviewer", "creator", "agent", "trader"] as const;
type Trend = { skill: string; count: number; reward: number };
type Me = {
  id: string; listed: boolean; headline: string; rate_usdc?: number; available: boolean; skills: string[];
  dims: { dim: string; score: number }[]; gaps: { dim: string; score: number; action: string }[];
  income_total: number; income_series: number[]; engagement: number[]; engagement_delta: number; followers: number;
};
type Payload = {
  talent: Talent[]; verified_rep: number; paid_total: number; open_roles: number;
  trending: { today: Trend[]; month: Trend[] }; me: Me;
};

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-cyan" title="Earned — reputation over the verified threshold">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 2.4 3.4-.5.6 3.3 3 1.6-1.5 3 1.5 3-3 1.6-.6 3.3-3.4-.5L12 22l-2.4-2.4-3.4.5-.6-3.3-3-1.6 1.5-3-1.5-3 3-1.6.6-3.3 3.4.5z" /><path d="M9 12l2 2 4-4" /></svg>
      Verified
    </span>
  );
}

export default function TalentDirectory() {
  const [data, setData] = useState<Payload | null>(null);
  const [skill, setSkill] = useState("All");
  const [vOnly, setVOnly] = useState(false);
  const [trendTab, setTrendTab] = useState<"today" | "month">("month");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  // my-listing editor state
  const [editOpen, setEditOpen] = useState(false);
  const [headline, setHeadline] = useState("");
  const [rate, setRate] = useState("");
  const [avail, setAvail] = useState(true);
  const [mySkills, setMySkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/talent").then((r) => r.json()).then((d: Payload) => {
      setData(d);
      setHeadline(d.me.headline);
      setRate(d.me.rate_usdc ? String(d.me.rate_usdc) : "");
      setAvail(d.me.available);
      setMySkills(d.me.skills);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => window.removeEventListener("neugrid:refresh-me", load);
  }, [load]);

  const list = useMemo(() => data?.talent ?? [], [data]);
  const skills = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((t) => t.skills.forEach((s) => m.set(s, (m.get(s) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  const filtered = list
    .filter((t) => skill === "All" || t.skills.includes(skill))
    .filter((t) => !vOnly || t.verified);
  const verifiedCount = list.filter((t) => t.verified).length;
  const avgRep = list.length ? Math.round(list.reduce((s, t) => s + t.reputation, 0) / list.length) : 0;

  // ── side-rail chart data (derived, SSR-safe, all real) ───────────────────
  // LEFT-1 · Beeswarm — the whole field's reputation spread (dot = talent, size = $ earned, cyan = verified)
  const repSwarm = list.map((t) => ({ value: t.reputation ?? 0, size: (t.earned ?? 0) + 1, color: t.verified ? "#48f5ff" : "#00ff00" }));
  // LEFT-2 · Donut — verified vs the rest of the field
  const unverified = Math.max(0, list.length - verifiedCount);
  // RIGHT-1 · RadialBars — the most-listed skills (labeled petals; `skills` = [name, count] desc)
  const skillTop = skills.slice(0, 8);
  // RIGHT-2 · Lollipop — top earners against the field average
  const rankedByEarn = useMemo(() => [...list].sort((a, b) => (b.earned ?? 0) - (a.earned ?? 0)).slice(0, 7), [list]);
  const earnLollipop = rankedByEarn.map((t) => ({ value: t.earned ?? 0, label: t.username }));
  const avgEarn = list.length ? Math.round(list.reduce((s, t) => s + (t.earned ?? 0), 0) / list.length) : 0;
  const earnOk = earnLollipop.some((d) => d.value > 0);
  // inline-bar scales — each section's bars read against that section's max (all real)
  const maxEarned = Math.max(1, ...list.map((t) => t.earned ?? 0));
  const maxJobsDone = Math.max(1, ...list.map((t) => t.jobs_done ?? 0));

  const kpis: [string, number, string?][] = [
    ["Talents", list.length],
    ["Paid to Talents", data?.paid_total ?? 0, "$"],
    ["Verified", verifiedCount],
    ["Open Roles", data?.open_roles ?? 0],
    ["Avg Reputation", avgRep],
  ];

  const addSkill = () => {
    const s = skillInput.trim().toLowerCase();
    if (s && !mySkills.includes(s) && mySkills.length < 12) setMySkills([...mySkills, s]);
    setSkillInput("");
  };
  const saveListing = async () => {
    setSaving(true);
    try {
      await fetch("/api/talent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, rate_usdc: Number(rate) || undefined, available: avail, skills: mySkills }),
      });
      setEditOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const me = data?.me;
  const trend = data ? data.trending[trendTab] : [];
  const dimMax = Math.max(1, ...(me?.dims.map((d) => d.score) ?? [1]));
  const maxTrendReward = Math.max(1, ...trend.map((t) => t.reward));
  const marketMax = Math.max(1, list.length, verifiedCount, data?.open_roles ?? 0);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Talent" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — market demand + filters */}
        <OrbPanel side="left" label="Talent" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="TALENT MARKET" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="People" v={<span className="inline-flex items-center gap-2"><Meter value={list.length} max={marketMax} w={40} />{list.length}</span>} accent="neon" />
              <DataRow k="Verified" v={<span className="inline-flex items-center gap-2"><Meter value={verifiedCount} max={marketMax} w={40} color="#48f5ff" />{verifiedCount}</span>} accent="cyan" />
              <DataRow k="Open roles" v={<span className="inline-flex items-center gap-2"><Meter value={data?.open_roles ?? 0} max={marketMax} w={40} />{data?.open_roles ?? 0}</span>} />
            </div>

            {/* the whole field's reputation spread — dot = talent, size = earnings, cyan = verified */}
            <PanelChart title="Reputation · field spread" read={list.length ? `${list.length} talent` : "—"}>
              {repSwarm.length > 0
                ? <Beeswarm data={repSwarm} h={70} />
                : <p className="py-3 text-center text-[10px] text-ink-faint">No reputation data yet.</p>}
            </PanelChart>

            {/* verified vs the rest — the earned badge */}
            <PanelChart title="Trust · verified" read={list.length ? `${verifiedCount}/${list.length}` : "—"}>
              {list.length > 0 ? (
                <div className="flex items-center gap-3 py-1">
                  <Donut data={[verifiedCount, unverified]} size={78} thickness={12} colors={["#48f5ff", "rgba(0,255,0,0.16)"]} center={String(verifiedCount)} />
                  <div className="space-y-1 text-[10px] text-ink-dim">
                    <div className="flex items-center gap-1.5"><span className="text-cyan">■</span>verified <span className="text-ink-faint">· {verifiedCount}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-ink-faint">■</span>unverified <span className="text-ink-faint">· {unverified}</span></div>
                  </div>
                </div>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">No talent listed yet.</p>}
            </PanelChart>

            <div className="mb-2 mt-5 flex items-center justify-between">
              <div className="ng-label !text-ink-dim">Trending requests</div>
              <div className="ng-tabs !gap-3">
                {(["today", "month"] as const).map((t) => (
                  <button key={t} onClick={() => setTrendTab(t)} data-active={trendTab === t} className="ng-tab !text-[10px]">{t === "today" ? "Today" : "30d"}</button>
                ))}
              </div>
            </div>
            {trend.length === 0 && <p className="text-[11px] text-ink-faint">No job requests {trendTab === "today" ? "today yet" : "this month"}.</p>}
            <div className="space-y-1">
              {trend.map((t, i) => (
                <div key={t.skill} className="flex items-center justify-between rounded px-2 py-1.5 text-[12px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="text-[10px] text-ink-faint">#{i + 1}</span>
                    <span className="truncate text-ink">{t.skill}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[10px]">
                    <span className="text-ink-dim">{t.count} post{t.count === 1 ? "" : "s"}</span>
                    <Meter value={t.reward} max={maxTrendReward} w={34} color="#48f5ff" />
                    <span className="text-cyan">${t.reward.toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Filter by skill</div>
            <button
              onClick={() => setVOnly((v) => !v)}
              className={`mb-2 flex w-full items-center justify-between rounded px-2.5 py-2 text-[12px] transition ${vOnly ? "bg-cyan/10 text-cyan" : "text-ink-dim hover:text-cyan"}`}
            >
              <span>Verified only</span><span className="text-[10px]">{vOnly ? "ON" : "OFF"}</span>
            </button>
            <div className="space-y-1">
              {([["All", list.length] as [string, number], ...skills]).map(([s, n]) => (
                <button key={s} onClick={() => setSkill(s)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${skill === s ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span className="truncate">{s}</span>
                  <span className="flex shrink-0 items-center gap-2" title={`${n} of ${list.length} talent`}>
                    <Meter value={n} max={Math.max(1, list.length)} w={34} />
                    <Mark plain className="!text-[10px]">{n}</Mark>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — KPIs · my listing · the talent masonry */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Talent" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Hire by verified track record. The badge is earned — {data?.verified_rep ?? 100}+ reputation from delivered work.</p>
            </div>
            <Mark plain className="shrink-0 text-xs">{filtered.length} {skill === "All" ? "people" : skill}</Mark>
          </div>

          {/* page KPIs — 3 by default, +1 per collapsed panel */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map(([k, v, unit], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}>{unit === "$" && <span className="opacity-60">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {/* MY LISTING — self-serve: add your skills, get found */}
          {me && (
            <div className="ng-card p-3.5">
              {!editOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="ng-label !text-ink-dim">{me.listed ? "Your listing" : "You're not listed yet"}</div>
                    <div className="mt-0.5 truncate text-sm text-ink">
                      {me.listed
                        ? <>{me.headline || "No headline"} {me.rate_usdc ? <span className="text-cyan">· ${me.rate_usdc}</span> : null} <span className={me.available ? "text-neon" : "text-ink-faint"}>· {me.available ? "available" : "unavailable"}</span></>
                        : "Add your skills and rate so projects can find and hire you."}
                    </div>
                    {me.skills.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{me.skills.map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</div>}
                  </div>
                  <button onClick={() => setEditOpen(true)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0">{me.listed ? "Edit listing" : "List my skills"}</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <div>
                      <label className="ng-label mb-1 block !text-ink-faint">Headline</label>
                      <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} className="ng-input" placeholder="e.g. Full-stack Solana engineer" />
                    </div>
                    <div>
                      <label className="ng-label mb-1 block !text-ink-faint">Rate (USDC)</label>
                      <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} className="ng-input" placeholder="500" />
                    </div>
                    <div className="flex items-end pb-1">
                      <button onClick={() => setAvail((v) => !v)} className={`ng-btn ng-btn--sm ${avail ? "ng-btn-primary" : "ng-btn-ghost"}`}>{avail ? "Available" : "Unavailable"}</button>
                    </div>
                  </div>
                  <div>
                    <label className="ng-label mb-1 block !text-ink-faint">Skills ({mySkills.length}/12 — Enter to add)</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {mySkills.map((s) => (
                        <button key={s} onClick={() => setMySkills(mySkills.filter((x) => x !== s))} className="group" title="Remove">
                          <Tag className="!text-[10px] transition group-hover:!text-red-400">{s} ✕</Tag>
                        </button>
                      ))}
                      <input
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                        className="ng-input !w-40 !py-1 text-xs" placeholder="add a skill…"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-line pt-3">
                    <button onClick={saveListing} disabled={saving} className="ng-btn ng-btn-primary ng-btn--sm">{saving ? "Saving…" : "Save listing"}</button>
                    <button onClick={() => setEditOpen(false)} className="ng-btn ng-btn-ghost ng-btn--sm">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {data === null && <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ng-card h-56 animate-pulse opacity-40" />)}</div>}
          {data && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No talent matches this filter.</div></Panel>}
          {filtered.length > 0 && (
            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {filtered.map((t) => (
                <div key={t.id} className="ng-card flex flex-col p-4 transition hover:!border-neon/40">
                  {/* identity — avatar + name + the earned badge */}
                  <div className="flex items-center gap-3">
                    <MatrixAvatar seed={t.username} size={52} shape="square" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/talent/${t.id}`} className="ng-title truncate text-[15px] font-bold text-neon hover:underline">{t.username}</Link>
                        {t.verified && <VerifiedBadge />}
                      </div>
                      <div className="truncate text-[11px] text-ink">{t.headline ?? (t.skills[0] ? `${t.skills[0]} specialist` : "Builder")}</div>
                    </div>
                  </div>

                  {/* hero — the reputation headline + this person's reputation.by_dimension meters */}
                  <div className="mt-3 border-t border-line pt-2.5">
                    <div className="ng-stat__v !text-2xl text-neon tnum">{t.reputation.toLocaleString()}</div>
                    <div className="text-[9px] uppercase tracking-wide text-ink-faint">Reputation · by dimension</div>
                    <div className="mt-1.5">
                      {DIM_AXES.map((d) => (
                        <TMeter
                          key={d}
                          label={d}
                          pct={((t.dims?.[d] ?? 0) / Math.max(1, ...DIM_AXES.map((x) => t.dims?.[x] ?? 0))) * 100}
                          value={Math.round(t.dims?.[d] ?? 0)}
                          w={10}
                          className="!py-0 !text-[10px]"
                        />
                      ))}
                    </div>
                  </div>

                  {/* the record — clean rows, trade-card style */}
                  <div className="mt-3 divide-y divide-line border-t border-line text-[11px]">
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Earned</span><span className="ng-row__v inline-flex items-center gap-2 text-cyan"><Meter value={t.earned} max={maxEarned} w={34} color="#48f5ff" />${t.earned.toLocaleString()}</span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Jobs done</span><span className="ng-row__v inline-flex items-center gap-2 font-normal text-ink-dim tnum"><Meter value={t.jobs_done} max={maxJobsDone} w={34} />{t.jobs_done}</span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Rate</span>{t.rate_usdc ? <span className="ng-row__v text-cyan">${t.rate_usdc}<span className="font-normal text-ink-faint"> / job</span></span> : <span className="ng-row__v font-normal text-ink-faint">on request</span>}</div>
                  </div>

                  {/* footer — availability + ≤2 skill chips + the actions */}
                  <div className="mt-3 border-t border-line pt-2.5">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${t.available === false ? "bg-ink-faint" : "bg-neon"}`} />
                        <span className={t.available === false ? "text-ink-faint" : "text-neon"}>{t.available === false ? "Unavailable" : "Open to work"}</span>
                      </span>
                      {t.skills.length > 0 && <span className="flex min-w-0 gap-1.5">{t.skills.slice(0, 2).map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}{t.skills.length > 2 && <span className="text-[9px] text-ink-faint">+{t.skills.length - 2}</span>}</span>}
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <Link href={`/messages?to=${t.id}`} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center">Hire</Link>
                      <Link href={`/talent/${t.id}`} className="ng-btn ng-btn--sm flex-1 justify-center">Track record</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — MY GROWTH: what to improve + revenue/engagement trends */}
        <OrbPanel side="right" label="Growth" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="MY GROWTH" icon={<IconSparkle className="h-4 w-4" />} bodyClass="p-3.5">
            {!me ? (
              <p className="text-[11px] text-ink-faint">Loading…</p>
            ) : (
              <>
                {/* skill demand — the most-listed skills across all talent (labeled petals) */}
                <PanelChart title="Skills · market demand" read={skillTop.length ? `${skillTop.length} skills` : "—"}>
                  {skillTop.length > 0
                    ? <div className="flex justify-center py-1"><RadialBars data={skillTop.map(([, n]) => n)} labels={skillTop.map(([s]) => s)} size={150} /></div>
                    : <p className="py-3 text-center text-[10px] text-ink-faint">No skills listed yet.</p>}
                </PanelChart>

                {/* top earners against the field average */}
                <PanelChart title="Earnings · top talent" read={avgEarn ? `avg $${avgEarn}` : "—"}>
                  {earnOk
                    ? <Lollipop data={earnLollipop} target={avgEarn} />
                    : <p className="py-3 text-center text-[10px] text-ink-faint">No earnings yet.</p>}
                </PanelChart>

                <div className="ng-label mb-1 mt-5 !text-ink-dim">What to improve</div>
                <div className="flex justify-center">
                  <Radar axes={me.dims.map((d) => d.dim)} values={me.dims.map((d) => d.score / dimMax)} size={168} />
                </div>
                <div className="space-y-2">
                  {me.gaps.map((g) => (
                    <div key={g.dim} className="rounded border border-line bg-black/20 px-2.5 py-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold uppercase tracking-wider text-amber-300">{g.dim}</span>
                        <span className="text-ink-faint">{g.score} rep</span>
                      </div>
                      <div title={`${g.score} of ${dimMax} — your strongest dimension`}><Meter value={g.score} max={dimMax} w={140} color="#fcd34d" className="mt-1.5" /></div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-dim">{g.action}</p>
                    </div>
                  ))}
                </div>

                <div className="ng-label mb-1 mt-5 !text-ink-dim">Revenue</div>
                <div className="flex items-baseline justify-between">
                  <span className="ng-stat__v !text-base"><span className="text-cyan">$</span><CountUp key={me.income_total} value={me.income_total} /></span>
                  <span className="text-[10px] text-ink-faint">lifetime, verified payouts</span>
                </div>
                <Area data={me.income_series} gid="talent-income" w={280} h={84} />

                <div className="ng-label mb-1 mt-5 !text-ink-dim">Engagement · 8 weeks</div>
                <div className="flex items-center justify-between">
                  <Spark data={me.engagement} gid="talent-eng" up={me.engagement_delta >= 0} w={170} h={40} />
                  <div className="text-right">
                    <div className={`text-xs font-bold ${me.engagement_delta >= 0 ? "text-neon" : "text-red-400"}`}>{me.engagement_delta >= 0 ? "+" : ""}{me.engagement_delta}</div>
                    <div className="text-[9px] uppercase tracking-wider text-ink-faint">vs prior 4w</div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-dim">
                  <span className="flex items-center gap-1"><IconActivity className="h-3 w-3 text-neon" />reputation events</span>
                  <span>{me.followers} follower{me.followers === 1 ? "" : "s"}</span>
                </div>

                <div className="mt-5 border-t border-line pt-3">
                  <Link href="/jobs" className="ng-btn ng-btn--block ng-btn--sm"><IconBriefcase className="mr-1 h-3 w-3" />Open jobs →</Link>
                  <Link href="/leaderboard" className="ng-btn ng-btn-ghost ng-btn--block ng-btn--sm mt-2">Discovery leaderboard →</Link>
                </div>
              </>
            )}
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
