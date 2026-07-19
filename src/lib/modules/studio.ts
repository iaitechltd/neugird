/**
 * Echo Studio — the WORKSHOP (docs/ECHO_STUDIO.md Phase 2).
 *
 * A persistent workspace where the self-hosted engine (Grok Build, headless —
 * src/lib/engine) builds a REAL project over many sessions: the builder gives a
 * directive, the engine writes → runs → fixes in a kernel-jailed workdir, and
 * every run lands back on the platform rails as a real Build — sha256 proof
 * re-sealed, version bumped, preview/deploy/GridX/Fund all unchanged.
 *
 * What the workshop adds over the one-shot:
 *   - the chat-edit LOOP (iterate on the same project, resume tomorrow)
 *   - CHECKPOINTS (restorable version snapshots)
 *   - the sealed ACTION TRAIL — every engine step witnessed + hashed
 *     (`trail_sha`): a receipt, not a claim. No competitor can offer this.
 *
 * Economics: each run costs `studio_run_cost_grid` (governable) → treasury
 * sink; refunded when the engine fails outright. Long runs execute OFF the
 * request thread (fire-and-forget + per-workspace mutex; the UI polls).
 * Engine-less deploys (prod has no binary yet) fail soft with
 * `engine_unavailable` — the Studio is a dev-gated surface until Phase 2's
 * prod runner lands.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../store";
import { newId, nowISO } from "../id";
import { engineAvailable, engineMode, runEngineBuild, type EngineEvent } from "../engine";
import { runEngineBuildAcp } from "../engine/acp";
import * as Brain from "../brain";
import * as Wallets from "./wallets";
import * as Params from "./params";
import * as Pulse from "./pulse";
import * as Referrals from "./referrals";
import * as Jobs from "./jobs";
import * as Feed from "./feed";
import * as SkillsMarket from "./skillsMarket";
import * as Markets from "./markets";
import * as Toolbox from "./toolbox";
import { buildMcpEntry, mcpConfigToml, maskMcp, catalogView, parseDoctor, type McpEntry } from "./mcpShared";
import type { Build, BuildFile, StudioTrailEvent, StudioTurn, StudioWorkspace } from "../types";

const TURNS_MAX = 60;
const TRAIL_MAX = 400;
const CHECKPOINTS_MAX = 10;
const FILES_MAX = 40;
const FILES_BYTES_MAX = 400_000;
const BUILD_REPUTATION = 40; // parity with Echo's one-shot build rep (echo.ts BUILD_REPUTATION)
const TEXT_EXT = new Set([".html", ".css", ".js", ".mjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".svg"]);
const SKIP_DIRS = new Set([".git", ".grok", "node_modules", ".next", "target"]);

const runsInFlight = new Set<string>(); // per-workspace mutex — one engine run at a time
const draftsInFlight = new Set<string>(); // per-workspace mutex — one launch-asset draft at a time

function workroot(): string {
  return path.join(process.cwd(), ".studio-workspaces");
}
function workdirOf(ws: StudioWorkspace): string {
  return path.join(workroot(), ws.workspace_id);
}

/* --------------------------------- helpers -------------------------------- */

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const round2 = (n: number) => Math.round(n * 100) / 100;

function get(workspace_id: string): StudioWorkspace | undefined {
  return db.studioWorkspaces.find((w) => w.workspace_id === workspace_id);
}

function pushTurn(ws: StudioWorkspace, turn: Omit<StudioTurn, "turn_id" | "at">): void {
  ws.turns.push({ turn_id: newId("sturn"), at: nowISO(), ...turn });
  if (ws.turns.length > TURNS_MAX) ws.turns = ws.turns.slice(-TURNS_MAX);
}

function pushTrail(ws: StudioWorkspace, type: StudioTrailEvent["type"], summary: string): void {
  ws.trail.push({ at: nowISO(), type, summary: clip(summary, 200) });
  if (ws.trail.length > TRAIL_MAX) ws.trail = ws.trail.slice(-TRAIL_MAX);
}

/** Seal the cumulative action trail — the "every step verifiable" receipt. */
function sealTrail(ws: StudioWorkspace): string {
  const h = createHash("sha256");
  for (const e of ws.trail) h.update(e.at).update("\0").update(e.type).update("\0").update(e.summary).update("\0");
  ws.trail_sha = `ngtrail:sha256:${h.digest("hex").slice(0, 24)}`;
  return ws.trail_sha;
}

/** Same honest proof shape Echo seals — sha256 over the REAL file contents. */
function proofOfFiles(owner: string, prompt: string, files: BuildFile[]): string {
  const h = createHash("sha256");
  h.update(owner).update("\0").update(prompt).update("\0");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(f.path).update("\0").update(f.content).update("\0");
  return `ngpob:sha256:${h.digest("hex").slice(0, 24)}`;
}

/** Write the workspace's current files to its jailed workdir (re-materialize on cold start). */
function materialize(ws: StudioWorkspace, files: BuildFile[]): void {
  const dir = workdirOf(ws);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    if (f.path.startsWith("preview/")) continue; // synthesized — never round-trips to disk
    const full = path.join(dir, f.path);
    if (!full.startsWith(dir)) continue; // jail: no path escape
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content);
  }
  // the product's standing law — the engine discovers AGENTS.md automatically
  try {
    const rulesPath = path.join(dir, "AGENTS.md");
    if (ws.rules?.trim()) fs.writeFileSync(rulesPath, ws.rules);
    else if (fs.existsSync(rulesPath)) fs.rmSync(rulesPath);
  } catch { /* rules are best-effort — never block a run */ }
  mountSkills(ws);
  mountPlugins(ws);
  writeMcpConfig(ws);
  // skills/plugins/mcp load at engine-session START — if the EFFECTIVE toolset
  // changed since the last run (e.g. a hub-level toolbox install), a resumed warm
  // session would never rescan them. Force a fresh session so it does.
  const off = new Set(ws.toolbox_off ?? []);
  const tb = Toolbox.forUser(ws.owner_id);
  const sig = createHash("sha256").update(JSON.stringify({
    skills: [...(tb.skills ?? []).filter((s) => !off.has(s.published_id)).map((s) => s.name + ":" + s.body.length), ...(ws.skills ?? []).map((s) => s.name + ":" + s.body.length)].sort(),
    plugins: effectivePlugins(ws).map((p) => p.name + ":" + p.files.length).sort(),
    mcp: effectiveMcp(ws).map((m) => m.name).sort(),
  })).digest("hex").slice(0, 16);
  if (ws.toolset_sig && ws.toolset_sig !== sig) ws.engine_session_id = undefined;
  ws.toolset_sig = sig;
}

