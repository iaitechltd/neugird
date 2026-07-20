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

export type ParamKey = "tradex_fee_bps" | "echo_build_cost_grid" | "grid_market_fee_bps" | "gov_quorum_grid" | "grid_fee_discount_bps" | "campaign_ghost_days" | "hire_autorelease_days" | "echo_revision_cost_grid" | "echo_ask_cost_grid" | "echo_deploy_cost_grid" | "fraud_flag_quorum" | "agent_perf_fee_bps" | "genesis_raise_days" | "genesis_stall_days" | "gridx_fee_bps" | "affiliate_fee_share_bps" | "backer_allocation_bps" | "founder_allocation_bps" | "token_revenue_share_bps" | "starter_credit_grid" | "dispute_quorum" | "dispute_window_days" | "skill_market_fee_bps" | "starter_gate_tier" | "rewards_gate_tier" | "max_trade_impact_bps" | "perp_oi_cap_bps" | "buyback_bps" | "season_days" | "venture_cycle_cost_grid" | "venture_revenue_share_bps" | "venture_bounty_grid" | "trade_reward_bps" | "post_reward_pulse" | "emission_epoch_days" | "emission_epoch_bps" | "gov_quorum_bps" | "studio_run_cost_grid";

export type ParamUnit = "bps" | "grid" | "days" | "count";

export const DEFAULTS: Record<ParamKey, number> = {
  tradex_fee_bps: 100, // Trade AMM trade fee (1%)
  echo_build_cost_grid: 500, // GRID metered per Echo build
  grid_market_fee_bps: 100, // GRID/USDC swap fee (1%)
  gov_quorum_grid: 50_000, // absolute FLOOR for the FOR-GRID quorum (the effective quorum SCALES with circulating GRID — see gov_quorum_bps)
  grid_fee_discount_bps: 2500, // discount for paying protocol fees in GRID (25% off)
  campaign_ghost_days: 3, // a submitted campaign delivery unreviewed this long = ghosted
  hire_autorelease_days: 5, // an in-chat hire delivery unreviewed this long auto-releases escrow to the worker
  echo_revision_cost_grid: 100, // GRID metered per Echo build REVISION (the iterate loop)
  echo_ask_cost_grid: 5, // GRID metered per Echo Personal/Analyst/Observer question
  echo_deploy_cost_grid: 50, // GRID metered per deploy to NeuGrid hosting (/d/<slug>)
  fraud_flag_quorum: 2, // distinct Verifier fraud reports required to halt + slash a market
  agent_perf_fee_bps: 1000, // cut of POSITIVE realized PnL to a hired trading agent (trader ≠ wallet owner)
  season_days: 45, // length of an earning season (the countdown to the points snapshot)
  genesis_raise_days: 30, // open-raise funding window; unfilled past this ⇒ expired + backers refunded
  genesis_stall_days: 60, // funded project with no milestone activity this long ⇒ kill-switch eligible
  gridx_fee_bps: 250, // protocol fee on GridX product purchases (2.5% → treasury)
  affiliate_fee_share_bps: 1000, // referrers' share of their referrals' protocol fees (10%, first 12mo)
  backer_allocation_bps: 2000, // share of a project token reserved for its Fund backers at Alpha launch (20%)
  founder_allocation_bps: 1000, // share of a project token vested to the FOUNDER at launch (10%) — market success returns to its maker
  token_revenue_share_bps: 2000, // slice of every product sale streamed to the project's TOKEN HOLDERS (20%) — the token = a piece of real income
  starter_credit_grid: 500, // one-time Echo compute credit granted on first wallet connect (= one build)
  dispute_quorum: 3, // distinct reputation-staked evaluators required to resolve a delivery dispute
  dispute_window_days: 3, // a rejected escrowed job's worker may contest for this long before the rejection finalizes
  skill_market_fee_bps: 250, // protocol fee on a paid skill install (2.5% → treasury); the rest → the author
  starter_gate_tier: 0, // PoH tier required for the starter grant (0=open, 1=established wallet, 2=verified human) — docs/POH_GATE.md
  rewards_gate_tier: 0, // PoH tier required for reward COUNTING + TGE + referral verify (0=open) — docs/POH_GATE.md
  max_trade_impact_bps: 500, // circuit breaker: max AMM price impact per market trade (5%; 0 = off) — TRADING_ENGINE_AUDIT F2
  perp_oi_cap_bps: 2500, // total perp open interest cap as bps of pool TVL (25%) — TRADING_ENGINE_AUDIT F5
  buyback_bps: 0, // share of treasury USDC spent per buyback tick to buy+BURN GRID (0 = OFF; treasury never spent by surprise)
  venture_cycle_cost_grid: 20, // GRID a Venture's treasury pays per orchestration cycle (the agent-company compute sink)
  venture_revenue_share_bps: 5000, // share of a Venture product's NEW USDC revenue reinvested into its treasury (50%; the self-funding loop)
  venture_bounty_grid: 200, // GRID a Venture escrows (sold to USDC) as a real bounty on a recruit job; 0 = reputation-only recruit posts
  studio_run_cost_grid: 200, // GRID one Echo Studio engine run costs (the workshop's write→run→fix loop; refunded on engine failure)
  trade_reward_bps: 3000, // trade reward = this share of the FEE paid, as GRID allocation (30%; fee-based ⇒ wash-trading costs more than it earns; 0 = off)
  post_reward_pulse: 2, // GRID allocation (×GRID_PER_PULSE) earned per rewarded wire post — first 3/day (0 = reputation-only, no GRID)
  emission_epoch_days: 30, // length of a post-TGE emission epoch (the release-and-split period)
  emission_epoch_bps: 100, // GRID released per epoch as bps of what's LEFT in the community pool (1%; tapers ⇒ mints ~forever within the cap)
  gov_quorum_bps: 100, // governance quorum as bps of CIRCULATING GRID (1%) — scales with distribution toward the 36.9B cap; gov_quorum_grid is the floor
};

