/**
 * Reverse a fraud-flag/slash on a market (demo cleanup / "unflag" utility).
 * Run with the server STOPPED: node scratchpad/restore-vault.cjs [market_id]
 */
const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), ".neugrid-store.json");
const db = JSON.parse(fs.readFileSync(FILE, "utf8"));
const MKT = process.argv[2] || "mkt_73e16f04"; // VAULT

const m = (db.markets || []).find((x) => x.market_id === MKT);
if (!m) { console.log("no market", MKT); process.exit(0); }
const gid = m.grid_id;
m.status = "active";
const g = (db.grids || []).find((x) => x.grid_id === gid);
if (g) g.lifecycle_stage = m.stage;

let refunded = 0;
for (const s of db.listingStakes || []) {
  if (s.grid_id === gid && s.slashed) {
    refunded += s.amount;
    s.slashed = false;
    s.released = false;
    delete s.slashed_at;
    delete s.slash_reason;
  }
}
const tre = (db.wallets || []).find((w) => w.user_id === "neugrid:treasury");
if (tre) tre.grid = Math.max(0, (tre.grid || 0) - refunded);
db.pulseEvents = (db.pulseEvents || []).filter((e) => !(e.target_id === gid && e.action_type === "spam_penalty" && /Fraud flagged/.test(e.reason || "")));

fs.writeFileSync(FILE, JSON.stringify(db));
console.log(`Restored ${MKT} (${m.base_symbol}) → status active, un-slashed ${refunded} GRID, removed fraud pulse event.`);
