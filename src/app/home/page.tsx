"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket,
  IconConnect, IconChevronDown, IconArrowRight,
  IconGrid, IconUser, IconBot, IconBolt, IconActivity, IconShield,
  IconRocket, IconTarget, IconCoins, IconLayers,
  kpiColor,
} from "@/components/app/ui";
import { Decrypt, CountUp } from "@/components/app/typefx";
import { TProc, TailLog, PanelChart, type LogLine } from "@/components/app/terminal";
import { Radar, Bars, Ring, Gauge } from "@/components/app/charts";
import OrbPanel from "@/components/app/OrbPanel";
import type { Agent, Build, Grid, Job } from "@/lib/types";

type Economy = { x402: { revenue: number; settlements: number; asset: string; resources: { name: string; price: number; description: string; count: number; revenue: number }[]; a2a: { count: number; volume: number } }; credentials: { issued: number; holders: number }; agents: { total: number; trusted: number; external: number; earnings: number }; grid: { price: number; liquidity: number; allocation_issued: number; recipients: number; tge_executed: boolean; treasury_grid: number; treasury_usdc: number; compute_builds: number; staked: number; slashed: number; gov_open: number; gov_passed: number; gov_locked: number } };

function Section({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between gap-2 first:mt-1">
      <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon">{icon}</span>{children}</div>
      {action}
    </div>
  );
}

