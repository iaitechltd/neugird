# Trading Engine Audit — Alpha · Spot · Futures (2026-07-09)

Requested by the founder: evaluate the engine + logic of all three stages —
especially Spot and Futures — for correctness, decentralization, and custody.
Code audited line-by-line: `markets.ts` (620) · `perps.ts` (248) · `wallets.ts`
(98) · `staking.ts` (156) + the chain adapters. Verdicts first, findings ranked.

## 1 · Executive verdict

- **Alpha + Spot (the AMM + limit engine): the LOGIC is sound.** The
  constant-product math, fee accounting, limit partial-fills, candles/stats are
  correct (verified below). Two real inconsistencies to fix (F6, F7).
- **Futures (perps): the SHAPE is right, the ECONOMICS are not yet real.** The
  margin/liquidation/funding/trigger machinery works and is well-tested — but
  the engine has **no counterparty, no insurance fund, and an unmanipulatable-
  in-name-only oracle**. Fine as the pre-mainnet accounting-unit venue it
  declares itself to be; NOT ready for real money without the Stage-T work (§5).
- **Custody today: the platform holds nothing real — because nothing real is in
  it.** All trading balances are ledger rows (accounting units, documented as
  such). That makes today's system trivially "non-custodial" (there is nothing
  to steal) but also **not yet decentralized in any meaningful sense**: the
  moment real USDC enters without §5, NeuGrid becomes a custodial exchange.
  The good news: the hard parts of the fix already exist as shipped rails.

## 2 · What is genuinely solid (verified math)

- **AMM invariant** — `executeSwap` preserves x·y=k exactly on both sides; the
  fee is taken OUTSIDE the curve (net-in on buys, net-out on sells), so the
  pool can't be drained by fee rounding. Price, liquidity, holders, volume all
  recompute from reserves — no drift.
- **Limit orders** — true marketable-limit semantics: fills cap at
  `√(k/limit)` (the exact base quantity where the marginal price hits the
  limit — verified: price after fill = limit), remainder rests; the USDC
  gross-up `net/(1−fee)` correctly prevents fee-overshoot past the limit, and
  GRID-fee payers correctly skip it. Partial fills, dust handling, cancel,
  insufficient-funds-leaves-resting: all correct.
- **Perp mechanics** — liquidation price `E(1∓(1/lev−MMR))` is exact (at liq
  price, remaining margin = collateral·MMR·lev); PnL math correct both sides;
  funding accrues fractionally per hour, capped 0.75%/h, margin-capped, and
  margin exhaustion liquidates; TP/SL/OCO/trailing ratchet logic correct with
  liquidation checked first (the conservative order); perp limit entries
  debit-at-trigger and cancel cleanly when unfunded.
- **Stage gates** — cap + liquidity floor + GRID stake dual-gating, audit gate,
  fraud-flag quorum → pause + on-chain stake slash: the "earned, not bought"
  ladder is enforced everywhere it claims to be.
- **Market data is real** — candles aggregate actual trades, 24h stats use a
  real time window, the depth ladder derives from the actual curve.

## 3 · Findings — ranked

**F1 · CRITICAL (Futures) — perp PnL has no counterparty.** `closeAt` credits
`margin + pnl` from nowhere; a profitable long PRINTS ledger USDC, a loss burns
it. There is no vault, no LP pool, no insurance fund on the other side of any
position. Harmless with accounting units; fatal with real money (the exchange
itself is short every winning trade). → Stage T2.

**F2 · CRITICAL (Futures) — the oracle is the raw AMM spot.** Mark price =
instantaneous reserves ratio, and `Perps.settle` runs inside the same `trade()`
call that moved it. A whale can push the price with one swap, force
liquidations/stops at the manipulated mark, then reverse — cost is two fees +
slippage, payoff is everyone else's margin. The $900K liquidity floor raises
the cost but does not remove the vector. → Fix: TWAP/median mark over a window
(the trade history to compute it already exists), plus a per-trade price-impact
circuit breaker. Partially platform-fixable NOW.

**F3 · CRITICAL (custody) — pool reserves and margin are unbacked ledger
entries.** Seed liquidity (10,000 USDC/launch) is created from thin air; a
seller is paid from a reserve no one deposited; perp collateral is debited to
nowhere. Conservation holds only approximately and only by convention. This is
the documented pre-mainnet posture — but it defines the distance to
non-custodial: every balance must become a program-owned vault balance. → §5.

**F4 · HIGH (Futures) — liquidation leaks value and ignores gap risk.** On
liquidation the position is marked `pnl = −margin` and the real remaining
margin (≈ collateral·MMR·lev, e.g. 5% at 10×) simply vanishes — no insurance
fund, no keeper reward. Conversely a gapped mark (one big swap) can make the
true loss exceed margin: bad debt, absorbed by no one. → Route remainder to an
insurance-fund sub-account + track bad debt explicitly. Platform-fixable NOW.

**F5 · HIGH (Futures) — no open-interest or position-size caps.** A single
position can dwarf the pool that prices it, compounding F2. → An
`oi_cap`-style governable Param (agent mandates already grade this risk;
manual trades have no cap). Platform-fixable NOW.

**F6 · MEDIUM (Spot) — sell-side fees skip the stakers.** Buys route 40% of
the fee to listing stakers (`distributeFees`); sells credit the full fee to the
treasury. Inconsistent with the advertised fee-share. One-line fix.

