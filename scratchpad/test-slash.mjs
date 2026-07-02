// Stake slashing: a Verifier flags a launched market fraudulent → trading halts +
// listing stakes forfeited. (Run on VAULT; restore-vault.cjs reverses it after.)
const BASE = "http://localhost:3000";
const MKT = "mkt_73e16f04"; // VAULT (spot, 1 active stake)
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const H = (uid) => (uid ? { cookie: `ng_uid=${uid}` } : {});
const post = (p, b, uid) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json", ...H(uid) }, body: JSON.stringify(b || {}) }).then(j);
const get = (p, uid) => fetch(BASE + p, { headers: H(uid) }).then(j);

const before = await get(`/api/markets/${MKT}`, "usr_trinity");
console.log("BEFORE: status", before.body?.market?.status, "| can_flag(trinity):", before.body?.can_flag, "| trinity active stakes:", (before.body?.my_stakes || []).filter((s) => !s.released).length);

console.log("\n== FOUNDER (usr_neo) tries to flag → blocked ==");
const byFounder = await post(`/api/markets/${MKT}/slash`, { reason: "x" }, "usr_neo");
console.log("  ->", byFounder.status, byFounder.body?.error, "(expect founder_cannot_flag/403)");

console.log("\n== VERIFIER (usr_trinity, non-founder) flags fraud ==");
const flag = await post(`/api/markets/${MKT}/slash`, { reason: "rug evidence: founder drained the LP" }, "usr_trinity");
console.log("  -> ", flag.status, "| slashed GRID:", flag.body?.slashed, "| stakes:", flag.body?.count, "| market status:", flag.body?.market?.status);

console.log("\n== Trading is halted ==");
const trade = await post(`/api/markets/${MKT}/trade`, { side: "buy", amount: 50 }, "usr_neo");
console.log("  spot buy ->", trade.status, trade.body?.error, "(expect inactive)");

console.log("\n== Re-flag blocked ==");
const again = await post(`/api/markets/${MKT}/slash`, {}, "usr_trinity");
console.log("  ->", again.status, again.body?.error, "(expect already_flagged/409)");

console.log("\n== AFTER: trinity sees the slashed stake ==");
const after = await get(`/api/markets/${MKT}`, "usr_trinity");
console.log("  status:", after.body?.market?.status, "| flagged:", after.body?.flagged, "| can_flag:", after.body?.can_flag);
console.log("  slashed stakes:", (after.body?.my_stakes || []).filter((s) => s.slashed).map((s) => `${s.amount} GRID (${s.stage})`));
