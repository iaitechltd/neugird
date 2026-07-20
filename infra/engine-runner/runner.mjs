#!/usr/bin/env node
/**
 * NeuGrid ENGINE RUNNER — the prod engine host (Phase 7 finish).
 *
 * A dependency-free node service that runs on a small VM next to Cloud Run and
 * drives the self-hosted grok-build binary exactly like the in-app seams do
 * (src/lib/engine/{index,acp}.ts). The app POSTs {instruction, files, opts};
 * the runner materializes a fresh jailed workdir, drives the engine (ACP mode
 * by default — the per-tool-call sealed-trail stream), and answers as an SSE
 * stream: one `ev` frame per engine event, then a single `result` frame carrying
 * the EngineResult plus the changed files' CONTENT (the app writes them back
 * into its own workdir, so studio.ts needs no changes beyond picking the seam).
 *
 * Hardening is a 1:1 port of the 2026-07-20 ACP fixes: no client capabilities
 * advertised (the engine keeps its internal executors + auto-background),
 * method-not-found replies to any incoming request, per-tool-call inactivity
 * watchdog → session/cancel → grace → process-GROUP kill, and a descendant
 * sweep so auto-backgrounded commands can't outlive their run.
 *
 * Env (systemd EnvironmentFile=/opt/neugrid-engine/env):
 *   ENGINE_RUNNER_KEY   shared secret; requests must carry x-engine-key
 *   ENGINE_BIN          path to the compiled binary
 *   GROK_HOME           engine home (config.toml, hooks, skills)
 *   XAI_API_KEY         the hands' key (grok-4.5 native)
 *   PORT                default 8787 (firewalled to the VPC's internal ranges)
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn, execSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const KEY = process.env.ENGINE_RUNNER_KEY || "";
const BIN = process.env.ENGINE_BIN || "/opt/neugrid-engine/bin/grok";
const WORKROOT = process.env.ENGINE_WORKROOT || "/srv/engine-work";
const MAX_CONCURRENT = Number(process.env.ENGINE_MAX_CONCURRENT || 2);
const MAX_BODY = 24 * 1024 * 1024;        // 24MB request cap (files included)
const MAX_FILE_BACK = 2 * 1024 * 1024;    // per-file content cap on the way back

let inFlight = 0;

/* ------------------------------ small helpers ------------------------------ */

const SKIP_DIRS = new Set([".git", "node_modules", ".grok", ".next", "target", "__pycache__"]);

function walk(dir, base, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".DS_")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, base, out); continue; }
    if (!e.isFile()) continue;
    try {
      const buf = fs.readFileSync(full);
      out.set(path.relative(base, full), createHash("sha256").update(buf).digest("hex").slice(0, 16) + ":" + buf.length);
    } catch { /* unreadable — skip */ }
  }
}
const snapshot = (dir) => { const m = new Map(); walk(dir, dir, m); return m; };

function diffSnapshots(before, after, dir) {
  const out = [];
  for (const [p, sig] of after) {
    if (before.get(p) === sig) continue;
    let bytes = 0; try { bytes = fs.statSync(path.join(dir, p)).size; } catch { /* raced */ }
    out.push({ path: p, kind: before.has(p) ? "modified" : "added", bytes });
  }
  for (const p of before.keys()) if (!after.has(p)) out.push({ path: p, kind: "deleted", bytes: 0 });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every live descendant of a pid across process groups (ps walk). */
function descendants(rootPid) {
  try {
    const kids = new Map();
    for (const line of execSync("ps -axo pid=,ppid=", { encoding: "utf8" }).split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) { const pp = +m[2]; if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(+m[1]); }
    }
    const acc = []; const stack = [rootPid];
    while (stack.length) { const p = stack.pop(); for (const k of kids.get(p) ?? []) { acc.push(k); stack.push(k); } }
    return acc;
  } catch { return []; }
}

function parseAcpUsage(result) {
  const u = result?._meta?.usage;
  if (!u) return {};
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const usage = {
    input_tokens: n(u.inputTokens), cache_read_input_tokens: n(u.cachedReadTokens),
    output_tokens: n(u.outputTokens), reasoning_tokens: n(u.reasoningTokens), total_tokens: n(u.totalTokens),
  };
  const ticks = n(u.costUsdTicks);
  const costTrusted = ticks !== undefined && !u.usageIsIncomplete && !u.costIsPartial;
  return {
    usage: Object.values(usage).some((v) => v !== undefined) ? usage : undefined,
    num_turns: n(u.numTurns),
    cost_usd: costTrusted ? ticks / 1e10 : undefined,
  };
}

