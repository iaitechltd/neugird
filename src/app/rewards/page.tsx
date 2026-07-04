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
import { Panel, Mark, DataRow, IconCoins, IconSparkle, IconUser, IconActivity , kpiColor } from "@/components/app/ui";
import { Area, Bars, StepArea, LabeledBars, Donut, RadialProgress } from "@/components/app/charts";
import { PanelChart } from "@/components/app/terminal";
import { CountUp, Decrypt } from "@/components/app/typefx";

type ScheduleRow = { action: string; pulse: number | null; formula?: string; dimension: string };
type Payload = {
  me: { id: string };
  ledger: {
    accrued: number; sybil_adjusted: number; affiliate_grid: number; total_allocation: number; sybil_factor: number; claimed: number; rate: number;
    breakdown: { dimension: string; units: number; events: number }[];
    tge: { executed: boolean } | { executed: boolean; at: string };
    vesting: { total: number; released: number; claimable: number; vested_pct: number; unlock_pct: number; cliff_days: number; duration_days: number } | null;
  };
  accrual: number[];
  weekly: number[];
  feed: { action: string; reason: string; pulse: number; grid: number; at: string }[];
  schedule: ScheduleRow[];
  referrals: {
    code?: string; verified: number; pending: number;
    referrals: { id: string; username: string; joined: string; verified_at?: string; fees_usd: number }[];
    affiliate: { share_bps: number; fees_usd: number; share_usd: number; grid: number };
  };
};

export default function RewardsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [copied, setCopied] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  useEffect(() => {
    const load = () => fetch("/api/rewards").then((r) => r.json()).then(setData).catch(() => {});
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => window.removeEventListener("neugrid:refresh-me", load);
  }, []);

  const refLink = data?.referrals.code && typeof window !== "undefined"
    ? `${window.location.origin}/?ref=${encodeURIComponent(data.referrals.code)}`
    : "";
  const copyLink = async () => {
    if (!refLink) return;
    try { await navigator.clipboard.writeText(refLink); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const l = data?.ledger;

  // ── side-rail chart data (all derived from the real ledger/event log) ──
  const accrual = data?.accrual ?? [];
  const breakdown = l?.breakdown ?? [];
  const srcUnits = breakdown.map((b) => b.units);
  const srcTotal = srcUnits.reduce((a, b) => a + b, 0);
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

            <div className="mt-4 divide-y divide-line">
              {(data?.schedule ?? []).map((r) => (
                <div key={r.action} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-[11.5px] leading-snug ${(r.pulse ?? 1) < 0 ? "text-red-400/80" : "text-ink"}`}>{r.action}</span>
                    <span className={`shrink-0 text-[11px] font-bold ${(r.pulse ?? 1) < 0 ? "text-red-400" : "text-neon"}`}>
                      {r.pulse === null ? "scaled" : `${r.pulse > 0 ? "+" : ""}${r.pulse}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9.5px] text-ink-faint">
                    <span>{r.formula ?? r.dimension}</span>
                    {r.pulse !== null && r.pulse > 0 && <span className="text-cyan/70">{r.pulse * (l?.rate ?? 10)} GRID</span>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — the earning picture */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div>
            <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Rewards" /></h1>
            <p className="mt-1 text-sm text-ink-dim">Your activity → Pulse → GRID. Allocation is earned by verified work and converts at the TGE.</p>
          </div>

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
                    <span className="ng-row__v !text-neon">{b.units.toLocaleString()} <span className="text-[9px] font-normal text-ink-faint">({b.events})</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* the reward feed */}
          <div className="ng-card p-4">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><IconActivity className="h-3.5 w-3.5 text-neon" />Reward feed</div>
            {(data?.feed ?? []).length === 0 && <p className="py-4 text-center text-[11px] text-ink-dim">No reward events yet — the schedule on the left is the map.</p>}
            <div className="divide-y divide-line">
              {(data?.feed ?? []).map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-ink">{f.reason}</div>
                    <div className="text-[9.5px] uppercase tracking-wider text-ink-faint">{f.action.replace(/_/g, " ")} · {new Date(f.at).toLocaleDateString()}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[12px] font-bold text-neon">+{f.pulse} Pulse</div>
                    <div className="text-[10px] text-cyan">+{f.grid} GRID</div>
                  </div>
                </div>
              ))}
            </div>
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
            </div>

            <div className="mt-4 divide-y divide-line">
              <DataRow k="Verified referrals" v={data?.referrals.verified ?? 0} accent="neon" />
              <DataRow k="Pending (no work yet)" v={data?.referrals.pending ?? 0} />
              <DataRow k="Their protocol fees" v={`$${data?.referrals.affiliate.fees_usd ?? 0}`} />
              <DataRow k="Your affiliate share" v={`$${data?.referrals.affiliate.share_usd ?? 0} → ${data?.referrals.affiliate.grid ?? 0} GRID`} accent="cyan" />
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
