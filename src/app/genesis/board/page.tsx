"use client";

/**
 * GenesisX board — reputation-gated funding with milestone escrow.
 * 3-panel: left = genesis stats + your reputation, center = propose + proposals
 * with funding + milestone actions, right = how-it-works.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, ProgressBar, IconRocket, IconActivity, IconBolt, IconCheck, IconArrowRight } from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import GenesisProposeWizard from "@/components/app/GenesisProposeWizard";
import type { Milestone, Proposal } from "@/lib/types";

type View = { proposal: Proposal; raised: number; backers: number; spawned_grid_slug: string | null; milestones: Milestone[]; i_backed: boolean };
type Me = { id: string; reputation: number; can_propose: boolean; min: number };
const M_ACCENT: Record<string, "neon" | "cyan" | "amber"> = { pending: "amber", submitted: "cyan", released: "neon", rejected: "amber", approving: "cyan", approved: "neon" };

export default function GenesisBoard() {
  const [views, setViews] = useState<View[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const reload = useCallback(async () => {
    const r = await fetch("/api/proposals").then((x) => x.json()).catch(() => null);
    if (r) { setViews(r.proposals ?? []); setMe(r.me ?? null); }
  }, []);
  useEffect(() => { reload(); const h = () => reload(); window.addEventListener("neugrid:refresh-me", h); return () => window.removeEventListener("neugrid:refresh-me", h); }, [reload]);

  const list = views ?? [];
  const open = list.filter((v) => v.proposal.status === "open");
  const totals = { open: open.length, raised: list.reduce((s, v) => s + v.raised, 0), ask: open.reduce((s, v) => s + v.proposal.ask_amount, 0) };

  async function act(url: string, body?: object, msg?: string) {
    if (busy) return; setBusy(true);
    try { const r = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(); if (msg) notify(msg); window.dispatchEvent(new Event("neugrid:refresh-me")); await reload(); }
    catch { notify("Something went wrong"); }
    setBusy(false);
  }

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="GenesisX" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Genesis" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="GENESIS" icon={<IconRocket className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Rounds" v={totals.open} accent="neon" />
              <DataRow k="Total Raised" v={`${totals.raised}`} />
              <DataRow k="Open Ask" v={`${totals.ask}`} />
            </div>
            <div className="ng-card mt-4 p-3">
              <div className="text-[11px] text-ink-dim">Your reputation</div>
              <div className="ng-stat__v !text-xl text-neon">{me?.reputation ?? 0}</div>
              <div className="mt-1 text-[10px] text-ink-faint">{me?.can_propose ? "✓ Eligible to propose" : `Earn ${me?.min ?? 100}+ to propose`}</div>
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="GenesisX" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Reputation earns the right to raise. Funds release as milestones land.</p>
            </div>
            {me?.can_propose
              ? <button onClick={() => setCreating(true)} className="ng-btn ng-btn-primary shrink-0">+ Propose</button>
              : <Mark plain className="shrink-0 text-[11px]">Earn {me?.min ?? 100}+ rep to propose</Mark>}
          </div>

          {views === null &&<div className="space-y-3">{[0, 1].map((i) => <div key={i} className="ng-card h-44 animate-pulse opacity-40" />)}</div>}
          {views && list.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No proposals yet.</div></Panel>}

          <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
            {list.map((v) => {
              const p = v.proposal;
              const pct = Math.min(100, p.ask_amount ? Math.round((v.raised / p.ask_amount) * 100) : 0);
              const isAuthor = me?.id === p.author_id;
              return (
                <div key={p.proposal_id} className="ng-card mb-3 break-inside-avoid p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/genesis/${p.proposal_id}`} className="text-base font-bold text-neon transition hover:text-glow">{p.title}</Link>
                      <div className="mt-0.5 text-[10px] text-ink-faint">{p.category} · by {isAuthor ? "you" : p.author_id}</div>
                    </div>
                    <Mark plain accent={p.status === "funded" ? "neon" : "cyan"} className="!text-[10px] shrink-0">{p.status}</Mark>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{p.summary}</p>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-ink-dim"><span>{v.raised} / {p.ask_amount} Pulse</span><span>{v.backers} backers · {pct}%</span></div>
                    <ProgressBar percent={pct} />
                  </div>

                  {p.status === "open" && !isAuthor && (
                    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const a = Number(fd.get("amt") ?? 0); if (a > 0) act(`/api/proposals/${p.proposal_id}/fund`, { amount: a }, "Backed"); }} className="mt-3 flex gap-2 border-t border-line pt-3">
                      <input name="amt" type="number" placeholder="Amount" className="ng-input !py-1.5 text-xs" />
                      <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50"><IconBolt className="h-3.5 w-3.5" /> Back</button>
                    </form>
                  )}
                  {p.status === "open" && isAuthor && <div className="mt-3 border-t border-line pt-3 text-[11px] text-ink-faint">Your raise is open — share it to attract backers.</div>}

                  {p.status === "funded" && (
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="ng-label !text-ink-dim">Milestones</span>
                        {v.spawned_grid_slug && <Link href={`/grid/${v.spawned_grid_slug}`} className="flex items-center gap-1 text-[11px] text-neon transition hover:text-glow">project Grid <IconArrowRight className="h-3 w-3" /></Link>}
                      </div>
                      <div className="space-y-1.5">
                        {v.milestones.map((m) => (
                          <div key={m.milestone_id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate text-ink-dim"><span className="text-ink">{m.title}</span> · {m.amount}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Mark plain accent={M_ACCENT[m.status] ?? "amber"} className="!text-[9px]">{m.status}</Mark>
                              {isAuthor && (m.status === "pending" || m.status === "rejected") && <button disabled={busy} onClick={() => act(`/api/milestones/${m.milestone_id}/submit`, {}, "Submitted for approval")} className="ng-btn ng-btn--sm disabled:opacity-50">Submit</button>}
                              {v.i_backed && m.status === "submitted" && <button disabled={busy} onClick={() => act(`/api/milestones/${m.milestone_id}/approve`, {}, "Approved")} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">Approve</button>}
                              {m.status === "released" && <IconCheck className="h-3.5 w-3.5 text-neon" />}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="How it works" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="HOW IT WORKS" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <ol className="space-y-2 text-[11px] text-ink-dim">
              {["Earn reputation through verified work", "Propose with your MVP + track record", "Backers fund — money locks in escrow", "A project Grid spawns to build in", "Deliver milestones → backers release funds"].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-neon/15 text-[9px] text-neon">{i + 1}</span>{s}</li>
              ))}
            </ol>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Funding decided by a verifiable track record — not connections. <Tag className="!text-[9px]">anti-VC</Tag></p>
          </Panel>
        </OrbPanel>
      </div>
      {creating && me?.can_propose && (
        <GenesisProposeWizard
          me={me}
          onClose={() => setCreating(false)}
          onDone={(t) => { setCreating(false); notify(`Proposal "${t}" opened`); window.dispatchEvent(new Event("neugrid:refresh-me")); reload(); }}
        />
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
      <NeuGridDock />
    </div>
  );
}
