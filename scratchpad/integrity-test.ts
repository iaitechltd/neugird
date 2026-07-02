/* Integrity mechanisms — isolated on a THROWAWAY store copy (run from a temp cwd):
 * fraud-flag dispute quorum + the hired-trader performance fee.
 *   cd <tmpdir> && npx tsx /Users/axoniue/Desktop/neugrid/scratchpad/integrity-test.ts
 */
import { db } from "/Users/axoniue/Desktop/neugrid/src/lib/store";
import * as Markets from "/Users/axoniue/Desktop/neugrid/src/lib/modules/markets";
import * as Perps from "/Users/axoniue/Desktop/neugrid/src/lib/modules/perps";
import * as Wallets from "/Users/axoniue/Desktop/neugrid/src/lib/modules/wallets";
import * as AgentTrading from "/Users/axoniue/Desktop/neugrid/src/lib/modules/agentTrading";

const ok = (l: string, pass: boolean, d = "") => console.log(`${pass ? "✓" : "✗ FAIL"} ${l}${d ? " — " + d : ""}`);

/* ---- 1 · fraud-flag quorum (default 2) on VAULT ---- */
const V = db.markets.find((m) => m.base_symbol === "VAULT")!;
const gridOwner = db.grids.find((g) => g.grid_id === V.grid_id)!.owner_id;

const r0 = Markets.flagFraud(V.market_id, gridOwner);
ok("founder cannot flag", r0.error === "founder_cannot_flag", String(r0.error));

const r1 = Markets.flagFraud(V.market_id, "usr_trinity", "wash trading");
ok("first report registers, no slash", r1.tripped === false && r1.flags === 1 && V.status === "active", `flags ${r1.flags}/${r1.needed} status=${V.status}`);

const r2 = Markets.flagFraud(V.market_id, "usr_trinity", "again");
ok("same verifier cannot double-flag", r2.error === "already_flagged_by_you", String(r2.error));

const r3 = Markets.flagFraud(V.market_id, "usr_4ajocupt6t3q", "confirmed wash trading");
ok("quorum trips: halt + slash", r3.tripped === true && V.status === "paused" && (r3.count ?? 0) >= 0, `flags ${r3.flags}/${r3.needed} slashed=${r3.slashed} stakes=${r3.count}`);

/* ---- 2 · hired-trader perf fee on NEXUS (agent owner ≠ wallet owner) ---- */
async function main() {
const NX = "mkt_nexus";
const agent = db.agents.find((a) => a.origin !== "external")!;
agent.owner_id = "usr_trinity"; // hired: trinity's agent trades NEO's wallet
agent.trust_tier = "trusted";   // the hire door requires a trusted agent
agent.owner_split_bps = 5000;   // trinity takes half the agent's fee income
Wallets.creditUsdc("usr_trinity", 60_000);
db.holdings.push({ market_id: NX, user_id: "usr_trinity", base: 3000 });

const cm = AgentTrading.createMandate({ market_id: NX, owner_id: "usr_neo", agent_id: agent.agent_id, strategy: "external", budget_usdc: 5000, max_leverage: 5, allowed_stages: ["futures"], duration_hours: 24 } as never);
if (!cm.mandate) throw new Error("mandate: " + cm.error);
const mand = cm.mandate;

// open a 2x long attributed to the mandate, then pump the price for a profit
const op = Perps.openPosition(NX, "usr_neo", "long", 400, 2);
op.position!.mandate_id = mand.mandate_id;
op.position!.agent_id = agent.agent_id;
const pump = Markets.trade(NX, "usr_trinity", "buy", 40_000); // pump ≈ +7%
if (pump.error) throw new Error("pump failed: " + pump.error);

const neoBefore = Wallets.balances("usr_neo").usdc;
const trinBefore = Wallets.balances("usr_trinity").usdc;
const agentBefore = agent.earnings ?? 0;

const close = Perps.closePosition(op.position!.position_id, "usr_neo");
const pnl = close.pnl ?? 0;
// booking happens on the mandate's next reconcile tick (post rate-limit window)
await new Promise((s) => setTimeout(s, 6500));
const tick = AgentTrading.runTick(mand.mandate_id);
console.log("  reconcile:", tick.action?.rationale ?? tick.skipped);

const fee = Math.round(pnl * 1000) / 10000; // 10% default
const neoAfter = Wallets.balances("usr_neo").usdc;
const trinAfter = Wallets.balances("usr_trinity").usdc;
ok("profit realized", pnl > 0, `pnl $${pnl.toFixed(2)} fee $${fee.toFixed(2)}`);
ok("agent earned its cut", (agent.earnings ?? 0) - agentBefore > 0, `earnings +$${((agent.earnings ?? 0) - agentBefore).toFixed(2)}`);
ok("agent's owner got the split", trinAfter - trinBefore > 0, `trinity +$${(trinAfter - trinBefore).toFixed(2)}`);
ok("wallet owner paid ≈ pnl + margin − fee", Math.abs(neoAfter - neoBefore - (400 + pnl - fee)) < 1, `neo Δ $${(neoAfter - neoBefore).toFixed(2)} vs ${(400 + pnl - fee).toFixed(2)}`);

console.log("done");
process.exit(0);
}
main().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });
