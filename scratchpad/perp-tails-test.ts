/* Perp/limit tails — isolated end-to-end on a THROWAWAY store copy.
 * RUN FROM A TEMP CWD holding a copy of .neugrid-store.json (store path = cwd):
 *   cd <tmpdir> && npx tsx /Users/axoniue/Desktop/neugrid/scratchpad/perp-tails-test.ts
 */
import { db } from "/Users/axoniue/Desktop/neugrid/src/lib/store";
import * as Markets from "/Users/axoniue/Desktop/neugrid/src/lib/modules/markets";
import * as Perps from "/Users/axoniue/Desktop/neugrid/src/lib/modules/perps";
import * as Wallets from "/Users/axoniue/Desktop/neugrid/src/lib/modules/wallets";

const NX = "mkt_nexus";
const ok = (label: string, pass: boolean, detail = "") => console.log(`${pass ? "✓" : "✗ FAIL"} ${label}${detail ? " — " + detail : ""}`);

// whale setup: trinity gets deep NEXUS + USDC to move the price
const whale = "usr_trinity";
Wallets.creditUsdc(whale, 1_000_000);
db.holdings.push({ market_id: NX, user_id: whale, base: 3000 });

const mark0 = Perps.markPrice(NX);
console.log("mark0:", mark0.toFixed(3));

// 1 · trailing stop: neo long 2x, trail 3%
const open = Perps.openPosition(NX, "usr_neo", "long", 500, 2);
if (!open.position) throw new Error("open failed: " + open.error);
Perps.setTriggers(open.position.position_id, "usr_neo", undefined, undefined, 3);

// 2 · perp limit entry: neo long 3x resting 4% below
const entry = Perps.placeLimitEntry(NX, "usr_neo", "long", 300, 3, mark0 * 0.96);
if (!entry.order) throw new Error("entry not resting: " + entry.error);

// 3 · whale sells until mark < entry price (each trade runs Perps.settle)
let mark = mark0;
let guard = 0;
while (mark > mark0 * 0.955 && guard++ < 40) {
  const r = Markets.trade(NX, whale, "sell", 120);
  if (r.error) throw new Error("whale sell: " + r.error);
  mark = Perps.markPrice(NX);
}
console.log("mark after dump:", mark.toFixed(3), `(−${((1 - mark / mark0) * 100).toFixed(2)}%)`);

// asserts
const closedPos = db.positions.find((p) => p.position_id === open.position!.position_id)!;
ok("trailing stop closed the long", closedPos.status === "closed" && closedPos.close_reason === "trailing_stop", `reason=${closedPos.close_reason} pnl=${closedPos.pnl?.toFixed(2)}`);

const entOrder = db.orders.find((o) => o.order_id === entry.order!.order_id)!;
console.log("  perp-entry orders:", db.orders.filter((o) => o.kind === "perp_entry").map((o) => `${o.order_id}@${o.price.toFixed(3)}=${o.status}`).join("  "));
console.log("  3x longs:", db.positions.filter((p) => p.market_id === NX && p.leverage === 3 && p.side === "long").map((p) => `${p.position_id} entry=${p.entry_price.toFixed(3)} ${p.status}`).join("  "));
const entPos = db.positions.find((p) => p.user_id === "usr_neo" && p.status === "open" && p.leverage === 3 && p.side === "long" && p.market_id === NX && p.entry_price <= entry.order!.price * 1.001);
ok("perp limit entry filled into a 3x long at/below the limit", entOrder.status === "filled" && !!entPos, `order=${entOrder.status} entry=${entPos?.entry_price?.toFixed(3)} (limit ${entry.order!.price.toFixed(3)})`);

// 4 · spot partial fill on VAULT: rest a buy for MORE than the curve gives within the limit
const V = db.markets.find((m) => m.base_symbol === "VAULT")!;
const vPrice = Markets.priceOf(V);
Wallets.creditUsdc("usr_neo", 500_000);
const big = Markets.placeLimit(V.market_id, "usr_neo", "buy", vPrice * 0.999, 100_000); // rests (just below mark)
if (!big.order) throw new Error("large buy did not rest: " + JSON.stringify(big));
const dump = Markets.trade(V.market_id, whale, "sell", 0); // whale needs VAULT first
db.holdings.push({ market_id: V.market_id, user_id: whale, base: 50_000 });
Markets.trade(V.market_id, whale, "sell", 30_000); // crash through the limit
const bigNow = db.orders.find((o) => o.order_id === big.order!.order_id)!;
ok("spot limit PARTIALLY filled and kept resting", bigNow.status === "open" && bigNow.filled > 0 && bigNow.filled < bigNow.qty, `filled ${bigNow.filled.toFixed(1)} / ${bigNow.qty}`);
const vAfter = Markets.priceOf(db.markets.find((m) => m.base_symbol === "VAULT")!);
ok("marginal price held at the limit", vAfter <= vPrice * 0.999 * 1.001, `price ${vAfter.toFixed(5)} vs limit ${(vPrice * 0.999).toFixed(5)}`);

console.log("done");
process.exit(0);
