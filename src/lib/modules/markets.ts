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

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Wallets from "./wallets";
import * as Staking from "./staking";
import * as Perps from "./perps";
import * as Params from "./params";
import * as GridMarket from "./gridMarket";
import type { Audit, LimitOrder, Market, MarketStage, Token } from "../types";

const INITIAL_SUPPLY = 1_000_000;
const SEED_LIQUIDITY = 10_000;

/* Stage gates (locked mechanism): real market cap (the Ascension Arc) + a real
 * liquidity floor + a community GRID stake (./staking). Earned, not bought. */
export const SPOT_MARKETCAP = 963_000; // Alpha → Spot cap target
export const FUTURES_MARKETCAP = 36_000_000; // Spot → Futures cap target
export const FUTURES_MIN_LIQUIDITY = 900_000; // deep book required for leverage
const SPOT_MIN_LIQ_RATIO = 0.08; // liquidity ≥ 8% of cap (anti thin-float gaming)
// TradeX trade fee is GOVERNABLE — Params.get("tradex_fee_bps") (default 100 = 1%);
// a passed governance proposal changes it and the next trade uses the new value.

export function marketForGrid(grid_id: string): Market | undefined {
  return db.markets.find((m) => m.grid_id === grid_id);
}
export function getMarket(id: string): Market | undefined {
  return db.markets.find((m) => m.market_id === id);
}
export function listMarkets(filter: { stage?: MarketStage } = {}): Market[] {
  return db.markets.filter((m) => !filter.stage || m.stage === filter.stage);
}

/* --- Cap / liquidity / progress: what the Ascension Arc tracks --- */

function tokenOf(m: Market): Token | undefined {
  return db.tokens.find((t) => t.token_id === m.token_id);
}
export function supplyOf(m: Market): number {
  return tokenOf(m)?.total_supply ?? INITIAL_SUPPLY;
}
export function priceOf(m: Market): number {
  const b = m.base_reserve ?? 0;
  return b > 0 ? (m.quote_reserve ?? 0) / b : m.price ?? 0;
}
/** Fully-diluted market cap in USDC — the headline the Ascension Arc tracks. */
export function marketcap(m: Market): number {
  return priceOf(m) * supplyOf(m);
}
/** Pool TVL in USDC — both sides of the constant-product pool (2 × quote reserve). */
export function liquidity(m: Market): number {
  return 2 * (m.quote_reserve ?? 0);
}

export interface StageProgress {
  stage: MarketStage;
  next?: MarketStage;
  capTarget: number;
  marketcap: number;
  capPct: number;
  liquidity: number;
  liqFloor: number;
  liqOk: boolean;
}
/** Progress toward the NEXT stage's market-cap target + its liquidity floor. */
export function stageProgress(m: Market): StageProgress {
  const mc = marketcap(m);
  const liq = liquidity(m);
  if (m.stage === "alpha") {
    const liqFloor = mc * SPOT_MIN_LIQ_RATIO;
    return { stage: m.stage, next: "spot", capTarget: SPOT_MARKETCAP, marketcap: mc, capPct: Math.min(100, Math.round((mc / SPOT_MARKETCAP) * 100)), liquidity: liq, liqFloor, liqOk: liq >= liqFloor };
  }
  if (m.stage === "spot") {
    return { stage: m.stage, next: "futures", capTarget: FUTURES_MARKETCAP, marketcap: mc, capPct: Math.min(100, Math.round((mc / FUTURES_MARKETCAP) * 100)), liquidity: liq, liqFloor: FUTURES_MIN_LIQUIDITY, liqOk: liq >= FUTURES_MIN_LIQUIDITY };
  }
  return { stage: m.stage, capTarget: FUTURES_MARKETCAP, marketcap: mc, capPct: 100, liquidity: liq, liqFloor: FUTURES_MIN_LIQUIDITY, liqOk: true };
}

