"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket, ProgressBar,
  IconChevronDown, IconCheck, IconBot, IconGrid, IconBolt, IconShield,
  IconRocket, IconCoins, IconUser, IconStar,
  kpiColor,
} from "@/components/app/ui";
import { Decrypt, CountUp } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import LivePreview from "@/components/app/LivePreview";
import PostCard, { type WirePost } from "@/components/app/PostCard";
import PostComposer from "@/components/app/PostComposer";
import ShareButton from "@/components/app/ShareButton";
import OrbPanel from "@/components/app/OrbPanel";
import { Area, Bars, Radar, LabeledBars, Ring, StepArea, Stream, RadialProgress } from "@/components/app/charts";
import { PanelChart, barStr } from "@/components/app/terminal";
import type { Agent, Build, Grid, Product } from "@/lib/types";

const Verified = () => <IconCheck className="h-3.5 w-3.5 shrink-0 text-neon" />;
const tierAccent = (t?: string): "neon" | "amber" | "danger" => (t === "trusted" ? "neon" : t === "suspended" ? "danger" : "amber");

function Section({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between gap-2 first:mt-1">
      <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon">{icon}</span>{children}</div>
      {action}
    </div>
  );
}

export default function MePage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2400); }

  const [me, setMe] = useState<{ demo?: boolean; username?: string; pulse?: number; reputation?: { total?: number; by_dimension?: Record<string, number> } | null; joined_grids?: string[]; skills?: string[]; balances?: { usdc: number; grid: number }; reward?: { accrued: number; sybil_adjusted: number; sybil_factor: number; claimed: number; rate: number; breakdown: { dimension: string; units: number; events: number }[]; vests_at_tge: boolean; tge?: { executed: boolean; at: string }; vesting?: { total: number; released: number; claimable: number; vested_pct: number; unlock_pct: number; cliff_days: number; duration_days: number; start_at: string } | null } | null; rep_events?: { action: string; weight: number; reason: string; at: string }[]; rep_series?: number[]; income?: { total: number; direct: number; agents_total: number; series: number[]; recent: { kind: string; amount: number; at: string }[] }; follows?: { followers: number; following: number } } | null>(null);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [myPosts, setMyPosts] = useState<WirePost[]>([]);
  const loadPosts = () => fetch("/api/feed?filter=mine").then((r) => r.json()).then((d) => setMyPosts((d.posts ?? []).slice(0, 6))).catch(() => {});
    const [gridM, setGridM] = useState<{ grid_reserve: number; usdc_reserve: number; price: number; liquidity_usd: number; balances: { usdc: number; grid: number }; pay_fees_in_grid?: boolean; fee_discount_bps?: number } | null>(null);
  const [gridSide, setGridSide] = useState<"buy" | "sell">("buy");
  const [gridAmt, setGridAmt] = useState("");
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => setBuilds(d.builds ?? [])).catch(() => {});
    fetch("/api/agents?mine=1").then((r) => r.json()).then((d) => setAgents(d.agents ?? [])).catch(() => {});
    fetch("/api/gridx").then((r) => r.json()).then((d) => setProducts(d.products ?? [])).catch(() => {});
    fetch("/api/grids").then((r) => r.json()).then((d) => setGrids(d.grids ?? d ?? [])).catch(() => {});
    fetch("/api/grid").then((r) => r.json()).then(setGridM).catch(() => {});
    fetch("/api/feed?filter=mine").then((r) => r.json()).then((d) => setMyPosts((d.posts ?? []).slice(0, 6))).catch(() => {});
  }, []);

  async function swapGrid() {
    const amt = Number(gridAmt);
    if (!(amt > 0)) return;
    try {
      const r = await fetch("/api/grid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ side: gridSide, amount: amt }) });
      const j = await r.json();
      if (!r.ok) { notify(j?.error === "insufficient_usdc" ? "Not enough USDC" : j?.error === "insufficient_grid" ? "Not enough GRID" : "Swap failed"); return; }
      setGridM(j.state); setGridAmt("");
      notify(`${gridSide === "buy" ? "Bought" : "Sold"} GRID`);
      fetch("/api/me").then((x) => x.json()).then(setMe).catch(() => {});
    } catch { notify("Swap failed"); }
  }
  async function toggleFeePref() {
    try {
      const r = await fetch("/api/grid/fee-pref", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: !gridM?.pay_fees_in_grid }) });
      const j = await r.json();
      if (j?.state) { setGridM(j.state); notify(j.state.pay_fees_in_grid ? "Now paying fees in GRID" : "Paying fees in USDC"); }
    } catch { notify("Could not update"); }
  }
  function gridQuote(): number {
    if (!gridM) return 0;
    const amt = Number(gridAmt);
    if (!(amt > 0)) return 0;
    const k = gridM.grid_reserve * gridM.usdc_reserve;
    if (gridSide === "buy") return gridM.grid_reserve - k / (gridM.usdc_reserve + amt * 0.99);
    return (gridM.usdc_reserve - k / (gridM.grid_reserve + amt)) * 0.99;
  }
  const refreshMe = () => fetch("/api/me").then((x) => x.json()).then(setMe).catch(() => {});
  async function runTGE() {
    try {
      const r = await fetch("/api/tge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }) });
      const j = await r.json();
      if (!r.ok) { notify("TGE failed"); return; }
      notify(`TGE executed · ${(j.converted ?? 0).toLocaleString()} GRID to ${j.recipients ?? 0} contributors`);
      refreshMe();
    } catch { notify("TGE failed"); }
  }
  async function claimGrid() {
    try {
      const r = await fetch("/api/tge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim" }) });
      const j = await r.json();
      if (!r.ok) { notify(j?.error === "nothing_claimable" ? "Nothing vested to claim yet" : "Claim failed"); return; }
      notify(`Claimed ${(j.claimed ?? 0).toLocaleString()} GRID`);
      refreshMe();
    } catch { notify("Claim failed"); }
  }

  const rep = Math.round(me?.reputation?.total ?? me?.pulse ?? 0);
  const repDims = me?.reputation?.by_dimension ?? {};
  const repMax = Math.max(1, ...Object.values(repDims));
  const joined = new Set(me?.joined_grids ?? []);
  const myGrids = grids.filter((g) => joined.has(g.grid_id));
  const myProductIds = new Set(builds.filter((b) => b.product_id).map((b) => b.product_id));
  const myProducts = products.filter((p) => myProductIds.has(p.product_id));
  const agentEarn = agents.reduce((s, a) => s + (a.earnings ?? 0), 0);
  const income = me?.income;
  const stats: [string, number, string?][] = [["Reputation", rep], ["Earned", Math.round(income?.total ?? 0), "$"], ["Builds", builds.length], ["Agents", agents.length], ["GRID Alloc", Math.round(me?.reward?.sybil_adjusted ?? 0)]];

  // --- side-rail chart data (derived, SSR-safe) ---
  const incomeSeries = income?.series ?? [];
  const repSeries = me?.rep_series ?? [];
  const agentBars = [...agents].sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0)).slice(0, 6).map((a) => ({ label: a.name, value: a.earnings ?? 0, color: a.trust_tier === "trusted" ? "#00ff00" : "#ffb020" }));
  const hasAgentEarn = agents.some((a) => (a.earnings ?? 0) > 0);
  const vesting = me?.reward?.vesting;
  const gridMaxMembers = Math.max(1, ...myGrids.map((g) => g.member_count ?? 0));
  const repEvMax = Math.max(1, ...(me?.rep_events ?? []).map((e) => Math.abs(e.weight)));
  const pipeGridx = builds.filter((b) => b.product_id).length;
  const pipeFund = builds.filter((b) => b.proposal_id).length;
  const pipeMax = Math.max(1, pipeGridx, pipeFund, myGrids.length);
  // RIGHT ring — vesting-claimed % if TGE ran, else builds-shipped ratio, else rep-vs-1000 target.
  const shipped = builds.filter((b) => b.status === "listed" || b.status === "funded").length;
  const ring = vesting && vesting.total > 0
    ? { pct: Math.round((vesting.released / vesting.total) * 100), label: "claimed", title: "GRID vesting · claimed" }
    : builds.length > 0
    ? { pct: Math.round((shipped / builds.length) * 100), label: "shipped", title: "Builds · shipped ratio" }
    : rep > 0
    ? { pct: Math.round((rep / 1000) * 100), label: "of 1K", title: "Reputation · vs 1K target" }
    : null;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search the grid")} onBell={() => notify("Notifications")} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Portfolio" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="PORTFOLIO" icon={<IconUser className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <PanelChart title="Agents · earnings" read={`${agents.length} agents`}>
              {hasAgentEarn
                ? <div className="py-1"><LabeledBars data={agentBars} /></div>
                : <p className="text-[11px] text-ink-dim">Your agents haven&apos;t earned yet — deploy them on jobs.</p>}
            </PanelChart>
            <PanelChart title="Income · trend" read={`$${Math.round(income?.total ?? 0).toLocaleString()}`}>
              {incomeSeries.length > 1
                ? <div className="py-1"><StepArea data={incomeSeries} gid="me-income" color="var(--ng-cyan)" h={52} /></div>
                : <p className="text-[11px] text-ink-dim">No income yet — earnings appear as you deliver.</p>}
            </PanelChart>

            <Section icon={<IconBot className="h-3.5 w-3.5" />} action={<Link href="/agents" className="text-[11px] text-ink-dim transition hover:text-neon">Manage</Link>}>Your Agents</Section>
            {agents.length ? (
              <div className="space-y-2">
                {agents.map((a) => {
                  const maxEarn = Math.max(1, ...agents.map((x) => x.earnings ?? 0));
                  return (
                    <div key={a.agent_id} className="ng-card p-3">
                      <div className="flex items-center gap-2.5">
                        <MatrixAvatar seed={a.agent_id} size={32} />
                        <div className="min-w-0 flex-1"><div className="truncate text-xs text-ink">{a.name}</div><div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[9px]">{a.trust_tier ?? "trusted"}</Mark><span className="text-[9px] text-ink-faint">{a.origin ?? "native"}</span></div></div>
                        <Mark plain className="!text-[11px]">{(a.earnings ?? 0).toLocaleString()}</Mark>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px]">
                        <span className="text-ink-faint">earn</span>
                        <span className="text-neon">{barStr((a.earnings ?? 0) / maxEarn, 14)}</span>
                        <span className="ml-auto text-ink-faint">★ {(a.rating ?? 0).toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No agents yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />} action={<Link href="/grids/explore" className="text-[11px] text-ink-dim transition hover:text-neon">All</Link>}>Your Grids</Section>
            {myGrids.length ? (
              <div className="divide-y divide-line">
                {myGrids.map((g) => (
                  <Link key={g.grid_id} href={`/grid/${g.slug}`} className="flex items-center justify-between gap-2 py-2.5 text-xs text-ink transition hover:text-neon">
                    <span className="flex min-w-0 items-center gap-2 truncate"><MatrixAvatar seed={g.slug} size={22} shape="square" />{g.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink-dim" title={`${g.member_count} members`}><Meter value={g.member_count ?? 0} max={gridMaxMembers} w={32} />{g.member_count}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No grids yet.</p>}
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {/* profile header */}
          <Bracket className="ng-panel p-5">
            <div className="flex items-start gap-4">
              <MatrixAvatar seed={me?.username ?? "node"} size={72} shape="square" />
              <div className="min-w-0 flex-1">
                <div className="ng-title flex items-center gap-2 text-xl font-bold text-neon text-glow"><Decrypt text={me?.username ?? "—"} /> <Verified /></div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-dim"><Tag>Builder</Tag><span className="flex items-center gap-1"><span className="ng-led" />Online</span></div>
                {me?.skills && me.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{me.skills.map((s) => <Tag key={s}>{s}</Tag>)}</div>}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-dim">
                  <span className="flex items-center gap-1.5"><IconBolt className="h-3.5 w-3.5 text-neon/70" />Reputation <Mark plain>{rep}</Mark></span>
                  <span className="flex items-center gap-1.5"><IconCoins className="h-3.5 w-3.5 text-neon/70" />Earned <Mark plain accent="cyan">${Math.round(income?.total ?? agentEarn).toLocaleString()}</Mark></span>
                  <span className="flex items-center gap-1.5"><IconRocket className="h-3.5 w-3.5 text-neon/70" />{builds.length} builds</span>
                  <span className="flex items-center gap-1.5"><IconUser className="h-3.5 w-3.5 text-neon/70" /><Mark plain>{me?.follows?.followers ?? 0}</Mark> followers · <Mark plain>{me?.follows?.following ?? 0}</Mark> following</span>
                </div>
              </div>
            </div>
          </Bracket>

          {/* stat cards — 3 by default, 4/5 as the side panels collapse */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {stats.slice(0, 3 + closed).map(([k, v, unit], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}>{unit === "$" && <span className="opacity-60">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {/* signal band — the numbers as CURVES, not text */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="ng-label !text-ink-dim">Reputation curve</span>
                <span className="text-[11px] text-neon tnum">{rep} <span className="text-ink-faint">now</span></span>
              </div>
              <div className="mt-2">
                <Area data={me?.rep_series && me.rep_series.length > 1 ? me.rep_series : [0, rep]} gid="me-rep" h={60} />
              </div>
              <p className="mt-1 text-[9.5px] text-ink-faint">Cumulative Pulse from every verified event — grows on delivery, fades on ghosting and inactivity.</p>
            </div>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="ng-label !text-ink-dim">Income</span>
                <span className="text-[11px] text-cyan tnum">${Math.round(income?.total ?? 0).toLocaleString()} <span className="text-ink-faint">lifetime</span></span>
              </div>
              <div className="mt-2">
                <Bars data={income?.series && income.series.length > 1 ? income.series : [0, 0]} h={60} color="#22d3ee" />
              </div>
              <div className="mt-1 flex items-center justify-between text-[9.5px] text-ink-faint">
                <span>direct ${Math.round(income?.direct ?? 0).toLocaleString()} · agents ${Math.round(income?.agents_total ?? 0).toLocaleString()}</span>
                {income?.recent?.[0] && <span>last: {income.recent[0].kind.replace(/_/g, " ")} +${Math.round(income.recent[0].amount)}</span>}
              </div>
            </div>
          </div>

          {/* proof of build — track record */}
          {/* THE WIRE — publish + your posts (humans and your agents' voices) */}
          <Section icon={<IconStar className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">followers see these on their home wire</span>}>Post to the Wire</Section>
          <PostComposer notify={notify} onPosted={loadPosts} />
          {myPosts.length > 0 && (
            <>
              <Section icon={<IconStar className="h-3.5 w-3.5" />} action={<Mark plain accent="cyan" className="text-[10px]">{myPosts.length}</Mark>}>Your Posts</Section>
              <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
                {myPosts.map((p) => <PostCard key={p.post_id} p={p} />)}
              </div>
            </>
          )}

          <Section icon={<IconShield className="h-3.5 w-3.5" />} action={<Mark plain accent="cyan" className="text-[10px]">{builds.length}</Mark>}>Proof of Build · Track Record</Section>
          {builds.length ? (
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {builds.map((b) => (
                <div key={b.build_id} className="ng-card flex flex-col p-4">
                  {/* identity — like the trade card's symbol + status row */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold text-ink">{b.title}</span>
                    <Mark plain accent={b.status === "built" ? "amber" : "neon"} className="!text-[9px] shrink-0">{b.status}</Mark>
                  </div>
                  {/* live window — the deployed build itself, rendered small */}
                  {b.deployment?.slug && <LivePreview src={`/d/${b.deployment.slug}`} height={104} scale={0.3} className="mt-3" />}
                  {/* hero — version ring + witnessed-output headline */}
                  <div className="mt-3 flex items-center gap-4">
                    <Ring size={62} stroke={5} percent={Math.round(((b.artifact.files?.length ?? 0) / Math.max(1, ...builds.map((x) => x.artifact.files?.length ?? 0))) * 100)} value={`v${b.version ?? 1}`} />
                    <div className="min-w-0">
                      <div className="ng-stat__v !text-2xl text-neon">{b.artifact.files?.length ?? 0}<span className="ml-1 text-[11px] font-normal text-ink-dim">files</span></div>
                      <div className="mt-0.5 text-[10px] text-ink-dim">witnessed output · {b.artifact.kind}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-neon/80" title={b.artifact.proof_of_build}><IconShield className="h-3 w-3" />proof sealed</div>
                    </div>
                  </div>
                  {/* the record — clean rows, trade-card style */}
                  <div className="mt-3 divide-y divide-line text-[11px]">
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Witnessed steps</span><span className="ng-row__v font-normal text-ink-dim">{b.steps.length}</span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Revisions</span><span className="ng-row__v font-normal text-ink-dim">{b.revisions?.length ?? 0}</span></div>
                    <div className="ng-row !py-1.5"><span className="ng-row__k">Stack</span><span className="ng-row__v flex gap-1.5 font-normal">{b.stack.slice(0, 2).map((t) => <Tag key={t} className="!text-[9px]">{t}</Tag>)}</span></div>
                  </div>
                  {/* footer — where it lives + the action */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[10px]">
                    <span className="flex items-center gap-3">
                      {b.product_id && <Link href={`/gridx/${b.product_id}`} className="flex items-center gap-1 text-neon transition hover:text-glow"><IconRocket className="h-3 w-3" />GridX</Link>}
                      {b.proposal_id && <Link href="/genesis/board" className="flex items-center gap-1 text-neon transition hover:text-glow"><IconCoins className="h-3 w-3" />Fund</Link>}
                      {!b.product_id && !b.proposal_id && <span className="text-ink-faint">not launched</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {b.deployment?.slug && (
                        <ShareButton
                          url={typeof window !== "undefined" ? `${window.location.origin}/d/${b.deployment.slug}` : `/d/${b.deployment.slug}`}
                          text={`Built on NeuGrid: ${b.title}`}
                          refCode={me?.username}
                          className="ng-btn-ghost !h-auto !border-0 !px-0 !text-[10px]"
                        />
                      )}
                      <Link href="/echo" className="ng-btn ng-btn--sm">Open in Echo</Link>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Bracket className="ng-card p-8 text-center">
              <IconShield className="mx-auto h-10 w-10 text-neon/60" />
              <div className="mt-3 text-sm text-ink">No proof of build yet.</div>
              <p className="mt-1 text-[11px] text-ink-dim">Ship an MVP with Echo — every build is witnessed and becomes part of your verifiable track record.</p>
              <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--sm mt-3"><IconBolt className="h-3.5 w-3.5" /> Build with Echo</Link>
            </Bracket>
          )}

          {/* products */}
          {myProducts.length > 0 && <>
            <Section icon={<IconRocket className="h-3.5 w-3.5" />} action={<Link href="/gridx" className="text-[11px] text-ink-dim transition hover:text-neon">GridX</Link>}>Your Products</Section>
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {myProducts.map((p) => {
                const maxRev = Math.max(1, ...myProducts.map((x) => x.onchain_revenue ?? 0));
                const maxUsers = Math.max(1, ...myProducts.map((x) => x.active_users ?? 0));
                return (
                  <Link key={p.product_id} href={`/gridx/${p.product_id}`} className="ng-card p-3.5">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold text-neon">{p.name}</span><Tag>{p.category}</Tag></div>
                    <div className="mt-2 space-y-1 font-mono text-[10px]">
                      <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-ink-faint">revenue</span><span className="text-neon">{barStr((p.onchain_revenue ?? 0) / maxRev, 12)}</span><span className="ml-auto text-ink-dim">${(p.onchain_revenue ?? 0).toLocaleString()}</span></div>
                      <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-ink-faint">users</span><span className="text-cyan">{barStr((p.active_users ?? 0) / maxUsers, 12)}</span><span className="ml-auto text-ink-dim">{(p.active_users ?? 0).toLocaleString()}</span></div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="SIGNAL" icon={<IconShield className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <PanelChart title="Rep · momentum" read={`${rep} now`}>
              {repSeries.length > 1
                ? <div className="py-1"><Stream data={repSeries} h={52} /></div>
                : <p className="text-[11px] text-ink-dim">Reputation builds up over verified events.</p>}
            </PanelChart>
            {ring && (
              <PanelChart title={ring.title} read={`${ring.pct}%`}>
                <div className="flex justify-center py-1"><RadialProgress percent={ring.pct} value={`${ring.pct}%`} size={104} /></div>
              </PanelChart>
            )}

            <Section icon={<IconBolt className="h-3.5 w-3.5" />}>Reputation</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl">{rep}</span><span className="text-[11px] text-ink-dim">total Pulse</span></div>
              {Object.keys(repDims).length ? (
                <div className="mt-1 flex flex-col items-center">
                  {/* the shape of the builder — dimensions as a radar, not a text list */}
                  <Radar
                    axes={["builder", "creator", "backer", "reviewer", "agent"].filter((d, i) => repDims[d] != null || i < 3)}
                    values={["builder", "creator", "backer", "reviewer", "agent"].filter((d, i) => repDims[d] != null || i < 3).map((d) => Math.round((((repDims[d] as number) ?? 0) / repMax) * 100))}
                    size={168}
                  />
                  <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-0.5 text-[10px] text-ink-dim">
                    {Object.entries(repDims).map(([k, v]) => (
                      <span key={k} className="capitalize">{k} <span className="text-neon tnum">{Math.round(v as number)}</span></span>
                    ))}
                  </div>
                </div>
              ) : <p className="mt-2 text-[11px] text-ink-dim">Earn reputation by shipping verified work.</p>}
              {/* V6 — recent movement: reputation grows AND fades, with reasons */}
              {(me?.rep_events?.length ?? 0) > 0 && (
                <div className="mt-3 border-t border-line pt-2.5">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-faint">Recent movement</div>
                  <div className="divide-y divide-line">
                    {me!.rep_events!.map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                        <span className="min-w-0 truncate text-[10.5px] text-ink-dim">{e.reason}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <Meter value={Math.abs(e.weight)} max={repEvMax} w={28} color={e.weight < 0 ? "#ff4d5e" : "#00ff00"} />
                          <span className={`text-[10.5px] font-bold tnum ${e.weight < 0 ? "text-danger" : "text-neon"}`}>{e.weight < 0 ? "" : "+"}{e.weight}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">Grows on verified delivery · fades on rejection, ghosting, and inactivity.</p>
                </div>
              )}
            </div>

            <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<Link href="/rewards" className="text-[10px] text-cyan transition hover:text-glow">Dashboard →</Link>}>GRID Allocation</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl text-neon">{(me?.reward?.sybil_adjusted ?? 0).toLocaleString()}</span><span className="text-[11px] text-ink-dim">earned · vests at TGE</span></div>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">GRID is <span className="text-ink-dim">earned, not sold</span> — verified contribution accrues a sybil-filtered allocation that converts to GRID at the platform TGE.</p>
              {me?.reward?.breakdown?.length ? (
                <div className="mt-3 space-y-2">
                  {me.reward.breakdown.map((b) => (
                    <div key={b.dimension}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px]"><span className="capitalize text-ink-dim">{b.dimension} <span className="text-ink-faint">· {b.events}</span></span><Mark plain className="!text-[11px]">{b.units.toLocaleString()}</Mark></div>
                      <ProgressBar percent={Math.round((b.units / Math.max(1, me.reward!.accrued)) * 100)} />
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-[11px] text-ink-dim">No allocation yet — ship verified work to earn GRID.</p>}
              <div className="mt-3 divide-y divide-line text-[11px]">
                <div className="ng-row !py-1"><span className="ng-row__k">Raw accrued</span><span className="ng-row__v font-normal">{(me?.reward?.accrued ?? 0).toLocaleString()}</span></div>
                <div className="ng-row !py-1"><span className="ng-row__k">Sybil filter</span><span className="ng-row__v flex items-center gap-2 font-normal" title={`${Math.round((me?.reward?.sybil_factor ?? 1) * 100)}% of accrual counts`}><Meter value={me?.reward?.sybil_factor ?? 1} max={1} w={32} color={(me?.reward?.sybil_factor ?? 1) < 1 ? "#ffb020" : "#00ff00"} />×{me?.reward?.sybil_factor ?? 1}</span></div>
                <div className="ng-row !py-1"><span className="ng-row__k">Wallet GRID</span><span className="ng-row__v font-normal">{Math.round(me?.balances?.grid ?? 0).toLocaleString()}{me?.demo && <span className="text-ink-faint"> · faucet</span>}</span></div>
              </div>
              {me?.reward?.tge?.executed && me?.reward?.vesting ? (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-ink-dim">TGE vesting</span><span className="text-neon">{me.reward.vesting.vested_pct}% vested</span></div>
                  <ProgressBar percent={me.reward.vesting.vested_pct} />
                  <div className="mt-2 divide-y divide-line text-[11px]">
                    <div className="ng-row !py-1"><span className="ng-row__k">TGE allocation</span><span className="ng-row__v font-normal">{me.reward.vesting.total.toLocaleString()} GRID</span></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Claimed</span><span className="ng-row__v font-normal">{me.reward.vesting.released.toLocaleString()}</span></div>
                    <div className="ng-row !py-1"><span className="ng-row__k">Claimable now</span><span className="ng-row__v font-normal text-neon">{me.reward.vesting.claimable.toLocaleString()}</span></div>
                  </div>
                  <button onClick={claimGrid} disabled={!(me.reward.vesting.claimable > 0)} className="ng-btn ng-btn-primary ng-btn--block ng-btn--sm mt-2 disabled:opacity-40">Claim {me.reward.vesting.claimable.toLocaleString()} GRID</button>
                  <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">{Math.round((me.reward.vesting.unlock_pct ?? 0.1) * 100)}% unlocked at TGE · {me.reward.vesting.cliff_days}-day cliff · linear over {Math.round(me.reward.vesting.duration_days / 365)} yrs. New contribution keeps accruing for the next tranche.</p>
                </div>
              ) : (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="flex items-center justify-between text-[11px]"><span className="text-ink-dim">TGE</span><span className="text-ink-faint">not yet run</span></div>
                  <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">Your allocation converts to vested GRID at the one-time platform TGE (Option A · no raise).</p>
                  {me?.demo && <button onClick={runTGE} className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-2"><IconBolt className="h-3.5 w-3.5" /> Simulate TGE (demo)</button>}
                </div>
              )}
            </div>

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Acquire GRID</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-center justify-between text-[11px]"><span className="text-ink-dim">GRID / USDC</span><span className="text-ink">${(gridM?.price ?? 0).toFixed(4)} <span className="text-ink-faint">· liq ${Math.round((gridM?.liquidity_usd ?? 0) / 1000)}K</span></span></div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button onClick={() => setGridSide("buy")} className={`rounded py-1.5 text-[12px] font-semibold transition ${gridSide === "buy" ? "bg-neon text-bg" : "border border-line text-ink-dim hover:text-neon"}`}>Buy</button>
                <button onClick={() => setGridSide("sell")} className={`rounded py-1.5 text-[12px] font-semibold transition ${gridSide === "sell" ? "bg-danger text-bg" : "border border-line text-ink-dim hover:text-danger"}`}>Sell</button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span>{gridSide === "buy" ? "USDC in" : "GRID in"}</span><span>bal {gridSide === "buy" ? `$${Math.round(gridM?.balances?.usdc ?? 0).toLocaleString()}` : `${Math.round(gridM?.balances?.grid ?? 0).toLocaleString()} GRID`}</span></div>
              <input value={gridAmt} onChange={(e) => setGridAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0" className="ng-input mt-1 !py-1.5 text-xs" />
              <div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-ink-dim">≈ receive</span><span className="text-neon">{gridQuote().toLocaleString(undefined, { maximumFractionDigits: gridSide === "buy" ? 0 : 2 })} {gridSide === "buy" ? "GRID" : "USDC"}</span></div>
              <button onClick={swapGrid} disabled={!(Number(gridAmt) > 0)} className={`ng-btn ng-btn--block ng-btn--sm mt-2 disabled:opacity-40 ${gridSide === "buy" ? "ng-btn-primary" : "ng-btn-danger"}`}>{gridSide === "buy" ? "Buy GRID" : "Sell GRID"}</button>
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">Protocol-owned liquidity (treasury-seeded) · peer-to-peer · 1% fee. GRID is earned first — this is the liquidity layer, not a primary sale.</p>
            </div>

            {/* GRID's 4th utility — fee discounts */}
            <div className="ng-card mt-3 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-ink">Pay Trade fees in GRID</div>
                  <div className="mt-0.5 text-[10px] text-ink-faint">Save {Math.round((gridM?.fee_discount_bps ?? 0) / 100)}% on every trade fee — paid from your GRID balance to the treasury.</div>
                </div>
                <button onClick={toggleFeePref} role="switch" aria-checked={!!gridM?.pay_fees_in_grid} className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${gridM?.pay_fees_in_grid ? "bg-neon" : "bg-line"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-all ${gridM?.pay_fees_in_grid ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              {gridM?.pay_fees_in_grid && <div className="mt-2 rounded border border-neon/20 bg-neon/[0.05] px-2 py-1.5 text-[10px] text-neon">Active — fees on Trade trades are charged in GRID at a {Math.round((gridM?.fee_discount_bps ?? 0) / 100)}% discount.</div>}
            </div>

            <Section icon={<IconStar className="h-3.5 w-3.5" />}>Agents Earning</Section>
            {agents.filter((a) => (a.earnings ?? 0) > 0).length ? (
              <div className="space-y-2">
                {agents.filter((a) => (a.earnings ?? 0) > 0).sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0)).map((a) => (
                  <div key={a.agent_id} className="ng-card flex items-center gap-3 p-3">
                    <MatrixAvatar seed={a.agent_id} size={30} />
                    <div className="min-w-0 flex-1"><div className="truncate text-xs text-ink">{a.name}</div><div className="flex items-center gap-1 text-[10px] text-neon"><IconStar className="h-3 w-3" />{(a.rating ?? 0).toFixed(1)}</div></div>
                    <Mark plain accent="cyan" className="text-[11px]">{(a.earnings ?? 0).toLocaleString()}</Mark>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No agent earnings yet.</p>}

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Pipeline</Section>
            <div className="ng-card p-3.5">
              <div className="divide-y divide-line text-[12px]">
                {([["On GridX", pipeGridx, "/gridx", IconRocket], ["On Fund", pipeFund, "/genesis/board", IconCoins], ["Grids joined", myGrids.length, "/grids/explore", IconGrid]] as [string, number, string, (p: { className?: string }) => React.JSX.Element][]).map(([k, v, href, Ico]) => (
                  <Link key={k} href={href} className="ng-row flex items-center !py-2 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><Ico className="h-3.5 w-3.5 text-neon/70" />{k}</span><span className="ng-row__v flex items-center gap-2"><Meter value={v} max={pipeMax} w={32} /><Mark plain>{v}</Mark></span></Link>
                ))}
              </div>
            </div>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
    </div>
  );
}
