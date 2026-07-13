"use client";

/**
 * /rewards — the earning dashboard (2026-07-03, founder-spec'd): activity →
 * Pulse → GRID made visible. The accrual curve, weekly activity, the reward
 * feed, the published EARNING SCHEDULE, referrals + the affiliate fee share,
 * and TGE/vesting — every number derived from the real event log.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import { Panel, Mark, DataRow, IconCoins, IconSparkle, IconUser, IconActivity , kpiColor } from "@/components/app/ui";
import { Area, Bars, StepArea, LabeledBars, Donut, RadialProgress } from "@/components/app/charts";
import { PanelChart } from "@/components/app/terminal";
import { CountUp, Decrypt } from "@/components/app/typefx";
import ShareButton from "@/components/app/ShareButton";

type ScheduleRow = { action: string; pulse: number | null; formula?: string; dimension: string };
type HumanityState = {
  tier: number; tier_name: string;
  signals: { wallet_age_days?: number; tx_count?: number; checked_at: string } | null;
  attestation: { provider: string; ref?: string; at: string } | null;
  thresholds: { wallet_age_days: number; tx_count: number };
  gates: { starter: { required: number; ok: boolean }; rewards: { required: number; ok: boolean } };
};
type Bucket = "community" | "treasury" | "team" | "liquidity";
type Payload = {
  me: { id: string };
  supply: {
    total_supply: number; split: Record<Bucket, number>; pools: Record<Bucket, number>;
    minted: number; emitted: number; minted_pct_of_pool: number; recipients: number;
    claimed: number; circulating: number; circulating_pct: number;
    burned: number; liquidity_grid: number; community_remaining: number;
    tge_executed: boolean; price_usd: number; market_cap_usd: number;
  };
  emission: {
    epoch: number; epoch_days: number; ends_in_days: number; elapsed_pct: number;
    budget: number; remaining_pool: number; emitted_total: number; epochs_run: number;
    active_earners: number; epoch_activity: number; tge_executed: boolean;
    projected: { id: string; username: string; activity: number; share_pct: number; grid: number }[];
  };
  ledger: {
    accrued: number; sybil_adjusted: number; affiliate_grid: number; total_allocation: number; sybil_factor: number; claimed: number; rate: number;
    counted: number; pending_verification: number;
    humanity: { tier: number; required: number; ok: boolean };
    breakdown: { dimension: string; units: number; events: number }[];
    tge: { executed: boolean } | { executed: boolean; at: string };
    vesting: { total: number; released: number; claimable: number; vested_pct: number; unlock_pct: number; cliff_days: number; duration_days: number } | null;
  };
  accrual: number[];
  weekly: number[];
  daily: number[];
  feed: { action: string; reason: string; pulse: number; grid: number; at: string }[];
  schedule: ScheduleRow[];
  referrals: {
    code?: string; verified: number; pending: number;
    referrals: { id: string; username: string; joined: string; verified_at?: string; fees_usd: number }[];
    affiliate: { share_bps: number; fees_usd: number; share_usd: number; grid: number };
  };
};

/** compact GRID formatting: 36_900_000_000 → "36.9B". */
const compact = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

// the supply allocation buckets, in draw order — green-tier fills (green-only lock)
const BUCKETS: [Bucket, string, string][] = [
  ["community", "rgba(0,255,0,0.85)", "earned over ~10y"],
  ["treasury", "rgba(0,255,0,0.46)", "liquidity · insurance · ops"],
  ["team", "rgba(0,255,0,0.28)", "long vest"],
  ["liquidity", "rgba(0,255,0,0.15)", "market"],
];

