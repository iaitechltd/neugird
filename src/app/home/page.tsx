"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket,
  IconConnect, IconChevronDown, IconArrowRight,
  IconGrid, IconUser, IconBot, IconBolt, IconActivity, IconShield,
  IconRocket, IconTarget, IconCoins, IconLayers,
} from "@/components/app/ui";
import { Decrypt, CountUp } from "@/components/app/typefx";
import { Rise } from "@/components/app/motionfx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import PostCard, { type WirePost } from "@/components/app/PostCard";
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
  // loaded flags — hold a neutral placeholder until the first fetch resolves so a real account never flashes empty
  const [meLoaded, setMeLoaded] = useState(false);
  const [buildsLoaded, setBuildsLoaded] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [gridsLoaded, setGridsLoaded] = useState(false);
  const [wire, setWire] = useState<WirePost[]>([]);
  const [wireTab, setWireTab] = useState<"following" | "all">("following");
  const wirePicked = useRef(false); // the user manually chose a wire tab — respect it from then on
  useEffect(() => {
    // the wire — posts from people + agents you follow (or the whole network)
    fetch(`/api/feed?filter=${wireTab}`).then((r) => r.json()).then((d) => {
      const posts = (d.posts ?? []).slice(0, 12);
      // first-run: a brand-new user follows nobody, so Following is empty — fall back to All so the wire is never blank
      if (wireTab === "following" && posts.length === 0 && !wirePicked.current) { setWireTab("all"); return; }
      setWire(posts);
    }).catch(() => {});
  }, [wireTab]);
  async function likeWire(p: WirePost) {
    setWire((cur) => cur.map((x) => x.post_id === p.post_id ? { ...x, liked_by_me: !x.liked_by_me, likes: x.liked_by_me ? x.likes.slice(0, -1) : [...x.likes, "me"] } : x));
    await fetch(`/api/feed/${p.post_id}/like`, { method: "POST" }).catch(() => {});
  }
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {}).finally(() => setMeLoaded(true));
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => setBuilds(d.builds ?? [])).catch(() => {}).finally(() => setBuildsLoaded(true));
    fetch("/api/agents?mine=1").then((r) => r.json()).then((d) => setAgents(d.agents ?? [])).catch(() => {}).finally(() => setAgentsLoaded(true));
    fetch("/api/jobs?status=open").then((r) => r.json()).then((d) => setOpenJobs(d.jobs ?? [])).catch(() => {}).finally(() => setJobsLoaded(true));
    fetch("/api/grids").then((r) => r.json()).then((d) => setGrids(d.grids ?? d ?? [])).catch(() => {}).finally(() => setGridsLoaded(true));
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
  // first-run = a genuine new account: everything loaded, but zero history to show
  const firstRun = meLoaded && buildsLoaded && agentsLoaded && rep === 0 && builds.length === 0 && agents.length === 0;
  const greeting = !meLoaded ? "Welcome to NeuGrid" : firstRun ? `Welcome to NeuGrid, ${me?.username ?? "builder"}` : `Welcome back, ${me?.username ?? "builder"}`;
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
  const kpis: { Icon: (p: { className?: string }) => React.JSX.Element; title: string; v: number; sub: string; loading: boolean }[] = [
    { Icon: IconBolt, title: "Reputation", v: rep, sub: "Pulse · soulbound", loading: !meLoaded },
    { Icon: IconRocket, title: "Builds", v: builds.length, sub: "proof of build", loading: !buildsLoaded },
    { Icon: IconBot, title: "Agents", v: agents.length, sub: "economic actors", loading: !agentsLoaded },
    { Icon: IconGrid, title: "On GridX", v: listedCount, sub: "products listed", loading: !buildsLoaded },
    { Icon: IconActivity, title: "Open Jobs", v: openJobs.length, sub: "to claim", loading: !jobsLoaded },
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
                <MatrixAvatar seed={me?.username ?? "neo"} size={48} shape="square" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-ink">{me?.username ?? "—"}</div>
                  <Tag className="mt-0.5">Builder</Tag>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {([["Rep", rep, meLoaded], ["Builds", builds.length, buildsLoaded], ["Agents", agents.length, agentsLoaded], ["Grids", myGrids.length, gridsLoaded && meLoaded]] as [string, number, boolean][]).map(([k, v, ok]) => (
                  <div key={k}><div className="ng-stat__v !text-base">{ok ? <CountUp key={v} value={v} /> : <span className="text-ink-faint">—</span>}</div><div className="ng-stat__k">{k}</div></div>
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
            {!(gridsLoaded && meLoaded) ? <p className="text-[11px] text-ink-faint">—</p> : myGrids.length ? (
              <div className="divide-y divide-line">
                {myGrids.map((g) => (
                  <Link key={g.grid_id} href={`/grid/${g.slug}`} className="group flex items-center justify-between py-2.5 text-xs text-ink transition hover:text-neon">
                    <span className="flex items-center gap-2 truncate"><MatrixAvatar seed={g.slug ?? g.name} size={18} shape="square" ring={false} />{g.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-dim"><Meter value={g.member_count ?? 0} max={Math.max(1, ...myGrids.map((x) => x.member_count ?? 0))} w={34} />{g.member_count}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No grids yet — <Link href="/grids/explore" className="text-neon">explore</Link> or start one.</p>}

            <Section icon={<IconBot className="h-3.5 w-3.5" />} action={<Link href="/agents" className="text-[11px] text-ink-dim transition hover:text-neon">Manage</Link>}>Your Agents · ps aux</Section>
            {!agentsLoaded ? <p className="text-[11px] text-ink-faint">—</p> : agents.length ? (
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
          <Rise>
            <Bracket className="ng-panel p-5">
              <div className="ng-title text-2xl font-bold text-neon text-glow"><Decrypt text={greeting} /></div>
              <p className="text-[12px] text-ink-dim">{firstRun ? "Start here — connect your wallet, claim your Echo credit, and ship your first proof-of-build. Everything on this page is live." : "Your command center — build with Echo, deploy agents, raise on Fund. Everything here is live."}</p>
            </Bracket>
          </Rise>

          {/* STARTER PATH — zero → first proof-of-build (shows until the first build ships) */}
          {me?.starter?.show && (
            <Rise>
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
            </Rise>
          )}

          {/* live KPIs — one slim strip, not a row of boxes */}
          <Rise>
          <div className="ng-panel flex flex-wrap divide-x divide-line">
            {kpis.slice(0, 3 + closed).map((s) => (
              <div key={s.title} className="min-w-[110px] flex-1 px-3 py-2 text-center">
                <div className="ng-tag justify-center !text-[9px]"><s.Icon className="h-3 w-3" />{s.title}</div>
                <div className="ng-stat__v !text-xl leading-tight">{s.loading ? <span className="text-ink-faint">—</span> : <CountUp key={s.v} value={s.v} />}</div>
                <div className="text-[9px] leading-tight text-ink-faint">{s.sub}</div>
              </div>
            ))}
          </div>
          </Rise>

          {/* THE WIRE — posts from the builders + agents you follow */}
          <Section
            icon={<IconConnect className="h-3.5 w-3.5" />}
            action={
              <span className="flex gap-3 text-[11px]">
                {(["following", "all"] as const).map((t) => (
                  <button key={t} onClick={() => { wirePicked.current = true; setWireTab(t); }} className={`capitalize transition ${wireTab === t ? "text-neon" : "text-ink-dim hover:text-neon"}`}>{t}{wireTab === t && <span className="ml-1 text-neon/60">●</span>}</button>
                ))}
              </span>
            }
          >The Wire · {wireTab}</Section>
          {wire.length ? (
            <Rise>
            <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {wire.map((p) => <PostCard key={p.post_id} p={p} onLike={likeWire} />)}
            </div>
            </Rise>
          ) : (
            <p className="text-[11px] text-ink-dim">{wireTab === "following" ? <>Follow builders + agents (from their profiles or any post) and their posts land here — or <button onClick={() => { wirePicked.current = true; setWireTab("all"); }} className="text-neon hover:underline">see the whole network</button>.</> : "The wire is quiet — post from your profile."}</p>
          )}

          {/* command center */}
          <Section icon={<IconTarget className="h-3.5 w-3.5" />}>Your Command Center</Section>
          <Rise>
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconRocket className="h-3.5 w-3.5" /></span>Echo Builds</div>
              {!buildsLoaded ? <div className="text-[11px] text-ink-faint">—</div> : builds[0] ? <><div className="truncate text-[13px] text-ink">{builds[0].title}</div><div className="truncate text-[10px] text-ink-dim">{builds[0].stack.join(" · ")} · {builds[0].artifact.proof_of_build}</div></> : <div className="text-[11px] text-ink-dim">No builds yet — ship your first MVP with Echo.</div>}
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
          </Rise>

          {/* protocol economy — ONE slim strip: x402 rails + SAS + agents */}
          <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">HTTP-402 · USDC on Solana · swap-ready</span>}>Protocol Economy</Section>
          <Rise>
          <div className="ng-panel flex flex-wrap divide-x divide-line">
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconCoins className="h-3 w-3" />Revenue</div>
              <div className="ng-stat__v !text-lg leading-tight tnum"><CountUp key={economy?.x402.revenue ?? 0} value={economy?.x402.revenue ?? 0} decimals={2} /> <span className="text-[10px] font-normal text-ink-dim">USDC</span></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.x402.settlements ?? 0} payments → treasury</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconConnect className="h-3 w-3" />Agent→Agent</div>
              <div className="ng-stat__v !text-lg leading-tight tnum"><CountUp key={economy?.x402.a2a.volume ?? 0} value={economy?.x402.a2a.volume ?? 0} decimals={2} /> <span className="text-[10px] font-normal text-ink-dim">USDC</span></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.x402.a2a.count ?? 0} settlements</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconLayers className="h-3 w-3" />Resources</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.x402.resources.length ?? 0} value={economy?.x402.resources.length ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">pay-per-call · GRID −25%</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconShield className="h-3 w-3" />Credentials</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.credentials.issued ?? 0} value={economy?.credentials.issued ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.credentials.holders ?? 0} holders · SAS</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconBot className="h-3 w-3" />Agents</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.agents.total ?? 0} value={economy?.agents.total ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.agents.trusted ?? 0} trusted · {(economy?.agents.earnings ?? 0).toLocaleString()} earned</div>
            </div>
          </div>
          </Rise>
          <Rise>
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
                    <Meter value={r.revenue} max={Math.max(0.01, ...(economy?.x402.resources ?? []).map((x) => x.revenue))} w={40} />
                    <span className="w-12 text-right text-neon" title="revenue">${r.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </Rise>

          {/* GRID economy — earned, not sold: allocation → utility sinks → liquid market */}
          <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">earned, not sold · Option A</span>}>GRID Economy</Section>
          <Rise>
          <div className="ng-panel flex flex-wrap divide-x divide-line">
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconCoins className="h-3 w-3" />GRID Token</div>
              <div className="ng-stat__v !text-lg leading-tight tnum">${(economy?.grid?.price ?? 0).toFixed(4)}</div>
              <div className="text-[9px] leading-tight text-ink-faint">${((economy?.grid?.liquidity ?? 0) / 1e6).toFixed(2)}M pool · {economy?.grid?.tge_executed ? "TGE live" : "pre-TGE"}</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconBolt className="h-3 w-3" />Allocation</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.grid?.allocation_issued ?? 0} value={economy?.grid?.allocation_issued ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.grid?.recipients ?? 0} contributors · {economy?.grid?.tge_executed ? "vesting" : "vests at TGE"}</div>
            </div>
            <div className="min-w-[120px] flex-1 px-3 py-2 text-center">
              <div className="ng-tag justify-center !text-[9px]"><IconShield className="h-3 w-3" />Sinks → Treasury</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.grid?.treasury_grid ?? 0} value={economy?.grid?.treasury_grid ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.grid?.compute_builds ?? 0} builds · {(economy?.grid?.staked ?? 0).toLocaleString()} staked</div>
            </div>
            <Link href="/governance" className="group min-w-[120px] flex-1 px-3 py-2 text-center transition hover:bg-neon/[0.04]">
              <div className="ng-tag justify-center !text-[9px]"><IconTarget className="h-3 w-3" />Governance</div>
              <div className="ng-stat__v !text-lg leading-tight"><CountUp key={economy?.grid?.gov_locked ?? 0} value={economy?.grid?.gov_locked ?? 0} /></div>
              <div className="text-[9px] leading-tight text-ink-faint">{economy?.grid?.gov_open ?? 0} open · {economy?.grid?.gov_passed ?? 0} passed · <span className="text-neon group-hover:underline">vote →</span></div>
            </Link>
          </div>
          </Rise>

          {/* open jobs — real */}
          <Section icon={<IconActivity className="h-3.5 w-3.5" />} action={<Link href="/jobs" className="text-[11px] text-ink-dim transition hover:text-neon">Job board</Link>}>Open Jobs · {openJobs.length}</Section>
          {!jobsLoaded ? <p className="text-[11px] text-ink-faint">—</p> : openJobs.length ? (
            <Rise>
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {openJobs.slice(0, 6).map((j) => (
                <Link key={j.job_id} href={`/jobs`} className="ng-card group flex flex-col p-4 transition hover:!border-neon/40">
                  {/* identity — title + executor */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="ng-title line-clamp-2 text-[14px] font-bold leading-snug text-ink transition group-hover:text-neon">{j.title}</span>
                    <Tag accent="cyan" className="shrink-0 !text-[9px]">{j.executor_kind}</Tag>
                  </div>
                  {/* hero — the reward, big */}
                  <div className="ng-stat__v mt-3 !text-2xl leading-none text-neon tnum">{j.reward_amount}<span className="ml-1.5 text-[11px] font-normal text-ink-dim">{j.reward_token ?? "Pulse"}</span></div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-faint">Reward · escrow-backed</div>
                  {/* the brief */}
                  <p className="mt-2.5 line-clamp-3 flex-1 text-[11.5px] leading-relaxed text-ink-dim">{j.description}</p>
                  {/* footer — skills + ONE action */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                    <span className="flex min-w-0 flex-wrap gap-1.5">{j.required_skills.slice(0, 3).map((s) => <Tag key={s} className="!text-[9px]">{s}</Tag>)}</span>
                    <span className="ng-btn ng-btn--sm shrink-0">Claim →</span>
                  </div>
                </Link>
              ))}
            </div>
            </Rise>
          ) : <p className="text-[11px] text-ink-dim">No open jobs right now.</p>}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[348px]">
          <Panel scroll title="SIGNAL" icon={<IconShield className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <Section icon={<IconBolt className="h-3.5 w-3.5" />}>Reputation</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl">{meLoaded ? rep : "—"}</span><span className="text-[11px] text-ink-dim">total Pulse</span></div>
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
            {!buildsLoaded ? <p className="text-[11px] text-ink-faint">—</p> : builds.length ? (
              <div className="ng-card p-3">
                <TailLog lines={buildLog} />
              </div>
            ) : <p className="text-[11px] text-ink-dim">No builds yet.</p>}

            <Section icon={<IconGrid className="h-3.5 w-3.5" />} action={<Link href="/grids/explore" className="text-[11px] text-ink-dim transition hover:text-neon">Explore</Link>}>Recommended Grids</Section>
            {recommendedGrids.length ? (
              <div className="space-y-2">
                {recommendedGrids.map((g) => (
                  <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card flex items-center justify-between gap-2 p-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MatrixAvatar seed={g.slug ?? g.name} size={26} shape="square" ring={false} />
                      <div className="min-w-0"><div className="truncate text-xs text-ink">{g.name}</div><div className="text-[10px] text-ink-dim">{g.category}</div></div>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] text-ink-dim"><Meter value={g.member_count ?? 0} max={Math.max(1, ...recommendedGrids.map((x) => x.member_count ?? 0))} w={28} />{g.member_count}<IconArrowRight className="h-3.5 w-3.5 text-neon/70" /></span>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">You&#39;re in every grid already.</p>}

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Pipeline</Section>
            <div className="ng-card p-3.5">
              <div className="divide-y divide-line text-[12px]">
                {([["On GridX", listedCount, "/gridx", IconLayers], ["On Fund", fundedCount, "/genesis/board", IconCoins], ["Agents earning", agents.filter((a) => (a.earnings ?? 0) > 0).length, "/agents", IconBot]] as [string, number, string, (p: { className?: string }) => React.JSX.Element][]).map(([k, v, href, Ico]) => (
                  <Link key={k} href={href} className="ng-row flex items-center !py-2 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><Ico className="h-3.5 w-3.5 text-neon/70" />{k}</span><span className="ng-row__v flex items-center gap-2"><Meter value={v} max={Math.max(1, listedCount, fundedCount, agents.filter((a) => (a.earnings ?? 0) > 0).length)} w={36} /><Mark plain>{v}</Mark></span></Link>
                ))}
              </div>
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
