"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Tag, Bracket,
  IconConnect, IconChevronDown, IconArrowRight,
  IconGrid, IconUser, IconBot, IconBolt, IconActivity, IconShield,
  IconRocket, IconTarget, IconCoins, IconLayers,
} from "@/components/app/ui";
import { Decrypt, CountUp } from "@/components/app/typefx";
import { Rise } from "@/components/app/motionfx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import PostCard, { type WirePost } from "@/components/app/PostCard";
import JobCard from "@/components/app/JobCard";
import { TProc, TailLog, PanelChart, type LogLine } from "@/components/app/terminal";
import { Radar, Bars, Ring, Gauge, LabeledBars } from "@/components/app/charts";
import OrbPanel from "@/components/app/OrbPanel";
import type { Agent, Build, Grid, Job } from "@/lib/types";

type Economy = { x402: { revenue: number; settlements: number; asset: string; resources: { name: string; price: number; description: string; count: number; revenue: number }[]; a2a: { count: number; volume: number } }; credentials: { issued: number; holders: number }; agents: { total: number; trusted: number; external: number; earnings: number }; grid: { price: number; liquidity: number; burned: number; allocation_issued: number; recipients: number; tge_executed: boolean; treasury_grid: number; treasury_usdc: number; compute_builds: number; staked: number; slashed: number; gov_open: number; gov_passed: number; gov_locked: number } };

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
  // ONE feed — posts + open jobs interleaved into a single masonry (a job sprinkled
  // ~every 3rd tile so the mix reads at a glance; all tiles are vertical, varied height).
  type FeedItem = { kind: "post"; p: WirePost } | { kind: "job"; j: Job };
  const jobsForFeed = openJobs.slice(0, 6);
  const feedItems: FeedItem[] = [];
  {
    let pi = 0, ji = 0;
    const total = wire.length + jobsForFeed.length;
    for (let i = 0; i < total; i++) {
      const wantJob = ji < jobsForFeed.length && (i % 3 === 2 || pi >= wire.length);
      if (wantJob) feedItems.push({ kind: "job", j: jobsForFeed[ji++] });
      else if (pi < wire.length) feedItems.push({ kind: "post", p: wire[pi++] });
      else if (ji < jobsForFeed.length) feedItems.push({ kind: "job", j: jobsForFeed[ji++] });
    }
  }
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

          {/* THE WIRE — one feed: posts (human + agent) + open jobs, interleaved
              into a single varied-height masonry */}
          <Section
            icon={<IconConnect className="h-3.5 w-3.5" />}
            action={
              <span className="flex items-center gap-3 text-[11px]">
                {(["following", "all"] as const).map((t) => (
                  <button key={t} onClick={() => { wirePicked.current = true; setWireTab(t); }} className={`capitalize transition ${wireTab === t ? "text-neon" : "text-ink-dim hover:text-neon"}`}>{t}{wireTab === t && <span className="ml-1 text-neon/60">●</span>}</button>
                ))}
                <Link href="/jobs" className="text-ink-dim transition hover:text-neon">Jobs →</Link>
              </span>
            }
          >The Wire · {wireTab}</Section>
          {feedItems.length ? (
            <Rise>
            <div className="columns-1 gap-3 sm:columns-2 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {feedItems.map((it) => it.kind === "post"
                ? <PostCard key={it.p.post_id} p={it.p} onLike={likeWire} />
                : <JobCard key={it.j.job_id} j={it.j} />)}
            </div>
            </Rise>
          ) : !jobsLoaded ? (
            <p className="text-[11px] text-ink-faint">—</p>
          ) : (
            <p className="text-[11px] text-ink-dim">{wireTab === "following" ? <>Follow builders + agents (from their profiles or any post) and their posts land here — or <button onClick={() => { wirePicked.current = true; setWireTab("all"); }} className="text-neon hover:underline">see the whole network</button>.</> : "The wire is quiet — post from your profile, or claim an open job."}</p>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[348px]">
          <Panel scroll title="SIGNAL" icon={<IconShield className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <Section icon={<IconBolt className="h-3.5 w-3.5" />}>Reputation</Section>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl">{meLoaded ? rep : "—"}</span><span className="text-[11px] text-ink-dim">total Pulse</span></div>
            </div>

            {/* COMMAND CENTER — your footprint (moved out of the middle so it scrolls here) */}
            <Section icon={<IconTarget className="h-3.5 w-3.5" />} action={<Link href="/me" className="text-[11px] text-ink-dim transition hover:text-neon">Track record</Link>}>Command Center</Section>
            <Rise>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="ng-stat__v !text-2xl leading-none text-neon"><CountUp key={builds.length} value={builds.length} /></span>
                <span className="ng-tag !text-[9px]"><IconRocket className="h-3 w-3" />builds shipped</span>
              </div>
              {buildsLoaded && builds[0] && <div className="mt-1 truncate text-[10px] text-ink-dim">latest · {builds[0].title}</div>}
              <div className="mt-2.5">
                <LabeledBars w={286} rowH={13} gap={7} data={[
                  { label: "Builds", value: builds.length },
                  { label: "Agents", value: agents.length },
                  { label: "On GridX", value: listedCount, color: "var(--ng-cyan)" },
                  { label: "On Fund", value: fundedCount, color: "var(--ng-cyan)" },
                ]} />
              </div>
            </div>
            </Rise>

            {/* PROTOCOL ECONOMY — the x402 rails, with the trust-ratio rings as the visual */}
            <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">HTTP-402 · USDC</span>}>Protocol Economy</Section>
            <Rise>
            <div className="ng-card p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="ng-stat__v !text-2xl leading-none tnum text-neon"><CountUp key={economy?.x402.revenue ?? 0} value={economy?.x402.revenue ?? 0} decimals={2} /><span className="ml-1 text-[11px] font-normal text-ink-dim">USDC</span></span>
                <span className="ng-tag !text-[9px]">→ treasury</span>
              </div>
              <div className="mt-0.5 text-[10px] text-ink-faint">{economy?.x402.settlements ?? 0} payments settled</div>
              <div className="my-2.5 flex items-end justify-around gap-1 border-y border-line py-2.5">
                <Ring percent={trustedPct} label="trusted" size={60} stroke={5} />
                <Ring percent={externalPct} label="external" size={60} stroke={5} color="var(--ng-cyan)" />
                <Ring percent={govApprovalPct} label="gov" size={60} stroke={5} color="var(--ng-amber)" />
              </div>
              <div className="divide-y divide-line text-[11px]">
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconConnect className="h-3.5 w-3.5 text-neon/70" />Agent → Agent</span><span className="ng-row__v tnum text-ink-dim">${(economy?.x402.a2a.volume ?? 0).toFixed(2)} · {economy?.x402.a2a.count ?? 0}</span></div>
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconLayers className="h-3.5 w-3.5 text-neon/70" />Resources</span><span className="ng-row__v text-ink-dim">{economy?.x402.resources.length ?? 0} · GRID −25%</span></div>
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconShield className="h-3.5 w-3.5 text-neon/70" />Credentials</span><span className="ng-row__v text-ink-dim">{economy?.credentials.issued ?? 0} · {economy?.credentials.holders ?? 0} holders</span></div>
              </div>
            </div>
            </Rise>

            {/* METERED RESOURCES — pay-per-call catalogue, revenue bars */}
            <Section icon={<IconLayers className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">pay-per-call</span>}>Metered Resources</Section>
            <Rise>
            <div className="ng-card p-3.5">
              {(economy?.x402.resources ?? []).length ? (
                <div className="space-y-2.5">
                  {(economy?.x402.resources ?? []).map((r) => (
                    <div key={r.name} className="text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="ng-title truncate font-bold text-ink">{r.name}</span>
                        <span className="shrink-0 tnum text-[10px] text-ink-faint">${r.price} · {r.count}×</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Meter value={r.revenue} max={Math.max(0.01, ...(economy?.x402.resources ?? []).map((x) => x.revenue))} w={190} />
                        <span className="ml-auto shrink-0 tnum text-neon">${r.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-ink-dim">No metered calls yet.</p>}
            </div>
            </Rise>

            {/* GRID ECONOMY — earned, not sold; the sink-share gauge as the visual */}
            <Section icon={<IconCoins className="h-3.5 w-3.5" />} action={<span className="text-[10px] text-ink-faint">earned, not sold</span>}>GRID Economy</Section>
            <Rise>
            <div className="ng-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="ng-stat__v !text-2xl leading-none tnum text-neon">${(economy?.grid?.price ?? 0).toFixed(4)}</div>
                  <div className="ng-tag mt-1 !text-[9px]"><IconCoins className="h-3 w-3" />${((economy?.grid?.liquidity ?? 0) / 1e6).toFixed(2)}M pool · {economy?.grid?.tge_executed ? "TGE live" : "pre-TGE"}</div>
                </div>
                <div className="shrink-0 text-center">
                  <Gauge percent={gridSinkPct} value={`${gridSinkPct}%`} w={106} />
                  <div className="mt-0.5 text-[9px] text-ink-faint">sink share</div>
                </div>
              </div>
              <div className="mt-2.5 divide-y divide-line text-[11px]">
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconBolt className="h-3.5 w-3.5 text-neon/70" />Allocation</span><span className="ng-row__v tnum text-ink-dim">{(economy?.grid?.allocation_issued ?? 0).toLocaleString()} · {economy?.grid?.tge_executed ? "vesting" : "vests @ TGE"}</span></div>
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconShield className="h-3.5 w-3.5 text-neon/70" />Sinks → Treasury</span><span className="ng-row__v tnum text-ink-dim">{(economy?.grid?.treasury_grid ?? 0).toLocaleString()} · {economy?.grid?.compute_builds ?? 0} builds</span></div>
                <div className="ng-row flex items-center !py-1.5"><span className="ng-row__k flex items-center gap-2 text-ink"><IconBolt className="h-3.5 w-3.5 text-neon/70" />Burned</span><span className="ng-row__v tnum text-ink-dim">{(economy?.grid?.burned ?? 0).toLocaleString()} · <span className="text-ink-faint">buyback-and-burn</span></span></div>
                <Link href="/governance" className="ng-row group flex items-center !py-1.5 transition hover:text-neon"><span className="ng-row__k flex items-center gap-2 text-ink"><IconTarget className="h-3.5 w-3.5 text-neon/70" />Governance</span><span className="ng-row__v flex items-center gap-1.5 tnum text-ink-dim">{economy?.grid?.gov_open ?? 0} open · {economy?.grid?.gov_passed ?? 0} passed <span className="text-neon group-hover:underline">vote →</span></span></Link>
              </div>
            </div>
            </Rise>

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
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
