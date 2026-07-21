/**
 * ACP engine seam — the engine as a PERSISTENT agent-server (docs/ECHO_STUDIO.md
 * Phase 7). Where the headless `-p` seam (../index.ts) runs one shot and reports
 * only narration + the final result, the engine's `agent stdio` mode speaks the
 * Agent Client Protocol (JSON-RPC 2.0 over stdio) and STREAMS every step:
 *   agent_message_chunk · agent_thought_chunk · tool_call · tool_call_update · plan
 *
 * That per-tool-call stream is the sealed-trail moat (Phase 6d): the Studio turns
 * each `tool_call` into a witnessed trail event — "a receipt, not a claim" at the
 * granularity of every read, write, and command the engine makes.
 *
 * HARDENED (2026-07-20) after a build wedged 15 min on one terminal command. Root
 * cause: v1 advertised clientCapabilities {fs, terminal:true} without implementing
 * them — the engine DELEGATES those to the client when advertised (agent_ops.rs
 * `use_acp_fs` / `AcpTerminalRunner`), so its `terminal/create` request waited
 * forever on a reply we never sent. The guards now:
 *   1. Advertise NO client capabilities → the engine uses its internal executors,
 *      which carry their own safety (120s default command timeout; a stuck
 *      foreground command auto-backgrounds after ~15s instead of blocking).
 *   2. Any request the agent still sends us gets an immediate JSON-RPC
 *      method-not-found error — nothing can wait on us indefinitely.
 *   3. A per-tool-call inactivity watchdog (opts.tool_timeout_ms, default 4 min):
 *      a tool with no status update for that long triggers `session/cancel`
 *      (the engine SIGKILLs the command's process group and resolves the prompt
 *      `cancelled` — verified in tasks_cancel.rs/terminal.rs), then a hard
 *      process-tree kill if even the cancel goes unanswered.
 *   4. The engine is spawned in its own process group and killed BY GROUP, so
 *      auto-backgrounded commands can't outlive the run as orphans.
 * Also parsed now: the prompt response's `_meta.usage` (tokens, numTurns,
 * costUsdTicks at 1e10/$) → EngineResult usage/num_turns/cost_usd, so ACP runs
 * report real $ like headless ones.
 *
 * Default mode via NEUGRID_ENGINE_MODE (see engineMode()). Same EngineResult
 * contract, same kernel jail (GROK_SANDBOX=workspace env — agent mode has no
 * --sandbox flag; the sandbox profile resolves from that env var). No --max-turns
 * equivalent exists on `grok agent` (headless-only flag) — the wall timeout and
 * the watchdog are the runaway guards.
 *
 * v1 scope still: one prompt turn per run (fresh session — the workdir files ARE
 * the state, re-read each session). Warm-session resume (session/load), quality
 * tiers (best-of-n), and the prod deployment are follow-ons.
 */

