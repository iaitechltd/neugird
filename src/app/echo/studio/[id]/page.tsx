"use client";

/**
 * /echo/studio/[id] — the WORKSHOP room (docs/ECHO_STUDIO.md Phase 2), in the
 * platform's signature 3-panel layout. Left rail: project files · checkpoints ·
 * the sealed proof. Center: KPI strip · the live preview of the REAL build ·
 * the command line · the mission feed. Right rail: session · run telemetry
 * (real data) · the action trail. Runs are asynchronous — the room polls.
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconCode, IconBolt, IconActivity, IconLayers, kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { Bars, Donut } from "@/components/app/charts";
import Meter from "@/components/app/Meter";

type View = {
  workspace: { workspace_id: string; name: string; status: string; progress?: string; spent_grid: number; trail_sha?: string };
  turns: { turn_id: string; role: "you" | "engine"; text: string; version?: number; duration_s?: number; files_changed?: number; error?: string; at: string }[];
  trail: { at: string; type: string; summary: string }[];
  trail_len: number;
  checkpoints: { checkpoint_id: string; version: number; note: string; proof: string; at: string; files: number }[];
  files: { path: string; bytes: number }[];
  build?: { build_id: string; title: string; version: number; proof?: string; preview_url?: string; deployment?: { slug: string; version: number; url: string } };
  engine_ready: boolean;
  run_cost: number;
};

export default function StudioRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [v, setV] = useState<View | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [cmd, setCmd] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  const load = useCallback(() => {
    fetch(`/api/studio/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setV(j)).catch(() => {});
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, v?.workspace.status === "building" ? 2500 : 6000);
    return () => clearInterval(t);
  }, [load, v?.workspace.status]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [v?.turns.length, v?.workspace.progress]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); } }, [toast]);

  const act = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch(`/api/studio/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.error && r.error !== "already_live") setToast(r.error === "insufficient_grid" ? `Not enough GRID — a run costs ${v?.run_cost}` : `⚠ ${r.error}`);
    if (r?.url) setToast(`Live at ${r.url}`);
    if (r?.view) setV(r.view); else load();
  };
  const run = () => { const text = cmd.trim(); if (!text || v?.workspace.status === "building") return; setCmd(""); void act({ action: "run", instruction: text }); };

  const building = v?.workspace.status === "building";
  const engineTurns = (v?.turns ?? []).filter((t) => t.role === "engine" && t.duration_s);
  const trailMix = ["narrate", "run", "files", "done", "error"].map((k) => (v?.trail ?? []).filter((e) => e.type === k).length);
  const maxBytes = Math.max(1, ...(v?.files ?? []).map((f) => f.bytes));

  const kpis = v ? [
    { Icon: IconCode, title: "VERSION", v: `v${v.build?.version ?? 0}`, sub: v.build ? "sealed build" : "no build yet" },
    { Icon: IconActivity, title: "STEPS SEALED", v: String(v.trail_len), sub: "the action trail" },
    { Icon: IconBolt, title: "GRID SPENT", v: String(Math.round(v.workspace.spent_grid)), sub: `${v.run_cost} per run` },
    { Icon: IconLayers, title: "FILES", v: String(v.files.length), sub: "in the project" },
    { Icon: IconActivity, title: "RUNS", v: String(engineTurns.length), sub: building ? "engine running…" : "write · run · fix" },
  ] : [];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const o = lOpen || rOpen; setLOpen(!o); setROpen(!o); }} />
      <div className="flex flex-col gap-3 px-3 py-3 pb-9 lg:min-h-0 lg:flex-1 lg:flex-row">

        {/* LEFT — the project */}
        <OrbPanel side="left" label="Workshop" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="PROJECT" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5">
            {(v?.files.length ?? 0) === 0 ? (
              <p className="text-[11px] leading-relaxed text-ink-dim">No files yet — give the engine its first directive and watch the project appear here.</p>
            ) : (
              <div className="space-y-2">
                {v!.files.map((f) => (
                  <div key={f.path}>
                    <div className="flex items-baseline justify-between text-[11px]"><span className="truncate text-ink">{f.path}</span><span className="ml-2 shrink-0 text-ink-faint">{(f.bytes / 1024).toFixed(1)}k</span></div>
                    <Meter value={f.bytes} max={maxBytes} className="mt-0.5" />
                  </div>
                ))}
              </div>
            )}

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Checkpoints</div>
            {(v?.checkpoints.length ?? 0) === 0 ? (
              <p className="text-[11px] text-ink-dim">Every run snapshots here — undo is one click, nothing is ever lost.</p>
            ) : (
              <div className="space-y-1.5">
                {v!.checkpoints.map((c) => (
                  <div key={c.checkpoint_id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-ink-dim">v{c.version} — {c.note}</span>
                    <button onClick={() => void act({ action: "restore", checkpoint_id: c.checkpoint_id })} disabled={busy || building}
                      className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">↺ restore</button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="PROOF" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="flex items-center gap-4">
              <Donut data={trailMix.some((n) => n > 0) ? trailMix : [1]} size={92} thickness={12}
                colors={["#00ff00", "#48f5ff", "#8dff8d", "#c8ffc8", "#ff8b8b"]} center={String(v?.trail_len ?? 0)} />
              <div className="min-w-0 text-[10px] leading-relaxed text-ink-dim">
                <div><span className="text-neon">■</span> narrated · <span className="text-cyan">■</span> runs</div>
                <div>■ files · done · <span className="text-danger">■</span> errors</div>
                <div className="mt-1 text-ink-faint">every edit · run · fix — sealed. a receipt, not a claim.</div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {v?.build?.proof && <DataRow k="build seal" v={<span className="font-mono text-[10px]">{v.build.proof.slice(7, 27)}…</span>} />}
              {v?.workspace.trail_sha && <DataRow k="trail seal" v={<span className="font-mono text-[10px]">{v.workspace.trail_sha.slice(8, 28)}…</span>} />}
            </div>
          </Panel>
        </OrbPanel>

        {/* CENTER — the room */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="ng-panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="ng-title text-2xl font-bold text-neon"><Decrypt text={v ? v.workspace.name : "studio"} /></div>
              <p className="text-[12px] text-ink-dim">The workshop — the engine writes, runs, and fixes until it works. Every step sealed.</p>
            </div>
            <div className="flex items-center gap-2">
              <Mark plain accent={building ? "cyan" : v?.engine_ready ? "neon" : "amber"} className="!text-[10px]">
                {building ? "● ENGINE RUNNING" : v?.engine_ready ? "ENGINE READY" : "ENGINE OFFLINE"}
              </Mark>
              {v?.build?.preview_url && <a href={v.build.preview_url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm"><IconCode className="h-3.5 w-3.5" /> Full view ↗</a>}
              {v?.build?.deployment && <a href={v.build.deployment.url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm">live: /d/{v.build.deployment.slug} ↗</a>}
              <button onClick={() => void act({ action: "deploy" })} disabled={busy || building || !v?.build} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-35"><IconBolt className="h-3.5 w-3.5" /> Deploy</button>
            </div>
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

          <Panel title="LIVE PREVIEW" icon={<IconCode className="h-4 w-4" />} bodyClass="p-3.5"
            action={<span className="pointer-events-auto flex items-center gap-2">
              {v?.build && <Mark plain className="!text-[10px]">v{v.build.version}{building ? " · updating…" : ""}</Mark>}
              {v?.build?.preview_url && <a href={v.build.preview_url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm !px-2 !py-0.5 !text-[10px]">open full ↗</a>}
            </span>}>
            {v?.build?.preview_url ? (
              <iframe key={v.build.version} src={v.build.preview_url} sandbox="allow-scripts" title="live preview"
                className="h-[56vh] min-h-[380px] w-full border border-neon/15 bg-black" />
            ) : (
              <div className="relative flex h-[260px] flex-col items-center justify-center gap-4 overflow-hidden border border-dashed border-neon/15">
                {building ? (
                  <>
                    <span className="relative flex h-10 w-10 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan/20" />
                      <span className="relative inline-flex h-4 w-4 animate-pulse rounded-full bg-cyan" />
                    </span>
                    <div className="max-w-[80%] text-center text-[12px] leading-relaxed text-cyan">{v?.workspace.progress || "the engine is building your first version…"}<span className="animate-pulse">▌</span></div>
                    <div className="text-[10px] text-ink-faint">{v?.trail_len ?? 0} steps sealed · files appear in the PROJECT rail as they&apos;re written</div>
                  </>
                ) : (
                  <div className="text-[12px] text-ink-dim">the preview appears after the first run</div>
                )}
              </div>
            )}
          </Panel>

          <div className="ng-panel p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-cyan">&gt;</span>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder={building ? "engine running — queue your next directive when it lands" : v?.files.length ? "tell the engine what to change…" : "tell the engine what to build…"}
                disabled={building || !v?.engine_ready} className="ng-input w-full !border-0 !bg-transparent !py-1.5 disabled:opacity-50" />
              <button onClick={run} disabled={busy || building || !v?.engine_ready} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-35">
                <IconBolt className="h-3.5 w-3.5" /> Run · {v?.run_cost ?? "—"} GRID
              </button>
            </div>
          </div>

          <Panel title="MISSION FEED" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <div ref={feedRef} className="max-h-[300px] space-y-2 overflow-y-auto">
              {v?.turns.map((t) => (
                <div key={t.turn_id} className="text-[12px] leading-relaxed">
                  <Tag className={`mr-1.5 !text-[9px] ${t.role === "you" ? "!text-cyan" : t.error ? "!text-danger" : ""}`}>{t.role === "you" ? "YOU" : "ENGINE"}</Tag>
                  <span className={t.error ? "text-danger" : "text-ink"}>{t.text}</span>
                  {t.version !== undefined && !t.error && (
                    <span className="text-[10px] text-ink-faint"> — v{t.version}{t.files_changed ? ` · ${t.files_changed} file(s)` : ""}{t.duration_s ? ` · ${Math.round(t.duration_s)}s` : ""}</span>
                  )}
                </div>
              ))}
              {building && (
                <div className="text-[12px] text-cyan"><Tag className="mr-1.5 !text-[9px] !text-cyan">ENGINE</Tag>{v?.workspace.progress || "working…"}<span className="animate-pulse">▌</span></div>
              )}
            </div>
          </Panel>
        </main>

        {/* RIGHT — signal */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Panel title="SESSION" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="space-y-1">
              <DataRow k="status" v={<span className={building ? "text-cyan" : "text-neon"}>{v?.workspace.status ?? "…"}</span>} />
              <DataRow k="engine" v={v?.engine_ready ? "grok-build · self-hosted" : "offline"} />
              <DataRow k="spent" v={`${Math.round(v?.workspace.spent_grid ?? 0)} GRID`} />
              <DataRow k="code leaves neugrid" v={<span className="text-neon">never</span>} />
            </div>
          </Panel>

          {engineTurns.length > 0 && (
            <Panel title="RUN TELEMETRY" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
              <div className="ng-label mb-1 !text-ink-dim">Seconds per run</div>
              <Bars data={engineTurns.map((t) => t.duration_s ?? 0)} w={250} h={54} />
              <div className="mt-2 space-y-1">
                <DataRow k="last run" v={`${Math.round(engineTurns[engineTurns.length - 1].duration_s ?? 0)}s`} />
                <DataRow k="files touched" v={String(engineTurns.reduce((s, t) => s + (t.files_changed ?? 0), 0))} />
              </div>
            </Panel>
          )}

          <Panel scroll title="ACTION TRAIL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5"
            action={<Mark plain className="!text-[10px]">{v?.trail_len ?? 0} sealed</Mark>}>
            <div className="space-y-1.5">
              {(v?.trail ?? []).slice().reverse().map((e, i) => (
                <div key={i} className="text-[11px] leading-snug">
                  <span className={`mr-1 ${e.type === "error" ? "text-danger" : e.type === "run" ? "text-cyan" : "text-ink-faint"}`}>{e.type}</span>
                  <span className="text-ink-dim">{e.summary}</span>
                </div>
              ))}
            </div>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
