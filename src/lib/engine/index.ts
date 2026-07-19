/**
 * ENGINE seam — headless Grok Build as NeuGrid's build workshop.
 * (docs/ECHO_STUDIO.md Phase 1; [[echo-studio]] memory.)
 *
 * The open-source Grok Build binary (Apache 2.0, self-compiled, self-hosted) is
 * the agentic BODY — it opens a workspace, writes files, runs commands, reads
 * errors, and fixes them until the work passes. The BRAIN inside is whatever
 * model the config names (Anthropic `messages` backend / OpenAI-compatible /
 * xAI) — minds we rent, the body we own.
 *
 * This seam drives the binary HEADLESS as a subprocess and never touches its
 * internals (upstream snapshots stay painless to absorb). Env-gated, off by
 * default — exactly like the chain seams:
 *   NEUGRID_ENGINE_BIN   absolute path to the compiled `xai-grok-pager` binary
 *   NEUGRID_ENGINE_HOME  GROK_HOME dir holding our config.toml (models, telemetry off)
 *   NEUGRID_ENGINE_MODEL model name from that config (default "neugrid-claude")
 *
 * Safety posture (Phase 1): every run is jailed — `--sandbox workspace` (kernel
 * Seatbelt: writes confined to the run's cwd + the engine home + temp), web
 * tools disabled (hermetic builds), turn- and time-capped, auto-update off.
 * Files changed are detected by SNAPSHOT DIFF of the workdir (content hashes),
 * not by trusting event payloads — robust across upstream versions.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/* --------------------------------- types --------------------------------- */

export interface EngineEvent { type: string; [k: string]: unknown }
export interface EngineUsage { input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number; reasoning_tokens?: number; total_tokens?: number }
export interface EngineFileChange { path: string; kind: "added" | "modified" | "deleted"; bytes: number }
export interface EngineResult {
  ok: boolean;
  error?: string;
  text: string;                    // the agent's final narrative
  session_id?: string;             // resume handle — the Studio's "continue tomorrow"
  num_turns?: number;
  usage?: EngineUsage;
  cost_usd?: number;               // reported only when the server stamped a complete cost
  files_changed: EngineFileChange[];
  duration_ms: number;
  exit_code: number | null;
  events: EngineEvent[];           // the raw step stream — Phase 2 seals this as the action trail
  stderr_tail?: string;
}
export interface EngineRunOpts {
  workdir: string;                 // the jailed workspace the build happens in
  instruction: string;
  model?: string;                  // config.toml model name (default env NEUGRID_ENGINE_MODEL || "neugrid-claude")
  resume_session?: string;         // continue a prior session in the same workspace
  max_turns?: number;              // agentic-turn cap (default 40)
  timeout_ms?: number;             // hard wall-clock cap (default 10 min)
  allow_web?: boolean;             // default false — builds are hermetic
  /** The quality tier (headless-only engine flags): "verified" appends the engine's
   *  self-verification loop (--check); "best3" races the task 3 ways in parallel and
   *  ships the best (--best-of-n 3 — incompatible with resume, callers start fresh). */
  quality?: "standard" | "verified" | "best3";
  effort?: "low" | "medium" | "high"; // --reasoning-effort for the hands' brain
  memory?: boolean;                // --experimental-memory — the workshop remembers across sessions
  on_event?: (ev: EngineEvent) => void; // live step callback (progress UIs, trail capture); errors in it are swallowed
}

/* ------------------------------ availability ------------------------------ */

export function engineBin(): string | null {
  const bin = process.env.NEUGRID_ENGINE_BIN;
  if (!bin) return null;
  try { return fs.existsSync(bin) ? bin : null; } catch { return null; }
}

/** The engine is armed when the compiled binary is reachable. Off by default. */
export function engineAvailable(): boolean {
  return engineBin() !== null;
}

/** Which engine interface to drive (Phase 7). "acp" = the persistent agent-server
 *  that streams every tool call (the sealed-trail moat); "headless" = the one-shot
 *  `-p` subprocess (the proven default). Opt in with NEUGRID_ENGINE_MODE=acp. */
export function engineMode(): "acp" | "headless" {
  return (process.env.NEUGRID_ENGINE_MODE || "").trim().toLowerCase() === "acp" ? "acp" : "headless";
}

/* ------------------------- workspace snapshot diff ------------------------- */

const SKIP_DIRS = new Set([".git", "node_modules", ".grok", ".next", "target", "__pycache__"]);

function walk(dir: string, base: string, out: Map<string, string>): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".DS_")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, base, out);
      continue;
    }
    if (!e.isFile()) continue;
    try {
      const buf = fs.readFileSync(full);
      out.set(path.relative(base, full), createHash("sha256").update(buf).digest("hex").slice(0, 16) + ":" + buf.length);
    } catch { /* unreadable — skip */ }
  }
}