**F7 · MEDIUM (Spot) — resting orders don't escrow funds.** Limit buys/sells
and perp entries verify funds only at fill time (unfunded → skip/cancel). Users
can rest unlimited notional; fills become balance-dependent races. Standard
venue behavior is reserve-on-place. Platform-fixable.

**F8 · LOW — one-way funding.** The crowded side pays the treasury; the other
side receives nothing (a deliberate skew-carry, documented). Weaker balancing
incentive than two-sided funding; revisit at Stage T2.

**F9 · LOW — liveness.** Funding/trailing/liquidations advance only on trades
and cron ticks; a quiet market can hold a doomed position for minutes. The
agent-trading cron partially covers this; an explicit keeper tick per market
would close it (the ICP cron canister already proven for exactly this).

**F10 · LOW — book cosmetics.** The displayed order book is synthetic curve
depth; resting limit orders aren't shown, and crossing orders fill in
insertion order rather than price-time priority. Honest for an AMM venue, but
worth labeling in the UI.

## 4 · Decentralization & custody — where each piece stands TODAY

| Piece | Today | Real-money posture |
|---|---|---|
| GRID stake-to-list, fee share, slash | **on-chain program (devnet), platform-mirrored** | strong — the pattern to copy |
| GRID claims (rewards) | real devnet SPL transfers | strong |
| Raise escrow (Fund) | **on-chain vault + ICP canister release authority** | strong — trustless custody proven |
| Agent trade budgets | **on-chain mandate wallets (vault balance IS the budget)** | strong |
| Spot AMM reserves, holdings, USDC | in-platform ledger | custodial-by-construction if real money entered |
| Perp margin, PnL, funding | in-platform ledger, no counterparty | not real yet (F1) |
| Deposits/withdrawals | do not exist | the fact nothing real is held is what keeps today "non-custodial" |

## 5 · The path to a decentralized, non-custodial TradeX (staged)

The locked decision stands: **TradeX IS the venue** — no external DEX. The
question is only where settlement lives. The team has already shipped five
audited-pattern Anchor programs + the ICP release authority; the same muscles
finish this.

- **T1 — Spot on-chain (the big unlock).** One constant-product AMM program:
  per-market pool PDA holding real SPL token + USDC vaults; launch seeds the
  pool from the project treasury (fixes F3's thin-air seed); holdings become
  SPL balances in user wallets (self-custody); fees split staker/treasury
  on-chain (fixes F6 structurally). Platform keeps limit orders + UX as a
  crank over the pool. Alpha and Spot both ride it — same program, stage is
  platform metadata.
- **T2 — Perps with a real counterparty.** Margin vault program (the
  mandate-wallet pattern: the vault balance IS the margin — overspend
  structurally impossible) + an explicit counterparty: the clean fit for an
  AMM-marked venue is an LP counterparty pool (GMX-style) seeded by the
  treasury, with the insurance fund absorbing liquidation remainders (fixes
  F1+F4) and OI capped as a fraction of pool depth (fixes F5).
- **T3 — Oracle + liveness hardening.** TWAP/median mark from on-chain trade
  history + price-impact circuit breakers (fixes F2 fully); keeper cranks via
  the ICP cron canister (fixes F9); two-sided funding (F8).
- **Gate: professional audit before any mainnet deploy** — already the
  roadmap's standing rule.

**Benchmark (the founder's reference, Hyperliquid):** HL runs its own chain
with an on-chain order book, oracle marks, and an insurance fund — its custody
model (user funds only ever in protocol vaults) is the part to copy; its
matching model is not needed for an AMM-staged venue. NeuGrid's differentiator
stays the EARNED ladder (delivered → audited → staked → traded) — no other
venue has that gate.

## 6 · Platform-side hardening — ✅ IMPLEMENTED 2026-07-09 (25/25 e2e)

1. ✅ Sell-side staker fee share (F6) — sells now split fees exactly like buys.
2. ✅ Insurance fund (F4) — `neugrid:insurance`: liquidation remainders in, bad
   debt drawn from it (trader never owes past margin; negative = underwater).
3. ✅ Oracle hardening (F2 mitigation) — perps price off `markEffective`: spot
   clamped ±2% around the 5-min TWAP of real trades (entries, triggers, closes);
   PLUS a `max_trade_impact_bps` circuit breaker (governable, default 5%) on
   every market order. Proven: a pool-shoving +40% swap moved raw spot but the
   effective mark held near TWAP; the same swap is blocked outright at the
   default cap.
4. ✅ OI cap (F5) — `perp_oi_cap_bps` (governable, default 25% of pool TVL)
   rejects positions that would dwarf the book pricing them.
5. ✅ Escrow-on-place (F7) — resting limit orders reserve worst-case USDC (or
   the base tokens) into `neugrid:order-escrow` at placement; fills draw from
   the reservation, cancel/completion refunds exactly (conservation-verified);
   unfundable orders now reject at placement. Perp entries escrow collateral
   the same way. Migration: `db/migrations/2026-07-09-engine-hardening.sql`.
6. ✅ Book labeled "Order book · AMM depth" with an explanatory tooltip (F10).

Now 24 governable Params. Remaining engine work = the Stage T1–T3 chain plan
in §5 (real vaults, counterparty pool, on-chain settlement) — unchanged.
