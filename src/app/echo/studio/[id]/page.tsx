"use client";

/**
 * /echo/studio/[id] — the WORKSHOP room (docs/ECHO_STUDIO.md Phase 2), in the
 * platform's signature 3-panel layout. Left rail: project files · checkpoints ·
 * the sealed proof. Center: KPI strip · the live preview of the REAL build ·
 * the command line · the mission feed. Right rail: session · run telemetry
 * (real data) · the action trail. Runs are asynchronous — the room polls.
 */

import { Fragment, use, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Tag, Mark, DataRow, IconCode, IconBolt, IconActivity, IconLayers, kpiColor } from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { Bars, Donut, Lollipop, Ring, StackBars, StepArea } from "@/components/app/charts";
import Meter from "@/components/app/Meter";
import { Rise } from "@/components/app/motionfx";
import { PulseDot } from "@/components/app/venture-ui";

const TRAIL_TYPES = ["narrate", "run", "files", "done", "error", "crew", "tool"] as const;
const TRAIL_COLORS = ["#00ff00", "#48f5ff", "#8dff8d", "#c8ffc8", "#ff8b8b", "#2fd32f", "#ffb347"];
const trailColor = (t: string) => TRAIL_COLORS[TRAIL_TYPES.indexOf(t as (typeof TRAIL_TYPES)[number])] ?? "#1e9c1e";

type View = {
  workspace: { workspace_id: string; name: string; status: string; progress?: string; spent_grid: number; trail_sha?: string };
  turns: { turn_id: string; role: "you" | "engine" | "chief" | "chatter" | "content" | "marketing"; text: string; version?: number; duration_s?: number; files_changed?: number; error?: string; grade?: "pass" | "revise"; cost_grid?: number; cost_usd?: number; tokens?: number; quality?: "standard" | "verified" | "best3"; at: string }[];
  trail: { at: string; type: string; summary: string }[];
  trail_len: number;
  checkpoints: { checkpoint_id: string; version: number; note: string; proof: string; at: string; files: number }[];
  files: { path: string; bytes: number }[];
  build?: { build_id: string; title: string; version: number; proof?: string; preview_url?: string; deployment?: { slug: string; version: number; url: string } };
  crew: { chief: string; hands: string; chatter: string; active: boolean };
  pending_fix?: { re_brief: string; notes: string; at: string };
  pending_post?: { title: string; body: string; tagline?: string; at: string };
  rules: string;
  memory_enabled: boolean;
  spent_usd: number;
  run_costs: { standard: number; verified: number; best3: number };
  connections: { name: string; kind: string; scope?: "toolbox" | "project"; enabled: boolean; command: string; secret: string | null; added_at: string; health: { ok: boolean; note: string } | null }[];
  connections_checked_at: string | null;
  mcp_catalog: { kind: string; label: string; desc: string; needs: { label: string; placeholder: string } | null }[];
  skills: { published_id: string; name: string; title: string; at: string; scope?: "toolbox" | "project"; enabled?: boolean }[];
  skill_store: { published_id: string; title: string; summary?: string; price_grid: number; installs: number; author: string; installed: boolean; mine: boolean }[];
  plugins: { published_id: string; name: string; title: string; files: number; scope: "toolbox" | "project"; enabled: boolean }[];
  plugin_store: { published_id: string; title: string; summary?: string; price_grid: number; installs: number; files: number; author: string; installed: boolean; mine: boolean }[];
  money: {
    grid: { grid_id: string; slug: string; name: string } | null;
    product: { product_id: string; title: string } | null;
    proposal: { proposal_id: string; title: string; status: string; ask: number } | null;
    audit: { audit_id: string; status: string } | null;
    market: { market_id: string; symbol: string; stage: string } | null;
    eligibility: { ok: boolean; reason?: string } | null;
    hired: { job_id: string; title: string; at: string; status: string; reward: number }[];
  };
  engine_ready: boolean;
  engine_mode?: "acp" | "headless";
  run_cost: number;
};

type RaiseDraft = { title: string; pitch: string; category: string; ask_usdc: number; milestones: { title: string; description: string; amount_usdc: number; days?: number }[] };

