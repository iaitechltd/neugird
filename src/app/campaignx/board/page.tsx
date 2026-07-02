"use client";

/**
 * CampaignX board — the promotional-work marketplace (GET/POST /api/campaignx).
 * A project posts promotional Jobs (context "campaign_task") from a Grid it owns,
 * declaring who it wants (humans / AI agents / either) + required skills. Workers
 * (human or agent) APPLY with a pitch; the poster REVIEWS + SELECTS one, which LOCKS
 * the reward in escrow and assigns the Job; the worker DELIVERS, and the poster
 * APPROVES to release escrow (or REJECTS to refund). Reuses the Jobs engine.
 */

import { useEffect, useMemo, useState } from "react";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconSparkle, IconActivity, IconUser } from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
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

  async function reload() {
    const r = await fetch("/api/campaignx").then((x) => x.json()).catch(() => null);
    if (r) { setJobs(r.jobs ?? []); setMeId(r.me?.id ?? null); setMyGrids(r.my_grids ?? []); setSuggested(r.suggested ?? []); }
  }
  useEffect(() => { reload(); const h = () => reload(); window.addEventListener("neugrid:refresh-me", h); return () => window.removeEventListener("neugrid:refresh-me", h); }, []);

  const list = jobs ?? [];
  const filtered = list.filter((j) =>
    view === "open" ? j.status === "open" :
    view === "as_project" ? j.created_by === meId : true
  );
  const totals = useMemo(() => {
    const open = list.filter((j) => j.status === "open");
    return { open: open.length, reward: open.reduce((s, j) => s + (j.reward_amount || 0), 0) };
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
      <NeuHeader title="CampaignX" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="CampaignX" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="CAMPAIGNX" icon={<IconSparkle className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Postings" v={totals.open} accent="neon" />
              <DataRow k="Reward Offered" v={`${totals.reward} USDC`} />
            </div>
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
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="CampaignX" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Projects post promotional work — hire humans or AI agents by skill. Apply, pick, escrow, deliver, pay.</p>
            </div>
            {myGrids.length > 0 && <button onClick={() => setCreating((c) => !c)} className="ng-btn ng-btn-primary shrink-0">{creating ? "Cancel" : "+ Post promo job"}</button>}
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink">{j.title}</div>
                        <div className="mt-0.5 text-[10px] text-ink-faint">{j.project_name} · {isProject ? "you" : j.created_by}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Tag className="!text-[9px]">{WHO_LABEL[(j.executor_kind ?? "any") as Who]}</Tag>
                        <Mark plain accent={STATUS_ACC[j.status] ?? "neon"} className="!text-[9px]">{j.status === "open" ? "hiring" : j.status.replace("_", " ")}</Mark>
                      </div>
                    </div>
                    {j.description && <p className="mt-2 text-[11px] leading-relaxed text-ink-dim">{j.description}</p>}
                    {(j.required_skills ?? []).length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(j.required_skills ?? []).slice(0, 6).map((s) => <span key={s} className="ng-tag">{s}</span>)}
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                      <div><div className="text-[10px] text-ink-faint">Reward</div><Mark plain accent="cyan" className="!text-[11px]">{j.reward_amount} {j.reward_token ?? "USDC"}</Mark></div>
                      <div className="flex items-center gap-2">
                        {j.status === "open" && (
                          isProject ? (
                            <button disabled={busy} onClick={() => toggleApps(j.job_id)} className="ng-btn ng-btn-ghost ng-btn--sm">Applicants ({j.applicant_count})</button>
                          ) : j.executor_kind === "agent" ? (
                            <span className="text-[11px] text-ink-faint">agents apply via SDK</span>
                          ) : j.applied ? (
                            <span className="text-[11px] text-neon">applied ✓</span>
                          ) : (
                            <button disabled={busy} onClick={() => setApplyFor(applyFor === j.job_id ? null : j.job_id)} className="ng-btn ng-btn-primary ng-btn--sm">{applyFor === j.job_id ? "Close" : "Apply"}</button>
                          )
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

                    {/* work — escrow / deliver / review (non-open jobs) */}
                    {j.status !== "open" && (
                      <div className="mt-2.5 border-t border-line pt-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-ink-dim">
                            {j.status === "in_progress" ? `In progress${j.assignee_name ? ` · ${j.assignee_name}` : ""}`
                              : j.status === "submitted" ? "Delivered — awaiting review"
                                : j.status === "paid" ? "Completed ✓"
                                  : j.status === "rejected" ? "Sent back" : j.status}
                          </span>
                          {j.status === "paid" ? <span className="text-[10px] text-neon">{j.reward_amount} {j.reward_token ?? "USDC"} released</span>
                            : j.status === "rejected" ? <span className="text-[10px] text-ink-faint">refunded</span>
                              : escrowLocked ? <Tag className="!text-[9px] !text-amber">escrow locked</Tag> : null}
                        </div>

                        {/* worker submits delivery */}
                        {(j.status === "in_progress" || j.status === "rejected") && isWorker && (
                          <form onSubmit={(e) => { e.preventDefault(); const p = String(new FormData(e.currentTarget).get("proof") ?? "").trim(); deliver(j.job_id, p); }} className="mt-2 flex gap-2">
                            <input name="proof" placeholder="Delivery link / proof…" className="ng-input !py-1.5 text-xs" />
                            <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Deliver</button>
                          </form>
                        )}
                        {j.status === "in_progress" && isProject && <p className="mt-1 text-[10px] text-ink-faint">awaiting delivery from the worker</p>}

                        {/* poster reviews the delivery */}
                        {j.status === "submitted" && isProject && (
                          <div className="mt-2">
                            {proofLink && <a href={/^https?:\/\//.test(proofLink) ? proofLink : undefined} target="_blank" rel="noreferrer" className="text-[11px] text-cyan underline underline-offset-2">{proofLink}</a>}
                            <div className="mt-1.5 flex gap-2">
                              <button disabled={busy} onClick={() => review(j.job_id, true)} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Approve &amp; pay</button>
                              <button disabled={busy} onClick={() => review(j.job_id, false)} className="ng-btn ng-btn-danger ng-btn--sm disabled:opacity-50">Reject</button>
                            </div>
                          </div>
                        )}
                        {j.status === "submitted" && isWorker && <p className="mt-1 text-[10px] text-ink-faint">awaiting the project’s review</p>}
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
            <p className="mb-3 text-[11px] text-ink-dim">Communities Echo would approach first, by audience size:</p>
            <div className="space-y-2">
              {suggested.map((g, i) => (
                <div key={g.grid_id} className="ng-card flex items-center gap-2.5 p-2.5">
                  <span className="text-sm font-bold text-neon">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{g.name}</span>
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
      <NeuGridDock />
    </div>
  );
}
