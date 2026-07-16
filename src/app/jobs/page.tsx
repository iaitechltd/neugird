"use client";

/**
 * Job Board — the universal work protocol, live.
 * 3-panel signature layout: left = filters/stats, center = post + job list with
 * inline lifecycle actions, right = my work + lifecycle legend.
 * Approving a submitted job pays the assignee real builder-reputation Pulse.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconBriefcase, IconActivity, IconCheck , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import { PanelChart, TMeter } from "@/components/app/terminal";
import { Bullet, LabeledBars, Marimekko, Pie, Histogram, SERIES } from "@/components/app/charts";
import type { Job } from "@/lib/types";

type DisputeRow = {
  dispute_id: string; subject_id: string; job_title: string; worker: string; creator: string;
  amount?: number; reason: string; status: string; quorum: number; votes_needed: number;
  for_worker_votes: number; for_creator_votes: number; raised_by: string; against: string;
  can_evaluate: boolean; my_vote: "for_worker" | "for_creator" | null;
};

type View = "open" | "doing" | "created" | "all";
const STATUS_ACCENT: Record<string, "neon" | "cyan" | "amber"> = {
  open: "neon", in_progress: "cyan", assigned: "cyan", submitted: "amber",
  verifying: "amber", approved: "neon", paid: "neon", rejected: "amber", disputed: "amber", cancelled: "amber",
};
// lifecycle stages, each mapped to the live job statuses that sit in it
const LIFECYCLE_MAP: [string, string[]][] = [
  ["open", ["open"]],
  ["in progress", ["in_progress", "assigned"]],
  ["submitted", ["submitted", "verifying"]],
  ["verified", ["approved"]],
  ["paid", ["paid"]],
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [contesting, setContesting] = useState<string | null>(null); // job_id being contested (inline form open)
  const [now] = useState(() => Date.now()); // mount-time clock for the multi-day dispute window (pure render)
  const [view, setView] = useState<View>("open");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const reload = useCallback(() => {
    // .then (not await) so setState is inside a callback — satisfies react-hooks/set-state-in-effect
    return Promise.allSettled([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()),
      fetch("/api/disputes").then((r) => r.json()),
    ]).then(([j, m, d]) => {
      setJobs(j.status === "fulfilled" ? (j.value.jobs ?? []) : []);
      if (m.status === "fulfilled" && m.value?.id) setMe({ id: m.value.id });
      setDisputes(d.status === "fulfilled" ? (d.value.disputes ?? []) : []);
    });
  }, []);

  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener("neugrid:refresh-me", h);
    return () => window.removeEventListener("neugrid:refresh-me", h);
  }, [reload]);

  const list = useMemo(() => jobs ?? [], [jobs]);
  const mineId = me?.id;
  const counts = useMemo(() => ({
    open: list.filter((j) => j.status === "open").length,
    doing: list.filter((j) => j.assignee_id === mineId).length,
    created: list.filter((j) => j.created_by === mineId).length,
    pool: list.filter((j) => j.status === "open").reduce((s, j) => s + j.reward_amount, 0),
  }), [list, mineId]);
  const filtered = list.filter((j) =>
    view === "open" ? j.status === "open" :
    view === "doing" ? j.assignee_id === mineId :
    view === "created" ? j.created_by === mineId : true
  );
  const kpis: [string, number, string?][] = [
    ["Open Jobs", counts.open],
    ["Rewards Pool", Math.round(counts.pool), "$"],
    ["In Progress", list.filter((j) => j.status === "in_progress").length],
    ["Delivered", list.filter((j) => j.status === "paid").length],
    ["Agent-eligible", list.filter((j) => j.status === "open" && j.executor_kind !== "human").length],
  ];

  // ── side-rail chart data (derived, SSR-safe, all real) ───────────────
  const openJobs = useMemo(() => list.filter((j) => j.status === "open"), [list]);
  const totalCount = list.length;

  // LabeledBars — demand by skill (top skills across the whole board)
  const skillBars = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const j of list) for (const s of j.required_skills) tally[s] = (tally[s] ?? 0) + 1;
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
  }, [list]);

  // Marimekko — the pipeline: column width = jobs in the stage, fill height = that stage's share of the reward pool
  const PIPE_META: [string, string, string][] = useMemo(() => [["open", "open", "#00ff00"], ["in_progress", "doing", "#48f5ff"], ["submitted", "review", "#ffb020"], ["paid", "paid", "#7cf57c"]], []);
  const pipe = useMemo(() => {
    const rows = PIPE_META.map(([st, , color]) => {
      const js = list.filter((j) => j.status === st);
      return { count: js.length, reward: js.reduce((s, j) => s + (j.reward_amount ?? 0), 0), color };
    });
    const maxR = Math.max(1, ...rows.map((r) => r.reward));
    return rows.map((r) => ({ weight: Math.max(0.02, r.count), fill: r.reward / maxR, color: r.color }));
  }, [list, PIPE_META]);
  const pipeHasJobs = list.some((j) => PIPE_META.some(([st]) => st === j.status));

  // Pie — executor mix of the OPEN jobs (who can pick the work up)
  const execMix = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const j of openJobs) { const k = j.executor_kind ?? "either"; tally[k] = (tally[k] ?? 0) + 1; }
    return Object.entries(tally).map(([label, value]) => ({ label: label.replace(/_/g, " "), value }));
  }, [openJobs]);

  // Histogram — how rewards are distributed across every job on the board
  const rewardSpread = list.map((j) => j.reward_amount ?? 0).filter((v) => v > 0);
  // Card bullet — every job's reward measured against the whole board's average
  const boardAvg = rewardSpread.length ? Math.round(rewardSpread.reduce((a, b) => a + b, 0) / rewardSpread.length) : 0;
  // Rail meters — the open board's share of all jobs / of all reward value
  const totalRewards = list.reduce((s, j) => s + (j.reward_amount ?? 0), 0);
  // Lifecycle legend — how many jobs sit in each stage right now (real, live)
  const lifecycleCounts = LIFECYCLE_MAP.map(([label, sts]) => ({ label, count: list.filter((j) => sts.includes(j.status)).length }));
  const lifecycleMax = Math.max(1, ...lifecycleCounts.map((s) => s.count));

  async function act(url: string, body?: object, msg?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error();
      if (msg) notify(msg);
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      await reload();
    } catch { notify("Something went wrong"); }
    setBusy(false);
  }

  async function postJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const reward = Number(fd.get("reward") ?? 0);
    if (!title || !reward) { notify("Job needs a title and a reward"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, reward_amount: reward, description: String(fd.get("description") ?? ""), skills: String(fd.get("skills") ?? "") }),
      });
      if (!r.ok) throw new Error();
      notify(`Job "${title}" posted`);
      setCreating(false);
      await reload();
    } catch { notify("Could not post job"); }
    setBusy(false);
  }

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Jobs" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — filters + stats */}
        <OrbPanel side="left" label="Filters" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="WORK" icon={<IconBriefcase className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Jobs" v={counts.open} accent="neon" />
              <DataRow k="Reward Pool" v={`${counts.pool} Pulse`} />
              <DataRow k="Total Jobs" v={list.length} />
            </div>
            {list.length > 0 && (
              <div className="mt-2 border-t border-line pt-1.5">
                <TMeter label="Open share" pct={(counts.open / list.length) * 100} value={`${Math.round((counts.open / list.length) * 100)}% of jobs`} w={10} />
                <TMeter label="Pool share" pct={(counts.pool / Math.max(1, totalRewards)) * 100} value={`${Math.round((counts.pool / Math.max(1, totalRewards)) * 100)}% of rewards`} w={10} color="#48f5ff" />
              </div>
            )}

            <PanelChart title="Demand · by skill" read={`top ${skillBars.length}`}>
              {skillBars.length > 0
                ? <LabeledBars data={skillBars} />
                : <p className="py-3 text-center text-[10px] text-ink-faint">no skills tagged</p>}
            </PanelChart>
            <PanelChart title="Pipeline · jobs × reward" read={`${totalCount} total`}>
              {pipeHasJobs ? (
                <>
                  <Marimekko data={pipe} h={72} />
                  <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[8.5px] text-ink-faint">
                    {PIPE_META.map(([, label, color]) => <span key={label}><span style={{ color }}>■</span> {label}</span>)}
                  </div>
                </>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">no jobs yet</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">Filter</div>
            <div className="space-y-1">
              {([["open", "Open", counts.open], ["doing", "I'm doing", counts.doing], ["created", "I created", counts.created], ["all", "All", list.length]] as [View, string, number][]).map(([v, label, n]) => (
                <button key={v} onClick={() => setView(v)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${view === v ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span>{label}</span>
                  <span className="flex items-center gap-2">
                    <Meter value={n} max={Math.max(1, list.length)} w={40} />
                    <Mark plain className="!text-[10px]">{n}</Mark>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — post + list */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Job Board" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Post work. Claim it. Deliver. Earn verified reputation.</p>
            </div>
            <button onClick={() => setCreating((c) => !c)} className="ng-btn ng-btn-primary shrink-0">{creating ? "Cancel" : "+ Post a Job"}</button>
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

          {creating && (
            <form onSubmit={postJob} className="ng-panel space-y-2.5 p-4">
              <input name="title" placeholder="Job title" className="ng-input" />
              <textarea name="description" placeholder="What needs to be done? How is it verified?" className="ng-input min-h-[64px] resize-y" />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <input name="reward" type="number" placeholder="Reward (Pulse)" className="ng-input" />
                <input name="skills" placeholder="Skills (comma separated)" className="ng-input" />
              </div>
              <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{busy ? "Posting…" : "Post Job"}</button>
            </form>
          )}

          {jobs === null && <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="ng-card h-36 animate-pulse opacity-40" />)}</div>}
          {jobs && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No jobs here. {view === "open" ? "Post the first one." : "Switch filters or post a job."}</div></Panel>}
          {filtered.length > 0 && (
            <div className="columns-1 gap-3 sm:columns-2 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {filtered.map((job) => (
                <div key={job.job_id} className="ng-card mb-3 flex break-inside-avoid flex-col p-4">
                  {/* identity — title + ONE status chip (one truncated description line max) */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{job.title}</div>
                      {job.description && <div className="mt-0.5 truncate text-[10px] text-ink-faint">{job.description}</div>}
                    </div>
                    <Mark plain accent={STATUS_ACCENT[job.status] ?? "amber"} className="!text-[10px] shrink-0">{job.status.replace(/_/g, " ")}</Mark>
                  </div>
                  {/* hero — the reward headline + THIS job's reward vs the board average (amber tick) */}
                  <div className="mt-3">
                    <div className="ng-stat__v !text-2xl text-neon tnum">{(job.reward_amount ?? 0).toLocaleString()}<span className="ml-1 text-[11px] font-normal text-ink-dim">{job.reward_token}</span></div>
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint">
                      <span>Reward</span>
                      {boardAvg > 0 && <span className="tnum">board avg {boardAvg.toLocaleString()}</span>}
                    </div>
                    {boardAvg > 0 && <div className="mt-1.5"><Bullet data={[{ value: job.reward_amount ?? 0, target: boardAvg }]} rowH={9} gap={1} color="#7cf57c" /></div>}
                  </div>
                  {/* the record — clean rows, trade-card style */}
                  <div className="mt-3 divide-y divide-line text-[11px]">
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Posted by</span><span className="ng-row__v truncate font-normal text-ink-dim">{job.created_by === mineId ? "you" : job.created_by}</span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Executor</span><span className="ng-row__v font-normal capitalize text-ink-dim">{(job.executor_kind ?? "either").replace(/_/g, " ")}</span></div>
                    {job.required_skills.length > 0 && <div className="ng-row !py-1.5"><span className="ng-row__k">Skills</span><span className="ng-row__v flex gap-1.5 font-normal">{job.required_skills.slice(0, 2).map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}{job.required_skills.length > 2 && <span className="text-[9px] text-ink-faint">+{job.required_skills.length - 2}</span>}</span></div>}
                  </div>
                  {/* footer — context chip + the lifecycle action */}
                  <div className="pt-3">
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                      <Mark plain className="!text-[9px] shrink-0">{job.context.replace(/_/g, " ")}</Mark>
                      <div className="flex items-center gap-2">
                        {job.status === "open" && job.created_by !== mineId && (
                          <button disabled={busy} onClick={() => act(`/api/jobs/${job.job_id}/claim`, undefined, "Claimed")} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Claim</button>
                        )}
                        {job.status === "open" && job.created_by === mineId && <span className="text-[11px] text-ink-faint">awaiting claim</span>}
                        {job.status === "submitted" && job.created_by === mineId && (
                          <>
                            <button disabled={busy} onClick={() => act(`/api/jobs/${job.job_id}/review`, { approve: true }, "Approved · reputation paid")} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Approve</button>
                            <button disabled={busy} onClick={() => act(`/api/jobs/${job.job_id}/review`, { approve: false }, "Sent back")} className="ng-btn ng-btn-danger ng-btn--sm disabled:opacity-50">Reject</button>
                          </>
                        )}
                        {job.status === "submitted" && job.assignee_id === mineId && <span className="text-[11px] text-ink-faint">awaiting review</span>}
                        {job.status === "in_progress" && job.assignee_id !== mineId && <span className="text-[11px] text-ink-faint">in progress</span>}
                        {job.status === "paid" && <span className="flex items-center gap-1 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" />paid</span>}
                      </div>
                    </div>
                    {(job.assignee_id === mineId && (job.status === "in_progress" || job.status === "rejected")) && (
                      <form
                        onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const p = String(fd.get("proof") ?? "").trim(); if (p) act(`/api/jobs/${job.job_id}/submit`, { proof: p }, "Proof submitted"); }}
                        className="mt-2.5 flex gap-2"
                      >
                        <input name="proof" placeholder={job.status === "rejected" ? "Resubmit link…" : "Proof link…"} className="ng-input !py-1.5 text-xs" />
                        <button type="submit" disabled={busy} className="ng-btn ng-btn--sm shrink-0 disabled:opacity-50">Submit</button>
                      </form>
                    )}
                    {/* Contest an unfair rejection → a reputation-staked evaluator panel decides */}
                    {job.assignee_id === mineId && job.status === "rejected" && job.reward_token === "USDC" && job.dispute_deadline && Date.parse(job.dispute_deadline) > now && (
                      contesting === job.job_id ? (
                        <form onSubmit={(e) => { e.preventDefault(); const r = String(new FormData(e.currentTarget).get("reason") ?? "").trim(); act(`/api/jobs/${job.job_id}/dispute`, { reason: r }, "Dispute opened — a staked evaluator panel will decide").then(() => setContesting(null)); }} className="mt-2 border-t border-line pt-2">
                          <div className="ng-label mb-1 !text-[10px] !text-amber">Contest the rejection</div>
                          <textarea name="reason" rows={2} placeholder="Why was the delivery valid? (the panel reads this)" className="ng-input w-full !py-1.5 text-[11px]" />
                          <div className="mt-1.5 flex gap-2">
                            <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Open dispute</button>
                            <button type="button" onClick={() => setContesting(null)} className="ng-btn ng-btn-ghost ng-btn--sm">cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button onClick={() => setContesting(job.job_id)} className="mt-2 w-full border-t border-line pt-2 text-left text-[10px] text-amber transition hover:text-neon">⚖ Contest this rejection — escalate to a staked evaluator panel →</button>
                      )
                    )}
                    {job.status === "disputed" && <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[10px] text-amber">⚖ Under review by a staked evaluator panel</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — my work + legend */}
        <OrbPanel side="right" label="My Work" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="MY WORK" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="I'm doing" v={counts.doing} accent="cyan" />
              <DataRow k="I created" v={counts.created} />
            </div>

            <PanelChart title="Executor mix · open jobs" read={`${openJobs.length} open`}>
              {execMix.length > 0 ? (
                <div className="flex items-center gap-3 py-1">
                  <Pie data={execMix} size={78} />
                  <div className="space-y-1 text-[10px] text-ink-dim">
                    {execMix.map((e, i) => <div key={e.label} className="flex items-center gap-1.5"><span style={{ color: SERIES[i % SERIES.length] }}>■</span><span className="capitalize">{e.label}</span><span className="text-ink-faint">· {e.value}</span></div>)}
                  </div>
                </div>
              ) : <p className="py-3 text-center text-[10px] text-ink-faint">no open jobs</p>}
            </PanelChart>
            <PanelChart title="Reward spread · all jobs" read={`${rewardSpread.length} jobs`}>
              {rewardSpread.length > 0
                ? <Histogram data={rewardSpread} bins={6} h={56} />
                : <p className="py-3 text-center text-[10px] text-ink-faint">no rewards set</p>}
            </PanelChart>

            {/* DISPUTES — the staked-evaluator queue */}
            {disputes.length > 0 && (
              <div className="mt-5 border-t border-line pt-3">
                <div className="ng-label mb-2 flex items-center justify-between !text-amber"><span>⚖ Disputes</span><span className="text-ink-faint">{disputes.length} open</span></div>
                <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">Contested rejections. Reputation-staked evaluators decide — vote with the panel to earn reviewer rep, against it and you&apos;re slashed.</p>
                <div className="space-y-2">
                  {disputes.map((d) => (
                    <div key={d.dispute_id} className="rounded border border-amber/25 bg-amber/[0.04] p-2 text-[11px]">
                      <div className="font-semibold text-ink">{d.job_title}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-faint">
                        <MatrixAvatar seed={d.worker} size={14} /><span className="truncate">{d.worker}</span>
                        <span className="shrink-0">vs</span>
                        <MatrixAvatar seed={d.creator} size={14} /><span className="truncate">{d.creator}</span>
                        {d.amount ? <span className="shrink-0"> · ${d.amount.toLocaleString()} escrow</span> : null}
                      </div>
                      {d.reason && <p className="mt-1 line-clamp-2 text-[10px] italic leading-relaxed text-ink-dim">“{d.reason}”</p>}
                      {/* tug-of-war — worker verdicts pull left (green), creator right (red) */}
                      <div className="mt-1.5 flex items-center justify-between text-[9px] uppercase tracking-wide">
                        <span className="font-bold text-neon">worker {d.for_worker_votes}</span>
                        <span className="text-ink-faint">{d.votes_needed} more to resolve</span>
                        <span className="font-bold text-[#ff8b8b]">creator {d.for_creator_votes}</span>
                      </div>
                      {d.for_worker_votes + d.for_creator_votes > 0 ? (
                        <div className="mt-1 flex h-2.5 overflow-hidden border border-line bg-black/40">
                          <div className="bg-neon/70" style={{ width: `${(d.for_worker_votes / (d.for_worker_votes + d.for_creator_votes)) * 100}%` }} />
                          <div className="bg-[#ff8b8b]/70" style={{ width: `${(d.for_creator_votes / (d.for_worker_votes + d.for_creator_votes)) * 100}%` }} />
                        </div>
                      ) : (
                        <div className="mt-1 h-2.5 border border-line bg-black/40" title="no verdicts cast yet" />
                      )}
                      <div className="mt-1 flex items-center gap-1.5">
                        <Meter value={d.for_worker_votes + d.for_creator_votes} max={Math.max(1, d.quorum)} w={110} color="#ffb020" />
                        <span className="tnum text-[9px] text-ink-faint">{d.for_worker_votes + d.for_creator_votes}/{d.quorum} quorum</span>
                      </div>
                      {d.can_evaluate ? (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          <button disabled={busy} onClick={() => act(`/api/disputes/${d.dispute_id}/vote`, { for_worker: true, reason: "" }, "Verdict cast · for the worker")} className="ng-btn ng-btn-primary ng-btn--sm !py-1 !text-[10px] disabled:opacity-50">For worker</button>
                          <button disabled={busy} onClick={() => act(`/api/disputes/${d.dispute_id}/vote`, { for_worker: false, reason: "" }, "Verdict cast · rejection stands")} className="ng-btn ng-btn-danger ng-btn--sm !py-1 !text-[10px] disabled:opacity-50">For payer</button>
                        </div>
                      ) : d.my_vote ? (
                        <div className="mt-1.5 text-[10px] text-cyan">you voted {d.my_vote === "for_worker" ? "for the worker" : "for the payer"}</div>
                      ) : (d.raised_by === mineId || d.against === mineId) ? (
                        <div className="mt-1.5 text-[10px] text-ink-faint">you&apos;re a party — the panel decides</div>
                      ) : (
                        <div className="mt-1.5 text-[10px] text-ink-faint">need 100+ reputation to evaluate</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ng-label mb-2 mt-5 flex items-center justify-between !text-ink-dim"><span>Lifecycle · live</span><span className="text-ink-faint">{list.length} jobs</span></div>
            <div className="space-y-1.5 text-[11px] text-ink-dim">
              {lifecycleCounts.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">{i + 1}</span>
                  <span className="min-w-0 flex-1 capitalize">{s.label}</span>
                  <Meter value={s.count} max={lifecycleMax} w={48} />
                  <span className="w-4 shrink-0 text-right tnum text-[10px] text-neon/70">{s.count}</span>
                </div>
              ))}
            </div>
            <Link href="/talent" className="ng-btn ng-btn--block ng-btn--sm mt-4">Browse talent →</Link>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Approved work pays the doer real builder reputation — earned, not bought.</p>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