/**
 * Has a Grid "delivered" — the earned precondition to tokenize (gated further by
 * audit)? Two paths, both proof-not-promise:
 *  - milestones: a GenesisX-funded project released ALL its milestones; OR
 *  - product: a witnessed GridX product was shipped (tokenize-from-GridX — a
 *    built+listed product earns a market without milestone funding).
 * Milestone-funded grids must finish their milestones (backers committed to them);
 * the product path only applies to grids with no milestone obligation.
 */
export function deliveryStatus(grid_id: string): { ok: boolean; via?: "milestones" | "product"; reason?: string } {
  const ms = db.milestones.filter((m) => m.grid_id === grid_id);
  if (ms.length > 0) {
    return ms.every((m) => m.status === "released") ? { ok: true, via: "milestones" } : { ok: false, reason: "deliver_all_milestones" };
  }
  if (db.products.some((p) => p.grid_id === grid_id)) return { ok: true, via: "product" };
  return { ok: false, reason: "no_deliverable" };
}

/** Launch gate: a delivered (milestones released OR a shipped GridX product) +
 *  audited Grid that hasn't launched. Community Grids can't tokenize. */
export function canLaunch(grid_id: string): { ok: boolean; reason?: string } {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return { ok: false, reason: "no_grid" };
  if (marketForGrid(grid_id)) return { ok: false, reason: "already_launched" };
  if (grid.grid_type !== "project" && grid.grid_type !== "product") return { ok: false, reason: "not_tokenizable" };
  const delivered = deliveryStatus(grid_id);
  if (!delivered.ok) return { ok: false, reason: delivered.reason };
  const audit = auditFor(grid_id);
  if (!audit || audit.status !== "passed") {
    return { ok: false, reason: !audit ? "needs_audit" : audit.status === "requested" ? "audit_pending" : "audit_failed" };
  }
  return { ok: true };
}

/* --- Security audit (the last graduation gate before Alpha) --- */

export function auditFor(grid_id: string): Audit | undefined {
  return [...db.audits].reverse().find((a) => a.grid_id === grid_id);
}

export function requestAudit(grid_id: string, user_id: string): { audit?: Audit; error?: string } {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return { error: "no_grid" };
  if (grid.owner_id !== user_id) return { error: "only_founder" };
  if (marketForGrid(grid_id)) return { error: "already_launched" };
  const delivered = deliveryStatus(grid_id);
  if (!delivered.ok) return { error: delivered.reason };
  const existing = auditFor(grid_id);
  if (existing?.status === "passed") return { error: "already_passed" };
  if (existing?.status === "requested") return { error: "already_pending" };
  const audit: Audit = { audit_id: newId("aud"), grid_id, requested_by: user_id, status: "requested", created_at: nowISO() };
  db.audits.push(audit);
  return { audit };
}

export function reviewAudit(audit_id: string, reviewer_id: string, pass: boolean, notes?: string): { audit?: Audit; error?: string } {
  const a = db.audits.find((x) => x.audit_id === audit_id);
  if (!a) return { error: "not_found" };
  if (a.status !== "requested") return { error: "not_pending" };
  const grid = db.grids.find((g) => g.grid_id === a.grid_id);
  if (grid && grid.owner_id === reviewer_id) return { error: "founder_cannot_review" };
  a.status = pass ? "passed" : "failed";
  a.reviewer_id = reviewer_id;
  a.notes = notes ?? (pass ? "Passed — no critical findings" : "Failed — address findings and re-request");
  a.reviewed_at = nowISO();
  if (pass && grid) {
    Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 20, reason: "Security audit passed", verification_source: `reviewer:${reviewer_id}` });
  }
  return { audit: a };
}