/** The plugin bundles the engine sees = the owner's toolbox (minus switched-off)
 *  + this workshop's project-only installs. Workspace wins a name collision. */
function effectivePlugins(ws: StudioWorkspace) {
  const off = new Set(ws.toolbox_off ?? []);
  const inherited = (Toolbox.forUser(ws.owner_id).plugins ?? []).filter((p) => !off.has(p.published_id));
  const localNames = new Set((ws.plugins ?? []).map((p) => p.name));
  return [...inherited.filter((p) => !localNames.has(p.name)), ...(ws.plugins ?? [])];
}

/** (Re)mount plugin bundles under `.grok/plugins/<name>/…`. The dir is PRUNED and
 *  rebuilt every time so removed/switched-off plugins truly vanish; every file
 *  re-passes the INERT allowlist at mount (defense in depth — the store already
 *  enforced it at publish). */
function mountPlugins(ws: StudioWorkspace): void {
  const dir = workdirOf(ws);
  const root = path.join(dir, ".grok", "plugins");
  const skillRoot = path.join(dir, ".grok", "skills");
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* fine */ }
  for (const p of effectivePlugins(ws)) {
    for (const f of p.files) {
      if (!SkillsMarket.isInertPluginPath(f.path)) continue; // never mount executing components
      const full = path.join(root, p.name, f.path);
      if (full.startsWith(root)) {
        try { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, f.content); } catch { /* a failed mount never blocks a run */ }
      }
      // ALSO flatten a plugin's SKILL.md into the first-class `.grok/skills/` tier —
      // that's where the engine surfaces skills as ACTIVATABLE (a skill left only
      // under .grok/plugins/ shows in `inspect` but the model doesn't reach for it).
      const m = f.path.match(/^skills\/([a-z0-9-]+)\/SKILL\.md$/);
      if (m) {
        const flat = path.join(skillRoot, `${p.name}-${m[1]}`, "SKILL.md");
        if (flat.startsWith(skillRoot)) {
          try { fs.mkdirSync(path.dirname(flat), { recursive: true }); fs.writeFileSync(flat, f.content); } catch { /* best-effort */ }
        }
      }
    }
  }
}

/** Mount the workspace's installed build-skills into the engine workdir —
 *  `.grok/skills/<name>/SKILL.md` (the workspace tier, the engine's highest
 *  priority). `.grok` is in every SKIP set, so mounted skills never appear in
 *  file lists, snapshots, or proofs. */
