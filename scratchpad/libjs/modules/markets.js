"use strict";
/**
 * Markets (Axon / TradeX) — the "amber half" of the lifecycle, GATED by graduation.
 *
 *   delivered project (all milestones released) → launch token on ALPHA →
 *   earns traction (holders) → graduate to SPOT → deep liquidity → FUTURES.
 *
 * A simple constant-product AMM (x*y=k) gives a live price. Markets are EARNED:
 * you can't launch until the project has actually delivered. Pre-treasury, the
 * quote unit is an accounting unit, not real money.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketForGrid = marketForGrid;
exports.getMarket = getMarket;
exports.listMarkets = listMarkets;
exports.canLaunch = canLaunch;
exports.auditFor = auditFor;
exports.requestAudit = requestAudit;
exports.reviewAudit = reviewAudit;
exports.launchToken = launchToken;
exports.trade = trade;
exports.canGraduate = canGraduate;
exports.graduateMarket = graduateMarket;
exports.holdingOf = holdingOf;
exports.recentTrades = recentTrades;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
const INITIAL_SUPPLY = 1000000;
const SEED_LIQUIDITY = 10000;
const SPOT_MIN_HOLDERS = 3;
const FUTURES_MIN_LIQUIDITY = 50000;
function marketForGrid(grid_id) {
    return store_1.db.markets.find((m) => m.grid_id === grid_id);
}
function getMarket(id) {
    return store_1.db.markets.find((m) => m.market_id === id);
}
function listMarkets(filter = {}) {
    return store_1.db.markets.filter((m) => !filter.stage || m.stage === filter.stage);
}
/** Launch gate: a project Grid that has delivered ALL its milestones. */
function canLaunch(grid_id) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    if (!grid)
        return { ok: false, reason: "no_grid" };
    if (marketForGrid(grid_id))
        return { ok: false, reason: "already_launched" };
    if (grid.grid_type !== "project")
        return { ok: false, reason: "not_a_project" };
    const ms = store_1.db.milestones.filter((m) => m.grid_id === grid_id);
    if (ms.length === 0)
        return { ok: false, reason: "no_milestones" };
    if (!ms.every((m) => m.status === "released"))
        return { ok: false, reason: "deliver_all_milestones" };
    const audit = auditFor(grid_id);
    if (!audit || audit.status !== "passed") {
        return { ok: false, reason: !audit ? "needs_audit" : audit.status === "requested" ? "audit_pending" : "audit_failed" };
    }
    return { ok: true };
}
/* --- Security audit (the last graduation gate before Alpha) --- */
function auditFor(grid_id) {
    return [...store_1.db.audits].reverse().find((a) => a.grid_id === grid_id);
}
function requestAudit(grid_id, user_id) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    if (!grid)
        return { error: "no_grid" };
    if (grid.owner_id !== user_id)
        return { error: "only_founder" };
    if (marketForGrid(grid_id))
        return { error: "already_launched" };
    const ms = store_1.db.milestones.filter((m) => m.grid_id === grid_id);
    if (ms.length === 0 || !ms.every((m) => m.status === "released"))
        return { error: "deliver_all_milestones" };
    const existing = auditFor(grid_id);
    if (existing?.status === "passed")
        return { error: "already_passed" };
    if (existing?.status === "requested")
        return { error: "already_pending" };
    const audit = { audit_id: (0, id_1.newId)("aud"), grid_id, requested_by: user_id, status: "requested", created_at: (0, id_1.nowISO)() };
    store_1.db.audits.push(audit);
    return { audit };
}
function reviewAudit(audit_id, reviewer_id, pass, notes) {
    const a = store_1.db.audits.find((x) => x.audit_id === audit_id);
    if (!a)
        return { error: "not_found" };
    if (a.status !== "requested")
        return { error: "not_pending" };
    const grid = store_1.db.grids.find((g) => g.grid_id === a.grid_id);
    if (grid && grid.owner_id === reviewer_id)
        return { error: "founder_cannot_review" };
    a.status = pass ? "passed" : "failed";
    a.reviewer_id = reviewer_id;
    a.notes = notes ?? (pass ? "Passed — no critical findings" : "Failed — address findings and re-request");
    a.reviewed_at = (0, id_1.nowISO)();
    if (pass && grid) {
        Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 20, reason: "Security audit passed", verification_source: `reviewer:${reviewer_id}` });
    }
    return { audit: a };
}
function launchToken(grid_id, user_id, symbol) {
    const grid = store_1.db.grids.find((g) => g.grid_id === grid_id);
    if (!grid)
        return { error: "no_grid" };
    if (grid.owner_id !== user_id)
        return { error: "only_founder" };
    const gate = canLaunch(grid_id);
    if (!gate.ok)
        return { error: gate.reason };
    const sym = (symbol || grid.slug.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "TKN").toUpperCase();
    const token = { token_id: (0, id_1.newId)("tok"), layer: "project", symbol: sym, name: grid.name, grid_id, total_supply: INITIAL_SUPPLY, launched_at: (0, id_1.nowISO)() };
    store_1.db.tokens.push(token);
    const market = {
        market_id: (0, id_1.newId)("mkt"), token_id: token.token_id, grid_id, stage: "alpha",
        base_symbol: sym, quote_symbol: "USDC",
        base_reserve: INITIAL_SUPPLY, quote_reserve: SEED_LIQUIDITY, price: SEED_LIQUIDITY / INITIAL_SUPPLY,
        liquidity_usd: SEED_LIQUIDITY, holders: 0, volume: 0, status: "active", created_at: (0, id_1.nowISO)(),
    };
    store_1.db.markets.push(market);
    grid.lifecycle_stage = "alpha";
    grid.token_id = token.token_id;
    Pulse.recordEvent({ target_type: "grid", target_id: grid_id, action_type: "campaign_completed", weight: 40, reason: `Launched ${sym} on Alpha`, verification_source: "auto" });
    return { market, token };
}
function recountHolders(market_id) {
    return new Set(store_1.db.holdings.filter((h) => h.market_id === market_id && h.base > 1e-9).map((h) => h.user_id)).size;
}
function trade(market_id, user_id, side, amount) {
    const m = getMarket(market_id);
    if (!m)
        return { error: "no_market" };
    if (m.status !== "active")
        return { error: "inactive" };
    if (!(amount > 0))
        return { error: "bad_amount" };
    const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
    const k = base * quote;
    let holding = store_1.db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id);
    if (side === "buy") {
        const newQuote = quote + amount;
        const baseOut = base - k / newQuote;
        m.quote_reserve = newQuote;
        m.base_reserve = k / newQuote;
        if (!holding) {
            holding = { market_id, user_id, base: 0 };
            store_1.db.holdings.push(holding);
        }
        holding.base += baseOut;
        m.volume = (m.volume ?? 0) + amount;
        m.price = m.quote_reserve / m.base_reserve;
        m.holders = recountHolders(market_id);
        m.liquidity_usd = m.quote_reserve;
        store_1.db.trades.unshift({ market_id, user_id, side, base: baseOut, quote: amount, price: m.price, at: (0, id_1.nowISO)() });
        return { market: m, filled: baseOut };
    }
    // sell: amount = base tokens in
    if (!holding || holding.base < amount)
        return { error: "insufficient_balance" };
    const newBase = base + amount;
    const quoteOut = quote - k / newBase;
    m.base_reserve = newBase;
    m.quote_reserve = k / newBase;
    holding.base -= amount;
    m.volume = (m.volume ?? 0) + quoteOut;
    m.price = m.quote_reserve / m.base_reserve;
    m.holders = recountHolders(market_id);
    m.liquidity_usd = m.quote_reserve;
    store_1.db.trades.unshift({ market_id, user_id, side, base: amount, quote: quoteOut, price: m.price, at: (0, id_1.nowISO)() });
    return { market: m, filled: quoteOut };
}
function canGraduate(market_id) {
    const m = getMarket(market_id);
    if (!m)
        return { ok: false, reason: "no_market" };
    if (m.stage === "alpha") {
        return (m.holders ?? 0) >= SPOT_MIN_HOLDERS ? { ok: true, next: "spot" } : { ok: false, next: "spot", reason: `needs ${SPOT_MIN_HOLDERS}+ holders` };
    }
    if (m.stage === "spot") {
        return (m.quote_reserve ?? 0) >= FUTURES_MIN_LIQUIDITY ? { ok: true, next: "futures" } : { ok: false, next: "futures", reason: "needs deeper liquidity (+ licensing)" };
    }
    return { ok: false, reason: "max_stage" };
}
function graduateMarket(market_id) {
    const g = canGraduate(market_id);
    if (!g.ok || !g.next)
        return { error: g.reason ?? "not_eligible" };
    const m = getMarket(market_id);
    m.stage = g.next;
    const grid = store_1.db.grids.find((x) => x.grid_id === m.grid_id);
    if (grid) {
        grid.lifecycle_stage = g.next;
        Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 30, reason: `Graduated to ${g.next}`, verification_source: "auto" });
    }
    return { market: m };
}
function holdingOf(market_id, user_id) {
    return store_1.db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id)?.base ?? 0;
}
function recentTrades(market_id, limit = 14) {
    return store_1.db.trades.filter((t) => t.market_id === market_id).slice(0, limit);
}