export function launchToken(grid_id: string, user_id: string, symbol?: string): { market?: Market; token?: Token; error?: string } {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return { error: "no_grid" };
  if (grid.owner_id !== user_id) return { error: "only_founder" };
  const gate = canLaunch(grid_id);
  if (!gate.ok) return { error: gate.reason };

  const sym = (symbol || grid.slug.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "TKN").toUpperCase();
  const token: Token = { token_id: newId("tok"), layer: "project", symbol: sym, name: grid.name, grid_id, total_supply: INITIAL_SUPPLY, launched_at: nowISO() };
  db.tokens.push(token);

  const market: Market = {
    market_id: newId("mkt"), token_id: token.token_id, grid_id, stage: "alpha",
    base_symbol: sym, quote_symbol: "USDC",
    base_reserve: INITIAL_SUPPLY, quote_reserve: SEED_LIQUIDITY, price: SEED_LIQUIDITY / INITIAL_SUPPLY,
    liquidity_usd: 2 * SEED_LIQUIDITY, holders: 0, volume: 0, status: "active", created_at: nowISO(),
  };
  db.markets.push(market);
  grid.lifecycle_stage = "alpha";
  grid.token_id = token.token_id;
  Pulse.recordEvent({ target_type: "grid", target_id: grid_id, action_type: "campaign_completed", weight: 40, reason: `Launched ${sym} on Alpha`, verification_source: "auto" });
  return { market, token };
}

function recountHolders(market_id: string): number {
  return new Set(db.holdings.filter((h) => h.market_id === market_id && h.base > 1e-9).map((h) => h.user_id)).size;
}

/** GRID's 4th utility — fee discounts. If the trader opted in (and holds enough
 *  GRID), pay the protocol fee in GRID at the governable discount → treasury, and
 *  the full notional hits the curve (no USDC skim). Returns null → charge in USDC. */
function payFeeInGrid(user_id: string, feeUsdc: number): { grid: number; saved: number } | null {
  if (!(feeUsdc > 0) || !Wallets.get(user_id).pay_fees_in_grid) return null;
  const price = GridMarket.price(); // USDC per GRID
  if (!(price > 0)) return null;
  const discount = Params.get("grid_fee_discount_bps") / 10000;
  const gridFee = (feeUsdc * (1 - discount)) / price;
  if (!Wallets.debitGrid(user_id, gridFee)) return null; // not enough GRID → fall back to USDC
  Wallets.creditGrid(Wallets.TREASURY, gridFee);
  return { grid: gridFee, saved: feeUsdc * discount };
}

/** Core constant-product swap — no side-effects beyond reserves/holdings/wallet/
 *  trade log. Kept hook-free so limit fills can reuse it without recursion. */
type SwapResult = { filled?: number; fee?: number; fee_in?: "usdc" | "grid"; fee_grid?: number; fee_saved?: number; error?: string };
function executeSwap(m: Market, user_id: string, side: "buy" | "sell", amount: number): SwapResult {
  const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
  const k = base * quote;
  let holding = db.holdings.find((h) => h.market_id === m.market_id && h.user_id === user_id);

  if (side === "buy") {
    // amount = USDC in (gross). Protocol fee in USDC — OR in GRID at a discount.
    if (Wallets.get(user_id).usdc < amount) return { error: "insufficient_usdc" };
    const feeUsdc = (amount * Params.get("tradex_fee_bps")) / 10000;
    const gridFee = payFeeInGrid(user_id, feeUsdc); // GRID-fee path (else null → USDC)
    Wallets.debitUsdc(user_id, amount);
    const net = gridFee ? amount : amount - feeUsdc; // GRID-paid → full notional hits the curve
    if (!gridFee) Wallets.creditUsdc(Wallets.TREASURY, feeUsdc - Staking.distributeFees(m.grid_id, (feeUsdc * Staking.STAKER_FEE_SHARE_BPS) / 10000));
    const newQuote = quote + net;
    const baseOut = base - k / newQuote;
    m.quote_reserve = newQuote;
    m.base_reserve = k / newQuote;
    if (!holding) { holding = { market_id: m.market_id, user_id, base: 0 }; db.holdings.push(holding); }
    holding.base += baseOut;
    m.volume = (m.volume ?? 0) + amount;
    m.price = m.quote_reserve / m.base_reserve;
    m.holders = recountHolders(m.market_id);
    m.liquidity_usd = 2 * m.quote_reserve;
    db.trades.unshift({ market_id: m.market_id, user_id, side, base: baseOut, quote: amount, price: m.price, at: nowISO() });
    return { filled: baseOut, fee: gridFee ? 0 : feeUsdc, fee_in: gridFee ? "grid" : "usdc", fee_grid: gridFee?.grid, fee_saved: gridFee?.saved };
  }

  // sell: amount = base tokens in. Protocol fee on the USDC out — USDC or GRID.
  if (!holding || holding.base < amount) return { error: "insufficient_balance" };
  const newBase = base + amount;
  const quoteOut = quote - k / newBase;
  const feeUsdc = (quoteOut * Params.get("tradex_fee_bps")) / 10000;
  const gridFee = payFeeInGrid(user_id, feeUsdc);
  const net = gridFee ? quoteOut : quoteOut - feeUsdc; // GRID-paid → full USDC out to the seller
  m.base_reserve = newBase;
  m.quote_reserve = k / newBase;
  holding.base -= amount;
  Wallets.creditUsdc(user_id, net);
  if (!gridFee) Wallets.creditUsdc(Wallets.TREASURY, feeUsdc);
  m.volume = (m.volume ?? 0) + quoteOut;
  m.price = m.quote_reserve / m.base_reserve;
  m.holders = recountHolders(m.market_id);
  m.liquidity_usd = 2 * m.quote_reserve;
  db.trades.unshift({ market_id: m.market_id, user_id, side, base: amount, quote: quoteOut, price: m.price, at: nowISO() });
  return { filled: net, fee: gridFee ? 0 : feeUsdc, fee_in: gridFee ? "grid" : "usdc", fee_grid: gridFee?.grid, fee_saved: gridFee?.saved };
}