export function snapshot(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  walk(dir, dir, m);
  return m;
}

export function diffSnapshots(before: Map<string, string>, after: Map<string, string>, dir: string): EngineFileChange[] {
  const out: EngineFileChange[] = [];
  for (const [p, sig] of after) {
    const prev = before.get(p);
    if (prev === sig) continue;
    let bytes = 0;
    try { bytes = fs.statSync(path.join(dir, p)).size; } catch { /* raced */ }
    out.push({ path: p, kind: prev === undefined ? "added" : "modified", bytes });
  }
  for (const p of before.keys()) if (!after.has(p)) out.push({ path: p, kind: "deleted", bytes: 0 });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/* --------------------------------- the run --------------------------------- */

/** Drive one headless engine run in a jailed workspace. Resolves always — errors land in the result. */
export async function runEngineBuild(opts: EngineRunOpts): Promise<EngineResult> {
  const t0 = Date.now();
  const empty = (error: string): EngineResult => ({ ok: false, error, text: "", files_changed: [], duration_ms: Date.now() - t0, exit_code: null, events: [] });

  const bin = engineBin();
  if (!bin) return empty("engine_unavailable");
  if (!opts.instruction?.trim()) return empty("empty_instruction");

  fs.mkdirSync(opts.workdir, { recursive: true });
  const before = snapshot(opts.workdir);

  const model = opts.model || process.env.NEUGRID_ENGINE_MODEL || "neugrid-claude";
  const args = [
    "-p", opts.instruction,
    "--always-approve",                        // unattended — the jail + caps are the guardrails (canonical name; upstream dropped the --yolo alias 2026-07-19)
    "--cwd", opts.workdir,
    "--output-format", "streaming-json",
    "--sandbox", "workspace",                  // kernel-enforced: writes confined to cwd + engine home + temp
    "--no-auto-update",
    "--max-turns", String(opts.max_turns ?? 40),
    "-m", model,
  ];
  if (opts.quality === "verified") args.push("--check");            // the engine's own self-verification loop
  if (opts.quality === "best3") args.push("--best-of-n", "3");      // race 3 candidates, ship the best
  if (opts.effort) args.push("--reasoning-effort", opts.effort);
  if (opts.memory) args.push("--experimental-memory");
  if (!opts.allow_web) args.push("--disallowed-tools", "web_search,web_fetch");
  // best-of-n races FRESH candidates — a resumed session can't fork 3 ways
  if (opts.resume_session && opts.quality !== "best3") args.push("--resume", opts.resume_session);

  const env: NodeJS.ProcessEnv = { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" };
  if (process.env.NEUGRID_ENGINE_HOME) env.GROK_HOME = process.env.NEUGRID_ENGINE_HOME;

  return await new Promise<EngineResult>((resolve) => {
    const child = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const events: EngineEvent[] = [];
    const textParts: string[] = [];
    let endEvent: Record<string, unknown> | null = null;
    let stderrTail = "";
    let stdoutBuf = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");                    // session state is saved up to the last completed tool call
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, opts.timeout_ms ?? 600_000);

    child.stdout.on("data", (d: Buffer) => {
      stdoutBuf += d.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as EngineEvent;
          events.push(ev);
          if (ev.type === "text" && typeof ev.data === "string") textParts.push(ev.data);
          if (ev.type === "end" || ev.type === "error") endEvent = ev as Record<string, unknown>;
          if (opts.on_event) { try { opts.on_event(ev); } catch { /* observer errors never break the run */ } }
        } catch { /* non-JSON noise on stdout — ignore */ }
      }
    });
    child.stderr.on("data", (d: Buffer) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });

    child.on("close", (code) => {
      clearTimeout(timer);
      const after = snapshot(opts.workdir);
      const e = (endEvent ?? {}) as { sessionId?: string; num_turns?: number; usage?: EngineUsage; total_cost_usd?: number; message?: string };
      resolve({
        ok: code === 0 && !timedOut,
        error: timedOut ? "engine_timeout" : code !== 0 ? (e.message || `engine_exit_${code}`) : undefined,
        text: textParts.join(""),
        session_id: e.sessionId,
        num_turns: e.num_turns,
        usage: e.usage,
        cost_usd: typeof e.total_cost_usd === "number" ? e.total_cost_usd : undefined,
        files_changed: diffSnapshots(before, after, opts.workdir),
        duration_ms: Date.now() - t0,
        exit_code: code,
        events,
        stderr_tail: stderrTail || undefined,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve(empty(`spawn_failed: ${err.message}`));
    });
  });
}