/* ------------------------------- ACP driver ------------------------------- */
/* Port of src/lib/engine/acp.ts (hardened). onEvent(ev) fires per engine event. */

function runAcp(opts, onEvent) {
  const t0 = Date.now();
  const empty = (error) => ({ ok: false, error, text: "", files_changed: [], duration_ms: Date.now() - t0, exit_code: null });

  const before = snapshot(opts.workdir);
  const args = ["agent", "--always-approve", "-m", opts.model];
  if (opts.effort) args.push("--reasoning-effort", opts.effort);
  args.push("stdio");

  const env = { ...process.env, GROK_DISABLE_AUTOUPDATER: "1", GROK_SANDBOX: "workspace" };
  if (process.env.GROK_HOME) env.GROK_HOME = process.env.GROK_HOME;

  return new Promise((resolve) => {
    let child;
    try { child = spawn(BIN, args, { cwd: opts.workdir, env, stdio: ["pipe", "pipe", "pipe"], detached: true }); }
    catch (e) { resolve(empty(`spawn_failed: ${e?.message ?? "unknown"}`)); return; }

    const textParts = [];
    let stderrTail = "", stdoutBuf = "", done = false, timedOut = false, rpcId = 0;
    let sessionId, wedgedTool = null;
    const pending = new Map(), toolTitle = new Map(), toolTimers = new Map();
    const toolTimeoutMs = opts.tool_timeout_ms ?? 240_000;

    const killTree = (sig, extra = []) => {
      try { if (child.pid) process.kill(-child.pid, sig); else child.kill(sig); }
      catch { try { child.kill(sig); } catch { /* gone */ } }
      for (const p of extra) { try { process.kill(p, sig); } catch { /* gone */ } }
    };
    const finish = (res) => {
      if (done) return; done = true;
      clearTimeout(timer);
      for (const t of toolTimers.values()) clearTimeout(t);
      toolTimers.clear();
      const stragglers = child.pid ? descendants(child.pid) : [];
      killTree("SIGTERM", stragglers);
      setTimeout(() => killTree("SIGKILL", stragglers), 3000).unref();
      resolve(res);
    };
    const timer = setTimeout(() => { timedOut = true; finishFromState("engine_timeout"); }, opts.timeout_ms ?? 600_000);

    function finishFromState(error, promptResult) {
      const after = snapshot(opts.workdir);
      finish({
        ok: !error && !timedOut,
        error: timedOut ? "engine_timeout" : error,
        text: textParts.join(""),
        ...parseAcpUsage(promptResult),
        files_changed: diffSnapshots(before, after, opts.workdir),
        duration_ms: Date.now() - t0,
        exit_code: null,
        stderr_tail: stderrTail || undefined,
      });
    }

    const write = (msg) => { try { child.stdin.write(JSON.stringify(msg) + "\n"); return true; } catch { return false; } };
    const rpc = (method, params) => new Promise((res) => {
      const id = ++rpcId;
      pending.set(id, res);
      if (!write({ jsonrpc: "2.0", id, method, params })) res({ error: { code: -1, message: "write_failed" } });
    });
    const emit = (ev) => { try { onEvent(ev); } catch { /* observer never breaks the run */ } };

    const armToolWatchdog = (id, title) => {
      const prev = toolTimers.get(id);
      if (prev) clearTimeout(prev);
      toolTimers.set(id, setTimeout(() => {
        if (done || wedgedTool) return;
        wedgedTool = title;
        emit({ type: "tool_update", name: title, status: "timeout" });
        if (sessionId) write({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
        setTimeout(() => finishFromState(`tool_timeout: ${title}`), 20_000).unref();
      }, toolTimeoutMs));
    };
    const clearToolWatchdog = (id) => { const t = toolTimers.get(id); if (t) { clearTimeout(t); toolTimers.delete(id); } };

    function onUpdate(u) {
      const kind = u.sessionUpdate;
      if (kind === "agent_message_chunk" && u.content?.text) { textParts.push(u.content.text); emit({ type: "text", data: u.content.text }); }
      else if (kind === "tool_call") {
        const title = u.title || u.kind || "tool";
        const id = u.toolCallId || "";
        const status = u.status || "pending";
        if (id) toolTitle.set(id, title);
        if (id && status !== "completed" && status !== "failed") armToolWatchdog(id, title);
        emit({ type: "tool", name: title, status });
      } else if (kind === "tool_call_update") {
        const id = u.toolCallId || "";
        const status = u.status || "";
        if (status === "completed" || status === "failed") { if (id) clearToolWatchdog(id); emit({ type: "tool_update", name: toolTitle.get(id) || "tool", status }); }
        else if (id) armToolWatchdog(id, toolTitle.get(id) || "tool");
      } else if (kind === "plan") {
        emit({ type: "plan", data: JSON.stringify(u.entries ?? u.plan ?? "") });
      }
    }

    child.stdout.on("data", (d) => {
      stdoutBuf += d.toString();
      let nl;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (typeof m.id === "number" && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        else if (typeof m.id === "number" && typeof m.method === "string") {
          write({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `client method not supported: ${m.method}` } });
        }
        else if (m.method === "session/update" || m.method === "x.ai/session/update") {
          const upd = m.params?.update ?? m.params;
          if (upd) onUpdate(upd);
        }
      }
    });
    child.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    child.on("error", (err) => finish(empty(`spawn_failed: ${err.message}`)));
    child.on("close", () => { if (!done) finishFromState(stderrTail.includes("error") ? "engine_closed" : undefined); });

    (async () => {
      const initR = await rpc("initialize", { protocolVersion: 1, clientCapabilities: {} });
      if (initR.error) return finish(empty(`acp_init_failed: ${initR.error.message}`));
      const sessR = await rpc("session/new", { cwd: opts.workdir, mcpServers: [], _meta: {} });
      sessionId = sessR.result?.sessionId;
      if (!sessionId) return finish(empty(`acp_session_failed: ${sessR.error?.message ?? "no sessionId"}`));
      const promptR = await rpc("session/prompt", { sessionId, prompt: [{ type: "text", text: opts.instruction }] });
      const stop = promptR.result?.stopReason || (promptR.error ? "error" : "end_turn");
      const error = promptR.error ? `acp_prompt_failed: ${promptR.error.message}`
        : wedgedTool ? `tool_timeout: ${wedgedTool}`
        : (stop === "refusal" || stop === "cancelled") ? `stopped_${stop}`
        : undefined;
      finishFromState(error, promptR.result);
    })().catch((e) => finish(empty(`acp_error: ${e?.message ?? "unknown"}`)));
  });
}

/* ----------------------------- headless driver ---------------------------- */
/* Port of src/lib/engine/index.ts — used for the flag-based tiers. */

function runHeadless(opts, onEvent) {
  const t0 = Date.now();
  const empty = (error) => ({ ok: false, error, text: "", files_changed: [], duration_ms: Date.now() - t0, exit_code: null });
  const before = snapshot(opts.workdir);

  const args = [
    "-p", opts.instruction, "--always-approve", "--cwd", opts.workdir,
    "--output-format", "streaming-json", "--sandbox", "workspace", "--no-auto-update",
    "--max-turns", String(opts.max_turns ?? 40), "-m", opts.model,
  ];
  if (opts.quality === "verified") args.push("--check");
  if (opts.quality === "best3") args.push("--best-of-n", "3");
  if (opts.effort) args.push("--reasoning-effort", opts.effort);
  if (opts.memory) args.push("--experimental-memory");
  if (!opts.allow_web) args.push("--disallowed-tools", "web_search,web_fetch");

  const env = { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" };
  if (process.env.GROK_HOME) env.GROK_HOME = process.env.GROK_HOME;

  return new Promise((resolve) => {
    let child;
    try { child = spawn(BIN, args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true }); }
    catch (e) { resolve(empty(`spawn_failed: ${e?.message ?? "unknown"}`)); return; }

    const textParts = [];
    let endEvent = null, stderrTail = "", stdoutBuf = "", timedOut = false;
    const killTree = (sig, extra = []) => {
      try { if (child.pid) process.kill(-child.pid, sig); else child.kill(sig); }
      catch { try { child.kill(sig); } catch { /* gone */ } }
      for (const p of extra) { try { process.kill(p, sig); } catch { /* gone */ } }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      const stragglers = child.pid ? descendants(child.pid) : [];
      killTree("SIGTERM", stragglers);
      setTimeout(() => killTree("SIGKILL", stragglers), 10_000).unref();
    }, opts.timeout_ms ?? 600_000);

    child.stdout.on("data", (d) => {
      stdoutBuf += d.toString();
      let nl;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "text" && typeof ev.data === "string") textParts.push(ev.data);
          if (ev.type === "end" || ev.type === "error") endEvent = ev;
          try { onEvent(ev); } catch { /* observer */ }
        } catch { /* noise */ }
      }
    });
    child.stderr.on("data", (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const after = snapshot(opts.workdir);
      const e = endEvent ?? {};
      resolve({
        ok: code === 0 && !timedOut,
        error: timedOut ? "engine_timeout" : code !== 0 ? (e.message || `engine_exit_${code}`) : undefined,
        text: textParts.join(""),
        session_id: e.sessionId, num_turns: e.num_turns, usage: e.usage,
        cost_usd: typeof e.total_cost_usd === "number" ? e.total_cost_usd : undefined,
        files_changed: diffSnapshots(before, after, opts.workdir),
        duration_ms: Date.now() - t0, exit_code: code,
        stderr_tail: stderrTail || undefined,
      });
    });
    child.on("error", (err) => { clearTimeout(timer); resolve(empty(`spawn_failed: ${err.message}`)); });
  });
}