export function trade(market_id: string, user_id: string, side: "buy" | "sell", amount: number): SwapResult & { market?: Market } {
  const m = getMarket(market_id);
  if (!m) return { error: "no_market" };
  if (m.status !== "active") return { error: "inactive" };
  if (!(amount > 0)) return { error: "bad_amount" };
  const r = executeSwap(m, user_id, side, amount);
  if (r.error) return { error: r.error };
  fillCrossedOrders(market_id); // resting limit orders the new price now crosses
  Perps.settle(market_id); // any leverage position past its liq price
  return { market: m, ...r };
}

export interface GraduationStatus {
  ok: boolean;
  next?: MarketStage;
  reason?: string;
  marketGate?: boolean; // cap + liquidity floor met (the automatic gate)
  stakeGate?: boolean; // community GRID stake locked (the commitment gate)
  progress?: StageProgress;
}
/** A market ascends only when BOTH gates clear: market cap + liquidity AND a
 *  community GRID stake (./staking). Real demand + real conviction = earned. */
export function canGraduate(market_id: string): GraduationStatus {
  const m = getMarket(market_id);
  if (!m) return { ok: false, reason: "no_market" };
  if (m.stage === "futures") return { ok: false, reason: "max_stage" };
  const prog = stageProgress(m);
  const next = prog.next as Staking.StageTarget; // "spot" | "futures"
  const marketGate = prog.capPct >= 100 && prog.liqOk;
  const stakeGate = Staking.stakeMet(m.grid_id, next);
  if (!marketGate) {
    const reason = prog.capPct < 100 ? `reach $${prog.capTarget.toLocaleString()} market cap (${prog.capPct}%)` : "needs a deeper liquidity floor";
    return { ok: false, next, reason, marketGate, stakeGate, progress: prog };
  }
  if (!stakeGate) {
    return { ok: false, next, reason: `lock ${Staking.STAKE_REQUIRED[next].toLocaleString()} GRID to list`, marketGate, stakeGate, progress: prog };
  }
  return { ok: true, next, marketGate, stakeGate, progress: prog };
}

export function graduateMarket(market_id: string): { market?: Market; error?: string } {
  const g = canGraduate(market_id);
  if (!g.ok || !g.next) return { error: g.reason ?? "not_eligible" };
  const m = getMarket(market_id)!;
  m.stage = g.next;
  m.stage_changed_at = nowISO();
  const grid = db.grids.find((x) => x.grid_id === m.grid_id);
  if (grid) {
    grid.lifecycle_stage = g.next;
    Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 30, reason: `Graduated to ${g.next}`, verification_source: "auto" });
  }
  return { market: m };
}

