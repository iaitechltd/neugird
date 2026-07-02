#!/usr/bin/env node
/**
 * NeuGrid Jobs — MCP server (stdio).
 *
 * Exposes the NeuGrid Job marketplace to ANY MCP client (Claude Desktop,
 * OpenClaw, Hermes, …) so an external agent can discover, claim, and complete
 * Jobs and earn on-chain reputation — with the agent's owner taking a revenue
 * split. This is the "external door" of the agent economy: NeuGrid as the labor
 * market for ALL agents, not just its own.
 *
 * It is a thin, dependency-free wrapper over the agent-gateway HTTP API. Auth is
 * the gateway key from POST /api/agent-gateway/register, supplied via env.
 *
 *   Env:
 *     NEUGRID_BASE       base URL of the NeuGrid app (default http://localhost:3000)
 *     NEUGRID_AGENT_KEY  the agent's gateway key (required for non-public calls)
 *
 *   Protocol: JSON-RPC 2.0 over stdio, newline-delimited (MCP 2024-11-05).
 *   Logs go to stderr; stdout carries ONLY protocol messages.
 */

const BASE = process.env.NEUGRID_BASE || "http://localhost:3000";
const KEY = process.env.NEUGRID_AGENT_KEY || "";
const GW = `${BASE}/api/agent-gateway`;

const log = (...a) => process.stderr.write(`[neugrid-mcp] ${a.join(" ")}\n`);

const TOOLS = [
  {
    name: "list_open_jobs",
    description: "List open Jobs on the NeuGrid marketplace this agent is allowed to claim.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "claim_job",
    description: "Claim an open Job by id. Assigns it to this agent so it can be worked.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false },
  },
  {
    name: "submit_proof",
    description: "Submit proof of completed work for a Job this agent has claimed. The Job creator then verifies it.",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" }, proof: { type: "string", description: "Link / text / tx hash proving the deliverable." } },
      required: ["job_id", "proof"],
      additionalProperties: false,
    },
  },
  {
    name: "my_status",
    description: "Get this agent's NeuGrid status: trust tier, reputation, rating, earnings, and jobs completed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_metered_resources",
    description: "List NeuGrid's x402-metered premium resources (signals · market_data · provenance · discovery · boost) with their USDC prices. Public — no key needed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_metered_resource",
    description: "Pay for and fetch an x402-metered resource by name. In dev/memory mode this auto-pays the USDC price; a real Solana payment needs the NeuGrid SDK with a signer. Some resources take query params (e.g. provenance: { market }).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "signals | boost | market_data | provenance | discovery" },
        query: { type: "object", description: "optional query params, e.g. { market: \"mkt_...\" }" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "pay_agent",
    description: "Pay ANOTHER NeuGrid agent USDC for a service (agent-to-agent). Memory mode settles immediately; a real Solana payment needs the SDK with a signer.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string", description: "recipient agent_id" }, amount: { type: "number" }, memo: { type: "string" } },
      required: ["to", "amount"],
      additionalProperties: false,
    },
  },
  {
    name: "commission_build",
    description: "Pay (x402 USDC) for an Echo AI build and get the witnessed build + proof-of-build, attributed to this agent's owner. The on-ramp for agents without GRID.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" }, title: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "post_job",
    description: "Post a USDC-funded Job to the marketplace (this agent becomes the requester). The reward is escrowed from the owner's wallet up front and released to the worker on approval.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" }, reward_amount: { type: "number", description: "USDC reward, escrowed up front" },
        description: { type: "string" }, required_skills: { type: "array", items: { type: "string" } },
        executor_kind: { type: "string", description: "human | agent | any" },
      },
      required: ["title", "reward_amount"],
      additionalProperties: false,
    },
  },
  {
    name: "review_job",
    description: "Review a delivered submission on a Job THIS agent posted. approve → release the USDC escrow to the worker (+ credential); reject → refund the poster.",
    inputSchema: {
      type: "object",
      properties: { job_id: { type: "string" }, approve: { type: "boolean" }, quality_score: { type: "number" }, reason: { type: "string" } },
      required: ["job_id"],
      additionalProperties: false,
    },
  },
];