function mountSkills(ws: StudioWorkspace): void {
  const dir = workdirOf(ws);
  const off = new Set(ws.toolbox_off ?? []);
  const inherited = (Toolbox.forUser(ws.owner_id).skills ?? []).filter((s) => !off.has(s.published_id));
  const localIds = new Set((ws.skills ?? []).map((s) => s.published_id));
  const all = [...inherited.filter((s) => !localIds.has(s.published_id)), ...(ws.skills ?? [])];
  for (const s of all) {
    const full = path.join(dir, ".grok", "skills", s.name, "SKILL.md");
    if (!full.startsWith(dir)) continue;
    try {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, s.body);
    } catch { /* a failed mount never blocks a run */ }
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "skill";

/** Collect the project's text files from the workdir (capped, jailed, binaries skipped). */
function collectFiles(dir: string): BuildFile[] {
  const out: BuildFile[] = [];
  let bytes = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".DS_")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
      if (!e.isFile() || !TEXT_EXT.has(path.extname(e.name).toLowerCase())) continue;
      if (out.length >= FILES_MAX) return;
      try {
        const content = fs.readFileSync(full, "utf8");
        if (bytes + content.length > FILES_BYTES_MAX) continue;
        bytes += content.length;
        out.push({ path: path.relative(dir, full), content });
      } catch { /* unreadable — skip */ }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Bundle the multi-file app into ONE standalone page (the preview/deploy rail's
 *  contract) — local css/js inlined into the root index.html. Same code, bundled. */
function standalone(files: BuildFile[]): string | null {
  const index = files.find((f) => f.path === "index.html");
  if (!index) return null;
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  let html = index.content;
  html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>(?!<\/link>)/gi, (m, href: string) => {
    const c = byPath.get(href.replace(/^\.\//, ""));
    return c !== undefined && /rel=["']?stylesheet/i.test(m) ? `<style>\n${c}\n</style>` : m;
  });
  html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (m, src: string) => {
    const c = byPath.get(src.replace(/^\.\//, ""));
    return c !== undefined ? `<script>\n${c}\n</script>` : m;
  });
  return html;
}

/** The engine brief — self-contained static app, verify, then STOP (the Phase-1 lesson). */
function brief(instruction: string, firstRun: boolean): string {
  return firstRun
    ? `${instruction}\n\nBuild it as a self-contained static web app in THIS directory: an index.html entry with local css/js files, no build step, no external network calls. Verify the core flows actually work (run/test them), fix what's broken — then STOP and summarize in 2-4 sentences. Working and shippable beats gold-plated: no extra features, no endless polish.`
    : `Modify the existing app in THIS directory: ${instruction}\n\nKeep it a self-contained static web app (index.html entry, local css/js, no build step, no external network calls). Verify the change actually works alongside the existing flows, fix what's broken — then STOP and summarize what changed in 2-4 sentences. No unrequested refactors.`;
}

/* --------------------------------- lifecycle -------------------------------- */

export function engineReady(): boolean {
  return engineAvailable();
}

export function runCost(): number {
  return Params.get("studio_run_cost_grid");
}

export type RunQuality = "standard" | "verified" | "best3";
/** The quality tiers' GRID prices — verified adds the engine's self-check loop
 *  (~1.5× compute); best-of-3 races three full candidates (~3×). */
export function runCostFor(quality: RunQuality): number {
  const base = runCost();
  return quality === "best3" ? base * 3 : quality === "verified" ? Math.round(base * 1.5) : base;
}

/** The three-brain crew config (docs/ECHO_STUDIO.md, locked): roles fixed, models
 *  swappable via env — never hardcoded in the flow. `hands` names an ENGINE
 *  config.toml model (passed to the binary per run); chief/chatter are API model ids. */
export function studioBrains(): { chief: string; hands: string; chatter: string } {
  return {
    chief: process.env.NEUGRID_STUDIO_BRAIN_CHIEF || "claude-fable-5",
    hands: process.env.NEUGRID_STUDIO_BRAIN_HANDS || process.env.NEUGRID_ENGINE_MODEL || "neugrid-claude",
    chatter: process.env.NEUGRID_STUDIO_BRAIN_CHATTER || "claude-haiku-4-5-20251001",
  };
}

export function listFor(owner_id: string): StudioWorkspace[] {
  return db.studioWorkspaces.filter((w) => w.owner_id === owner_id);
}

export function createWorkspace(owner_id: string, name: string): { workspace?: StudioWorkspace; error?: string } {
  const clean = name.trim().slice(0, 60);
  if (!clean) return { error: "name_required" };
  const ws: StudioWorkspace = {
    workspace_id: newId("wksp"),
    owner_id,
    name: clean,
    status: "idle",
    turns: [],
    checkpoints: [],
    trail: [],
    spent_grid: 0,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  pushTurn(ws, { role: "engine", text: "Workspace open. Tell the engine what to build — it writes, runs, and fixes until it works, and every step is sealed into the proof trail." });
  pushTrail(ws, "run", `workspace created: "${clean}"`);
  sealTrail(ws);
  db.studioWorkspaces.unshift(ws);
  return { workspace: ws };
}

/* ---------------------------------- the run ---------------------------------- */

export interface RunStart { ok?: boolean; error?: string; cost?: number; balance?: number }

/** Start an engine run — returns immediately; the run continues in the background
 *  (poll `view()` for progress). One run per workspace at a time. `from` labels the
 *  directive turn honestly ("chief" when the owner approves the chief's fix run). */
export function startRun(workspace_id: string, owner_id: string, instruction: string, from: "you" | "chief" = "you", opts?: { quality?: RunQuality; effort?: "low" | "medium" | "high" }): RunStart {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if (!engineAvailable()) return { error: "engine_unavailable" };
  const ask = instruction.trim();
  if (!ask) return { error: "instruction_required" };
  if (runsInFlight.has(workspace_id) || ws.status === "building") return { error: "busy" };
  const quality: RunQuality = opts?.quality === "verified" || opts?.quality === "best3" ? opts.quality : "standard";

  // the run's compute bill (priced by quality tier) — debit up front, treasury-credited;
  // refunded on engine failure
  const cost = runCostFor(quality);
  if (cost > 0) {
    if (!Wallets.debitGrid(owner_id, cost)) return { error: "insufficient_grid", cost, balance: Wallets.balances(owner_id).grid };
    Wallets.creditGrid(Wallets.TREASURY, cost);
  }

  runsInFlight.add(workspace_id);
  ws.status = "building";
  ws.progress = "engine starting…";
  ws.spent_grid = round2(ws.spent_grid + cost);
  ws.pending_fix = undefined; // a new directive supersedes any waiting fix
  pushTurn(ws, { role: from, text: clip(ask, 600) });
  pushTrail(ws, "run", `directive: ${ask}${quality !== "standard" ? ` · ${quality === "best3" ? "best-of-3" : "self-verified"} tier` : ""}`);
  ws.updated_at = nowISO();

  // fire-and-forget — the request returns now; the run reports back through the store
  void executeRun(workspace_id, owner_id, ask, cost, quality, opts?.effort).catch(() => { /* fully handled inside */ });
  return { ok: true, cost };
}

async function executeRun(workspace_id: string, owner_id: string, ask: string, cost: number, quality: RunQuality = "standard", effort?: "low" | "medium" | "high"): Promise<void> {
  const ws = get(workspace_id);
  if (!ws) { runsInFlight.delete(workspace_id); return; }
  const t0 = Date.now();
  try {
    const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
    const firstRun = !build;
    materialize(ws, build?.artifact.files ?? []);

    // THE CREW (Phase 3) — the chief turns the directive into the hands' brief.
    // Every seat degrades to null: a run always completes engine-only.
    const crew = studioBrains();
    ws.progress = "the chief is briefing the crew…";
    ws.updated_at = nowISO();
    const chiefBrief = await Brain.studioBrief({
      model: crew.chief,
      workspace: ws.name,
      directive: ask,
      files: (build?.artifact.files ?? []).filter((f) => f.path !== "preview/index.html").map((f) => f.path),
      build_summary: build?.summary,
      recent: ws.turns.slice(-6).map((t) => `${t.role}: ${t.text}`),
    });
    if (chiefBrief) {
      pushTurn(ws, { role: "chief", text: clip(chiefBrief, 700) });
      pushTrail(ws, "crew", `chief brief: ${chiefBrief}`);
      ws.updated_at = nowISO();
    }

    // ACP mode (Phase 7) streams every tool call — seal each into the trail (the
    // "receipt, not a claim" moat, Phase 6d). Its many small text chunks are BUFFERED
    // and flushed as one narration line at each tool boundary (else the trail floods).
    // Quality tiers (best-of-n / verified) are headless-only, so those stay headless.
    const useAcp = engineMode() === "acp" && quality === "standard";
    let narrateBuf = "";
    const flushNarrate = () => { const t = narrateBuf.trim(); narrateBuf = ""; if (t) pushTrail(ws, "narrate", t); };

    const opts = {
      workdir: workdirOf(ws),
      instruction: brief(chiefBrief ?? ask, firstRun),
      model: crew.hands,
      quality,
      effort,
      memory: !!ws.memory_enabled,
      max_turns: quality === "best3" ? 60 : 40, // three racing candidates need headroom
      timeout_ms: quality === "standard" ? 15 * 60_000 : 25 * 60_000,
      on_event: (ev: EngineEvent) => {
        if (ev.type === "text" && typeof ev.data === "string" && ev.data) {
          if (useAcp) {
            narrateBuf += ev.data;
            ws.progress = clip(narrateBuf.trim().slice(-160), 160);
            if (narrateBuf.length > 600) flushNarrate(); // bound long monologues between tools
          } else if (ev.data.trim()) {
            ws.progress = clip(ev.data.trim(), 160);
            pushTrail(ws, "narrate", ev.data.trim());
          }
        } else if (ev.type === "tool" && typeof ev.name === "string") {
          flushNarrate(); // group the narration that led to this call before it
          pushTrail(ws, "tool", ev.name);
          ws.progress = `▸ ${ev.name}`;
        }
      },
    };
    const runner = useAcp ? runEngineBuildAcp : runEngineBuild;
    // resume the warm engine session when we have one; a dead handle gets one fresh retry
    let res = await runner(ws.engine_session_id && !useAcp ? { ...opts, resume_session: ws.engine_session_id } : opts);
    if (!res.ok && ws.engine_session_id && !useAcp && res.files_changed.length === 0) {
      pushTrail(ws, "run", "stale engine session — retrying fresh");
      res = await runEngineBuild(opts);
    }
    flushNarrate(); // seal any trailing narration

    const duration_s = round2((Date.now() - t0) / 1000);
    const capped = res.events.some((e) => e.type === "max_turns_reached");
    const produced = res.ok || (capped && res.files_changed.length > 0);
    const files = produced ? collectFiles(workdirOf(ws)) : [];

    if (!produced || files.length === 0) {
      // engine failed outright — the builder gets their GRID back (reclaim from treasury, echo's pattern)
      if (cost > 0 && Wallets.debitGrid(Wallets.TREASURY, cost)) Wallets.creditGrid(owner_id, cost);
      ws.spent_grid = round2(Math.max(0, ws.spent_grid - cost));
      ws.status = "idle";
      ws.progress = undefined;
      pushTrail(ws, "error", `engine run failed: ${res.error ?? "no output"}`);
      sealTrail(ws);
      pushTurn(ws, { role: "engine", text: `The engine couldn't complete that run (${res.error ?? "no output"}). Your ${cost} GRID was refunded — try rephrasing the directive.`, error: res.error ?? "no_output", duration_s });
      ws.updated_at = nowISO();
      return;
    }

    // bundle the app for the preview/deploy rail (one standalone page, honestly inlined)
    const page = standalone(files);
    const allFiles: BuildFile[] = page ? [...files, { path: "preview/index.html", content: page }] : files;
    const at = nowISO();

    if (firstRun) {
      const build_id = newId("build");
      const proof = proofOfFiles(owner_id, ask, allFiles);
      const b: Build = {
        build_id,
        owner_id,
        title: ws.name.slice(0, 60),
        prompt: ask,
        summary: clip(res.text.trim() || `Built in the Studio: ${ws.name}`, 240),
        stack: ["HTML5", "CSS3", "JavaScript"],
        status: "built",
        artifact: {
          artifact_id: newId("art"),
          kind: "frontend",
          built_with_echo: true,
          proof_of_build: proof,
          files: allFiles,
          preview_url: page ? `/api/echo/builds/${build_id}/preview` : undefined,
          deploy_target: "devnet",
          created_at: at,
        },
        steps: [{ label: "Studio engine run", detail: `write→run→fix, ${res.num_turns ?? "?"} turns — action trail sealed`, at }],
        version: 1,
        created_at: at,
      };
      db.builds.unshift(b);
      ws.build_id = build_id;
      // a Studio build is a REAL paid build — same witnessed reputation as the one-shot
      Pulse.recordEvent({
        target_type: "user", target_id: owner_id, user_id: owner_id,
        action_type: "build_completed", weight: BUILD_REPUTATION,
        reason: `Studio witnessed a build: "${b.title}" (engine, trail-sealed)`,
        verification_source: "studio:witness", dimension: "builder",
      });
      if (cost > 0) Referrals.checkVerify(owner_id);
    } else if (build) {
      const version = (build.version ?? 1) + 1;
      build.version = version;
      build.artifact.files = allFiles;
      build.artifact.proof_of_build = proofOfFiles(owner_id, `${build.prompt}\n[studio v${version}] ${ask}`, allFiles);
      if (page) build.artifact.preview_url = `/api/echo/builds/${build.build_id}/preview`;
      (build.revisions ??= []).push({
        version, instruction: clip(ask, 200), proof: build.artifact.proof_of_build,
        notes: clip(res.text.trim(), 300) || undefined, files_changed: res.files_changed.length, at,
      });
      if (build.revisions.length > 20) build.revisions = build.revisions.slice(-20);
      build.steps.push({ label: `Studio run → v${version}`, detail: `${res.files_changed.length} file(s) changed, ${res.num_turns ?? "?"} turns`, at });
    }

    const b = db.builds.find((x) => x.build_id === ws.build_id)!;
    pushTrail(ws, "files", `${res.files_changed.length || files.length} file(s) → v${b.version ?? 1} · proof ${b.artifact.proof_of_build}`);
    pushTrail(ws, "done", `run complete in ${duration_s}s (${res.num_turns ?? "?"} turns${capped ? ", capped" : ""})`);
    const trail_sha = sealTrail(ws);

    // checkpoint — a restorable snapshot of this version, proof + trail sealed
    ws.checkpoints.unshift({
      checkpoint_id: newId("ckpt"),
      version: b.version ?? 1,
      note: clip(ask, 80),
      files: allFiles,
      proof: b.artifact.proof_of_build ?? "",
      trail_sha,
      at,
    });
    if (ws.checkpoints.length > CHECKPOINTS_MAX) ws.checkpoints = ws.checkpoints.slice(0, CHECKPOINTS_MAX);

    ws.engine_session_id = res.session_id ?? ws.engine_session_id;
    // the engine reports its own exact spend — surface it honestly (Phase 6a)
    if (typeof res.cost_usd === "number" && Number.isFinite(res.cost_usd)) {
      ws.spent_usd = round2((ws.spent_usd ?? 0) + res.cost_usd);
    }
    pushTurn(ws, {
      role: "engine",
      text: clip(res.text.trim() || "Run complete — the app is updated in the preview.", 700),
      version: b.version ?? 1, cost_grid: cost, duration_s, files_changed: res.files_changed.length || files.length,
      cost_usd: res.cost_usd, tokens: res.usage?.total_tokens, quality: quality !== "standard" ? quality : undefined,
    });
    ws.updated_at = nowISO();

    // THE CREW, after the ship: the chatter tells the founder what landed in one
    // plain line; the chief GRADES the work before the founder relies on it. The
    // room stays "building" through the review (seconds) so the crew is visible.
    ws.progress = "the chief is reviewing the work…";
    const [status, grade] = await Promise.all([
      Brain.studioStatus({
        model: crew.chatter, directive: ask, result: res.text.trim(),
        version: b.version ?? 1, files_changed: res.files_changed.length || files.length, duration_s,
      }),
      Brain.studioGrade({
        model: crew.chief, directive: ask, brief: chiefBrief ?? undefined, result: res.text.trim(),
        files: allFiles.filter((f) => f.path !== "preview/index.html").map((f) => ({ path: f.path, bytes: f.content.length })),
        excerpt: files.find((f) => f.path === "index.html")?.content,
      }),
    ]);
    if (status) pushTurn(ws, { role: "chatter", text: clip(status, 200) });
    if (grade) {
      pushTurn(ws, { role: "chief", text: clip(grade.notes, 300), grade: grade.verdict });
      pushTrail(ws, "crew", `chief grade: ${grade.verdict} — ${grade.notes}`);
      // a paid fix run never fires itself — it waits for the owner (approval grammar)
      if (grade.verdict === "revise" && grade.re_brief) ws.pending_fix = { re_brief: grade.re_brief, notes: grade.notes, at: nowISO() };
      sealTrail(ws);
    }
    ws.status = "idle";
    ws.progress = undefined;
    ws.updated_at = nowISO();
  } catch (e) {
    // never leave a workspace wedged — refund + surface the error
    if (cost > 0 && Wallets.debitGrid(Wallets.TREASURY, cost)) Wallets.creditGrid(owner_id, cost);
    const wsNow = get(workspace_id);
    if (wsNow) {
      wsNow.spent_grid = round2(Math.max(0, wsNow.spent_grid - cost));
      wsNow.status = "idle";
      wsNow.progress = undefined;
      pushTrail(wsNow, "error", `run crashed: ${e instanceof Error ? e.message : "unknown"}`);
      sealTrail(wsNow);
      pushTurn(wsNow, { role: "engine", text: `The run crashed (${e instanceof Error ? e.message : "unknown"}). Your ${cost} GRID was refunded.`, error: "run_crashed" });
      wsNow.updated_at = nowISO();
    }
  } finally {
    runsInFlight.delete(workspace_id);
  }
}

/** The owner answers the chief's "revise" verdict: approve fires a normal PAID run
 *  driven by the chief's corrective brief; dismiss clears it. Money never moves
 *  without the owner — the venture approval grammar, inline in the room. */
export function resolveFix(workspace_id: string, owner_id: string, decision: "approve" | "dismiss"): RunStart {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const fix = ws.pending_fix;
  if (!fix) return { error: "no_pending_fix" };
  if (decision === "dismiss") {
    ws.pending_fix = undefined;
    pushTrail(ws, "crew", "the owner dismissed the chief's fix");
    sealTrail(ws);
    ws.updated_at = nowISO();
    return { ok: true };
  }
  pushTrail(ws, "crew", "the owner approved the chief's fix run");
  return startRun(workspace_id, owner_id, fix.re_brief, "chief");
}

/* ------------------- launch assets (Phase 3 — content + marketing) ------------------- */

/** The content seat drafts the launch post (marketing adds the tagline) — FREE brain
 *  calls, fire-and-forget; the draft parks as `pending_post` for the owner's approval
 *  (publishing is public, so it always gates). */
export function draftLaunchAssets(workspace_id: string, owner_id: string): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
  if (!build) return { error: "no_build" };
  if (!Brain.activeBrain()) return { error: "brain_inactive" };
  if (ws.pending_post) return { error: "draft_waiting" };
  if (draftsInFlight.has(workspace_id)) return { error: "busy" };

  draftsInFlight.add(workspace_id);
  pushTurn(ws, { role: "content", text: "Drafting your launch post — grounded in what the product actually does…" });
  ws.updated_at = nowISO();

  const product = {
    title: build.title,
    summary: build.summary,
    stack: build.stack,
    url: build.deployment ? `/d/${build.deployment.slug}` : undefined,
  };
  void (async () => {
    try {
      const [post, tag] = await Promise.all([
        Brain.specialistWork({
          company: ws.name, product, objective: "launch the product publicly", dept: "content", role: "launch copywriter",
          task: "Write the launch post announcing this product on the NeuGrid wire: a strong plain first line (it becomes the headline), then 2-3 short honest paragraphs about what it does and who it's for. Ground every claim in the real product; include the live link if one exists. No hashtags, no emoji.",
        }),
        Brain.specialistWork({
          company: ws.name, product, objective: "position the product", dept: "marketing", role: "positioning lead",
          task: "Write ONE plain-English tagline (max 12 words) that says what this product is and who it's for. Just the line.",
        }),
      ]);
      const wsNow = get(workspace_id);
      if (!wsNow) return;
      if (post?.deliverable) {
        // the first substantive line, with any "Tagline:" label the model echoes stripped
        const tagline = tag?.deliverable?.split("\n")
          .map((l) => l.replace(/^\s*tagline\s*:?\s*/i, "").replace(/^["'“”]+|["'“”]+$/g, "").trim())
          .find((l) => l.length > 3)?.slice(0, 120);
        wsNow.pending_post = { title: clip(post.title || `Launching ${build.title}`, 90), body: clip(post.deliverable, 2000), tagline: tagline || undefined, at: nowISO() };
        pushTurn(wsNow, { role: "content", text: "Your launch post is drafted — review it below and publish when it reads right." });
        if (tagline) pushTurn(wsNow, { role: "marketing", text: `Tagline: ${tagline}` });
        pushTrail(wsNow, "crew", `content drafted the launch post: "${wsNow.pending_post.title}"`);
      } else {
        pushTurn(wsNow, { role: "content", text: "Couldn't draft the post this time — try again in a moment.", error: "draft_failed" });
      }
      sealTrail(wsNow);
      wsNow.updated_at = nowISO();
    } finally {
      draftsInFlight.delete(workspace_id);
    }
  })();
  return { ok: true };
}

/** The owner answers the drafted launch post: approve publishes it to the REAL wire. */
export function resolvePost(workspace_id: string, owner_id: string, decision: "approve" | "dismiss"): { ok?: boolean; post_id?: string; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const draft = ws.pending_post;
  if (!draft) return { error: "no_pending_post" };
  if (decision === "dismiss") {
    ws.pending_post = undefined;
    pushTrail(ws, "crew", "the owner dismissed the launch post");
    sealTrail(ws);
    ws.updated_at = nowISO();
    return { ok: true };
  }
  const body = draft.tagline ? `${draft.body}\n\n${draft.tagline}` : draft.body;
  const r = Feed.create({
    user_id: owner_id, topic: "build", title: draft.title, body,
    ref: ws.build_id ? { kind: "build", id: ws.build_id, label: ws.name } : undefined,
  });
  if (!r.post) return { error: r.error ?? "post_failed" };
  ws.pending_post = undefined;
  pushTurn(ws, { role: "content", text: `Launch post published to the wire → /post/${r.post.post_id}` });
  pushTrail(ws, "crew", `launch post published: /post/${r.post.post_id}`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true, post_id: r.post.post_id };
}

/* ------------------------- money in the room (Phase 4) ------------------------- */

/** HIRE HELP — a REAL escrowed Job posted from the room: the reward locks in USDC
 *  escrow now and pays the worker on the owner's delivery approval. */
export function hireHelp(workspace_id: string, owner_id: string, input: { title: string; description: string; reward_usdc: number }): { job_id?: string; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const title = (input.title ?? "").trim().slice(0, 90);
  const description = (input.description ?? "").trim().slice(0, 2000);
  const reward = Math.round((Number(input.reward_usdc) || 0) * 100) / 100;
  if (!title || !description) return { error: "title_and_description_required" };
  if (!Number.isFinite(reward) || reward <= 0 || reward > 50_000) return { error: "bad_reward" };
  const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
  const r = Jobs.postFundedJob({
    context: "talent_contract", grid_id: build?.grid_id,
    title, description, executor_kind: "any", reward_amount: reward, created_by: owner_id,
  }, owner_id);
  if (!r.job) return { error: r.error ?? "job_failed" };
  (ws.hired ??= []).unshift({ job_id: r.job.job_id, title, at: nowISO() });
  pushTrail(ws, "run", `hired help: "${title}" — ${reward} USDC escrowed`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { job_id: r.job.job_id };
}

/* ------------------- MCP connections (Phase 6b — real services) ------------------- */
// A connection plugs a REAL service into the workshop: the engine discovers the
// workspace's `.grok/config.toml` [mcp_servers.*] automatically (self-built engines
// skip the repo-trust ceremony — OUR explicit connect action is the consent gate),
// and the service's tools become callable during builds. Secrets live on the
// workspace server-side and are MASKED in every view.

/** The connections the engine actually sees for a run = the owner's TOOLBOX (minus
 *  any switched off here) + this workshop's project-only adds. Workspace name wins
 *  a collision. This is what makes "set GitHub up once" flow into every build. */
function effectiveMcp(ws: StudioWorkspace): McpEntry[] {
  const off = new Set(ws.toolbox_off ?? []);
  const inherited = (Toolbox.forUser(ws.owner_id).mcp ?? []).filter((m) => !off.has(m.name));
  const localNames = new Set((ws.mcp ?? []).map((m) => m.name));
  return [...inherited.filter((m) => !localNames.has(m.name)), ...(ws.mcp ?? [])];
}

/** Regenerate the workspace's `.grok/config.toml` from the EFFECTIVE sets:
 *  MCP servers + the [plugins] enabled list (grok disables plugins by default —
 *  naming them here is what switches the mounted bundles on). */
function writeMcpConfig(ws: StudioWorkspace): void {
  try {
    const dir = path.join(workdirOf(ws), ".grok");
    const file = path.join(dir, "config.toml");
    const mcpBody = mcpConfigToml(effectiveMcp(ws));
    const pluginNames = effectivePlugins(ws).map((p) => p.name);
    const pluginBody = pluginNames.length ? `\n[plugins]\nenabled = [${pluginNames.map((n) => JSON.stringify(n)).join(", ")}]\n` : "";
    const body = (mcpBody || "") + pluginBody;
    if (!body.trim()) { if (fs.existsSync(file)) fs.rmSync(file); return; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, (mcpBody || "# generated by NeuGrid Echo Studio\n") + pluginBody);
  } catch { /* best-effort — a failed write surfaces at doctor time */ }
}

/** Connect a service to THIS workshop (project-only). Toolbox items are added on the hub. */
export function addMcp(workspace_id: string, owner_id: string, input: { kind: string; name?: string; value?: string; command?: string; args?: string; url?: string; header?: string }): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if ((ws.mcp ?? []).length >= 6) return { error: "too_many_connections" };
  const { entry, error } = buildMcpEntry(input);
  if (!entry) return { error };
  if (effectiveMcp(ws).some((m) => m.name === entry.name)) return { error: "name_taken" };
  (ws.mcp ??= []).push(entry);
  writeMcpConfig(ws);
  ws.engine_session_id = undefined; // servers load at engine-session start
  pushTrail(ws, "crew", `connected service "${entry.name}" (${entry.kind})`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true };
}

/** Switch an inherited TOOLBOX connection/skill off (or back on) for THIS project. */
export function toggleToolboxItem(workspace_id: string, owner_id: string, name: string, on: boolean): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const off = new Set(ws.toolbox_off ?? []);
  if (on) off.delete(name); else off.add(name);
  ws.toolbox_off = [...off];
  writeMcpConfig(ws);
  ws.engine_session_id = undefined;
  pushTrail(ws, "crew", `toolbox item "${name}" ${on ? "on" : "off"} for this project`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true };
}

export function removeMcp(workspace_id: string, owner_id: string, name: string): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const before = ws.mcp?.length ?? 0;
  ws.mcp = (ws.mcp ?? []).filter((m) => m.name !== name);
  if (ws.mcp.length === before) return { error: "not_connected" };
  writeMcpConfig(ws);
  ws.engine_session_id = undefined;
  pushTrail(ws, "crew", `disconnected service "${name}"`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true };
}

/** Live connection health — asks the ENGINE's own doctor (spawns each server briefly).
 *  Cached per workspace; refresh is an explicit owner action. */
const mcpHealth = new Map<string, { at: string; servers: Record<string, { ok: boolean; note: string }> }>();

export async function checkMcp(workspace_id: string, owner_id: string): Promise<{ ok?: boolean; error?: string }> {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if (!(ws.mcp ?? []).length) return { error: "no_connections" };
  const bin = process.env.NEUGRID_ENGINE_BIN;
  if (!bin) return { error: "engine_unavailable" };
  writeMcpConfig(ws); // make sure what the doctor sees is what we have

  const { spawn } = await import("node:child_process");
  const out: string = await new Promise((resolve) => {
    const child = spawn(bin, ["mcp", "doctor"], {
      cwd: workdirOf(ws),
      env: { ...process.env, GROK_HOME: process.env.NEUGRID_ENGINE_HOME || process.env.GROK_HOME, XAI_API_KEY: process.env.XAI_API_KEY || "placeholder" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000); // first run downloads the server package
    child.stdout.on("data", (d: Buffer) => { buf += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { buf += d.toString(); });
    child.on("close", () => { clearTimeout(timer); resolve(buf); });
    child.on("error", () => { clearTimeout(timer); resolve(buf); });
  });

  // parseDoctor reads each server's ✓/✗ BLOCK (not the header, which has no verdict).
  const servers = parseDoctor(out, effectiveMcp(ws).map((m) => m.name));
  mcpHealth.set(workspace_id, { at: nowISO(), servers });
  return { ok: true };
}

/* --------------------- rules + memory (Phase 6a quick power) --------------------- */

/** Set the workshop's standing law (AGENTS.md) — the engine obeys it on every run. */
export function setRules(workspace_id: string, owner_id: string, rules: string): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  const clean = (rules ?? "").slice(0, 6000);
  ws.rules = clean.trim() ? clean : undefined;
  try { // reflect immediately so even a run started this second obeys the new law
    const dir = workdirOf(ws);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "AGENTS.md");
    if (ws.rules) fs.writeFileSync(p, ws.rules); else if (fs.existsSync(p)) fs.rmSync(p);
  } catch { /* best-effort — materialize() re-syncs on the next run anyway */ }
  pushTrail(ws, "crew", ws.rules ? `the owner set the project rules (${ws.rules.length} chars)` : "the owner cleared the project rules");
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true };
}

/** Toggle cross-session engine memory for this workshop (experimental upstream). */
export function setMemory(workspace_id: string, owner_id: string, on: boolean): { ok?: boolean; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  ws.memory_enabled = !!on;
  pushTrail(ws, "crew", `workshop memory ${on ? "ON — the engine remembers across sessions" : "OFF"}`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true };
}

/* ------------------------- workspace skills (Phase 5) ------------------------- */

/** Install a build-skill into THIS workspace: pays the creator through the skills
 *  market, pins the body, and mounts it for every future engine run. */
export function installSkill(workspace_id: string, owner_id: string, published_id: string): { ok?: boolean; paid?: number; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if ((ws.skills ?? []).some((s) => s.published_id === published_id)) return { error: "already_installed" };
  const r = SkillsMarket.installBuildSkill({ published_id, installer_id: owner_id });
  if (!r.body || !r.title) return { error: r.error ?? "install_failed" };
  (ws.skills ??= []).push({ published_id, name: slugify(r.title), title: r.title, body: r.body, at: nowISO() });
  mountSkills(ws); // available to the very next run
  ws.engine_session_id = undefined; // skills load at session START — a resumed warm session would never see the new one
  pushTrail(ws, "crew", `installed build-skill "${r.title}"${r.paid ? ` — ${r.paid} GRID to its creator` : ""}`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true, paid: r.paid ?? 0 };
}

/** Install a plugin bundle into THIS workspace (project-only): pays the creator,
 *  pins the files, mounts immediately. Toolbox-level installs live on the hub. */
export function installWorkspacePlugin(workspace_id: string, owner_id: string, published_id: string): { ok?: boolean; paid?: number; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if ((ws.plugins ?? []).some((p) => p.published_id === published_id)) return { error: "already_installed" };
  const r = SkillsMarket.installPlugin({ published_id, installer_id: owner_id });
  if (!r.files || !r.title) return { error: r.error ?? "install_failed" };
  (ws.plugins ??= []).push({ published_id, name: slugify(r.title), title: r.title, files: r.files, at: nowISO() });
  mountPlugins(ws);
  writeMcpConfig(ws); // the [plugins] enabled list changed
  ws.engine_session_id = undefined; // plugins load at engine-session start
  pushTrail(ws, "crew", `installed plugin "${r.title}"${r.paid ? ` — ${r.paid} GRID to its creator` : ""}`);
  sealTrail(ws);
  ws.updated_at = nowISO();
  return { ok: true, paid: r.paid ?? 0 };
}

/* -------------------------------- checkpoints -------------------------------- */

export function restoreCheckpoint(workspace_id: string, owner_id: string, checkpoint_id: string): { ok?: boolean; version?: number; error?: string } {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if (ws.status === "building") return { error: "busy" };
  const ckpt = ws.checkpoints.find((c) => c.checkpoint_id === checkpoint_id);
  if (!ckpt) return { error: "checkpoint_not_found" };
  const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
  if (!build) return { error: "no_build" };

  const version = (build.version ?? 1) + 1; // a restore is a new version — history stays honest
  build.version = version;
  build.artifact.files = ckpt.files;
  build.artifact.proof_of_build = proofOfFiles(owner_id, `${build.prompt}\n[studio restore v${ckpt.version}→v${version}]`, ckpt.files);
  (build.revisions ??= []).push({ version, instruction: `restored checkpoint v${ckpt.version}`, proof: build.artifact.proof_of_build, files_changed: ckpt.files.length, at: nowISO() });
  materialize(ws, ckpt.files);
  ws.engine_session_id = undefined; // the engine's session memory no longer matches the files
  pushTrail(ws, "run", `restored checkpoint v${ckpt.version} → v${version}`);
  sealTrail(ws);
  pushTurn(ws, { role: "engine", text: `Restored the v${ckpt.version} snapshot as v${version}. The preview and proof are updated.`, version });
  ws.updated_at = nowISO();
  return { ok: true, version };
}

/* ----------------------------------- view ----------------------------------- */

export function view(workspace_id: string, viewer_id: string) {
  const ws = get(workspace_id);
  if (!ws || ws.owner_id !== viewer_id) return null; // the workshop is private
  const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
  // the money rails' live state — the path from build to token, all real lookups
  const grid = build?.grid_id ? db.grids.find((g) => g.grid_id === build.grid_id) : undefined;
  const product = build?.product_id ? db.products.find((p) => p.product_id === build.product_id) : undefined;
  const proposal = build?.proposal_id ? db.proposals.find((p) => p.proposal_id === build.proposal_id) : undefined;
  const market = grid ? db.markets.find((m) => m.grid_id === grid.grid_id) : undefined;
  const audit = grid ? Markets.auditFor(grid.grid_id) : undefined;
  return {
    workspace: {
      workspace_id: ws.workspace_id, owner_id: ws.owner_id, name: ws.name, status: ws.status,
      build_id: ws.build_id, progress: ws.progress, spent_grid: ws.spent_grid,
      trail_sha: ws.trail_sha, created_at: ws.created_at, updated_at: ws.updated_at,
    },
    turns: ws.turns,
    trail: ws.trail.slice(-80),
    trail_len: ws.trail.length,
    checkpoints: ws.checkpoints.map((c) => ({ checkpoint_id: c.checkpoint_id, version: c.version, note: c.note, proof: c.proof, trail_sha: c.trail_sha, at: c.at, files: c.files.length })),
    // while the engine is building, read the workdir LIVE — the room watches files appear
    files: (ws.status === "building" ? collectFiles(workdirOf(ws)) : (build?.artifact.files ?? []))
      .filter((f) => f.path !== "preview/index.html").map((f) => ({ path: f.path, bytes: f.content.length })),
    build: build ? {
      build_id: build.build_id, title: build.title, version: build.version ?? 1,
      proof: build.artifact.proof_of_build, preview_url: build.artifact.preview_url,
      deployment: build.deployment ? { slug: build.deployment.slug, version: build.deployment.version, url: `/d/${build.deployment.slug}` } : undefined,
    } : undefined,
    crew: { ...studioBrains(), active: Brain.activeBrain() !== null },
    pending_fix: ws.pending_fix,
    pending_post: ws.pending_post,
    rules: ws.rules ?? "",
    memory_enabled: !!ws.memory_enabled,
    spent_usd: ws.spent_usd ?? 0,
    run_costs: { standard: runCostFor("standard"), verified: runCostFor("verified"), best3: runCostFor("best3") },
    // connections — secrets NEVER leave the server (masked). Inherited (from the
    // owner's hub toolbox, tagged scope:"toolbox") + this project's own adds.
    connections: (() => {
      const off = new Set(ws.toolbox_off ?? []);
      const localNames = new Set((ws.mcp ?? []).map((m) => m.name));
      const health = mcpHealth.get(ws.workspace_id)?.servers ?? {};
      const inherited = (Toolbox.forUser(ws.owner_id).mcp ?? []).filter((m) => !localNames.has(m.name))
        .map((m) => ({ ...maskMcp(m, off.has(m.name) ? null : (health[m.name] ?? null), "toolbox"), enabled: !off.has(m.name) }));
      const local = (ws.mcp ?? []).map((m) => ({ ...maskMcp(m, health[m.name] ?? null, "project"), enabled: true }));
      return [...inherited, ...local];
    })(),
    connections_checked_at: mcpHealth.get(ws.workspace_id)?.at ?? null,
    mcp_catalog: catalogView(),
    skills: (() => {
      const off = new Set(ws.toolbox_off ?? []);
      const localIds = new Set((ws.skills ?? []).map((s) => s.published_id));
      const inherited = (Toolbox.forUser(ws.owner_id).skills ?? []).filter((s) => !localIds.has(s.published_id))
        .map((s) => ({ published_id: s.published_id, name: s.name, title: s.title, at: s.at, scope: "toolbox" as const, enabled: !off.has(s.published_id) }));
      const local = (ws.skills ?? []).map((s) => ({ published_id: s.published_id, name: s.name, title: s.title, at: s.at, scope: "project" as const, enabled: true }));
      return [...inherited, ...local];
    })(),
    skill_store: SkillsMarket.listBuildSkills().slice(0, 12).map((p) => ({
      published_id: p.published_id, title: p.title, summary: p.summary, price_grid: p.price_grid, installs: p.installs,
      author: db.users.find((u) => u.id === p.author_id)?.username ?? "builder",
      installed: (ws.skills ?? []).some((s) => s.published_id === p.published_id),
      mine: p.author_id === viewer_id,
    })),
    plugins: (() => {
      const off = new Set(ws.toolbox_off ?? []);
      const localNames = new Set((ws.plugins ?? []).map((p) => p.name));
      const inherited = (Toolbox.forUser(ws.owner_id).plugins ?? []).filter((p) => !localNames.has(p.name))
        .map((p) => ({ published_id: p.published_id, name: p.name, title: p.title, files: p.files.length, scope: "toolbox" as const, enabled: !off.has(p.published_id) }));
      const local = (ws.plugins ?? []).map((p) => ({ published_id: p.published_id, name: p.name, title: p.title, files: p.files.length, scope: "project" as const, enabled: true }));
      return [...inherited, ...local];
    })(),
    plugin_store: SkillsMarket.listPlugins().slice(0, 12).map((p) => ({
      published_id: p.published_id, title: p.title, summary: p.summary, price_grid: p.price_grid, installs: p.installs,
      files: SkillsMarket.pluginFiles(p).length,
      author: db.users.find((u) => u.id === p.author_id)?.username ?? "builder",
      installed: (ws.plugins ?? []).some((x) => x.published_id === p.published_id) || (Toolbox.forUser(ws.owner_id).plugins ?? []).some((x) => x.published_id === p.published_id),
      mine: p.author_id === viewer_id,
    })),
    money: {
      grid: grid ? { grid_id: grid.grid_id, slug: grid.slug, name: grid.name } : null,
      product: product ? { product_id: product.product_id, title: product.name } : null,
      proposal: proposal ? { proposal_id: proposal.proposal_id, title: proposal.title, status: proposal.status, ask: proposal.ask_amount } : null,
      audit: audit ? { audit_id: audit.audit_id, status: audit.status } : null,
      market: market ? { market_id: market.market_id, symbol: market.base_symbol, stage: market.stage } : null,
      eligibility: grid ? Markets.canLaunch(grid.grid_id) : null,
      hired: (ws.hired ?? []).map((h) => {
        const j = db.jobs.find((x) => x.job_id === h.job_id);
        return { ...h, status: j?.status ?? "open", reward: j?.reward_amount ?? 0 };
      }),
    },
    engine_ready: engineAvailable(),
    engine_mode: engineMode(), // "acp" = live agent-server (streams every tool call) · "headless" = one-shot
    run_cost: runCost(),
  };
}
