/**
 * GRID supply — the canonical, FIXED-CAP picture of the platform token.
 *
 * 36.9B GRID, minted ONLY by verified activity (earned, not sold). Nothing is
 * ever printed past the cap — "continuous minting from usage" means the community
 * pool is RELEASED gradually as people earn, never inflated beyond TOTAL_SUPPLY.
 * This module is the single source of truth for "how much exists, how much has
 * been minted by real work, how much circulates, how much is left to earn" —
 * surfaced on /rewards (the supply hero) + /home.
 *
 * NOTE: the on-chain devnet GRID mint is 1B (a cosmetic pre-mainnet placeholder,
 * see contracts.md / [[contracts]]); the real TGE mint targets this 36.9B. The
 * platform display is the design source of truth; the chain mint reconciles at
 * the mainnet TGE.
 */

import { db } from "../store";
import * as Rewards from "./rewards";
import * as GridMarket from "./gridMarket";

/** Fixed maximum supply (founder-set 2026-07-13). A hard ceiling — released only
 *  by earning, never printed past this. */
export const TOTAL_SUPPLY = 36_900_000_000;

/** The TGE allocation split (Option A — no raise; contributor-heavy). The
 *  community bucket is what verified activity draws from, released over ~10y.
 *  Sums to 1.0. Governable later; constants for now. */
export const SPLIT = {
  community: 0.6, // earned by verified contribution, released over ~10y
  treasury: 0.25, // protocol-owned liquidity + perp insurance + ops
  team: 0.12, // long vest
  liquidity: 0.03, // initial market liquidity
} as const;

/** The four supply buckets, in absolute GRID. */
export function pools() {
  return {
    community: Math.round(TOTAL_SUPPLY * SPLIT.community),
    treasury: Math.round(TOTAL_SUPPLY * SPLIT.treasury),
    team: Math.round(TOTAL_SUPPLY * SPLIT.team),
    liquidity: Math.round(TOTAL_SUPPLY * SPLIT.liquidity),
  };
}

/** GRID actually claimed into wallets (real, liquid GRID converted from earned
 *  allocation). Pre-TGE this is 0 — allocation is non-transferable points. */
function claimedTotal(): number {
  return Math.round((db.users ?? []).reduce((s, u) => s + (u.reward?.claimed ?? 0), 0));
}

/** Total GRID minted by activity — the base for `minted` and emission.remainingPool.
 *  PRE-TGE it's the live points sum; POST-TGE it's the FROZEN TGE snapshot
 *  (db.tge.converted, capped to the pool + inclusive of affiliate GRID) so post-TGE
 *  pulse — which now feeds emissions — is never double-counted. Plus epoch emissions. */
export function mintedByActivity(): number {
  const emitted = Math.round(db.emission?.emitted_total ?? 0);
  const frozen = db.tge?.executed ? Math.round(db.tge.converted ?? 0) : Rewards.totalIssued().allocation;
  return frozen + emitted;
}

/** The canonical supply rollup — every number honest and derived from the ledger,
 *  the users' claims, and the live GRID market. */
export function state() {
  const p = pools();
  const issued = Rewards.totalIssued(); // recipients + the pre-TGE points figure
  const emitted = Math.round(db.emission?.emitted_total ?? 0); // post-TGE epoch emissions already released
  const minted = mintedByActivity(); // frozen at TGE + emissions — never double-counts post-TGE pulse
  const gm = GridMarket.summary();
  const claimed = claimedTotal();
  const burned = Math.round(gm.burned ?? 0);
  const liquidityGrid = Math.round(gm.grid_reserve ?? 0); // GRID sitting in the live AMM (tradeable)
  // Circulating = claimed earned GRID + epoch emissions + protocol market liquidity.
  // The POL already reflects any buyback-burn (grid_reserve DROPS when GRID is bought
  // off the pool and burned), so `burned` must NOT be subtracted again here.
  const circulating = Math.max(0, claimed + emitted + liquidityGrid);
  return {
    total_supply: TOTAL_SUPPLY,
    split: SPLIT,
    pools: p,
    minted, // minted by activity so far (earned allocation, pre + post TGE)
    emitted, // of which released by post-TGE epoch emissions
    minted_pct_of_pool: p.community > 0 ? Math.min(1, minted / p.community) : 0, // how far into the community pool (clamped)
    recipients: issued.recipients,
    claimed, // converted to real wallet GRID
    circulating, // liquid GRID incl. protocol-owned liquidity
    circulating_pct: TOTAL_SUPPLY > 0 ? circulating / TOTAL_SUPPLY : 0,
    burned, // removed from supply by buyback-and-burn
    liquidity_grid: liquidityGrid,
    community_remaining: Math.max(0, p.community - minted), // still to be earned
    tge_executed: Rewards.tgeState().executed,
    price_usd: gm.price,
    market_cap_usd: Math.round(circulating * gm.price),
  };
}
