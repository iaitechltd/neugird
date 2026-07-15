"use client";

/**
 * Fund proposal detail — one fundable raise, in full.
 * 3-panel: left = proposal summary + fund/share action, center = funding
 * progress + proof-of-build MVP + milestone roadmap, right = backers + spawned
 * Grid + trust. Reads /api/proposals/[id]; funds + drives milestones live.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import {
  Mark, Tag, Bracket, ProgressBar,
  IconRocket, IconBolt, IconCheck, IconArrowRight, IconShield, IconActivity, IconNetwork, IconUser, IconLayers,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { PanelChart } from "@/components/app/terminal";
import { Area, Donut, Dumbbell, Funnel, Waterfall, StepArea } from "@/components/app/charts";
import type { Milestone, Proposal } from "@/lib/types";

type Backer = { backer_id: string; name?: string; amount: number; created_at: string };
type Founder = { id: string; username: string; reputation: number; credentials: number; builds: number; jobs_done: number; skills: string[] };
type BuildInfo = { build_id: string; title: string; stack: string[]; version: number; files: number; has_preview: boolean; deployed_slug: string | null; product_id: string | null; proof: string | null };
type TeamRow = { subgrid_id: string; name: string; purpose: string; members: { id: string; name: string }[]; agents: { id: string; name: string }[] };
type View = {
  proposal: Proposal;
  raised: number;
  backers: number;
  spawned_grid_id: string | null;
  spawned_grid_slug: string | null;
  milestones: (Milestone & { my_vote?: "for" | "against" | null })[];
  i_backed: boolean;
  is_author: boolean;
  backer_list: Backer[];
  me: { id: string; reputation: number; can_propose: boolean; min: number; usdc?: number };
  founder?: Founder;
  build?: BuildInfo | null;
  origin_grid?: { grid_id: string; slug: string; name: string; members: number } | null;
  team?: TeamRow[];
  closes_at?: string;
  refunded?: number;
  stall?: { stalled: boolean; last_activity: string; deadline: string; auto_at: string; remaining: number } | null;
  backer_token_share_bps?: number;
};

const daysLeft = (iso?: string) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000)) : null);

const M_ACCENT: Record<string, "neon" | "cyan" | "amber"> = { pending: "amber", submitted: "cyan", released: "neon", rejected: "amber" };

const fmtUsd = (v: number) => (v >= 1000 ? `$${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : `$${Math.round(v).toLocaleString()}`);
// top-4 backers + "rest" — phosphor rotation, no cyan (cyan = the money-in curve on this rail)
const DONUT_COLORS = ["#00ff00", "#7cf57c", "#ffb020", "#ff4d5e", "rgba(0,255,0,0.3)"];

/** Hoisted (stable identity) so a parent re-render can't remount it and wipe a half-typed amount. */
function FundForm({ busy, balance, shareBps, onSubmit }: { busy: boolean; balance?: number; shareBps?: number; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input name="amt" type="number" min={1} placeholder="Amount (USDC)" className="ng-input !py-1.5 text-sm" />
        <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50"><IconBolt className="h-3.5 w-3.5" /> Back this project</button>
      </form>
      <div className="mt-1 flex items-center justify-between text-[10px] text-ink-faint">
        <span>USDC leaves your wallet into milestone escrow</span>
        {balance != null && <span>bal ${balance.toLocaleString()}</span>}
      </div>
      {(shareBps ?? 0) > 0 && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-cyan/80">Backers share <span className="font-semibold text-cyan">{(shareBps ?? 0) / 100}% of the project token</span> at Alpha launch — pro-rata to your backing, vested. Back the raise, own the earliest position.</p>
      )}
    </div>
  );
}

