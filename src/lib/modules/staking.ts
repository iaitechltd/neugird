/**
 * Stake-to-list — GRID locked to graduate a market to its next stage.
 *
 * A project ascends Alpha→Spot→Futures only when BOTH gates clear: the market
 * gate (cap + liquidity, in ./markets) AND a community GRID stake (here). The
 * stake IS a stake-weighted listing vote — the founder + community lock GRID to
 * vouch for a project. Locked GRID earns a share of that market's fees (TODO)
 * and is slashable on fraud (TODO). Listing is therefore earned (real demand +
 * real conviction), not bought — and this is GRID's core utility/sink.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Wallets from "./wallets";
import type { ListingStake } from "../types";

export type StageTarget = "spot" | "futures";

/** GRID that must be locked behind a project to unlock each stage. */
export const STAKE_REQUIRED: Record<StageTarget, number> = { spot: 5_000, futures: 50_000 };
const LOCK_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2-year listing commitment
/** Share of each trade fee routed to a market's GRID stakers (rest → protocol). */
export const STAKER_FEE_SHARE_BPS = 4_000; // 40%

function store(): ListingStake[] {
  return (db.listingStakes ??= []);
}

export function stakesFor(grid_id: string, stage?: StageTarget): ListingStake[] {
  return store().filter((s) => s.grid_id === grid_id && !s.released && (!stage || s.stage_target === stage));
}

/** Protocol-wide stake totals for the economy rollup: GRID locked + GRID slashed. */
export function protocolSummary(): { staked: number; slashed: number; feesEarned: number } {
  const all = store();
  return {
    staked: all.filter((s) => !s.released).reduce((a, s) => a + s.amount, 0),
    slashed: all.filter((s) => s.slashed).reduce((a, s) => a + s.amount, 0),
    feesEarned: all.reduce((a, s) => a + (s.fees_earned ?? 0), 0),
  };
}
export function stakedFor(grid_id: string, stage: StageTarget): number {
  return stakesFor(grid_id, stage).reduce((a, s) => a + s.amount, 0);
}
export function stakeMet(grid_id: string, stage: StageTarget): boolean {
  return stakedFor(grid_id, stage) >= STAKE_REQUIRED[stage];
}

export interface ListingProgress {
  staked: number;
  required: number;
  pct: number;
  met: boolean;
  backers: number;
}
export function listingProgress(grid_id: string, stage: StageTarget): ListingProgress {
  const staked = stakedFor(grid_id, stage);
  const required = STAKE_REQUIRED[stage];
  return {
    staked,
    required,
    pct: Math.min(100, Math.round((staked / required) * 100)),
    met: staked >= required,
    backers: new Set(stakesFor(grid_id, stage).map((s) => s.staker_id)).size,
  };
}

/** Route a USDC fee-share to a market's active GRID stakers, pro-rata by stake.
 *  Returns the amount actually distributed (0 if there are no stakers → caller
 *  keeps the remainder for the protocol). */
export function distributeFees(grid_id: string, amount: number): number {
  if (!(amount > 0)) return 0;
  const stakes = stakesFor(grid_id); // active, across both stage targets
  const total = stakes.reduce((a, s) => a + s.amount, 0);
  if (total <= 0) return 0;
  let distributed = 0;
  for (const s of stakes) {
    const share = amount * (s.amount / total);
    s.fees_earned = (s.fees_earned ?? 0) + share;
    Wallets.creditUsdc(s.staker_id, share);
    distributed += share;
  }
  return distributed;
}

/** Total USDC fee-share a user has earned from staking this market. */
export function feesEarnedFor(grid_id: string, user_id: string): number {
  return store().filter((s) => s.grid_id === grid_id && s.staker_id === user_id).reduce((a, s) => a + (s.fees_earned ?? 0), 0);
}

/** A user's stakes on this market (active first), for the unstake UI. */
export function myStakes(grid_id: string, user_id: string): ListingStake[] {
  return store().filter((s) => s.grid_id === grid_id && s.staker_id === user_id).sort((a, b) => Number(!!a.released) - Number(!!b.released));
}

export function stakeForListing(
  grid_id: string,
  market_id: string,
  user_id: string,
  amount: number,
  stage_target: StageTarget,
): { stake?: ListingStake; error?: string } {
  if (stage_target !== "spot" && stage_target !== "futures") return { error: "bad_stage" };
  if (!(amount > 0)) return { error: "bad_amount" };
  if (!Wallets.debitGrid(user_id, amount)) return { error: "insufficient_grid" };
  const stake: ListingStake = {
    stake_id: newId("stk"),
    grid_id,
    market_id,
    staker_id: user_id,
    amount,
    stage_target,
    locked_until: new Date(Date.now() + LOCK_MS).toISOString(),
    released: false,
    created_at: nowISO(),
  };
  store().push(stake);
  return { stake };
}

/**
 * Slash every active listing stake on a market — the "slashable on fraud" half of
 * stake-to-list. The vouchers FORFEIT their locked GRID (it never returns; it's
 * swept to the protocol sink, not credited back). Called when a market is found
 * fraudulent / fails a post-launch audit. Returns the GRID forfeited + stake count.
 */
export function slashStakes(grid_id: string, reason: string): { slashed: number; count: number } {
  const active = stakesFor(grid_id); // active = not yet released/slashed
  let slashed = 0;
  for (const s of active) {
    s.released = true; // drops out of the active set (no fee-share, can't unstake)
    s.slashed = true;
    s.slashed_at = nowISO();
    s.slash_reason = reason;
    Wallets.creditGrid(Wallets.TREASURY, s.amount); // forfeited GRID → protocol sink
    slashed += s.amount;
  }
  return { slashed, count: active.length };
}

/** Release a matured stake — return the locked GRID to the staker. */
export function releaseStake(stake_id: string, user_id: string): { stake?: ListingStake; error?: string } {
  const s = store().find((x) => x.stake_id === stake_id);
  if (!s) return { error: "not_found" };
  if (s.staker_id !== user_id) return { error: "not_owner" };
  if (s.released) return { error: "already_released" };
  if (Date.parse(s.locked_until) > Date.now()) return { error: "still_locked" };
  s.released = true;
  Wallets.creditGrid(user_id, s.amount);
  return { stake: s };
}
