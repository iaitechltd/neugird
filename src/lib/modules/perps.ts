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
import type { LimitOrder, Position, PositionSide } from "../types";

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
function closeAt(p: Position, mark: number, reason: NonNullable<Position["close_reason"]>): number {
  const pnl = pnlOf(p, mark);
  Wallets.creditUsdc(p.user_id, Math.max(0, p.margin + pnl));
  p.status = "closed";
  p.pnl = pnl;
  p.close_reason = reason;
  p.closed_at = nowISO();
  return pnl;
}

/** Optional triggers attached when a position opens (entry-time TP/SL/trail). */
export interface EntryTriggers { take_profit?: number; stop_loss?: number; trailing_stop_pct?: number }

export function openPosition(market_id: string, user_id: string, side: PositionSide, collateral: number, leverage: number, triggers?: EntryTriggers): { position?: Position; error?: string } {
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
  // entry-time triggers (validated to the profitable/protective side of entry)
  if (triggers?.take_profit && triggers.take_profit > 0) pos.take_profit = triggers.take_profit;
  if (triggers?.stop_loss && triggers.stop_loss > 0) pos.stop_loss = triggers.stop_loss;
  if (triggers?.trailing_stop_pct && triggers.trailing_stop_pct > 0) {
    pos.trailing_stop_pct = Math.min(50, triggers.trailing_stop_pct);
    pos.trail_anchor = entry;
  }
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

/** Set / clear a position's take-profit / stop-loss / trailing-stop triggers
 *  (TP+SL ⇒ OCO; the trailing stop rides the best mark seen since it was set). */
export function setTriggers(position_id: string, user_id: string, tp: number | null | undefined, sl: number | null | undefined, trail_pct?: number | null): { position?: Position; error?: string } {
  const p = store().find((x) => x.position_id === position_id);
  if (!p) return { error: "not_found" };
  if (p.user_id !== user_id) return { error: "not_owner" };
  if (p.status !== "open") return { error: "not_open" };
  if (tp !== undefined) p.take_profit = tp && tp > 0 ? tp : undefined;
  if (sl !== undefined) p.stop_loss = sl && sl > 0 ? sl : undefined;
  if (trail_pct !== undefined) {
    if (trail_pct && trail_pct > 0) {
      p.trailing_stop_pct = Math.min(50, trail_pct);
      p.trail_anchor = markPrice(p.market_id); // trail starts from here, never from history
    } else {
      p.trailing_stop_pct = undefined;
      p.trail_anchor = undefined;
    }
  }
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
    // trailing stop: ratchet the anchor with the favorable extreme, close on pullback
    let trailHit = false;
    if (p.trailing_stop_pct != null) {
      const a = p.trail_anchor ?? mark;
      p.trail_anchor = p.side === "long" ? Math.max(a, mark) : Math.min(a, mark);
      const stop = p.side === "long" ? p.trail_anchor * (1 - p.trailing_stop_pct / 100) : p.trail_anchor * (1 + p.trailing_stop_pct / 100);
      trailHit = p.side === "long" ? mark <= stop : mark >= stop;
    }
    if (tpHit) closeAt(p, mark, "take_profit");
    else if (slHit) closeAt(p, mark, "stop_loss");
    else if (trailHit) closeAt(p, mark, "trailing_stop");
  }
  fillPerpEntries(market_id, mark);
}

/** Perp limit ENTRIES resting in the order book: open the position when the mark
 *  crosses the limit (long at-or-below, short at-or-above). Funds are debited at
 *  trigger time — if the wallet can't cover the collateral, the entry cancels. */
function fillPerpEntries(market_id: string, mark: number): void {
  for (const o of db.orders ?? []) {
    if (o.status !== "open" || o.kind !== "perp_entry" || o.market_id !== market_id) continue;
    const hit = o.pside === "long" ? mark <= o.price : mark >= o.price;
    if (!hit) continue;
    const r = openPosition(market_id, o.user_id, o.pside ?? "long", o.collateral ?? 0, o.leverage ?? 1, {
      take_profit: o.take_profit, stop_loss: o.stop_loss, trailing_stop_pct: o.trailing_stop_pct,
    });
    o.status = r.error ? "cancelled" : "filled";
    o.filled_at = nowISO();
  }
}

/** Rest a perp limit entry (or open immediately if the mark already satisfies it).
 *  Entry-time triggers ride along and attach the moment the position opens. */
export function placeLimitEntry(market_id: string, user_id: string, side: PositionSide, collateral: number, leverage: number, price: number, triggers?: EntryTriggers): { order?: LimitOrder; position?: Position; error?: string } {
  const m = marketById(market_id);
  if (!m) return { error: "no_market" };
  if (m.stage !== "futures") return { error: "futures_only" };
  if (!(price > 0) || !(collateral > 0)) return { error: "bad_input" };
  const mark = markPrice(market_id);
  if (side === "long" ? mark <= price : mark >= price) {
    const r = openPosition(market_id, user_id, side, collateral, leverage, triggers);
    if (r.error) return { error: r.error };
    return { position: r.position };
  }
  const order: LimitOrder = {
    order_id: newId("ord"), market_id, user_id,
    side: side === "long" ? ("buy" as const) : ("sell" as const),
    price, qty: 0, filled: 0, status: "open" as const, created_at: nowISO(),
    kind: "perp_entry" as const, pside: side, collateral, leverage: Math.max(1, Math.min(MAX_LEVERAGE, Math.floor(leverage || 1))),
    ...(triggers?.take_profit && triggers.take_profit > 0 ? { take_profit: triggers.take_profit } : {}),
    ...(triggers?.stop_loss && triggers.stop_loss > 0 ? { stop_loss: triggers.stop_loss } : {}),
    ...(triggers?.trailing_stop_pct && triggers.trailing_stop_pct > 0 ? { trailing_stop_pct: Math.min(50, triggers.trailing_stop_pct) } : {}),
  };
  (db.orders ??= []).push(order);
  return { order };
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
