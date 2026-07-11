"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Mark, Tag, Tabs, Bracket, DataRow, ProgressBar,
  IconGrid, IconActivity, IconChart, IconShield, IconEye, IconBolt,
  IconNetwork, IconCube, IconLayers, IconTarget, IconClock, IconLock,
  IconStar, IconRocket, IconUser, IconBot, IconCode, IconDatabase,
  IconCoins, IconCheck, IconBriefcase,
  IconArrowRight, IconArrowUp, IconArrowDown, IconPlus, IconAlert,
  IconRefresh, IconExternal, IconSparkle, IconMessage,
} from "@/components/app/ui";
import { Ring, Histogram, SegBar, Donut, Spark } from "@/components/app/charts";
import { PanelChart, TMeter } from "@/components/app/terminal";
import Meter from "@/components/app/Meter";
import { Decrypt, CountUp, Typewriter } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import type { Build } from "@/lib/types";
import type { ProposalDraft } from "@/lib/brain";

/* ===== Echo — living HUD restyle of the "NeuGrid / Echo" frames ===== */
type Mode = "select" | "personal" | "analyst" | "builder" | "executor" | "observer";
/* real marketplace rows for the Builder "recommended executors" rail */
type AgentRow = { agent_id: string; name: string; capabilities: string[]; rating: number; trust_tier?: string; verified_jobs: number };
type TalentRow = { id: string; username: string; skills: string[]; reputation: number; jobs_done: number };
const MODES: { key: Exclude<Mode, "select">; name: string; Icon: (p: { className?: string }) => React.JSX.Element; tag: string; desc: string; risk: string }[] = [
  { key: "personal", name: "Personal", Icon: IconBot, tag: "Learn, ask, explore", desc: "Query Echo for insights, aggregated intelligence, and personalized guidance.", risk: "None" },
  { key: "analyst", name: "Analyst", Icon: IconChart, tag: "Analyze deeply, no action", desc: "Decision-grade analysis with full transparency. No execution, no spending.", risk: "None" },
  { key: "builder", name: "Builder", Icon: IconCode, tag: "Design & build apps", desc: "Progressive autonomy: Echo builds to 70%, then hands off to specialists.", risk: "Low" },
  { key: "executor", name: "Executor", Icon: IconBolt, tag: "Execute approved actions", desc: "Precision execution with full audit trail. High stakes, high control.", risk: "High" },
  { key: "observer", name: "Observer", Icon: IconEye, tag: "Monitor & audit", desc: "Perfect visibility, zero authority. See everything, touch nothing.", risk: "None" },
];
const capability: Record<string, { caps: [string, boolean][]; safety: string; req: string }> = {
  personal: { caps: [["Can query intelligence", true], ["Can get recommendations", true], ["Can execute", false], ["Can spend funds", false]], safety: "Personal Mode is for learning and exploration. Echo cannot execute actions or access funds.", req: "No special requirements" },
  analyst: { caps: [["Can query intelligence", true], ["Can get recommendations", true], ["Can execute", false], ["Can spend funds", false]], safety: "Analyst Mode delivers decision-grade analysis. Echo cannot execute or spend — recommendations only.", req: "No special requirements" },
  builder: { caps: [["Can query intelligence", true], ["Can get recommendations", true], ["Can execute", true], ["Can spend funds", true]], safety: "Builder Mode builds to ~70% autonomously, then hands off to verified executors. Budget-capped.", req: "Connected wallet · Active stake" },
  executor: { caps: [["Can query intelligence", true], ["Can get recommendations", true], ["Can execute", true], ["Can spend funds", true]], safety: "Executor Mode performs high-stakes, irreversible actions. Multi-sig and guardian controls apply.", req: "KYC Level 3 · Multi-sig guardians" },
  observer: { caps: [["Can query intelligence", true], ["Can get recommendations", false], ["Can execute", false], ["Can spend funds", false]], safety: "Observer Mode has perfect visibility and zero authority. See everything, touch nothing.", req: "No special requirements" },
};
/* personal / analyst / observer — now REAL (grounded ask over live data; see runAsk) */
/* builder */
const execLayers: [string, boolean][] = [["Solana", true], ["Ethereum", false], ["Base", false], ["BNB Chain", false], ["ICP", false], ["Custom L1/L2", false]];
const buildTemplates: [string, string, boolean][] = [["dApp", "DeFi / NFT / RWA", true], ["AI Agent App", "Autonomous agents", false], ["Social App", "Community platform", false], ["Trading App", "DEX / Markets", false], ["Infra / Tooling", "Developer tools", false], ["Custom", "Free-form build", false]];
const blueprint: [string, string][] = [["Frontend", "Next.js"], ["Backend", "Solana Programs (Anchor)"], ["AI Layer", "AgentX Agents"], ["Governance", "SPL DAO"], ["Payments", "SPL Tokens"]];
/* Builder's build stream + capability gap are now driven by real Echo builds (see runBuild). */
const failureControls: { Icon: (p: { className?: string }) => React.JSX.Element; l: string }[] = [{ Icon: IconClock, l: "Auto-pause payment on missed deadline" }, { Icon: IconAlert, l: "Reassign task on failed tests" }, { Icon: IconArrowDown, l: "Reputation slashing for bad code" }, { Icon: IconTarget, l: "Escalate to governance if disputed" }];
/* executor (Launch / Deploy) — Launchpad + build summary + launch status are real + build-aware
   (createProjectGrid / listOnGridX / applyGenesis); see the EchoPage component below. */
/* executor — execution flow is now the REAL deploy rail (NeuGrid hosting; see deployNow) */
/* observer — now REAL: the live event stream + grounded narration (see runAsk) */
/* Builder's "recommended executors" rail is now real (top agents + talent — see AgentRow/TalentRow + the fetch). */


/* ----------------------------- atoms ------------------------------- */

