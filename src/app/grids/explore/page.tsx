"use client";

/**
 * Grid Directory — every community on the network, from real data (GET /api/grids).
 * 3-panel signature layout: left = filters/network, center = grid cards, right = signal.
 * Refetches on `neugrid:refresh-me` so a Grid created via Start New appears live.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import StartNewButton from "@/components/app/StartNewButton";
import { Panel, Tag, Mark, DataRow, IconActivity, IconArrowRight, IconNetwork, IconBot , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import Meter from "@/components/app/Meter";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { PanelChart, barStr } from "@/components/app/terminal";
import { PolarArea, Heatmap, Bullet, SegBar } from "@/components/app/charts";
import type { Grid } from "@/lib/types";

type GridRow = Grid & { subgrid_count?: number; agent_count?: number; earnings?: number };
const STAGES = ["idea", "building", "genesis", "alpha", "spot", "futures"];
const fmtVal = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);

// Card meter %: real share of the network max; nonzero values keep one visible
// block (same floor idea as Bars in charts.tsx) so "small but alive" ≠ "zero".
const meterPct = (v: number, max: number) => (v > 0 ? Math.max(10, Math.round((v / max) * 100)) : 0);

/** Compact char-drawn meter row for card tiles — `LABEL ▮▮▯▯▯▯▯▯ 42`. */
function StandingMeter({ label, pct, value }: { label: string; pct: number; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-[10px]">
      <span className="w-14 shrink-0 uppercase tracking-wide text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 overflow-hidden font-mono text-[11px] tracking-tighter text-neon">{barStr(pct, 10)}</span>
      <span className="tnum shrink-0 text-ink-dim">{value}</span>
    </div>
  );
}