/**
 * Flag a LAUNCHED market as fraudulent (a Verifier, never the founder). Halts
 * trading (status → paused, so Markets.trade + Perps.openPosition refuse it) and
 * SLASHES every listing stake — the vouchers forfeit their locked GRID. Pre-launch
 * fraud is already caught by the audit gate; this is the post-launch backstop.
 * v1 mirrors the single-Verifier audit-review trust model — production should gate
 * it behind staked-review / dispute quorum.
 */
export function flagFraud(market_id: string, reviewer_id: string, reason?: string): { market?: Market; slashed?: number; count?: number; error?: string } {
  const m = getMarket(market_id);
  if (!m) return { error: "no_market" };
  if (m.status === "paused") return { error: "already_flagged" };
  const grid = db.grids.find((g) => g.grid_id === m.grid_id);
  if (grid && grid.owner_id === reviewer_id) return { error: "founder_cannot_flag" };
  const why = (reason && reason.trim().slice(0, 200)) || "Flagged fraudulent by a Verifier";
  const slash = Staking.slashStakes(m.grid_id, why);
  m.status = "paused";
  if (grid) {
    grid.lifecycle_stage = "failed";
    Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "spam_penalty", weight: -60, reason: `Fraud flagged — ${slash.count} listing stake(s) slashed (${slash.slashed.toLocaleString()} GRID forfeited)`, verification_source: `reviewer:${reviewer_id}` });
  }
  return { market: m, slashed: slash.slashed, count: slash.count };
}

export function holdingOf(market_id: string, user_id: string): number {
  return db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id)?.base ?? 0;
}
export function recentTrades(market_id: string, limit = 14) {
  return db.trades.filter((t) => t.market_id === market_id).slice(0, limit);
}

export function holdersOf(market_id: string): { user_id: string; base: number }[] {
  return db.holdings.filter((h) => h.market_id === market_id && h.base > 1e-9).sort((a, b) => b.base - a.base);
}
/** Display-ready holder rows: resolved wallet address, token amount, % of supply, USDC value. */
export function holdersDetail(market_id: string, limit = 25): { address: string; amount: number; pct: number; value: number }[] {
  const m = getMarket(market_id);
  if (!m) return [];
  const supply = supplyOf(m);
  const price = priceOf(m);
  return holdersOf(market_id).slice(0, limit).map((hd) => {
    const u = db.users.find((x) => x.id === hd.user_id);
    return { address: u?.wallet_addresses?.[0] ?? hd.user_id, amount: hd.base, pct: supply > 0 ? (hd.base / supply) * 100 : 0, value: hd.base * price };
  });
}

/** Real rolling-24h trade stats — buys/sells, volume, high/low, change — over an
 *  actual TIME window (not a fixed trade count), aggregated from the trade history. */
export function tradeStats(market_id: string) {
  const m = getMarket(market_id);
  const last = m?.price ?? 0;
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const all = db.trades.filter((t) => t.market_id === market_id); // newest-first
  const win = all.filter((t) => Date.parse(t.at) >= since); // the last 24h
  const buys = win.filter((t) => t.side === "buy");
  const sells = win.filter((t) => t.side === "sell");
  const prices = win.map((t) => t.price);
  // Price entering the window: the most recent trade before it, else the oldest
  // in-window, else the current price (24h flat).
  const open = all.find((t) => Date.parse(t.at) < since)?.price ?? prices[prices.length - 1] ?? last;
  const buyVol = buys.reduce((a, t) => a + t.quote, 0);
  const sellVol = sells.reduce((a, t) => a + t.quote, 0);
  return {
    buys: buys.length,
    sells: sells.length,
    txns: win.length,
    buyVol,
    sellVol,
    volume: buyVol + sellVol, // real 24h volume (USDC)
    high: prices.length ? Math.max(last, ...prices) : last,
    low: prices.length ? Math.min(last, ...prices) : last,
    change: open > 0 ? ((last - open) / open) * 100 : 0,
  };
}

/* --- Real OHLC candles, aggregated from the trade history --- */

