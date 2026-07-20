/**
 * The STOP-GATE — the Studio's "gated" quality tier, built on the engine's
 * 0.2.106 Stop-hook decision control (docs/user-guide/10-hooks.md): a Stop hook
 * may answer {"decision":"block","reason":…} and the agent KEEPS WORKING, with
 * the reason fed back as a user message — "don't stop until it works" as a
 * harness-enforced guarantee instead of a prompt suggestion.
 *
 * Layout (why global): hooks in $GROK_HOME/hooks/*.json are ALWAYS trusted,
 * while per-project .grok/hooks need a folder-trust grant. So we install ONE
 * global gate that exits instantly unless the session's cwd carries the per-run
 * marker `.grok/neugrid-gate.json` — armed by the Studio only for gated-tier
 * runs, disarmed for every other run. Non-gated sessions pay one ~30ms no-op.
 *
 * The gate's checks (v1, dependency-free): workspace non-empty · every .js/.mjs
 * passes `node --check` · index.html not a stub. Self-capped at max_rounds
 * blocks (default 3, under the engine's own 8-continuation cap) so a build that
 * cannot satisfy the gate still ends — and ships with an honest failing note
 * rather than looping forever.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const GATE_VERSION = "ng-stop-gate v1";

/* The hook script — plain node, no deps, no backticks/interpolation (template-safe).
 * Reads the Stop event on stdin; the payload's cwd names the session workspace. */
const GATE_SCRIPT = `#!/usr/bin/env node
// ${GATE_VERSION} — NeuGrid Studio stop-gate (written by src/lib/engine/stopGate.ts; do not edit)
// Global Stop hook: allows instantly unless the workspace carries .grok/neugrid-gate.json.
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const chunks = [];
process.stdin.on("data", (d) => chunks.push(d));
process.stdin.on("end", () => {
  let ev = {};
  try { ev = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { /* no payload */ }
  const cwd = typeof ev.cwd === "string" && ev.cwd ? ev.cwd : typeof ev.workspaceRoot === "string" ? ev.workspaceRoot : "";
  if (!cwd) return process.exit(0);
  const marker = read(path.join(cwd, ".grok", "neugrid-gate.json"));
  if (!marker) return process.exit(0);                                  // not a gated run
  if (ev.reason && ev.reason !== "end_turn") return process.exit(0);    // session-end fire — nothing left to continue
  let maxRounds = 3;
  try { const m = JSON.parse(marker); if (Number.isFinite(m.max_rounds)) maxRounds = m.max_rounds; } catch { /* default */ }
  const statePath = path.join(cwd, ".grok", "neugrid-gate-state.json");
  let state = {};
  try { state = JSON.parse(read(statePath) || "{}"); } catch { /* fresh */ }
  if (!Number.isFinite(state.blocks)) state.blocks = 0;
  if (state.blocks >= maxRounds) return process.exit(0);                // bounded — never loop forever

  const files = [];
  const walk = (dir) => {
    let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full); else if (e.isFile()) files.push(full);
    }
  };
  walk(cwd);
  const block = (reason) => {
    state.blocks += 1;
    try { fs.writeFileSync(statePath, JSON.stringify(state)); } catch { /* best effort */ }
    process.stdout.write(JSON.stringify({ decision: "block", reason: reason + " Fix it, re-verify, and only then finish. (stop-gate check " + state.blocks + "/" + maxRounds + ")" }));
    process.exit(0); // decision JSON on stdout wins over the exit code
  };
  if (files.length === 0) return block("The workspace has no files yet - the app was not written.");
  for (const f of files) {
    if (!f.endsWith(".js") && !f.endsWith(".mjs")) continue;
    const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8", timeout: 15000 });
    if (r.status !== 0) {
      const line = String(r.stderr || "syntax error").split("\\n").slice(0, 2).join(" ").slice(0, 300);
      return block("JavaScript syntax check failed on " + path.relative(cwd, f) + ": " + line + ".");
    }
  }
  const idx = files.find((f) => path.basename(f) === "index.html");
  if (idx) { const c = read(idx) || ""; if (c.trim().length < 100) return block("index.html is nearly empty - the page was not actually built."); }
  process.exit(0); // all checks pass — the engine may finish
});
`;

function engineHome(): string | null {
  return process.env.NEUGRID_ENGINE_HOME || null;
}

/** Install (or refresh) the global gate hook under $GROK_HOME/hooks — idempotent,
 *  content-compared, best-effort. Returns false when there is no engine home. */
export function ensureStopGateInstalled(): boolean {
  const home = engineHome();
  if (!home) return false;
  try {
    const dir = path.join(home, "hooks");
    fs.mkdirSync(dir, { recursive: true });
    const scriptPath = path.join(dir, "neugrid-stop-gate.mjs");
    const jsonPath = path.join(dir, "neugrid-stop-gate.json");
    // absolute node + absolute script: the hook must not depend on the engine's PATH/cwd
    const hookJson = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: `"${process.execPath}" "${scriptPath}"`, timeout: 300 }] }] },
    }, null, 2) + "\n";
    const current = (p: string) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
    if (current(scriptPath) !== GATE_SCRIPT) fs.writeFileSync(scriptPath, GATE_SCRIPT);
    if (current(jsonPath) !== hookJson) fs.writeFileSync(jsonPath, hookJson);
    return true;
  } catch { return false; }
}

/** Arm the gate for ONE run of this workspace (writes the marker the global hook
 *  looks for + resets the block counter). */
export function armStopGate(workdir: string, maxRounds = 3): void {
  try {
    const dir = path.join(workdir, ".grok");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "neugrid-gate.json"), JSON.stringify({ version: GATE_VERSION, max_rounds: maxRounds, armed_at: new Date().toISOString() }));
    fs.rmSync(path.join(dir, "neugrid-gate-state.json"), { force: true });
  } catch { /* best-effort — an unarmed gate degrades to a standard run */ }
}

/** Remove the marker so no later run inherits the gate. */
export function disarmStopGate(workdir: string): void {
  try {
    fs.rmSync(path.join(workdir, ".grok", "neugrid-gate.json"), { force: true });
    fs.rmSync(path.join(workdir, ".grok", "neugrid-gate-state.json"), { force: true });
  } catch { /* already clean */ }
}