export default function StudioRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [v, setV] = useState<View | null>(null);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [cmd, setCmd] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [shipped, setShipped] = useState(0);
  const [moneyOpen, setMoneyOpen] = useState<null | "hire" | "raise" | "token">(null);
  const [hire, setHire] = useState({ title: "", desc: "", reward: "" });
  const [draft, setDraft] = useState<RaiseDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [tokSym, setTokSym] = useState("");
  const [storeOpen, setStoreOpen] = useState(false);
  const [quality, setQuality] = useState<"standard" | "verified" | "best3">("standard");
  const [effort, setEffort] = useState<"low" | "medium" | "high">("medium");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<string | null>(null);
  const [connOpen, setConnOpen] = useState(false);
  const [conn, setConn] = useState({ kind: "remote", value: "", command: "", args: "", url: "", header: "" });
  const [checking, setChecking] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevVer = useRef(0);
  const reduce = useReducedMotion();
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
  useEffect(() => {
    // D11 — the version-ship moment: flash when a NEW version lands (not on first load)
    const ver = v?.build?.version ?? 0;
    if (prevVer.current > 0 && ver > prevVer.current) {
      setShipped(ver);
      prevVer.current = ver;
      const t = setTimeout(() => setShipped(0), 3200);
      return () => clearTimeout(t);
    }
    prevVer.current = ver;
  }, [v?.build?.version]);

  const act = async (body: Record<string, unknown>) => {
    if (busy) return null;
    setBusy(true);
    const r = await fetch(`/api/studio/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.error && r.error !== "already_live") setToast(r.error === "insufficient_grid" ? `Not enough GRID — a run costs ${v?.run_cost}` : `⚠ ${r.error}`);
    if (r?.url) setToast(`Live at ${r.url}`);
    if (r?.view) setV(r.view); else load();
    return r;
  };
  /** Fire one of the platform's existing money rails, then refresh the room. */
  const hit = async (url: string, body?: Record<string, unknown>) => {
    if (busy) return null;
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.error) setToast(`⚠ ${r.error}`);
    load();
    return r;
  };
  const hireGo = async () => {
    const r = await act({ action: "hire", title: hire.title, description: hire.desc, reward_usdc: Number(hire.reward) });
    if (r?.job_id) { setHire({ title: "", desc: "", reward: "" }); setToast(`Escrowed — your job is live on /jobs`); }
  };
  const draftRaise = async () => {
    if (!v?.build || drafting) return;
    setDrafting(true);
    const r = await fetch(`/api/echo/builds/${v.build.build_id}/proposal-draft`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    setDrafting(false);
    if (r?.draft) setDraft(r.draft as RaiseDraft);
    else setToast(r?.error === "brain_inactive" ? "Drafting needs the brain active" : `⚠ ${r?.error ?? "draft failed"}`);
  };
  const openRaise = async () => {
    if (!v?.build || !draft) return;
    const sum = draft.milestones.reduce((a, m) => a + m.amount_usdc, 0) || 1;
    let running = 0;
    const roadmap = draft.milestones.map((m, i) => {
      const amount = i === draft.milestones.length - 1 ? Math.max(1, draft.ask_usdc - running) : Math.max(1, Math.round((m.amount_usdc / sum) * draft.ask_usdc));
      running += amount;
      return { title: m.title, description: m.description, amount, est_duration_days: m.days };
    });
    const r = await hit("/api/proposals", { title: draft.title, summary: draft.pitch, category: draft.category, ask_amount: draft.ask_usdc, roadmap, build_id: v.build.build_id });
    if (r?.proposal) { setDraft(null); setToast("Raise opened on the Fund board — backed by your proof of build"); }
  };
  const run = () => {
    const text = cmd.trim();
    if (!text || v?.workspace.status === "building") return;
    setCmd("");
    void act({ action: "run", instruction: text, quality, ...(effort !== "medium" ? { effort } : {}) });
  };
  const saveRules = async () => {
    const r = await act({ action: "rules", rules: rulesDraft ?? "" });
    if (r?.ok) { setRulesDraft(null); setToast("The law is set — the engine obeys it on every run"); }
  };
  const connectGo = async () => {
    const r = await act({ action: "mcp_add", kind: conn.kind, value: conn.value, command: conn.command, args: conn.args, url: conn.url, header: conn.header });
    if (r?.ok) { setConn({ kind: "remote", value: "", command: "", args: "", url: "", header: "" }); setConnOpen(false); setToast("Connected — its tools reach the engine on the next run"); }
  };
  const checkConns = async () => {
    setChecking(true);
    await act({ action: "mcp_check" }); // the engine's doctor spawns each server — first run downloads it
    setChecking(false);
  };

  const building = v?.workspace.status === "building";
  const engineTurns = (v?.turns ?? []).filter((t) => t.role === "engine" && t.duration_s);
  // real runs only — the workspace-open greeting is an engine turn but not a run;
  // an in-flight run is already debited, so it counts toward the spend meter
  const engineRuns = (v?.turns ?? []).filter((t) => t.role === "engine" && (t.duration_s || t.error));
  const paidRuns = engineRuns.length + (v?.workspace.status === "building" ? 1 : 0);
  const trailMix = TRAIL_TYPES.map((k) => (v?.trail ?? []).filter((e) => e.type === k).length);
  const trailTotal = trailMix.reduce((s, n) => s + n, 0);
  const maxBytes = Math.max(1, ...(v?.files ?? []).map((f) => f.bytes));
  const maxCkFiles = Math.max(1, ...(v?.checkpoints ?? []).map((c) => c.files));
  // B4 — the journey chain, lit from what actually happened (the creation event is
  // typed "run" and the trail sha exists from birth — neither means a run happened)
  const trailTypes = new Set((v?.trail ?? []).map((e) => e.type));
  const chain = [
    { label: "DIRECTIVE", on: (v?.turns ?? []).some((t) => t.role === "you") },
    { label: "WRITE", on: trailTypes.has("files") },
    { label: "RUN", on: building || engineRuns.length > 0 },
    { label: "FIX", on: trailTypes.has("error") },
    { label: "SEAL", on: trailTypes.has("done") },
  ];
  // the crew's live per-seat state (plain-English readout, no charts — the approved grammar)
  const lastChief = [...(v?.turns ?? [])].reverse().find((t) => t.role === "chief");
  const lastChatter = [...(v?.turns ?? [])].reverse().find((t) => t.role === "chatter");
  const briefing = building && (v?.workspace.progress ?? "").includes("briefing");
  const reviewing = building && (v?.workspace.progress ?? "").includes("reviewing");

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
          <Rise className="lg:h-full lg:min-h-0">
          <Panel scroll title="PROJECT" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5">
            {(v?.files.length ?? 0) === 0 ? (
              <div>
                <div className="flex items-center">
                  {chain.map((s, i) => (
                    <Fragment key={s.label}>
                      {i > 0 && <span className={`h-px min-w-1 flex-1 ${chain[i - 1].on && s.on ? "bg-neon/40" : "bg-neon/10"}`} />}
                      <span className={`border px-1 py-0.5 text-[8px] tracking-widest ${s.on ? "border-neon/60 bg-neon/10 text-neon" : "border-neon/15 text-ink-faint"}`}>{s.label}</span>
                    </Fragment>
                  ))}
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">
                  {building ? "the chain lights up as the engine works — files land here the moment they're written." : "give the engine its first directive and watch the project appear here."}
                </p>
              </div>
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

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Rules — the law</div>
            <div>
              <button onClick={() => { setRulesOpen((o) => !o); if (rulesDraft === null) setRulesDraft(v?.rules ?? ""); }}
                className="flex w-full items-center gap-2 text-left text-[11px]">
                <PulseDot tone={v?.rules ? "neon" : "dim"} />
                <span className={v?.rules ? "text-ink" : "text-ink-faint"}>{v?.rules ? `standing law · ${v.rules.length} chars` : "no rules yet"}</span>
                <span className={`ml-auto text-[10px] text-ink-faint transition-transform ${rulesOpen ? "rotate-90" : ""}`}>▸</span>
              </button>
              {!rulesOpen && <p className="mt-1 pl-3.5 text-[10px] leading-relaxed text-ink-faint">what the engine must always honor in this project — it reads this on every run.</p>}
              {rulesOpen && (
                <div className="mt-2 space-y-1.5">
                  <textarea value={rulesDraft ?? v?.rules ?? ""} onChange={(e) => setRulesDraft(e.target.value)} rows={6} spellCheck={false}
                    placeholder={"e.g.\n- keep everything in one HTML/CSS/JS bundle\n- dark theme only\n- never add analytics or external requests"}
                    className="ng-input w-full !py-1.5 font-mono text-[10px] leading-relaxed" aria-label="Project rules (AGENTS.md)" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => void saveRules()} disabled={busy || rulesDraft === null || rulesDraft === (v?.rules ?? "")}
                      className="ng-btn ng-btn-primary ng-btn--sm !px-2 !py-0.5 !text-[10px] disabled:opacity-35">Set the law</button>
                    <button onClick={() => { setRulesOpen(false); setRulesDraft(null); }} className="ng-btn ng-btn-ghost ng-btn--sm !px-2 !py-0.5 !text-[10px]">close</button>
                  </div>
                </div>
              )}
            </div>

            <div className="ng-label mb-2 mt-5 !text-ink-dim">Checkpoints</div>
            {(v?.checkpoints.length ?? 0) === 0 ? (
              <p className="text-[11px] text-ink-dim">Every run snapshots here — undo is one click, nothing is ever lost.</p>
            ) : (
              <div className="space-y-1.5">
                {v!.checkpoints.map((c) => (
                  <div key={c.checkpoint_id} className="group flex items-center gap-2">
                    <Ring percent={(c.files / maxCkFiles) * 100} value={`v${c.version}`} size={34} stroke={3.5} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">{c.note} <span className="text-ink-faint">· {c.files} files</span></span>
                    <button onClick={() => void act({ action: "restore", checkpoint_id: c.checkpoint_id })} disabled={busy || building}
                      className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] opacity-40 transition-opacity group-hover:opacity-100 disabled:opacity-25">↺ restore</button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          </Rise>

          <Rise delay={0.06}>
          <Panel title="PROOF" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="flex items-center gap-4">
              <Donut data={trailMix.some((n) => n > 0) ? trailMix : [1]} size={92} thickness={12}
                colors={TRAIL_COLORS} center={String(v?.trail_len ?? 0)} />
              <div className="min-w-0 text-[10px] leading-relaxed text-ink-dim">
                <div><span className="text-neon">■</span> narrated · <span className="text-cyan">■</span> runs</div>
                <div>■ files · done · crew · <span className="text-danger">■</span> errors</div>
                <div className="mt-1 text-ink-faint">every edit · run · fix · call — sealed. a receipt, not a claim.</div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {v?.build?.proof && <DataRow k="build seal" v={<Decrypt key={v.build.proof} text={`${v.build.proof.slice(6, 26)}…`} className="font-mono text-[10px]" />} />}
              {v?.workspace.trail_sha && <DataRow k="trail seal" v={<Decrypt key={v.workspace.trail_sha} text={`${v.workspace.trail_sha.slice(8, 28)}…`} className="font-mono text-[10px]" />} />}
            </div>
          </Panel>
          </Rise>
        </OrbPanel>

        {/* CENTER — the room */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Rise>
          <div className="ng-panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <div className="ng-title text-2xl font-bold text-neon"><Decrypt text={v ? v.workspace.name : "studio"} /></div>
              <p className="text-[12px] text-ink-dim">The workshop — the engine writes, runs, and fixes until it works. Every step sealed.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <motion.span className="inline-flex" animate={building && !reduce ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
                transition={building && !reduce ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}>
                <Mark plain accent={building ? "cyan" : v?.engine_ready ? "neon" : "amber"} className="!text-[10px]">
                  {building ? "● ENGINE RUNNING" : v?.engine_ready ? "ENGINE READY" : "ENGINE OFFLINE"}
                </Mark>
              </motion.span>
              {v?.build?.preview_url && <a href={v.build.preview_url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm"><IconCode className="h-3.5 w-3.5" /> Full view ↗</a>}
              {v?.build?.deployment && <a href={v.build.deployment.url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm">live: /d/{v.build.deployment.slug} ↗</a>}
              {/* the money row — every button drives a REAL platform rail (Phase 4) */}
              <button onClick={() => setMoneyOpen(moneyOpen === "hire" ? null : "hire")} disabled={!v?.build}
                className={`ng-btn ng-btn--sm disabled:opacity-35 ${moneyOpen === "hire" ? "ng-btn-primary" : "ng-btn-ghost"}`}>Hire help</button>
              <button onClick={() => setMoneyOpen(moneyOpen === "raise" ? null : "raise")} disabled={!v?.build}
                className={`ng-btn ng-btn--sm disabled:opacity-35 ${moneyOpen === "raise" ? "ng-btn-primary" : "ng-btn-ghost"}`}>Open a raise</button>
              <button onClick={() => { void act({ action: "launch_assets" }); }} disabled={busy || !v?.build || !v?.crew.active || !!v?.pending_post}
                className="ng-btn ng-btn-ghost ng-btn--sm disabled:opacity-35">Launch post</button>
              <button onClick={() => setMoneyOpen(moneyOpen === "token" ? null : "token")} disabled={!v?.build}
                className={`ng-btn ng-btn--sm disabled:opacity-35 ${moneyOpen === "token" ? "ng-btn-primary" : "ng-btn-ghost"}`}>Tokenize</button>
              <button onClick={() => void act({ action: "deploy" })} disabled={busy || building || !v?.build} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-35"><IconBolt className="h-3.5 w-3.5" /> Deploy</button>
            </div>
          </div>
          </Rise>

          {moneyOpen === "hire" && v && (
            <Panel title="HIRE HELP" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
              <p className="mb-2.5 text-[11px] leading-relaxed text-ink-dim">Post a real job to the community board — the reward locks in USDC escrow NOW and pays the worker when you approve their delivery. Rejection refunds you.</p>
              <div className="space-y-2">
                <input value={hire.title} onChange={(e) => setHire({ ...hire, title: e.target.value })} placeholder="what you need — e.g. design a logo for this app" className="ng-input w-full !py-1.5 text-[12px]" />
                <textarea value={hire.desc} onChange={(e) => setHire({ ...hire, desc: e.target.value })} placeholder="the brief — what done looks like, what you'll approve" rows={2} className="ng-input w-full !py-1.5 text-[12px]" />
                <div className="flex items-center gap-2">
                  <input value={hire.reward} onChange={(e) => setHire({ ...hire, reward: e.target.value })} placeholder="reward" inputMode="decimal" className="ng-input w-28 !py-1.5 text-[12px]" />
                  <span className="text-[11px] text-ink-faint">USDC</span>
                  <button onClick={() => void hireGo()} disabled={busy || !hire.title.trim() || !hire.desc.trim() || !(Number(hire.reward) > 0)}
                    className="ng-btn ng-btn-primary ng-btn--sm ml-auto disabled:opacity-35">Escrow & post{Number(hire.reward) > 0 ? ` · ${Number(hire.reward)} USDC` : ""}</button>
                </div>
              </div>
              {v.money.hired.length > 0 && (
                <div className="mt-3 space-y-1">
                  {v.money.hired.map((h) => (
                    <div key={h.job_id} className="flex items-center gap-2 text-[11px]">
                      <PulseDot tone={h.status === "open" ? "cyan" : h.status === "completed" ? "neon" : "dim"} />
                      <span className="min-w-0 flex-1 truncate text-ink-dim">{h.title}</span>
                      <span className="shrink-0 text-ink-faint">{h.reward} USDC · {h.status}</span>
                      <a href="/jobs" className="shrink-0 text-[10px] text-cyan hover:underline">board ↗</a>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {moneyOpen === "raise" && v && (
            <Panel title="OPEN A RAISE" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
              {v.money.proposal ? (
                <div className="flex items-center gap-2 text-[12px]">
                  <PulseDot tone={v.money.proposal.status === "open" ? "cyan" : "neon"} />
                  <span className="min-w-0 flex-1 truncate text-ink">{v.money.proposal.title}</span>
                  <span className="shrink-0 text-ink-faint">${Math.round(v.money.proposal.ask).toLocaleString()} · {v.money.proposal.status}</span>
                  <a href={`/genesis/${v.money.proposal.proposal_id}`} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px]">open ↗</a>
                </div>
              ) : draft ? (
                <div className="space-y-2">
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="ng-input w-full !py-1.5 text-[12px]" />
                  <p className="max-h-24 overflow-y-auto text-[11px] leading-relaxed text-ink-dim">{draft.pitch}</p>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-ink-faint">ask</span>
                    <input value={String(draft.ask_usdc)} onChange={(e) => setDraft({ ...draft, ask_usdc: Math.max(1, Math.round(Number(e.target.value) || 0)) })} inputMode="numeric" className="ng-input w-28 !py-1 text-[12px]" />
                    <span className="text-ink-faint">USDC · {draft.milestones.length} milestones</span>
                  </div>
                  <div className="space-y-1">
                    {draft.milestones.map((m, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="min-w-0 truncate text-ink-dim">{i + 1}. {m.title}</span>
                        <span className="shrink-0 text-ink-faint">${m.amount_usdc.toLocaleString()}{m.days ? ` · ${m.days}d` : ""}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => void openRaise()} disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-35">Open the raise</button>
                    <button onClick={() => setDraft(null)} className="ng-btn ng-btn-ghost ng-btn--sm">discard</button>
                    <span className="text-[10px] text-ink-faint">backed by your proof of build</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-relaxed text-ink-dim">The finance flow: Echo drafts the pitch, ask, and milestone tranches FROM this real build — you review and edit everything before it goes on the Fund board.</p>
                  <button onClick={() => void draftRaise()} disabled={drafting || !v.crew.active} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-35">{drafting ? "drafting…" : "Draft with Echo · free"}</button>
                </div>
              )}
            </Panel>
          )}

          {moneyOpen === "token" && v && (
            <Panel title="PATH TO TOKEN" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5">
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={v.money.grid ? "text-neon" : "text-ink-faint"}>{v.money.grid ? "✓" : "1"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-dim">Project grid{v.money.grid ? ` — ${v.money.grid.name}` : " — the product's home"}</span>
                  {!v.money.grid && <button onClick={() => void hit(`/api/echo/builds/${v.build!.build_id}/grid`)} disabled={busy} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">create</button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={v.money.product ? "text-neon" : "text-ink-faint"}>{v.money.product ? "✓" : "2"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-dim">Listed on GridX{v.money.product ? ` — ${v.money.product.title}` : " — sell it as a real product"}</span>
                  {!v.money.product && <button onClick={() => void hit("/api/gridx", { build_id: v.build!.build_id })} disabled={busy} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">list</button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={v.money.audit?.status === "passed" ? "text-neon" : "text-ink-faint"}>{v.money.audit?.status === "passed" ? "✓" : "3"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-dim">Security audit{v.money.audit ? ` — ${v.money.audit.status}` : " — a verifier signs off"}</span>
                  {v.money.grid && !v.money.audit && <button onClick={() => void hit(`/api/grids/${v.money.grid!.slug}/audit`)} disabled={busy} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">request</button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={v.money.market ? "text-neon" : "text-ink-faint"}>{v.money.market ? "✓" : "4"}</span>
                  {v.money.market ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-ink">${v.money.market.symbol} is LIVE — {v.money.market.stage}</span>
                      <a href={`/market/${v.money.market.market_id}`} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px]">trade ↗</a>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-ink-dim">Launch the token{v.money.eligibility && !v.money.eligibility.ok ? ` — ${String(v.money.eligibility.reason).replace(/_/g, " ")}` : ""}</span>
                      <input value={tokSym} onChange={(e) => setTokSym(e.target.value.toUpperCase().slice(0, 6))} placeholder="SYM" className="ng-input w-16 shrink-0 !py-0.5 text-center !text-[10px]" />
                      <button onClick={() => void hit(`/api/grids/${v.money.grid?.slug}/launch`, tokSym ? { symbol: tokSym } : {})} disabled={busy || !v.money.eligibility?.ok}
                        className="ng-btn ng-btn-primary ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">launch</button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-2.5 text-[10px] leading-relaxed text-ink-faint">Proof, not promise: the token gate is DELIVERY (a shipped product or released milestones) + a passed audit — the same earned path every market on the platform walked.</p>
            </Panel>
          )}

          <Rise delay={0.04}>
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {kpis.slice(0, 3 + closed).map((s, i) => (
              <div key={s.title} className="ng-card p-4 text-center">
                <div className="ng-tag mb-2 justify-center" style={{ color: kpiColor(i) }}><s.Icon className="h-3 w-3" />{s.title}</div>
                <div className="ng-stat__v !text-2xl" style={{ color: kpiColor(i) }}>{Number.isFinite(Number(s.v)) ? <CountUp key={s.v} value={Number(s.v)} /> : s.v}</div>
                <div className="mt-1 text-[11px] text-ink-dim">{s.sub}</div>
              </div>
            ))}
          </div>
          </Rise>

          <Rise delay={0.08}>
          <Panel title="LIVE PREVIEW" icon={<IconCode className="h-4 w-4" />} bodyClass="p-3.5"
            action={<span className="pointer-events-auto flex items-center gap-2">
              {shipped > 0 && (
                <motion.span className="inline-flex" initial={reduce ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                  <Mark plain accent="cyan" className="!text-[10px]">▲ shipped v{shipped}</Mark>
                </motion.span>
              )}
              {v?.build && <Mark plain className="!text-[10px]">v{v.build.version}{building ? " · updating…" : ""}</Mark>}
              {v?.build?.preview_url && <a href={v.build.preview_url} target="_blank" className="ng-btn ng-btn-ghost ng-btn--sm !px-2 !py-0.5 !text-[10px]">open full ↗</a>}
            </span>}>
            {v?.build?.preview_url ? (
              <motion.div key={v.build.version} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
                className="transition-shadow duration-700"
                style={shipped ? { boxShadow: "0 0 0 1px rgba(72,245,255,0.7), 0 0 26px rgba(72,245,255,0.22)" } : undefined}>
                <iframe src={v.build.preview_url} sandbox="allow-scripts" title="live preview"
                  className="h-[56vh] min-h-[380px] w-full border border-neon/15 bg-black" />
              </motion.div>
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
          </Rise>

          <Rise delay={0.12}>
          <div className="ng-panel p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-cyan">&gt;</span>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder={building ? "engine running — queue your next directive when it lands" : v?.files.length ? "tell the engine what to change…" : "tell the engine what to build…"}
                disabled={building || !v?.engine_ready} className="ng-input w-full !border-0 !bg-transparent !py-1.5 disabled:opacity-50" />
              <button onClick={run} disabled={busy || building || !v?.engine_ready} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-35">
                <IconBolt className="h-3.5 w-3.5" /> Run · {v?.run_costs?.[quality] ?? v?.run_cost ?? "—"} GRID
              </button>
            </div>
            {/* the quality dial + effort knob — how hard the crew works this run (Phase 6a) */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-neon/10 pt-2">
              <span className="flex items-center">
                <span className="ng-tag mr-2 !text-[9px] !text-ink-faint">quality</span>
                {([["standard", "STANDARD"], ["verified", "✓ VERIFIED"], ["best3", "⚡ BEST-OF-3"]] as const).map(([q, label]) => (
                  <button key={q} onClick={() => setQuality(q)} disabled={building}
                    title={q === "verified" ? "the engine runs its own verification loop on the finished work" : q === "best3" ? "three candidates race in parallel — the best one ships" : "one focused build pass"}
                    className={`border px-2 py-0.5 text-[9px] tracking-wider transition-colors disabled:opacity-40 ${quality === q ? "border-neon/70 bg-neon/15 text-neon" : "border-neon/15 text-ink-faint hover:text-ink-dim"} ${q !== "standard" ? "-ml-px" : ""}`}>
                    {label}
                  </button>
                ))}
              </span>
              <span className="flex items-center">
                <span className="ng-tag mr-2 !text-[9px] !text-ink-faint">effort</span>
                {([["low", "▂"], ["medium", "▄"], ["high", "▆"]] as const).map(([e, bar]) => (
                  <button key={e} onClick={() => setEffort(e)} disabled={building} title={`${e} reasoning effort for the hands' brain`}
                    className={`border px-2 py-0.5 text-[10px] leading-none transition-colors disabled:opacity-40 ${effort === e ? "border-neon/70 bg-neon/15 text-neon" : "border-neon/15 text-ink-faint hover:text-ink-dim"} ${e !== "low" ? "-ml-px" : ""}`}>
                    {bar}
                  </button>
                ))}
              </span>
              {quality !== "standard" && <span className="text-[9px] text-ink-faint">{quality === "best3" ? "3 candidates race — you ship the winner" : "the engine double-checks its own work before it stops"}</span>}
            </div>
          </div>
          </Rise>

          <Rise delay={0.16}>
          <Panel title="MISSION FEED" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <div ref={feedRef} className="max-h-[300px] space-y-2 overflow-y-auto">
              {v?.turns.map((t) => (
                <div key={t.turn_id} className="text-[12px] leading-relaxed">
                  <Tag className={`mr-1.5 !text-[9px] ${t.role === "you" ? "!text-cyan" : t.error ? "!text-danger" : t.role === "chief" ? "!text-neon" : ""}`}>{t.role.toUpperCase()}</Tag>
                  <span className={t.error ? "text-danger" : t.role === "chatter" ? "text-ink-dim" : "text-ink"}>{t.text}</span>
                  {t.grade && (
                    <span className={`ml-1.5 text-[10px] ${t.grade === "pass" ? "text-neon" : "text-amber"}`}>{t.grade === "pass" ? "✓ pass" : "⚠ needs a fix"}</span>
                  )}
                  {t.version !== undefined && !t.error && (
                    <span className="text-[10px] text-ink-faint"> — v{t.version}{t.files_changed ? ` · ${t.files_changed} file(s)` : ""}{t.duration_s ? ` · ${Math.round(t.duration_s)}s` : ""}{t.cost_usd ? ` · $${t.cost_usd.toFixed(2)}` : ""}{t.quality ? ` · ${t.quality === "best3" ? "best-of-3" : "verified"}` : ""}</span>
                  )}
                </div>
              ))}
              {building && (
                <div className="text-[12px] text-cyan"><Tag className="mr-1.5 !text-[9px] !text-cyan">{briefing || reviewing ? "CHIEF" : "ENGINE"}</Tag>{v?.workspace.progress || "working…"}<span className="animate-pulse">▌</span></div>
              )}
            </div>
            {v?.pending_fix && !building && (
              <div className="mt-3 border border-amber/40 p-3">
                <div className="ng-tag mb-1.5 !text-amber">the chief wants a fix run</div>
                <p className="text-[11px] leading-relaxed text-ink-dim">{v.pending_fix.notes}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink">&gt; {v.pending_fix.re_brief}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button onClick={() => void act({ action: "fix", decision: "approve" })} disabled={busy || !v.engine_ready}
                    className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-35"><IconBolt className="h-3.5 w-3.5" /> Run the fix · {v.run_cost} GRID</button>
                  <button onClick={() => void act({ action: "fix", decision: "dismiss" })} disabled={busy}
                    className="ng-btn ng-btn-ghost ng-btn--sm disabled:opacity-35">dismiss</button>
                </div>
              </div>
            )}
            {v?.pending_post && (
              <div className="mt-3 border border-cyan/30 p-3">
                <div className="ng-tag mb-1.5 !text-cyan">launch post — awaiting your approval</div>
                <div className="text-[12px] font-bold text-ink">{v.pending_post.title}</div>
                <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-dim">{v.pending_post.body}</p>
                {v.pending_post.tagline && <p className="mt-1.5 text-[11px] italic text-ink-faint">“{v.pending_post.tagline}”</p>}
                <div className="mt-2.5 flex items-center gap-2">
                  <button onClick={() => void act({ action: "post", decision: "approve" })} disabled={busy}
                    className="ng-btn ng-btn-cyan ng-btn--sm disabled:opacity-35">Publish to the wire</button>
                  <button onClick={() => void act({ action: "post", decision: "dismiss" })} disabled={busy}
                    className="ng-btn ng-btn-ghost ng-btn--sm disabled:opacity-35">dismiss</button>
                  <span className="text-[10px] text-ink-faint">a real public post — nothing publishes without you</span>
                </div>
              </div>
            )}
          </Panel>
          </Rise>
        </main>

        {/* RIGHT — signal */}
        <OrbPanel side="right" label="Signal" open={rOpen} onToggle={setROpen}>
          <Rise delay={0.03}>
          <Panel title="CREW · LIVE" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="space-y-2.5 text-[11px]">
              <div>
                <div className="flex items-center gap-1.5">
                  <PulseDot tone={briefing || reviewing ? "cyan" : v?.crew.active ? "neon" : "dim"} />
                  <span className="text-ink">CHIEF</span>
                  <span className="ml-auto font-mono text-[9px] text-ink-faint">{v?.crew.chief}</span>
                </div>
                <div className="mt-0.5 pl-3.5 leading-snug text-ink-dim">
                  {briefing ? "briefing the crew…" : reviewing ? "reviewing the work…" : lastChief?.grade ? `graded the last ship — ${lastChief.grade === "pass" ? "pass" : "wants a fix"}` : lastChief ? "briefed the hands" : "plans · briefs · grades every ship"}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <PulseDot tone={building && !briefing && !reviewing ? "cyan" : engineTurns.length ? "neon" : "dim"} />
                  <span className="text-ink">HANDS</span>
                  <span className="ml-auto font-mono text-[9px] text-ink-faint">grok-build · {v?.crew.hands}</span>
                </div>
                <div className="mt-0.5 pl-3.5 leading-snug text-ink-dim">
                  {building && !briefing && !reviewing ? "building — write · run · fix" : engineTurns.length ? `${engineTurns.length} run${engineTurns.length === 1 ? "" : "s"} shipped` : "waiting for the first directive"}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <PulseDot tone={lastChatter ? "neon" : "dim"} />
                  <span className="text-ink">CHATTER</span>
                  <span className="ml-auto font-mono text-[9px] text-ink-faint">{(v?.crew.chatter ?? "").replace(/-\d{8}$/, "")}</span>
                </div>
                <div className="mt-0.5 pl-3.5 leading-snug text-ink-dim">{lastChatter ? lastChatter.text.slice(0, 90) : "writes your status line after each ship"}</div>
              </div>
            </div>
            {v && !v.crew.active && <p className="mt-2.5 text-[10px] text-amber/80">crew brains offline — the engine runs solo</p>}
          </Panel>
          </Rise>

          <Rise delay={0.05}>
          <Panel title="SKILLS · PLUGINS" icon={<IconLayers className="h-4 w-4" />} bodyClass="p-3.5"
            action={<button onClick={() => setStoreOpen((o) => !o)} className={`pointer-events-auto ng-tag !text-[10px] ${storeOpen ? "!text-neon" : "!text-ink-dim"} hover:!text-neon`}>+ store</button>}>
            {(v?.skills.length ?? 0) === 0 && (v?.plugins.length ?? 0) === 0 ? (
              <p className="text-[11px] leading-relaxed text-ink-dim">Teach the engine. Skills are single recipes; plugins bundle several (skills + commands) in one install. Get them from the store — or publish your own and earn GRID per install.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {v!.skills.map((s) => (
                  <span key={s.published_id} title={s.scope === "toolbox" ? "from your toolbox" : "this project only"}
                    className={`border px-1.5 py-0.5 text-[10px] ${s.enabled === false ? "border-neon/10 text-ink-faint line-through" : "border-neon/25 bg-neon/[0.06] text-neon"}`}>{s.title}</span>
                ))}
                {v!.plugins.map((p) => (
                  <span key={p.published_id} title={`plugin · ${p.files} components · ${p.scope === "toolbox" ? "from your toolbox" : "this project only"}`}
                    className={`border px-1.5 py-0.5 text-[10px] ${!p.enabled ? "border-cyan/10 text-ink-faint line-through" : "border-cyan/30 bg-cyan/[0.06] text-cyan"}`}>⧉ {p.title}</span>
                ))}
              </div>
            )}
            {storeOpen && (
              <div className="mt-3 space-y-1.5 border-t border-neon/10 pt-2.5">
                {(v?.skill_store.length ?? 0) === 0 && <p className="text-[10px] text-ink-faint">the store is empty — publish the first build-skill from /skills</p>}
                {v?.skill_store.map((p) => (
                  <div key={p.published_id} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-ink-dim" title={p.summary}>{p.title} <span className="text-ink-faint">· by {p.author}</span></span>
                    {p.installed ? (
                      <span className="shrink-0 text-[10px] text-neon">✓ installed</span>
                    ) : (
                      <button onClick={() => void act({ action: "install_skill", published_id: p.published_id })} disabled={busy || building}
                        className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">
                        install{p.mine ? " · yours" : p.price_grid > 0 ? ` · ${p.price_grid} GRID` : " · free"}
                      </button>
                    )}
                  </div>
                ))}
                {(v?.plugin_store.length ?? 0) > 0 && <div className="ng-label !mb-0 !mt-2 !text-[9px] !text-ink-faint">plugins — bundled toolkits</div>}
                {v?.plugin_store.map((p) => (
                  <div key={p.published_id} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-ink-dim" title={p.summary}>⧉ {p.title} <span className="text-ink-faint">· {p.files} parts · by {p.author}</span></span>
                    {p.installed ? (
                      <span className="shrink-0 text-[10px] text-neon">✓ installed</span>
                    ) : (
                      <button onClick={() => void act({ action: "install_plugin", published_id: p.published_id })} disabled={busy || building}
                        className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2 !py-0.5 !text-[10px] disabled:opacity-35">
                        install{p.mine ? " · yours" : p.price_grid > 0 ? ` · ${p.price_grid} GRID` : " · free"}
                      </button>
                    )}
                  </div>
                ))}
                <a href="/skills" className="block pt-1 text-[10px] text-cyan hover:underline">the full skills market ↗</a>
              </div>
            )}
          </Panel>
          </Rise>

          <Rise delay={0.06}>
          <Panel title="MCP · CONNECTIONS" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5"
            action={(v?.connections.length ?? 0) > 0 ? <button onClick={() => void checkConns()} disabled={busy || checking} className="pointer-events-auto ng-tag !text-[10px] !text-ink-dim hover:!text-neon disabled:opacity-40">{checking ? "checking…" : "re-check"}</button> : undefined}>
            {/* the connected list (each with a live health light) */}
            {(v?.connections.length ?? 0) > 0 && (
              <div className="mb-2.5 space-y-1.5">
                {v!.connections.map((c) => (
                  <div key={c.name} className="group flex items-center gap-2 text-[11px]">
                    <PulseDot tone={!c.enabled ? "dim" : c.health ? (c.health.ok ? "neon" : "dim") : "dim"} />
                    <span className={`min-w-0 flex-1 truncate ${!c.enabled ? "text-ink-faint line-through" : c.health && !c.health.ok ? "text-danger" : "text-ink"}`} title={c.health?.note ?? c.command}>
                      {c.name} <span className="text-ink-faint">· {c.kind}{c.secret ? ` · 🔒 ${c.secret}` : ""}</span>
                    </span>
                    {c.scope === "toolbox" && <span className="shrink-0 border border-neon/20 px-1 text-[8px] tracking-wider text-ink-faint" title="from your toolbox — set up once on the Echo hub, on in every workshop">TOOLBOX</span>}
                    {c.enabled && c.health && <span className={`shrink-0 text-[9px] ${c.health.ok ? "text-neon" : "text-danger"}`}>{c.health.ok ? "● live" : "○ down"}</span>}
                    {c.scope === "toolbox" ? (
                      <button onClick={() => void act({ action: "toolbox_toggle", name: c.name, on: !c.enabled })} disabled={busy || building}
                        title={c.enabled ? "switch off for this project" : "switch back on for this project"}
                        className="shrink-0 text-[10px] text-ink-faint opacity-40 transition-opacity hover:text-neon group-hover:opacity-100 disabled:opacity-20">{c.enabled ? "⏻" : "○"}</button>
                    ) : (
                      <button onClick={() => void act({ action: "mcp_remove", name: c.name })} disabled={busy || building} title="disconnect"
                        className="shrink-0 text-[10px] text-ink-faint opacity-40 transition-opacity hover:text-danger group-hover:opacity-100 disabled:opacity-20">✕</button>
                    )}
                  </div>
                ))}
                {v?.connections_checked_at && <p className="text-[9px] text-ink-faint">last health check: {new Date(v.connections_checked_at).toLocaleTimeString()}</p>}
              </div>
            )}

            {/* the ALWAYS-VISIBLE connect button — the fix: no more hidden affordance */}
            {!connOpen ? (
              <>
                {(v?.connections.length ?? 0) === 0 && <p className="mb-2 text-[11px] leading-relaxed text-ink-dim">Give the engine real powers: connect GitHub, a database, or <span className="text-ink">any MCP server by URL</span>. Then it can act on your world — not just write files.</p>}
                <button onClick={() => setConnOpen(true)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block justify-center"><IconBolt className="h-3.5 w-3.5" /> Connect a service</button>
              </>
            ) : (
              <div className="space-y-2.5">
                <div className="ng-label !text-[10px] !text-ink-dim">what do you want to connect?</div>
                {/* the picker as a real list — each option says what it does */}
                <div className="space-y-1">
                  {[
                    { kind: "remote", label: "Any MCP server (URL)", desc: "paste a server URL — the usual way to connect a third-party MCP" },
                    ...(v?.mcp_catalog ?? []),
                    { kind: "custom", label: "Custom command", desc: "run a local MCP server by command (npx, python, a binary…)" },
                  ].map((c) => (
                    <button key={c.kind} onClick={() => setConn({ ...conn, kind: c.kind })}
                      className={`flex w-full items-start gap-2 border p-2 text-left transition-colors ${conn.kind === c.kind ? "border-neon/60 bg-neon/[0.06]" : "border-neon/12 hover:border-neon/30"}`}>
                      <span className={`mt-0.5 text-[10px] ${conn.kind === c.kind ? "text-neon" : "text-ink-faint"}`}>{conn.kind === c.kind ? "◉" : "○"}</span>
                      <span className="min-w-0">
                        <span className={`block text-[11px] ${conn.kind === c.kind ? "text-neon" : "text-ink"}`}>{c.label}</span>
                        <span className="block text-[10px] leading-snug text-ink-faint">{c.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* the inputs for the chosen kind */}
                <div className="space-y-1.5 border-t border-neon/10 pt-2">
                  {conn.kind === "remote" && (
                    <>
                      <input value={conn.url} onChange={(e) => setConn({ ...conn, url: e.target.value })} placeholder="https://your-mcp-server.com/mcp" className="ng-input w-full !py-1.5 text-[11px]" />
                      <input value={conn.header} onChange={(e) => setConn({ ...conn, header: e.target.value })} placeholder="auth header (optional) — e.g. Authorization: Bearer sk-…" className="ng-input w-full !py-1.5 text-[11px]" />
                    </>
                  )}
                  {conn.kind === "custom" && (
                    <>
                      <input value={conn.command} onChange={(e) => setConn({ ...conn, command: e.target.value })} placeholder="command — e.g. npx" className="ng-input w-full !py-1.5 text-[11px]" />
                      <input value={conn.args} onChange={(e) => setConn({ ...conn, args: e.target.value })} placeholder="arguments — e.g. -y @scope/my-mcp-server" className="ng-input w-full !py-1.5 font-mono text-[10px]" />
                    </>
                  )}
                  {conn.kind !== "remote" && conn.kind !== "custom" && (() => {
                    const cat = v?.mcp_catalog.find((c) => c.kind === conn.kind);
                    return cat?.needs ? (
                      <input value={conn.value} onChange={(e) => setConn({ ...conn, value: e.target.value })} placeholder={`${cat.needs.label} — ${cat.needs.placeholder}`} type="password" className="ng-input w-full !py-1.5 text-[11px]" />
                    ) : <p className="text-[10px] text-ink-faint">no credentials needed — connects as-is.</p>;
                  })()}
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => void connectGo()} disabled={busy || building} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-35"><IconBolt className="h-3 w-3" /> Connect</button>
                  <button onClick={() => setConnOpen(false)} className="ng-btn ng-btn-ghost ng-btn--sm !px-2 !py-0.5">cancel</button>
                </div>
                <p className="text-[9px] leading-relaxed text-ink-faint">🔒 secrets stay on the server, never in a build or a proof · every server runs inside the kernel jail</p>
              </div>
            )}
          </Panel>
          </Rise>

          <Rise delay={0.07}>
          <Panel title="SESSION" icon={<IconBolt className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="space-y-1">
              <DataRow k="status" v={
                <span className={`flex items-center gap-1.5 ${building ? "text-cyan" : "text-neon"}`}>
                  <PulseDot tone={building ? "cyan" : v?.engine_ready ? "neon" : "dim"} />{v?.workspace.status ?? "…"}
                </span>} />
              <DataRow k="engine" v={v?.engine_ready ? `grok-build · self-hosted${v?.engine_mode === "acp" ? " · live" : ""}` : "offline"} />
              <DataRow k="spent" v={`${Math.round(v?.workspace.spent_grid ?? 0)} GRID`} />
              {(v?.spent_usd ?? 0) > 0 && <DataRow k="engine compute (real)" v={<span className="text-cyan">${(v!.spent_usd).toFixed(2)}</span>} />}
              <DataRow k="memory" v={
                <button onClick={() => void act({ action: "memory", on: !v?.memory_enabled })} disabled={busy || building}
                  title="cross-session memory — the engine remembers this project's decisions between sessions (experimental)"
                  className={`border px-1.5 py-0.5 text-[9px] tracking-wider transition-colors disabled:opacity-40 ${v?.memory_enabled ? "border-neon/70 bg-neon/15 text-neon" : "border-neon/15 text-ink-faint hover:text-ink-dim"}`}>
                  {v?.memory_enabled ? "● REMEMBERS" : "○ OFF"}
                </button>} />
              <DataRow k="code leaves neugrid" v={<span className="text-neon">never</span>} />
            </div>
            {paidRuns > 0 && (
              <div className="mt-2.5">
                <div className="flex items-baseline justify-between text-[10px] text-ink-faint">
                  <span>spend · {paidRuns} run{paidRuns === 1 ? "" : "s"} × {v?.run_cost ?? 0}</span>
                  <span>{Math.round(v?.workspace.spent_grid ?? 0)} / {paidRuns * (v?.run_cost ?? 0)}</span>
                </div>
                <Meter value={v?.workspace.spent_grid ?? 0} max={paidRuns * (v?.run_cost ?? 1)} w={230} className="mt-1 w-full" />
              </div>
            )}
          </Panel>
          </Rise>

          {engineTurns.length > 0 && (
            <Rise delay={0.1}>
            <Panel title="RUN TELEMETRY" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
              <div className="ng-label mb-1 !text-ink-dim">Seconds per run</div>
              <Bars data={engineTurns.map((t) => t.duration_s ?? 0)} w={250} h={54} />
              <div className="ng-label mb-1 mt-3 !text-ink-dim">Files touched per run</div>
              <Lollipop data={engineTurns.map((t, i) => ({ value: t.files_changed ?? 0, label: t.version ? `v${t.version}` : `run ${i + 1}` }))} w={250} rowH={13} gap={5} />
              <div className="ng-label mb-1 mt-3 !text-ink-dim">GRID per run</div>
              <StackBars data={engineRuns.map((t) => ({ values: t.error ? [0, t.cost_grid ?? v?.run_cost ?? 0] : [t.cost_grid ?? v?.run_cost ?? 0, 0] }))} h={44} colors={["#00ff00", "#ff8b8b"]} />
              <div className="mt-1 text-[10px] text-ink-faint"><span className="text-neon">■</span> charged · <span className="text-danger">■</span> refunded on failure</div>
              {engineTurns.filter((t) => t.cost_usd).length > 1 && (
                <>
                  <div className="ng-label mb-1 mt-3 !text-ink-dim">Real $ per run</div>
                  <StepArea data={engineTurns.map((t) => t.cost_usd ?? 0)} gid="studioCost" color="#48f5ff" w={250} h={44} />
                  <div className="mt-0.5 flex justify-between text-[9px] text-ink-faint">
                    <span>the engine&apos;s own cost reports</span>
                    <span className="text-cyan">${engineTurns.reduce((s, t) => s + (t.cost_usd ?? 0), 0).toFixed(2)} total</span>
                  </div>
                </>
              )}
              <div className="mt-2 space-y-1">
                <DataRow k="last run" v={`${Math.round(engineTurns[engineTurns.length - 1].duration_s ?? 0)}s`} />
                <DataRow k="files touched" v={String(engineTurns.reduce((s, t) => s + (t.files_changed ?? 0), 0))} />
              </div>
            </Panel>
            </Rise>
          )}

          <Rise className="lg:h-full lg:min-h-0" delay={0.15}>
          <Panel scroll title="ACTION TRAIL" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5"
            action={<span className="pointer-events-auto flex items-center gap-2">
              <a href={`/api/studio/${id}/export`} download title="download the full sealed receipt as Markdown" className="text-[10px] text-cyan hover:underline">⇩ receipt</a>
              {trailTotal > 0 && (
                <span className="flex h-1.5 w-20 overflow-hidden bg-neon/10">
                  {trailMix.map((n, i) => n > 0 ? <span key={TRAIL_TYPES[i]} style={{ width: `${(n / trailTotal) * 100}%`, background: TRAIL_COLORS[i] }} /> : null)}
                </span>
              )}
              <Mark plain className="!text-[10px]">{v?.trail_len ?? 0} sealed</Mark>
            </span>}>
            <div className="space-y-1.5">
              {(v?.trail ?? []).slice().reverse().map((e, i) => (
                <Rise key={`${(v?.trail_len ?? 0) - i}`} delay={Math.min(i, 5) * 0.035} y={6}>
                  <div className="text-[11px] leading-snug">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: trailColor(e.type) }} />
                    <span className={`mr-1 ${e.type === "error" ? "text-danger" : e.type === "run" ? "text-cyan" : "text-ink-faint"}`}>{e.type}</span>
                    <span className="text-ink-dim">{e.summary}</span>
                  </div>
                </Rise>
              ))}
            </div>
          </Panel>
          </Rise>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>}
    </div>
  );
}