export default function ProposalDetail() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2600); };

  const reload = useCallback(async () => {
    if (!id) return;
    const d = await fetch(`/api/proposals/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setView(d?.proposal ? d : null);
    setLoaded(true);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/proposals/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) { setView(d?.proposal ? d : null); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [id]);

  async function act(url: string, body: object | undefined, msg: string): Promise<boolean> {
    if (busy) return false; setBusy(true);
    try {
      const r = await fetch(url, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        notify(d?.error === "insufficient_usdc" ? "Not enough USDC in your wallet" : d?.error === "self_backing" ? "You can't back your own raise" : "Something went wrong");
        setBusy(false);
        return false;
      }
      notify(d?.spawned_grid_id ? "Fully funded — project Grid spawned ✓" : d?.minted?.length ? `${msg} · soulbound credential minted` : msg);
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      await reload();
    } catch { notify("Something went wrong"); setBusy(false); return false; }
    setBusy(false);
    return true;
  }

  async function fund(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const amt = Number(new FormData(form).get("amt") ?? 0);
    if (!(amt > 0)) { notify("Enter an amount to back"); return; }
    const ok = await act(`/api/proposals/${id}/fund`, { amount: amt }, "Backed ✓");
    if (ok) form.reset();
  }

  const backBar = (
    <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/genesis/board" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to Fund</Link></div>
  );

  // loading / not-found — clean states
  if (!loaded || !view) {
    return (
      <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
        <NeuHeader />
        {backBar}
        <div className="grid flex-1 place-items-center px-4 py-16 text-center">
          {!loaded ? (
            <div className="text-sm text-ink-dim"><IconRocket className="mx-auto mb-3 h-9 w-9 animate-pulse text-neon/60" />Loading proposal…</div>
          ) : (
            <div>
              <IconRocket className="mx-auto h-10 w-10 text-neon/50" />
              <div className="mt-3 text-sm text-ink">Proposal not found.</div>
              <p className="mt-1 text-[11px] text-ink-dim">It may have been withdrawn, or never existed.</p>
              <Link href="/genesis/board" className="ng-btn ng-btn-primary ng-btn--sm mt-4">Browse Fund</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const p = view.proposal;
  const mvp = p.mvp_ref;
  const pct = Math.min(100, p.ask_amount ? Math.round((view.raised / p.ask_amount) * 100) : 0);
  const remaining = Math.max(0, p.ask_amount - view.raised);
  const isOpen = p.status === "open";
  const released = view.milestones.filter((m) => m.status === "released").reduce((s, m) => s + m.amount, 0);

  // rail-chart data — all real, from this page's own payload
  const backingsAsc = [...view.backer_list].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  // cumulative escrowed USDC, starting at the honest $0 the raise opened on
  const fundCurve = backingsAsc.length ? backingsAsc.reduce<number[]>((acc, b) => [...acc, acc[acc.length - 1] + b.amount], [0]) : [];
  const byBacker = Object.values(
    backingsAsc.reduce<Record<string, { name: string; amount: number }>>((m, b) => ({
      ...m,
      [b.backer_id]: { name: b.backer_id === view.me.id ? "you" : b.name ?? b.backer_id, amount: (m[b.backer_id]?.amount ?? 0) + b.amount },
    }), {}),
  ).sort((a, b) => b.amount - a.amount);
  const restAmt = byBacker.slice(4).reduce((s, b) => s + b.amount, 0);
  const donutSlices = [
    ...byBacker.slice(0, 4).map((b) => ({ label: b.name, amount: b.amount })),
    ...(restAmt > 0 ? [{ label: `rest (${byBacker.length - 4})`, amount: restAmt }] : []),
  ];
  const msRows = view.milestones.map((m) => ({ a: m.amount, b: m.status === "released" ? m.amount : 0, label: m.title }));
  const releasedCount = view.milestones.filter((m) => m.status === "released").length;
  const funnelStages = [
    { label: "ask", value: p.ask_amount, color: "#7cf57c" },
    { label: "backed", value: view.raised, color: "#48f5ff" },
    { label: "released", value: released, color: "#00ff00" },
  ];
  // backings bucketed by real day, oldest → now — the center timeline
  const flowDays: { key: string; amt: number; n: number }[] = (() => {
    if (!backingsAsc.length) return [];
    const m = new Map<string, { amt: number; n: number }>();
    for (const b of backingsAsc) {
      const key = new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const cur = m.get(key) ?? { amt: 0, n: 0 };
      m.set(key, { amt: cur.amt + b.amount, n: cur.n + 1 });
    }
    return [...m.entries()].slice(-14).map(([key, v]) => ({ key, ...v }));
  })();

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Fund" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      {backBar}

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Proposal" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-panel p-4">
            <div className="flex items-center gap-3">
              <MatrixAvatar seed={p.proposal_id} size={44} shape="square" />
              <div className="min-w-0"><div className="truncate text-xs font-bold text-neon">{p.title}</div><div className="text-[10px] text-ink-dim">{p.category} · by {view.is_author ? "you" : view.founder?.username ?? p.author_id}</div></div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Mark plain accent={p.status === "funded" ? "neon" : "cyan"} className="!text-[10px]">{p.status}</Mark>
              {mvp && <Mark plain accent="cyan" className="!text-[10px]"><IconBolt className="h-3 w-3" />Echo MVP</Mark>}
            </div>
          </div>

          <PanelChart title="FUNDING · CUMULATIVE" read={`${fmtUsd(view.raised)} of ${fmtUsd(p.ask_amount)} ask`}>
            {fundCurve.length >= 2 ? (
              <div>
                <Area data={fundCurve} gid={`genfund-${p.proposal_id}`} color="#48f5ff" w={260} h={52} />
                <div className="mt-1 flex items-center justify-between text-[9px] text-ink-faint">
                  <span>{view.backers} backer{view.backers === 1 ? "" : "s"}</span>
                  <span>{remaining > 0 ? `${fmtUsd(remaining)} to go` : "fully backed"}</span>
                </div>
              </div>
            ) : <p className="text-[10px] text-ink-faint">No backings yet — the curve draws with the first one.</p>}
          </PanelChart>

          <PanelChart title="BACKERS · COMPOSITION" read={`${view.backers} backer${view.backers === 1 ? "" : "s"}`}>
            {donutSlices.length > 0 ? (
              <div className="flex items-center gap-3">
                <Donut data={donutSlices.map((s) => s.amount)} size={92} thickness={12} colors={DONUT_COLORS} />
                <div className="min-w-0 space-y-1 text-[9.5px] text-ink-dim">
                  {donutSlices.map((s, i) => (
                    <div key={`${s.label}-${i}`} className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="truncate" title={s.label}>{s.label}</span>
                      <span className="shrink-0 text-neon tnum">{fmtUsd(s.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-[10px] text-ink-faint">No backers yet{isOpen && !view.is_author ? " — be the first" : ""}.</p>}
          </PanelChart>

          {/* FOUNDER — who is asking, verifiable (the anti-pitch-deck) */}
          {view.founder && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconUser className="h-4 w-4" /></span>Founder</div>
              <Link href={`/talent/${view.founder.id}`} className="flex items-center gap-2.5 transition hover:opacity-90">
                <MatrixAvatar seed={view.founder.username} size={36} shape="circle" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-neon">{view.founder.username}{view.is_author && <span className="ml-1 text-[10px] text-ink-faint">(you)</span>}</div>
                  <div className="text-[10px] text-ink-dim">rep <span className="text-neon tnum">{view.founder.reputation}</span> · {view.founder.credentials} credentials</div>
                </div>
              </Link>
              <div className="mt-2.5 divide-y divide-line text-[11px]">
                <div className="ng-row !py-1"><span className="ng-row__k">Proof-of-builds</span><Mark plain className="!text-[11px]">{view.founder.builds}</Mark></div>
                <div className="ng-row !py-1"><span className="ng-row__k">Jobs delivered</span><Mark plain className="!text-[11px]">{view.founder.jobs_done}</Mark></div>
              </div>
              <Link href={`/talent/${view.founder.id}`} className="mt-2 flex items-center gap-1 text-[11px] text-ink-dim transition hover:text-neon">Verify the full track record <IconArrowRight className="h-3 w-3" /></Link>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-4 w-4" /></span>Action</div>
            {isOpen && !view.is_author && <FundForm busy={busy} balance={view.me.usdc} shareBps={view.backer_token_share_bps} onSubmit={fund} />}
            {isOpen && view.is_author && <p className="text-[11px] text-ink-dim">Your raise is open — share it to attract backers. (You can&rsquo;t back your own raise — self-funding is blocked.)</p>}
            {!isOpen && view.spawned_grid_slug && <Link href={`/grid/${view.spawned_grid_slug}`} className="ng-btn ng-btn-primary ng-btn--block"><IconNetwork className="h-3.5 w-3.5" /> Open Project Grid</Link>}
            {!isOpen && !view.spawned_grid_slug && <p className="text-[11px] text-ink-dim">This raise is {p.status}.</p>}
          </div>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-6 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-start gap-4">
              <MatrixAvatar seed={p.proposal_id} size={56} shape="square" className="shrink-0" />
              <div className="min-w-0">
                <div className="ng-title text-3xl font-bold text-neon text-glow"><Decrypt text={p.title} /></div>
                <p className="mt-1 text-sm text-ink-dim">{p.summary}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-dim">
              <span>Category: <span className="text-ink">{p.category}</span></span>
              <span>By: <Link href={`/talent/${p.author_id}`} className="text-neon transition hover:text-glow">{view.is_author ? "you" : view.founder?.username ?? p.author_id}</Link>{view.founder ? <span className="text-ink-faint"> · rep {view.founder.reputation}</span> : null}</span>
              <span>Opened: <Mark plain>{new Date(p.created_at).toLocaleDateString()}</Mark></span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
              <Mark accent={p.status === "funded" ? "neon" : "cyan"}>{p.status}</Mark>
              {mvp && <Mark accent="cyan"><IconBolt className="h-3 w-3" />Echo-built MVP</Mark>}
              {p.track_record_ref && <Mark accent="neon"><IconShield className="h-3 w-3" />Track record attached</Mark>}
            </div>

            {/* funding progress — the headline */}
            <div className="mt-5">
              <div className="mb-1.5 flex items-end justify-between">
                <div><span className="ng-stat__v !text-2xl text-neon text-glow tnum">${view.raised.toLocaleString()}</span><span className="text-sm text-ink-dim"> / ${p.ask_amount.toLocaleString()} USDC</span></div>
                <div className="text-right text-[11px] text-ink-dim">{view.backers} backers · {pct}%{isOpen && daysLeft(view.closes_at) != null && <span className="text-amber"> · closes in {daysLeft(view.closes_at)}d</span>}</div>
              </div>
              <ProgressBar percent={pct} />
              {isOpen && !view.is_author && <div className="mt-3 max-w-sm"><FundForm busy={busy} balance={view.me.usdc} shareBps={view.backer_token_share_bps} onSubmit={fund} /></div>}
              {p.status === "funded" && <div className="mt-2 text-[11px] text-ink-faint">{released.toLocaleString()} released to the project via milestones.</div>}
              {p.status === "expired" && <div className="mt-2 rounded border border-amber/25 bg-amber/[0.06] px-2.5 py-1.5 text-[11px] text-amber">Raise window closed unfilled — ${Math.round(view.refunded ?? 0).toLocaleString()} in escrowed backings refunded to backers.</div>}
              {p.status === "refunded" && <div className="mt-2 rounded border border-danger/25 bg-danger/[0.06] px-2.5 py-1.5 text-[11px] text-danger">Kill-switch fired — the project stalled and the unreleased treasury was returned to backers pro-rata. The founder&rsquo;s reputation took the hit.</div>}

              {/* stall kill-switch — the backer's insurance on a funded project */}
              {view.stall && !view.stall.stalled && (
                <div className="mt-2 text-[10px] text-ink-faint">Milestone activity: last {new Date(view.stall.last_activity).toLocaleDateString()} · kill-switch arms {new Date(view.stall.deadline).toLocaleDateString()} if the project goes silent.</div>
              )}
              {view.stall?.stalled && (
                <div className="mt-2 rounded border border-danger/30 bg-danger/[0.07] p-2.5">
                  <div className="text-[11px] font-semibold text-danger">Project stalled — no milestone activity since {new Date(view.stall.last_activity).toLocaleDateString()}</div>
                  <div className="mt-0.5 text-[10px] text-ink-dim">${Math.round(view.stall.remaining).toLocaleString()} unreleased sits in escrow. Any backer can return it pro-rata now; it auto-returns {new Date(view.stall.auto_at).toLocaleDateString()}.</div>
                  {view.i_backed && <button disabled={busy} onClick={() => act(`/api/proposals/${id}/killswitch`, {}, "Treasury returned to backers")} className="ng-btn ng-btn-danger ng-btn--sm mt-2 disabled:opacity-50">Return remaining treasury</button>}
                </div>
              )}
            </div>
          </Bracket>

          {/* BACKING FLOW — every escrowed dollar, on the real day it landed */}
          {flowDays.length > 0 && (
            <div className="ng-card p-3.5">
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span className="ng-label !text-ink-dim">BACKING FLOW · BY DAY</span>
                <span className="text-ink-faint">{view.backer_list.length} backing{view.backer_list.length === 1 ? "" : "s"} · ${view.raised.toLocaleString()} of ${p.ask_amount.toLocaleString()} escrowed</span>
              </div>
              <StepArea data={flowDays.map((d) => d.amt)} gid={`flow-${p.proposal_id}`} color="var(--ng-cyan)" w={620} h={72} />
              <div className="mt-1 flex items-center justify-between text-[9px] text-ink-faint"><span className="tnum">{flowDays[0]?.key}</span><span>{flowDays.length} days · escrowed inflow</span><span className="tnum">{flowDays[flowDays.length - 1]?.key}</span></div>
            </div>
          )}

          {/* THE PRODUCT — try the actual software before you back it */}
          {view.build && (view.build.has_preview || view.build.deployed_slug) && (
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconRocket className="h-4 w-4" />Live demo — try it</div>
              <div className="ng-card overflow-hidden">
                {view.build.has_preview && (
                  <iframe
                    src={`/api/echo/builds/${view.build.build_id}/preview`}
                    sandbox="allow-scripts"
                    className="h-[380px] w-full border-b border-line bg-black/40"
                    title={`${view.build.title} — live demo`}
                  />
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[11px]">
                  <span className="text-ink-dim">{view.build.title} <span className="text-ink-faint">v{view.build.version} · {view.build.files} files</span></span>
                  <span className="flex flex-wrap gap-1.5">{view.build.stack.slice(0, 5).map((s) => <Tag key={s}>{s}</Tag>)}</span>
                  <span className="ml-auto flex items-center gap-3">
                    {view.build.deployed_slug && <a href={`/d/${view.build.deployed_slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-neon transition hover:text-glow"><IconRocket className="h-3 w-3" />Open live app</a>}
                    {view.build.product_id && <Link href={`/gridx/${view.build.product_id}`} className="flex items-center gap-1 text-cyan transition hover:opacity-80"><IconLayers className="h-3 w-3" />On GridX</Link>}
                  </span>
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-faint">Sandboxed render of the real MVP the founder sealed — the same files the proof hash covers.</p>
            </section>
          )}

          {/* proof-of-build MVP — real */}
          {mvp && (
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconShield className="h-4 w-4" />Proof-of-build MVP</div>
              <div className="ng-card p-3.5">
                <div className="divide-y divide-line text-[11px]">
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Attestation</span><span className="ng-row__v"><Mark plain>{view.build?.proof ?? mvp.proof_of_build}</Mark></span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Artifact</span><span className="ng-row__v">{mvp.artifact_id}</span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Kind</span><span className="ng-row__v">{mvp.kind}</span></div>
                  <div className="ng-row !py-1.5"><span className="ng-row__k">Built with Echo</span><span className="ng-row__v !text-neon">{mvp.built_with_echo ? "Yes" : "No"}</span></div>
                  {mvp.deploy_target && <div className="ng-row !py-1.5"><span className="ng-row__k">Deploy target</span><span className="ng-row__v">{mvp.deploy_target}</span></div>}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Funding is MVP-gated: backers fund working software with a sealed proof of build, not a pitch deck.</p>
              </div>
            </section>
          )}

          {/* roadmap / milestones — real, with actions when funded */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconLayers className="h-4 w-4" />{p.status === "funded" ? "Milestone escrow" : "Proposed roadmap"}</div>
            {p.status !== "funded" && p.roadmap.length > 0 && (
              <div className="ng-card mb-3 p-3">
                <div className="mb-1 flex items-center justify-between text-[10px]"><span className="ng-label !text-[10px] !text-ink-dim">Milestone tranches → ask</span><span className="text-ink-faint">{fmtUsd(p.roadmap.reduce((s, m) => s + m.amount, 0))} of {fmtUsd(p.ask_amount)}</span></div>
                <Waterfall steps={p.roadmap.map((m) => ({ value: m.amount, kind: "delta" as const }))} h={90} />
              </div>
            )}
            <div className="space-y-2">
              {p.status === "funded" && view.milestones.length > 0
                ? view.milestones.map((m, i) => (
                  <div key={m.milestone_id} className="ng-card p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-ink"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neon/15 text-[10px] text-neon">{i + 1}</span>{m.title}</div>
                        {m.description && <p className="mt-1 pl-7 text-[11px] text-ink-dim">{m.description}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-neon tnum">{m.amount.toLocaleString()}</div>
                        <Mark plain accent={M_ACCENT[m.status] ?? "amber"} className="!text-[9px]">{m.status}</Mark>
                      </div>
                    </div>
                    {m.status === "submitted" && (
                      <div className="mt-2.5 pl-7">
                        <div className="mb-1 flex items-center justify-between text-[10px] text-ink-faint"><span>Backer vote · weighted by stake + reputation</span><span>release at {Math.round((m.approval_vote?.quorum_bps ?? 5000) / 100)}%</span></div>
                        <div className="relative flex h-1.5 overflow-hidden rounded-full bg-line">
                          <span className="block h-full bg-neon" style={{ width: `${Math.min(100, (m.approval_vote?.for_bps ?? 0) / 100)}%` }} />
                          <span className="block h-full bg-danger" style={{ width: `${Math.min(100, (m.approval_vote?.against_bps ?? 0) / 100)}%` }} />
                          <span className="absolute inset-y-0 left-1/2 w-px bg-ink-faint/70" />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px]"><span className="text-neon">For {Math.round((m.approval_vote?.for_bps ?? 0) / 100)}%</span><span className="text-danger">Against {Math.round((m.approval_vote?.against_bps ?? 0) / 100)}%</span></div>
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-2 pl-7">
                      {view.is_author && (m.status === "pending" || m.status === "rejected") && <button disabled={busy} onClick={() => act(`/api/milestones/${m.milestone_id}/submit`, {}, "Submitted for approval")} className="ng-btn ng-btn--sm disabled:opacity-50">{m.status === "rejected" ? "Re-submit" : "Submit for approval"}</button>}
                      {m.status === "rejected" && <span className="mr-auto flex items-center gap-1 text-[11px] text-danger">Rejected by backers</span>}
                      {view.i_backed && m.status === "submitted" && (<>
                        <button disabled={busy} onClick={() => act(`/api/milestones/${m.milestone_id}/approve`, { support: true }, "Voted to release")} className={`ng-btn ng-btn--sm ng-btn-primary disabled:opacity-50 ${m.my_vote === "for" ? "!bg-neon !text-bg" : ""}`}><IconCheck className="h-3.5 w-3.5" /> {m.my_vote === "for" ? "Voted For" : "Approve"}</button>
                        <button disabled={busy} onClick={() => act(`/api/milestones/${m.milestone_id}/approve`, { support: false }, "Voted against")} className={`ng-btn ng-btn--sm ng-btn-danger disabled:opacity-50 ${m.my_vote === "against" ? "!bg-danger !text-bg" : ""}`}>{m.my_vote === "against" ? "Voted Against" : "Reject"}</button>
                      </>)}
                      {m.status === "released" && <span className="flex items-center gap-1 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" />Released by vote</span>}
                    </div>
                  </div>
                ))
                : p.roadmap.map((m, i) => (
                  <div key={i} className="ng-card flex items-start justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-ink"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neon/15 text-[10px] text-neon">{i + 1}</span>{m.title}</div>
                      {m.description && <p className="mt-1 pl-7 text-[11px] text-ink-dim">{m.description}</p>}
                      {m.est_duration_days ? <p className="pl-7 text-[10px] text-ink-faint">~{m.est_duration_days} days</p> : null}
                    </div>
                    <div className="shrink-0 text-sm font-bold text-neon tnum">{m.amount.toLocaleString()}</div>
                  </div>
                ))}
            </div>
            {p.status !== "funded" && <p className="mt-2 text-[10px] text-ink-faint">On a full raise, funds lock in an escrow treasury and release milestone by milestone as backers approve each delivery.</p>}
          </section>
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <PanelChart title="RAISE · PIPELINE" read={`${pct}% backed`}>
            {view.raised > 0 ? (
              <div>
                <Funnel data={funnelStages} w={260} h={54} gap={3} />
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-ink-dim">
                  {funnelStages.map((s) => (
                    <span key={s.label} className="flex items-center gap-1"><span className="inline-block h-2 w-2" style={{ background: s.color }} />{s.label} {fmtUsd(s.value)}</span>
                  ))}
                </div>
              </div>
            ) : <p className="text-[10px] text-ink-faint">Nothing in the pipeline yet — it draws on the first backing.</p>}
          </PanelChart>

          <PanelChart title="MILESTONES · ASK VS RELEASED" read={view.milestones.length ? `${releasedCount}/${view.milestones.length} released` : `${p.roadmap.length} planned`}>
            {msRows.length > 0 ? (
              <div>
                <Dumbbell data={msRows} w={260} rowH={13} gap={6} />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-ink-dim">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#ffb020" }} />asked</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#00ff00" }} />released</span>
                  <span className="ml-auto tnum text-ink-faint">{fmtUsd(released)} of {fmtUsd(p.ask_amount)}</span>
                </div>
              </div>
            ) : <p className="text-[10px] text-ink-faint">Milestones escrow on a full raise — asked vs released draws then.</p>}
          </PanelChart>

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 !text-ink-dim">Raise</div>
            <div className="divide-y divide-line text-[12px]">
              {([["Raised", view.raised.toLocaleString()], ["Target", p.ask_amount.toLocaleString()], ["Remaining", remaining.toLocaleString()], ["Backers", String(view.backers)]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="ng-row !py-2"><span className="ng-row__k">{k}</span><span className="ng-row__v !text-neon">{v}</span></div>
              ))}
            </div>
          </div>

          {p.onchain && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 !text-ink-dim">On-chain escrow vault</div>
              <p className="text-[10.5px] leading-relaxed text-ink-dim">This raise&#39;s escrow mirrors to a real Solana program — escrowed, released, and refunded amounts are publicly verifiable.</p>
              <a
                href={`https://explorer.solana.com/address/${p.onchain.vault}?cluster=${p.onchain.cluster}`}
                target="_blank" rel="noreferrer"
                className="mt-2 block truncate text-[11px] text-cyan hover:underline"
              >{p.onchain.vault}</a>
              <div className="mt-1 flex justify-between text-[10px] text-ink-faint"><span>milestone_vault · {p.onchain.cluster}</span><span>{p.onchain.txs?.length ?? 0} tx</span></div>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconUser className="h-4 w-4" /></span>Backers</div>
            {view.backer_list.length === 0
              ? <p className="text-[11px] text-ink-dim">No backers yet{isOpen && !view.is_author ? " — be the first." : "."}</p>
              : (
                <div className="space-y-2">
                  {(() => { const maxB = Math.max(1, ...view.backer_list.map((x) => x.amount)); return view.backer_list.map((b, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2"><MatrixAvatar seed={b.name ?? b.backer_id} size={20} shape="circle" /><span className="truncate text-[11px] text-ink-dim">{b.backer_id === view.me.id ? "you" : b.name ?? b.backer_id}</span></span>
                        <span className="shrink-0 text-[11px] text-neon tnum">${b.amount.toLocaleString()}</span>
                      </div>
                      <div className="ml-[28px] mt-1 h-1 overflow-hidden bg-neon/10"><span className="block h-full bg-neon/50" style={{ width: `${Math.max(3, (b.amount / maxB) * 100)}%` }} /></div>
                    </div>
                  )); })()}
                </div>
              )}
          </div>

          {(view.origin_grid || view.spawned_grid_slug) && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconNetwork className="h-4 w-4" /></span>Project Grid</div>
              {view.origin_grid ? (
                <Link href={`/grid/${view.origin_grid.slug}`} className="flex items-center justify-between text-[12px] text-ink transition hover:text-neon">
                  <span className="min-w-0 truncate">{view.origin_grid.name} <span className="text-ink-faint">· {view.origin_grid.members} members</span></span>
                  <IconArrowRight className="h-3 w-3 shrink-0 text-neon" />
                </Link>
              ) : (
                <Link href={`/grid/${view.spawned_grid_slug}`} className="flex items-center justify-between text-[12px] text-ink transition hover:text-neon">Spawned from this raise <IconArrowRight className="h-3 w-3 text-neon" /></Link>
              )}
              {view.spawned_grid_slug && view.origin_grid && view.origin_grid.slug !== view.spawned_grid_slug && (
                <Link href={`/grid/${view.spawned_grid_slug}`} className="mt-1.5 flex items-center justify-between text-[11px] text-ink-dim transition hover:text-neon">Spawned project Grid <IconArrowRight className="h-3 w-3 text-neon" /></Link>
              )}
            </div>
          )}

          {/* TEAM — the humans + agents actually building this */}
          {(view.team?.length ?? 0) > 0 && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconLayers className="h-4 w-4" /></span>Team &amp; Agents</div>
              <div className="space-y-3">
                {view.team!.map((t) => (
                  <div key={t.subgrid_id}>
                    <Link href={`/subgrid/${t.subgrid_id}`} className="flex items-center justify-between text-[12px] text-ink transition hover:text-neon">
                      <span className="truncate">{t.name}</span><IconArrowRight className="h-3 w-3 shrink-0 text-neon" />
                    </Link>
                    {t.purpose && <p className="mt-0.5 text-[10px] text-ink-faint">{t.purpose}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.members.map((m) => <span key={m.id} className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-dim"><MatrixAvatar seed={m.name} size={14} shape="circle" />{m.name}</span>)}
                      {t.agents.map((a) => <span key={a.id} className="flex items-center gap-1 rounded border border-cyan/25 px-1.5 py-0.5 text-[10px] text-cyan"><MatrixAvatar seed={a.id} size={14} shape="circle" />{a.name} · agent</span>)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[9.5px] leading-relaxed text-ink-faint">Hybrid human + agent teams — every member&rsquo;s work is verifiable on their profile.</p>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconActivity className="h-4 w-4" /></span>Why back this</div>
            <ul className="space-y-1.5 text-[11px] text-ink-dim">
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Funds lock in milestone escrow</li>
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />You vote to release each tranche</li>
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Backing winners grows your signal</li>
            </ul>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Funding decided by a verifiable track record — not connections. <Tag className="!text-[9px]">anti-VC</Tag></p>
          </div>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
