// External-agent door end-to-end (cookie default = usr_neo owns the agent).
const BASE = "http://localhost:3000";
const AGT = "mkt_77da188f"; // spot
const NEXUS = "mkt_nexus";   // futures
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const post = (p, b, h = {}) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(b || {}) }).then(j);
const get = (p, h = {}) => fetch(BASE + p, { headers: h }).then(j);
const n = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);

console.log("== REGISTER external agent (owner = usr_neo) ==");
const reg = await post("/api/agent-gateway/register", { name: "HermesTrader", external_framework: "Hermes", capabilities: ["trading"] });
const key = reg.body?.api_key, agentId = reg.body?.agent_id;
console.log("  ->", reg.status, agentId, "key?", !!key, "trust:", reg.body?.trust_tier);
const AH = { "x-ng-agent-key": key };

console.log("\n== OWNER arms an EXTERNAL mandate on AGT (spot, budget 300, maxPos 150) ==");
const arm = await post(`/api/markets/${AGT}/agent`, { agent_id: agentId, strategy: "external", budget_usdc: 300, max_position_usd: 150, stop_loss_pct: 0.3, daily_loss_cap: 200, duration_hours: 24 });
console.log("  ->", arm.status, "active?", arm.body?.active, "strategy:", arm.body?.mandate?.strategy, "err:", arm.body?.error);

console.log("\n== AGENT reads its mandate (x-ng-agent-key) ==");
const view = await get(`/api/agent-gateway/trade?market_id=${AGT}`, AH);
console.log("  -> active:", view.body?.active, "| remaining:", n(view.body?.mandate?.remaining_budget), "| price:", n(view.body?.market?.price), "| change:", n(view.body?.market?.change), "| feed:", view.body?.actions?.length);

console.log("\n== AGENT trades (its own decisions) ==");
const b1 = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 120, rationale: "my model says accumulate" }, AH);
console.log("  buy 120     ->", b1.status, "ok:", b1.body?.action?.ok, "deployed:", n(b1.body?.mandate?.deployed_usdc), "|", b1.body?.action?.rationale);
const b2 = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 200 }, AH);
console.log("  buy 200     ->", b2.status, "ok:", b2.body?.action?.ok, "BLOCK:", b2.body?.action?.detail, "(expect over_max_position)");
const b3 = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 120 }, AH);
console.log("  buy 120     ->", b3.status, "ok:", b3.body?.action?.ok, "deployed:", n(b3.body?.mandate?.deployed_usdc));
const b4 = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 120 }, AH);
console.log("  buy 120 #4  ->", b4.status, "ok:", b4.body?.action?.ok, "BLOCK:", b4.body?.action?.detail, "(expect over_budget; 240+120>300)");
const s1 = await post("/api/agent-gateway/trade", { market_id: AGT, action: "sell", amount: 50, rationale: "take profit" }, AH);
console.log("  sell 50     ->", s1.status, "ok:", s1.body?.action?.ok, "pnl:", n(s1.body?.action?.pnl), "deployed:", n(s1.body?.mandate?.deployed_usdc));

console.log("\n== AUTH: no key → 401 ==");
const noauth = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 10 });
console.log("  ->", noauth.status, noauth.body?.error);

console.log("\n== Native runner must HOLD an external mandate (owner tick) ==");
const tick = await post(`/api/markets/${AGT}/agent/tick`, {});
console.log("  ->", tick.status, "action:", tick.body?.action?.kind, "|", tick.body?.action?.rationale ?? tick.body?.skipped);

console.log("\n== PERP via external mandate on NEXUS (futures, lev 5) ==");
const armF = await post(`/api/markets/${NEXUS}/agent`, { agent_id: agentId, strategy: "external", budget_usdc: 1000, max_position_usd: 200, max_leverage: 5, duration_hours: 24 });
console.log("  arm        ->", armF.status, "active?", armF.body?.active, "maxLev:", armF.body?.mandate?.max_leverage, "err:", armF.body?.error);
const op = await post("/api/agent-gateway/trade", { market_id: NEXUS, action: "open", side: "long", collateral: 100, leverage: 3, rationale: "breakout long" }, AH);
console.log("  open long  ->", op.status, "ok:", op.body?.action?.ok, "|", op.body?.action?.rationale, "| posCount:", op.body?.mandate ? "(see view)" : "-");
const opOver = await post("/api/agent-gateway/trade", { market_id: NEXUS, action: "open", side: "long", collateral: 100, leverage: 9 }, AH);
console.log("  open lev 9 ->", opOver.status, "ok:", opOver.body?.action?.ok, "BLOCK:", opOver.body?.action?.detail, "(expect over_max_leverage; 9>5)");
const vF = await get(`/api/agent-gateway/trade?market_id=${NEXUS}`, AH);
const pos = vF.body?.positions ?? [];
console.log("  view       -> open positions:", pos.length, pos[0] ? `${pos[0].side} ${pos[0].leverage}x upnl ${n(pos[0].upnl)}` : "");
const cl = await post("/api/agent-gateway/trade", { market_id: NEXUS, action: "close", rationale: "target hit" }, AH);
console.log("  close      ->", cl.status, "ok:", cl.body?.action?.ok, "pnl:", n(cl.body?.action?.pnl), "realized:", n(cl.body?.mandate?.realized_pnl));

console.log("\n== KILL both, then trade after kill → 404 ==");
await post(`/api/markets/${AGT}/agent/stop`, {});
await post(`/api/markets/${NEXUS}/agent/stop`, {});
const after = await post("/api/agent-gateway/trade", { market_id: AGT, action: "buy", amount: 10 }, AH);
console.log("  trade after kill ->", after.status, after.body?.error, "(expect no_active_mandate/404)");
