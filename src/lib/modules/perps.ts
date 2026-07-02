/**
 * Perps — leverage trading on a FUTURES-stage market (the top of the ladder).
 *
 * Mark price = the spot AMM (the oracle). Collateral (margin) is posted in USDC;
 * a position is liquidated when the loss eats the maintenance margin. PnL settles
 * back to the trader's wallet on close. Pre-mainnet accounting units; the design
 * is the on-chain perp shape (margin / mark / funding / liquidation).
 *
 * Only graduated (futures) markets unlock perps — leverage demands the deepest,
 * most manipulation-resistant book, which is exactly why the Futures gate is the
 * highest ($36M cap + $900K liquidity + GRID stake).
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Wallets from "./wallets";
import type { Position, PositionSide } from "../types";

export const MAX_LEVERAGE = 10;
const MMR = 0.005; // maintenance-margin buffer baked into the liquidation price

function store(): Position[] {
  return (db.positions ??= []);
}
function marketById(id: string) {
  return db.markets.find((m) => m.market_id === id);
}
/** Mark price from the spot AMM (the perp oracle). */
export function markPrice(market_id: string): number {
  const m = marketById(market_id);
  if (!m) return 0;
  const b = m.base_reserve ?? 0;
  return b > 0 ? (m.quote_reserve ?? 0) / b : m.price ?? 0;
}

export function pnlOf(p: Position, mark: number): number {
  return (mark - p.entry_price) * p.size * (p.side === "long" ? 1 : -1);
}

/* --- Funding: a skew carry. Mark = spot AMM, so there's no perp-vs-index premium
 *  to fund — the OI skew IS the imbalance. When the book is one-sided, the CROWDED
 *  side pays a periodic carry (→ the treasury/insurance fund), nudging it back to
 *  balance. Capped, hourly. --- */
const FUNDING_K = 0.01; // full one-sided skew ⇒ ~1%/interval before the cap
const FUNDING_MAX = 0.0075; // cap per interval (0.75%/h)
const FUNDING_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function openInterest(market_id: string): { long: number; short: number; net: number; total: number } {
  const mark = markPrice(market_id);
  let long = 0, short = 0;
  for (const p of store()) {
    if (p.status !== "open" || p.market_id !== market_id) continue;
    const notional = p.size * mark;
    if (p.side === "long") long += notional; else short += notional;
  }
  return { long, short, net: long - short, total: long + short };
}

/** Funding rate per interval from OI skew. >0 ⇒ longs are crowded and pay; <0 ⇒ shorts pay. */
export function fundingRate(market_id: string): number {
  const oi = openInterest(market_id);
  if (oi.total <= 0) return 0;
  return Math.max(-FUNDING_MAX, Math.min(FUNDING_MAX, FUNDING_K * (oi.net / oi.total)));
}

/** Funding summary for the terminal: rate, which side pays, OI, interval. */
export function funding(market_id: string) {
  const oi = openInterest(market_id);
  const rate = fundingRate(market_id);
  return { rate, pays: rate > 1e-9 ? "long" : rate < -1e-9 ? "short" : "none", long_oi: oi.long, short_oi: oi.short, interval_hours: FUNDING_INTERVAL_MS / 3_600_000 };
}

/** Accrue funding owed since this position last settled — only the crowded side
 *  pays, carry → treasury, capped at remaining margin (which can hit 0 → liquidation). */
function accrueFunding(p: Position, mark: number, rate: number, now: number): void {
  // First touch (e.g. a position that predates funding): start the clock now —
  // never back-charge funding for time before it was first settled.
  if (p.last_funding_at == null) { p.last_funding_at = new Date(now).toISOString(); return; }
  const intervals = (now - Date.parse(p.last_funding_at)) / FUNDING_INTERVAL_MS;
  if (!(intervals > 0)) return;
  p.last_funding_at = new Date(now).toISOString();
  const owes = (rate > 0 && p.side === "long") || (rate < 0 && p.side === "short");
  if (!owes) return;
  const fee = Math.min(Math.abs(rate) * (p.size * mark) * intervals, p.margin);
  if (!(fee > 0)) return;
  p.margin -= fee;
  p.funding_paid = (p.funding_paid ?? 0) + fee;
  Wallets.creditUsdc(Wallets.TREASURY, fee);
}

