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
import { engineAvailable, runEngineBuild, type EngineEvent } from "../engine";
import * as Wallets from "./wallets";
import * as Params from "./params";
import * as Pulse from "./pulse";
import * as Referrals from "./referrals";
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
}

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
 *  (poll `view()` for progress). One run per workspace at a time. */
export function startRun(workspace_id: string, owner_id: string, instruction: string): RunStart {
  const ws = get(workspace_id);
  if (!ws) return { error: "not_found" };
  if (ws.owner_id !== owner_id) return { error: "not_owner" };
  if (!engineAvailable()) return { error: "engine_unavailable" };
  const ask = instruction.trim();
  if (!ask) return { error: "instruction_required" };
  if (runsInFlight.has(workspace_id) || ws.status === "building") return { error: "busy" };

  // the run's compute bill — debit up front, treasury-credited; refunded on engine failure
  const cost = runCost();
  if (cost > 0) {
    if (!Wallets.debitGrid(owner_id, cost)) return { error: "insufficient_grid", cost, balance: Wallets.balances(owner_id).grid };
    Wallets.creditGrid(Wallets.TREASURY, cost);
  }

  runsInFlight.add(workspace_id);
  ws.status = "building";
  ws.progress = "engine starting…";
  ws.spent_grid = round2(ws.spent_grid + cost);
  pushTurn(ws, { role: "you", text: clip(ask, 600) });
  pushTrail(ws, "run", `directive: ${ask}`);
  ws.updated_at = nowISO();

  // fire-and-forget — the request returns now; the run reports back through the store
  void executeRun(workspace_id, owner_id, ask, cost).catch(() => { /* fully handled inside */ });
  return { ok: true, cost };
}

async function executeRun(workspace_id: string, owner_id: string, ask: string, cost: number): Promise<void> {
  const ws = get(workspace_id);
  if (!ws) { runsInFlight.delete(workspace_id); return; }
  const t0 = Date.now();
  try {
    const build = ws.build_id ? db.builds.find((b) => b.build_id === ws.build_id) : undefined;
    const firstRun = !build;
    materialize(ws, build?.artifact.files ?? []);

    const opts = {
      workdir: workdirOf(ws),
      instruction: brief(ask, firstRun),
      max_turns: 40,
      timeout_ms: 15 * 60_000,
      on_event: (ev: EngineEvent) => {
        if (ev.type === "text" && typeof ev.data === "string" && ev.data.trim()) {
          ws.progress = clip(ev.data.trim(), 160);
          pushTrail(ws, "narrate", ev.data.trim());
        }
      },
    };
    // resume the warm engine session when we have one; a dead handle gets one fresh retry
    let res = await runEngineBuild(ws.engine_session_id ? { ...opts, resume_session: ws.engine_session_id } : opts);
    if (!res.ok && ws.engine_session_id && res.files_changed.length === 0) {
      pushTrail(ws, "run", "stale engine session — retrying fresh");
      res = await runEngineBuild(opts);
    }

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
    ws.status = "idle";
    ws.progress = undefined;
    pushTurn(ws, {
      role: "engine",
      text: clip(res.text.trim() || "Run complete — the app is updated in the preview.", 700),
      version: b.version ?? 1, cost_grid: cost, duration_s, files_changed: res.files_changed.length || files.length,
    });
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
    engine_ready: engineAvailable(),
    run_cost: runCost(),
  };
}
