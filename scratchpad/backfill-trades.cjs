/**
 * Demo-seed: backfill realistic trade history on the demo markets so the REAL
 * OHLC chart (`Markets.candles`) renders rich candles. Same category as
 * seed-futures.cjs / reset-agt.cjs — demo fixtures, not faked chart logic (the
 * chart honestly aggregates whatever trades exist). Run with the server STOPPED:
 *   node scratchpad/backfill-trades.cjs
 * Idempotent: removes prior backfill rows (tagged `_bf`) before re-seeding.
 */
const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), ".neugrid-store.json");
const db = JSON.parse(fs.readFileSync(FILE, "utf8"));

function backfill(marketId, { steps = 120, days = 5, startFrac = 0.5 } = {}) {
  const m = (db.markets || []).find((x) => x.market_id === marketId);
  if (!m) { console.log("  skip (no market):", marketId); return; }
  const end = m.price || (m.base_reserve ? m.quote_reserve / m.base_reserve : 1);
  const now = Date.now();
  const span = days * 86400 * 1000;
  // deterministic RNG seeded by market id
  let s = 0; for (const ch of marketId) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };

  // a price walk that drifts toward the live price with candle-like noise
  let p = end * startFrac;
  const added = [];
  for (let i = 0; i < steps; i++) {
    const drift = (end - p) * 0.05;
    p = Math.max(end * 0.2, p + drift + (rnd() - 0.48) * end * 0.06);
    const price = i === steps - 1 ? end : +p.toFixed(6); // land exactly on the live price
    added.push({
      market_id: marketId,
      user_id: i % 3 === 0 ? "usr_trinity" : "usr_neo",
      side: i > 0 && price < added[i - 1].price ? "sell" : "buy",
      base: +(20 + rnd() * 400).toFixed(3),
      quote: +(50 + rnd() * 1800).toFixed(2),
      price,
      at: new Date(now - span + (i / steps) * span * 0.985).toISOString(),
      _bf: true,
    });
  }
  // drop prior backfill rows for THIS market, then merge + keep newest-first
  db.trades = (db.trades || []).filter((t) => !(t._bf && t.market_id === marketId));
  db.trades = db.trades.concat(added).sort((a, b) => new Date(b.at) - new Date(a.at));
  console.log(`  ${marketId}: +${steps} trades, walk ${(end * startFrac).toFixed(4)} → ${end.toFixed(4)}`);
}

console.log("Backfilling demo trade history…");
backfill("mkt_77da188f", { startFrac: 0.45 }); // AGT (spot)
backfill("mkt_73e16f04", { startFrac: 0.6 });  // VAULT (spot)
backfill("mkt_nexus", { days: 7, startFrac: 0.35 }); // NEXUS (futures)
fs.writeFileSync(FILE, JSON.stringify(db));
console.log("Done. total trades:", db.trades.length);
