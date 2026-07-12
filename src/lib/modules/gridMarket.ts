/**
 * GRID/USDC market — the secondary, peer-to-peer way to ACQUIRE GRID.
 *
 * GRID is EARNED first (the Reward ledger) + SPENT on real utility (stake-to-list,
 * Echo compute). This AMM is the liquidity layer: a constant-product GRID/USDC pool
 * of PROTOCOL-OWNED (treasury-seeded) liquidity, so anyone who needs GRID to stake or
 * build can BUY it — and holders can sell — WITHOUT a primary token sale. The platform
 * never sells GRID; it hosts the market. Settles wallet USDC ↔ wallet GRID; a 1% fee
 * accrues to the treasury. Pre-mainnet accounting units; real Solana settlement = Stage B.
 */

import { db } from "../store";
import * as Wallets from "./wallets";
import * as Params from "./params";

const SEED_GRID = 5_000_000; // protocol-owned liquidity (treasury-seeded at the TGE)
const SEED_USDC = 500_000; // → opening price 0.10 USDC / GRID
const feeBps = () => Params.get("grid_market_fee_bps"); // GOVERNABLE swap fee (default 100 = 1%) → treasury

type Pool = { grid_reserve: number; usdc_reserve: number; burned: number };

function pool(): Pool {
  // burned tracks cumulative GRID removed from supply by buyback-and-burn.
  // The store type predates the field, so widen here and lazily init to 0
  // (pools rehydrated from persistence may not carry it yet).
  const p = (db.gridPool ??= { grid_reserve: SEED_GRID, usdc_reserve: SEED_USDC }) as Pool;
  p.burned ??= 0;
  return p;
}

/** USDC per GRID. */
export function price(): number {
  const p = pool();
  return p.grid_reserve > 0 ? p.usdc_reserve / p.grid_reserve : 0;
}

export type Side = "buy" | "sell"; // buy = USDC→GRID · sell = GRID→USDC

const pctImpact = (before: number, after: number) => (before > 0 ? Math.abs((after - before) / before) * 100 : 0);

/** Expected output for a swap, with fee + price impact (no state change). */
export function quote(side: Side, amount: number): { out: number; fee: number; price: number; impact: number; error?: string } {
  const p = pool();
  const before = price();
  if (!(amount > 0)) return { out: 0, fee: 0, price: before, impact: 0, error: "bad_amount" };
  const k = p.grid_reserve * p.usdc_reserve;
  if (side === "buy") {
    const fee = (amount * feeBps()) / 10000;
    const newUsdc = p.usdc_reserve + (amount - fee);
    const out = p.grid_reserve - k / newUsdc; // GRID out
    return { out, fee, price: before, impact: pctImpact(before, newUsdc / (p.grid_reserve - out)) };
  }
  const newGrid = p.grid_reserve + amount;
  const gross = p.usdc_reserve - k / newGrid; // USDC out (gross)
  const fee = (gross * feeBps()) / 10000;
  return { out: gross - fee, fee, price: before, impact: pctImpact(before, (p.usdc_reserve - gross) / newGrid) };
}

/** Execute a swap: wallet USDC ↔ wallet GRID against the pool; fee → treasury. */
export function swap(user_id: string, side: Side, amount: number): { out?: number; fee?: number; price?: number; error?: string } {
  const p = pool();
  if (!(amount > 0)) return { error: "bad_amount" };
  const k = p.grid_reserve * p.usdc_reserve;

  if (side === "buy") {
    if (Wallets.get(user_id).usdc < amount) return { error: "insufficient_usdc" };
    const fee = (amount * feeBps()) / 10000;
    const newUsdc = p.usdc_reserve + (amount - fee);
    const out = p.grid_reserve - k / newUsdc;
    if (!(out > 0)) return { error: "no_liquidity" };
    Wallets.debitUsdc(user_id, amount);
    Wallets.creditGrid(user_id, out);
    Wallets.creditUsdc(Wallets.TREASURY, fee);
    p.usdc_reserve = newUsdc;
    p.grid_reserve = k / newUsdc;
    return { out, fee, price: price() };
  }

  if (Wallets.get(user_id).grid < amount) return { error: "insufficient_grid" };
  const newGrid = p.grid_reserve + amount;
  const gross = p.usdc_reserve - k / newGrid;
  const fee = (gross * feeBps()) / 10000;
  const out = gross - fee;
  if (!(out > 0)) return { error: "no_liquidity" };
  Wallets.debitGrid(user_id, amount);
  Wallets.creditUsdc(user_id, out);
  Wallets.creditUsdc(Wallets.TREASURY, fee);
  p.grid_reserve = newGrid;
  p.usdc_reserve = k / newGrid;
  return { out, fee, price: price() };
}

/**
 * Buyback-and-burn: the treasury BUYS GRID off the pool with its USDC and BURNS
 * it (removes it from supply — the GRID is never credited to any wallet). Runs a
 * constant-product USDC→GRID swap with NO fee (the treasury is the buyer, so a
 * fee back to itself is a no-op). Conservation: treasury USDC → pool; pool GRID →
 * burned (supply shrinks); price (usdc_reserve/grid_reserve) rises.
 */
export function buybackAndBurn(usdcAmount: number): { usdc_spent?: number; grid_burned?: number; price?: number; error?: string } {
  if (!(usdcAmount > 0)) return { error: "bad_amount" };
  if (!Wallets.debitUsdc(Wallets.TREASURY, usdcAmount)) return { error: "insufficient_treasury_usdc" };
  const p = pool();
  const k = p.grid_reserve * p.usdc_reserve;
  const gridOut = p.grid_reserve - k / (p.usdc_reserve + usdcAmount);
  p.usdc_reserve += usdcAmount;
  p.grid_reserve -= gridOut;
  p.burned += gridOut; // BURNED — not credited to any wallet; cumulative supply reduction
  return { usdc_spent: usdcAmount, grid_burned: gridOut, price: price() };
}

/**
 * Scheduled buyback tick: spend `buyback_bps` of the treasury's USDC balance on a
 * buy-and-burn. Default buyback_bps = 0 ⇒ skipped ⇒ the treasury is never spent by
 * surprise; only a passed governance proposal arming buyback_bps > 0 turns it on.
 */
export function runBuyback(): { usdc_spent?: number; grid_burned?: number; price?: number; skipped?: boolean; error?: string } {
  const usdcAmount = Math.round((Wallets.balances(Wallets.TREASURY).usdc * Params.get("buyback_bps")) / 10000);
  if (usdcAmount >= 1) return buybackAndBurn(usdcAmount);
  return { skipped: true };
}

/** Pool + the caller's balances + their fee-discount opt-in, for the swap UI. */
export function state(user_id: string) {
  const p = pool();
  return {
    grid_reserve: p.grid_reserve, usdc_reserve: p.usdc_reserve, price: price(), liquidity_usd: 2 * p.usdc_reserve,
    burned: p.burned,
    balances: Wallets.balances(user_id),
    pay_fees_in_grid: Wallets.get(user_id).pay_fees_in_grid ?? false,
    fee_discount_bps: Params.get("grid_fee_discount_bps"),
  };
}

/** Pool stats without any user context (for the protocol-economy rollup). */
export function summary() {
  const p = pool();
  return { price: price(), liquidity_usd: 2 * p.usdc_reserve, grid_reserve: p.grid_reserve, usdc_reserve: p.usdc_reserve, burned: p.burned };
}
