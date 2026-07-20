/**
 * Markets (Axon / Trade) — the "amber half" of the lifecycle, GATED by graduation.
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
import * as Rewards from "./rewards";
import { Amm as ChainAmm } from "../chain";
import type { Audit, Backing, LimitOrder, Market, MarketStage, Token, Vesting } from "../types";

const INITIAL_SUPPLY = 1_000_000;
const SEED_LIQUIDITY = 10_000;

/* Backer allocation vesting: 20% unlocks at launch (day-one skin in the market),
 * the rest linear over 60 days (no cliff) — enough to blunt a day-one dump without
 * turning the reward into an IOU. The SHARE of supply is the governable
 * `backer_allocation_bps` Param; the vesting shape is a module constant. */
const BACKER_UPFRONT_BPS = 2000;
const BACKER_VEST_DAYS = 60;
// The founder vests LONGER than backers with a smaller unlock — alignment: the
// maker's upside arrives as the project keeps delivering, not at the bell.
const FOUNDER_UPFRONT_BPS = 1000;
const FOUNDER_VEST_DAYS = 90;

/* Stage gates (locked mechanism): real market cap (the Ascension Arc) + a real
 * liquidity floor + a community GRID stake (./staking). Earned, not bought. */
export const SPOT_MARKETCAP = 963_000; // Alpha → Spot cap target
export const FUTURES_MARKETCAP = 36_000_000; // Spot → Futures cap target
export const FUTURES_MIN_LIQUIDITY = 900_000; // deep book required for leverage
const SPOT_MIN_LIQ_RATIO = 0.08; // liquidity ≥ 8% of cap (anti thin-float gaming)
// Trade trade fee is GOVERNABLE — Params.get("tradex_fee_bps") (default 100 = 1%);
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
 *  - milestones: a Fund-funded project released ALL its milestones; OR
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
  // the REVIEWER earns their advertised merit (audit Wave 3: verification work
  // credited only the grid — the person who did the judging got nothing)
  Pulse.recordEvent({
    target_type: "user", target_id: reviewer_id, user_id: reviewer_id,
    action_type: "campaign_completed", weight: 15,
    reason: `Verified a security audit${grid ? ` for ${grid.name}` : ""} (${pass ? "passed" : "failed"})`,
    verification_source: "audit:review", dimension: "reviewer",
  });
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

  // BACKER ALLOCATION — the upside side of milestone funding. A share of supply
  // (governable `backer_allocation_bps`) is carved out BEFORE the pool is seeded
  // and owed pro-rata to the raise's backers: back early → own the earliest
  // position in the market your conviction created. Product-path launches (no
  // backers) put the full supply in the pool, unchanged.
  const backings = db.backings.filter((b) => b.grid_id === grid_id && !b.refunded);
  const backedTotal = backings.reduce((s, b) => s + b.amount, 0);
  const backerPool = backedTotal > 0 ? INITIAL_SUPPLY * (Params.get("backer_allocation_bps") / 10000) : 0;
  const launchedAt = nowISO();
  if (backerPool > 0) {
    for (const b of backings) {
      const alloc = backerPool * (b.amount / backedTotal);
      b.token_allocation = alloc;
      b.vesting = { start_at: launchedAt, cliff_days: 0, duration_days: BACKER_VEST_DAYS, released: 0, total: alloc, upfront_bps: BACKER_UPFRONT_BPS };
    }
  }
  // FOUNDER ALLOCATION — the payoff side of building (connectivity audit 2026-07-20:
  // without this, market success never reached the entrepreneur). A governable share
  // is carved BEFORE the pool, vested longer than the backers'. No mint — the pool
  // simply opens with the remainder, so supply conservation holds.
  const founderPool = INITIAL_SUPPLY * (Params.get("founder_allocation_bps") / 10000);
  const poolBase = INITIAL_SUPPLY - backerPool - founderPool;

  const market: Market = {
    market_id: newId("mkt"), token_id: token.token_id, grid_id, stage: "alpha",
    base_symbol: sym, quote_symbol: "USDC",
    base_reserve: poolBase, quote_reserve: SEED_LIQUIDITY, price: SEED_LIQUIDITY / poolBase,
    liquidity_usd: 2 * SEED_LIQUIDITY, holders: 0, volume: 0, status: "active", created_at: launchedAt,
    ...(founderPool > 0 ? { founder_allocation: { user_id: grid.owner_id, vesting: { start_at: launchedAt, cliff_days: 0, duration_days: FOUNDER_VEST_DAYS, released: 0, total: founderPool, upfront_bps: FOUNDER_UPFRONT_BPS } } } : {}),
  };
  db.markets.push(market);
  grid.lifecycle_stage = "alpha";
  grid.token_id = token.token_id;
  // T1 mirror: real SPL mint + on-chain pool, vaults seeded with the SAME
  // amounts the ledger opens with (audit F3 — reserves get real backing)
  void ChainAmm.launch(market, poolBase, SEED_LIQUIDITY);
  Pulse.recordEvent({ target_type: "grid", target_id: grid_id, action_type: "campaign_completed", weight: 40, reason: `Launched ${sym} on Alpha`, verification_source: "auto" });
  return { market, token };
}

