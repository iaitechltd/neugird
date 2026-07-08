/**
 * Agent Mode — autonomous trading under a scoped MANDATE.
 *
 * Toggle Agent Mode on a market and an agent trades it on the owner's behalf,
 * across whichever stage the market is in (alpha / spot / futures), strictly
 * within a mandate: budget, max position, max leverage, allowed stages, a
 * stop-loss + daily-loss kill, an expiry, and an instant kill-switch.
 *
 * The agent acts on the OWNER's wallet — this is non-custodial scoped authority,
 * never pooling (the mandate is the consent boundary; `memory/crypto-rails.md`).
 * Every action is enforced server-side BEFORE touching `Markets`/`Perps` and is
 * recorded to an attributed activity feed. Fuses SentientX with Trade.
 *
 * The RUNNER is tick-based: each `runTick` evaluates the strategy and executes at
 * most one guardrailed action. Today ticks are driven by the open market terminal
 * (the UI polls while you watch); the same entrypoint is the seam for a server-
 * side scheduler (cron) to make it 24/7. Strategy is native rule-based here, or
 * "external" (the agent decides via the SDK/MCP and drives the gateway).
 */

import { db } from "../store";
import { MandateChain } from "../chain";
import { newId, nowISO } from "../id";
import * as Markets from "./markets";
import * as Perps from "./perps";
import * as Agents from "./agents";
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { AgentAction, AgentActionKind, Mandate, MandateStrategy, MarketStage, Position, TradeRiskGrade } from "../types";

/* --- tunables (the native playbooks; deterministic off live market state) --- */
const MIN_TICK_SECONDS = 6; // rate-limit: at most one action per ~6s of polling
const DCA_TRANCHES = 6; // a DCA budget is deployed in ~6 clips
const MOMENTUM_BUY_PCT = 2.5; // recent change% that triggers a momentum buy
const MOMENTUM_SELL_PCT = -2.5; // recent change% that triggers de-risking
const PERP_TRIGGER_PCT = 3; // |change%| that opens a hedged perp
const DEFAULT_PERP_LEVERAGE = 3; // conservative default when the cap allows it
const ALL_STAGES: MarketStage[] = ["alpha", "spot", "futures"];

function mandates(): Mandate[] {
  return (db.mandates ??= []);
}
function actions(): AgentAction[] {
  return (db.agentActions ??= []);
}

export function getMandate(id: string): Mandate | undefined {
  return mandates().find((m) => m.mandate_id === id);
}
export function mandatesForMarket(market_id: string): Mandate[] {
  return mandates().filter((m) => m.market_id === market_id);
}
/** The owner's single live mandate on a market (Agent Mode is one-agent-per-market). */
export function activeMandate(market_id: string, owner_id: string): Mandate | undefined {
  return mandates().find((m) => m.market_id === market_id && m.owner_id === owner_id && m.status === "active");
}
export function mandatesForOwner(owner_id: string): Mandate[] {
  return mandates().filter((m) => m.owner_id === owner_id);
}
export function mandatesForAgent(agent_id: string): Mandate[] {
  return mandates().filter((m) => m.agent_id === agent_id);
}

/* ----------------------------- create / stop ----------------------------- */

