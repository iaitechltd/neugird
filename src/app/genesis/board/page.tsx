"use client";

/**
 * Fund board — reputation-gated funding with milestone escrow.
 * 3-panel: left = genesis stats + your reputation, center = propose + proposals
 * with funding + milestone actions, right = how-it-works.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconRocket, IconActivity, IconBolt, IconCheck, IconArrowRight , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import GenesisProposeWizard from "@/components/app/GenesisProposeWizard";
import { PanelChart, barStr } from "@/components/app/terminal";
import Meter from "@/components/app/Meter";
import { Waterfall, Bullet, Funnel, Marimekko } from "@/components/app/charts";
import type { Milestone, Proposal } from "@/lib/types";

type View = { proposal: Proposal; raised: number; backers: number; spawned_grid_slug: string | null; milestones: Milestone[]; i_backed: boolean; founder?: { username: string; reputation: number }; closes_at?: string; refunded?: number };

const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : null);
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

  const reload = useCallback(() => {
    // .then chain (not async/await) so setState sits inside a callback — the
    // react-hooks/set-state-in-effect rule accepts this, flags the await form.
    return fetch("/api/proposals").then((x) => x.json()).catch(() => null).then((r) => {
      if (r) { setViews(r.proposals ?? []); setMe(r.me ?? null); }
    });
  }, []);
  useEffect(() => { void reload(); const h = () => { void reload(); }; window.addEventListener("neugrid:refresh-me", h); return () => window.removeEventListener("neugrid:refresh-me", h); }, [reload]);

  const list = views ?? [];
  const open = list.filter((v) => v.proposal.status === "open");
  const totals = { open: open.length, raised: list.reduce((s, v) => s + v.raised, 0), ask: open.reduce((s, v) => s + v.proposal.ask_amount, 0) };
  const kpis: [string, number, string?][] = [
    ["Open Raises", totals.open],
    ["Asked", Math.round(totals.ask), "$"],
    ["Funded", Math.round(totals.raised), "$"],
    ["Backers", list.reduce((s, v) => s + v.backers, 0)],
    ["Funded Raises", list.filter((v) => v.proposal.status === "funded").length],
  ];

  // ---- side-rail chart data (REAL: raise amounts + milestone releases) ----
  const totalReleased = list.reduce((s, v) => s + v.milestones.filter((m) => m.status === "released").reduce((a, m) => a + (m.amount ?? 0), 0), 0);
  const escrow = Math.max(0, totals.raised - totalReleased);
  const waterfall = [{ value: totals.raised, kind: "total" as const }, { value: -totalReleased, kind: "delta" as const }, { value: escrow, kind: "total" as const }];
  const hasRaised = totals.raised > 0;
  const bullets = list.slice(0, 8).map((v) => ({ value: v.raised, target: v.proposal.ask_amount }));
  const fundedC = list.filter((v) => v.proposal.status === "funded").length;
  const deliveringC = list.filter((v) => v.proposal.status === "funded" && v.milestones.some((m) => m.status === "released")).length;
  const completeC = list.filter((v) => v.milestones.length > 0 && v.milestones.every((m) => m.status === "released")).length;
  const funnel = [
    { value: list.length, color: "#00ff00" },
    { value: fundedC, color: "#48f5ff" },
    { value: deliveringC, color: "#ffb020" },
    { value: completeC, color: "#7cf57c" },
  ];
  const mekko = list.slice(0, 8).map((v) => ({ weight: v.proposal.ask_amount || 1, fill: v.proposal.ask_amount ? v.raised / v.proposal.ask_amount : 0, color: v.proposal.status === "funded" ? "#00ff00" : "#48f5ff" }));
  const capMax = Math.max(1, totals.raised, totals.ask);

  async function act(url: string, body?: object, msg?: string) {
    if (busy) return; setBusy(true);
    try { const r = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(); if (msg) notify(msg); window.dispatchEvent(new Event("neugrid:refresh-me")); await reload(); }
    catch { notify("Something went wrong"); }
    setBusy(false);
  }

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Fund" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Genesis" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="GENESIS" icon={<IconRocket className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Rounds" v={totals.open} accent="neon" />
              <DataRow k="Total Raised" v={<span className="flex items-center gap-2"><Meter value={totals.raised} max={capMax} w={36} />{`$${Math.round(totals.raised).toLocaleString()}`}</span>} />
              <DataRow k="Open Ask" v={<span className="flex items-center gap-2"><Meter value={totals.ask} max={capMax} w={36} color="#48f5ff" />{`$${Math.round(totals.ask).toLocaleString()}`}</span>} />
            </div>
            {hasRaised ? (
              <PanelChart title="Capital · flow" read={`$${Math.round(totals.raised).toLocaleString()}`}>
                <div className="py-1"><Waterfall steps={waterfall} h={92} /></div>
                <div className="mt-1 flex justify-around text-[9px] text-ink-faint"><span className="text-neon">raised</span><span style={{ color: "#ff4d5e" }}>released</span><span className="text-neon">escrow</span></div>
              </PanelChart>
            ) : <p className="mt-3 text-[10px] text-ink-faint">No funding raised yet.</p>}

            {list.length ? (
              <PanelChart title="Progress · by raise" read={`${list.length} raises`}>
                <div className="py-1"><Bullet data={bullets} /></div>
              </PanelChart>
            ) : <p className="mt-3 text-[10px] text-ink-faint">No raises yet.</p>}

            <div className="ng-card mt-4 p-3">
              <div className="text-[11px] text-ink-dim">Your reputation</div>
              <div className="ng-stat__v !text-lg text-neon">{me?.reputation ?? 0}</div>
              <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px]">
                <span className="shrink-0 text-ink-faint">propose</span>
                <span className="text-neon">{barStr(Math.round(((me?.reputation ?? 0) / Math.max(1, me?.min ?? 100)) * 100), 14)}</span>
                <span className="ml-auto shrink-0 text-ink-faint tnum">{me?.reputation ?? 0}/{me?.min ?? 100}</span>
              </div>
              <div className="mt-1 text-[10px] text-ink-faint">{me?.can_propose ? "✓ Eligible to propose" : `Ship a build + earn ${me?.min ?? 100}+ rep to propose`}</div>
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Fund" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Reputation earns the right to raise. Funds release as milestones land.</p>
            </div>
            {me?.can_propose
              ? <button onClick={() => setCreating(true)} className="ng-btn ng-btn-primary shrink-0">+ Propose</button>
              : <Mark plain className="shrink-0 text-[11px]">Build with Echo + {me?.min ?? 100} rep unlocks raising</Mark>}
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

          {views === null &&<div className="space-y-3">{[0, 1].map((i) => <div key={i} className="ng-card h-44 animate-pulse opacity-40" />)}</div>}
          {views && list.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No proposals yet.</div></Panel>}

          <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
            {list.map((v) => {
              const p = v.proposal;
              const pct = Math.min(100, p.ask_amount ? Math.round((v.raised / p.ask_amount) * 100) : 0);
              const isAuthor = me?.id === p.author_id;
              // Capital strip (REAL $): with milestones each segment's width = its
              // amount, colored by status; before milestones exist it's raised vs
              // the remaining ask (faint track = capital not yet in).
              const strip = v.milestones.length
                ? v.milestones.map((m) => ({
                    weight: m.amount || 1,
                    fill: m.status === "pending" ? 0 : 1,
                    color: m.status === "released" || m.status === "approved" ? "#00ff00" : m.status === "rejected" ? "#ffb020" : "#48f5ff",
                  }))
                : [
                    { weight: v.raised, fill: 1, color: "#00ff00" },
                    { weight: Math.max(0, p.ask_amount - v.raised), fill: 0, color: "#00ff00" },
                  ];
              return (
                <div key={p.proposal_id} className="ng-card mb-3 break-inside-avoid p-4">
                  {/* identity — title + ONE status chip (rep lives in the tooltip) */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/genesis/${p.proposal_id}`} className="text-base font-bold text-neon transition hover:text-glow">{p.title}</Link>
                      <div className="mt-0.5 truncate text-[10px] text-ink-faint" title={v.founder ? `rep ${v.founder.reputation}` : undefined}>{p.category} · by <span className="text-ink-dim">{isAuthor ? "you" : v.founder?.username ?? p.author_id}</span></div>
                    </div>
                    <Mark plain accent={p.status === "funded" ? "neon" : "cyan"} className="!text-[10px] shrink-0">{p.status}</Mark>
                  </div>
                  {p.summary && <p className="mt-2 truncate text-[11px] text-ink-dim" title={p.summary}>{p.summary}</p>}

                  {/* hero — raised headline + the capital strip (segment width = REAL $) */}
                  <div className="ng-stat__v mt-3 !text-2xl text-neon tnum">${v.raised.toLocaleString()}</div>
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>Raised</span><span>{pct}% of ${p.ask_amount.toLocaleString()}</span></div>
                  <div className="mt-1.5">
                    <Marimekko data={strip} h={20} gap={2} />
                    <div className="mt-1 text-right text-[9px] text-ink-faint">{v.milestones.length ? <span><span className="text-neon">released</span> · <span className="text-cyan">review</span> · faint locked</span> : <span><span className="text-neon">raised</span> · faint ask</span>}</div>
                  </div>

                  {/* the record */}
                  <div className="mt-3 divide-y divide-line text-[11px]">
                    <div className="ng-row !py-1"><span className="ng-row__k">Backers</span><span className="ng-row__v font-normal text-ink-dim tnum">{v.backers}</span></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Ask</span><span className="ng-row__v font-normal text-ink-dim tnum">${p.ask_amount.toLocaleString()} USDC</span></div>
                    {p.status === "open" && daysLeft(v.closes_at) != null && <div className="ng-row !py-1"><span className="ng-row__k">Closes</span><span className="ng-row__v font-normal text-amber tnum">{daysLeft(v.closes_at)}d</span></div>}
                    {p.status === "expired" && <div className="ng-row !py-1"><span className="ng-row__k">Refunded</span><span className="ng-row__v font-normal text-amber tnum">${Math.round(v.refunded ?? 0).toLocaleString()}</span></div>}
                    {p.status === "funded" && <div className="ng-row !py-1"><span className="ng-row__k">Milestones</span><span className="ng-row__v font-normal text-ink-dim tnum">{v.milestones.filter((m) => m.status === "released").length}/{v.milestones.length} released</span></div>}
                  </div>

                  {/* footer — the action */}
                  {p.status === "open" && !isAuthor && (
                    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const a = Number(fd.get("amt") ?? 0); if (a > 0) act(`/api/proposals/${p.proposal_id}/fund`, { amount: a }, "Backed"); }} className="mt-3 flex gap-2 border-t border-line pt-3">
                      <input name="amt" type="number" placeholder="Amount" className="ng-input !py-1.5 text-xs" />
                      <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50"><IconBolt className="h-3.5 w-3.5" /> Back</button>
                    </form>
                  )}
                  {p.status === "open" && isAuthor && <div className="mt-3 border-t border-line pt-2.5 text-[10px] text-ink-faint">Your raise — share it to attract backers.</div>}

                  {p.status === "funded" && (
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="ng-label !text-ink-dim">Milestones</span>
                        {v.spawned_grid_slug && <Link href={`/grid/${v.spawned_grid_slug}`} className="flex items-center gap-1 text-[11px] text-neon transition hover:text-glow">project Grid <IconArrowRight className="h-3 w-3" /></Link>}
                      </div>
                      <div className="space-y-1.5">
                        {v.milestones.map((m) => (
                          <div key={m.milestone_id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="min-w-0 truncate text-ink" title={`${m.title} · $${m.amount}`}>{m.title}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Meter value={m.amount ?? 0} max={Math.max(1, ...v.milestones.map((x) => x.amount ?? 0))} w={28} color={m.status === "released" || m.status === "approved" ? "#00ff00" : m.status === "rejected" ? "#ffb020" : "#48f5ff"} />
                              <span className="tnum text-[10px] text-ink-faint">${m.amount}</span>
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
            {list.length ? (
              <PanelChart title="Raises · lifecycle funnel" read={`${list.length} raises`}>
                <div className="py-1"><Funnel data={funnel} h={100} /></div>
                <div className="mt-1 flex justify-between text-[9px] text-ink-faint"><span className="text-neon">all</span><span className="text-cyan">funded</span><span className="text-amber">building</span><span style={{ color: "#7cf57c" }}>done</span></div>
              </PanelChart>
            ) : <p className="text-[10px] text-ink-faint">No raises to chart yet.</p>}

            {list.length ? (
              <PanelChart title="Raises · ask × funded" read={`$${Math.round(totals.ask).toLocaleString()} ask`}>
                <div className="py-1"><Marimekko data={mekko} h={100} /></div>
              </PanelChart>
            ) : <p className="mt-3 text-[10px] text-ink-faint">No raises yet.</p>}

            <ol className="mt-4 space-y-2 text-[11px] text-ink-dim">
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
    </div>
  );
}