/* --- Backer allocation: vesting math + claim (the tokens land in holdings) --- */

function vestedOf(v: Vesting, at = Date.now()): number {
  const start = Date.parse(v.start_at);
  const elapsedDays = Math.max(0, (at - start) / 86_400_000);
  if (elapsedDays < (v.cliff_days ?? 0)) return 0;
  const upfront = v.total * ((v.upfront_bps ?? 0) / 10000);
  const linear = (v.total - upfront) * Math.min(1, v.duration_days > 0 ? elapsedDays / v.duration_days : 1);
  return Math.min(v.total, upfront + linear);
}

export interface BackerAllocation {
  total: number;
  vested: number;
  claimed: number;
  claimable: number;
  vest_days: number;
  upfront_bps: number;
}
/** The caller's project-token allocation on a market (null = wasn't a backer). */
export function backerAllocation(market_id: string, user_id: string): BackerAllocation | null {
  const m = getMarket(market_id);
  if (!m) return null;
  const mine = db.backings.filter((b) => b.grid_id === m.grid_id && b.backer_id === user_id && !b.refunded && (b.token_allocation ?? 0) > 0 && b.vesting);
  if (!mine.length) return null;
  const total = mine.reduce((s, b) => s + (b.token_allocation ?? 0), 0);
  const vested = mine.reduce((s, b) => s + vestedOf(b.vesting as Vesting), 0);
  const claimed = mine.reduce((s, b) => s + (b.vesting?.released ?? 0), 0);
  return { total, vested, claimed, claimable: Math.max(0, vested - claimed), vest_days: BACKER_VEST_DAYS, upfront_bps: BACKER_UPFRONT_BPS };
}

/** Claim every vested-but-unclaimed backer token into a real, tradable holding. */
export function claimBackerAllocation(market_id: string, user_id: string): { claimed?: number; holding?: number; error?: string } {
  const m = getMarket(market_id);
  if (!m) return { error: "not_found" };
  const mine: Backing[] = db.backings.filter((b) => b.grid_id === m.grid_id && b.backer_id === user_id && !b.refunded && (b.token_allocation ?? 0) > 0 && b.vesting);
  if (!mine.length) return { error: "no_allocation" };
  let claimTotal = 0;
  for (const b of mine) {
    const v = b.vesting as Vesting;
    const due = vestedOf(v) - (v.released ?? 0);
    if (due > 1e-9) { v.released = (v.released ?? 0) + due; claimTotal += due; }
  }
  if (claimTotal <= 1e-9) return { error: "nothing_vested" };
  let holding = db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id);
  if (!holding) { holding = { market_id, user_id, base: 0 }; db.holdings.push(holding); }
  holding.base += claimTotal;
  m.holders = recountHolders(market_id);
  return { claimed: claimTotal, holding: holding.base };
}

