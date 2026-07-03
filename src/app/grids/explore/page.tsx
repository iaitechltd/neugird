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
import { Panel, Tag, Mark, DataRow, IconActivity, IconArrowRight, IconNetwork, IconLayers, IconBot, IconCoins , kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { PanelChart } from "@/components/app/terminal";
import { Radar, Bars, Ring, Heatmap } from "@/components/app/charts";
import type { Grid } from "@/lib/types";

type GridRow = Grid & { subgrid_count?: number; agent_count?: number; earnings?: number };
const STAGES = ["idea", "building", "genesis", "alpha", "spot", "futures"];
const fmtVal = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);

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

  // ── chart-derived values (grids = the communities on the network) ─────
  const maxMembers = Math.max(1, ...list.map((g) => g.member_count ?? 0));
  const memberBars = [...list].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)).slice(0, 10).map((g) => g.member_count ?? 0);
  // category mix — top community types, normalized to the biggest, for the Radar
  const catTop = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const catMax = Math.max(1, ...catTop.map(([, n]) => n));
  const catAxes = catTop.map(([name]) => name);
  const catVals = catTop.map(([, n]) => Math.round((n / catMax) * 100));
  const HM_ROWS = 6, HM_COLS = 10;
  const activityHeat = list.slice(0, HM_ROWS * HM_COLS).map((g) => Math.min(1, (g.member_count ?? 0) / maxMembers));
  const withSub = list.filter((g) => (g.subgrid_count ?? 0) > 0).length;
  const subShare = list.length ? Math.round((withSub / list.length) * 100) : 0;

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
              {catAxes.length >= 3
                ? <div className="flex justify-center py-1"><Radar axes={catAxes} values={catVals} size={180} /></div>
                : <p className="text-[11px] text-ink-faint">Not enough categories yet to map.</p>}
            </PanelChart>
            <PanelChart title="Members · top grids" read={`peak ${maxMembers.toLocaleString()}`}>
              {memberBars.length ? <Bars data={memberBars} h={44} /> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Categories</div>
            <div className="space-y-1">
              {([["All", list.length] as [string, number], ...categories]).map(([c, n]) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] transition ${cat === c ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}
                >
                  <span className="truncate">{c}</span><Mark plain className="!text-[10px]">{n}</Mark>
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
            <Mark plain className="shrink-0 text-xs">{filtered.length} {cat === "All" ? "grids" : cat}</Mark>
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
                <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card group mb-3 flex break-inside-avoid flex-col p-4 transition hover:!border-neon/40">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl" style={{ color: g.visual_theme?.accent ?? "var(--ng-neon)", background: "radial-gradient(circle, rgba(0,255,0,0.12), rgba(0,255,0,0.03))" }}>{g.visual_theme?.glyph ?? "▦"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="ng-title truncate text-sm font-bold text-neon">{g.name}</div>
                      <div className="truncate text-[10px] text-ink-faint">{g.category}</div>
                    </div>
                    {g.grid_type && <Tag className="!text-[9px] shrink-0">{g.grid_type}</Tag>}
                  </div>
                  {g.description && <p className="mt-2.5 line-clamp-3 text-[11px] leading-relaxed text-ink-dim">{g.description}</p>}
                  {/* stat strip */}
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                    <div><div className="text-[15px] font-bold text-ink tnum">{(g.pulse_score ?? 0).toLocaleString()}</div><div className="text-[9px] uppercase tracking-wide text-ink-faint">Pulse</div></div>
                    <div><div className="text-[15px] font-bold text-ink tnum">{(g.member_count ?? 0).toLocaleString()}</div><div className="text-[9px] uppercase tracking-wide text-ink-faint">Members</div></div>
                    <div><div className="text-[15px] font-bold text-ink tnum">{g.subgrid_count ?? 0}</div><div className="text-[9px] uppercase tracking-wide text-ink-faint">SubGrids</div></div>
                  </div>
                  {/* earnings highlight — total value across campaigns · deals · agents · work */}
                  <div className="mt-2.5 flex items-center justify-between rounded border border-neon/15 bg-neon/[0.04] px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-dim"><IconCoins className="h-3.5 w-3.5 text-neon" />Activity value</span>
                    <span className="tnum text-[14px] font-bold text-neon">{fmtVal(g.earnings ?? 0)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint">
                    <span className="flex items-center gap-3"><span className="flex items-center gap-1"><IconBot className="h-3 w-3" />{g.agent_count ?? 0} agents</span><span className="flex items-center gap-1"><IconLayers className="h-3 w-3" />{g.subgrid_count ?? 0}</span></span>
                    <span className="text-neon opacity-0 transition group-hover:opacity-100"><IconArrowRight className="h-3 w-3" /></span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — signal */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="SIGNAL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <PanelChart title="Activity · by grid" read={`${list.length} grids`}>
              {activityHeat.length ? <Heatmap rows={HM_ROWS} cols={HM_COLS} data={activityHeat} /> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <PanelChart title="SubGrids · share with subgrids" read={`${withSub}/${list.length}`}>
              {list.length > 0 ? <div className="flex items-center justify-center py-1"><Ring percent={subShare} label="w/ subs" value={`${subShare}%`} size={86} stroke={6} /></div> : <p className="text-[11px] text-ink-faint">No grids yet.</p>}
            </PanelChart>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Top by Pulse</div>
            <div className="space-y-2">
              {topByPulse.length === 0 && <p className="text-[11px] text-ink-dim">—</p>}
              {topByPulse.map((g, i) => (
                <Link key={g.grid_id} href={`/grid/${g.slug}`} className="ng-card flex items-center gap-2.5 p-2.5">
                  <span className="text-sm font-bold text-neon">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{g.name}</span>
                  <Mark plain accent="cyan" className="!text-[10px]">{g.pulse_score}</Mark>
                </Link>
              ))}
            </div>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Lifecycle</div>
            <div className="space-y-1.5 text-[11px] text-ink-dim">
              {STAGES.map((s) => <div key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-neon" />{s}</div>)}
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
