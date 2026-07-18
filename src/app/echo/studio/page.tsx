"use client";

/**
 * /echo/studio — the workshop index (docs/ECHO_STUDIO.md Phase 2), in the
 * platform's signature 3-panel layout. Left: how the workshop works + the
 * engine. Center: KPI strip + new project + your workspace cards (portrait
 * tiles). Right: spend telemetry (real data) + recent activity.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, DataRow, IconCode, IconBolt, IconActivity, IconLayers, kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { LabeledBars } from "@/components/app/charts";

type Row = { workspace_id: string; name: string; status: string; build_id?: string; turns: number; trail_sha?: string; spent_grid: number; updated_at: string };

const HOW = [
  ["1 · direct", "Tell the engine what to build — plain English."],
  ["2 · it works", "It writes, RUNS the code, reads the errors, fixes them."],
  ["3 · sealed", "Every step lands in the action trail — a receipt, not a claim."],
  ["4 · yours", "Iterate for days, restore any version, deploy to /d/ when ready."],
] as const;

export default function StudioIndex() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [engineReady, setEngineReady] = useState(true);
  const [cost, setCost] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  const load = useCallback(() => {
    fetch("/api/studio").then((r) => r.json()).then((j) => { setRows(j.workspaces ?? []); setEngineReady(!!j.engine_ready); setCost(j.run_cost ?? 0); }).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/studio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.workspace) router.push(`/echo/studio/${r.workspace.workspace_id}`);
  };

  const kpis = useMemo(() => [
    { Icon: IconLayers, title: "WORKSPACES", v: String(rows.length), sub: "persistent projects" },
    { Icon: IconActivity, title: "BUILDING", v: String(rows.filter((w) => w.status === "building").length), sub: "engines running now" },
    { Icon: IconBolt, title: "GRID SPENT", v: String(Math.round(rows.reduce((s, w) => s + w.spent_grid, 0))), sub: `${cost} per run` },
    { Icon: IconCode, title: "WITH BUILDS", v: String(rows.filter((w) => w.build_id).length), sub: "sealed + previewable" },
    { Icon: IconActivity, title: "ENGINE", v: engineReady ? "READY" : "OFF", sub: "grok-build · self-hosted" },
  ], [rows, cost, engineReady]);

  const spendBars = rows.filter((w) => w.spent_grid > 0).slice(0, 6).map((w) => ({ label: w.name, value: Math.round(w.spent_grid) }));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const o = lOpen || rOpen; setLOpen(!o); setROpen(!o); }} />
      <div className="flex flex-col gap-3 px-3 py-3 pb-9 lg:min-h-0 lg:flex-1 lg:flex-row">

        {/* LEFT — the workshop explained + the engine */}
        <OrbPanel side="left" label="Workshop" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel title="HOW IT WORKS" icon={<IconCode className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="space-y-3">
              {HOW.map(([k, d]) => (
                <div key={k}>
                  <div className="text-[11px] font-semibold text-neon">{k}</div>
                  <p className="text-[11px] leading-relaxed text-ink-dim">{d}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-neon/10 pt-3 text-[11px] leading-relaxed text-ink-dim">
              The prompt box on <span className="text-neon">/echo</span> stays the fast lane. The Studio is the pro lane — same Echo, a real workshop behind it.
            </p>
          </Panel>

          <Panel title="THE ENGINE" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="space-y-1">
              <DataRow k="status" v={<span className={engineReady ? "text-neon" : "text-danger"}>{engineReady ? "ready" : "offline"}</span>} />
              <DataRow k="body" v="grok-build · self-hosted" />
              <DataRow k="run cost" v={`${cost} GRID`} />
              <DataRow k="on failure" v="refunded" />
              <DataRow k="code leaves neugrid" v={<span className="text-neon">never</span>} />
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — new project + the fleet */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="ng-panel p-5">
            <div className="ng-title text-2xl font-bold text-neon"><Decrypt text="Echo Studio" /></div>
            <p className="text-[12px] text-ink-dim">The workshop — a persistent room where the engine builds WITH you: write · run · fix, every step sealed into proof.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map((s, i) => (
              <div key={s.title} className="ng-card p-4 text-center">
                <div className="ng-tag mb-2 justify-center" style={{ color: kpiColor(i) }}><s.Icon className="h-3 w-3" />{s.title}</div>
                <div className="ng-stat__v !text-2xl" style={{ color: kpiColor(i) }}>{Number.isFinite(Number(s.v)) ? <CountUp key={s.v} value={Number(s.v)} /> : s.v}</div>
                <div className="mt-1 text-[11px] text-ink-dim">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="ng-panel p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-cyan">&gt;</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="name a new project — e.g. habit tracker" className="ng-input w-full !border-0 !bg-transparent !py-1.5" />
              <button onClick={create} disabled={busy || !engineReady || !name.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-35">
                <IconBolt className="h-3.5 w-3.5" /> Open workspace
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <Panel><div className="p-8 text-center text-sm text-ink-dim">No workspaces yet — open your first project above and put the engine to work.</div></Panel>
          ) : (
            <div className="columns-1 gap-3 sm:columns-2 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {rows.map((w) => (
                <button key={w.workspace_id} onClick={() => router.push(`/echo/studio/${w.workspace_id}`)}
                  className="ng-card mb-3 flex w-full break-inside-avoid cursor-pointer flex-col p-4 text-left transition-colors hover:border-neon/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-ink">{w.name}</div>
                    <Mark plain accent={w.status === "building" ? "cyan" : "neon"} className="!text-[9px]">{w.status === "building" ? "● building" : "idle"}</Mark>
                  </div>
                  <div className="mt-3 space-y-1">
                    <DataRow k="turns" v={String(w.turns)} />
                    <DataRow k="spent" v={`${Math.round(w.spent_grid)} GRID`} />
                    {w.trail_sha && <DataRow k="trail" v={<span className="font-mono text-[9px]">{w.trail_sha.slice(8, 24)}…</span>} />}
                  </div>
                  <div className="mt-3 border-t border-neon/10 pt-2 text-[10px] text-ink-faint">open the room →</div>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* RIGHT — signal */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          {spendBars.length > 0 && (
            <Panel title="SPEND BY PROJECT" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
              <LabeledBars data={spendBars} w={250} />
              <p className="mt-2 text-[10px] text-ink-faint">GRID metered per engine run → protocol treasury</p>
            </Panel>
          )}
          <Panel scroll title="RECENT" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            {rows.length === 0 ? (
              <p className="text-[11px] text-ink-dim">Workshop activity lands here.</p>
            ) : (
              <div className="space-y-2">
                {[...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8).map((w) => (
                  <div key={w.workspace_id} className="text-[11px] leading-snug">
                    <span className={w.status === "building" ? "text-cyan" : "text-neon"}>▸</span>{" "}
                    <span className="text-ink">{w.name}</span>{" "}
                    <span className="text-ink-faint">— {w.status === "building" ? "engine running" : `${w.turns} turns`}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
