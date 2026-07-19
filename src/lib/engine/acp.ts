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
 * Opt-in via NEUGRID_ENGINE_MODE=acp; the headless seam stays the default. Same
 * EngineResult contract, same kernel jail (via GROK_SANDBOX=workspace env — agent
 * mode has no --sandbox flag; the sandbox profile resolves from that env var).
 *
 * v1 scope: one prompt turn per run (fresh session — the workdir files ARE the
 * state, re-read each session), tool-call streaming, snapshot-diff file detection,
 * timeout kill. Warm-session resume, quality tiers (best-of-n), and the prod
 * deployment are follow-ons.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import { engineBin, snapshot, diffSnapshots, type EngineResult, type EngineRunOpts, type EngineEvent } from "./index";

interface Rpc { jsonrpc: "2.0"; id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, unknown>; error?: { code: number; message: string } }

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
    try { child = spawn(bin, args, { cwd: opts.workdir, env, stdio: ["pipe", "pipe", "pipe"] }); }
    catch (e) { resolve(empty(`spawn_failed: ${e instanceof Error ? e.message : "unknown"}`)); return; }

    const events: EngineEvent[] = [];
    const textParts: string[] = [];
    let stderrTail = "";
    let stdoutBuf = "";
    let done = false;
    let timedOut = false;
    let rpcId = 0;
    const pending = new Map<number, (r: Rpc) => void>();
    const toolTitle = new Map<string, string>(); // toolCallId → title, for update lines

    const finish = (res: EngineResult) => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { child.kill("SIGTERM"); } catch { /* already gone */ }
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, 3000).unref();
      resolve(res);
    };

    const timer = setTimeout(() => { timedOut = true; finishFromState("engine_timeout"); }, opts.timeout_ms ?? 600_000);

    function finishFromState(error?: string) {
      const after = snapshot(opts.workdir);
      finish({
        ok: !error && !timedOut,
        error: timedOut ? "engine_timeout" : error,
        text: textParts.join(""),
        files_changed: diffSnapshots(before, after, opts.workdir),
        duration_ms: Date.now() - t0,
        exit_code: null,
        events,
        stderr_tail: stderrTail || undefined,
      });
    }

    const rpc = (method: string, params: Record<string, unknown>): Promise<Rpc> => new Promise((res) => {
      const id = ++rpcId;
      pending.set(id, res);
      try { child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); }
      catch { res({ jsonrpc: "2.0", error: { code: -1, message: "write_failed" } }); }
    });

    const emit = (ev: EngineEvent) => { events.push(ev); if (opts.on_event) { try { opts.on_event(ev); } catch { /* observer errors never break the run */ } } };

    // each session/update notification carries params.update.{sessionUpdate, ...}
    function onUpdate(u: Record<string, unknown>) {
      const kind = u.sessionUpdate as string;
      const content = u.content as { text?: string } | undefined;
      if (kind === "agent_message_chunk" && content?.text) { textParts.push(content.text); emit({ type: "text", data: content.text }); }
      else if (kind === "tool_call") {
        const title = (u.title as string) || (u.kind as string) || "tool";
        const id = (u.toolCallId as string) || "";
        if (id) toolTitle.set(id, title);
        emit({ type: "tool", name: title, status: (u.status as string) || "pending" });
      } else if (kind === "tool_call_update") {
        const id = (u.toolCallId as string) || "";
        const status = (u.status as string) || "";
        if (status === "completed" || status === "failed") emit({ type: "tool_update", name: toolTitle.get(id) || "tool", status });
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
      const initR = await rpc("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true } });
      if (initR.error) return finish(empty(`acp_init_failed: ${initR.error.message}`));
      const sessR = await rpc("session/new", {
        cwd: opts.workdir,
        mcpServers: [],
        ...(opts.instruction ? {} : {}),
        _meta: {}, // rules/systemPromptOverride flow via AGENTS.md on disk (materialize writes it)
      });
      const sessionId = sessR.result?.sessionId as string | undefined;
      if (!sessionId) return finish(empty(`acp_session_failed: ${sessR.error?.message ?? "no sessionId"}`));
      const promptR = await rpc("session/prompt", { sessionId, prompt: [{ type: "text", text: opts.instruction }] });
      // the prompt result carries stopReason (end_turn / refusal / max_tokens / cancelled)
      const stop = (promptR.result?.stopReason as string) || (promptR.error ? "error" : "end_turn");
      finishFromState(promptR.error ? `acp_prompt_failed: ${promptR.error.message}` : (stop === "refusal" || stop === "cancelled" ? `stopped_${stop}` : undefined));
    })().catch((e) => finish(empty(`acp_error: ${e instanceof Error ? e.message : "unknown"}`)));
  });
}
