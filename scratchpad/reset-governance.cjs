/**
 * Reset protocol governance to a clean slate (demo prep). Clears all proposals +
 * votes, resets governable params to their defaults, and sweeps any grants wallet
 * back to the treasury (so treasury_transfer test runs don't leave a dent). Run with
 * the server STOPPED, then start — ensureSeeded re-creates the 2 action-carrying seeds.
 *   node scratchpad/reset-governance.cjs
 */
const fs = require("fs");
const path = require("path");
const FILE = path.join(process.cwd(), ".neugrid-store.json");
const db = JSON.parse(fs.readFileSync(FILE, "utf8"));

const tre = (db.wallets || []).find((w) => w.user_id === "neugrid:treasury");
const grants = (db.wallets || []).find((w) => w.user_id === "neugrid:grants");
if (tre && grants) {
  tre.usdc += grants.usdc || 0;
  tre.grid += grants.grid || 0;
  grants.usdc = 0;
  grants.grid = 0;
}
db.govProposals = [];
db.govVotes = [];
delete db.params; // → all parameters back to their hardcoded defaults

fs.writeFileSync(FILE, JSON.stringify(db));
console.log("governance reset — proposals/votes cleared, params → defaults, grants swept.");
console.log("treasury now:", tre ? `${Math.round(tre.usdc)} USDC / ${Math.round(tre.grid)} GRID` : "(none)");
