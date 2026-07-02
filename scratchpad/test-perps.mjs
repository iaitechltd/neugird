// Perp completeness: funding (OI skew) + TP/SL/OCO triggers. Runs on NEXUS (futures).
const BASE = "http://localhost:3000";
const MKT = "mkt_nexus";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then(j);
const get = (p) => fetch(BASE + p).then(j);
const fund = (f) => `rate ${(f.rate * 100).toFixed(3)}%/${f.interval_hours}h · ${f.pays === "none" ? "balanced" : f.pays + "s pay"} · OI long ${Math.round(f.long_oi).toLocaleString()} / short ${Math.round(f.short_oi).toLocaleString()}`;

let d = (await get(`/api/markets/${MKT}`)).body;
console.log("NEXUS mark", d.market.price?.toFixed(4), "| stage", d.market.stage, "| open positions", d.positions.length);
console.log("funding @start:", fund(d.funding));

console.log("\n== OPEN LONG (200 @ 3×) → skews long ==");
const long = await post(`/api/markets/${MKT}/perp`, { action: "open", side: "long", collateral: 200, leverage: 3 });
const posId = long.body?.position?.position_id;
console.log("  ->", long.status, posId);
console.log("  funding:", fund((await get(`/api/markets/${MKT}`)).body.funding), "(expect longs pay)");

console.log("\n== OPEN SHORT (200 @ 3×) → rebalances ==");
await post(`/api/markets/${MKT}/perp`, { action: "open", side: "short", collateral: 200, leverage: 3 });
console.log("  funding:", fund((await get(`/api/markets/${MKT}`)).body.funding), "(expect closer to balanced)");

console.log("\n== SET TP/SL on the long (OCO) ==");
const mark = (await get(`/api/markets/${MKT}`)).body.market.price;
const tp = +(mark * 1.002).toFixed(6), sl = +(mark * 0.9).toFixed(6);
const set = await post(`/api/markets/${MKT}/perp`, { action: "triggers", position_id: posId, take_profit: tp, stop_loss: sl });
console.log("  set ->", set.status, "tp", set.body?.position?.take_profit, "sl", set.body?.position?.stop_loss);
const pv = (await get(`/api/markets/${MKT}`)).body.positions.find((p) => p.position_id === posId);
console.log("  positionView: tp", pv?.take_profit, "sl", pv?.stop_loss, "| OCO:", !!(pv?.take_profit && pv?.stop_loss));

console.log("\n== TRIGGER TP: buy to push mark above the TP ==");
const buy = await post(`/api/markets/${MKT}/trade`, { side: "buy", amount: 8000 });
const newPrice = buy.body?.market?.price;
console.log("  buy ->", buy.status, "| new mark", newPrice?.toFixed(4), "| TP was", tp, "| crossed:", newPrice >= tp);
const after = (await get(`/api/markets/${MKT}`)).body;
const stillOpen = after.positions.find((p) => p.position_id === posId);
console.log("  long still open?", !!stillOpen, "(expect FALSE → closed by TP; price rose so it's TP not liquidation)");
console.log("  remaining open positions:", after.positions.length, "| funding now:", fund(after.funding));