/* --------------------------------- server --------------------------------- */

const authOk = (req) => {
  if (!KEY) return false;
  const got = Buffer.from(String(req.headers["x-engine-key"] ?? ""));
  const want = Buffer.from(KEY);
  return got.length === want.length && timingSafeEqual(got, want);
};

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    let version = "unknown";
    try { version = execSync(`"${BIN}" --version`, { encoding: "utf8", timeout: 10_000 }).trim(); } catch { /* not fatal */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, version, busy: inFlight, host: os.hostname() }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/run") { res.writeHead(404).end(); return; }
  if (!authOk(req)) { res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" })); return; }
  if (inFlight >= MAX_CONCURRENT) { res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: "busy" })); return; }

  let body = "";
  let over = false;
  req.on("data", (d) => { body += d; if (body.length > MAX_BODY && !over) { over = true; res.writeHead(413).end(); req.destroy(); } });
  req.on("end", async () => {
    if (over) return;
    let p;
    try { p = JSON.parse(body); } catch { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad_json" })); return; }
    if (!p?.instruction?.trim() || !p?.model) { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "instruction_and_model_required" })); return; }

    inFlight++;
    const runId = "run_" + Date.now().toString(36) + "_" + randomBytes(3).toString("hex");
    const workdir = path.join(WORKROOT, runId);
    fs.mkdirSync(workdir, { recursive: true });
    // materialize the shipped files into the jailed workdir (no path escapes)
    for (const f of Array.isArray(p.files) ? p.files : []) {
      if (typeof f?.path !== "string" || typeof f?.content !== "string") continue;
      const full = path.resolve(workdir, f.path);
      if (!full.startsWith(workdir + path.sep) && full !== workdir) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, f.content);
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const frame = (event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone — run continues */ } };
    const keepalive = setInterval(() => { try { res.write(": ka\n\n"); } catch { /* gone */ } }, 15_000);

    const opts = {
      workdir,
      instruction: String(p.instruction),
      model: String(p.model),
      quality: p.quality, effort: p.effort, memory: !!p.memory,
      max_turns: p.max_turns, timeout_ms: p.timeout_ms, tool_timeout_ms: p.tool_timeout_ms,
      allow_web: !!p.allow_web,
    };
    const useAcp = p.mode !== "headless";
    try {
      const result = await (useAcp ? runAcp(opts, (ev) => frame("ev", ev)) : runHeadless(opts, (ev) => frame("ev", ev)));
      // ship changed-file CONTENT back (added/modified only; deletes are paths)
      const files = result.files_changed.map((f) => {
        if (f.kind === "deleted") return f;
        let content;
        try { const buf = fs.readFileSync(path.join(workdir, f.path)); if (buf.length <= MAX_FILE_BACK) content = buf.toString("utf8"); } catch { /* raced */ }
        return { ...f, content };
      });
      frame("result", { ...result, files_changed: files });
    } catch (e) {
      frame("result", { ok: false, error: `runner_error: ${e?.message ?? "unknown"}`, text: "", files_changed: [], duration_ms: 0, exit_code: null });
    } finally {
      clearInterval(keepalive);
      try { res.end(); } catch { /* gone */ }
      inFlight--;
      fs.rm(workdir, { recursive: true, force: true }, () => { /* workspace state lives app-side */ });
    }
  });
});

fs.mkdirSync(WORKROOT, { recursive: true });
server.listen(PORT, () => console.log(`neugrid engine runner on :${PORT} (bin=${BIN}, max ${MAX_CONCURRENT} concurrent)`));
