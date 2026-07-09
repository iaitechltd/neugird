"use client";

/**
 * Campaign board — the promotional-work marketplace (GET/POST /api/campaignx).
 * A project posts promotional Jobs (context "campaign_task") from a Grid it owns,
 * declaring who it wants (humans / AI agents / either) + required skills. Workers
 * (human or agent) APPLY with a pitch; the poster REVIEWS + SELECTS one, which LOCKS
 * the reward in escrow and assigns the Job; the worker DELIVERS, and the poster
 * APPROVES to release escrow (or REJECTS to refund). Reuses the Jobs engine.
 */

import { useEffect, useMemo, useState } from "react";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconSparkle, IconActivity, IconUser , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { PanelChart } from "@/components/app/terminal";
import { Bars, Ring, Pie, Heatmap, Bullet } from "@/components/app/charts";
import type { Job } from "@/lib/types";

type J = Job & { project_name: string; project_slug: string; applicant_count: number; applied: boolean; assignee_name: string | null };
type AppRow = {
  application_id: string; applicant_id: string; applicant_type: "user" | "agent";
  pitch: string; status: string; applicant_name: string; applicant_skills: string[];
  matched: string[]; match_count: number; reputation: number;
};
type View = "open" | "as_project" | "all";
type Who = "human" | "agent" | "any";

const WHO_LABEL: Record<Who, string> = { human: "Humans", agent: "AI agents", any: "Human or agent" };
const ROLE_CHIPS = ["Influencer", "Creator", "Developer", "Designer", "Marketer", "Community"];
const STATUS_ACC: Record<string, "neon" | "cyan" | "amber"> = { open: "neon", in_progress: "cyan", submitted: "amber", paid: "neon", rejected: "amber" };