export interface CreateMandateInput {
  market_id: string;
  owner_id: string;
  agent_id: string;
  budget_usdc: number;
  max_position_usd?: number;
  max_leverage?: number;
  allowed_stages?: MarketStage[];
  stop_loss_pct?: number; // 0..1
  daily_loss_cap?: number;
  strategy?: MandateStrategy;
  duration_hours?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Authorize an agent to trade a market under a bounded mandate. Replaces (kills)
 *  any existing active mandate the owner had on this market. */
export function createMandate(input: CreateMandateInput): { mandate?: Mandate; error?: string } {
  const market = Markets.getMarket(input.market_id);
  if (!market) return { error: "no_market" };
  const agent = Agents.getAgent(input.agent_id);
  if (!agent) return { error: "agent_not_found" };
  // Native strategies arm YOUR OWN agent. The "external" strategy is also the
  // HIRE door: arm someone else's (trusted) agent to trade your wallet — it earns
  // a governable performance fee on positive realized PnL (see bookPosition).
  const hired = agent.owner_id !== input.owner_id;
  if (hired && input.strategy !== "external") return { error: "not_owner" };
  if (hired && agent.trust_tier !== "trusted") return { error: "hired_agent_not_trusted" };
  if (agent.status === "suspended" || agent.trust_tier === "suspended") return { error: "agent_suspended" };

  const budget = Number(input.budget_usdc);
  if (!(budget > 0)) return { error: "bad_budget" };
  const maxPos = input.max_position_usd && input.max_position_usd > 0 ? Number(input.max_position_usd) : Math.max(1, budget / DCA_TRANCHES);
  const maxLev = clamp(Math.floor(input.max_leverage ?? 1), 1, Perps.MAX_LEVERAGE);
  const stages = (input.allowed_stages?.length ? input.allowed_stages : [market.stage]).filter((s) => ALL_STAGES.includes(s));
  if (!stages.length) return { error: "no_stages" };
  const stopLoss = clamp(input.stop_loss_pct ?? 0.25, 0.01, 1);
  const dailyLoss = Math.max(0, input.daily_loss_cap ?? budget * 0.5);
  const strategy: MandateStrategy = input.strategy ?? "dca";
  const hours = clamp(input.duration_hours ?? 24, 1, 24 * 30);
  const expiry = new Date(Date.now() + hours * 3_600_000).toISOString();

  // One live mandate per (market, owner) — supersede the previous.
  const existing = activeMandate(input.market_id, input.owner_id);
  if (existing) stopMandate(existing.mandate_id, input.owner_id, "replaced");

  const mandate: Mandate = {
    mandate_id: newId("mnd"),
    market_id: market.market_id,
    grid_id: market.grid_id,
    agent_id: agent.agent_id,
    owner_id: input.owner_id,
    budget_usdc: budget,
    max_position_usd: Math.min(maxPos, budget),
    max_leverage: maxLev,
    allowed_stages: stages,
    stop_loss_pct: stopLoss,
    daily_loss_cap: dailyLoss,
    strategy,
    expiry,
    status: "active",
    deployed_usdc: 0,
    position_base: 0,
    realized_pnl: 0,
    trades_count: 0,
    created_at: nowISO(),
  };
  mandates().push(mandate);
  agent.status = "active";
  void MandateChain.create(mandate.mandate_id, mandate.budget_usdc, mandate.max_position_usd, mandate.expiry); // chain mirror
  record(mandate, { kind: "hold", ok: true, rationale: `Mandate armed — ${strategy} · $${budget.toLocaleString()} budget · ${maxLev}× max · stages ${stages.join("/")}` });
  return { mandate };
}

/** The kill-switch. Halts new actions; existing holdings/positions stay the
 *  owner's to manage. Returns the stopped mandate. */
export function stopMandate(mandate_id: string, owner_id: string, reason = "user_kill"): { mandate?: Mandate; error?: string } {
  const m = getMandate(mandate_id);
  if (!m) return { error: "not_found" };
  if (m.owner_id !== owner_id) return { error: "not_owner" };
  if (m.status !== "active") return { mandate: m };
  m.status = reason === "expired" ? "expired" : "stopped";
  m.stopped_at = nowISO();
  m.stop_reason = reason;
  void MandateChain.kill(m.mandate_id); // chain mirror — blocks the chain wallet + reclaims
  // Cancel any resting limit orders the agent left working for this owner+market.
  for (const o of Markets.ordersFor(m.market_id, owner_id)) Markets.cancelOrder(o.order_id, owner_id);
  record(m, { kind: "stop", ok: true, rationale: reason === "user_kill" ? "Kill-switch — owner stopped Agent Mode" : `Stopped (${reason})` });
  recomputeTradingRating(m.agent_id);
  return { mandate: m };
}

/* ------------------------------- guardrails ------------------------------ */
// Server-side risk boundary. Every planned action is checked HERE before any
// funds move — budget, position cap, leverage cap, stage, expiry, daily-loss.

export interface Planned {
  kind: AgentActionKind;
  side?: "buy" | "sell" | "long" | "short";
  amount?: number; // USDC for buy/margin, base tokens for sell
  notional?: number; // USD value the cap is checked against
  leverage?: number;
  rationale: string;
}

/** Realized PnL booked today (UTC) for this mandate — drives the daily-loss kill. */
export function realizedToday(mandate_id: string): number {
  const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
  return actions()
    .filter((a) => a.mandate_id === mandate_id && a.pnl != null && new Date(a.at).getTime() >= dayStart)
    .reduce((s, a) => s + (a.pnl ?? 0), 0);
}

export function guardrailCheck(m: Mandate, p: Planned): { ok: boolean; reason?: string } {
  if (m.status !== "active") return { ok: false, reason: "mandate_inactive" };
  if (new Date(m.expiry).getTime() <= Date.now()) return { ok: false, reason: "mandate_expired" };
  const market = Markets.getMarket(m.market_id);
  if (!market) return { ok: false, reason: "no_market" };
  if (!m.allowed_stages.includes(market.stage)) return { ok: false, reason: "stage_not_allowed" };
  const notional = p.notional ?? p.amount ?? 0;
  const addsRisk = p.kind === "buy" || p.kind === "open_long" || p.kind === "open_short";
  // Position + budget caps gate risk-ADDING actions only; sells/closes de-risk
  // and must never be blocked (e.g. a stop-loss exiting a position > max_position).
  if (addsRisk && notional > m.max_position_usd + 1e-6) return { ok: false, reason: "over_max_position" };
  if (addsRisk && consumed(m) + notional > m.budget_usdc + 1e-6) return { ok: false, reason: "over_budget" };
  if ((p.kind === "open_long" || p.kind === "open_short") && (p.leverage ?? 1) > m.max_leverage + 1e-6) {
    return { ok: false, reason: "over_max_leverage" };
  }
  if (m.daily_loss_cap > 0 && -realizedToday(m.mandate_id) >= m.daily_loss_cap) return { ok: false, reason: "daily_loss_cap" };
  return { ok: true };
}

/* --- Pre-trade simulation + risk grading (agentic-wallet style) ---
 * Before a risk-ADDING action runs, project its market impact and grade it. A
 * "critical" grade is auto-BLOCKED even if it's inside the mandate caps — the
 * mandate bounds intent, the risk grade catches a locally-legal but dangerous
 * fill (a thin pool the trade would move violently, near-max leverage into a
 * tiny liquidation buffer, or the last sliver of budget). Returns null for
 * de-risking actions (sell/close/hold never blocked). */
export interface TradeSim {
  price_impact_pct: number; // how far this trade moves the AMM price (0..1)
  budget_after_pct: number; // mandate budget utilization after this trade (0..1)
  leverage_ratio: number; // leverage / max_leverage (perps; 0 for spot)
  grade: TradeRiskGrade;
}
export function simulateTrade(m: Mandate, p: Planned): TradeSim | null {
  const addsRisk = p.kind === "buy" || p.kind === "open_long" || p.kind === "open_short";
  if (!addsRisk) return null;
  const market = Markets.getMarket(m.market_id);
  if (!market) return null;
  const notional = p.notional ?? p.amount ?? 0;
  // AMM price impact: for a `notional` USDC buy against x*y=k, how far price moves.
  const Q = market.quote_reserve ?? 0, B = market.base_reserve ?? 0;
  let price_impact_pct = 0;
  if (Q > 0 && B > 0 && notional > 0) {
    const k = Q * B;
    const baseOut = B - k / (Q + notional); // tokens the pool gives out
    const newPrice = (Q + notional) / (B - baseOut);
    const oldPrice = Q / B;
    price_impact_pct = oldPrice > 0 ? Math.max(0, newPrice / oldPrice - 1) : 0;
  }
  const budget_after_pct = m.budget_usdc > 0 ? Math.min(2, (consumed(m) + notional) / m.budget_usdc) : 0;
  const leverage_ratio = (p.kind === "open_long" || p.kind === "open_short") && m.max_leverage > 0
    ? (p.leverage ?? 1) / m.max_leverage : 0;

  // Escalate to the worst signal. Thresholds are deliberately conservative.
  let grade: TradeRiskGrade = "low";
  const bump = (g: TradeRiskGrade) => { const order: TradeRiskGrade[] = ["low", "medium", "high", "critical"]; if (order.indexOf(g) > order.indexOf(grade)) grade = g; };
  if (price_impact_pct >= 0.05) bump("medium");
  if (price_impact_pct >= 0.12) bump("high");
  if (price_impact_pct >= 0.20) bump("critical");
  if (budget_after_pct >= 0.90) bump("medium");
  if (budget_after_pct >= 0.99) bump("high");
  if (leverage_ratio >= 0.9) bump("high");
  if (leverage_ratio >= 0.999 && price_impact_pct >= 0.10) bump("critical"); // max leverage into a thin pool
  return { price_impact_pct, budget_after_pct, leverage_ratio, grade };
}

/** Guardrail then execute one planned action — the SHARED path for both the
 *  native runner and external (gateway-driven) trades, so enforcement is identical.
 *  A blocked action is still recorded (with the reason) for the activity feed. */
function actOn(m: Mandate, plan: Planned): AgentAction {
  if (plan.kind === "hold") {
    // Dedupe consecutive holds so the feed isn't flooded with "holding" rows
    // (and an external agent's real trades aren't buried under native-tick holds).
    const last = actions().find((a) => a.mandate_id === m.mandate_id);
    if (last && last.kind === "hold") { m.last_action_at = nowISO(); return last; }
    return record(m, { kind: "hold", ok: true, rationale: plan.rationale });
  }
  // Pre-trade simulation + risk grade (agentic-wallet style). A CRITICAL grade is
  // blocked even when the action is inside the mandate caps.
  const sim = simulateTrade(m, plan);
  const simRec = sim ? { price_impact_pct: sim.price_impact_pct, budget_after_pct: sim.budget_after_pct, leverage_ratio: sim.leverage_ratio } : undefined;
  if (sim && sim.grade === "critical") {
    return record(m, { kind: plan.kind, ok: false, rationale: plan.rationale, detail: "risk_critical", risk_grade: sim.grade, sim: simRec });
  }
  const gate = guardrailCheck(m, plan);
  if (!gate.ok) return record(m, { kind: plan.kind, ok: false, rationale: plan.rationale, detail: gate.reason, risk_grade: sim?.grade, sim: simRec });
  const action = execute(m, plan);
  if (sim) { action.risk_grade = sim.grade; action.sim = simRec; }
  return action;
}

/* -------------------------------- the runner ----------------------------- */

function record(m: Mandate, a: Partial<AgentAction> & { kind: AgentActionKind; ok: boolean; rationale: string }): AgentAction {
  const action: AgentAction = {
    action_id: newId("act"),
    mandate_id: m.mandate_id,
    market_id: m.market_id,
    agent_id: m.agent_id,
    kind: a.kind,
    rationale: a.rationale,
    amount: a.amount,
    price: a.price,
    pnl: a.pnl,
    ok: a.ok,
    detail: a.detail,
    risk_grade: a.risk_grade,
    sim: a.sim,
    at: nowISO(),
  };
  actions().unshift(action);
  m.last_action_at = action.at;
  return action;
}

/** This agent's own open perp positions on the market (attributed via mandate). */
function agentPositions(m: Mandate): Position[] {
  return Perps.openPositionsFor(m.market_id, m.owner_id).filter((p) => p.mandate_id === m.mandate_id);
}

/** Margin locked in the agent's currently-open perp positions (derived, so it
 *  frees automatically when a position closes OR is liquidated). */
function openPerpMargin(m: Mandate): number {
  return agentPositions(m).reduce((s, p) => s + p.margin, 0);
}
/** Budget consumed = spot cost basis + perp margin at work. */
function consumed(m: Mandate): number {
  return m.deployed_usdc + openPerpMargin(m);
}

const remainingBudget = (m: Mandate) => Math.max(0, m.budget_usdc - consumed(m));
const clipSize = (m: Mandate) => Math.min(m.max_position_usd, Math.max(0, m.budget_usdc / DCA_TRANCHES), remainingBudget(m));

/**
 * Advance the mandate one step: enforce circuit breakers, ask the strategy for a
 * decision, guardrail it, execute it, and record the outcome. Returns the action
 * taken (or a skip when throttled / paused). Safe to call repeatedly (idempotent
 * within the rate-limit window).
 */
export function runTick(mandate_id: string): { action?: AgentAction; skipped?: string; mandate?: Mandate } {
  const m = getMandate(mandate_id);
  if (!m) return { skipped: "not_found" };
  if (m.status !== "active") return { skipped: m.status, mandate: m };

  // Expiry.
  if (new Date(m.expiry).getTime() <= Date.now()) {
    stopMandate(m.mandate_id, m.owner_id, "expired");
    return { mandate: m, skipped: "expired" };
  }
  // Rate-limit so UI polling can't over-trade.
  if (m.last_action_at && Date.now() - new Date(m.last_action_at).getTime() < MIN_TICK_SECONDS * 1000) {
    return { skipped: "throttled", mandate: m };
  }
  // Daily-loss kill-switch.
  if (m.daily_loss_cap > 0 && -realizedToday(m.mandate_id) >= m.daily_loss_cap) {
    const a = record(m, { kind: "stop", ok: true, rationale: `Daily-loss cap hit ($${m.daily_loss_cap.toLocaleString()}) — standing down` });
    stopMandate(m.mandate_id, m.owner_id, "daily_loss");
    return { action: a, mandate: m };
  }

  // Book any position closed OUTSIDE the runner (liquidation) — frees budget +
  // lets the loss count toward the daily-loss kill.
  const booked = reconcilePositions(m);
  if (booked) return { action: booked, mandate: m };

  // Circuit breaker: cut losers past the stop-loss before opening anything new.
  const breaker = enforceStopLoss(m);
  if (breaker) return { action: breaker, mandate: m };

  return { action: actOn(m, decide(m)), mandate: m };
}

/**
 * The 24/7 sweep: advance every active NATIVE mandate one step. The scheduler
 * sibling of the terminal-driven `/agent/tick` — an armed agent keeps trading
 * with the terminal closed. External-strategy mandates are skipped (the outside
 * agent drives itself via the gateway; a recorded "hold" would be pure noise).
 * `runTick`'s own throttles/breakers make this safe to run on any cadence.
 */
export function tickAll(): { scanned: number; acted: number; traded: number; skipped: number } {
  const active = mandates().filter((m) => m.status === "active" && m.strategy !== "external");
  let acted = 0, traded = 0, skipped = 0;
  for (const m of active) {
    const r = runTick(m.mandate_id);
    if (r.action) {
      acted++;
      if (r.action.kind !== "hold" && r.action.ok) traded++;
    } else skipped++;
  }
  return { scanned: active.length, acted, traded, skipped };
}

/** Close any agent position whose loss has breached the mandate stop-loss, and on
 *  spot, dump the agent's bag if its value has fallen past the stop-loss. Returns
 *  the action if one fired (one breaker per tick). */
function enforceStopLoss(m: Mandate): AgentAction | undefined {
  const mark = Markets.priceOf(Markets.getMarket(m.market_id)!);
  for (const p of agentPositions(m)) {
    if (Perps.pnlOf(p, mark) <= -m.stop_loss_pct * p.margin) {
      const a = closeAgentPosition(m, p, `Stop-loss — ${p.side} down past ${(m.stop_loss_pct * 100).toFixed(0)}%, closed`);
      if (a) return a;
    }
  }
  if (m.position_base > 1e-9 && m.deployed_usdc > 0) {
    const value = m.position_base * mark;
    if (value <= (1 - m.stop_loss_pct) * m.deployed_usdc) {
      return execute(m, { kind: "sell", side: "sell", amount: m.position_base, notional: value, rationale: `Stop-loss — bag down past ${(m.stop_loss_pct * 100).toFixed(0)}%, exiting` });
    }
  }
  return undefined;
}

/** Close one of the agent's perp positions and book its realized PnL into the mandate. */
function closeAgentPosition(m: Mandate, p: Position, rationale: string): AgentAction | undefined {
  const r = Perps.closePosition(p.position_id, m.owner_id);
  if (r.error) return undefined;
  return bookPosition(m, p, rationale);
}

/** Book a (now-closed/liquidated) agent position's realized PnL into the mandate.
 *  HIRED-TRADER performance fee: when the trading agent belongs to someone OTHER
 *  than the wallet owner, a governable cut of POSITIVE realized PnL
 *  (Params.agent_perf_fee_bps) moves from the wallet owner to the agent — split
 *  with the agent's owner by its standard owner_split_bps. Losses pay nothing. */
function bookPosition(m: Mandate, p: Position, rationale: string): AgentAction {
  p.pnl_booked = true;
  const pnl = p.pnl ?? 0;
  m.realized_pnl += pnl;
  m.trades_count += 1;
  let feeNote = "";
  const agent = Agents.getAgent(m.agent_id);
  if (pnl > 0 && agent && agent.owner_id && agent.owner_id !== m.owner_id) {
    const fee = Math.round(pnl * Params.get("agent_perf_fee_bps")) / 10000;
    if (fee > 0 && Wallets.debitUsdc(m.owner_id, fee)) {
      const ownerCut = Math.round((fee * (agent.owner_split_bps ?? 0)) / 10000);
      agent.earnings = (agent.earnings ?? 0) + Math.max(0, fee - ownerCut);
      if (ownerCut > 0) Wallets.creditUsdc(agent.owner_id, ownerCut);
      feeNote = ` · perf fee $${fee.toFixed(2)} → ${agent.name}`;
    }
  }
  const a = record(m, { kind: "close", ok: true, price: Markets.priceOf(Markets.getMarket(m.market_id)!), pnl, rationale: `${rationale} (PnL $${pnl.toFixed(2)}${feeNote})` });
  recomputeTradingRating(m.agent_id);
  return a;
}

/** Book positions closed outside the runner (liquidations) so budget frees and
 *  the loss is realized. One per tick. */
function reconcilePositions(m: Mandate): AgentAction | undefined {
  const orphan = (db.positions ?? []).find((p) => p.mandate_id === m.mandate_id && p.status !== "open" && !p.pnl_booked);
  if (!orphan) return undefined;
  return bookPosition(m, orphan, orphan.status === "liquidated" ? "Position liquidated — margin lost" : "Position closed");
}

/* ------------------------------- strategies ------------------------------ */
// Native, deterministic playbooks read live market state. "external" yields to
// the agent's own model (driven via the gateway), so the runner just holds.

function decide(m: Mandate): Planned {
  const market = Markets.getMarket(m.market_id)!;
  const stage = market.stage;
  const stats = Markets.tradeStats(m.market_id);
  const change = stats.change; // recent % change over the trade window

  if (m.strategy === "external") return { kind: "hold", rationale: "External strategy — awaiting the agent's signal via the gateway" };

  // Hedge = perps; only on a futures-stage market with leverage headroom.
  if (m.strategy === "hedge") {
    if (stage !== "futures") return { kind: "hold", rationale: `Hedge strategy idle — market is ${stage}, not futures` };
    if (m.max_leverage < 2) return { kind: "hold", rationale: "Hedge needs leverage headroom (max 1×) — holding" };
    if (agentPositions(m).length > 0) return { kind: "hold", rationale: "Position open — managing to stop-loss / target" };
    const clip = clipSize(m);
    if (clip <= 0) return { kind: "hold", rationale: "Budget fully deployed — holding" };
    const lev = Math.min(m.max_leverage, DEFAULT_PERP_LEVERAGE);
    if (change >= PERP_TRIGGER_PCT) return { kind: "open_long", side: "long", amount: clip, notional: clip, leverage: lev, rationale: `Momentum +${change.toFixed(1)}% → long ${lev}× ($${clip.toFixed(0)} margin)` };
    if (change <= -PERP_TRIGGER_PCT) return { kind: "open_short", side: "short", amount: clip, notional: clip, leverage: lev, rationale: `Momentum ${change.toFixed(1)}% → short ${lev}× ($${clip.toFixed(0)} margin)` };
    return { kind: "hold", rationale: `Flat momentum (${change.toFixed(1)}%) — waiting for a ${PERP_TRIGGER_PCT}% move` };
  }

  // Momentum = spot: buy strength, de-risk weakness.
  if (m.strategy === "momentum") {
    const clip = clipSize(m);
    if (change >= MOMENTUM_BUY_PCT && clip > 0) return { kind: "buy", side: "buy", amount: clip, notional: clip, rationale: `Momentum +${change.toFixed(1)}% → buy $${clip.toFixed(0)}` };
    if (change <= MOMENTUM_SELL_PCT && m.position_base > 1e-9) {
      const sell = m.position_base * 0.5;
      return { kind: "sell", side: "sell", amount: sell, notional: sell * Markets.priceOf(market), rationale: `Momentum ${change.toFixed(1)}% → trim 50% of the position` };
    }
    return { kind: "hold", rationale: `Momentum ${change.toFixed(1)}% within band — holding` };
  }

  // DCA (default) = spot: deploy the budget in clips, then hold.
  const clip = clipSize(m);
  if (clip <= 0) return { kind: "hold", rationale: "DCA complete — budget deployed, holding the position" };
  const tranche = Math.floor(m.deployed_usdc / Math.max(1, m.budget_usdc / DCA_TRANCHES)) + 1;
  return { kind: "buy", side: "buy", amount: clip, notional: clip, rationale: `DCA tranche ${Math.min(tranche, DCA_TRANCHES)}/${DCA_TRANCHES} → buy $${clip.toFixed(0)}` };
}

/* -------------------------------- execution ------------------------------ */
// All trades route through Markets/Perps on the OWNER's wallet, post-guardrail.

function execute(m: Mandate, p: Planned): AgentAction {
  const market = Markets.getMarket(m.market_id)!;
  const mark = Markets.priceOf(market);

  if (p.kind === "buy") {
    const r = Markets.trade(m.market_id, m.owner_id, "buy", p.amount ?? 0);
    if (r.error) return record(m, { kind: "buy", ok: false, amount: p.amount, rationale: p.rationale, detail: r.error });
    m.deployed_usdc += p.amount ?? 0;
    m.position_base += r.filled ?? 0;
    m.trades_count += 1;
    void MandateChain.spend(m.mandate_id, p.amount ?? 0); // chain mirror
    return record(m, { kind: "buy", ok: true, amount: p.amount, price: Markets.priceOf(market), rationale: p.rationale });
  }

  if (p.kind === "sell") {
    const sellBase = Math.min(p.amount ?? 0, m.position_base);
    if (!(sellBase > 0)) return record(m, { kind: "sell", ok: false, rationale: p.rationale, detail: "no_position" });
    const costFraction = m.position_base > 0 ? (m.deployed_usdc * sellBase) / m.position_base : 0;
    const r = Markets.trade(m.market_id, m.owner_id, "sell", sellBase);
    if (r.error) return record(m, { kind: "sell", ok: false, amount: sellBase, rationale: p.rationale, detail: r.error });
    const proceeds = r.filled ?? 0; // net USDC out
    const pnl = proceeds - costFraction;
    m.position_base = Math.max(0, m.position_base - sellBase);
    m.deployed_usdc = Math.max(0, m.deployed_usdc - costFraction);
    m.realized_pnl += pnl;
    m.trades_count += 1;
    const a = record(m, { kind: "sell", ok: true, amount: sellBase, price: Markets.priceOf(market), pnl, rationale: p.rationale });
    recomputeTradingRating(m.agent_id);
    return a;
  }

  if (p.kind === "open_long" || p.kind === "open_short") {
    const side = p.kind === "open_long" ? "long" : "short";
    const r = Perps.openPosition(m.market_id, m.owner_id, side, p.amount ?? 0, p.leverage ?? 1);
    if (r.error || !r.position) return record(m, { kind: p.kind, ok: false, amount: p.amount, rationale: p.rationale, detail: r.error ?? "open_failed" });
    r.position.mandate_id = m.mandate_id; // attribute so the runner manages only its own
    r.position.agent_id = m.agent_id;
    // Margin counts against budget via openPerpMargin (derived) — frees on close.
    m.trades_count += 1;
    return record(m, { kind: p.kind, ok: true, amount: p.amount, price: mark, rationale: p.rationale });
  }

  return record(m, { kind: "hold", ok: true, rationale: p.rationale });
}

/* --------------------------- rating / attribution ------------------------ */

/** Recompute the agent's trading rating (0..5) from realized Agent-Mode PnL,
 *  normalized by the capital it put to work. Performance → reputation. */
export function recomputeTradingRating(agent_id: string): number {
  const ms = mandatesForAgent(agent_id);
  const realized = ms.reduce((s, m) => s + (m.realized_pnl ?? 0), 0);
  const capital = ms.reduce((s, m) => s + Math.max(m.budget_usdc, 1), 0);
  const ratio = realized / capital; // e.g. +0.25 = +25% on deployed budget
  const rating = clamp(3 + ratio * 8, 0, 5); // 0% → 3.0; +25% → 5.0; -25% → 1.0
  const agent = Agents.getAgent(agent_id);
  if (agent) agent.trading_rating = Math.round(rating * 10) / 10;
  return rating;
}

/* ------------------------------- UI views -------------------------------- */

export function recentActions(mandate_id: string, limit = 20): AgentAction[] {
  return actions().filter((a) => a.mandate_id === mandate_id).slice(0, limit);
}

/** Relative timestamp computed server-side (render must stay pure — no Date.now()). */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Derive a mandate's live budget/PnL/position fields — shared by the UI state
 *  and the gateway response, so both report identically. */
function enrichMandate(m: Mandate) {
  const market = Markets.getMarket(m.market_id);
  const mark = market ? Markets.priceOf(market) : 0;
  const positions = agentPositions(m).map((p) => ({ ...p, mark, upnl: Perps.pnlOf(p, mark) }));
  const used = consumed(m);
  const unrealized = m.position_base * mark - m.deployed_usdc + positions.reduce((s, p) => s + p.upnl, 0);
  const mandate = {
    ...m,
    remaining_budget: remainingBudget(m),
    consumed_usdc: used,
    budget_used_pct: m.budget_usdc > 0 ? Math.min(100, Math.round((used / m.budget_usdc) * 100)) : 0,
    position_value: m.position_base * mark,
    unrealized_pnl: unrealized,
    realized_today: realizedToday(m.mandate_id),
    expires_in_hours: Math.max(0, (new Date(m.expiry).getTime() - Date.now()) / 3_600_000),
  };
  return { mandate, positions };
}

/** Everything the trade panel needs to render Agent Mode for one owner+market. */
export function marketAgentState(market_id: string, owner_id: string) {
  const m = activeMandate(market_id, owner_id);
  const market = Markets.getMarket(market_id);
  const myAgents = Agents.agentsByOwner(owner_id).map((a) => ({
    agent_id: a.agent_id,
    name: a.name,
    origin: a.origin ?? "native",
    trust_tier: a.trust_tier ?? "trusted",
    rating: a.rating ?? 0,
    trading_rating: a.trading_rating ?? null,
  }));
  if (!m) return { active: false, mandate: null, agent: null, actions: [], myAgents, stage: market?.stage ?? null, maxLeverage: Perps.MAX_LEVERAGE };

  const agent = Agents.getAgent(m.agent_id);
  const { mandate, positions } = enrichMandate(m);
  return {
    active: true,
    mandate,
    agent: agent ? { agent_id: agent.agent_id, name: agent.name, origin: agent.origin ?? "native", trust_tier: agent.trust_tier ?? "trusted", rating: agent.rating ?? 0, trading_rating: agent.trading_rating ?? null } : null,
    positions,
    actions: recentActions(m.mandate_id).map((a) => ({ ...a, ago: ago(a.at) })),
    myAgents,
    stage: market?.stage ?? null,
    maxLeverage: Perps.MAX_LEVERAGE,
  };
}

/* --------------------- external agents (the gateway door) ----------------- */
// An outside agent (SDK/MCP, authed by its gateway key) drives trades within an
// "external" mandate its OWNER armed. Identical guardrails + attribution as the
// native runner — the agent only supplies the decision (its own strategy/model).
// Build native-first; this is the second door of Agent Mode.

export interface ExternalTradeInput {
  action?: string; // buy | sell | open | close
  amount?: number; // buy: USDC in · sell: base tokens
  side?: string; // open: long | short
  collateral?: number; // open: USDC margin
  leverage?: number; // open
  position_id?: string; // close: a specific position (else all the agent's)
  rationale?: string; // the agent's own reason — surfaced in the feed
}

/** The agent's live, scoped mandate on a market (for the SDK to read before deciding). */
export function agentMandate(agent_id: string, market_id: string): Mandate | undefined {
  return mandates().find((x) => x.agent_id === agent_id && x.market_id === market_id && x.status === "active");
}

/** Agent-facing read: its mandate (budget/PnL/positions) + a market snapshot
 *  (price + momentum) + its action feed. No owner-level data leaks. The SDK reads
 *  this, decides, then POSTs a trade. */
export function externalMandateView(agent_id: string, market_id: string) {
  const market = Markets.getMarket(market_id);
  const snapshot = market ? { stage: market.stage, base_symbol: market.base_symbol, price: Markets.priceOf(market), ...Markets.tradeStats(market_id) } : null;
  const m = agentMandate(agent_id, market_id);
  if (!m) return { active: false, mandate: null, positions: [], actions: [], market: snapshot };
  const { mandate, positions } = enrichMandate(m);
  return { active: true, mandate, positions, actions: recentActions(m.mandate_id).map((a) => ({ ...a, ago: ago(a.at) })), market: snapshot };
}

export function externalTrade(agent_id: string, market_id: string, body: ExternalTradeInput) {
  const m = agentMandate(agent_id, market_id);
  if (!m) return { error: "no_active_mandate" as const };
  if (m.strategy !== "external") return { error: "not_external_mandate" as const };
  const market = Markets.getMarket(market_id);
  if (!market) return { error: "no_market" as const };

  // Book positions liquidated since the agent last acted (frees budget + realizes loss).
  while (reconcilePositions(m)) { /* book each orphan, then continue */ }

  const price = Markets.priceOf(market);
  const why = body.rationale ? String(body.rationale).slice(0, 120) : "";
  const tag = (s: string) => (why ? `${s} — ${why}` : s);

  if (body.action === "close") {
    const mine = agentPositions(m);
    const targets = body.position_id ? mine.filter((p) => p.position_id === body.position_id) : mine;
    if (!targets.length) return { error: "no_position" as const };
    let last: AgentAction | undefined;
    for (const p of targets) last = closeAgentPosition(m, p, tag(`External signal — close ${p.side}`));
    return { action: last, mandate: enrichMandate(m).mandate };
  }

  let plan: Planned;
  if (body.action === "buy") {
    const amt = Number(body.amount);
    if (!(amt > 0)) return { error: "bad_amount" as const };
    plan = { kind: "buy", side: "buy", amount: amt, notional: amt, rationale: tag(`External signal — buy $${amt.toFixed(0)}`) };
  } else if (body.action === "sell") {
    const amt = Number(body.amount);
    if (!(amt > 0)) return { error: "bad_amount" as const };
    plan = { kind: "sell", side: "sell", amount: amt, notional: amt * price, rationale: tag(`External signal — sell ${amt.toFixed(2)} ${market.base_symbol}`) };
  } else if (body.action === "open") {
    const margin = Number(body.collateral);
    if (!(margin > 0)) return { error: "bad_amount" as const };
    const side = body.side === "short" ? "short" : "long";
    const lev = Math.max(1, Math.floor(Number(body.leverage) || 1));
    plan = { kind: side === "long" ? "open_long" : "open_short", side, amount: margin, notional: margin, leverage: lev, rationale: tag(`External signal — ${side} ${lev}× ($${margin.toFixed(0)} margin)`) };
  } else {
    return { error: "bad_action" as const };
  }

  const action = actOn(m, plan);
  if (!action.ok) {
    const breach = maybeSlashBreach(m);
    if (breach) return { action: breach, mandate: enrichMandate(m).mandate };
  }
  return { action, mandate: enrichMandate(m).mandate };
}

/* --------------------- breach — trust-slashing (external) --------------------- */
// The guardrails BLOCK every violating trade, so the mandate itself can't leak —
// but an external agent that keeps ASKING for out-of-mandate trades is signaling
// bad faith (or a broken model). Repeated blocked attempts are a BREACH: the
// agent's trust is slashed (bond + tier + trading rating, mirroring the jobs-side
// rejection penalty) and the mandate is killed. Violations are DERIVED from the
// attributed action feed (ok:false rows) — no new state to persist.

const BREACH_LIMIT = 3; // blocked attempts on one mandate before it's a breach

function maybeSlashBreach(m: Mandate): AgentAction | undefined {
  const violations = actions().filter((a) => a.mandate_id === m.mandate_id && a.ok === false).length;
  if (violations < BREACH_LIMIT) return undefined;
  const agent = db.agents.find((a) => a.agent_id === m.agent_id);
  if (agent) {
    agent.bond_amount = Math.max(0, (agent.bond_amount ?? 0) - Agents.REJECT_SLASH);
    if (agent.trust_tier === "trusted") agent.trust_tier = "probation";
    agent.trading_rating = Math.round(Math.min(5, (agent.trading_rating || 0) * 0.7) * 10) / 10;
  }
  const a = record(m, {
    kind: "stop", ok: true,
    rationale: `Mandate BREACH — ${violations} guardrail violations; trust slashed (bond −${Agents.REJECT_SLASH}, tier demoted), mandate killed`,
  });
  stopMandate(m.mandate_id, m.owner_id, "breach");
  return a;
}