/** Settle a position to USDC at `mark` (margin already net of funding). Returns PnL. */
function closeAt(p: Position, mark: number, reason: "manual" | "liquidation" | "take_profit" | "stop_loss"): number {
  const pnl = pnlOf(p, mark);
  Wallets.creditUsdc(p.user_id, Math.max(0, p.margin + pnl));
  p.status = "closed";
  p.pnl = pnl;
  p.close_reason = reason;
  p.closed_at = nowISO();
  return pnl;
}

export function openPosition(market_id: string, user_id: string, side: PositionSide, collateral: number, leverage: number): { position?: Position; error?: string } {
  const m = marketById(market_id);
  if (!m) return { error: "no_market" };
  if (m.status !== "active") return { error: "market_paused" };
  if (m.stage !== "futures") return { error: "futures_only" };
  if (side !== "long" && side !== "short") return { error: "bad_side" };
  if (!(collateral > 0)) return { error: "bad_amount" };
  const lev = Math.max(1, Math.min(MAX_LEVERAGE, Math.floor(leverage || 1)));
  const entry = markPrice(market_id);
  if (!(entry > 0)) return { error: "no_price" };
  if (!Wallets.debitUsdc(user_id, collateral)) return { error: "insufficient_usdc" };
  const size = (collateral * lev) / entry;
  const liq = side === "long" ? entry * (1 - 1 / lev + MMR) : entry * (1 + 1 / lev - MMR);
  const pos: Position = {
    position_id: newId("pos"), market_id, user_id, side, size, leverage: lev, entry_price: entry,
    margin: collateral, liquidation_price: liq, status: "open", opened_at: nowISO(), last_funding_at: nowISO(),
  };
  store().push(pos);
  return { position: pos };
}

export function closePosition(position_id: string, user_id: string): { position?: Position; pnl?: number; error?: string } {
  const p = store().find((x) => x.position_id === position_id);
  if (!p) return { error: "not_found" };
  if (p.user_id !== user_id) return { error: "not_owner" };
  if (p.status !== "open") return { error: "not_open" };
  accrueFunding(p, markPrice(p.market_id), fundingRate(p.market_id), Date.now()); // settle funding to now
  const pnl = closeAt(p, markPrice(p.market_id), "manual");
  return { position: p, pnl };
}

/** Set / clear a position's take-profit and stop-loss triggers (both ⇒ OCO). */
export function setTriggers(position_id: string, user_id: string, tp: number | null | undefined, sl: number | null | undefined): { position?: Position; error?: string } {
  const p = store().find((x) => x.position_id === position_id);
  if (!p) return { error: "not_found" };
  if (p.user_id !== user_id) return { error: "not_owner" };
  if (p.status !== "open") return { error: "not_open" };
  if (tp !== undefined) p.take_profit = tp && tp > 0 ? tp : undefined;
  if (sl !== undefined) p.stop_loss = sl && sl > 0 ? sl : undefined;
  return { position: p };
}

/** Per-trade maintenance: accrue funding, then close any position whose trigger is
 *  crossed — liquidation (price hit or margin gone), take-profit, or stop-loss.
 *  Called by Markets.trade after each swap moves the price. */
export function settle(market_id: string): void {
  const mark = markPrice(market_id);
  const rate = fundingRate(market_id);
  const now = Date.now();
  for (const p of store()) {
    if (p.status !== "open" || p.market_id !== market_id) continue;
    accrueFunding(p, mark, rate, now);
    const liqHit = (p.side === "long" ? mark <= p.liquidation_price : mark >= p.liquidation_price) || p.margin <= 1e-9;
    if (liqHit) { p.status = "liquidated"; p.pnl = -p.margin; p.close_reason = "liquidation"; p.closed_at = nowISO(); continue; }
    const tpHit = p.take_profit != null && (p.side === "long" ? mark >= p.take_profit : mark <= p.take_profit);
    const slHit = p.stop_loss != null && (p.side === "long" ? mark <= p.stop_loss : mark >= p.stop_loss);
    if (tpHit) closeAt(p, mark, "take_profit");
    else if (slHit) closeAt(p, mark, "stop_loss");
  }
}

/** @deprecated alias — use settle(). Kept so existing call sites stay valid. */
export function checkLiquidations(market_id: string): void {
  settle(market_id);
}

export function openPositionsFor(market_id: string, user_id: string): Position[] {
  return store().filter((p) => p.market_id === market_id && p.user_id === user_id && p.status === "open");
}

/** Open positions enriched with the live mark + unrealized PnL, for the UI. */
export function positionView(market_id: string, user_id: string) {
  const mark = markPrice(market_id);
  return openPositionsFor(market_id, user_id).map((p) => ({ ...p, mark, upnl: pnlOf(p, mark) }));
}