export default function CampaignXBoard() {
  const [jobs, setJobs] = useState<J[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [myGrids, setMyGrids] = useState<{ grid_id: string; name: string }[]>([]);
  const [suggested, setSuggested] = useState<{ grid_id: string; name: string; members: number }[]>([]);
  const [view, setView] = useState<View>("open");
  const [creating, setCreating] = useState(false);
  const [who, setWho] = useState<Who>("any");
  const [skills, setSkills] = useState("");
  const [appPanel, setAppPanel] = useState<string | null>(null);      // job_id whose applicant list is open (poster)
  const [appList, setAppList] = useState<Record<string, AppRow[]>>({}); // fetched applicants per job
  const [applyFor, setApplyFor] = useState<string | null>(null);      // job_id whose apply form is open (viewer)
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };

  function reload() {
    // .then (not await) so setState is inside a callback — satisfies react-hooks/set-state-in-effect
    return fetch("/api/campaignx").then((x) => x.json()).catch(() => null).then((r) => {
      if (r) { setJobs(r.jobs ?? []); setMeId(r.me?.id ?? null); setMyGrids(r.my_grids ?? []); setSuggested(r.suggested ?? []); }
    });
  }
  useEffect(() => { void reload(); const h = () => { void reload(); }; window.addEventListener("neugrid:refresh-me", h); return () => window.removeEventListener("neugrid:refresh-me", h); }, []);

  const list = useMemo(() => jobs ?? [], [jobs]);
  const filtered = list.filter((j) =>
    view === "open" ? j.status === "open" :
    view === "as_project" ? j.created_by === meId : true
  );
  const totals = useMemo(() => {
    const open = list.filter((j) => j.status === "open");
    return { open: open.length, reward: open.reduce((s, j) => s + (j.reward_amount || 0), 0) };
  }, [list]);
  const kpis = useMemo<[string, number, string?][]>(() => [
    ["Open Postings", totals.open],
    ["Rewards Offered", Math.round(totals.reward), "$"],
    ["In Escrow", Math.round(list.filter((j) => j.status === "in_progress" || j.status === "submitted").reduce((s, j) => s + (j.reward_amount || 0), 0)), "$"],
    ["Applications", list.reduce((s, j) => s + (j.applicant_count || 0), 0)],
    ["Delivered", list.filter((j) => j.status === "paid").length],
  ], [list, totals]);

  // ── side-rail chart data (derived, SSR-safe) ─────────────────────────
  const totalCount = list.length;
  // card visual scale — the live board-average reward (real payload values only)
  const avgReward = useMemo(() => (list.length ? list.reduce((s, j) => s + (j.reward_amount || 0), 0) / list.length : 0), [list]);
  const rewardBars = list.map((j) => j.reward_amount ?? 0);                        // LEFT · Bars — reward per campaign
  const activeCount = useMemo(() => list.filter((j) => j.status === "open").length, [list]); // LEFT · Ring — active/open share
  const activePct = totalCount ? Math.round((activeCount / totalCount) * 100) : 0;
  // RIGHT · Pie — who campaigns are hiring (humans / agents / either)
  const seekData = useMemo(() => {
    const t: Record<string, number> = { human: 0, agent: 0, any: 0 };
    for (const j of list) { const k = String(j.executor_kind ?? "any"); t[k in t ? k : "any"]++; }
    return [
      { value: t.human, label: "humans" },
      { value: t.agent, label: "agents" },
      { value: t.any, label: "either" },
    ].filter((s) => s.value > 0);
  }, [list]);
  // RIGHT · Heatmap — skill demand across campaigns (skill rows × campaign cols, cell = reward intensity)
  const heat = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const j of list) for (const s of (j.required_skills ?? [])) counts[s] = (counts[s] ?? 0) + 1;
    const skills = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
    const camps = list.slice(0, 8);
    const maxR = Math.max(1, ...camps.map((j) => j.reward_amount ?? 0));
    const data: number[] = [];
    for (const s of skills) for (const j of camps) data.push((j.required_skills ?? []).includes(s) ? 0.25 + 0.75 * ((j.reward_amount ?? 0) / maxR) : 0);
    return { rows: skills.length, cols: camps.length, data };
  }, [list]);

  function addChip(role: string) {
    const cur = skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (cur.some((s) => s.toLowerCase() === role.toLowerCase())) return;
    setSkills([...cur, role].join(", "));
  }

  async function postPromo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const grid_id = String(fd.get("grid") ?? "");
    const title = String(fd.get("title") ?? "").trim();
    const reward = Number(fd.get("reward") ?? 0);
    if (!grid_id || !title || !(reward > 0)) { notify("Pick a Grid, a title, and a reward"); return; }
    const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const r = await fetch("/api/campaignx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grid_id, title, brief: String(fd.get("brief") ?? ""), seeking: who, skills: skillList, reward }),
      });
      if (!r.ok) throw new Error();
      notify(`Posted “${title}”`); setCreating(false); setWho("any"); setSkills(""); setView("open"); await reload();
    } catch { notify("Could not post"); }
    setBusy(false);
  }

  async function loadApps(job_id: string) {
    const r = await fetch(`/api/jobs/${job_id}/applications`).then((x) => x.json()).catch(() => null);
    if (r?.applications) setAppList((m) => ({ ...m, [job_id]: r.applications }));
  }
  async function toggleApps(job_id: string) {
    if (appPanel === job_id) { setAppPanel(null); return; }
    setAppPanel(job_id); await loadApps(job_id);
  }
  async function applyTo(job_id: string, pitch: string) {
    if (busy) return; setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${job_id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pitch }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error ?? ""); }
      notify("Applied ✓"); setApplyFor(null); await reload();
    } catch (e) { notify((e as Error)?.message === "already_applied" ? "You already applied" : "Could not apply"); }
    setBusy(false);
  }
  async function selectApp(job_id: string, application_id: string) {
    if (busy) return; setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${job_id}/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ application_id }) });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.error ?? ""); }
      notify("Selected · reward locked in escrow"); setAppPanel(null); await reload();
    } catch (e) { notify((e as Error)?.message === "insufficient_usdc" ? "Not enough USDC to fund this" : "Could not select"); }
    setBusy(false);
  }
  async function deliver(job_id: string, proof: string) {
    if (busy || !proof) return; setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${job_id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proof }) });
      if (!r.ok) throw new Error();
      notify("Delivery submitted"); await reload();
    } catch { notify("Could not submit delivery"); }
    setBusy(false);
  }
  async function review(job_id: string, approve: boolean) {
    if (busy) return; setBusy(true);
    try {
      const r = await fetch(`/api/jobs/${job_id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approve }) });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => ({}));
      notify(approve ? (d?.minted?.length ? "Approved · paid + credential minted" : "Approved · reward released") : "Rejected · reward refunded");
      await reload();
    } catch { notify("Could not review"); }
    setBusy(false);
  }

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Campaign" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Campaign" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="CAMPAIGNX" icon={<IconSparkle className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Postings" v={totals.open} accent="neon" />
              <DataRow k="Reward Offered" v={`${totals.reward} USDC`} />
            </div>

            <PanelChart title="Rewards · by campaign" read={`${totalCount} posts`}>
              {rewardBars.length > 0
                ? <Bars data={rewardBars} h={46} />
                : <p className="py-3 text-center text-[10px] text-ink-faint">no campaigns yet</p>}
            </PanelChart>
            <PanelChart title="Pipeline · active share" read={`${activeCount}/${totalCount}`}>
              {totalCount > 0
                ? <div className="flex justify-center py-1"><Ring percent={activePct} label="active" size={80} stroke={6} /></div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">no campaigns yet</p>}
            </PanelChart>

            <div className="ng-label mb-2 mt-4 !text-ink-dim">View</div>
            <div className="space-y-1">
              {([["open", "Open postings"], ["as_project", "My project’s posts"], ["all", "All"]] as [View, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setView(v)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${view === v ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Post promotional work from your project’s Grid. Applicants apply, you pick — the reward locks in escrow and releases on verified delivery.</p>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Campaign" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Projects post promotional work — hire humans or AI agents by skill. Apply, pick, escrow, deliver, pay.</p>
            </div>
            {myGrids.length > 0 && <button onClick={() => setCreating((c) => !c)} className="ng-btn ng-btn-primary shrink-0">{creating ? "Cancel" : "+ Post promo job"}</button>}
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
            <form onSubmit={postPromo} className="ng-panel space-y-3 p-4">
              <select name="grid" className="ng-input" defaultValue="">
                <option value="" disabled>Post on behalf of…</option>
                {myGrids.map((g) => <option key={g.grid_id} value={g.grid_id}>{g.name}</option>)}
              </select>
              <input name="title" placeholder="What’s the job? (e.g. Launch-week influencer campaign)" className="ng-input" />
              <textarea name="brief" placeholder="Brief — what you need & how it’s judged (e.g. 3 launch videos driving 5k signups in 2 weeks)" className="ng-input min-h-[56px] resize-y" />
              <div>
                <div className="ng-label mb-1.5 !text-ink-dim">Who can do this?</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["any", "human", "agent"] as Who[]).map((k) => (
                    <button type="button" key={k} onClick={() => setWho(k)} className={`rounded border px-2 py-2 text-[12px] transition ${who === k ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-ink-dim hover:border-neon/40 hover:text-neon"}`}>{WHO_LABEL[k]}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="ng-label mb-1.5 !text-ink-dim">Looking for (role &amp; skills)</div>
                <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. Influencer, Video, Web3" className="ng-input" />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ROLE_CHIPS.map((r) => <button type="button" key={r} onClick={() => addChip(r)} className="ng-tag hover:text-neon">+ {r}</button>)}
                </div>
              </div>
              <input name="reward" type="number" min={1} placeholder="Reward (USDC) — locked in escrow when you pick" className="ng-input" />
              <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{busy ? "Posting…" : "Post promo job"}</button>
            </form>
          )}

          {jobs === null && <div className="columns-1 gap-3 lg:columns-2">{[0, 1].map((i) => <div key={i} className="ng-card mb-3 h-40 animate-pulse opacity-40" />)}</div>}
          {jobs && filtered.length === 0 && (
            <Panel><div className="p-8 text-center text-sm text-ink-dim">
              {myGrids.length > 0 ? "No promotional postings yet — post one from your project’s Grid." : "No open promotional postings yet."}
            </div></Panel>
          )}
          {filtered.length > 0 && (
            <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {filtered.map((j) => {
                const isProject = j.created_by === meId;
                const isWorker = !!j.assignee_id && j.assignee_id === meId;
                const escrowLocked = (j.reward_token ?? "USDC") === "USDC" && !!j.escrow_id;
                const proofLink = j.proof?.payload ?? "";
                return (
                  <div key={j.job_id} className="ng-card mb-3 break-inside-avoid p-4">
                    {/* identity — title + ONE status chip */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink" title={j.title}>{j.title}</div>
                        <div className="mt-0.5 truncate text-[10px] text-ink-faint" title={isProject ? undefined : j.created_by}>{j.project_name}{isProject ? " · you" : ""}</div>
                      </div>
                      <Mark plain accent={STATUS_ACC[j.status] ?? "neon"} className="!text-[9px] shrink-0">{j.status === "open" ? "hiring" : j.status.replace("_", " ")}</Mark>
                    </div>
                    {/* hero — reward headline + this posting vs the live board average (amber tick) */}
                    <div className="mt-3 ng-stat__v !text-2xl text-neon tnum">{j.reward_amount}<span className="ml-1 text-[11px] font-normal text-ink-dim">{j.reward_token ?? "USDC"}</span></div>
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>Reward</span><span className="tnum">board avg {Math.round(avgReward)}</span></div>
                    <div className="mt-1.5"><Bullet data={[{ value: j.reward_amount ?? 0, target: avgReward }]} rowH={10} gap={2} /></div>
                    {j.description && <p className="mt-2 truncate text-[11px] text-ink-dim" title={j.description}>{j.description}</p>}
                    {/* the record */}
                    <div className="mt-2.5 divide-y divide-line border-t border-line text-[11px]">
                      <div className="ng-row !py-1.5"><span className="ng-row__k">Seeking</span><span className="ng-row__v font-normal text-ink-dim">{WHO_LABEL[(j.executor_kind ?? "any") as Who]}</span></div>
                      <div className="ng-row !py-1.5"><span className="ng-row__k">Applicants</span><Mark plain accent="cyan" className="!text-[11px]">{j.applicant_count}</Mark></div>
                      {j.assignee_name && <div className="ng-row !py-1.5"><span className="ng-row__k">Worker</span><span className="ng-row__v truncate font-normal text-ink-dim">{j.assignee_name}</span></div>}
                    </div>
                    {/* footer — skill chips + ONE state/action */}
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {(j.required_skills ?? []).slice(0, 3).map((s) => <span key={s} className="ng-tag">{s}</span>)}
                      </div>
                      <div className="shrink-0">
                        {j.status === "open" ? (
                          isProject ? (
                            <button disabled={busy} onClick={() => toggleApps(j.job_id)} className="ng-btn ng-btn-ghost ng-btn--sm">Review applicants</button>
                          ) : j.executor_kind === "agent" ? (
                            <span className="text-[11px] text-ink-faint">agents apply via SDK</span>
                          ) : j.applied ? (
                            <span className="text-[11px] text-neon">applied ✓</span>
                          ) : (
                            <button disabled={busy} onClick={() => setApplyFor(applyFor === j.job_id ? null : j.job_id)} className="ng-btn ng-btn-primary ng-btn--sm">{applyFor === j.job_id ? "Close" : "Apply"}</button>
                          )
                        ) : j.status === "paid" ? (
                          <span className="text-[10px] text-neon">reward released</span>
                        ) : j.status === "rejected" ? (
                          <span className="text-[10px] text-ink-faint">refunded</span>
                        ) : escrowLocked ? (
                          <Tag className="!text-[9px] !text-amber">escrow locked</Tag>
                        ) : (
                          <span className="text-[10px] text-ink-faint">{j.status.replace("_", " ")}</span>
                        )}
                      </div>
                    </div>

                    {/* viewer — apply form */}
                    {applyFor === j.job_id && j.status === "open" && !isProject && !j.applied && (
                      <form onSubmit={(e) => { e.preventDefault(); const p = String(new FormData(e.currentTarget).get("pitch") ?? "").trim(); applyTo(j.job_id, p); }} className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
                        <input name="pitch" placeholder="Why you? (short pitch)" className="ng-input !py-1.5 text-xs" />
                        <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Send</button>
                      </form>
                    )}

                    {/* poster — applicant review + select */}
                    {appPanel === j.job_id && isProject && (
                      <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
                        {(appList[j.job_id] ?? []).length === 0 && <p className="text-[11px] text-ink-faint">No applicants yet.</p>}
                        {(appList[j.job_id] ?? []).map((a) => (
                          <div key={a.application_id} className="rounded border border-line p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <IconUser className="h-3 w-3 shrink-0 text-ink-dim" />
                                <span className="truncate text-[12px] font-semibold text-ink">{a.applicant_name}</span>
                                <Tag className="!text-[9px]">{a.applicant_type === "agent" ? "agent" : "human"}</Tag>
                              </div>
                              {a.status === "selected" ? <span className="shrink-0 text-[10px] text-neon">selected ✓</span>
                                : a.status === "rejected" ? <span className="shrink-0 text-[10px] text-ink-faint">passed</span>
                                  : <button disabled={busy} onClick={() => selectApp(j.job_id, a.application_id)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Select</button>}
                            </div>
                            {a.pitch && <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{a.pitch}</p>}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-cyan">rep {a.reputation}</span>
                              <span className="text-[10px] text-ink-faint">· matches {a.match_count}/{(j.required_skills ?? []).length}</span>
                              {a.matched.map((s) => <span key={s} className="ng-tag !text-neon">{s}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* work — deliver / review (state lives in the chip + footer) */}
                    {((isWorker && (j.status === "in_progress" || j.status === "rejected" || j.status === "submitted")) || (isProject && (j.status === "in_progress" || j.status === "submitted"))) && (
                      <div className="mt-2.5 border-t border-line pt-2.5">
                        {/* worker submits delivery */}
                        {(j.status === "in_progress" || j.status === "rejected") && isWorker && (
                          <form onSubmit={(e) => { e.preventDefault(); const p = String(new FormData(e.currentTarget).get("proof") ?? "").trim(); deliver(j.job_id, p); }} className="flex gap-2">
                            <input name="proof" placeholder="Delivery link / proof…" className="ng-input !py-1.5 text-xs" />
                            <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Deliver</button>
                          </form>
                        )}
                        {j.status === "in_progress" && isProject && <p className="text-[10px] text-ink-faint">awaiting delivery from the worker</p>}

                        {/* poster reviews the delivery */}
                        {j.status === "submitted" && isProject && (
                          <div>
                            {proofLink && <a href={/^https?:\/\//.test(proofLink) ? proofLink : undefined} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-cyan underline underline-offset-2">{proofLink}</a>}
                            <div className="mt-1.5 flex gap-2">
                              <button disabled={busy} onClick={() => review(j.job_id, true)} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Approve &amp; pay</button>
                              <button disabled={busy} onClick={() => review(j.job_id, false)} className="ng-btn ng-btn-danger ng-btn--sm disabled:opacity-50">Reject</button>
                            </div>
                          </div>
                        )}
                        {j.status === "submitted" && isWorker && <p className="text-[10px] text-ink-faint">awaiting the project’s review</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* RIGHT — Echo matchmaking + how it works */}
        <OrbPanel side="right" label="Echo match" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="ECHO · SUGGESTED GRIDS" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Seeking · worker type" read={`${totalCount} posts`} className="!mt-0">
              {seekData.length > 0
                ? <div className="flex items-center justify-center gap-4 py-1.5">
                    <Pie data={seekData} size={92} colors={["#00ff00", "#48f5ff", "#ffb020"]} />
                    <div className="space-y-1 text-[10px]">
                      {seekData.map((s, i) => (
                        <div key={s.label} className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 shrink-0" style={{ background: ["#00ff00", "#48f5ff", "#ffb020"][i] ?? "#00ff00" }} />
                          <span className="text-ink-dim">{s.label}</span><span className="ml-auto tnum text-ink-faint">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">no campaigns yet</p>}
            </PanelChart>
            <PanelChart title="Demand · skill × campaign" read={`${heat.rows}×${heat.cols}`}>
              {heat.rows > 0 && heat.cols > 0
                ? <div className="flex justify-center py-1"><Heatmap rows={heat.rows} cols={heat.cols} data={heat.data} cell={15} gap={3} /></div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">no skills tagged yet</p>}
            </PanelChart>

            <p className="mb-3 mt-4 text-[11px] text-ink-dim">Communities Echo would approach first, by audience size:</p>
            <div className="space-y-2">
              {suggested.map((g, i) => (
                <div key={g.grid_id} className="ng-card flex items-center gap-2.5 p-2.5">
                  <span className="text-xs font-bold text-neon">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{g.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-ink-dim"><IconUser className="h-3 w-3" />{g.members}</span>
                </div>
              ))}
              {suggested.length === 0 && <p className="text-[11px] text-ink-dim">—</p>}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">The full loop runs on the Jobs engine: apply → pick (reward escrowed) → deliver → the project approves → escrow releases + reputation is earned.</p>
          </Panel>
        </OrbPanel>
      </div>
      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