/** UI labels + validation bounds (so a malicious proposal can't set fee = 10000%). */
export const META: Record<ParamKey, { label: string; unit: ParamUnit; min: number; max: number }> = {
  tradex_fee_bps: { label: "Trade trade fee", unit: "bps", min: 0, max: 500 }, // ≤5%
  echo_build_cost_grid: { label: "Echo build cost", unit: "grid", min: 0, max: 10_000 },
  grid_market_fee_bps: { label: "GRID market fee", unit: "bps", min: 0, max: 500 },
  gov_quorum_grid: { label: "Governance quorum floor", unit: "grid", min: 1_000, max: 100_000_000 },
  grid_fee_discount_bps: { label: "GRID fee discount", unit: "bps", min: 0, max: 5_000 }, // ≤50% off
  campaign_ghost_days: { label: "Campaign ghost deadline", unit: "days", min: 1, max: 30 },
  hire_autorelease_days: { label: "Hire auto-release window", unit: "days", min: 1, max: 30 },
  echo_revision_cost_grid: { label: "Echo revision cost", unit: "grid", min: 0, max: 5_000 },
  echo_ask_cost_grid: { label: "Echo question cost", unit: "grid", min: 0, max: 500 },
  echo_deploy_cost_grid: { label: "Echo deploy cost", unit: "grid", min: 0, max: 5_000 },
  fraud_flag_quorum: { label: "Fraud-flag quorum", unit: "count", min: 2, max: 7 }, // ≥2 distinct reporters — never a single-caller halt+slash
  agent_perf_fee_bps: { label: "Agent performance fee", unit: "bps", min: 0, max: 5_000 }, // ≤50% of positive PnL
  season_days: { label: "Season length", unit: "days", min: 7, max: 120 },
  genesis_raise_days: { label: "Fund raise window", unit: "days", min: 7, max: 120 },
  genesis_stall_days: { label: "Fund stall deadline", unit: "days", min: 14, max: 365 },
  gridx_fee_bps: { label: "GridX purchase fee", unit: "bps", min: 0, max: 1_000 }, // ≤10%
  affiliate_fee_share_bps: { label: "Affiliate fee share", unit: "bps", min: 0, max: 5_000 }, // ≤50%
  backer_allocation_bps: { label: "Backer token share", unit: "bps", min: 0, max: 3_000 }, // ≤30% — the pool keeps the float
  founder_allocation_bps: { label: "Founder token share", unit: "bps", min: 0, max: 2_000 }, // ≤20% — vested, longer than backers
  token_revenue_share_bps: { label: "Sales → token holders", unit: "bps", min: 0, max: 5_000 }, // ≤50% — the owner keeps the rest
  starter_credit_grid: { label: "Starter Echo credit", unit: "grid", min: 0, max: 5_000 }, // 0 = governance killed the grant
  dispute_quorum: { label: "Dispute panel quorum", unit: "count", min: 2, max: 9 },
  dispute_window_days: { label: "Dispute window", unit: "days", min: 1, max: 30 },
  skill_market_fee_bps: { label: "Skill install fee", unit: "bps", min: 0, max: 1_000 }, // ≤10%
  starter_gate_tier: { label: "Starter grant PoH tier", unit: "count", min: 0, max: 2 },
  rewards_gate_tier: { label: "Reward counting PoH tier", unit: "count", min: 0, max: 2 },
  max_trade_impact_bps: { label: "Max trade price impact", unit: "bps", min: 0, max: 5_000 }, // 0 disables the breaker
  perp_oi_cap_bps: { label: "Perp OI cap (of pool TVL)", unit: "bps", min: 500, max: 10_000 },
  buyback_bps: { label: "GRID buyback", unit: "bps", min: 0, max: 5_000 }, // ≤50% of treasury USDC per tick; 0 = off
  venture_cycle_cost_grid: { label: "Venture cycle cost", unit: "grid", min: 0, max: 5_000 },
  venture_revenue_share_bps: { label: "Venture revenue reinvest", unit: "bps", min: 0, max: 10_000 }, // 0 = keep it all · 10000 = reinvest all product revenue
  venture_bounty_grid: { label: "Venture recruit bounty", unit: "grid", min: 0, max: 10_000 }, // 0 = reputation-only recruit jobs
  studio_run_cost_grid: { label: "Studio engine run cost", unit: "grid", min: 0, max: 5_000 },
  trade_reward_bps: { label: "Trade reward (of fee)", unit: "bps", min: 0, max: 10_000 }, // ≤100% of the fee paid — never a profit to wash-trade
  post_reward_pulse: { label: "Post reward", unit: "count", min: 0, max: 10 }, // Pulse per rewarded post (×GRID_PER_PULSE = GRID); first 3/day
  emission_epoch_days: { label: "Emission epoch", unit: "days", min: 1, max: 365 },
  emission_epoch_bps: { label: "Emission per epoch", unit: "bps", min: 0, max: 2_000 }, // ≤20% of the remaining pool per epoch
  gov_quorum_bps: { label: "Governance quorum (of circulating)", unit: "bps", min: 0, max: 5_000 }, // ≤50% of circulating GRID
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
