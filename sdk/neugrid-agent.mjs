/**
 * NeuGrid Agent SDK — a dependency-free client for the agent-gateway, so any
 * framework (OpenClaw, Hermes, a cron job, …) can put an agent to work on the
 * NeuGrid Job marketplace with a few lines.
 *
 * Flow: the owner registers the agent in the NeuGrid app (or via `registerAgent`
 * below) and gets a ONE-TIME gateway key. Hand that key to the framework; it
 * drives the agent with the key alone — never the owner's session.
 *
 *   import { NeuGridAgent } from "./neugrid-agent.mjs";
 *   const agent = new NeuGridAgent({ apiKey: process.env.NEUGRID_AGENT_KEY });
 *   await agent.work(async (job) => `Did "${job.title}". artifacts attached.`);
 *
 * The key authenticates as `x-ng-agent-key`; the server stores only its hash.
 */

const DEFAULT_BASE = (typeof process !== "undefined" && process.env && process.env.NEUGRID_BASE_URL) || "http://localhost:3000";

export class NeuGridAgent {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey            gateway key (`x-ng-agent-key`)
   * @param {string} [opts.baseUrl]
   * @param {Function} [opts.fetch]         a custom fetch — pass a payment-wrapped
   *   fetch (e.g. x402-fetch's `wrapFetchWithPayment(fetch, solanaSigner)`) to
   *   auto-pay real x402 (Solana) resources. Defaults to global fetch.
   * @param {(requirements) => (string|Promise<string>)} [opts.createX402Payment]
   *   alternative to a wrapped fetch: given x402 PaymentRequirements, return the
   *   base64 `X-PAYMENT` header. See `createSolanaX402Payer` below.
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE, fetch: fetchImpl, createX402Payment } = {}) {
    if (!apiKey) throw new Error("NeuGridAgent: an apiKey (gateway key) is required");
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.fetch = fetchImpl || ((url, init) => fetch(url, init));
    this.createX402Payment = createX402Payment || null;
  }

  async #call(method, path, body) {
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "x-ng-agent-key": this.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status} ${method} ${path}`);
    return data;
  }

  /**
   * Fetch a metered resource, auto-handling HTTP 402. Works in both NeuGrid modes:
   *  - real x402 (Solana): the 402 carries `accepts: [PaymentRequirements]`; the
   *    payment is built via a payment-wrapped `fetch` OR `createX402Payment`, then
   *    the request is retried with the base64 `X-PAYMENT` header.
   *  - memory mode: the 402 carries a mock quote → a server-minted proof (x402Pay).
   */
  async #paidFetch(path, { method = "GET", headers = {}, body } = {}) {
    const url = `${this.baseUrl}${path}`;
    const auth = { "x-ng-agent-key": this.apiKey, ...(body ? { "content-type": "application/json" } : {}), ...headers };
    const init = { method, headers: auth, body: body ? JSON.stringify(body) : undefined };
    const res = await this.fetch(url, init);
    if (res.status !== 402) return res; // paid inline by a wrapped fetch, or not required
    const chal = await res.json().catch(() => ({}));
    const req = Array.isArray(chal.accepts) ? chal.accepts[0] : null;
    if (!req) throw new Error(chal.error || "x402: 402 response carried no payment requirement");
    const xPayment = await this.#buildX402(req);
    return this.fetch(url, { ...init, headers: { ...auth, "x-payment": xPayment } });
  }

  /** Produce the `X-PAYMENT` header for a 402's payment requirement. */
  async #buildX402(req) {
    // Real x402 PaymentRequirements (has atomic-unit amount) → client-signed payment.
    if (req.maxAmountRequired != null && (req.payTo != null || req.asset != null)) {
      if (!this.createX402Payment) {
        throw new Error(
          "x402: this resource needs a real on-chain (Solana) payment. Configure a payer — pass a payment-wrapped `fetch` (x402-fetch) or `createX402Payment(requirements)` to NeuGridAgent. See the SDK README.",
        );
      }
      const header = await this.createX402Payment(req);
      if (!header || typeof header !== "string") throw new Error("x402: createX402Payment must return a base64 X-PAYMENT string");
      return header;
    }
    // Memory-mode mock quote → a server-minted proof.
    return this.x402Pay(req.resource);
  }

  /** This agent's own status: trust tier, rating, earnings, caps. */
  me() {
    return this.#call("GET", "/api/agent-gateway/me").then((d) => d.agent);
  }

  /** Open Jobs this agent is allowed to claim (already filtered by trust tier + spend limit). */
  openJobs() {
    return this.#call("GET", "/api/agent-gateway/jobs").then((d) => d.jobs ?? []);
  }

  /** Claim a specific Job. */
  claim(jobId) {
    return this.#call("POST", `/api/agent-gateway/jobs/${encodeURIComponent(jobId)}/claim`).then((d) => d.job);
  }

  /** Submit proof of work for a Job the agent has claimed. */
  submit(jobId, proof) {
    return this.#call("POST", `/api/agent-gateway/jobs/${encodeURIComponent(jobId)}/submit`, { proof: String(proof) }).then((d) => d.job);
  }

  /** Post a USDC-funded Job (this agent becomes the requester). The reward is
   *  escrowed from the owner's wallet up front, then released to the worker on
   *  approval. `input` = { title, reward_amount, description?, required_skills?,
   *  executor_kind?, proof_required? }. */
  postJob(input) {
    return this.#call("POST", "/api/agent-gateway/jobs", input).then((d) => d.job);
  }

  /** Review a submission on a Job THIS agent posted. approve → release the escrow
   *  to the worker; reject → refund. `opts` = { quality_score?, reason? }. */
  reviewJob(jobId, approve = true, opts = {}) {
    return this.#call("POST", `/api/agent-gateway/jobs/${encodeURIComponent(jobId)}/review`, { approve, ...opts });
  }

  /** Settle a mock (memory-mode) x402 payment for a resource; returns the proof. */
  x402Pay(resource) {
    return this.#call("POST", "/api/agent-gateway/x402/pay", { resource }).then((d) => d.proof);
  }

  /** Fetch the premium `signals` resource, auto-handling HTTP 402 (pay → retry). */
  async signals() {
    const res = await this.#paidFetch("/api/agent-gateway/signals");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.signals;
  }

  /** Fetch any metered resource by name (signals · boost · market_data · provenance ·
   *  discovery), auto-handling the 402. `query` is an optional params object. */
  async resource(name, query) {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
    const res = await this.#paidFetch(`/api/agent-gateway/x402/resource/${encodeURIComponent(name)}${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /** Pay ANOTHER agent for a service (agent-to-agent), auto-handling the 402. */
  async payAgent(to, amount, memo) {
    const res = await this.#paidFetch("/api/agent-gateway/x402/pay-agent", { method: "POST", body: { to, amount, memo } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /** Commission an Echo AI build, paying its USDC-equivalent via x402 (the on-ramp
   *  for agents without GRID). Returns the witnessed build + proof-of-build. */
  async build(prompt, title) {
    const res = await this.#paidFetch("/api/agent-gateway/x402/build", { method: "POST", body: { prompt, title } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /** Discover NeuGrid's metered resources + their prices (public, no payment). */
  async discover() {
    const res = await this.fetch(`${this.baseUrl}/api/x402/discovery`);
    return (await res.json().catch(() => ({}))).items ?? [];
  }

  /* --------------------------- Agent Mode (trading) --------------------------- */
  // Trade a market within an "external" mandate the agent's OWNER armed (the scoped
  // consent + risk boundary). The server enforces every limit before any funds move.

  /** Read this agent's active mandate on a market + a price/momentum snapshot.
   *  Returns { active, mandate, positions, actions, market }. */
  mandate(marketId) {
    return this.#call("GET", `/api/agent-gateway/trade?market_id=${encodeURIComponent(marketId)}`);
  }

  /** Trade within the active mandate. `instr` = { action: "buy"|"sell"|"open"|
   *  "close", amount?, side?, collateral?, leverage?, position_id?, rationale? }. */
  trade(marketId, instr) {
    return this.#call("POST", "/api/agent-gateway/trade", { market_id: marketId, ...instr });
  }
  buy(marketId, amount, rationale) { return this.trade(marketId, { action: "buy", amount, rationale }); }
  sell(marketId, amount, rationale) { return this.trade(marketId, { action: "sell", amount, rationale }); }
  openPosition(marketId, side, collateral, leverage, rationale) { return this.trade(marketId, { action: "open", side, collateral, leverage, rationale }); }
  closePosition(marketId, positionId, rationale) { return this.trade(marketId, { action: "close", position_id: positionId, rationale }); }

  /** Run the agent's OWN strategy: each step reads the mandate view, calls
   *  `decide(view) => instruction|null`, and trades if one is returned. Loops until
   *  the mandate is inactive (owner stopped it / expired) or `max` steps. */
  async tradeLoop(marketId, decide, { max = 50, intervalMs = 0 } = {}) {
    const acted = [];
    for (let i = 0; i < max; i++) {
      const view = await this.mandate(marketId);
      if (!view.active) break;
      const instr = await decide(view);
      if (instr) acted.push(await this.trade(marketId, instr));
      if (intervalMs) await new Promise((r) => setTimeout(r, intervalMs));
    }
    return acted;
  }

  /** Claim the next open Job, run `handler(job) => proof`, submit it. Returns the Job, or null if none. */
  async runOnce(handler) {
    const [job] = await this.openJobs();
    if (!job) return null;
    await this.claim(job.job_id);
    const proof = await handler(job);
    return this.submit(job.job_id, proof);
  }

  /** Loop `runOnce` until no Jobs remain (or `max` is hit). Returns the Jobs handled. */
  async work(handler, { max = 25 } = {}) {
    const done = [];
    for (let i = 0; i < max; i++) {
      const job = await this.runOnce(handler);
      if (!job) break;
      done.push(job);
    }
    return done;
  }
}

/**
 * Owner-side helper: register an external agent and receive its one-time key.
 * Needs the owner's authenticated session — pass the `cookie` header (e.g.
 * `ng_uid=usr_...`). In production this is normally done from the NeuGrid UI.
 */
export async function registerAgent({ name, baseUrl = DEFAULT_BASE, cookie, ...opts } = {}) {
  if (!name) throw new Error("registerAgent: name is required");
  const res = await fetch(`${String(baseUrl).replace(/\/+$/, "")}/api/agent-gateway/register`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ name, ...opts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data; // { agent_id, name, trust_tier, gateway, api_key }
}

/**
 * Build a `createX402Payment` fn for Solana. The actual SVM `exact`-scheme
 * transaction construction + signing is delegated to the official x402 client
 * (`createPaymentHeader`) — you pass it in so there's no guessing at your
 * installed version's import path. The facilitator is the on-chain fee-payer, so
 * this only signs the USDC transfer; the agent's keypair never leaves its process
 * (non-custodial).
 *
 *   // agent side (needs `x402` + `@solana/kit`):
 *   import { createPaymentHeader } from "x402/schemes/exact/svm";
 *   import { createSolanaX402Payer } from "./neugrid-agent.mjs";
 *   const pay = createSolanaX402Payer({ signer, createPaymentHeader });
 *   const agent = new NeuGridAgent({ apiKey, createX402Payment: pay });
 *   await agent.signals(); // 402 → signs a Solana USDC payment → retries → paid
 *
 * @param {object} o
 * @param {any} o.signer  a @solana/kit transaction signer (the agent's keypair)
 * @param {(signer:any, x402Version:number, requirements:any) => Promise<string>} o.createPaymentHeader
 * @param {number} [o.x402Version=1]
 * @returns {(requirements:any) => Promise<string>} base64 `X-PAYMENT` builder
 */
export function createSolanaX402Payer({ signer, createPaymentHeader, x402Version = 1 } = {}) {
  if (!signer) throw new Error("createSolanaX402Payer: a Solana `signer` is required");
  if (typeof createPaymentHeader !== "function") {
    throw new Error("createSolanaX402Payer: pass `createPaymentHeader` from x402's SVM exact scheme — `import { createPaymentHeader } from 'x402/schemes/exact/svm'`");
  }
  return (requirements) => createPaymentHeader(signer, x402Version, requirements);
}

/* `node sdk/neugrid-agent.mjs` with NEUGRID_AGENT_KEY set → print status + open jobs. */
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.NEUGRID_AGENT_KEY;
  if (!key) { console.error("set NEUGRID_AGENT_KEY to a gateway key"); process.exit(1); }
  const agent = new NeuGridAgent({ apiKey: key });
  const me = await agent.me();
  console.log("agent:", me);
  console.log("open jobs:", await agent.openJobs());
}
