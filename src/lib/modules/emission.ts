/**
 * GRID emissions — the CONTINUOUS, post-TGE mint from the fixed community pool.
 *
 * "Keep minting from usage, forever, within the 36.9B cap": each EPOCH a slice of
 * the REMAINING community pool is released and split among that epoch's earners in
 * proportion to the GRID they earned that epoch (Rewards.pointsSince). Two
 * properties fall out:
 *   • AGGREGATE emission tapers — the budget is bps of what's LEFT, so it
 *     asymptotes toward the pool and never exceeds the cap ("mints ~forever").
 *   • INDIVIDUAL earnings scale with activity — your share of the epoch = your
 *     activity / everyone's activity ("the more you contribute, the bigger your
 *     slice"). Zero activity ⇒ nothing emits; the epoch rolls forward.
 *
 * Runs after the TGE (real GRID is liquid then); previewable before it, and
 * force-settleable in demo so the mechanism is visible.
 *
 * NOTE: supply.ts reads `db.emission.emitted_total` DIRECTLY (not via this module)
 * so the fixed-cap picture stays honest without a circular import.
 */

import { db } from "../store";
import { nowISO } from "../id";
import { GridToken } from "../chain";
import * as Params from "./params";
import * as Rewards from "./rewards";
import * as Supply from "./supply";
import * as Wallets from "./wallets";

const DAY = 86_400_000;
const BOARD_CAP = 100_000; // max earners considered per epoch — SAME in preview + settle so the displayed split matches the payout

export interface EmissionEpoch { epoch: number; settled_at: string; budget: number; recipients: number }
interface EmissionState { epoch: number; epoch_start: string; emitted_total: number; history: EmissionEpoch[] }

/** Lazy-seed the singleton (kept out of seed()/normalize like gridPool/tge). */
function em(): EmissionState {
  return (db.emission ??= { epoch: 1, epoch_start: nowISO(), emitted_total: 0, history: [] }) as EmissionState;
}

/** GRID still unreleased in the community pool — the hard bound on every emission.
 *  Uses Supply.mintedByActivity() (frozen TGE snapshot + emissions post-TGE, live
 *  points pre-TGE) so post-TGE pulse — which IS the emission input — is not
 *  double-debited against the pool. */
export function remainingPool(): number {
  return Math.max(0, Supply.pools().community - Supply.mintedByActivity());
}

/** This epoch's release budget = bps of what's LEFT in the community pool. */
function epochBudget(): number {
  return Math.floor(remainingPool() * (Params.get("emission_epoch_bps") / 10_000));
}

/** The current epoch's live state + the projected split for the top earners. */
export function state() {
  const e = em();
  const days = Params.get("emission_epoch_days");
  const elapsed = Date.now() - Date.parse(e.epoch_start);
  const board = Rewards.leaderboardSince(e.epoch_start, BOARD_CAP);
  const totalActivity = board.reduce((s, b) => s + b.points, 0);
  const budget = epochBudget();
  return {
    epoch: e.epoch,
    epoch_start: e.epoch_start,
    epoch_days: days,
    ends_in_days: Math.max(0, Math.ceil((days * DAY - elapsed) / DAY)),
    elapsed_pct: Math.max(0, Math.min(100, Math.round((elapsed / (days * DAY)) * 100))),
    budget,
    remaining_pool: remainingPool(),
    emitted_total: e.emitted_total,
    epochs_run: Math.max(0, e.epoch - 1),
    active_earners: board.length,
    epoch_activity: Math.round(totalActivity),
    tge_executed: Rewards.tgeState().executed,
    projected: board.slice(0, 8).map((b) => ({
      id: b.id,
      username: b.username,
      activity: Math.round(b.points),
      share_pct: totalActivity > 0 ? b.points / totalActivity : 0,
      grid: totalActivity > 0 ? Math.floor(budget * (b.points / totalActivity)) : 0,
    })),
    history: e.history.slice(0, 12),
  };
}

/** Settle the current epoch → distribute the budget by activity share, credit
 *  wallets, record it, advance. Auto (non-force) requires the TGE + an elapsed
 *  epoch; `force` is the demo trigger. Never mints past the remaining pool. */
export function settle(force = false): { settled: boolean; epoch?: number; budget?: number; recipients?: number; reason?: string } {
  const e = em();
  const days = Params.get("emission_epoch_days");
  const elapsed = Date.now() - Date.parse(e.epoch_start);
  if (!force && !Rewards.tgeState().executed) return { settled: false, reason: "pre_tge" };
  if (!force && elapsed < days * DAY) return { settled: false, reason: "epoch_not_elapsed" };

  const board = Rewards.leaderboardSince(e.epoch_start, BOARD_CAP);
  const totalActivity = board.reduce((s, b) => s + b.points, 0);
  if (totalActivity <= 0) { e.epoch_start = nowISO(); return { settled: false, reason: "no_activity" }; }

  const budget = epochBudget();
  if (budget <= 0) { e.epoch_start = nowISO(); return { settled: false, reason: "pool_exhausted" }; }

  let distributed = 0;
  let recipients = 0;
  for (const b of board) {
    if (!(b.points > 0)) continue;
    const grid = Math.floor(budget * (b.points / totalActivity));
    if (grid <= 0) continue;
    Wallets.creditGrid(b.id, grid); // release from the pool → real, liquid wallet GRID
    const u = db.users.find((x) => x.id === b.id);
    void GridToken.claim(u?.wallet_addresses?.[0] ?? "", grid); // chain mirror (guarded, pseudo-wallets skip)
    distributed += grid;
    recipients += 1;
  }
  e.emitted_total += distributed;
  e.history.unshift({ epoch: e.epoch, settled_at: nowISO(), budget: distributed, recipients });
  if (e.history.length > 60) e.history.length = 60;
  e.epoch += 1;
  e.epoch_start = nowISO();
  return { settled: true, epoch: e.epoch - 1, budget: distributed, recipients };
}

/** DEMO-only: undo emissions for a clean supply view — claw the released GRID
 *  back from the caller (the demo's sole recipient) and reset the counter to the
 *  UN-clawed residual so supply accounting stays conserved even if the caller
 *  wasn't the only recipient (emitted_total then still reflects GRID actually out). */
export function resetDemo(uid: string): { reset: true; clawed: number } {
  const emitted = em().emitted_total;
  const clawed = emitted > 0 ? Math.min(emitted, Wallets.balances(uid).grid) : 0;
  if (clawed > 0) Wallets.debitGrid(uid, clawed);
  db.emission = { epoch: 1, epoch_start: nowISO(), emitted_total: Math.max(0, emitted - clawed), history: [] };
  return { reset: true, clawed };
}