function Orb({ size = 240 }: { size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 50% 45%, rgba(0,255,80,0.9), rgba(0,200,60,0.25) 38%, rgba(0,60,20,0.15) 60%, transparent 72%)", boxShadow: "0 0 60px 8px rgba(0,255,0,0.45), inset 0 0 60px rgba(0,255,80,0.6)" }} />
      <div className="absolute rounded-full border border-neon/30" style={{ inset: size * 0.08 }} />
      <div className="absolute rounded-full" style={{ inset: size * 0.2, background: "radial-gradient(circle at 40% 35%, rgba(180,255,200,0.9), rgba(0,180,60,0.3) 55%, transparent)", filter: "blur(1px)" }} />
    </div>
  );
}
function Av({ size = 36, seed }: { size?: number; seed?: string }) {
  return <MatrixAvatar seed={seed || "node"} size={size} />;
}
function ModeSwitcher({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="ng-card p-3.5">
      <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconGrid className="h-3.5 w-3.5" /></span>ECHO MODE</div>
      <button onClick={() => setMode("select")} className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mb-2 justify-start"><IconHomeMini className="h-3.5 w-3.5" /> Mode Hub</button>
      <div className="ng-tabs-vert space-y-0.5">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)} className={`flex w-full items-center gap-2 border-l-2 px-2.5 py-2 text-left text-[12px] transition ${mode === m.key ? "border-neon text-neon" : "border-transparent text-ink-dim hover:border-neon/40 hover:text-neon"}`}><m.Icon className="h-3.5 w-3.5" />{m.name}</button>
        ))}
      </div>
    </div>
  );
}
function IconHomeMini({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function SecLabel({ icon, children, action, accent = "ink-dim" }: { icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; accent?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className={`ng-label flex items-center gap-2 !text-${accent}`}>{icon && <span className="text-neon">{icon}</span>}{children}</div>
      {action}
    </div>
  );
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ng-card p-3.5 ${className}`}>{children}</div>;
}

export default function EchoPage() {
  const [mode, setMode] = useState<Mode>("select");
  const [sel, setSel] = useState("personal");
  const [execRun, setExecRun] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  const [execs, setExecs] = useState<{ agents: AgentRow[]; talent: TalentRow[] } | null>(null);
  const notify = (m: string) => { setToast(m); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2400); };

  const [gridBal, setGridBal] = useState<number | null>(null);
  const [starterBal, setStarterBal] = useState<number>(0); // non-transferable Echo credit (starter grant)
  const applyBalances = (b?: { grid: number; starter_credit?: number } | null) => {
    if (!b) return;
    setGridBal(b.grid);
    if (b.starter_credit != null) setStarterBal(b.starter_credit);
  };

  /* Echo Builder — REAL model codegen (files + interactive preview + sha256 proof). */
  const [bPrompt, setBPrompt] = useState("");
  const [bBuilding, setBBuilding] = useState(false);
  const [bBuild, setBBuild] = useState<Build | null>(null);
  const [bRevealed, setBRevealed] = useState(0);
  const [outTab, setOutTab] = useState<"preview" | "files">("preview");
  const [outFile, setOutFile] = useState(0);
  const [revText, setRevText] = useState("");
  const [revBusy, setRevBusy] = useState(false);
  const REVISION_COST = 100; // Echo revision cost in GRID (= Params echo_revision_cost_grid default)
  /* the deploy rail — publish the build's app to NeuGrid hosting (/d/<slug>) */
  const DEPLOY_COST = 50; // Echo deploy cost in GRID (= Params echo_deploy_cost_grid default)
  const [depBusy, setDepBusy] = useState(false);
  const [depSteps, setDepSteps] = useState(0);
  /* the founder journey — Echo drafts the Fund proposal from the build (review → submit) */
  const [gx, setGx] = useState<{ draft: ProposalDraft; submitting?: boolean } | null>(null);
  /* resume a past build — the Builder can re-open any real build to keep iterating */
  const [pastBuilds, setPastBuilds] = useState<Build[]>([]);

  /* Personal / Analyst / Observer — real grounded Q&A over live platform data */
  type AskSnap = {
    reputation?: number; grid?: number; usdc?: number; allocation?: number; builds?: number; agents?: number; working?: number; raises?: number;
    markets?: { symbol: string; stage: string; price: number; liq: number; vol: number; holders: number; status: string }[];
    grid_price?: number; grids?: number; top_grids?: { name: string; members: number; pulse: number }[]; open_raises?: number; open_jobs?: number; treasury_usdc?: number;
    counts?: Record<string, number>; feed?: { ago: string; kind: string; line: string }[];
  };
  const ASK_COST = 5; // Echo question cost in GRID (= Params echo_ask_cost_grid default)
  const [askQ, setAskQ] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askA, setAskA] = useState<string | null>(null);
  const [askSnap, setAskSnap] = useState<AskSnap | null>(null);
  // reset the ask surface when the mode changes (adjust-during-render, no effect churn)
  const [askMode, setAskMode] = useState<Mode | null>(null);
  if ((mode === "personal" || mode === "analyst" || mode === "observer") && askMode !== mode) {
    setAskMode(mode); setAskQ(""); setAskA(null); setAskSnap(null);
  }

  /* real marketplace — top agents + talent to recommend as executors in Builder mode */
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/agents").then((r) => r.json()).catch(() => ({ agents: [] })),
      fetch("/api/talent").then((r) => r.json()).catch(() => ({ talent: [] })),
      fetch("/api/me").then((r) => r.json()).catch(() => null),
    ]).then(([a, t, me]) => {
      if (!live) return;
      const agents: AgentRow[] = (a.agents ?? []).slice().sort((x: AgentRow, y: AgentRow) => y.rating - x.rating).slice(0, 4);
      const talent: TalentRow[] = (t.talent ?? []).slice().sort((x: TalentRow, y: TalentRow) => y.reputation - x.reputation).slice(0, 4);
      setExecs({ agents, talent });
      if (me?.balances) applyBalances(me.balances);
    });
    // real past builds — the Builder can resume any build that has real files
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => { if (live) setPastBuilds(((d.builds ?? []) as Build[]).filter((b) => b.artifact?.files?.length)); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // the live snapshot for the current ask mode (grounds the rails + the answers).
  // The HUB fetches the personal snapshot too — its identity/context numbers are real.
  useEffect(() => {
    if (mode !== "personal" && mode !== "analyst" && mode !== "observer" && mode !== "select") return;
    let live = true;
    fetch(`/api/echo/ask?mode=${mode === "select" ? "personal" : mode}`).then((r) => r.json()).then((d) => { if (live) setAskSnap(d.snapshot ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [mode]);

  /* The HUB composer is REAL: it routes what you type to the right mode and acts.
     "/deploy" → Launchpad · "/fund" → raise flow · "build …" → Builder (prompt prefilled)
     · "/analyze …" → Analyst (asked) · anything else → your Personal cofounder (asked). */
  const [hubQ, setHubQ] = useState("");
  function hubGo(raw?: string) {
    const text = (raw ?? hubQ).trim();
    if (!text) return;
    const t = text.toLowerCase();
    const cmd = (name: string) => t === name || t.startsWith(name + " ");
    const rest = text.includes(" ") ? text.slice(text.indexOf(" ") + 1).trim() : "";
    if (cmd("/deploy")) {
      setExecRun(false); setMode("executor");
      notify(bBuild ? "Launch — deploy this build" : "Launch — resume a build in Builder first");
    } else if (cmd("/fund")) {
      if (bBuild) { setExecRun(false); setMode("executor"); notify("Launch — “Apply to Fund” drafts your raise"); }
      else { setMode("builder"); notify("Pick a build to fund — Continue one, then open Launch"); }
    } else if (cmd("/analyze") || cmd("/analyst")) {
      setMode("analyst"); setAskMode("analyst");
      if (rest) { setAskQ(rest); void runAsk(rest, "analyst"); }
    } else if (/^(\/build\b|build\b|make\b|create\b|ship\b)/.test(t)) {
      setMode("builder"); setBPrompt(text.replace(/^\/build\s*/i, ""));
      notify("Builder ready — review the compute cost and hit Build");
    } else {
      setMode("personal"); setAskMode("personal"); setAskQ(text);
      void runAsk(text, "personal");
    }
    setHubQ("");
  }

  /** Re-open a past real build — output, revise loop and launchpad pick up where it left off. */
  function resumeBuild(b: Build) {
    setBBuild(b);
    setBRevealed(b.steps.length);
    setOutTab("preview");
    setOutFile(0);
    setRevText("");
    setGx(null);
    setDepSteps(0);
    setLp({ productId: b.product_id, proposalId: b.proposal_id });
    notify(`Resumed "${b.title}" · v${b.version ?? 1}`);
  }

  /** One-click deploy: snapshot the app + publish it live at /d/<slug>. */
  async function deployNow() {
    if (!bBuild || depBusy) return;
    setDepBusy(true); setDepSteps(0);
    const timer = window.setInterval(() => setDepSteps((s) => Math.min(2, s + 1)), 500);
    let data: { url?: string; deployment?: Build["deployment"]; error?: string; cost?: number; balances?: { grid: number } } | null = null;
    try {
      const res = await fetch(`/api/echo/builds/${bBuild.build_id}/deploy`, { method: "POST" });
      data = await res.json();
    } catch { /* network */ }
    window.clearInterval(timer);
    if (data?.balances) applyBalances(data.balances);
    if (data?.url && data.deployment) {
      setDepSteps(4);
      setBBuild({ ...bBuild, deployment: { ...data.deployment, html: "" } });
      notify(`LIVE at ${data.url} — share it`);
      // the ICP asset-canister mirror fills in AFTER the deploy returns — pick it up shortly
      const id = bBuild.build_id;
      window.setTimeout(async () => {
        try {
          const r = await fetch(`/api/echo/builds/${id}`);
          const d = await r.json();
          const icp: NonNullable<Build["deployment"]>["icp"] = d?.build?.deployment?.icp;
          if (icp) setBBuild((cur) => cur?.build_id === id && cur.deployment ? { ...cur, deployment: { ...cur.deployment, icp } } : cur);
        } catch { /* mirror is best-effort */ }
      }, 4000);
    } else {
      setDepSteps(0);
      if (data?.error === "insufficient_grid") notify(`Not enough GRID — deploying costs ${data.cost ?? DEPLOY_COST} GRID`);
      else if (data?.error === "already_live") notify("This version is already live");
      else notify("Deploy failed — try again");
    }
    setDepBusy(false);
  }
  async function runAsk(q?: string, m?: "personal" | "analyst" | "observer") {
    const question = (q ?? askQ).trim();
    const target = m ?? mode;
    if (!question || askBusy) return;
    if (q) setAskQ(q);
    setAskBusy(true); setAskA(null);
    try {
      const res = await fetch("/api/echo/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: target, question }) });
      const d = await res.json();
      if (d.balances) applyBalances(d.balances);
      if (d.answer) setAskA(String(d.answer).replace(/\*\*/g, ""));
      else if (d.error === "insufficient_grid") notify(`Not enough GRID — a question costs ${d.cost ?? ASK_COST} GRID`);
      else if (d.error === "brain_inactive") notify("This mode needs the model brain (API key) active");
      else notify("Echo couldn't answer — your GRID was refunded. Try again.");
    } catch { notify("Ask failed"); }
    setAskBusy(false);
  }
  const [lp, setLp] = useState<{ gridSlug?: string; productId?: string; proposalId?: string; busy?: "grid" | "product" | "genesis" }>({});
  const BUILD_COST = 500; // Echo compute cost in GRID (= Echo.BUILD_COST_GRID)
  async function runBuild() {
    const p = bPrompt.trim();
    if (!p || bBuilding) return;
    setBBuilding(true); setBBuild(null); setBRevealed(0); setLp({}); setOutTab("preview"); setOutFile(0);
    let data: { build?: Build; minted?: unknown[]; error?: string; cost?: number; balances?: { grid: number } } | null = null;
    try {
      const res = await fetch("/api/echo/builds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p }) });
      data = await res.json();
    } catch { /* network */ }
    if (data?.balances) applyBalances(data.balances);
    if (data?.error === "insufficient_grid") { setBBuilding(false); notify(`Not enough GRID — Echo compute costs ${data.cost ?? BUILD_COST} GRID`); return; }
    if (data?.error === "synthesis_failed") { setBBuilding(false); notify("Echo couldn't complete this build — your GRID was refunded. Try again."); return; }
    if (!data?.build) { setBBuilding(false); notify("Build failed — is the server up?"); return; }
    const b = data.build;
    setBBuild(b);
    const n = b.steps.length;
    if (n === 0) { setBBuilding(false); notify("Proof of build sealed"); return; }
    let i = 0;
    const tick = () => {
      i += 1; setBRevealed(i);
      if (i < n) window.setTimeout(tick, 360);
      else { setBBuilding(false); notify((data?.minted?.length ?? 0) > 0 ? "Proof of build sealed · soulbound credential minted · +40 builder rep" : "Proof of build sealed · +40 builder reputation"); }
    };
    window.setTimeout(tick, 260);
  }

  /* The iterate loop — a follow-up instruction revises the current build. */
  async function reviseBuild() {
    const instruction = revText.trim();
    if (!bBuild || !instruction || revBusy) return;
    setRevBusy(true);
    let data: { build?: Build; error?: string; cost?: number; balances?: { grid: number } } | null = null;
    try {
      const res = await fetch(`/api/echo/builds/${bBuild.build_id}/revise`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instruction }) });
      data = await res.json();
    } catch { /* network */ }
    setRevBusy(false);
    if (data?.balances) applyBalances(data.balances);
    if (data?.error === "insufficient_grid") { notify(`Not enough GRID — a revision costs ${data.cost ?? REVISION_COST} GRID`); return; }
    if (data?.error === "synthesis_failed") { notify("Echo couldn't complete this revision — your GRID was refunded."); return; }
    if (!data?.build) { notify("Revision failed"); return; }
    setBBuild(data.build);
    setRevText("");
    setOutFile(0);
    notify(`v${data.build.version ?? 2} sealed · proof re-signed · ${data.build.revisions?.[data.build.revisions.length - 1]?.files_changed ?? 0} file(s) changed`);
  }

  /* Launchpad — wire the build into real Grids / GridX / Fund. */
  async function createProjectGrid() {
    if (!bBuild || lp.busy) return;
    setLp((s) => ({ ...s, busy: "grid" }));
    try {
      const res = await fetch(`/api/echo/builds/${bBuild.build_id}/grid`, { method: "POST" });
      const d = await res.json();
      if (d.grid) { setLp((s) => ({ ...s, busy: undefined, gridSlug: d.grid.slug })); notify(d.created ? `Project Grid created · ${d.grid.slug}` : `Grid ready · ${d.grid.slug}`); }
      else { setLp((s) => ({ ...s, busy: undefined })); notify("Grid: " + (d.error || "failed")); }
    } catch { setLp((s) => ({ ...s, busy: undefined })); notify("Grid failed"); }
  }
  async function listOnGridX() {
    if (!bBuild || lp.busy) return;
    setLp((s) => ({ ...s, busy: "product" }));
    try {
      const res = await fetch("/api/gridx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ build_id: bBuild.build_id }) });
      const d = await res.json();
      if (d.product) { setLp((s) => ({ ...s, busy: undefined, productId: d.product.product_id, gridSlug: s.gridSlug || d.grid?.slug })); notify("Listed on GridX · +20 creator reputation"); }
      else { setLp((s) => ({ ...s, busy: undefined })); notify("GridX: " + (d.error || "failed")); }
    } catch { setLp((s) => ({ ...s, busy: undefined })); notify("GridX failed"); }
  }
  /** The founder journey — step 1: Echo DRAFTS the proposal from the real build. */
  async function draftGenesis() {
    if (!bBuild || lp.busy || gx) return;
    setLp((s) => ({ ...s, busy: "genesis" }));
    try {
      const res = await fetch(`/api/echo/builds/${bBuild.build_id}/proposal-draft`, { method: "POST" });
      const d = await res.json();
      setLp((s) => ({ ...s, busy: undefined }));
      if (d.draft) { setGx({ draft: d.draft }); notify("Echo drafted your raise — review and submit"); }
      else if (d.error === "brain_inactive" || d.error === "no_files") notify("Drafting needs a real build (model brain active)");
      else notify("Draft failed — try again");
    } catch { setLp((s) => ({ ...s, busy: undefined })); notify("Draft failed"); }
  }

  /** Step 2: the founder reviewed (maybe edited) — submit the real proposal. */
  async function submitGenesis() {
    if (!bBuild || !gx || gx.submitting) return;
    const d = gx.draft;
    // keep tranche amounts summing to the (possibly edited) ask
    const sum = d.milestones.reduce((a, m) => a + m.amount_usdc, 0) || 1;
    let running = 0;
    const roadmap = d.milestones.map((m, i) => {
      const amount = i === d.milestones.length - 1 ? Math.max(1, d.ask_usdc - running) : Math.max(1, Math.round((m.amount_usdc / sum) * d.ask_usdc));
      running += amount;
      return { title: m.title, description: m.description, amount, est_duration_days: m.days };
    });
    setGx((s) => (s ? { ...s, submitting: true } : s));
    try {
      const res = await fetch("/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: d.title, summary: d.pitch, category: d.category, ask_amount: d.ask_usdc, roadmap, build_id: bBuild.build_id }) });
      const j = await res.json();
      if (j.proposal) { setLp((s) => ({ ...s, proposalId: j.proposal.proposal_id })); setGx(null); notify("Fund raise opened — pitch, ask and milestones drafted by Echo, backed by your proof of build"); }
      else { setGx((s) => (s ? { ...s, submitting: false } : s)); notify("Fund: " + (j.error === "insufficient_reputation" ? "need 100+ reputation" : j.error || "failed")); }
    } catch { setGx((s) => (s ? { ...s, submitting: false } : s)); notify("Fund failed"); }
  }

  async function applyGenesis() {
    if (!bBuild || lp.busy) return;
    setLp((s) => ({ ...s, busy: "genesis" }));
    try {
      const res = await fetch("/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: bBuild.title, summary: bBuild.summary, category: bBuild.stack[0] || "Project", ask_amount: 50000, build_id: bBuild.build_id }) });
      const d = await res.json();
      if (d.proposal) { setLp((s) => ({ ...s, busy: undefined, proposalId: d.proposal.proposal_id })); notify("Fund proposal opened — backed by your proof of build"); }
      else { setLp((s) => ({ ...s, busy: undefined })); notify("Fund: " + (d.error === "insufficient_reputation" ? "need 100+ reputation" : d.error || "failed")); }
    } catch { setLp((s) => ({ ...s, busy: undefined })); notify("Fund failed"); }
  }

  const cap = capability[sel];

  // --- side-rail chart data (derived, SSR-safe) ---
  const buildSizes = pastBuilds.map((b) => b.artifact?.files?.length ?? 0).filter((n) => n > 0);
  const deployedCount = pastBuilds.filter((b) => b.deployment).length;
  const deployedShare = pastBuilds.length ? Math.round((deployedCount / pastBuilds.length) * 100) : 0;
  const revisionCounts = pastBuilds.map((b) => (b.revisions?.length ?? 0) + 1);
  const snapAxes = ["builds", "agents", "raises", "markets", "jobs"];
  const snapRaw = [askSnap?.builds ?? 0, askSnap?.agents ?? 0, askSnap?.open_raises ?? askSnap?.raises ?? 0, askSnap?.markets?.length ?? 0, askSnap?.open_jobs ?? 0];
  const snapTotal = snapRaw.reduce((s, v) => s + v, 0);
  const hasSnap = snapRaw.some((v) => v > 0);
  // inline-bar scales — all derived from REAL rows already in scope (SSR-safe)
  const maxFiles = Math.max(...pastBuilds.map((b) => b.artifact?.files?.length ?? 0), 1);
  const covMax = Math.max(askSnap?.markets?.length ?? 0, askSnap?.grids ?? 0, askSnap?.open_raises ?? 0, askSnap?.open_jobs ?? 0, askSnap?.agents ?? 0, 1);
  const watchMax = Math.max(...(["reputation", "trades", "jobs", "builds", "payments"] as const).map((k) => askSnap?.counts?.[k] ?? 0), 1);
  const snapMaxLiq = Math.max(...(askSnap?.markets?.map((mm) => mm.liq) ?? [0]), 1);
  const maxPulse = Math.max(...(askSnap?.top_grids?.map((g) => g.pulse) ?? [0]), 1);
  const gridNow = askSnap?.grid ?? 0, gridVest = askSnap?.allocation ?? 0;
  const gridLiquidPct = gridNow + gridVest > 0 ? Math.round((gridNow / (gridNow + gridVest)) * 100) : 0;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader onSearch={() => notify("Search the grid")} onBell={() => notify("3 new notifications")} collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* ============ LEFT ============ */}
        <OrbPanel side="left" label="Scope" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          {/* live rail charts — Echo's build output */}
          {buildSizes.length > 0
            ? <PanelChart title="Output size · distribution" read={`${pastBuilds.length} builds`}><div className="py-1"><Histogram data={buildSizes} h={54} /></div></PanelChart>
            : <PanelChart title="Output size · distribution" read="0 builds"><p className="py-2 text-[11px] text-ink-dim">No builds yet — ship one in Builder mode.</p></PanelChart>}
          {pastBuilds.length > 0 && (
            <PanelChart title="Deployed · share" read={`${deployedCount}/${pastBuilds.length} live · ${deployedShare}%`}>
              <div className="py-2"><SegBar percent={deployedShare} color="var(--ng-cyan)" /></div>
            </PanelChart>
          )}
          {/* profile */}
          {mode === "executor" && !execRun ? (
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded" style={{ background: "linear-gradient(135deg, rgba(0,255,0,0.3), #021202)" }}><IconCube className="h-5 w-5 text-neon" /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate text-base font-bold text-ink">{bBuild ? bBuild.title : "No build loaded"} <IconCode className="h-3.5 w-3.5 shrink-0 text-ink-dim" /></div>
                  <Tag className="mt-0.5">{bBuild ? bBuild.artifact.kind : "—"}</Tag>
                  <div className="text-[10px] text-ink-dim">{bBuild ? bBuild.stack.join(" • ") : "Build something in Builder mode"}</div>
                </div>
              </div>
              {bBuild ? (
                <>
                  <div className="mt-2 break-all text-[11px] text-ink-dim">Proof: <Mark plain>{bBuild.artifact.proof_of_build}</Mark></div>
                </>
              ) : (
                <button onClick={() => setMode("builder")} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-3"><IconCode className="h-3.5 w-3.5" /> Go to Builder</button>
              )}
            </Card>
          ) : mode === "executor" && execRun ? (
            <Card>
              <div className="flex items-center gap-3"><Av size={44} seed="Ash.grid" /><div><div className="text-base font-bold text-ink">Ash.grid</div><Tag accent="neon" className="mt-1"><IconBolt className="h-3 w-3" />Executor Mode</Tag></div></div>
              <div className="mt-3 divide-y divide-line">
                <DataRow k="GRID balance" v={<Mark plain>{gridBal != null ? Math.round(gridBal).toLocaleString() : "—"}</Mark>} />
                <DataRow k="Deploy fee" v={<Mark plain>{DEPLOY_COST} GRID → treasury</Mark>} />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-3"><Av size={44} seed="Ash.grid" /><div>
                <div className="text-base font-bold text-ink">Ash.grid</div>
                {mode === "select" ? <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-dim"><IconShield className="h-3 w-3 text-neon" />Rep: <Mark plain>{(askSnap?.reputation ?? 0).toLocaleString()}</Mark></div> : mode === "builder" ? <Tag className="mt-1"><IconCode className="h-3 w-3" />Builder Mode</Tag> : mode === "analyst" ? <Tag className="mt-1"><IconChart className="h-3 w-3" />Analyst Mode</Tag> : mode === "observer" ? <Tag accent="cyan" className="mt-1"><IconEye className="h-3 w-3" />Observer Mode</Tag> : <Tag className="mt-1"><IconStar className="h-3 w-3" />Ascended</Tag>}
              </div></div>
              {mode === "select" && <><div className="mt-3 flex flex-wrap gap-2">{["Founder", "Builder"].map((t) => <Tag key={t}>{t}</Tag>)}</div><div className="ng-row mt-3 !text-[11px]"><span className="ng-row__k">Wallet Status</span><span className="ng-row__v flex items-center gap-1 text-neon"><IconCheck className="h-3 w-3" />Connected</span></div></>}
              {mode === "personal" && <div className="mt-3 divide-y divide-line"><DataRow k="Reputation" v={<span className="flex items-center gap-1"><Mark plain>{(askSnap?.reputation ?? 0).toLocaleString()}</Mark><span className="ng-led" /></span>} /><DataRow k="GRID" v={<Mark plain>{(askSnap?.grid ?? 0).toLocaleString()}</Mark>} /></div>}
              {mode === "builder" && <div className="mt-3 divide-y divide-line"><DataRow k="GRID balance" v={<Mark plain>{gridBal != null ? Math.round(gridBal).toLocaleString() : "—"}</Mark>} />{starterBal > 0 && <DataRow k="Starter credit" v={<Mark plain accent="cyan">{Math.round(starterBal).toLocaleString()}</Mark>} />}<DataRow k="Build cost" v={<Mark plain>{BUILD_COST} GRID</Mark>} /><DataRow k="Revision cost" v={<Mark plain>{REVISION_COST} GRID</Mark>} /></div>}
              {mode === "analyst" && <div className="mt-3 divide-y divide-line"><DataRow k="Markets" v={<Mark plain>{askSnap?.markets?.length ?? "—"}</Mark>} /><DataRow k="Data" v={<Mark>Live only</Mark>} /></div>}
              {mode === "observer" && <div className="mt-3 divide-y divide-line"><DataRow k="Role" v={<Mark plain>Network Observer</Mark>} /><DataRow k="Type" v={<Mark accent="cyan">Auditor</Mark>} /><DataRow k="Access" v={<Mark>Read-only</Mark>} /></div>}
            </Card>
          )}

          {/* HUB left — REAL: your builds (click to resume) + your live numbers */}
          {mode === "select" && <>
            <Card>
              <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />} action={pastBuilds.length > 0 ? <Mark plain className="!text-[10px]">{pastBuilds.length}</Mark> : undefined}>RECENT BUILDS</SecLabel>
              {pastBuilds.length ? (
                <div className="divide-y divide-line">{pastBuilds.slice(0, 5).map((b) => (
                  <button key={b.build_id} onClick={() => { resumeBuild(b); setMode("builder"); }} className="flex w-full items-center gap-2.5 py-2 text-left transition hover:text-neon">
                    <span className="ng-led" />
                    <div className="min-w-0 flex-1"><div className="truncate text-[12px] text-ink">{b.title}</div><div className="text-[10px] text-ink-faint">Builder · v{b.version ?? 1} · {b.artifact.files?.length ?? 0} files{b.revisions?.length ? ` · ${b.revisions.length} rev` : ""}</div></div>
                    <span className="shrink-0" title={`${b.artifact.files?.length ?? 0} files vs your largest build`}><Meter value={b.artifact.files?.length ?? 0} max={maxFiles} w={28} /></span>
                    {b.proposal_id && <Mark className="!text-[9px]">raising</Mark>}
                  </button>
                ))}</div>
              ) : <p className="py-1 text-[11px] text-ink-dim">No builds yet — describe one in the composer and Echo writes it for real.</p>}
            </Card>
            <Card>
              <SecLabel icon={<IconTarget className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">live</Mark>}>CONTEXT AWARENESS</SecLabel>
              <div className="grid grid-cols-2 gap-2">
                {([["Builds", askSnap?.builds, IconCode], ["Agents working", askSnap?.working, IconBot], ["Open raises", askSnap?.raises, IconCoins], ["Your agents", askSnap?.agents, IconUser]] as [string, number | undefined, (p: { className?: string }) => React.JSX.Element][]).map(([k, v, Ico]) => (
                  <div key={k} className="ng-card p-3 text-center"><Ico className="mx-auto h-4 w-4 text-neon" /><div className="ng-stat__v mt-1"><CountUp key={v ?? 0} value={v ?? 0} /></div><div className="ng-stat__k">{k}</div></div>
                ))}
              </div>
            </Card>
          </>}

          {/* MODE left (analyst/builder/etc) */}
          {mode !== "select" && <ModeSwitcher mode={mode} setMode={setMode} />}

          {mode === "personal" && (
            <Card>
              <SecLabel icon={<IconGrid className="h-3.5 w-3.5" />}>WHAT ECHO KNOWS</SecLabel>
              <div className="divide-y divide-line">
                {([["Your reputation", "live"], ["Your wallet + GRID allocation", "live"], ["Your builds + revisions", "live"], ["Your agents + their work", "live"], ["Your raises on Fund", "live"], ["Your recent reputation events", "live"]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="ng-row !text-[12px]"><span className="ng-row__k flex items-center gap-2 text-ink"><span className="ng-led" />{k}</span><span className="ng-row__v"><Mark plain className="!text-[9px]">{v}</Mark></span></div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-ink-faint">Every answer is grounded in this snapshot — refreshed on every question.</p>
            </Card>
          )}

          {mode === "builder" && <>
            <Card>
              <SecLabel icon={<IconCube className="h-3.5 w-3.5" />}>TARGET EXECUTION LAYER</SecLabel>
              <div className="divide-y divide-line">{execLayers.map(([n, on]) => <div key={n} className="ng-row !text-[12px]"><span className="ng-row__k flex items-center gap-2 text-ink"><span className={on ? "ng-led" : "ng-led ng-led--idle"} />{n}</span><span className="ng-row__v">{on && <IconCheck className="h-3.5 w-3.5 text-neon" />}</span></div>)}</div>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-amber"><IconAlert className="h-3 w-3" /> SDK, patterns &amp; gas assumptions switched to Solana</p>
            </Card>
            <Card>
              <SecLabel icon={<IconLayers className="h-3.5 w-3.5" />}>BUILD TEMPLATE</SecLabel>
              <div className="space-y-2">{buildTemplates.map(([n, d, on]) => <div key={n} className="ng-card flex items-center justify-between p-2.5"><div><div className="text-[12px] text-ink">{n}</div><div className="text-[10px] text-ink-dim">{d}</div></div>{on && <IconCheck className="h-3.5 w-3.5 text-neon" />}</div>)}</div>
            </Card>
          </>}

          {mode === "analyst" && (
            <Card>
              <SecLabel icon={<IconChart className="h-3.5 w-3.5" />}>COVERAGE</SecLabel>
              {/* per-row bars scale each surface vs the largest one */}
              <div className="divide-y divide-line">
                <DataRow k="Markets" v={<span className="flex items-center gap-1.5"><Meter value={askSnap?.markets?.length ?? 0} max={covMax} w={32} color="#48f5ff" /><Mark plain>{askSnap?.markets?.length ?? "—"}</Mark></span>} accent="cyan" />
                <DataRow k="Communities" v={<span className="flex items-center gap-1.5"><Meter value={askSnap?.grids ?? 0} max={covMax} w={32} /><Mark plain>{askSnap?.grids ?? "—"}</Mark></span>} />
                <DataRow k="Open raises" v={<span className="flex items-center gap-1.5"><Meter value={askSnap?.open_raises ?? 0} max={covMax} w={32} /><Mark plain>{askSnap?.open_raises ?? "—"}</Mark></span>} />
                <DataRow k="Open jobs" v={<span className="flex items-center gap-1.5"><Meter value={askSnap?.open_jobs ?? 0} max={covMax} w={32} /><Mark plain>{askSnap?.open_jobs ?? "—"}</Mark></span>} />
                <DataRow k="Agents" v={<span className="flex items-center gap-1.5"><Meter value={askSnap?.agents ?? 0} max={covMax} w={32} /><Mark plain>{askSnap?.agents ?? "—"}</Mark></span>} />
              </div>
              <p className="mt-2 text-[10px] text-ink-faint">The analysis surface — live platform data only, no external feeds. Bars scale vs the largest surface.</p>
            </Card>
          )}

          {mode === "executor" && !execRun && bBuild && (
            <Card>
              <SecLabel icon={<IconRocket className="h-3.5 w-3.5" />}>LAUNCH STATUS</SecLabel>
              <div className="divide-y divide-line">{([["Project Grid", lp.gridSlug], ["GridX product", lp.productId], ["Fund raise", lp.proposalId]] as [string, string | undefined][]).map(([k, v]) => <div key={k} className="ng-row !text-[12px]"><span className="ng-row__k text-ink">{k}</span><span className="ng-row__v">{v ? <Mark className="!text-[10px]"><IconCheck className="h-3 w-3" />Done</Mark> : <span className="text-[10px] text-ink-faint">Pending</span>}</span></div>)}</div>
              {(() => { const done = [lp.gridSlug, lp.productId, lp.proposalId].filter(Boolean).length; return (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-faint"><Meter value={done} max={3} w={60} /><span className="tnum">{done}/3 launched</span></div>
              ); })()}
              <p className="mt-2 text-[10px] text-ink-faint">Launch destinations for this build — act on them in the center.</p>
            </Card>
          )}

          {mode === "executor" && execRun && (
            <Card>
              <SecLabel icon={<IconExternal className="h-3.5 w-3.5" />}>DEPLOYMENT STATUS</SecLabel>
              {bBuild?.deployment ? (
                <div className="divide-y divide-line">
                  <DataRow k="Live at" v={<a href={`/d/${bBuild.deployment.slug}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-neon underline decoration-neon/40 underline-offset-2">/d/{bBuild.deployment.slug}</a>} accent="neon" />
                  {bBuild.deployment.icp && <DataRow k="ICP mirror" v={<a href={bBuild.deployment.icp.url} target="_blank" rel="noopener noreferrer" className="block max-w-[220px] truncate text-[12px] text-ink underline decoration-line underline-offset-2" title="Served from an Internet Computer asset canister — the unstoppable URL">{bBuild.deployment.icp.url.replace(/^https?:\/\//, "")}</a>} />}
                  <DataRow k="Serving" v={<Mark plain>v{bBuild.deployment.version}</Mark>} />
                  <DataRow k="Deploys" v={<span className="text-[12px]">{bBuild.deployment.redeploys + 1}</span>} />
                </div>
              ) : <p className="text-[11px] text-ink-dim">{bBuild ? "Not deployed yet — run the pipeline in the center." : "Load a build in Builder mode first."}</p>}
              <p className="mt-2 text-[10px] text-ink-faint">NeuGrid hosting serves a version-pinned snapshot; revising a build changes nothing live until you redeploy.</p>
            </Card>
          )}

          {mode === "observer" && (
            <Card>
              <SecLabel icon={<IconEye className="h-3.5 w-3.5" />}>WATCH SCOPE</SecLabel>
              <div className="divide-y divide-line">
                {(["reputation", "trades", "jobs", "builds", "payments"] as const).map((k) => (
                  <div key={k} className="ng-row !text-[12px]"><span className="ng-row__k flex items-center gap-2 capitalize text-ink"><IconCheck className="h-3.5 w-3.5 text-cyan" />{k}</span><span className="ng-row__v flex items-center gap-1.5"><span title="events vs the busiest stream"><Meter value={askSnap?.counts?.[k] ?? 0} max={watchMax} w={32} color="#48f5ff" /></span><Mark plain className="!text-[10px]">{askSnap?.counts?.[k] ?? "—"}</Mark></span></div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-ink-faint">All-time event counts per stream — everything Echo is witnessing.</p>
            </Card>
          )}
        </OrbPanel>

        {/* ============ CENTER ============ */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {/* HUB — compact prompt-first */}
          {mode === "select" && <>
            <div className="ng-panel flex items-center gap-4 p-4">
              <Orb size={88} />
              <div className="min-w-0">
                <div className="ng-title text-2xl font-bold text-neon text-glow"><Decrypt text="Echo" /></div>
                <div className="text-[12px] text-ink-dim">Your living interface to the grid — ask, build, analyze, or execute.</div>
              </div>
            </div>
            {/* the REAL composer — routes what you type to the right mode and acts on it */}
            <div className="ng-panel p-3">
              <div className="flex items-center gap-2">
                <IconSparkle className="h-4 w-4 shrink-0 text-neon/80" />
                <input value={hubQ} onChange={(e) => setHubQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") hubGo(); }} placeholder="Ask, build, analyze, or execute — Echo routes it…" className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint" />
                <button onClick={() => hubGo()} disabled={!hubQ.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40"><IconArrowRight className="h-3.5 w-3.5" /> Go</button>
              </div>
              <p className="mt-1.5 pl-6 text-[10px] text-ink-faint">Questions → your cofounder · &ldquo;build …&rdquo; → the Builder · /analyze → Analyst · /deploy · /fund</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">Try</span>{["build a tip jar for creators", "/analyze which market is strongest", "what should I do next?", "/deploy"].map((c) => <button key={c} onClick={() => hubGo(c)} className="ng-btn ng-btn-ghost ng-btn--sm">{c}</button>)}</div>

            {/* MY BUILDS — the full build history, front and center (founder: "where
                can I see what I built before?"). Every row resumes into the Builder. */}
            {pastBuilds.length > 0 && (
              <div className="ng-panel p-4">
                <SecLabel icon={<IconCode className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">{pastBuilds.length} build{pastBuilds.length === 1 ? "" : "s"} · witnessed</Mark>}>MY BUILDS</SecLabel>
                <div className="max-h-[300px] divide-y divide-line overflow-y-auto">
                  {pastBuilds.map((b) => (
                    <div key={b.build_id} className="flex items-center gap-3 py-2">
                      <span className="ng-led shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-ink">{b.title}</div>
                        <div className="truncate text-[10px] text-ink-faint">v{b.version ?? 1} · {b.artifact.files?.length ?? 0} files{b.revisions?.length ? ` · ${b.revisions.length} rev` : ""} · {new Date(b.created_at).toLocaleDateString()}</div>
                      </div>
                      <span className="shrink-0" title={`${b.artifact.files?.length ?? 0} files vs your largest build`}><Meter value={b.artifact.files?.length ?? 0} max={maxFiles} w={36} /></span>
                      {b.deployment && <Mark plain accent="cyan" className="!text-[9px] shrink-0">live</Mark>}
                      {b.proposal_id && <Mark className="!text-[9px] shrink-0">raising</Mark>}
                      <button onClick={() => { resumeBuild(b); setMode("builder"); }} className="ng-btn ng-btn--sm shrink-0">Open</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="ng-label mb-2 !text-ink-dim">Choose a mode</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{MODES.map((m) => (
                <button key={m.key} onClick={() => setMode(m.key)} onMouseEnter={() => setSel(m.key)} className={`flex items-center gap-2 border-b-2 px-1 py-1 transition ${sel === m.key ? "border-neon" : "border-transparent hover:border-neon/40"}`}>
                  <m.Icon className={`h-3.5 w-3.5 shrink-0 ${sel === m.key ? "text-neon" : "text-ink-dim"}`} />
                  <span className={`text-[13px] ${sel === m.key ? "text-neon" : "text-ink"}`}>{m.name}</span>
                  <span className="text-[10px] text-ink-faint"><Typewriter text={m.tag} cursor={false} /></span>
                </button>
              ))}</div>
            </div>
          </>}

          {/* PERSONAL */}
          {mode === "personal" && <>
            <div className="flex items-center gap-2 text-[12px] text-neon"><IconSparkle className="h-4 w-4" /><Decrypt text="Personal Mode — Your Grounded Cofounder" /></div>
            <Card>
              <SecLabel icon={<IconSparkle className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">grounded in your live state</Mark>}>ASK ECHO</SecLabel>
              <div className="flex items-center gap-2">
                <input value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runAsk(); }} disabled={askBusy} placeholder="Ask about your position, your next move, anything on the grid…" className="ng-input min-w-0 flex-1 !py-1.5 text-[13px]" />
                <button onClick={() => runAsk()} disabled={askBusy || !askQ.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{askBusy ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Thinking…</> : <><IconSparkle className="h-3.5 w-3.5" /> Ask · {ASK_COST} GRID</>}</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{["What should I do next?", "How do I grow my reputation fastest?", "Summarize my position"].map((q) => <button key={q} onClick={() => runAsk(q)} disabled={askBusy} className="ng-btn ng-btn-ghost ng-btn--sm">{q}</button>)}</div>
              <p className="mt-2 text-[10px] text-ink-faint">Echo answers from your REAL reputation, wallet, builds, agents and raises — never invented numbers.</p>
            </Card>
            {askBusy && <Card><p className="flex items-center gap-2 text-[12px] text-ink-dim"><IconRefresh className="h-3.5 w-3.5 animate-spin text-neon" /> Echo is reading your live state…</p></Card>}
            {askA && !askBusy && (
              <Card className="!border-neon/40">
                <SecLabel icon={<IconSparkle className="h-3.5 w-3.5" />} action={<Mark className="!text-[10px]"><IconCheck className="h-3 w-3" />live data</Mark>}>SYNTHESIZED INTELLIGENCE</SecLabel>
                <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{askA}</div>
              </Card>
            )}
            <Card>
              <SecLabel icon={<IconUser className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">what Echo sees</Mark>}>YOUR LIVE STATE</SecLabel>
              {askSnap ? (
                <div className="divide-y divide-line">
                  <DataRow k="Reputation" v={<Mark plain>{(askSnap.reputation ?? 0).toLocaleString()}</Mark>} accent="neon" />
                  <DataRow k="Wallet" v={<span className="text-[12px]">{(askSnap.usdc ?? 0).toLocaleString()} USDC · {(askSnap.grid ?? 0).toLocaleString()} GRID</span>} />
                  <DataRow k="GRID allocation (vests at TGE)" v={<Mark plain>{(askSnap.allocation ?? 0).toLocaleString()}</Mark>} />
                  <DataRow k="Builds · Agents" v={<span className="text-[12px]">{askSnap.builds ?? 0} · {askSnap.agents ?? 0}</span>} />
                  <DataRow k="Active work · Raises" v={<span className="text-[12px]">{askSnap.working ?? 0} · {askSnap.raises ?? 0}</span>} />
                </div>
              ) : <p className="text-[11px] text-ink-dim">Loading your live state…</p>}
              {askSnap && gridNow + gridVest > 0 && (
                <div className="mt-2 border-t border-line pt-2">
                  <TMeter label="liquid" pct={gridLiquidPct} value={`${gridLiquidPct}%`} />
                  <p className="mt-1 text-[9.5px] text-ink-faint">Liquid GRID in your wallet vs your total (wallet + TGE allocation).</p>
                </div>
              )}
            </Card>
          </>}

          {/* BUILDER */}
          {mode === "builder" && <>
            <div className="flex items-center gap-2 text-[12px] text-neon"><IconCode className="h-4 w-4" /><Decrypt text="Builder Mode — Progressive Autonomy" /></div>

            {/* real prompt → Echo build */}
            <Card>
              <SecLabel icon={<IconSparkle className="h-3.5 w-3.5" />}>DESCRIBE YOUR BUILD</SecLabel>
              <textarea value={bPrompt} onChange={(e) => setBPrompt(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runBuild(); }} rows={2} placeholder="Build a Solana yield vault with auto-compounding and a DAO governance layer…" className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none" />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] text-ink-faint">Compute · <span className="text-neon/80">{BUILD_COST} GRID</span>{gridBal != null ? <span className={gridBal + starterBal < BUILD_COST ? " text-danger" : ""}> · bal {Math.round(gridBal).toLocaleString()}{starterBal > 0 && <span className="text-cyan/80"> +{Math.round(starterBal).toLocaleString()} credit</span>}</span> : null} → real code + proof of build · ⌘↵</span>
                {gridBal != null && gridBal + starterBal < BUILD_COST
                  ? <Link href="/me" className="ng-btn ng-btn-ghost ng-btn--sm shrink-0"><IconCoins className="h-3.5 w-3.5" /> Get GRID</Link>
                  : <button onClick={runBuild} disabled={bBuilding || !bPrompt.trim()} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-40">{bBuilding ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Echo is writing your code…</> : <><IconBolt className="h-3.5 w-3.5" /> Build with Echo</>}</button>}
              </div>
              {gridBal != null && gridBal + starterBal < BUILD_COST && (
                <p className="mt-2 text-[10px] leading-relaxed text-danger">You hold {Math.round(gridBal + starterBal).toLocaleString()} GRID · a build costs {BUILD_COST} — earn GRID by shipping work, or <Link href="/me" className="underline decoration-danger/40 underline-offset-2 hover:text-neon">acquire it on your profile →</Link></p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">{["a Solana yield vault", "an NFT mint with a candy machine", "an AI research agent"].map((ex) => <button key={ex} onClick={() => setBPrompt("Build " + ex)} disabled={bBuilding} className="ng-btn ng-btn-ghost ng-btn--sm">{ex}</button>)}</div>
            </Card>

            {/* idle — MY BUILDS: the full history (the iterate loop survives page reloads) */}
            {!bBuild && !bBuilding && pastBuilds.length > 0 && (
              <Card>
                <SecLabel icon={<IconCode className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">{pastBuilds.length} real build{pastBuilds.length === 1 ? "" : "s"}</Mark>}>MY BUILDS</SecLabel>
                <div className="max-h-[320px] divide-y divide-line overflow-y-auto">
                  {pastBuilds.map((b) => (
                    <div key={b.build_id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">{b.title}</div>
                        <div className="truncate text-[10px] text-ink-dim">v{b.version ?? 1} · {b.artifact.files!.length} files{b.revisions?.length ? ` · ${b.revisions.length} revision${b.revisions.length === 1 ? "" : "s"}` : ""} · {b.stack.slice(0, 3).join(" · ")} · {new Date(b.created_at).toLocaleDateString()}</div>
                      </div>
                      <span className="shrink-0" title={`${b.artifact.files!.length} files vs your largest build`}><Meter value={b.artifact.files!.length} max={maxFiles} w={36} /></span>
                      {b.deployment && <Mark plain accent="cyan" className="!text-[9px] shrink-0">live</Mark>}
                      <button onClick={() => resumeBuild(b)} className="ng-btn ng-btn--sm shrink-0">Continue</button>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-ink-faint">Every witnessed build you&apos;ve made — preview it, keep revising, or take it to Launch.</p>
              </Card>
            )}

            {/* idle — generic blueprint as a scaffolding preview */}
            {!bBuild && !bBuilding && pastBuilds.length === 0 && (
              <Card>
                <SecLabel icon={<IconRocket className="h-3.5 w-3.5" />} action={<Mark>Architecture Phase</Mark>}>SYSTEM BLUEPRINT</SecLabel>
                <div className="divide-y divide-line">{blueprint.map(([k, v]) => <div key={k} className="ng-row !py-2.5 !text-[13px]"><span className="ng-row__k text-ink">{k}</span><span className="ng-row__v"><Tag>{v}</Tag></span></div>)}</div>
                <p className="mt-3 text-[11px] text-ink-faint">Describe a build above — Echo scaffolds it live and seals a proof of build into your track record.</p>
              </Card>
            )}

            {/* building / built — real witnessed stream */}
            {bBuild && <>
              <Card>
                <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />} action={<Mark plain>{bBuild.stack.join(" · ")}</Mark>}>LIVE BUILD STREAM</SecLabel>
                <div className="divide-y divide-line">{bBuild.steps.map((s, i) => {
                  const state = i < bRevealed ? "done" : i === bRevealed && bBuilding ? "active" : "pending";
                  return (
                    <div key={s.label} className="flex items-center justify-between py-2.5">
                      <div><div className={`text-[13px] ${state === "pending" ? "text-ink-faint" : "text-ink"}`}>{s.label}</div>{s.detail && <div className="text-[10px] text-ink-dim">{s.detail}</div>}</div>
                      <div className="text-right">{state === "done" ? <Mark className="!text-[10px]"><IconCheck className="h-3 w-3" />Done</Mark> : state === "active" ? <Mark accent="amber" plain className="!text-[10px]"><IconRefresh className="h-3 w-3 animate-spin" />Building</Mark> : <span className="text-[10px] text-ink-faint">Queued</span>}</div>
                    </div>
                  );
                })}</div>
              </Card>
              <Card>
                <div className="flex items-center gap-5">
                  <Ring percent={Math.round((bRevealed / Math.max(1, bBuild.steps.length)) * 100)} value={`${Math.round((bRevealed / Math.max(1, bBuild.steps.length)) * 100)}%`} label={bBuilding ? "Building" : "Complete"} size={84} color={bBuilding ? "#ffb020" : "#00ff66"} />
                  <div className="flex-1">
                    <div className="mb-2 text-[14px] text-ink">{bBuild.title}</div>
                    <ProgressBar percent={Math.round((bRevealed / Math.max(1, bBuild.steps.length)) * 100)} color={bBuilding ? "#ffb020" : "#00ff66"} />
                    <div className="ng-row mt-2 !text-[11px]"><span className="ng-row__k">Target</span><span className="ng-row__v text-neon">{bBuild.artifact.kind} · {bBuild.artifact.deploy_target}</span></div>
                    <div className="ng-row !text-[11px]"><span className="ng-row__k">Witnessed</span><span className="ng-row__v font-normal text-ink-dim">{bRevealed}/{bBuild.steps.length} steps</span></div>
                  </div>
                </div>
              </Card>

              {!bBuilding && (
                <Card className="!border-neon/40">
                  <SecLabel icon={<IconShield className="h-3.5 w-3.5" />} action={<Mark><IconCheck className="h-3 w-3" />Proof sealed</Mark>}>PROOF OF BUILD</SecLabel>
                  <p className="text-[12px] text-ink">{bBuild.summary}</p>
                  <div className="mt-3 divide-y divide-line">
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Attestation</span><span className="ng-row__v"><Mark plain>{bBuild.artifact.proof_of_build}</Mark></span></div>
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Artifact</span><span className="ng-row__v"><Mark plain>{bBuild.artifact.artifact_id}</Mark></span></div>
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Stack</span><span className="ng-row__v font-normal text-ink-dim">{bBuild.stack.join(", ")}</span></div>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neon"><IconArrowUp className="h-3 w-3" /> Recorded to your track record · +40 builder reputation</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => { setExecRun(false); setMode("executor"); }} className="ng-btn ng-btn-primary ng-btn--sm"><IconRocket className="h-3.5 w-3.5" /> Open Launch</button>
                    {bBuild.artifact.preview_url && <button onClick={() => setOutTab("preview")} className="ng-btn ng-btn-ghost ng-btn--sm"><IconEye className="h-3.5 w-3.5" /> Live Preview</button>}
                  </div>
                </Card>
              )}

              {/* BUILD OUTPUT — the REAL generated artifact: live interactive preview + the actual files */}
              {!bBuilding && (bBuild.artifact.files?.length ?? 0) > 0 && (
                <Card>
                  <SecLabel icon={<IconEye className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">v{bBuild.version ?? 1} · {bBuild.artifact.files!.length} files · real output</Mark>}>BUILD OUTPUT</SecLabel>
                  <div className="ng-tabs mb-3">
                    {bBuild.artifact.preview_url && <button onClick={() => setOutTab("preview")} data-active={outTab === "preview"} className="ng-tab">Live Preview</button>}
                    <button onClick={() => setOutTab("files")} data-active={outTab === "files"} className="ng-tab">Files</button>
                  </div>
                  {outTab === "preview" && bBuild.artifact.preview_url ? (
                    <>
                      <iframe key={bBuild.version ?? 1} src={`${bBuild.artifact.preview_url}?v=${bBuild.version ?? 1}`} sandbox="allow-scripts" title={`${bBuild.title} — live preview`} className="h-[400px] w-full rounded border border-neon/20 bg-black" />
                      <p className="mt-1.5 text-[10px] text-ink-faint">The interactive demo Echo generated for this build — running live, sandboxed. Full source in Files.</p>
                    </>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[180px_minmax(0,1fr)]">
                      <div className="flex flex-row flex-wrap gap-1 lg:flex-col">
                        {bBuild.artifact.files!.map((f, i) => (
                          <button key={f.path} onClick={() => setOutFile(i)} className={`truncate rounded border px-2 py-1.5 text-left text-[10.5px] transition ${i === outFile ? "border-neon/40 bg-neon/[0.07] text-neon" : "border-line text-ink-dim hover:text-ink"}`}>{f.path}</button>
                        ))}
                      </div>
                      <pre className="max-h-[400px] overflow-auto rounded border border-line bg-black/40 p-3 text-[10.5px] leading-relaxed text-ink whitespace-pre-wrap">{bBuild.artifact.files![outFile]?.content}</pre>
                    </div>
                  )}

                  {/* THE ITERATE LOOP — follow-up instructions revise the build (versions, re-sealed proof) */}
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="flex items-center gap-2">
                      <input value={revText} onChange={(e) => setRevText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") reviseBuild(); }} disabled={revBusy} placeholder="Tell Echo what to change — “add a search filter”, “make it purple”…" className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]" />
                      <button onClick={reviseBuild} disabled={revBusy || !revText.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{revBusy ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Revising…</> : <><IconBolt className="h-3.5 w-3.5" /> Revise · {REVISION_COST} GRID</>}</button>
                    </div>
                    {(bBuild.revisions?.length ?? 0) > 0 && (
                      <div className="mt-2.5 divide-y divide-line">
                        {[...bBuild.revisions!].reverse().map((r) => (
                          <div key={r.version} className="flex items-start justify-between gap-3 py-1.5 text-[11px]">
                            <div className="min-w-0">
                              <span className="text-neon">v{r.version}</span> <span className="text-ink">{r.instruction}</span>
                              {r.notes && <div className="truncate text-[10px] text-ink-faint">{r.notes}</div>}
                            </div>
                            <span className="shrink-0 text-[10px] text-ink-dim tnum">{r.files_changed} file(s)</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-1.5 text-[10px] text-ink-faint">Each revision patches the real files and re-seals the proof-of-build — the version history is part of the witnessed record.</p>
                  </div>
                </Card>
              )}
            </>}
          </>}

          {/* ANALYST (Analysis Mode) */}
          {mode === "analyst" && <>
            <div className="flex items-center gap-2 text-[12px] text-cyan"><IconChart className="h-4 w-4" /><Decrypt text="Analysis Mode — Decision-Grade Intelligence" /></div>
            <Card>
              <SecLabel icon={<IconChart className="h-3.5 w-3.5" />} action={<Mark plain accent="cyan" className="!text-[10px]">live platform data</Mark>}>ASK FOR ANALYSIS</SecLabel>
              <div className="flex items-center gap-2">
                <input value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runAsk(); }} disabled={askBusy} placeholder="Ask about markets, funding, the agent economy, the GRID token…" className="ng-input min-w-0 flex-1 !py-1.5 text-[13px]" />
                <button onClick={() => runAsk()} disabled={askBusy || !askQ.trim()} className="ng-btn ng-btn-cyan ng-btn--sm shrink-0 disabled:opacity-40">{askBusy ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Analyzing…</> : <><IconChart className="h-3.5 w-3.5" /> Analyze · {ASK_COST} GRID</>}</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{["Which market looks strongest right now?", "Assess the GRID token economy", "Where is platform activity concentrated?"].map((q) => <button key={q} onClick={() => runAsk(q)} disabled={askBusy} className="ng-btn ng-btn-ghost ng-btn--sm">{q}</button>)}</div>
              <p className="mt-2 text-[10px] text-ink-faint">Verdict → evidence → risks, over the LIVE snapshot: markets, communities, funding, jobs, agents, treasury. No invented data.</p>
            </Card>
            {askBusy && <Card><p className="flex items-center gap-2 text-[12px] text-ink-dim"><IconRefresh className="h-3.5 w-3.5 animate-spin text-cyan" /> Echo is reading the live platform snapshot…</p></Card>}
            {askA && !askBusy && (
              <Card className="!border-cyan/40">
                <SecLabel icon={<IconChart className="h-3.5 w-3.5" />} action={<Mark accent="cyan" className="!text-[10px]"><IconCheck className="h-3 w-3" />grounded</Mark>}>DECISION-GRADE ANALYSIS</SecLabel>
                <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{askA}</div>
              </Card>
            )}
            <Card>
              <SecLabel icon={<IconNetwork className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">Trade · live</Mark>}>MARKET SNAPSHOT</SecLabel>
              {askSnap?.markets?.length ? (
                <div className="divide-y divide-line">
                  {askSnap.markets.map((m) => (
                    <div key={m.symbol} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0"><span className="text-[13px] font-semibold text-neon">{m.symbol}</span> <Tag accent="cyan" className="!text-[9px]">{m.stage}</Tag>{m.status !== "active" && <Mark accent="danger" plain className="ml-1 !text-[9px]">{m.status}</Mark>}</div>
                      <div className="flex shrink-0 items-center gap-1.5 text-right text-[11px] text-ink-dim tnum"><span title="liquidity vs the deepest market"><Meter value={m.liq} max={snapMaxLiq} w={32} color="#48f5ff" /></span>{m.price.toFixed(4)} · liq ${Math.round(m.liq / 1000)}K · {m.holders} holders</div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-ink-dim">Loading markets…</p>}
              {askSnap && (
                <div className="mt-2 border-t border-line pt-2 text-[11px] text-ink-dim">
                  GRID ${askSnap.grid_price?.toFixed(4) ?? "—"} · {askSnap.grids ?? 0} communities · {askSnap.open_raises ?? 0} open raises · {askSnap.open_jobs ?? 0} open jobs · {askSnap.agents ?? 0} agents · treasury ${(askSnap.treasury_usdc ?? 0).toLocaleString()}
                </div>
              )}
            </Card>
          </>}

          {/* EXECUTOR toggle */}
          {mode === "executor" && <Tabs tabs={["Launch", "Execution Flow"]} value={execRun ? 1 : 0} onChange={(i) => setExecRun(i === 1)} />}

          {/* EXECUTOR (Launch / Deploy) */}
          {mode === "executor" && !execRun && <>
            <Card>
              <div className="flex items-start gap-3"><IconCheck className="h-7 w-7 text-neon" /><div className="flex-1"><div className="text-2xl font-bold text-neon text-glow"><Decrypt text={bBuild ? `${bBuild.title} is ready.` : "Your dApp is ready."} /></div><div className="text-[12px] text-ink-dim">{bBuild ? `Echo-built ${bBuild.artifact.kind} · ${bBuild.stack.join(" · ")}` : "Build completed at 100% • Ready for deployment"}</div></div></div>
              {bBuild ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]"><Mark><IconShield className="h-3 w-3" />Proof {bBuild.artifact.proof_of_build}</Mark><Tag>{bBuild.artifact.artifact_id}</Tag><button onClick={() => setMode("builder")} className="ng-btn ng-btn-ghost ng-btn--sm ml-auto"><IconCode className="h-3.5 w-3.5" /> Back to Builder</button></div>
              ) : (
                <p className="mt-3 text-[11px] text-ink-faint">Open Launch from a build in Builder mode to launch it for real.</p>
              )}
            </Card>
            {bBuild ? (
              <>
                {/* launchpad actions — the focal point, compact single-line rows (real) */}
                <div>
                  <div className="ng-label mb-2 !text-ink-dim">Launch this build</div>
                  <div className="ng-card divide-y divide-line">
                    {([
                      { Icon: IconUser, name: "Create Project Grid", meta: "Team + treasury home", done: lp.gridSlug, busyKey: "grid" as const, onClick: createProjectGrid, cta: "Create" },
                      { Icon: IconRocket, name: "Publish to GridX", meta: "List as a product · +20 creator", done: lp.productId, busyKey: "product" as const, onClick: listOnGridX, cta: "Publish" },
                      { Icon: IconCoins, name: "Apply to Fund", meta: bBuild.artifact.files?.length ? "Echo drafts your raise — pitch · ask · milestones" : "Raise · build = proof of build", done: lp.proposalId, busyKey: "genesis" as const, onClick: bBuild.artifact.files?.length ? draftGenesis : applyGenesis, cta: bBuild.artifact.files?.length ? "Draft" : "Apply" },
                    ]).map((a) => (
                      <div key={a.name} className="flex items-center gap-3 p-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-neon/10 text-neon"><a.Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1"><div className="text-[13px] text-ink">{a.name}</div><div className="truncate text-[10px] text-ink-dim">{a.meta}</div></div>
                        {a.done
                          ? <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" /><Mark plain className="!text-[10px]">{a.done}</Mark></span>
                          : <button onClick={a.onClick} disabled={!!lp.busy} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{lp.busy === a.busyKey ? <IconRefresh className="h-3.5 w-3.5 animate-spin" /> : a.cta}</button>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ECHO-DRAFTED RAISE — review (edit the essentials) → submit to Fund */}
                {gx && !lp.proposalId && (
                  <Card className="!border-neon/40">
                    <SecLabel icon={<IconCoins className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">drafted by Echo · review before submit</Mark>}>YOUR RAISE — DRAFT</SecLabel>
                    <div className="space-y-2">
                      <input value={gx.draft.title} onChange={(e) => setGx((s) => (s ? { ...s, draft: { ...s.draft, title: e.target.value } } : s))} className="ng-input w-full !py-1.5 text-[13px] font-semibold" />
                      <textarea value={gx.draft.pitch} onChange={(e) => setGx((s) => (s ? { ...s, draft: { ...s.draft, pitch: e.target.value } } : s))} rows={3} className="ng-input w-full resize-none !py-1.5 text-[12px] leading-relaxed" />
                      <div className="flex items-center gap-3">
                        <Tag>{gx.draft.category}</Tag>
                        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-dim">Ask
                          <input value={String(gx.draft.ask_usdc)} onChange={(e) => setGx((s) => (s ? { ...s, draft: { ...s.draft, ask_usdc: Math.max(1000, Number(e.target.value.replace(/[^0-9]/g, "")) || 0) } } : s))} inputMode="numeric" className="ng-input w-24 !py-1 text-right text-[12px]" />
                          USDC
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="ng-label mb-1.5 !text-ink-dim">Milestone tranches — escrowed, released on delivery</div>
                      <div className="divide-y divide-line">
                        {gx.draft.milestones.map((m, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <div className="text-[12px] text-ink">{i + 1} · {m.title}</div>
                              <div className="text-[10.5px] leading-relaxed text-ink-dim">{m.description}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[12px] font-bold text-neon tnum">{m.amount_usdc.toLocaleString()}</div>
                              <div className="text-[9.5px] text-ink-faint">~{m.days}d</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={submitGenesis} disabled={gx.submitting || !gx.draft.title.trim()} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-40">{gx.submitting ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Submitting…</> : <><IconCoins className="h-3.5 w-3.5" /> Submit to Fund</>}</button>
                      <button onClick={() => setGx(null)} disabled={gx.submitting} className="ng-btn ng-btn-ghost ng-btn--sm">Discard</button>
                      <span className="ml-auto text-[10px] text-ink-faint">Backed by proof {bBuild.artifact.proof_of_build?.slice(0, 22)}…</span>
                    </div>
                  </Card>
                )}

                {/* real build summary — replaces the fake preview / deploy-targets / release / checklist cards */}
                <Card>
                  <SecLabel icon={<IconLayers className="h-3.5 w-3.5" />} action={<button onClick={() => notify("Live preview: " + bBuild.artifact.preview_url)} className="text-[11px] text-ink-dim transition hover:text-neon">Live Preview</button>}>BUILD SUMMARY</SecLabel>
                  <p className="text-[12px] text-ink">{bBuild.summary}</p>
                  <div className="mt-3 divide-y divide-line">
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Artifact</span><span className="ng-row__v"><Mark plain>{bBuild.artifact.artifact_id}</Mark></span></div>
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Kind · Target</span><span className="ng-row__v font-normal text-ink-dim">{bBuild.artifact.kind} · {bBuild.artifact.deploy_target}</span></div>
                    <div className="ng-row !text-[12px]"><span className="ng-row__k">Witnessed</span><span className="ng-row__v font-normal text-ink-dim">{bBuild.steps.length} steps</span></div>
                  </div>
                </Card>

                {/* deploy to mainnet → guarded execution flow (real toggle) */}
                <div className="ng-card flex items-center justify-between gap-3 p-3.5">
                  <div><div className="text-[13px] text-ink">Deploy — get a live URL</div><div className="text-[10px] text-ink-dim">{bBuild.deployment ? `Live at /d/${bBuild.deployment.slug} · v${bBuild.deployment.version}${bBuild.deployment.icp ? " · ICP-mirrored" : ""}` : `NeuGrid hosting · ${DEPLOY_COST} GRID · shareable link`}</div></div>
                  <button onClick={() => setExecRun(true)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0"><IconBolt className="h-3.5 w-3.5" /> Deploy Now</button>
                </div>
              </>
            ) : (
              <Card>
                <div className="flex items-center gap-2 text-[13px] text-ink"><IconAlert className="h-4 w-4 text-amber" />No build loaded</div>
                <p className="mt-1 text-[11px] text-ink-dim">Create something in Builder mode, then launch it here for real.</p>
                <button onClick={() => setMode("builder")} className="ng-btn ng-btn-primary ng-btn--sm mt-3"><IconCode className="h-3.5 w-3.5" />Go to Builder</button>
              </Card>
            )}
          </>}

          {/* EXECUTOR — execution flow (run) */}
          {mode === "executor" && execRun && (!bBuild ? (
            <Card>
              <SecLabel icon={<IconBolt className="h-3.5 w-3.5" />}>DEPLOY — NEUGRID HOSTING</SecLabel>
              <p className="text-[12px] text-ink-dim">No build loaded. Build (or resume) one in Builder mode, then deploy it to a live, shareable URL.</p>
              <button onClick={() => setMode("builder")} className="ng-btn ng-btn-primary ng-btn--sm mt-3"><IconCode className="h-3.5 w-3.5" /> Go to Builder</button>
            </Card>
          ) : (() => {
            const hasApp = !!bBuild.artifact.files?.some((f) => f.path === "preview/index.html");
            const enoughGrid = gridBal == null || gridBal >= DEPLOY_COST;
            const dep = bBuild.deployment;
            const upToDate = dep && dep.version === (bBuild.version ?? 1);
            const checks: [string, boolean, string][] = [
              ["Standalone app present", hasApp, hasApp ? "preview/index.html" : "this build has no deployable app"],
              ["Proof of build sealed", !!bBuild.artifact.proof_of_build, bBuild.artifact.proof_of_build?.slice(0, 26) ?? "—"],
              [`GRID balance covers the ${DEPLOY_COST} GRID deploy fee`, enoughGrid, gridBal != null ? `${Math.round(gridBal).toLocaleString()} GRID` : "—"],
            ];
            const canDeploy = hasApp && enoughGrid && !depBusy && !upToDate;
            const DEPLOY_STEPS = [`Snapshot v${bBuild.version ?? 1} of the app`, "Publish to the grid edge", "Seal the deployment record", "Live"];
            return <>
              <Bracket className="ng-card p-5">
                <SecLabel icon={<IconBolt className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">real hosting · version-pinned</Mark>}>DEPLOY — NEUGRID HOSTING</SecLabel>
                <p className="text-[12px] leading-relaxed text-ink">Publish <Mark plain>{bBuild.title}</Mark> v{bBuild.version ?? 1} to a live, shareable URL served by the grid. The deployment snapshots this exact version — later revisions go live only when you redeploy.</p>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
                  {([["Version", `v${bBuild.version ?? 1}`], ["Files", String(bBuild.artifact.files?.length ?? 0)], ["Deploy fee", `${DEPLOY_COST} GRID`], ["Sandbox", "isolated"]] as [string, string][]).map(([k, v]) => <div key={k} className="ng-card p-3"><div className="ng-stat__k">{k}</div><div className="mt-1 text-[13px] text-ink">{v}</div></div>)}
                </div>
              </Bracket>

              <Card>
                <SecLabel icon={<IconCheck className="h-3.5 w-3.5" />}>PREFLIGHT — REAL CHECKS</SecLabel>
                <div className="space-y-2">{checks.map(([n, ok, detail]) => (
                  <div key={n} className="ng-card flex items-center justify-between gap-3 p-3">
                    <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">{ok ? <IconCheck className="h-3.5 w-3.5 shrink-0 text-neon" /> : <IconAlert className="h-3.5 w-3.5 shrink-0 text-danger" />}<span className="min-w-0"><span>{n}</span><span className="block truncate text-[10px] text-ink-faint">{detail}</span></span></span>
                    <span className={`shrink-0 text-[11px] ${ok ? "text-neon" : "text-danger"}`}>{ok ? "Passed" : "Blocked"}</span>
                  </div>
                ))}</div>
              </Card>

              {dep && (
                <Card className={upToDate ? "!border-neon/40" : "!border-amber/40"}>
                  <SecLabel icon={<IconExternal className="h-3.5 w-3.5" />} action={<Mark className="!text-[10px]"><span className="ng-led" />LIVE</Mark>}>LIVE DEPLOYMENT</SecLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={`/d/${dep.slug}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[14px] font-semibold text-neon underline decoration-neon/40 underline-offset-4 hover:text-glow">/d/{dep.slug}</a>
                    <a href={`/d/${dep.slug}`} target="_blank" rel="noopener noreferrer" className="ng-btn ng-btn--sm ml-auto shrink-0"><IconExternal className="h-3.5 w-3.5" /> Open live app</a>
                  </div>
                  <div className="mt-2 divide-y divide-line">
                    <DataRow k="Serving" v={<Mark plain>v{dep.version}{upToDate ? " · current" : ` — current is v${bBuild.version ?? 1}`}</Mark>} accent={upToDate ? "neon" : "amber"} />
                    <DataRow k="Deploys" v={<span className="text-[12px]">{dep.redeploys + 1}</span>} />
                    <DataRow k="Sealed proof" v={<Mark plain className="!text-[10px]">{dep.proof.slice(0, 26)}…</Mark>} />
                  </div>
                  {!upToDate && <p className="mt-2 text-[10.5px] text-amber">The live site still serves v{dep.version}. Redeploy to publish v{bBuild.version ?? 1}.</p>}
                </Card>
              )}

              <Card>
                <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />}>DEPLOY PIPELINE</SecLabel>
                <div className="space-y-2.5">{DEPLOY_STEPS.map((s, i) => {
                  const st = depBusy ? (i < depSteps ? "done" : i === depSteps ? "active" : "pending") : depSteps >= 4 && i <= 3 ? "done" : "pending";
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${st === "done" ? "border-neon/40 text-neon" : st === "active" ? "border-amber/50 text-amber" : "border-line text-ink-faint"}`}>{st === "done" ? <IconCheck className="h-3 w-3" /> : st === "active" ? <IconRefresh className="h-3 w-3 animate-spin" /> : i + 1}</span>
                      <span className={`text-[13px] ${st === "pending" ? "text-ink-faint" : "text-ink"}`}>{s}</span>
                    </div>
                  );
                })}</div>
                <div className="mt-4 flex items-center gap-2">
                  <button onClick={deployNow} disabled={!canDeploy} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-40">{depBusy ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Deploying…</> : <><IconBolt className="h-3.5 w-3.5" /> {dep ? `Redeploy v${bBuild.version ?? 1}` : "Deploy"} · {DEPLOY_COST} GRID</>}</button>
                  {upToDate && <span className="text-[11px] text-neon">This version is already live.</span>}
                  <button onClick={() => setExecRun(false)} className="ng-btn ng-btn-ghost ng-btn--sm ml-auto">Back to Launch</button>
                </div>
              </Card>
            </>;
          })())}

          {/* OBSERVER — Live System Observation */}
          {mode === "observer" && <>
            <div className="flex items-center gap-2 text-[12px] text-cyan"><IconEye className="h-4 w-4" /><Decrypt text="Observer Mode — Live System Observation" /><Mark className="ml-auto !text-[10px]"><span className="ng-led" />Live</Mark></div>
            <Card>
              <SecLabel icon={<IconEye className="h-3.5 w-3.5" />} action={<Mark plain accent="cyan" className="!text-[10px]">read-only</Mark>}>ASK THE OBSERVER</SecLabel>
              <div className="flex items-center gap-2">
                <input value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runAsk(); }} disabled={askBusy} placeholder="Ask about what's happening on the grid right now…" className="ng-input min-w-0 flex-1 !py-1.5 text-[13px]" />
                <button onClick={() => runAsk()} disabled={askBusy || !askQ.trim()} className="ng-btn ng-btn-cyan ng-btn--sm shrink-0 disabled:opacity-40">{askBusy ? <><IconRefresh className="h-3.5 w-3.5 animate-spin" /> Observing…</> : <><IconEye className="h-3.5 w-3.5" /> Ask · {ASK_COST} GRID</>}</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{["What happened recently?", "Anything unusual in the stream?", "Who is most active right now?"].map((q) => <button key={q} onClick={() => runAsk(q)} disabled={askBusy} className="ng-btn ng-btn-ghost ng-btn--sm">{q}</button>)}</div>
              <p className="mt-2 text-[10px] text-ink-faint">Echo narrates the REAL event stream — reputation, trades, jobs, builds, payments. It sees everything and can change nothing.</p>
            </Card>
            {askBusy && <Card><p className="flex items-center gap-2 text-[12px] text-ink-dim"><IconRefresh className="h-3.5 w-3.5 animate-spin text-cyan" /> Echo is reading the live event stream…</p></Card>}
            {askA && !askBusy && (
              <Card className="!border-cyan/40">
                <SecLabel icon={<IconEye className="h-3.5 w-3.5" />} action={<Mark accent="cyan" className="!text-[10px]"><IconCheck className="h-3 w-3" />witnessed</Mark>}>OBSERVATION REPORT</SecLabel>
                <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{askA}</div>
              </Card>
            )}
            <Card>
              <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />} action={<Mark plain className="!text-[10px]">newest first · real events</Mark>}>EVENT TIMELINE</SecLabel>
              {askSnap?.feed?.length ? (
                <div className="divide-y divide-line">
                  {askSnap.feed.map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 py-2">
                      <Mark plain accent={e.kind === "trade" ? "cyan" : e.kind === "x402" ? "amber" : "neon"} className="mt-0.5 shrink-0 !text-[9px]">{e.kind}</Mark>
                      <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink">{e.line.replace(/^\[[^\]]+\]\s*/, "")}</span>
                      <span className="shrink-0 text-[10px] text-ink-faint tnum">{e.ago}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-ink-dim">Loading the live stream…</p>}
            </Card>
          </>}
        </main>

        {/* ============ RIGHT ============ */}
        <OrbPanel label="Controls" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          {/* live rail charts — the grid state Echo reasons over */}
          {hasSnap && (
            <PanelChart title="Grid · live state" read={`${snapTotal} entities`}>
              <div className="flex items-center justify-center py-1"><Donut data={snapRaw} size={128} center={`${snapTotal}`} /></div>
              <div className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[8.5px] text-ink-faint">{snapAxes.map((a, i) => <span key={a} className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5" style={{ background: ["#00ff00", "#7cf57c", "#48f5ff", "#ffb020", "#ff4d5e"][i] }} />{a}</span>)}</div>
            </PanelChart>
          )}
          {revisionCounts.length > 1 && (
            <PanelChart title="Iterations · per build" read={`${revisionCounts.reduce((s, n) => s + n, 0)} total`}>
              <div className="py-1"><Spark data={revisionCounts} gid="echo-iter" w={280} h={44} /></div>
            </PanelChart>
          )}
          {/* HUB right */}
          {mode === "select" && <>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>CAPABILITY MATRIX</SecLabel>
              <div className="divide-y divide-line">{cap.caps.map(([k, ok]) => <div key={k} className="ng-row !text-[12px]"><span className="ng-row__k">{k}</span><span className="ng-row__v">{ok ? <IconCheck className="h-3.5 w-3.5 text-neon" /> : <IconPlus className="h-3.5 w-3.5 rotate-45 text-danger" />}</span></div>)}</div>
            </Card>
            <Card><SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>SAFETY NOTICE</SecLabel><p className="text-[11px] leading-relaxed text-ink-dim">{cap.safety}</p></Card>
            <Card><SecLabel icon={<IconLock className="h-3.5 w-3.5" />}>REQUIREMENTS</SecLabel><p className="text-[11px] text-ink-dim">{cap.req}</p></Card>
            <Card>
              <SecLabel icon={<IconMessage className="h-3.5 w-3.5" />}>WHAT&rsquo;S REAL HERE</SecLabel>
              <ul className="space-y-1.5 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Builder writes real code — files, live preview, sha256 proof</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Personal / Analyst / Observer answer from live data</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Launch ships builds — Grid, GridX, an Echo-drafted raise</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Compute is metered in GRID → the protocol treasury</li>
              </ul>
            </Card>
          </>}

          {/* PERSONAL right */}
          {mode === "personal" && <>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>HOW THIS WORKS</SecLabel>
              <ul className="space-y-1.5 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Answers are grounded in your live on-platform state</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Echo recommends actions — it never executes them for you</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Numbers come from the snapshot, never invented</li>
              </ul>
              <div className="mt-3 divide-y divide-line">
                <DataRow k="Question cost" v={<Mark plain>{ASK_COST} GRID → treasury</Mark>} />
                <DataRow k="Refund on failure" v={<Mark plain>automatic</Mark>} />
              </div>
            </Card>
            <Card>
              <SecLabel icon={<IconBolt className="h-3.5 w-3.5" />}>ACT ON IT</SecLabel>
              <div className="space-y-2">
                <button onClick={() => setMode("builder")} className="ng-btn ng-btn--sm ng-btn--block"><IconCode className="h-3.5 w-3.5" /> Build with Echo</button>
                <Link href="/jobs" className="ng-btn ng-btn--sm ng-btn--block"><IconBriefcase className="h-3.5 w-3.5" /> Open Jobs</Link>
                <Link href="/agents" className="ng-btn ng-btn--sm ng-btn--block"><IconBot className="h-3.5 w-3.5" /> Your Agents</Link>
                <Link href="/genesis/board" className="ng-btn ng-btn--sm ng-btn--block"><IconCoins className="h-3.5 w-3.5" /> Fund Board</Link>
              </div>
            </Card>
          </>}

          {/* BUILDER right */}
          {mode === "builder" && <>
            <Card>
              <SecLabel icon={<IconUser className="h-3.5 w-3.5" />} action={execs ? <Mark plain className="!text-[10px]">{execs.agents.length + execs.talent.length} avail</Mark> : null}>RECOMMENDED EXECUTORS</SecLabel>
              <p className="mb-2 text-[10px] text-ink-dim">Hand off to verified agents + talent to finish your build.</p>
              {!execs ? (
                <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="ng-card h-12 animate-pulse opacity-40" />)}</div>
              ) : execs.agents.length === 0 && execs.talent.length === 0 ? (
                <p className="text-[11px] text-ink-dim">No executors on the marketplace yet.</p>
              ) : <>
                {execs.agents.length > 0 && <>
                  <div className="ng-label mb-1.5 mt-1 flex items-center gap-2 !text-neon"><IconBot className="h-3.5 w-3.5" />AI AGENTS</div>
                  <div className="space-y-1.5">{execs.agents.map((a) => (
                    <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="ng-card flex items-center gap-2.5 p-2.5 transition hover:!border-neon/40">
                      <Av size={24} seed={a.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[12px] text-ink"><span className="truncate">{a.name}</span>{a.trust_tier === "trusted" && <IconShield className="h-3 w-3 shrink-0 text-neon" />}</div>
                        <div className="truncate text-[10px] text-ink-dim">{a.capabilities.slice(0, 2).join(" · ") || "general"} · {a.verified_jobs} jobs</div>
                      </div>
                      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neon"><IconStar className="h-3 w-3" />{a.rating.toFixed(1)}</span>
                    </Link>
                  ))}</div>
                </>}
                {execs.talent.length > 0 && <>
                  <div className="ng-label mb-1.5 mt-3 flex items-center gap-2 !text-neon"><IconUser className="h-3.5 w-3.5" />HUMANS</div>
                  <div className="space-y-1.5">{execs.talent.map((t) => (
                    <Link key={t.id} href={`/talent/${t.id}`} className="ng-card flex items-center gap-2.5 p-2.5 transition hover:!border-neon/40">
                      <Av size={24} seed={t.username} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-ink">{t.username}</div>
                        <div className="truncate text-[10px] text-ink-dim">{t.skills[0] ?? "contributor"} · {t.jobs_done} jobs</div>
                      </div>
                      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neon"><IconStar className="h-3 w-3" />{t.reputation}</span>
                    </Link>
                  ))}</div>
                </>}
              </>}
            </Card>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>FAILURE &amp; SAFETY CONTROLS</SecLabel>
              <div className="space-y-2.5">{failureControls.map(({ Icon, l }) => <div key={l} className="flex items-start gap-2 text-[11px] text-ink-dim"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />{l}</div>)}</div>
            </Card>
          </>}

          {/* ANALYST right */}
          {mode === "analyst" && <>
            <Card>
              <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />}>TOP COMMUNITIES</SecLabel>
              {askSnap?.top_grids?.length ? (
                <div className="divide-y divide-line">
                  {askSnap.top_grids.map((g, i) => (
                    <div key={g.name} className="flex items-center justify-between gap-2 py-2">
                      <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink"><Av size={20} seed={g.name} /><span className="shrink-0 text-ink-faint">{i + 1} ·</span><span className="truncate">{g.name}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-ink-dim tnum"><span title="pulse vs the top community"><Meter value={g.pulse} max={maxPulse} w={28} /></span>{g.members} members · {g.pulse.toLocaleString()} pulse</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[11px] text-ink-dim">Loading…</p>}
            </Card>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>METHOD</SecLabel>
              <ul className="space-y-1.5 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Verdict first, then evidence, then risks</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Only live platform data — gaps are named, not filled</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Analysis only — no execute buttons here</li>
              </ul>
            </Card>
          </>}

          {/* EXECUTOR right (launchpad) */}
          {mode === "executor" && !execRun && (bBuild ? <>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />} action={<Mark className="!text-[10px]"><IconCheck className="h-3 w-3" />Sealed</Mark>}>PROOF OF BUILD</SecLabel>
              <div className="divide-y divide-line">
                <div className="ng-row !text-[12px]"><span className="ng-row__k">Attestation</span><span className="ng-row__v"><Mark plain>{bBuild.artifact.proof_of_build}</Mark></span></div>
                <div className="ng-row !text-[12px]"><span className="ng-row__k">Built with Echo</span><span className="ng-row__v !text-neon">{bBuild.artifact.built_with_echo ? "Yes" : "No"}</span></div>
                <div className="ng-row !text-[12px]"><span className="ng-row__k">Status</span><span className="ng-row__v"><Mark plain accent="cyan">{bBuild.status}</Mark></span></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">{bBuild.stack.map((s) => <Tag key={s}>{s}</Tag>)}</div>
            </Card>
            <Card>
              <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />}>HOW IT WAS BUILT</SecLabel>
              <div className="divide-y divide-line">{bBuild.steps.map((s) => <div key={s.label} className="flex items-center justify-between gap-2 py-2"><span className="text-[11px] text-ink-dim">{s.label}</span><IconCheck className="h-3 w-3 shrink-0 text-neon" /></div>)}</div>
            </Card>
            <Card>
              <SecLabel icon={<IconStar className="h-3.5 w-3.5" />}>TRACK RECORD</SecLabel>
              <p className="text-[11px] leading-relaxed text-ink-dim">This build is sealed into your verifiable track record — proof of build that backers and Grids can check, no pitch deck required. <Mark plain accent="neon">+40 builder rep</Mark></p>
            </Card>
          </> : (
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>LAUNCH</SecLabel>
              <p className="text-[11px] leading-relaxed text-ink-dim">Build something in Builder mode — its proof of build and launch options appear here.</p>
              <button onClick={() => setMode("builder")} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-3"><IconCode className="h-3.5 w-3.5" /> Go to Builder</button>
            </Card>
          ))}

          {/* EXECUTOR right (execution flow) */}
          {mode === "executor" && execRun && <>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>HOW HOSTING WORKS</SecLabel>
              <ul className="space-y-1.5 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Your app gets a real, shareable URL served by the grid</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Version-pinned: the live site is a sealed snapshot — redeploy to update</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Sandboxed: deployed code can never touch platform accounts</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />{DEPLOY_COST} GRID per deploy → the protocol treasury</li>
              </ul>
            </Card>
            {bBuild?.deployment && (
              <Card>
                <SecLabel icon={<IconDatabase className="h-3.5 w-3.5" />}>DEPLOYMENT RECORD</SecLabel>
                <div className="divide-y divide-line">
                  <DataRow k="Slug" v={<Mark plain>/d/{bBuild.deployment.slug}</Mark>} />
                  <DataRow k="Version live" v={<Mark plain>v{bBuild.deployment.version}</Mark>} />
                  <DataRow k="Sealed proof" v={<Mark plain className="!text-[10px]">{bBuild.deployment.proof.slice(0, 22)}…</Mark>} />
                  <DataRow k="Deployed" v={<span className="text-[11px] text-ink-dim">{new Date(bBuild.deployment.deployed_at).toLocaleString()}</span>} />
                  <DataRow k="Total deploys" v={<span className="text-[12px]">{bBuild.deployment.redeploys + 1}</span>} />
                </div>
                <a href={`/d/${bBuild.deployment.slug}`} target="_blank" rel="noopener noreferrer" className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-3"><IconExternal className="h-3.5 w-3.5" /> Open live app</a>
              </Card>
            )}
          </>}

          {/* OBSERVER right */}
          {mode === "observer" && <>
            <Card>
              <SecLabel icon={<IconShield className="h-3.5 w-3.5" />}>OBSERVER RULES</SecLabel>
              <ul className="space-y-1.5 text-[11px] text-ink-dim">
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Sees every event — reputation, trades, jobs, builds, payments</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Read-only: it can flag, never intervene</li>
                <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-cyan" />Says &ldquo;nothing unusual&rdquo; when that&rsquo;s the truth</li>
              </ul>
            </Card>
            <Card>
              <SecLabel icon={<IconActivity className="h-3.5 w-3.5" />}>GO TO THE SOURCE</SecLabel>
              <div className="space-y-2">
                <Link href="/markets" className="ng-btn ng-btn--sm ng-btn--block"><IconChart className="h-3.5 w-3.5" /> Trade Markets</Link>
                <Link href="/jobs" className="ng-btn ng-btn--sm ng-btn--block"><IconBriefcase className="h-3.5 w-3.5" /> Job Board</Link>
                <Link href="/leaderboard" className="ng-btn ng-btn--sm ng-btn--block"><IconStar className="h-3.5 w-3.5" /> Leaderboard</Link>
              </div>
            </Card>
          </>}
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
    </div>
  );
}