export default function GridsExplorePage() {
  const [grids, setGrids] = useState<GridRow[] | null>(null);
  const [err, setErr] = useState(false);
  const [cat, setCat] = useState("All");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/grids")
        .then((r) => r.json())
        .then((d) => { if (alive) setGrids(Array.isArray(d.grids) ? d.grids : []); })
        .catch(() => { if (alive) setErr(true); });
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => { alive = false; window.removeEventListener("neugrid:refresh-me", load); };
  }, []);

  const list = useMemo(() => grids ?? [], [grids]);
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((g) => m.set(g.category, (m.get(g.category) ?? 0) + 1));
    return [...m.entries()];
  }, [list]);
  const filtered = cat === "All" ? list : list.filter((g) => g.category === cat);
  const totals = useMemo(() => ({
    grids: list.length,
    members: list.reduce((s, g) => s + (g.member_count || 0), 0),
    pulse: list.reduce((s, g) => s + (g.pulse_score || 0), 0),
  }), [list]);
  const topByPulse = useMemo(() => [...list].sort((a, b) => (b.pulse_score || 0) - (a.pulse_score || 0)).slice(0, 5), [list]);
  const kpis = useMemo<[string, number, string?][]>(() => [
    ["Grids", list.length],
    ["Members", list.reduce((s, g) => s + (g.member_count || 0), 0)],
    ["Activity Value", Math.round(list.reduce((s, g) => s + (g.earnings || 0), 0)), "$"],
    ["SubGrids", list.reduce((s, g) => s + (g.subgrid_count || 0), 0)],
    ["Avg Pulse", list.length ? Math.round(list.reduce((s, g) => s + (g.pulse_score || 0), 0) / list.length) : 0],
  ], [list]);

  // ── chart-derived values (grids = the communities on the network; all real) ─────
  // LEFT-1 · PolarArea — community-type mix (labeled petals, sized by count)
  const catTopN = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 7);
  // LEFT-2 · Heatmap — the whole network as a field, cell brightness = the grid's pulse
  const maxPulse = Math.max(1, ...list.map((g) => g.pulse_score ?? 0));
  // CARD · standing meters — each grid's real stats vs the network max
  const maxMembers = Math.max(1, ...list.map((g) => g.member_count ?? 0));
  const maxSubs = Math.max(1, ...list.map((g) => g.subgrid_count ?? 0));
  const HM_ROWS = 6, HM_COLS = 10;
  const activityHeat = list.slice(0, HM_ROWS * HM_COLS).map((g) => Math.min(1, (g.pulse_score ?? 0) / maxPulse));
  // RIGHT-1 · Bullet — top grids' membership against the network average
  const avgMembers = list.length ? Math.round(totals.members / list.length) : 0;
  const memberBullet = [...list].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 6).map((g) => ({ value: g.member_count ?? 0, target: avgMembers }));
  // RIGHT-2 · SegBar — share of grids running subgrids
  const withSub = list.filter((g) => (g.subgrid_count ?? 0) > 0).length;
  const subShare = list.length ? Math.round((withSub / list.length) * 100) : 0;
  // RIGHT-3 · Lifecycle — real count of grids sitting at each pipeline stage
  const stageCounts = STAGES.map((s) => list.filter((g) => g.lifecycle_stage === s).length);
  const maxStage = Math.max(1, ...stageCounts);
  // LEFT · category filter rows — each category's real share of all grids
  const catMax = Math.max(1, list.length);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — network + filters */}
        <OrbPanel side="left" label="Filters" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="NETWORK" icon={<IconNetwork className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Total Grids" v={totals.grids} />
              <DataRow k="Total Members" v={totals.members} />
              <DataRow k="Total Pulse" v={totals.pulse} accent="neon" />
            </div>
            <PanelChart title="Categories · community mix" read={`${categories.length} types`}>
              {catTopN.length > 0
                ? <div className="flex justify-center py-1"><PolarArea data={catTopN.map(([, n]) => n)} labels={catTopN.map(([name]) => name)} size={150} /></div>
                : <p className="text-[11px] text-ink-faint">Not enough categories yet to map.</p>}
            </PanelChart>
            <PanelChart title="Activity · network field" read={`${list.length} grids`}>
              {activityHeat.length ? <Heatmap rows={HM_ROWS} cols={HM_COLS} data={activityHeat} /> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Categories</div>
            <div className="space-y-1">
              {([["All", list.length] as [string, number], ...categories]).map(([c, n]) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${cat === c ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}
                >
                  <span className="truncate">{c}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Meter value={n} max={catMax} w={40} />
                    <Mark plain className="!text-[10px]">{n}</Mark>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — directory */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Grid Directory" /></h1>
              <p className="mt-1 text-sm text-ink-dim">Every community on the network. Start one, or join the signal.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Mark plain className="text-xs">{filtered.length} {cat === "All" ? "grids" : cat}</Mark>
              <StartNewButton only="grid" label="new grid" />
            </div>
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

          {err && <Panel><div className="p-6 text-center text-sm text-ink-dim">Could not load grids.</div></Panel>}
          {!err && grids === null && (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ng-card mb-3 h-60 animate-pulse opacity-40" />)}</div>
          )}
          {!err && grids && filtered.length === 0 && (
            <Panel><div className="p-8 text-center text-sm text-ink-dim">No grids here yet. Use <Mark>Start New → Grid</Mark>.</div></Panel>
          )}
          {!err && filtered.length > 0 && (
            <div className="columns-2 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {filtered.map((g) => (
                <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card mb-3 flex break-inside-avoid flex-col p-4 transition hover:!border-neon/40">
                  {/* identity — glyph + name + ONE type chip */}
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl" style={{ color: g.visual_theme?.accent ?? "var(--ng-neon)", background: "radial-gradient(circle, rgba(0,255,0,0.12), rgba(0,255,0,0.03))" }}>{g.visual_theme?.glyph ?? "▦"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="ng-title truncate text-sm font-bold text-neon">{g.name}</div>
                      <div className="truncate text-[10px] text-ink-faint">{g.category}</div>
                    </div>
                    {g.grid_type && <Tag className="!text-[9px] shrink-0">{g.grid_type}</Tag>}
                  </div>
                  {g.description && <p className="mt-2 truncate text-[11px] text-ink-dim" title={g.description}>{g.description}</p>}
                  {/* hero — activity value (campaigns · deals · agents · work) */}
                  <div className="ng-stat__v mt-3 !text-2xl text-neon tnum">${fmtVal(g.earnings ?? 0)}</div>
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>Activity value</span><span>lifetime</span></div>
                  {/* standing — this grid's REAL stats as char-meters vs the network max */}
                  <div className="mt-3 border-t border-line pt-2.5">
                    <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>Standing</span><span>vs network max</span></div>
                    <StandingMeter label="Pulse" pct={meterPct(g.pulse_score ?? 0, maxPulse)} value={(g.pulse_score ?? 0).toLocaleString()} />
                    <StandingMeter label="Members" pct={meterPct(g.member_count ?? 0, maxMembers)} value={(g.member_count ?? 0).toLocaleString()} />
                    <StandingMeter label="SubGrids" pct={meterPct(g.subgrid_count ?? 0, maxSubs)} value={g.subgrid_count ?? 0} />
                  </div>
                  {/* footer — agents + the enter action */}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[10px]">
                    <span className="flex items-center gap-1 text-ink-faint"><IconBot className="h-3 w-3" />{g.agent_count ?? 0} agents</span>
                    <span className="ng-btn ng-btn--sm shrink-0">Enter Grid <IconArrowRight className="h-3 w-3" /></span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — signal */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="SIGNAL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Members · top grids vs avg" read={avgMembers ? `avg ${avgMembers}` : "—"}>
              {memberBullet.length ? <Bullet data={memberBullet} /> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <PanelChart title="SubGrids · network share" read={`${withSub}/${list.length}`}>
              {list.length > 0 ? <div className="py-2"><SegBar percent={subShare} /><div className="mt-1.5 text-[9px] text-ink-faint">{subShare}% of grids run subgrids ({withSub}/{list.length})</div></div> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Top by Pulse</div>
            <div className="space-y-2">
              {topByPulse.length === 0 && <p className="text-[11px] text-ink-dim">—</p>}
              {topByPulse.map((g, i) => (
                <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card flex items-center gap-2.5 p-2.5">
                  <span className="text-xs font-bold text-neon">{i + 1}</span>
                  <MatrixAvatar seed={g.grid_id} size={22} shape="square" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{g.name}</span>
                  <Meter value={g.pulse_score ?? 0} max={maxPulse} w={36} />
                  <Mark plain accent="cyan" className="!text-[10px]">{g.pulse_score}</Mark>
                </Link>
              ))}
            </div>
            <div className="mb-2 mt-5 flex items-baseline justify-between gap-2">
              <div className="ng-label !text-ink-dim">Lifecycle</div>
              <span className="tnum text-[9.5px] text-ink-faint">grids per stage</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-ink-dim">
              {STAGES.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />
                  <span className="min-w-0 flex-1 truncate">{s}</span>
                  <Meter value={stageCounts[i]} max={maxStage} w={40} />
                  <span className="tnum w-4 shrink-0 text-right text-[10px] text-ink-faint">{stageCounts[i]}</span>
                </div>
              ))}
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
