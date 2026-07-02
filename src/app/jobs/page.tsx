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
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconBriefcase, IconActivity, IconBolt, IconCheck } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import type { Job } from "@/lib/types";

type View = "open" | "doing" | "created" | "all";
const STATUS_ACCENT: Record<string, "neon" | "cyan" | "amber"> = {
  open: "neon", in_progress: "cyan", assigned: "cyan", submitted: "amber",
  verifying: "amber", approved: "neon", paid: "neon", rejected: "amber", disputed: "amber", cancelled: "amber",
};
const LIFECYCLE = ["open", "in progress", "submitted", "verified", "paid"];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [view, setView] = useState<View>("open");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const reload = useCallback(async () => {
    const [j, m] = await Promise.allSettled([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/me").then((r) => r.json()),
    ]);
    setJobs(j.status === "fulfilled" ? (j.value.jobs ?? []) : []);
    if (m.status === "fulfilled" && m.value?.id) setMe({ id: m.value.id });
  }, []);

  useEffect(() => {
    reload();
    const h = () => reload();
    window.addEventListener("neugrid:refresh-me", h);
    return () => window.removeEventListener("neugrid:refresh-me", h);
  }, [reload]);

  const list = jobs ?? [];
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
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Filter</div>
            <div className="space-y-1">
              {([["open", "Open", counts.open], ["doing", "I'm doing", counts.doing], ["created", "I created", counts.created], ["all", "All", list.length]] as [View, string, number][]).map(([v, label, n]) => (
                <button key={v} onClick={() => setView(v)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${view === v ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span>{label}</span><Mark plain className="!text-[10px]">{n}</Mark>
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
            {kpis.slice(0, 3 + closed).map(([k, v, unit]) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v">{unit === "$" && <span className="text-cyan">$</span>}<CountUp key={v} value={v} /></div>
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{job.title}</div>
                      <div className="mt-0.5 text-[10px] text-ink-faint">{job.context.replace(/_/g, " ")} · by {job.created_by === mineId ? "you" : job.created_by}</div>
                    </div>
                    <Mark plain accent={STATUS_ACCENT[job.status] ?? "amber"} className="!text-[10px] shrink-0">{job.status.replace(/_/g, " ")}</Mark>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-dim line-clamp-3">{job.description}</p>
                  {job.required_skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{job.required_skills.map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</div>}
                  <div className="pt-3">
                    <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                      <Mark plain accent="cyan" className="!text-[11px]"><IconBolt className="mr-0.5 inline h-3 w-3" />{job.reward_amount} {job.reward_token}</Mark>
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
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Lifecycle</div>
            <div className="space-y-1.5 text-[11px] text-ink-dim">
              {LIFECYCLE.map((s, i) => <div key={s} className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">{i + 1}</span>{s}</div>)}
            </div>
            <Link href="/talent" className="ng-btn ng-btn--block ng-btn--sm mt-4">Browse talent →</Link>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Approved work pays the doer real builder reputation — earned, not bought.</p>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
      <NeuGridDock />
    </div>
  );
}