/** The founder's vested carve on a market (null unless the caller IS the founder). */
export function founderAllocation(market_id: string, user_id: string): BackerAllocation | null {
  const m = getMarket(market_id);
  const fa = m?.founder_allocation;
  if (!m || !fa || fa.user_id !== user_id) return null;
  const vested = vestedOf(fa.vesting);
  return { total: fa.vesting.total, vested, claimed: fa.vesting.released ?? 0, claimable: Math.max(0, vested - (fa.vesting.released ?? 0)), vest_days: FOUNDER_VEST_DAYS, upfront_bps: FOUNDER_UPFRONT_BPS };
}

/** Claim the founder's vested-but-unclaimed tokens into a real, tradable holding. */
export function claimFounderAllocation(market_id: string, user_id: string): { claimed?: number; holding?: number; error?: string } {
  const m = getMarket(market_id);
  const fa = m?.founder_allocation;
  if (!m || !fa || fa.user_id !== user_id) return { error: "no_allocation" };
  const due = vestedOf(fa.vesting) - (fa.vesting.released ?? 0);
  if (due <= 1e-9) return { error: "nothing_vested" };
  fa.vesting.released = (fa.vesting.released ?? 0) + due;
  let holding = db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id);
  if (!holding) { holding = { market_id, user_id, base: 0 }; db.holdings.push(holding); }
  holding.base += due;
  m.holders = recountHolders(market_id);
  return { claimed: due, holding: holding.base };
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
    void ChainAmm.swap(m, "buy", net); // T1 mirror: the net curve movement hits the real vaults
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
  if (!gridFee) Wallets.creditUsdc(Wallets.TREASURY, feeUsdc - Staking.distributeFees(m.grid_id, (feeUsdc * Staking.STAKER_FEE_SHARE_BPS) / 10000));
  m.volume = (m.volume ?? 0) + quoteOut;
  m.price = m.quote_reserve / m.base_reserve;
  m.holders = recountHolders(m.market_id);
  m.liquidity_usd = 2 * m.quote_reserve;
  db.trades.unshift({ market_id: m.market_id, user_id, side, base: amount, quote: quoteOut, price: m.price, at: nowISO() });
  void ChainAmm.swap(m, "sell", amount); // T1 mirror: the base into the real vaults, quote out
  return { filled: net, fee: gridFee ? 0 : feeUsdc, fee_in: gridFee ? "grid" : "usdc", fee_grid: gridFee?.grid, fee_saved: gridFee?.saved };
}

/** Projected |price impact| of a market swap (constant product: price moves with
 *  the SQUARE of the reserve ratio). Used by the circuit breaker BEFORE executing. */
export function priceImpactOf(m: Market, side: "buy" | "sell", amount: number): number {
  const base = m.base_reserve ?? 0, quote = m.quote_reserve ?? 0;
  if (!(base > 0) || !(quote > 0) || !(amount > 0)) return 0;
  if (side === "buy") {
    // full notional = the upper bound (GRID-fee payers put the whole amount on
    // the curve; USDC payers slightly less) — the breaker errs on the safe side
    const ratio = (quote + amount) / quote;
    return ratio * ratio - 1;
  }
  const ratio = base / (base + amount);
  return 1 - ratio * ratio;
}