export default function RewardsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [hum, setHum] = useState<HumanityState | null>(null);
  const [humBusy, setHumBusy] = useState(false);
  const [civicMsg, setCivicMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [settling, setSettling] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  useEffect(() => {
    const load = () => fetch("/api/rewards").then((r) => r.json()).then(setData).catch(() => {});
    load();
    fetch("/api/humanity").then((r) => r.json()).then(setHum).catch(() => {});
    window.addEventListener("neugrid:refresh-me", load);
    return () => window.removeEventListener("neugrid:refresh-me", load);
  }, []);

  async function refreshHumanity() {
    if (humBusy) return;
    setHumBusy(true);
    try {
      const r = await fetch("/api/humanity/refresh", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (d?.state) setHum(d.state);
    } finally { setHumBusy(false); }
  }

  async function checkCivic() {
    if (humBusy) return;
    setHumBusy(true);
    setCivicMsg(null);
    try {
      const r = await fetch("/api/humanity/civic", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (d?.state) setHum(d.state);
      if (r.ok) setCivicMsg("Verified — you're tier 2. Everything you've earned counts.");
      else setCivicMsg(d?.error === "no_valid_pass" ? "No pass on your wallet yet — get one first (link above), then re-check."
        : d?.error === "connect_wallet_first" ? "Connect your wallet first (top right)."
        : d?.error === "invalid_wallet" ? "Your session wallet isn't a real Solana address — connect a wallet first."
        : "Civic check unavailable right now — try again shortly.");
    } finally { setHumBusy(false); }
  }

  const refLink = data?.referrals.code && typeof window !== "undefined"
    ? `${window.location.origin}/?ref=${encodeURIComponent(data.referrals.code)}`
    : "";
  const copyLink = async () => {
    if (!refLink) return;
    try { await navigator.clipboard.writeText(refLink); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  // demo-only: settle the current emission epoch now (production settles on schedule via the cron)
  const settleEpoch = async () => {
    if (settling) return;
    setSettling(true);
    try {
      await fetch("/api/emission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settle" }) });
      fetch("/api/rewards").then((r) => r.json()).then(setData).catch(() => {});
    } finally { setSettling(false); }
  };
  const isDev = process.env.NODE_ENV === "development";

  const l = data?.ledger;
  const s = data?.supply;
  const emi = data?.emission;

  // ── side-rail chart data (all derived from the real ledger/event log) ──
  const accrual = data?.accrual ?? [];
  const daily = data?.daily ?? [];
  const heatMax = Math.max(1, ...daily);
  const dailyTotal = daily.reduce((a, b) => a + b, 0);
  const breakdown = l?.breakdown ?? [];
  const srcUnits = breakdown.map((b) => b.units);
  const srcTotal = srcUnits.reduce((a, b) => a + b, 0);
  const srcMax = Math.max(1, ...srcUnits);
  // the earning schedule as a bar chart: fixed-GRID earners (sorted), reward-scaled
  // actions (no fixed value → chips), and penalties (reputation hits, in red)
  const rate = data?.ledger.rate ?? 10;
  const sched = data?.schedule ?? [];
  const schedFixed = sched.filter((r) => r.pulse !== null && r.pulse > 0).map((r) => ({ action: r.action, grid: (r.pulse as number) * rate })).sort((a, b) => b.grid - a.grid);
  const schedScaled = sched.filter((r) => r.pulse === null);
  const schedPenalty = sched.filter((r) => (r.pulse ?? 0) < 0).map((r) => ({ action: r.action, pulse: r.pulse as number }));
  const schedGridMax = Math.max(1, ...schedFixed.map((r) => r.grid));
  const schedPenMax = Math.max(1, ...schedPenalty.map((r) => Math.abs(r.pulse)));
  const srcBars = breakdown.map((b) => ({ label: b.dimension, value: b.units }));
  const refVerified = data?.referrals.verified ?? 0;
  const refPending = data?.referrals.pending ?? 0;
  const refTotal = refVerified + refPending;
  // claim/vesting progress: claimed vs allocation if present, else vested_pct
  const claimPct = l && (l.total_allocation ?? 0) > 0
    ? Math.round(((l.claimed ?? 0) / l.total_allocation) * 100)
    : (l?.vesting ? Math.round(l.vesting.vested_pct) : 0);
  const hasClaimData = !!l && ((l.total_allocation ?? 0) > 0 || !!l.vesting);

  const kpis: [string, number, string?][] = [
    ["GRID Allocation", l?.total_allocation ?? 0],
    ["Claimable Now", l?.vesting?.claimable ?? 0],
    ["Verified Referrals", data?.referrals.verified ?? 0],
    ["Affiliate GRID", data?.referrals.affiliate.grid ?? 0],
    ["Reward Events", data?.feed.length ?? 0],
  ];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Rewards" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — HOW YOU EARN: the published schedule */}
        <OrbPanel side="left" label="How to earn" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="THE EARNING SCHEDULE" icon={<IconCoins className="h-4 w-4" />} bodyClass="p-3.5">
            <p className="mb-3 text-[10.5px] leading-relaxed text-ink-dim">Every verified action earns Pulse; each Pulse point = <Mark plain>{l?.rate ?? 10} GRID</Mark> allocation, sybil-filtered, vesting at TGE. Earned, never sold.</p>

            <PanelChart title="Accrual · cumulative GRID" read={accrual.length > 1 ? `${(accrual[accrual.length - 1] ?? 0).toLocaleString()} GRID` : undefined}>
              {accrual.length > 1
                ? <div className="py-1"><StepArea data={accrual} gid="rw-acc" h={52} /></div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">No accrual yet</p>}
            </PanelChart>

            <PanelChart title="Sources · GRID by activity" read={srcTotal > 0 ? `${srcTotal.toLocaleString()} units` : undefined}>
              {srcTotal > 0
                ? <div className="py-1"><LabeledBars data={srcBars} /></div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">No sources yet</p>}
            </PanelChart>

            <div className="mt-4">
              <div className="ng-label mb-2 !text-[10px] !text-ink-dim">GRID per action</div>
              <div className="space-y-1.5">
                {schedFixed.map((r) => (
                  <div key={r.action} className="flex items-center gap-2">
                    <span className="w-[104px] shrink-0 truncate text-[10px] text-ink" title={r.action}>{r.action}</span>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-[2px] bg-neon/[0.06]">
                      <div className="h-full rounded-[2px] bg-neon/70" style={{ width: `${Math.max(4, (r.grid / schedGridMax) * 100)}%` }} />
                    </div>
                    <span className="w-[44px] shrink-0 text-right text-[10px] font-bold tnum text-neon">{r.grid}</span>
                  </div>
                ))}
              </div>

              {schedScaled.length > 0 && (
                <>
                  <div className="ng-label mb-1.5 mt-3.5 !text-[10px] !text-ink-dim">Reward-scaled</div>
                  <div className="flex flex-wrap gap-1.5">
                    {schedScaled.map((r) => (
                      <span key={r.action} className="rounded-[2px] border border-neon/25 px-1.5 py-0.5 text-[9px] text-ink-dim" title={r.formula ?? undefined}>{r.action}</span>
                    ))}
                  </div>
                </>
              )}

              {schedPenalty.length > 0 && (
                <>
                  <div className="ng-label mb-1.5 mt-3.5 !text-[10px] !text-ink-dim">Penalties · reputation</div>
                  <div className="space-y-1.5">
                    {schedPenalty.map((r) => (
                      <div key={r.action} className="flex items-center gap-2">
                        <span className="w-[104px] shrink-0 truncate text-[10px] text-red-400/90" title={r.action}>{r.action}</span>
                        <div className="relative h-3 flex-1 overflow-hidden rounded-[2px] bg-red-500/10">
                          <div className="h-full rounded-[2px]" style={{ width: `${(Math.abs(r.pulse) / schedPenMax) * 100}%`, background: "#ff4d5e" }} />
                        </div>
                        <span className="w-[44px] shrink-0 text-right text-[10px] font-bold tnum text-red-400">{r.pulse}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — the earning picture */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Rewards" /></h1>
            <p className="mt-1 text-sm text-ink-dim">Your activity → Pulse → GRID. Allocation is earned by verified work and converts at the TGE.</p>
          </div>

          {/* SUPPLY HERO — the fixed-cap 36.9B picture: minted only by real work */}
          {s && (
            <div className="ng-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="ng-label !text-ink-dim">GRID · total supply</div>
                  <div className="ng-stat__v !text-4xl leading-none text-neon text-glow-soft">
                    {compact(s.total_supply)}
                    <span className="ml-2 align-middle text-[11px] font-normal text-ink-faint">{s.total_supply.toLocaleString()} · fixed cap</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-dim">Minted only by verified work — <Mark plain>earned, not sold</Mark>. No sale, no VC.</p>
                </div>
                <div className="text-right">
                  <div className="ng-stat__v !text-xl text-cyan">${s.price_usd.toFixed(3)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint">GRID price · mcap ${compact(s.market_cap_usd)}</div>
                </div>
              </div>

              {/* allocation bar — the four buckets by width */}
              <div className="mt-4 flex h-6 w-full overflow-hidden rounded-sm border border-line">
                {BUCKETS.map(([key, color]) => (
                  <div key={key} className="border-r border-black/70 last:border-r-0"
                    style={{ width: `${(s.pools[key] / s.total_supply) * 100}%`, background: color }}
                    title={`${key}: ${s.pools[key].toLocaleString()} GRID`} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-dim">
                {BUCKETS.map(([key, color, note]) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 shrink-0" style={{ background: color }} />
                    <span className="capitalize text-ink">{key}</span>
                    <span className="text-neon">{compact(s.pools[key])}</span>
                    <span className="text-ink-faint">· {note}</span>
                  </span>
                ))}
              </div>

              {/* minted-by-activity progress within the community pool */}
              <div className="mt-4">
                <div className="mb-1 flex items-baseline justify-between text-[11px]">
                  <span className="text-ink-dim">Minted by activity so far</span>
                  <span className="text-ink-faint">{compact(s.minted)} of {compact(s.pools.community)} community pool</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-neon/10">
                  <div className="h-full bg-neon" style={{ width: `${Math.max(0.5, Math.min(100, s.minted_pct_of_pool * 100))}%` }} />
                </div>
                <p className="mt-1 text-[9.5px] text-ink-faint">{(s.minted_pct_of_pool * 100).toFixed(4)}% tapped — {compact(s.community_remaining)} GRID still to be earned by the community.</p>
              </div>

              {/* supply stat tiles */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ["Minted by activity", s.minted, "neon", `${s.recipients} earner${s.recipients === 1 ? "" : "s"}`],
                  ["In circulation", s.circulating, "cyan", `${(s.circulating_pct * 100).toFixed(2)}% of supply`],
                  ["Burned", s.burned, "neon", "buyback & burn"],
                  ["Still to earn", s.community_remaining, "neon", "community pool"],
                ] as const).map(([k, v, tone, sub]) => (
                  <div key={k} className="rounded-sm border border-line p-3 text-center">
                    <div className={`ng-stat__v !text-lg ${tone === "cyan" ? "text-cyan" : "text-neon"}`}>{compact(v)}</div>
                    <div className="ng-stat__k">{k}</div>
                    <div className="mt-0.5 text-[8.5px] uppercase tracking-wide text-ink-faint">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CONTINUOUS EMISSIONS — the post-TGE mint that keeps releasing the pool by activity */}
          {emi && (
            <div className="ng-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="ng-label !text-ink-dim">Continuous emissions · epoch {emi.epoch}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-faint">{emi.epochs_run} epoch{emi.epochs_run === 1 ? "" : "s"} run · {compact(emi.emitted_total)} released</div>
              </div>
              <p className="mt-1 text-[11px] text-ink-dim">Every {emi.epoch_days} days the community pool releases a slice, split among that epoch&apos;s earners <Mark plain>by activity</Mark> — minting keeps flowing from usage, forever, within the cap.</p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([
                  ["This epoch releases", compact(emi.budget), `of ${compact(emi.remaining_pool)} left`],
                  ["Your projected share", compact(emi.projected.find((p) => p.id === data?.me.id)?.grid ?? 0), `${((emi.projected.find((p) => p.id === data?.me.id)?.share_pct ?? 0) * 100).toFixed(0)}% of activity`],
                  ["Active earners", `${emi.active_earners}`, "this epoch"],
                  ["Released to date", compact(emi.emitted_total), `over ${emi.epochs_run} epoch${emi.epochs_run === 1 ? "" : "s"}`],
                ] as const).map(([k, v, sub]) => (
                  <div key={k} className="rounded-sm border border-line p-3 text-center">
                    <div className="ng-stat__v !text-lg text-neon">{v}</div>
                    <div className="ng-stat__k">{k}</div>
                    <div className="mt-0.5 text-[8.5px] uppercase tracking-wide text-ink-faint">{sub}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-baseline justify-between text-[10px] text-ink-faint">
                  <span>epoch {emi.epoch} progress</span>
                  <span>{emi.ends_in_days}d to the release</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-neon/10">
                  <div className="h-full bg-neon/70" style={{ width: `${emi.elapsed_pct}%` }} />
                </div>
              </div>

              {emi.projected.length > 0 && (
                <div className="mt-4">
                  <div className="ng-label mb-1.5 !text-[10px] !text-ink-dim">Projected split · this epoch</div>
                  <div className="divide-y divide-line">
                    {emi.projected.slice(0, 5).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
                        <span className="flex min-w-0 items-center gap-2"><MatrixAvatar seed={p.username} size={20} shape="square" /><span className="truncate text-ink">{p.username}</span></span>
                        <span className="flex shrink-0 items-center gap-3"><span className="text-ink-faint">{(p.share_pct * 100).toFixed(0)}%</span><span className="text-neon">{compact(p.grid)} GRID</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isDev && (
                <button onClick={settleEpoch} disabled={settling} className="ng-btn ng-btn-primary ng-btn--sm mt-4 disabled:opacity-40">{settling ? "Settling…" : "Settle this epoch now (demo)"}</button>
              )}
            </div>
          )}

          {/* KPIs — 3 by default, +1 per collapsed panel */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map(([k, v, unit], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}>{unit === "$" && <span className="opacity-60">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {/* the accrual curve + weekly activity */}
          <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
            <div className="ng-card p-4">
              <div className="mb-1 flex items-baseline justify-between">
                <div className="ng-label !text-ink-dim">GRID accrual</div>
                <span className="text-[10px] text-ink-faint">sybil factor ×{l?.sybil_factor ?? 1}</span>
              </div>
              <div className="ng-stat__v !text-xl"><CountUp key={l?.accrued ?? 0} value={l?.accrued ?? 0} /> <span className="text-[11px] font-normal text-ink-faint">accrued → {l?.sybil_adjusted ?? 0} allocated{(l?.affiliate_grid ?? 0) > 0 ? ` + ${l?.affiliate_grid} affiliate` : ""}</span></div>
              <Area data={data?.accrual ?? [0, 0]} gid="rw-accrual" w={340} h={96} />
            </div>
            <div className="ng-card p-4">
              <div className="ng-label mb-1 !text-ink-dim">Reward activity · 12 weeks</div>
              <div className="ng-stat__v !text-xl"><CountUp key={(data?.weekly ?? []).reduce((a, b) => a + b, 0)} value={(data?.weekly ?? []).reduce((a, b) => a + b, 0)} /> <span className="text-[11px] font-normal text-ink-faint">earning events</span></div>
              <Bars data={data?.weekly ?? [0]} w={340} h={96} />
            </div>
          </div>

          {/* breakdown by source */}
          {l && l.breakdown.length > 0 && (
            <div className="ng-card p-4">
              <div className="ng-label mb-2 !text-ink-dim">Where your GRID comes from</div>
              <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                {l.breakdown.map((b) => (
                  <div key={b.dimension} className="ng-row !py-1.5">
                    <span className="ng-row__k capitalize">{b.dimension}</span>
                    <span className="flex items-center gap-2">
                      <Meter value={b.units} max={srcMax} w={44} />
                      <span className="ng-row__v !text-neon">{b.units.toLocaleString()} <span className="text-[9px] font-normal text-ink-faint">({b.events})</span></span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EARNING ACTIVITY — a contribution calendar of GRID earned (visual, not a text wall) + a compact recent strip */}
          <div className="ng-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="ng-label flex items-center gap-2 !text-ink-dim"><IconActivity className="h-3.5 w-3.5 text-neon" />Earning activity · 12 weeks</div>
              <span className="text-[10px] text-ink-faint">{compact(dailyTotal)} GRID</span>
            </div>
            <div className="flex items-end gap-3 overflow-x-auto">
              <div className="flex gap-[3px]">
                {Array.from({ length: 12 }).map((_, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, d) => {
                      const v = daily[w * 7 + d] ?? 0;
                      const ratio = v > 0 ? 0.2 + 0.8 * (Math.log1p(v) / Math.log1p(heatMax)) : 0;
                      return <div key={d} className="h-3.5 w-3.5 rounded-[2px]" title={v > 0 ? `${compact(v)} GRID` : "—"}
                        style={{ background: v > 0 ? `rgba(0,255,0,${ratio})` : "rgba(0,255,0,0.05)", border: "1px solid rgba(0,255,0,0.09)" }} />;
                    })}
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1 pb-0.5 text-[9px] text-ink-faint">less
                {[0.12, 0.35, 0.6, 0.9].map((o) => <span key={o} className="inline-block h-2 w-2 rounded-[1px]" style={{ background: `rgba(0,255,0,${o})` }} />)}more</div>
            </div>
            {(data?.feed ?? []).length === 0
              ? <p className="mt-3 py-3 text-center text-[11px] text-ink-dim">No earnings yet — the schedule on the left is the map.</p>
              : <div className="mt-4 border-t border-line pt-3">
                  <div className="ng-label mb-1.5 !text-[10px] !text-ink-dim">Recent</div>
                  <div className="divide-y divide-line">
                    {(data?.feed ?? []).slice(0, 6).map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: f.grid > 0 ? "#00ff00" : "#1e9c1e" }} />
                          <span className="truncate text-[11.5px] text-ink">{f.reason}</span>
                        </span>
                        {f.grid > 0
                          ? <span className="shrink-0 text-[11.5px] font-bold text-neon">+{compact(f.grid)} GRID</span>
                          : <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink-faint">rep</span>}
                      </div>
                    ))}
                  </div>
                </div>}
          </div>
        </main>

        {/* RIGHT — referrals + affiliate + vesting */}
        <OrbPanel side="right" label="Referrals" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="REFER & EARN" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            <p className="text-[10.5px] leading-relaxed text-ink-dim">Share your link. When someone you invited completes their <Mark plain>first verified work</Mark>, you earn +15 Pulse (150 GRID), they earn +5 — plus {((data?.referrals.affiliate.share_bps ?? 1000) / 100)}% of the protocol fees they generate for 12 months.</p>

            <PanelChart title="Referrals · verified vs pending" read={`${refTotal} invited`}>
              {refTotal > 0
                ? <><div className="flex items-center justify-center py-1"><Donut data={[refVerified, refPending]} colors={["#00ff00", "#ffb020"]} size={104} center={`${refTotal}`} /></div>
                    <div className="mt-1 flex justify-center gap-3 text-[9px] text-ink-faint"><span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5" style={{ background: "#00ff00" }} />verified {refVerified}</span><span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5" style={{ background: "#ffb020" }} />pending {refPending}</span></div></>
                : <p className="py-3 text-center text-[10px] text-ink-faint">No referrals yet — share your link below</p>}
            </PanelChart>

            <PanelChart title={l?.vesting ? "Vesting · % vested" : "Claim · % of allocation"} read={hasClaimData ? `${claimPct}%` : undefined}>
              {hasClaimData
                ? <div className="flex justify-center py-1"><RadialProgress percent={claimPct} value={`${claimPct}%`} size={104} /></div>
                : <p className="py-3 text-center text-[10px] text-ink-faint">Pre-TGE — nothing vested</p>}
            </PanelChart>

            <div className="mt-3 flex gap-2">
              <input readOnly value={refLink} className="ng-input flex-1 !text-[10.5px]" />
              <button onClick={copyLink} className="ng-btn ng-btn-primary ng-btn--sm shrink-0">{copied ? "Copied ✓" : "Copy"}</button>
              {refLink && <ShareButton url={refLink} text="Join me on NeuGrid — reputation you earn by real work, portable and verifiable." className="shrink-0" />}
            </div>

            <div className="mt-4 divide-y divide-line">
              <DataRow k="Verified referrals" v={<span className="flex items-center gap-2"><Meter value={refVerified} max={Math.max(1, refTotal)} w={32} />{refVerified}</span>} accent="neon" />
              <DataRow k="Pending (no work yet)" v={<span className="flex items-center gap-2"><Meter value={refPending} max={Math.max(1, refTotal)} w={32} color="#ffb020" />{refPending}</span>} />
              <DataRow k="Their protocol fees" v={`$${data?.referrals.affiliate.fees_usd ?? 0}`} />
              <DataRow k="Your affiliate share" v={<span className="flex items-center gap-2"><Meter value={data?.referrals.affiliate.share_usd ?? 0} max={Math.max(1, data?.referrals.affiliate.fees_usd ?? 0)} w={32} color="#48f5ff" />{`$${data?.referrals.affiliate.share_usd ?? 0} → ${data?.referrals.affiliate.grid ?? 0} GRID`}</span>} accent="cyan" />
            </div>

            {(data?.referrals.referrals ?? []).length > 0 && (
              <>
                <div className="ng-label mb-2 mt-4 !text-ink-dim">Your referrals</div>
                <div className="space-y-1.5">
                  {(data?.referrals.referrals ?? []).map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5 rounded border border-line px-2.5 py-2">
                      <MatrixAvatar seed={r.username} size={26} shape="square" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-ink">{r.username}</div>
                        <div className="text-[9px] text-ink-faint">joined {new Date(r.joined).toLocaleDateString()}</div>
                      </div>
                      {r.verified_at
                        ? <Mark plain accent="neon" className="!text-[9px]">verified</Mark>
                        : <Mark plain className="!text-[9px] !text-ink-faint">pending</Mark>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* PoH verification — gates reward COUNTING, never participation (docs/POH_GATE.md) */}
            <div className="ng-label mb-2 mt-5 flex items-center gap-2 !text-ink-dim"><IconUser className="h-3.5 w-3.5 text-neon" />Verification</div>
            {hum && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-ink">Humanity tier</span>
                  <Mark plain accent={hum.tier >= 2 ? "neon" : hum.tier === 1 ? "cyan" : undefined} className="!text-[10px]">T{hum.tier} · {hum.tier_name}</Mark>
                </div>
                <div className="mt-2 divide-y divide-line">
                  <DataRow k={`Wallet age (need ${hum.thresholds.wallet_age_days}d)`} v={hum.signals ? <span className="flex items-center gap-2"><Meter value={hum.signals.wallet_age_days ?? 0} max={Math.max(1, hum.thresholds.wallet_age_days)} w={32} color={(hum.signals.wallet_age_days ?? 0) >= hum.thresholds.wallet_age_days ? "#00ff00" : "#ffb020"} />{`${hum.signals.wallet_age_days ?? 0}d`}</span> : "—"} />
                  <DataRow k={`Transactions (need ${hum.thresholds.tx_count})`} v={hum.signals ? <span className="flex items-center gap-2"><Meter value={hum.signals.tx_count ?? 0} max={Math.max(1, hum.thresholds.tx_count)} w={32} color={(hum.signals.tx_count ?? 0) >= hum.thresholds.tx_count ? "#00ff00" : "#ffb020"} />{`${hum.signals.tx_count ?? 0}`}</span> : "—"} />
                  {hum.attestation && <DataRow k="Attested by" v={hum.attestation.provider} accent="neon" />}
                </div>
                <button onClick={refreshHumanity} disabled={humBusy} className="ng-btn ng-btn--sm ng-btn--block mt-2 justify-center disabled:opacity-40">{humBusy ? "Reading chain…" : "Refresh wallet signals"}</button>
                {!hum.attestation && (
                  <div className="mt-3 border-t border-line pt-2.5">
                    <div className="text-[10.5px] text-ink">Become a <Mark plain accent="neon" className="!text-[10px]">verified human</Mark> (tier 2)</div>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink-dim">One quick video selfie with Civic — no ID documents. One human = one counted reward ledger.</p>
                    <div className="mt-2 flex gap-2">
                      <a href="https://getpass.civic.com/?pass=unique&chain=solana" target="_blank" rel="noopener noreferrer" className="ng-btn ng-btn-cyan ng-btn--sm flex-1 justify-center">Get pass ↗</a>
                      <button onClick={checkCivic} disabled={humBusy} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-40">{humBusy ? "Checking…" : "Check my pass"}</button>
                    </div>
                    {civicMsg && <p className="mt-1.5 text-[10px] leading-relaxed text-ink-dim">{civicMsg}</p>}
                  </div>
                )}
                {hum.gates.rewards.required > 0 && !hum.gates.rewards.ok ? (
                  <p className="mt-2 text-[10px] leading-relaxed text-amber">Season rewards require tier {hum.gates.rewards.required}. Your {(l?.pending_verification ?? 0).toLocaleString()} GRID allocation is earned and safe — it counts the moment you verify (any time before the TGE).</p>
                ) : hum.gates.rewards.required > 0 ? (
                  <p className="mt-2 text-[10px] text-ink-faint">Verified — your allocation counts at the TGE.</p>
                ) : (
                  <p className="mt-2 text-[10px] text-ink-faint">Gates are open this season — verification is optional until governance turns it on.</p>
                )}
              </div>
            )}

            <div className="ng-label mb-2 mt-5 flex items-center gap-2 !text-ink-dim"><IconSparkle className="h-3.5 w-3.5 text-neon" />TGE &amp; vesting</div>
            {l?.vesting ? (
              <div>
                <div className="h-1.5 overflow-hidden rounded bg-neon/10">
                  <div className="h-full bg-neon/70" style={{ width: `${l.vesting.vested_pct}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-ink-dim">
                  <span>{l.vesting.vested_pct}% vested</span>
                  <span className="text-neon">{l.vesting.claimable} claimable</span>
                </div>
                <div className="mt-1 text-[9.5px] text-ink-faint">{l.vesting.unlock_pct}% TGE unlock · {l.vesting.cliff_days}d cliff · linear over {l.vesting.duration_days}d</div>
                <Link href="/me" className="ng-btn ng-btn--sm ng-btn--block mt-2.5">Claim on your profile →</Link>
              </div>
            ) : (
              <p className="text-[10.5px] leading-relaxed text-ink-dim">Pre-TGE: your allocation accrues non-transferably and converts at the one-time platform TGE (10% unlock · 180-day cliff · 2-year linear).</p>
            )}
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