export interface OHLC { t: number; o: number; h: number; l: number; c: number; v: number; }
const TF_SECONDS: Record<string, number> = { "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400 };

/** Real OHLC candles from this market's trades (`db.trades`): `n` buckets across a
 *  window ending now. The window is the `tf` lookback (n×tf) but AUTO-FITS to the
 *  trade history when the market is younger than that — so real trades fill the
 *  chart instead of leaving dead flat space before the market existed. Open carries
 *  the prior close (candles connect); empty buckets are flat doji at the last price.
 *  This is REAL price action — no synthetic volatility; a quiet market reads quiet. */
export function candles(market_id: string, tf = "1H", n = 60): OHLC[] {
  const m = getMarket(market_id);
  if (!m) return [];
  const tfMs = (TF_SECONDS[tf] ?? 3600) * 1000;
  const now = Date.now();
  const all = db.trades
    .filter((t) => t.market_id === market_id)
    .map((t) => ({ at: new Date(t.at).getTime(), price: t.price, quote: t.quote }))
    .sort((a, b) => a.at - b.at);
  // Lookback = n×tf, but don't extend far before the first trade (auto-fit short
  // history). Buckets then size to span [start, now] evenly into n.
  const firstAt = all.length ? all[0].at : now - n * tfMs;
  const start = Math.max(now - n * tfMs, firstAt - tfMs);
  const interval = Math.max(1, (now - start) / n);

  // Price entering the window: last trade before it, else the first trade, else spot.
  let prev = priceOf(m);
  const before = all.filter((t) => t.at < start);
  if (before.length) prev = before[before.length - 1].price;
  else if (all.length) prev = all[0].price;

  const win = all.filter((t) => t.at >= start);
  const out: OHLC[] = [];
  let wi = 0;
  for (let b = 0; b < n; b++) {
    const be = start + (b + 1) * interval;
    const o = prev; // open carries the prior close → candles connect, gaps stay flat
    let h = o, l = o, c = o, v = 0;
    while (wi < win.length && win[wi].at < be) {
      const p = win[wi].price;
      h = Math.max(h, p); l = Math.min(l, p); c = p; v += win[wi].quote; wi++;
    }
    prev = c;
    out.push({ t: start + b * interval, o, h, l, c, v });
  }
  return out;
}

/* --- Limit orders (fill if marketable, else rest) + synthetic order book --- */

/** Max base qty executable before the AMM's marginal price crosses `limit`
 *  (constant product: price p = quote/base ⇒ at p=limit, base' = √(k/limit)). */
function qtyWithinLimit(m: Market, side: "buy" | "sell", limit: number): number {
  const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
  const k = base * quote;
  if (!(k > 0) || !(limit > 0)) return 0;
  const baseAtLimit = Math.sqrt(k / limit);
  return side === "buy" ? Math.max(0, base - baseAtLimit) : Math.max(0, baseAtLimit - base);
}

/** GROSS USDC that buys exactly `take` base off the curve — the average price sits
 *  below the marginal limit, so converting at the limit price would overpay and
 *  push the price PAST the limit. The USDC fee is netted out of the curve flow by
 *  executeSwap, so gross it up — EXCEPT for GRID-fee payers, whose full notional
 *  hits the curve (a GRID payer who falls back to USDC mid-swap lands marginally
 *  UNDER the limit, the safe side). */
function quoteInForBase(m: Market, user_id: string, take: number): number {
  const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
  const k = base * quote;
  if (!(k > 0) || !(take > 0) || take >= base) return 0;
  const net = k / (base - take) - quote;
  const paysGrid = !!Wallets.get(user_id).pay_fees_in_grid;
  return paysGrid ? net : net / (1 - Params.get("tradex_fee_bps") / 10000);
}

const FILL_DUST = 1e-6; // remainders below this count as fully filled

function fillCrossedOrders(market_id: string): void {
  const m = getMarket(market_id);
  if (!m) return;
  for (const o of (db.orders ??= [])) {
    if (o.status !== "open" || o.market_id !== market_id) continue;
    if (o.kind === "perp_entry") continue; // swept by Perps.settle, not the spot book
    const marketable = o.side === "buy" ? o.price >= priceOf(m) : o.price <= priceOf(m);
    if (!marketable) continue;
    // PARTIAL fill: execute only what keeps the marginal price within the limit;
    // the remainder keeps resting for the next cross.
    const remaining = o.qty - o.filled;
    const take = Math.min(remaining, qtyWithinLimit(m, o.side, o.price));
    if (!(take > FILL_DUST)) continue;
    const r = o.side === "buy" ? executeSwap(m, o.user_id, "buy", quoteInForBase(m, o.user_id, take)) : executeSwap(m, o.user_id, "sell", take);
    if (r.error) continue; // e.g. insufficient funds — leave it resting
    o.filled += o.side === "buy" ? (r.filled ?? take) : take;
    if (o.qty - o.filled <= FILL_DUST) { o.status = "filled"; o.filled = o.qty; }
    o.filled_at = nowISO(); // last (partial) execution moment
  }
}

export function placeLimit(market_id: string, user_id: string, side: "buy" | "sell", price: number, qty: number): { order?: LimitOrder; filled?: number; error?: string } {
  const m = getMarket(market_id);
  if (!m) return { error: "no_market" };
  if (!(price > 0) || !(qty > 0)) return { error: "bad_input" };
  const marketable = side === "buy" ? price >= priceOf(m) : price <= priceOf(m);
  let filledNow = 0;
  if (marketable) {
    // limit semantics even when immediate: execute only up to the limit price,
    // rest the remainder (true marketable-limit, not a market order in disguise)
    const take = Math.min(qty, qtyWithinLimit(m, side, price));
    if (take > 1e-6) {
      const r = side === "buy" ? executeSwap(m, user_id, "buy", quoteInForBase(m, user_id, take)) : executeSwap(m, user_id, "sell", take);
      if (r.error) return { error: r.error };
      filledNow = side === "buy" ? (r.filled ?? take) : take;
      Perps.settle(market_id);
    }
    if (qty - filledNow <= 1e-6) return { filled: filledNow };
  }
  const order: LimitOrder = { order_id: newId("ord"), market_id, user_id, side, price, qty, filled: filledNow, status: "open", created_at: nowISO(), ...(filledNow > 0 ? { filled_at: nowISO() } : {}) };
  (db.orders ??= []).push(order);
  return { order, ...(filledNow > 0 ? { filled: filledNow } : {}) };
}

export function cancelOrder(order_id: string, user_id: string): { order?: LimitOrder; error?: string } {
  const o = (db.orders ??= []).find((x) => x.order_id === order_id);
  if (!o) return { error: "not_found" };
  if (o.user_id !== user_id) return { error: "not_owner" };
  if (o.status !== "open") return { error: "not_open" };
  o.status = "cancelled";
  return { order: o };
}

export function ordersFor(market_id: string, user_id: string): LimitOrder[] {
  return (db.orders ??= []).filter((o) => o.market_id === market_id && o.user_id === user_id && o.status === "open");
}

export interface BookLevel { price: number; qty: number; total: number; }
/** Synthetic depth ladder from the AMM curve (base reserve at price p = √(k/p)). */
export function orderBook(market_id: string, levels = 13): { asks: BookLevel[]; bids: BookLevel[]; price: number } | null {
  const m = getMarket(market_id);
  if (!m) return null;
  const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
  const k = base * quote;
  const price = priceOf(m);
  const baseAt = (p: number) => Math.sqrt(k / p);
  const asks: BookLevel[] = [], bids: BookLevel[] = [];
  const step = 0.0018;
  for (let i = 1; i <= levels; i++) {
    const pa = price * (1 + i * step), qa = Math.abs(baseAt(price * (1 + (i - 1) * step)) - baseAt(pa));
    asks.push({ price: pa, qty: qa, total: qa * pa });
    const pb = price * (1 - i * step), qb = Math.abs(baseAt(price * (1 - (i - 1) * step)) - baseAt(pb));
    bids.push({ price: pb, qty: qb, total: qb * pb });
  }
  return { asks: asks.reverse(), bids, price };
}
