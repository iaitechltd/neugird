// End-to-end Agent Mode test against the live dev server (cookie default = usr_neo).
const BASE = "http://localhost:3000";
const MKT = "mkt_77da188f"; // AGT (alpha) — DCA does spot buys here
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then(j);
const get = (p) => fetch(BASE + p).then(j);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

console.log("== ARM (DCA, budget 300, max_position 100) ==");
const arm = await post(`/api/markets/${MKT}/agent`, { agent_id: "agent_oracle", budget_usdc: 300, max_position_usd: 100, strategy: "dca", duration_hours: 24, stop_loss_pct: 0.25, daily_loss_cap: 200 });
console.log("  ->", arm.status, "mandate:", arm.body?.mandate?.mandate_id, "err:", arm.body?.error);

console.log("== TICKS (spaced past the 6s rate-limit) ==");
for (let i = 0; i < 5; i++) {
  await sleep(6600);
  const t = await post(`/api/markets/${MKT}/agent/tick`);
  const m = t.body?.state?.mandate;
  console.log(`  tick${i + 1}:`, t.body?.action?.kind ?? `(skip:${t.body?.skipped})`, "|", t.body?.action?.rationale ?? "", "| deployed", m?.deployed_usdc?.toFixed?.(0), "posBase", m?.position_base?.toFixed?.(3), "used%", m?.budget_used_pct);
}

console.log("== STATE ==");
const s = await get(`/api/markets/${MKT}/agent`);
console.log("  active:", s.body?.active, "| trades:", s.body?.mandate?.trades_count, "| realized:", s.body?.mandate?.realized_pnl, "| posValue:", s.body?.mandate?.position_value?.toFixed?.(2), "| feed entries:", s.body?.actions?.length, "| agent trading_rating:", s.body?.agent?.trading_rating);

console.log("== GUARDRAIL: arm a 2nd mandate (replaces the 1st) with bad budget ==");
const bad = await post(`/api/markets/${MKT}/agent`, { agent_id: "agent_oracle", budget_usdc: -5 });
console.log("  ->", bad.status, "err:", bad.body?.error, "(expect bad_budget/400)");

console.log("== GUARDRAIL: not-your-agent ==");
const notmine = await post(`/api/markets/${MKT}/agent`, { agent_id: "agent_DOESNOTEXIST", budget_usdc: 100 });
console.log("  ->", notmine.status, "err:", notmine.body?.error, "(expect agent_not_found/404)");

console.log("== KILL-SWITCH ==");
const k = await post(`/api/markets/${MKT}/agent/stop`);
console.log("  ->", k.status, "stopped:", k.body?.stopped, "| now active?", k.body?.state?.active);

console.log("== TICK after kill (expect 404 no_active_mandate) ==");
const t2 = await post(`/api/markets/${MKT}/agent/tick`);
console.log("  ->", t2.status, "err:", t2.body?.error);