export function trade(market_id: string, user_id: string, side: "buy" | "sell", amount: number): SwapResult & { market?: Market } {
  const m = getMarket(market_id);
  if (!m) return { error: "no_market" };
  if (m.status !== "active") return { error: "inactive" };
  if (!(amount > 0)) return { error: "bad_amount" };
  // CIRCUIT BREAKER (audit F2): one market order may not move the pool price more
  // than the governable cap — blunts oracle manipulation + fat fingers alike.
  const capBps = Params.get("max_trade_impact_bps");
  if (capBps > 0 && Math.abs(priceImpactOf(m, side, amount)) * 10000 > capBps) {
    return { error: "price_impact" };
  }
  const r = executeSwap(m, user_id, side, amount);
  if (r.error) return { error: r.error };
  // reward the trader a fraction of the FEE they paid, as GRID (fee-based ⇒
  // farm-resistant: a wash trade pays more in fees than it earns back). Rewards.
  const feeUsd = r.fee_in === "grid" ? (r.fee_grid ?? 0) * GridMarket.price() : (r.fee ?? 0);
  Rewards.rewardTrade(user_id, feeUsd);
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
  const marketGate = prog.marketcap >= prog.capTarget && prog.liqOk;
  const stakeGate = Staking.stakeMet(m.grid_id, next);
  if (!marketGate) {
    const reason = prog.marketcap < prog.capTarget ? `reach $${prog.capTarget.toLocaleString()} market cap (${prog.capPct}%)` : "needs a deeper liquidity floor";
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
/** Report a launched market as fraudulent. DISPUTE QUORUM: a single accusation
 *  only registers a report — the halt + stake-slash fires when
 *  Params.fraud_flag_quorum DISTINCT non-founder Verifiers agree. */
export function flagFraud(market_id: string, reviewer_id: string, reason?: string): { market?: Market; slashed?: number; count?: number; flags?: number; needed?: number; tripped?: boolean; error?: string } {
  const m = getMarket(market_id);
  if (!m) return { error: "no_market" };
  if (m.status === "paused") return { error: "already_flagged" };
  // Identity gate: only a REAL, distinct user counts toward the quorum — reject
  // unknown/reserved ids so arbitrary cookie identities can't stack fraud flags.
  if (!reviewer_id || reviewer_id.startsWith("system:") || reviewer_id.startsWith("neugrid:") || !db.users.some((u) => u.id === reviewer_id)) return { error: "invalid_reviewer" };
  const grid = db.grids.find((g) => g.grid_id === m.grid_id);
  if (grid && grid.owner_id === reviewer_id) return { error: "founder_cannot_flag" };
  const flags = (m.fraud_flags ??= []);
  if (flags.some((f) => f.reviewer_id === reviewer_id)) return { error: "already_flagged_by_you" };
  const why = (reason && reason.trim().slice(0, 200)) || "Flagged fraudulent by a Verifier";
  flags.push({ reviewer_id, reason: why, at: nowISO() });

  const needed = Params.get("fraud_flag_quorum");
  if (flags.length < needed) return { market: m, flags: flags.length, needed, tripped: false };

  const slash = Staking.slashStakes(m.grid_id, why);
  m.status = "paused";
  void ChainAmm.halt(m, true); // T1 mirror: freeze the on-chain pool too
  if (grid) {
    grid.lifecycle_stage = "failed";
    Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "spam_penalty", weight: -60, reason: `Fraud quorum reached (${flags.length} Verifiers) — ${slash.count} listing stake(s) slashed (${slash.slashed.toLocaleString()} GRID forfeited)`, verification_source: `reviewer:${reviewer_id}` });
  }
  return { market: m, slashed: slash.slashed, count: slash.count, flags: flags.length, needed, tripped: true };
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
    if (o.side === "buy") {
      const needed = quoteInForBase(m, o.user_id, take);
      if (o.escrow_quote != null) {
        // escrowed order (audit F7): funds come from the reservation, never the wallet
        const release = Math.min(needed, o.escrow_quote);
        if (!(release > 0) || !Wallets.debitUsdc(Wallets.ORDER_ESCROW, release)) continue;
        Wallets.creditUsdc(o.user_id, release);
        const r = executeSwap(m, o.user_id, "buy", release);
        if (r.error) { Wallets.debitUsdc(o.user_id, release); Wallets.creditUsdc(Wallets.ORDER_ESCROW, release); continue; }
        o.escrow_quote -= release;
        o.filled += r.filled ?? take;
      } else {
        const r = executeSwap(m, o.user_id, "buy", needed); // legacy pre-escrow order
        if (r.error) continue;
        o.filled += r.filled ?? take;
      }
    } else {
      if (o.escrow_base != null) {
        const release = Math.min(take, o.escrow_base);
        if (!(release > FILL_DUST)) continue;
        let holding = db.holdings.find((h) => h.market_id === m.market_id && h.user_id === o.user_id);
        if (!holding) { holding = { market_id: m.market_id, user_id: o.user_id, base: 0 }; db.holdings.push(holding); }
        holding.base += release; // hand the escrowed tokens back for the swap to consume
        const r = executeSwap(m, o.user_id, "sell", release);
        if (r.error) { holding.base -= release; continue; }
        o.escrow_base -= release;
        o.filled += release;
      } else {
        const r = executeSwap(m, o.user_id, "sell", take); // legacy pre-escrow order
        if (r.error) continue;
        o.filled += take;
      }
    }
    if (o.qty - o.filled <= FILL_DUST) {
      o.status = "filled";
      o.filled = o.qty;
      refundOrderEscrow(o); // any worst-case reservation left over goes home
    }
    o.filled_at = nowISO(); // last (partial) execution moment
  }
}

