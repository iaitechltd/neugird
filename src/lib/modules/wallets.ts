/**
 * Wallets — pre-mainnet USDC + GRID balances for TradeX.
 *
 * USDC is the trade quote; GRID is the platform token (stake-to-list, fee
 * discounts, governance). These are accounting units today; real Solana
 * settlement rides the chain adapters (Stage B). Dev users get a starting
 * balance on first touch so buying/selling/staking is live in the sandbox.
 */

import { db } from "../store";
import type { Wallet } from "../types";

const DEFAULT_USDC = 100_000; // dev faucet
const DEFAULT_GRID = 50_000;
export const TREASURY = "neugrid:treasury"; // protocol fee sink (starts empty)

function store(): Wallet[] {
  return (db.wallets ??= []);
}

/** Fetch (or lazily create) a wallet. Protocol sinks ("neugrid:*") start empty. */
export function get(user_id: string): Wallet {
  let w = store().find((x) => x.user_id === user_id);
  if (!w) {
    const sink = user_id.startsWith("neugrid:");
    w = { user_id, usdc: sink ? 0 : DEFAULT_USDC, grid: sink ? 0 : DEFAULT_GRID };
    store().push(w);
  }
  return w;
}

export function balances(user_id: string): { usdc: number; grid: number } {
  const w = get(user_id);
  return { usdc: w.usdc, grid: w.grid };
}

export function debitUsdc(user_id: string, amount: number): boolean {
  const w = get(user_id);
  if (w.usdc < amount) return false;
  w.usdc -= amount;
  return true;
}
export function creditUsdc(user_id: string, amount: number): void {
  get(user_id).usdc += amount;
}
/** Opt in/out of paying protocol fees in GRID (at the governable discount). */
export function setFeePref(user_id: string, on: boolean): Wallet {
  const w = get(user_id);
  w.pay_fees_in_grid = on;
  return w;
}

export function debitGrid(user_id: string, amount: number): boolean {
  const w = get(user_id);
  if (w.grid < amount) return false;
  w.grid -= amount;
  return true;
}
export function creditGrid(user_id: string, amount: number): void {
  get(user_id).grid += amount;
}