import { spawn, execSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import { engineBin, snapshot, diffSnapshots, type EngineResult, type EngineRunOpts, type EngineEvent, type EngineUsage } from "./index";

interface Rpc { jsonrpc: "2.0"; id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { code: number; message: string } }

/** Tokens/turns/cost from the prompt response's `_meta.usage` (PromptUsage wire:
 *  camelCase; cost in USD ticks, 1e10 = $1, trusted only when the ledger says
 *  complete — absence means unknown, not free). */
function parseAcpUsage(result?: Record<string, unknown>): { usage?: EngineUsage; num_turns?: number; cost_usd?: number } {
  const meta = result?._meta as Record<string, unknown> | undefined;
  const u = meta?.usage as Record<string, unknown> | undefined;
  if (!u) return {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const usage: EngineUsage = {
    input_tokens: n(u.inputTokens),
    cache_read_input_tokens: n(u.cachedReadTokens),
    output_tokens: n(u.outputTokens),
    reasoning_tokens: n(u.reasoningTokens),
    total_tokens: n(u.totalTokens),
  };
  const ticks = n(u.costUsdTicks);
  const costTrusted = ticks !== undefined && !u.usageIsIncomplete && !u.costIsPartial;
  return {
    usage: Object.values(usage).some((v) => v !== undefined) ? usage : undefined,
    num_turns: n(u.numTurns),
    cost_usd: costTrusted ? ticks / 1e10 : undefined,
  };
}

/** Drive one ACP build turn in a jailed workspace. Resolves always — errors land
 *  in the result (mirrors runEngineBuild). Emits `tool` events for each tool call. */
export async function runEngineBuildAcp(opts: EngineRunOpts): Promise<EngineResult> {
  const t0 = Date.now();
  const empty = (error: string): EngineResult => ({ ok: false, error, text: "", files_changed: [], duration_ms: Date.now() - t0, exit_code: null, events: [] });

  const bin = engineBin();
  if (!bin) return empty("engine_unavailable");
  if (!opts.instruction?.trim()) return empty("empty_instruction");

  fs.mkdirSync(opts.workdir, { recursive: true });
  const before = snapshot(opts.workdir);

  const model = opts.model || process.env.NEUGRID_ENGINE_MODEL || "neugrid-claude";
  const args = ["agent", "--always-approve", "-m", model];
  if (opts.effort) args.push("--reasoning-effort", opts.effort);
  args.push("stdio");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GROK_DISABLE_AUTOUPDATER: "1",
    GROK_SANDBOX: "workspace",                 // the kernel jail — agent mode reads it from env, not a flag
  };
  if (process.env.NEUGRID_ENGINE_HOME) env.GROK_HOME = process.env.NEUGRID_ENGINE_HOME;

  return await new Promise<EngineResult>((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    // own process group (detached) so the kill reaches auto-backgrounded commands too
    try { child = spawn(bin, args, { cwd: opts.workdir, env, stdio: ["pipe", "pipe", "pipe"], detached: true }); }
    catch (e) { resolve(empty(`spawn_failed: ${e instanceof Error ? e.message : "unknown"}`)); return; }

    const events: EngineEvent[] = [];
    const textParts: string[] = [];
    let stderrTail = "";
    let stdoutBuf = "";
    let done = false;
    let timedOut = false;
    let rpcId = 0;
    let sessionId: string | undefined;
    let wedgedTool: string | null = null;      // set when the per-tool watchdog fires
    const pending = new Map<number, (r: Rpc) => void>();
    const toolTitle = new Map<string, string>(); // toolCallId → title, for update lines
    const toolTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const toolTimeoutMs = opts.tool_timeout_ms ?? 240_000;

    /** Every live descendant of the engine, ACROSS process groups — the engine
     *  setsids auto-backgrounded commands into their own groups, so a plain
     *  group-kill leaves them running (observed: a `sleep 600` outliving the run;
     *  upstream lets background tasks live up to 10h). Enumerate while the tree
     *  is still parented, then sweep by pid. */
    const descendants = (rootPid: number): number[] => {
      try {
        const kids = new Map<number, number[]>();
        for (const line of execSync("ps -axo pid=,ppid=", { encoding: "utf8" }).split("\n")) {
          const m = line.trim().match(/^(\d+)\s+(\d+)$/);
          if (m) { const pp = +m[2]; if (!kids.has(pp)) kids.set(pp, []); kids.get(pp)!.push(+m[1]); }
        }
        const acc: number[] = []; const stack = [rootPid];
        while (stack.length) { const p = stack.pop()!; for (const k of kids.get(p) ?? []) { acc.push(k); stack.push(k); } }
        return acc;
      } catch { return []; }
    };
    const killTree = (sig: NodeJS.Signals, extraPids: number[] = []) => {
      try { if (child.pid) process.kill(-child.pid, sig); else child.kill(sig); }
      catch { try { child.kill(sig); } catch { /* already gone */ } }
      for (const p of extraPids) { try { process.kill(p, sig); } catch { /* gone */ } }
    };

    const finish = (res: EngineResult) => {
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
    if (opts.on_start) {
      try { opts.on_start(() => finishFromState("stopped_by_owner")); } // rides the full teardown: cancel → group kill → straggler sweep
      catch { /* observer errors never break the run */ }
    }

    function finishFromState(error?: string, promptResult?: Record<string, unknown>) {
      const after = snapshot(opts.workdir);
      finish({
        ok: !error && !timedOut,
        error: timedOut ? "engine_timeout" : error,
        text: textParts.join(""),
        ...parseAcpUsage(promptResult),
        files_changed: diffSnapshots(before, after, opts.workdir),
        duration_ms: Date.now() - t0,
        exit_code: null,
        events,
        stderr_tail: stderrTail || undefined,
      });
    }

    const write = (msg: Record<string, unknown>) => {
      try { child.stdin.write(JSON.stringify(msg) + "\n"); return true; } catch { return false; }
    };
    const rpc = (method: string, params: Record<string, unknown>): Promise<Rpc> => new Promise((res) => {
      const id = ++rpcId;
      pending.set(id, res);
      if (!write({ jsonrpc: "2.0", id, method, params })) res({ jsonrpc: "2.0", error: { code: -1, message: "write_failed" } });
    });
    const notify = (method: string, params: Record<string, unknown>) => { write({ jsonrpc: "2.0", method, params }); };

    const emit = (ev: EngineEvent) => { events.push(ev); if (opts.on_event) { try { opts.on_event(ev); } catch { /* observer errors never break the run */ } } };

    /** Watchdog: reset on every status update for the tool; fire = graceful cancel
     *  (engine kills the command's process group, prompt resolves "cancelled"),
     *  then a hard finish if even the cancel goes unanswered. */
    const armToolWatchdog = (id: string, title: string) => {
      const prev = toolTimers.get(id);
      if (prev) clearTimeout(prev);
      toolTimers.set(id, setTimeout(() => {
        if (done || wedgedTool) return;
        wedgedTool = title;
        emit({ type: "tool_update", name: title, status: "timeout" });
        if (sessionId) notify("session/cancel", { sessionId });
        setTimeout(() => finishFromState(`tool_timeout: ${title}`), 20_000).unref();
      }, toolTimeoutMs));
    };
    const clearToolWatchdog = (id: string) => {
      const t = toolTimers.get(id);
      if (t) { clearTimeout(t); toolTimers.delete(id); }
    };

    // each session/update notification carries params.update.{sessionUpdate, ...}
    function onUpdate(u: Record<string, unknown>) {
      const kind = u.sessionUpdate as string;
      const content = u.content as { text?: string } | undefined;
      if (kind === "agent_message_chunk" && content?.text) { textParts.push(content.text); emit({ type: "text", data: content.text }); }
      else if (kind === "tool_call") {
        const title = (u.title as string) || (u.kind as string) || "tool";
        const id = (u.toolCallId as string) || "";
        const status = (u.status as string) || "pending";
        if (id) toolTitle.set(id, title);
        if (id && status !== "completed" && status !== "failed") armToolWatchdog(id, title);
        emit({ type: "tool", name: title, status });
      } else if (kind === "tool_call_update") {
        const id = (u.toolCallId as string) || "";
        const status = (u.status as string) || "";
        if (status === "completed" || status === "failed") {
          if (id) clearToolWatchdog(id);
          emit({ type: "tool_update", name: toolTitle.get(id) || "tool", status });
        } else if (id) {
          armToolWatchdog(id, toolTitle.get(id) || "tool"); // any activity = alive; restart its clock
        }
      } else if (kind === "plan") {
        emit({ type: "plan", data: JSON.stringify(u.entries ?? u.plan ?? "") });
      }
    }

    child.stdout.on("data", (d: Buffer) => {
      stdoutBuf += d.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        let m: Rpc; try { m = JSON.parse(line) as Rpc; } catch { continue; }
        if (typeof m.id === "number" && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
        else if (typeof m.id === "number" && typeof m.method === "string") {
          // the agent asked US to do something (fs/terminal/permission/question).
          // We advertise no client capabilities, so answer method-not-found
          // IMMEDIATELY — an unanswered request is exactly how v1 wedged.
          write({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `client method not supported: ${m.method}` } });
        }
        else if (m.method === "session/update" || m.method === "x.ai/session/update") {
          const upd = (m.params?.update ?? m.params) as Record<string, unknown> | undefined;
          if (upd) onUpdate(upd);
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });
    child.on("error", (err) => finish(empty(`spawn_failed: ${err.message}`)));
    child.on("close", () => { if (!done) finishFromState(stderrTail.includes("error") ? "engine_closed" : undefined); });

    // the ACP handshake → session → prompt
    (async () => {
      // NO client capabilities: advertising fs/terminal makes the engine DELEGATE
      // those ops to us as requests (agent_ops.rs use_acp_fs/AcpTerminalRunner).
      // With none advertised it uses its internal executors — which have their own
      // command timeout + auto-background safety the delegated path lacks.
      const initR = await rpc("initialize", { protocolVersion: 1, clientCapabilities: {} });
      if (initR.error) return finish(empty(`acp_init_failed: ${initR.error.message}`));
      const sessR = await rpc("session/new", {
        cwd: opts.workdir,
        mcpServers: [],
        _meta: {}, // rules/systemPromptOverride flow via AGENTS.md on disk (materialize writes it)
      });
      sessionId = sessR.result?.sessionId as string | undefined;
      if (!sessionId) return finish(empty(`acp_session_failed: ${sessR.error?.message ?? "no sessionId"}`));
      const promptR = await rpc("session/prompt", { sessionId, prompt: [{ type: "text", text: opts.instruction }] });
      // the prompt result carries stopReason (end_turn / refusal / max_tokens / cancelled)
      const stop = (promptR.result?.stopReason as string) || (promptR.error ? "error" : "end_turn");
      const error = promptR.error ? `acp_prompt_failed: ${promptR.error.message}`
        : wedgedTool ? `tool_timeout: ${wedgedTool}`
        : (stop === "refusal" || stop === "cancelled") ? `stopped_${stop}`
        : undefined;
      finishFromState(error, promptR.result);
    })().catch((e) => finish(empty(`acp_error: ${e instanceof Error ? e.message : "unknown"}`)));
  });
}