/** Return whatever escrow an order still holds — on cancel or completion. */
function refundOrderEscrow(o: LimitOrder): void {
  if (o.escrow_quote && o.escrow_quote > 1e-9 && Wallets.debitUsdc(Wallets.ORDER_ESCROW, o.escrow_quote)) {
    Wallets.creditUsdc(o.user_id, o.escrow_quote);
  }
  o.escrow_quote = 0;
  if (o.escrow_base && o.escrow_base > 1e-9) {
    let holding = db.holdings.find((h) => h.market_id === o.market_id && h.user_id === o.user_id);
    if (!holding) { holding = { market_id: o.market_id, user_id: o.user_id, base: 0 }; db.holdings.push(holding); }
    holding.base += o.escrow_base;
  }
  o.escrow_base = 0;
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
      // CIRCUIT BREAKER (audit F2): the immediate marketable fill goes through the
      // curve just like a market order, so it gets the SAME impact cap as trade().
      // (The resting non-marketable remainder is exempt — bounded by its limit price.)
      const swapAmount = side === "buy" ? quoteInForBase(m, user_id, take) : take;
      const capBps = Params.get("max_trade_impact_bps");
      if (capBps > 0 && Math.abs(priceImpactOf(m, side, swapAmount)) * 10000 > capBps) return { error: "price_impact" };
      const r = executeSwap(m, user_id, side, swapAmount);
      if (r.error) return { error: r.error };
      filledNow = side === "buy" ? (r.filled ?? take) : take;
      Perps.settle(market_id);
    }
    if (qty - filledNow <= 1e-6) return { filled: filledNow };
  }
  // ESCROW-ON-PLACE (audit F7): the resting remainder reserves its funds now —
  // buys lock the worst-case USDC (limit price + fee, the upper bound since the
  // average fill price sits at-or-under the limit), sells lock the base tokens.
  // Leftover escrow refunds on completion/cancel.
  const rest = qty - filledNow;
  let escrow_quote: number | undefined;
  let escrow_base: number | undefined;
  if (side === "buy") {
    const reserve = rest * price * (1 + Params.get("tradex_fee_bps") / 10000);
    if (!Wallets.debitUsdc(user_id, reserve)) return { error: "insufficient_usdc" };
    Wallets.creditUsdc(Wallets.ORDER_ESCROW, reserve);
    escrow_quote = reserve;
  } else {
    const holding = db.holdings.find((h) => h.market_id === market_id && h.user_id === user_id);
    if (!holding || holding.base < rest) return { error: "insufficient_balance" };
    holding.base -= rest;
    escrow_base = rest;
  }
  const order: LimitOrder = { order_id: newId("ord"), market_id, user_id, side, price, qty, filled: filledNow, status: "open", created_at: nowISO(), escrow_quote, escrow_base, ...(filledNow > 0 ? { filled_at: nowISO() } : {}) };
  (db.orders ??= []).push(order);
  return { order, ...(filledNow > 0 ? { filled: filledNow } : {}) };
}

export function cancelOrder(order_id: string, user_id: string): { order?: LimitOrder; error?: string } {
  const o = (db.orders ??= []).find((x) => x.order_id === order_id);
  if (!o) return { error: "not_found" };
  if (o.user_id !== user_id) return { error: "not_owner" };
  if (o.status !== "open") return { error: "not_open" };
  o.status = "cancelled";
  refundOrderEscrow(o); // reservation goes straight home (audit F7)
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
