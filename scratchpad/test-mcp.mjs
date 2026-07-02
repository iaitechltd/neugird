/* Drives the NeuGrid Jobs MCP server over real stdio JSON-RPC and verifies it
   speaks MCP + proxies to the agent-gateway. Env: MCP_SERVER, NEUGRID_AGENT_KEY,
   JOBID, NEUGRID_BASE. The setup (job + agent key) is done by the bash wrapper. */
import { spawn } from "node:child_process";

const SERVER = process.env.MCP_SERVER;
const KEY = process.env.NEUGRID_AGENT_KEY;
const JOBID = process.env.JOBID;
const BASE = process.env.NEUGRID_BASE || "http://localhost:3000";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };

const child = spawn("node", [SERVER], { env: { ...process.env, NEUGRID_AGENT_KEY: KEY, NEUGRID_BASE: BASE }, stdio: ["pipe", "pipe", "inherit"] });
child.stdout.setEncoding("utf8");

const pending = new Map();
let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});

let idc = 0;
const rpc = (method, params) => new Promise((resolve) => { const id = ++idc; pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
const toolJson = (resp) => { try { return JSON.parse(resp.result.content[0].text); } catch { return null; } };

(async () => {
  const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "harness", version: "1" } });
  ok("initialize → serverInfo neugrid-jobs", init.result?.serverInfo?.name === "neugrid-jobs", init.result?.protocolVersion);
  notify("notifications/initialized", {});

  const list = await rpc("tools/list", {});
  const names = (list.result?.tools || []).map((t) => t.name);
  ok("tools/list → 4 job tools", names.length === 4 && ["list_open_jobs", "claim_job", "submit_proof", "my_status"].every((n) => names.includes(n)), names.join(","));

  const sj = toolJson(await rpc("tools/call", { name: "my_status", arguments: {} }));
  ok("my_status → external + probation", sj?.agent?.origin === "external" && sj?.agent?.trust_tier === "probation", sj?.agent?.agent_id);

  const jj = toolJson(await rpc("tools/call", { name: "list_open_jobs", arguments: {} }));
  ok("list_open_jobs includes the target job", (jj?.jobs || []).some((j) => j.job_id === JOBID), JOBID);

  const cj = toolJson(await rpc("tools/call", { name: "claim_job", arguments: { job_id: JOBID } }));
  ok("claim_job → in_progress as agent", cj?.job?.status === "in_progress" && cj?.job?.assignee_type === "agent");

  const subj = toolJson(await rpc("tools/call", { name: "submit_proof", arguments: { job_id: JOBID, proof: "MCP agent deliverable: results.csv" } }));
  ok("submit_proof → submitted", subj?.job?.status === "submitted");

  const bad = await rpc("tools/call", { name: "claim_job", arguments: { job_id: "job_nope" } });
  ok("claim unknown job → isError", bad.result?.isError === true, bad.result?.content?.[0]?.text?.slice(0, 32));

  const um = await rpc("frobnicate", {});
  ok("unknown method → -32601", um.error?.code === -32601);

  console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}  ${pass} passed, ${fail} failed`);
  child.stdin.end();
  process.exit(fail === 0 ? 0 : 1);
})();