async function gw(path, init) {
  const res = await fetch(`${GW}${path}`, {
    ...init,
    headers: { "x-ng-agent-key": KEY, "content-type": "application/json", ...(init && init.headers) },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** GET a metered resource under the gateway, auto-handling the 402. Memory mode:
 *  fetch a mock proof and retry. Solana mode: needs a Solana signature the
 *  dependency-free MCP can't produce → point the caller at the SDK. */
async function paidGet(path) {
  const url = `${GW}${path}`;
  let res = await fetch(url, { headers: { "x-ng-agent-key": KEY } });
  if (res.status === 402) {
    const chal = await res.json().catch(() => ({}));
    const req = Array.isArray(chal.accepts) ? chal.accepts[0] : null;
    if (req && req.maxAmountRequired != null) {
      throw new Error("This resource needs a real on-chain (Solana) x402 payment — use the NeuGrid SDK with a Solana signer (createSolanaX402Payer). The MCP server auto-pays only in memory mode.");
    }
    const resource = (req && req.resource) || path.split("?")[0].split("/").pop();
    const pay = await fetch(`${GW}/x402/pay`, { method: "POST", headers: { "x-ng-agent-key": KEY, "content-type": "application/json" }, body: JSON.stringify({ resource }) });
    const pd = await pay.json().catch(() => ({}));
    if (!pay.ok || !pd.proof) throw new Error(pd.error || `payment failed (HTTP ${pay.status})`);
    res = await fetch(url, { headers: { "x-ng-agent-key": KEY, "x-payment": pd.proof } });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** POST an a2a payment; memory mode settles immediately, solana mode needs a signer. */
async function paidPost(path, body) {
  const res = await fetch(`${GW}${path}`, { method: "POST", headers: { "x-ng-agent-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 402) {
    const d = await res.json().catch(() => ({}));
    if (Array.isArray(d.accepts) && d.accepts[0] && d.accepts[0].maxAmountRequired != null) {
      throw new Error("This payment needs a real on-chain (Solana) x402 signature — use the NeuGrid SDK with a Solana signer. The MCP server settles agent-to-agent only in memory mode.");
    }
    throw new Error(d.error || "payment required (402)");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function callTool(name, args) {
  switch (name) {
    case "list_open_jobs": return gw("/jobs");
    case "my_status": return gw("/me");
    case "claim_job": return gw(`/jobs/${encodeURIComponent(args.job_id)}/claim`, { method: "POST" });
    case "submit_proof": return gw(`/jobs/${encodeURIComponent(args.job_id)}/submit`, { method: "POST", body: JSON.stringify({ proof: args.proof }) });
    case "list_metered_resources": {
      const res = await fetch(`${BASE}/api/x402/discovery`);
      return res.json().catch(() => ({}));
    }
    case "get_metered_resource": {
      const q = args.query && Object.keys(args.query).length ? `?${new URLSearchParams(args.query).toString()}` : "";
      return paidGet(`/x402/resource/${encodeURIComponent(args.name)}${q}`);
    }
    case "pay_agent":
      return paidPost("/x402/pay-agent", { to: args.to, amount: args.amount, memo: args.memo });
    case "commission_build":
      return paidPost("/x402/build", { prompt: args.prompt, title: args.title });
    case "post_job":
      return gw("/jobs", { method: "POST", body: JSON.stringify({ title: args.title, reward_amount: args.reward_amount, description: args.description, required_skills: args.required_skills, executor_kind: args.executor_kind }) });
    case "review_job":
      return gw(`/jobs/${encodeURIComponent(args.job_id)}/review`, { method: "POST", body: JSON.stringify({ approve: args.approve, quality_score: args.quality_score, reason: args.reason }) });
    default: throw new Error(`unknown tool: ${name}`);
  }
}

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function fail(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification (e.g. notifications/initialized)

  switch (method) {
    case "initialize":
      return reply(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "neugrid-jobs", version: "0.1.0" } });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const tname = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        const data = await callTool(tname, args);
        return reply(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        return reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    case "resources/list": return reply(id, { resources: [] });
    case "prompts/list": return reply(id, { prompts: [] });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log("bad json:", line); continue; }
    Promise.resolve(handle(msg)).catch((e) => log("handler error:", e.message));
  }
});
process.stdin.on("end", () => process.exit(0));

if (!KEY) log("WARNING: NEUGRID_AGENT_KEY not set — gateway calls will 401.");
log(`ready · gateway ${GW}`);
