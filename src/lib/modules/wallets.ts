/**
 * Wallets — pre-mainnet USDC + GRID balances for Trade.
 *
 * USDC is the trade quote; GRID is the platform token (stake-to-list, fee
 * discounts, governance). These are accounting units today; real Solana
 * settlement rides the chain adapters (Stage B). Dev users get a starting
 * balance on first touch so buying/selling/staking is live in the sandbox.
 */

import { db } from "../store";
import type { Wallet } from "../types";

const DEFAULT_USDC = 100_000; // dev faucet — DEMO MODE ONLY (staging/launch wallets start at 0)
const DEFAULT_GRID = 50_000;
// Mirrors session.ts demoMode(); read env directly — modules must stay
// next-free so the scratchpad harnesses can import them outside Next.
const demoFaucet = () => process.env.NEUGRID_DEMO !== "off";
export const TREASURY = "neugrid:treasury"; // protocol fee sink (starts empty)
export const INSURANCE = "neugrid:insurance"; // perp insurance fund — liquidation remainders in, bad debt out (can read negative = underwater)
export const ORDER_ESCROW = "neugrid:order-escrow"; // resting-order reservations (audit F7) — USDC held while limit orders rest

function store(): Wallet[] {
  return (db.wallets ??= []);
}

/** Fetch (or lazily create) a wallet. Protocol sinks ("neugrid:*") start empty. */
export function get(user_id: string): Wallet {
  // Guests (empty session id) read a transient zero wallet — never persisted.
  if (!user_id) return { user_id: "", usdc: 0, grid: 0 };
  let w = store().find((x) => x.user_id === user_id);
  if (!w) {
    const seeded = demoFaucet() && !user_id.startsWith("neugrid:");
    w = { user_id, usdc: seeded ? DEFAULT_USDC : 0, grid: seeded ? DEFAULT_GRID : 0 };
    store().push(w);
  }
  return w;
}

export function balances(user_id: string): { usdc: number; grid: number; starter_credit: number } {
  const w = get(user_id);
  return { usdc: w.usdc, grid: w.grid, starter_credit: w.starter_credit ?? 0 };
}

export function debitUsdc(user_id: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false; // reject NaN/±Inf/negative (ledger poison)
  const w = get(user_id);
  if (w.usdc < amount) return false;
  w.usdc -= amount;
  return true;
}
export function creditUsdc(user_id: string, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return; // never write NaN/Inf/negative into a balance
  get(user_id).usdc += amount;
}
/** Opt in/out of paying protocol fees in GRID (at the governable discount). */
export function setFeePref(user_id: string, on: boolean): Wallet {
  const w = get(user_id);
  w.pay_fees_in_grid = on;
  return w;
}

export function debitGrid(user_id: string, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false; // reject NaN/±Inf/negative (ledger poison)
  const w = get(user_id);
  if (w.grid < amount) return false;
  w.grid -= amount;
  return true;
}
export function creditGrid(user_id: string, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return; // never write NaN/Inf/negative into a balance
  get(user_id).grid += amount;
}

/* --- Starter Echo credit — the onboarding scholarship (non-transferable) ---
 * Spendable ONLY on Echo compute. The starter portion of a charge BURNS (it was
 * protocol-issued, never circulating GRID — so it must not credit the treasury
 * and can never be sold on the GRID market); only the real-GRID portion flows
 * to the treasury as usual. */

export interface ComputeCharge {
  starter: number; // paid from starter credit (burned)
  grid: number; // paid from real GRID (→ treasury, refundable from treasury)
}

/** Grant starter credit (one-time onboarding — gated by Onboarding.claimStarterGrant). */
export function grantStarterCredit(user_id: string, amount: number): void {
  const w = get(user_id);
  w.starter_credit = (w.starter_credit ?? 0) + amount;
}

/** Charge an Echo compute cost — starter credit first, real GRID for the rest.
 *  Returns the breakdown (so refunds restore each bucket), or null if short. */
export function debitCompute(user_id: string, amount: number): ComputeCharge | null {
  const w = get(user_id);
  const starterAvail = w.starter_credit ?? 0;
  const starter = Math.min(starterAvail, amount);
  const grid = amount - starter;
  if (w.grid < grid) return null;
  if (starter > 0) w.starter_credit = starterAvail - starter;
  w.grid -= grid;
  return { starter, grid };
}

/** Reverse a compute charge (synthesis failure) — each bucket goes back where it came from. */
export function refundCompute(user_id: string, charge: ComputeCharge): void {
  const w = get(user_id);
  if (charge.starter > 0) w.starter_credit = (w.starter_credit ?? 0) + charge.starter;
  w.grid += charge.grid;
}
