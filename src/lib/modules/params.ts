/**
 * Protocol parameters — the governable config layer.
 *
 * These are the knobs a PASSED governance proposal can turn. Each has a hardcoded
 * DEFAULT (the module's original constant); an override lives in the `db.params`
 * singleton only once governance changes it. Consumer modules (markets, echo,
 * gridMarket, governance) read `Params.get(key)` instead of a local constant, so a
 * passed `set_param` proposal takes effect on the very next trade / build. This is
 * what makes governance BINDING rather than advisory.
 */

import { db } from "../store";

export type ParamKey = "tradex_fee_bps" | "echo_build_cost_grid" | "grid_market_fee_bps" | "gov_quorum_grid" | "grid_fee_discount_bps" | "campaign_ghost_days" | "echo_revision_cost_grid" | "echo_ask_cost_grid" | "echo_deploy_cost_grid" | "fraud_flag_quorum" | "agent_perf_fee_bps" | "genesis_raise_days";

export type ParamUnit = "bps" | "grid" | "days" | "count";

export const DEFAULTS: Record<ParamKey, number> = {
  tradex_fee_bps: 100, // TradeX AMM trade fee (1%)
  echo_build_cost_grid: 500, // GRID metered per Echo build
  grid_market_fee_bps: 100, // GRID/USDC swap fee (1%)
  gov_quorum_grid: 50_000, // FOR-GRID a new proposal needs to pass
  grid_fee_discount_bps: 2500, // discount for paying protocol fees in GRID (25% off)
  campaign_ghost_days: 3, // a submitted campaign delivery unreviewed this long = ghosted
  echo_revision_cost_grid: 100, // GRID metered per Echo build REVISION (the iterate loop)
  echo_ask_cost_grid: 5, // GRID metered per Echo Personal/Analyst/Observer question
  echo_deploy_cost_grid: 50, // GRID metered per deploy to NeuGrid hosting (/d/<slug>)
  fraud_flag_quorum: 2, // distinct Verifier fraud reports required to halt + slash a market
  agent_perf_fee_bps: 1000, // cut of POSITIVE realized PnL to a hired trading agent (trader ≠ wallet owner)
  genesis_raise_days: 30, // open-raise funding window; unfilled past this ⇒ expired + backers refunded
};

/** UI labels + validation bounds (so a malicious proposal can't set fee = 10000%). */
export const META: Record<ParamKey, { label: string; unit: ParamUnit; min: number; max: number }> = {
  tradex_fee_bps: { label: "TradeX trade fee", unit: "bps", min: 0, max: 500 }, // ≤5%
  echo_build_cost_grid: { label: "Echo build cost", unit: "grid", min: 0, max: 10_000 },
  grid_market_fee_bps: { label: "GRID market fee", unit: "bps", min: 0, max: 500 },
  gov_quorum_grid: { label: "Governance quorum", unit: "grid", min: 1_000, max: 5_000_000 },
  grid_fee_discount_bps: { label: "GRID fee discount", unit: "bps", min: 0, max: 5_000 }, // ≤50% off
  campaign_ghost_days: { label: "Campaign ghost deadline", unit: "days", min: 1, max: 30 },
  echo_revision_cost_grid: { label: "Echo revision cost", unit: "grid", min: 0, max: 5_000 },
  echo_ask_cost_grid: { label: "Echo question cost", unit: "grid", min: 0, max: 500 },
  echo_deploy_cost_grid: { label: "Echo deploy cost", unit: "grid", min: 0, max: 5_000 },
  fraud_flag_quorum: { label: "Fraud-flag quorum", unit: "count", min: 1, max: 7 },
  agent_perf_fee_bps: { label: "Agent performance fee", unit: "bps", min: 0, max: 5_000 }, // ≤50% of positive PnL
  genesis_raise_days: { label: "GenesisX raise window", unit: "days", min: 7, max: 120 },
};

export function isKey(k: string): k is ParamKey {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, k);
}

function overrides(): Record<string, number> {
  return (db.params ??= {});
}

/** Effective value = the governance override if set, else the hardcoded default. */
export function get(key: ParamKey): number {
  const v = overrides()[key];
  return typeof v === "number" ? v : DEFAULTS[key];
}

/** Clamp a proposed value into its safe bounds (used at proposal-creation time). */
export function clamp(key: ParamKey, value: number): number {
  const m = META[key];
  return Math.max(m.min, Math.min(m.max, value));
}

/** Apply an override (only ever called from Governance.resolve on a passed proposal). */
export function set(key: ParamKey, value: number): { old: number; value: number } {
  const old = get(key);
  overrides()[key] = clamp(key, value);
  return { old, value: get(key) };
}

/** Every effective value + meta — for the API and the live-parameters UI panel. */
export function all(): { key: ParamKey; value: number; default: number; overridden: boolean; label: string; unit: ParamUnit }[] {
  return (Object.keys(DEFAULTS) as ParamKey[]).map((key) => ({
    key,
    value: get(key),
    default: DEFAULTS[key],
    overridden: typeof overrides()[key] === "number" && overrides()[key] !== DEFAULTS[key],
    label: META[key].label,
    unit: META[key].unit,
  }));
}