export default function HomePage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  /* real state */
  const [me, setMe] = useState<{ username?: string; pulse?: number; reputation?: { total?: number; by_dimension?: Record<string, number> } | null; joined_grids?: string[]; rep_series?: number[]; income?: { total?: number; series?: number[] }; starter?: { wallet_connected: boolean; claimed: boolean; eligible: boolean; needs_verification?: boolean; credit: number; amount: number; builds: number; show: boolean } } | null>(null);
  const [claiming, setClaiming] = useState(false);
  async function claimStarter() {
    if (claiming) return;
    setClaiming(true);
    await fetch("/api/onboarding/claim", { method: "POST" }).catch(() => {});
    await fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    setClaiming(false);
  }
  const [builds, setBuilds] = useState<Build[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [grids, setGrids] = useState<Grid[]>([]);
  const [economy, setEconomy] = useState<Economy | null>(null);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => setBuilds(d.builds ?? [])).catch(() => {});
    fetch("/api/agents?mine=1").then((r) => r.json()).then((d) => setAgents(d.agents ?? [])).catch(() => {});
    fetch("/api/jobs?status=open").then((r) => r.json()).then((d) => setOpenJobs(d.jobs ?? [])).catch(() => {});
    fetch("/api/grids").then((r) => r.json()).then((d) => setGrids(d.grids ?? d ?? [])).catch(() => {});
    fetch("/api/economy").then((r) => r.json()).then(setEconomy).catch(() => {});
  }, []);

  const rep = Math.round(me?.reputation?.total ?? me?.pulse ?? 0);
  const repDims = me?.reputation?.by_dimension ?? {};
  const joined = new Set(me?.joined_grids ?? []);
  const myGrids = grids.filter((g) => joined.has(g.grid_id));
  const recommendedGrids = grids.filter((g) => !joined.has(g.grid_id)).slice(0, 5);
  const listedCount = builds.filter((b) => b.product_id).length;
  const fundedCount = builds.filter((b) => b.proposal_id).length;
  const agentEarn = agents.reduce((s, a) => s + (a.earnings ?? 0), 0);
  const repMax = Math.max(1, ...Object.values(repDims));
  // reputation radar — canonical dimensions, normalized to the strongest
  const RADAR_DIMS = ["builder", "creator", "backer", "reviewer", "agent"] as const;
  const radarVals = RADAR_DIMS.map((d) => Math.round(((repDims[d] ?? 0) / repMax) * 100));
  // activity bars — positive rep deltas across the recent curve (contribution cadence)
  const repSeries = me?.rep_series ?? [];
  const activity = repSeries.length > 1
    ? repSeries.slice(1).map((v, i) => Math.max(0, v - repSeries[i])).slice(-14)
    : [0];
  const trustedPct = economy?.agents.total ? Math.round((economy.agents.trusted / economy.agents.total) * 100) : 0;
  const externalPct = economy?.agents.total ? Math.round((economy.agents.external / economy.agents.total) * 100) : 0;
  const govDenom = (economy?.grid?.gov_passed ?? 0) + (economy?.grid?.gov_open ?? 0);
  const govApprovalPct = govDenom ? Math.round(((economy?.grid?.gov_passed ?? 0) / govDenom) * 100) : 0;
  const gridEarnSink = (economy?.grid?.treasury_grid ?? 0) + (economy?.grid?.allocation_issued ?? 0);
  const gridSinkPct = gridEarnSink ? Math.round(((economy?.grid?.treasury_grid ?? 0) / gridEarnSink) * 100) : 0;
  // recent builds → a tail -f style log (oldest first, so newest lands at the bottom)
  const buildLog: LogLine[] = [...builds]
    .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
    .slice(-6)
    .map((b) => ({
      at: (b.created_at ?? "").slice(11, 16) || "--:--",
      text: `${b.status === "built" ? "built" : b.status} · ${b.title}`,
      delta: b.status === "built" ? 40 : undefined,
    }));
  const kpis: { Icon: (p: { className?: string }) => React.JSX.Element; title: string; v: number; sub: string }[] = [
    { Icon: IconBolt, title: "Reputation", v: rep, sub: "Pulse · soulbound" },
    { Icon: IconRocket, title: "Builds", v: builds.length, sub: "proof of build" },
    { Icon: IconBot, title: "Agents", v: agents.length, sub: "economic actors" },
    { Icon: IconGrid, title: "On GridX", v: listedCount, sub: "products listed" },
    { Icon: IconActivity, title: "Open Jobs", v: openJobs.length, sub: "to claim" },
  ];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      {/* Header — the shared NeuHeader (real search · real notifications · Start New) */}
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      {/* Body */}
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-3">
        {/* LEFT */}
        <OrbPanel side="left" label="You" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[348px]">
          <Panel scroll title="YOUR GRID" icon={<IconUser className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            {/* profile */}
            <div className="ng-card p-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-neon text-base font-bold text-bg" style={{ boxShadow: "0 0 16px rgba(0,255,0,0.5)" }}>{(me?.username?.[0] ?? "N").toUpperCase()}</span>
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-ink">{me?.username ?? "—"}</div>
                  <Tag className="mt-0.5">Builder</Tag>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {([["Rep", rep], ["Builds", builds.length], ["Agents", agents.length], ["Grids", myGrids.length]] as [string, number][]).map(([k, v]) => (
                  <div key={k}><div className="ng-stat__v !text-base"><CountUp key={v} value={v} /></div><div className="ng-stat__k">{k}</div></div>
                ))}
              </div>
            </div>

            {/* two live charts — the terminal readout (founder: charts on every rail) */}
            <PanelChart title="Reputation · by dimension" read={`${rep} pulse`}>
              <div className="flex justify-center py-1.5">
                <Radar axes={[...RADAR_DIMS]} values={radarVals} size={156} />
              </div>
            </PanelChart>
            <PanelChart title="Activity · contribution cadence" read={`${activity.reduce((a, b) => a + b, 0)} pts`}>
              <Bars data={activity.length ? activity : [0]} h={44} />
            </PanelChart>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/echo" className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block"><IconBolt className="h-3.5 w-3.5" /> Build</Link>
              <Link href="/agents" className="ng-btn ng-btn--sm ng-btn--block"><IconBot className="h-3.5 w-3.5" /> Agents</Link>
            </div>
            <Link href="/leaderboard" className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-2"><IconActivity className="h-3.5 w-3.5" /> Discovery — Leaderboard</Link>

            <Section icon={<IconGrid className="h-3.5 w-3.5" />} action={<Link href="/grids/explore" className="text-[11px] text-ink-dim transition hover:text-neon">All</Link>}>Your Grids</Section>
            {myGrids.length ? (
              <div className="divide-y divide-line">
                {myGrids.map((g) => (
                  <Link key={g.grid_id} href={`/grid/${g.slug}`} className="group flex items-center justify-between py-2.5 text-xs text-ink transition hover:text-neon">
                    <span className="flex items-center gap-2 truncate"><IconGrid className="h-3.5 w-3.5 text-neon/70" />{g.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-dim">{g.member_count}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No grids yet — <Link href="/grids/explore" className="text-neon">explore</Link> or start one.</p>}

            <Section icon={<IconBot className="h-3.5 w-3.5" />} action={<Link href="/agents" className="text-[11px] text-ink-dim transition hover:text-neon">Manage</Link>}>Your Agents · ps aux</Section>
            {agents.length ? (
              <div className="ng-card px-2.5 py-1.5">
                {agents.slice(0, 6).map((a) => (
                  <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="block">
                    <TProc
                      live={a.status === "active"}
                      name={a.name}
                      tag={a.trust_tier ?? "native"}
                      tagColor={a.trust_tier === "trusted" ? "var(--ng-neon)" : "var(--ng-amber)"}
                      meta={(a.earnings ?? 0).toLocaleString()}
                    />
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No agents yet — <Link href="/agents" className="text-neon">create one</Link>.</p>}
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="ng-title text-2xl font-bold text-neon text-glow"><Decrypt text={`Welcome back, ${me?.username ?? "builder"}`} /></div>
            <p className="text-[12px] text-ink-dim">Your command center — build with Echo, deploy agents, raise on Fund. Everything here is live.</p>
          </Bracket>

          {/* STARTER PATH — zero → first proof-of-build (shows until the first build ships) */}
          {me?.starter?.show && (
            <div className="ng-panel border-neon/25 p-4">
              <div className="ng-label mb-2 !text-neon">Start here — zero to your first proof-of-build</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className={`ng-card p-3 text-[11px] ${me.starter.wallet_connected ? "" : "!border-cyan/40"}`}>
                  <div className={`font-semibold ${me.starter.wallet_connected ? "text-neon" : "text-cyan"}`}>{me.starter.wallet_connected ? "✓" : "1"} Connect your wallet</div>
                  <p className="mt-1 leading-relaxed text-ink-dim">{me.starter.wallet_connected ? "Connected — your signature is your identity." : "Top right → Connect wallet. Your signature is your identity."}</p>
                </div>
                <div className={`ng-card p-3 text-[11px] ${me.starter.eligible ? "!border-cyan/40" : ""}`}>
                  <div className={`font-semibold ${me.starter.claimed ? "text-neon" : me.starter.eligible ? "text-cyan" : "text-ink-faint"}`}>{me.starter.claimed ? "✓" : "2"} Starter Echo credit</div>
                  {me.starter.claimed ? (
                    <p className="mt-1 leading-relaxed text-ink-dim">{Math.round(me.starter.credit).toLocaleString()} credit ready — enough for your first build.</p>
                  ) : me.starter.eligible ? (
                    <button onClick={claimStarter} disabled={claiming} className="ng-btn ng-btn-cyan ng-btn--sm mt-1.5 disabled:opacity-50">Claim {me.starter.amount.toLocaleString()} Echo credit</button>
                  ) : me.starter.needs_verification ? (
                    <p className="mt-1 leading-relaxed text-amber">One step left — <Link href="/rewards" className="underline">verify your wallet</Link> to unlock the grant (anti-bot, not KYC).</p>
                  ) : (
                    <p className="mt-1 leading-relaxed text-ink-faint">Unlocks when your wallet is connected — one grant per wallet.</p>
                  )}
                </div>
                <div className={`ng-card p-3 text-[11px] ${me.starter.credit > 0 ? "!border-cyan/40" : ""}`}>
                  <div className={`font-semibold ${me.starter.credit > 0 ? "text-cyan" : "text-ink-faint"}`}>3 Build something real</div>
                  <p className="mt-1 leading-relaxed text-ink-dim">Tell Echo your idea — real code, live preview, a sealed proof-of-build with your name on it.</p>
                  <Link href="/echo" className={`ng-btn ng-btn--sm mt-1.5 ${me.starter.credit > 0 ? "ng-btn-primary" : ""}`}>Open Echo →</Link>
                </div>
              </div>
            </div>
          )}

          {/* live KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map((s, i) => (
              <div key={s.title} className="ng-card p-3">
                <div className="ng-tag mb-2" style={{ color: kpiColor(i) }}><s.Icon className="h-3 w-3" />{s.title}</div>
                <div className="ng-stat__v !text-2xl" style={{ color: kpiColor(i) }}><CountUp key={s.v} value={s.v} /></div>
                <div className="mt-1 text-[11px] text-ink-dim">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* command center */}
          <Section icon={<IconTarget className="h-3.5 w-3.5" />}>Your Command Center</Section>
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconRocket className="h-3.5 w-3.5" /></span>Echo Builds</div>
              {builds[0] ? <><div className="truncate text-[13px] text-ink">{builds[0].title}</div><div className="truncate text-[10px] text-ink-dim">{builds[0].stack.join(" · ")} · {builds[0].artifact.proof_of_build}</div></> : <div className="text-[11px] text-ink-dim">No builds yet — ship your first MVP with Echo.</div>}
              <div className="mt-2 text-[11px] text-ink-dim">{builds.length} build{builds.length === 1 ? "" : "s"} · {listedCount} on GridX · {fundedCount} on Fund</div>
              <div className="mt-2 flex flex-wrap gap-2"><Link href="/echo" className="ng-btn ng-btn-primary ng-btn--sm"><IconBolt className="h-3.5 w-3.5" /> Build with Echo</Link><Link href="/me" className="ng-btn ng-btn-ghost ng-btn--sm">Track record</Link></div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBot className="h-3.5 w-3.5" /></span>Your Agents</div>
              <div className="flex items-baseline gap-2"><span className="ng-stat__v !text-xl">{agents.length}</span><span className="text-[11px] text-ink-dim">agents · {agentEarn.toLocaleString()} Pulse earned</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{agents.filter((a) => a.origin === "external").length} external · {agents.filter((a) => a.trust_tier === "trusted").length} trusted</div>
              <div className="mt-2 flex flex-wrap gap-2"><Link href="/agents" className="ng-btn ng-btn-primary ng-btn--sm"><IconBot className="h-3.5 w-3.5" /> Manage agents</Link><Link href="/jobs" className="ng-btn ng-btn-ghost ng-btn--sm">Job board</Link></div>
            </div>
          </div>

          {/* protocol economy — the on-chain-bound rails (x402 + SAS + agents) */}
          <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">Solana-bound · swap-ready</span>}>Protocol Economy</Section>
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconCoins className="h-3.5 w-3.5" /></span>x402 Revenue</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.x402.revenue ?? 0} value={economy?.x402.revenue ?? 0} /></span><span className="text-[11px] text-ink-dim">USDC</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.x402.settlements ?? 0} agent payments → protocol</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconShield className="h-3.5 w-3.5" /></span>Soulbound Credentials</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.credentials.issued ?? 0} value={economy?.credentials.issued ?? 0} /></span><span className="text-[11px] text-ink-dim">issued</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">to {economy?.credentials.holders ?? 0} holders · SAS-bound</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBot className="h-3.5 w-3.5" /></span>Agent Economy</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.agents.total ?? 0} value={economy?.agents.total ?? 0} /></span><span className="text-[11px] text-ink-dim">agents</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.agents.trusted ?? 0} trusted · {(economy?.agents.earnings ?? 0).toLocaleString()} earned</div>
            </div>
          </div>

          {/* x402 economy — metered agent payments: a resource catalogue + agent-to-agent */}
          <Section icon={<IconBolt className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">HTTP-402 · USDC on Solana</span>}>x402 Economy</Section>
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-3.5 w-3.5" /></span>Protocol Revenue</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.x402.revenue ?? 0} value={economy?.x402.revenue ?? 0} decimals={2} /></span><span className="text-[11px] text-ink-dim">USDC</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.x402.settlements ?? 0} payments → treasury</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconConnect className="h-3.5 w-3.5" /></span>Agent-to-Agent</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.x402.a2a.volume ?? 0} value={economy?.x402.a2a.volume ?? 0} decimals={2} /></span><span className="text-[11px] text-ink-dim">USDC</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.x402.a2a.count ?? 0} agent→agent payments</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconLayers className="h-3.5 w-3.5" /></span>Metered Resources</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.x402.resources.length ?? 0} value={economy?.x402.resources.length ?? 0} /></span><span className="text-[11px] text-ink-dim">in catalogue</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">pay-per-call · GRID holders −25%</div>
            </div>
          </div>
          <div className="ng-card mt-3 p-3.5">
            <div className="ng-label mb-3 flex items-center justify-between !text-ink-dim">
              <span className="flex items-center gap-2"><span className="text-neon"><IconLayers className="h-3.5 w-3.5" /></span>Metered Resource Catalogue</span>
              <span className="hidden text-[10px] text-ink-faint sm:inline">discoverable · GET /api/x402/discovery</span>
            </div>
            <div className="ng-2col-wide space-y-1.5">
              {(economy?.x402.resources ?? []).map((r) => (
                <div key={r.name} className="flex items-center justify-between gap-3 border-b border-neon/10 pb-1.5 text-[11px] last:border-0 last:pb-0">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="ng-title shrink-0 font-bold text-ink">{r.name}</span>
                    <span className="truncate text-ink-faint">{r.description}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 tabular-nums text-ink-dim">
                    <span title="price">${r.price}</span>
                    <span title="paid calls">{r.count}×</span>
                    <span className="text-neon" title="revenue">${r.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GRID economy — earned, not sold: allocation → utility sinks → liquid market */}
          <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">earned, not sold · Option A</span>}>GRID Economy</Section>
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconCoins className="h-3.5 w-3.5" /></span>GRID Token</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl">${(economy?.grid?.price ?? 0).toFixed(4)}</span><span className="text-[11px] text-ink-dim">/ USDC</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">${((economy?.grid?.liquidity ?? 0) / 1e6).toFixed(2)}M pool liquidity · {economy?.grid?.tge_executed ? "TGE live" : "pre-TGE"}</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-3.5 w-3.5" /></span>Allocation Earned</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.grid?.allocation_issued ?? 0} value={economy?.grid?.allocation_issued ?? 0} /></span><span className="text-[11px] text-ink-dim">GRID</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.grid?.recipients ?? 0} contributors · {economy?.grid?.tge_executed ? "vesting" : "vests at TGE"}</div>
            </div>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconShield className="h-3.5 w-3.5" /></span>Utility Sinks → Treasury</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.grid?.treasury_grid ?? 0} value={economy?.grid?.treasury_grid ?? 0} /></span><span className="text-[11px] text-ink-dim">GRID</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.grid?.compute_builds ?? 0} builds · {(economy?.grid?.staked ?? 0).toLocaleString()} staked · {(economy?.grid?.slashed ?? 0).toLocaleString()} slashed</div>
            </div>
            <Link href="/governance" className="ng-card group p-3.5 transition hover:!border-neon/40">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconTarget className="h-3.5 w-3.5" /></span>Governance</div>
              <div className="flex items-baseline gap-1.5"><span className="ng-stat__v !text-2xl"><CountUp key={economy?.grid?.gov_locked ?? 0} value={economy?.grid?.gov_locked ?? 0} /></span><span className="text-[11px] text-ink-dim">GRID locked</span></div>
              <div className="mt-1 text-[10px] text-ink-dim">{economy?.grid?.gov_open ?? 0} open · {economy?.grid?.gov_passed ?? 0} passed · lock-to-vote <span className="text-neon transition group-hover:underline">Vote →</span></div>
            </Link>
          </div>

          {/* open jobs — real */}
          <Section icon={<IconActivity className="h-3.5 w-3.5" />} action={<Link href="/jobs" className="text-[11px] text-ink-dim transition hover:text-neon">Job board</Link>}>Open Jobs · {openJobs.length}</Section>
          {openJobs.length ? (
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {openJobs.slice(0, 6).map((j) => (
                <Link key={j.job_id} href={`/jobs`} className="ng-card p-3.5">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-ink">{j.title}</span><Mark plain className="!text-[11px]">{j.reward_amount} {j.reward_token ?? "Pulse"}</Mark></div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-ink-dim">{j.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{j.required_skills.slice(0, 3).map((s) => <Tag key={s}>{s}</Tag>)}<Tag accent="cyan">{j.executor_kind}</Tag></div>
                </Link>
              ))}
            </div>
          ) : <p className="text-[11px] text-ink-dim">No open jobs right now.</p>}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[348px]">
          <Panel scroll title="SIGNAL" icon={<IconShield className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <Section icon={<IconBolt className="h-3.5 w-3.5" />}>Reputation</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl">{rep}</span><span className="text-[11px] text-ink-dim">total Pulse</span></div>
            </div>

            {/* two Signal-rail charts — a ratio-ring cluster + a GRID gauge (founder, screenshot-inspired 2026-07-04) */}
            <PanelChart title="Agent economy · ratios" read={`${economy?.agents.total ?? 0} agents`}>
              <div className="flex items-end justify-around gap-1 py-1.5">
                <Ring percent={trustedPct} label="trusted" size={66} stroke={5} />
                <Ring percent={externalPct} label="external" size={66} stroke={5} color="var(--ng-cyan)" />
                <Ring percent={govApprovalPct} label="gov" size={66} stroke={5} color="var(--ng-amber)" />
              </div>
            </PanelChart>
            <PanelChart title="GRID · sink share" read={`${(economy?.grid?.treasury_grid ?? 0).toLocaleString()} GRID`}>
              <div className="flex justify-center py-0.5"><Gauge percent={gridSinkPct} value={`${gridSinkPct}%`} w={152} /></div>
            </PanelChart>

            <Section icon={<IconRocket className="h-3.5 w-3.5" />} action={<Link href="/me" className="text-[11px] text-ink-dim transition hover:text-neon">All</Link>}>Recent Builds · tail -f</Section>
            {builds.length ? (
              <div className="ng-card p-3">
                <TailLog lines={buildLog} />
              </div>
            ) : <p className="text-[11px] text-ink-dim">No builds yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />} action={<Link href="/grids/explore" className="text-[11px] text-ink-dim transition hover:text-neon">Explore</Link>}>Recommended Grids</Section>
            {recommendedGrids.length ? (
              <div className="space-y-2">
                {recommendedGrids.map((g) => (
                  <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card flex items-center justify-between p-3">
                    <div className="min-w-0"><div className="truncate text-xs text-ink">{g.name}</div><div className="text-[10px] text-ink-dim">{g.category}</div></div>
                    <span className="flex items-center gap-2 text-[11px] text-ink-dim">{g.member_count}<IconArrowRight className="h-3.5 w-3.5 text-neon/70" /></span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">You&#39;re in every grid already.</p>}

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Pipeline</Section>
            <div className="ng-card p-3.5">
              <div className="divide-y divide-line text-[12px]">
                {([["On GridX", listedCount, "/gridx", IconLayers], ["On Fund", fundedCount, "/genesis/board", IconCoins], ["Agents earning", agents.filter((a) => (a.earnings ?? 0) > 0).length, "/agents", IconBot]] as [string, number, string, (p: { className?: string }) => React.JSX.Element][]).map(([k, v, href, Ico]) => (
                  <Link key={k} href={href} className="ng-row flex items-center !py-2 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><Ico className="h-3.5 w-3.5 text-neon/70" />{k}</span><span className="ng-row__v"><Mark plain>{v}</Mark></span></Link>
                ))}
              </div>
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
