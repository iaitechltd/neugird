/**
 * REMOTE engine seam — the Phase-7 prod runner transport. Cloud Run has no
 * engine binary, so when NEUGRID_ENGINE_REMOTE_URL is set (and no local binary
 * exists) runs ride the engine-runner VM (infra/engine-runner/runner.mjs):
 *
 *   POST /run {instruction, model, files, opts…}  →  SSE stream:
 *     event: ev      one frame per engine event (same shapes the local seams emit)
 *     event: result  the EngineResult + changed-file CONTENT
 *
 * The transport materializes the SAME workdir the local seam would have used
 * (studio's materialize() already wrote it — skills/plugins/rules/gate marker
 * included), ships those files up, forwards every streamed event to on_event,
 * then writes the changed files back into the local workdir. To the caller it
 * is indistinguishable from a local run — studio.ts only picks the seam.
 *
 * Security: the runner listens on the VPC's internal ranges only (firewalled)
 * + a shared secret header; Cloud Run reaches it via Direct VPC egress.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { EngineResult, EngineRunOpts, EngineEvent, EngineFileChange } from "./index";

const SHIP_SKIP = new Set([".git", "node_modules", ".next", "target", "__pycache__"]);
const SHIP_FILE_MAX = 1024 * 1024;        // per-file cap on the way up
const SHIP_TOTAL_MAX = 16 * 1024 * 1024;  // whole-workdir cap

/** The remote runner's address + key, when configured. */
export function engineRemote(): { url: string; key: string } | null {
  const url = (process.env.NEUGRID_ENGINE_REMOTE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.NEUGRID_ENGINE_REMOTE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/** Everything the engine needs to see, including .grok (skills/plugins/config/
 *  gate marker) — unlike the snapshot walk, which deliberately ignores .grok. */
function collectForShip(dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  let total = 0;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".DS_")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SHIP_SKIP.has(e.name)) walk(full); continue; }
      if (!e.isFile()) continue;
      try {
        const buf = fs.readFileSync(full);
        if (buf.length > SHIP_FILE_MAX || total + buf.length > SHIP_TOTAL_MAX) continue;
        total += buf.length;
        out.push({ path: path.relative(dir, full), content: buf.toString("utf8") });
      } catch { /* unreadable — skip */ }
    }
  };
  walk(dir);
  return out;
}

/** Drive one engine run on the remote runner. Same contract as the local seams:
 *  always resolves; errors land in the result. */
export async function runEngineBuildRemote(opts: EngineRunOpts, mode: "acp" | "headless"): Promise<EngineResult> {
  const t0 = Date.now();
  const empty = (error: string): EngineResult => ({ ok: false, error, text: "", files_changed: [], duration_ms: Date.now() - t0, exit_code: null, events: [] });

  const remote = engineRemote();
  if (!remote) return empty("engine_unavailable");
  if (!opts.instruction?.trim()) return empty("empty_instruction");

  fs.mkdirSync(opts.workdir, { recursive: true });
  const model = opts.model || process.env.NEUGRID_ENGINE_MODEL || "neugrid-claude";
  const events: EngineEvent[] = [];
  const emit = (ev: EngineEvent) => { events.push(ev); if (opts.on_event) { try { opts.on_event(ev); } catch { /* observer errors never break the run */ } } };

  // the runner enforces the real timeouts; ours is a safety net over the wire
  const ctl = new AbortController();
  const wire = setTimeout(() => ctl.abort(), (opts.timeout_ms ?? 600_000) + 60_000);

  let res: Response;
  try {
    res = await fetch(`${remote.url}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-engine-key": remote.key },
      body: JSON.stringify({
        instruction: opts.instruction,
        model,
        files: collectForShip(opts.workdir),
        quality: opts.quality, effort: opts.effort, memory: !!opts.memory,
        max_turns: opts.max_turns, timeout_ms: opts.timeout_ms, tool_timeout_ms: opts.tool_timeout_ms,
        allow_web: !!opts.allow_web,
        mode,
      }),
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(wire);
    return empty(`remote_unreachable: ${e instanceof Error ? e.message : "fetch failed"}`);
  }
  if (res.status === 429) { clearTimeout(wire); return empty("remote_busy"); }
  if (!res.ok || !res.body) { clearTimeout(wire); return empty(`remote_http_${res.status}`); }

  // parse the SSE stream: ev frames → on_event; the result frame ends the run
  type RemoteResult = EngineResult & { files_changed: (EngineFileChange & { content?: string })[] };
  let final: RemoteResult | null = null;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
        const evLine = frame.split("\n").find((l) => l.startsWith("event: "));
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!evLine || !dataLine) continue;
        const kind = evLine.slice(7).trim();
        let data: unknown; try { data = JSON.parse(dataLine.slice(6)); } catch { continue; }
        if (kind === "ev" && data && typeof data === "object") emit(data as EngineEvent);
        else if (kind === "result") final = data as RemoteResult;
      }
      if (final) break;
    }
  } catch (e) {
    clearTimeout(wire);
    if (final === null) return { ...empty(`remote_stream_lost: ${e instanceof Error ? e.message : "read failed"}`), events };
  } finally {
    clearTimeout(wire);
    try { reader.cancel(); } catch { /* closed */ }
  }
  if (!final) return { ...empty("remote_no_result"), events };

  // land the changed files locally so collectFiles()/proofs see the same tree
  const changes: EngineFileChange[] = [];
  for (const f of final.files_changed ?? []) {
    const full = path.resolve(opts.workdir, f.path);
    if (!full.startsWith(path.resolve(opts.workdir) + path.sep)) continue; // jail
    try {
      if (f.kind === "deleted") fs.rmSync(full, { force: true });
      else if (typeof f.content === "string") { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, f.content); }
    } catch { /* best-effort — the diff below reports what landed */ }
    changes.push({ path: f.path, kind: f.kind, bytes: f.bytes });
  }

  return {
    ok: !!final.ok,
    error: final.error,
    text: final.text ?? "",
    session_id: final.session_id,
    num_turns: final.num_turns,
    usage: final.usage,
    cost_usd: final.cost_usd,
    files_changed: changes,
    duration_ms: Date.now() - t0,
    exit_code: final.exit_code ?? null,
    events,
    stderr_tail: final.stderr_tail,
  };
}
