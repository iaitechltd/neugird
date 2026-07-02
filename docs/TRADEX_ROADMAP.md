# TradeX — Build Roadmap

Status of the TradeX stage flow (Alpha → Spot → Futures) and the work still to do.
**This is a planning doc — capture now, build later.** Legend: ✅ done · 🟡 partial/placeholder · ❌ not built.

Mechanism reference: `memory/neugrid-mechanism.md` (TradeX stage mechanism). Files: `src/lib/modules/{markets,perps,staking,wallets}.ts`, `src/app/market/[id]/page.tsx`, `src/app/markets/page.tsx`, `src/app/api/markets/*`.

---

## Where it stands today (built + working)

✅ **Tokenize entry** — delivered project Grid → request security audit → pass → "Launch on Alpha" (`/grid/[slug]`) → market opens.
✅ **Alpha** — bonding-curve buy/sell (USDC, real balances, 1% fee); Ascension Arc = real market-cap progress.
✅ **Graduation gates** — Alpha→Spot ($963K cap + liquidity floor + 5K GRID stake); Spot→Futures ($36M cap + $900K liquidity + 50K GRID stake).
✅ **Stake-to-list** — lock GRID (stake-weighted threshold) → graduate.
✅ **Spot** — synthetic order book (AMM depth), Market + Limit orders (rest + fill-on-cross), Open Orders + cancel.
✅ **Futures (perps)** — long/short, leverage ≤10×, USDC margin, mark = spot AMM, auto-liquidation, PnL, close, Positions.
✅ **Terminal UX** — responsive candles + timeframes, order-book toggle, price ticker (top), static info footer (bottom), holders/traders/tnx/position/project/roadmap tabs, `/markets` stage tabs.

---

## P1 — Provenance & Founder Credibility (THE THESIS) ✅ BUILT (2026-06-29)

✅ **Built** — `src/lib/modules/provenance.ts` aggregates it; `GET /api/markets/[id]` returns a `provenance` block; the terminal shows a compact **Founder · provenance** block (left panel) + a full **Provenance tab** (lineage stepper · founder reputation/dimensions/track-record/soulbound-credentials · backers · trust signals). Markets spawned from a GenesisX proposal also show the raise + backers (current demo markets are direct launches, so they show the founder credibility + "direct launch").

> NeuGrid's whole pitch is **merit + a verifiable track record over VC connections**. A trader deciding to buy must SEE who built this, their proven reputation, and the project's lineage — right at the point of trade. This is the anti-meme / anti-VC differentiator and must be prominent on every market. Currently the terminal shows the market mechanics but **not** the credibility story.

**Surface it on the market terminal** (`/market/[id]`) — a dedicated **"Provenance / Credibility"** section (left panel block + a bottom tab, and a condensed founder+reputation badge in the header), plus a small credibility chip on the `/markets` cards.

Show:
1. **Lineage / origin** — which **Grid** this token belongs to (link), the **SubGrid/team** if any, and the provenance chain via `grid.spawned_from`: *Built with Echo → funded on GenesisX (proposal) → delivered N/M milestones → passed audit → launched.* (Origin = proposal or product.)
2. **Founder** — avatar + name + background/bio, multi-dimensional **reputation** (builder/backer/reviewer/creator), and **soulbound credentials** (attestations: `proof_of_build`, `work_delivered`, `milestone_shipped`, `project_launched`). Link to `/talent/[id]`.
3. **Track record** — the founder's past builds, delivered jobs, shipped milestones, prior launched projects (the auto-generated proof-of-work résumé).
4. **Backers** — who funded it on GenesisX + their reputation (the "back winners → louder signal" flywheel); reputation-weighted endorsements.
5. **Trust signals** — audit status + verifier, milestones delivered vs total, proof-of-build hash, credentials count.

**Data (all already exists)** — `grids` (owner_id, spawned_from, grid_type, lifecycle_stage), `proposals` (author, endorsements, backings), `attestations` (`Attestations.forSubject`/`summary`), `users[].reputation` + pulse, `builds`, `jobs`, `audits`, milestones. Aggregate into a `provenance` block on `GET /api/markets/[id]` (reuse the `/api/talent/[id]` aggregation).

**Acceptance** — from any market, a trader sees the project's lineage, the founder's verifiable reputation + credentials + track record, and who backed it, without leaving the terminal.

---

## P2 — Community & Discussion (per-market live chat) ✅ BUILT (2026-06-29)

✅ **Built** — `messages` collection + `src/lib/modules/chat.ts` (post / like / `listFor` with author role + reputation) + `GET/POST /api/markets/[id]/chat`; the terminal's right panel has **Trade | Chat** tabs — a reputation-tagged thread (founder/backer/holder/member role chips + rep + time-ago + ▲ likes) + composer, polling every 4s. Per-Grid scope (mirroring on the Grid page = a small follow-up). Still to add: reputation/rate-limit gating on posting; SSE/WebSocket realtime.

> Grids **are** communities — so the project's grid community + traders should discuss it right at the point of trade (sentiment, news, conviction). Pairs with the Provenance panel: *who built it* + *what the community thinks*, both surfaced on the terminal. Reinforces the "back winners → louder signal" flywheel.

**Surface it** — the right panel gets tabs: **Trade | Chat** (a new tab next to Trade on `/market/[id]`). Chat shows the live discussion thread for this project, also mirrored on the Grid page (`/grid/[slug]`) so it's one community conversation.

Show / do:
1. **Message feed** — author avatar + name, **reputation badge + role chip** (founder / backer / holder / grid-member), text, timestamp; newest at the bottom, auto-scroll. Credible voices stand out (ties to the thesis).
2. **Composer** — post a message; identity-tied (`getCurrentUser`). Reputation/holder-gated posting + rate-limit to fight spam/sybil.
3. **"Live"** — near-real-time. v1 = poll every ~3–5s (the app already uses the refetch pattern); true realtime (SSE/WebSocket) is a Stage-B infra item.
4. Optional: reactions / upvotes (surface the highest-signal takes), report/hide for moderation.

**Build** — new `messages` store collection `{ message_id, grid_id, market_id?, user_id, text, created_at, reactions? }` + a `chat` module + `GET/POST /api/grids/[slug]/messages` (or `/api/markets/[id]/messages`); add to `db/schema.sql` + `store-postgres` SPECS (swap-ready). Right-panel tab switch (Trade | Chat) in `src/app/market/[id]/page.tsx`; reuse reputation/attestations for the author badge.

**Considerations** — no realtime infra yet (in-memory, request/response) → polling for v1; reputation-gate + rate-limit posting; persist messages (schema for the Postgres swap); scope per-**grid** so the market terminal and Grid page share one thread.

**Acceptance** — from a market, a user can read and post to the project's community thread, with each author's reputation/role visible, updating live.

---

## P1 — Integrity gaps ✅ BUILT (2026-06-29 → 2026-06-30)

- ✅ **Staker fee-share** — BUILT. 40% of every trade fee routes to a market's GRID stakers pro-rata (`Staking.distributeFees`, called from `markets.executeSwap`); credited to the staker's USDC wallet + tracked per-stake as `fees_earned`; shown in the terminal's "Your listing stake" block. (Split: `STAKER_FEE_SHARE_BPS = 4000`. Rest → `neugrid:treasury`.)
- ✅ **Unstake** — BUILT. `POST /api/markets/[id]/stake { action:"unstake", stake_id }` → `Staking.releaseStake` (gated on the ~2-yr lock); the terminal shows each stake's lock state + an Unstake button (disabled until matured) + fees earned.
- ✅ **Slashing — BUILT (2026-06-30).** `Staking.slashStakes(grid_id, reason)` forfeits every active listing stake (GRID swept to `neugrid:treasury`, never returned; stake marked `slashed`). Trigger: `Markets.flagFraud(market_id, reviewer_id, reason)` — a **non-founder Verifier** flags a LAUNCHED market → halts trading (`status → paused`, so `Markets.trade` + `Perps.openPosition` refuse it) + slashes stakes + slashes founder Pulse (−60). Route `POST /api/markets/[id]/slash`. (Pre-launch fraud is already caught by the audit gate, before any stakes exist.) Terminal UI: a **flagged banner**, a left-panel note, a "slashable if found fraudulent" stake-copy line, a **Slashed** stake block, and a non-founder **"Flag fraud (Verifier)"** control (with confirm). Verified `scratchpad/test-slash.mjs` (founder blocked → Verifier flags 5K GRID → trading halted → re-flag blocked → treasury sink); `scratchpad/restore-vault.cjs` reverses it (demo cleanup). **v1 = single-Verifier trust model** (mirrors audit-review); production should gate behind staked-review / dispute quorum.

---

## P2 — Perp completeness 🟡 (funding + TP/SL/OCO BUILT 2026-06-30)

- ✅ **Funding rate — BUILT.** Mark = spot AMM (no perp-vs-index premium), so funding is a **skew carry**: `Perps.fundingRate` from open-interest imbalance (`openInterest`); the **crowded side** pays a capped hourly carry → the treasury (insurance fund), accrued lazily per position in `Perps.settle` (`accrueFunding`, reduces margin, can trigger liquidation). `Perps.funding(market_id)` (rate + which side pays + OI) → the `[id]` GET → a **Funding row** in the terminal's Margin panel + per-position `funding_paid`. Guards retroactive charging on pre-existing positions (first-touch sets the clock, no back-charge). Tunables: `FUNDING_K`/`FUNDING_MAX`/`FUNDING_INTERVAL_MS`.
- ✅ **TP / SL / OCO — BUILT.** `Position` gained `take_profit`/`stop_loss`/`close_reason`; `Perps.setTriggers` sets/clears them (`POST /api/markets/[id]/perp { action:"triggers" }`); `Perps.settle` closes the position at mark when a trigger crosses (after funding + liquidation). Both set ⇒ **OCO** (first to hit wins). Terminal Positions tab: per-position TP/SL inputs + an OCO badge + funding shown. (`checkLiquidations` is now an alias for `settle`.)
- ✅ **Trailing-stop** — BUILT (2026-07-02): % behind the best mark since set, ratchets in Perps.settle, closes as close_reason=trailing_stop; Trail % field in the terminal trigger editor.
- ✅ **Limit orders — partial fills** — BUILT (2026-07-02): fills execute only up to the qty the curve gives within the limit price (exact quote-in from x*y=k); the remainder keeps resting; marketable limits respect the limit too. (True resting-book matching still N/A on an AMM.)
- ✅ **Perp limit entries** — BUILT (2026-07-02): rest in the order book, open at trigger (long at-or-below / short at-or-above), funds debited at trigger; optional limit-entry price in the perp panel.

---

## P2 — Real market data

- ✅ **Candlestick chart = REAL OHLC (2026-06-30).** `Markets.candles(market_id, tf, n)` aggregates `db.trades` into `n` OHLC buckets per timeframe (15m/1H/4H/1D); open carries the prior close (candles connect), empty buckets are flat doji. The window is the `tf` lookback but **auto-fits to the trade history** when the market is younger (so real trades fill the chart, no dead flat space). `GET /api/markets/[id]/candles?tf=&n=` → the `/market/[id]` chart fetches it on tf/width/`tick` change (live — updates as trades land, incl. the agent's). Synthetic `genCandles` DELETED. Demo markets seeded with realistic history via `scratchpad/backfill-trades.cjs` (fixtures, like seed-futures.cjs — the chart aggregates honestly). The chart `Candles` already handles flat series safely.
- ✅ **Trade stats — REAL rolling-24h (2026-06-30).** `Markets.tradeStats` now aggregates buys/sells/volume/high/low/change over an actual **24h time window** (`db.trades` filtered by `at >= now−24h`), not a fixed trade count; `change` = current vs the price entering the window. Added a real 24h `volume`. `/api/markets` exposes `vol24h` + 24h `change` → wired into the terminal header (high/low/change), the left panel **24h Vol**, the `/markets` cards (**24h Vol**), and the footer ticker. (The `/markets` card's *30-day ROI* headline + sparkline are still the deterministic `genSeries` viz — separate from the 24h stats.)

---

## P2 — Tokenize from GridX ✅ BUILT (2026-06-30)

- ✅ A shipped **GridX product** can now tokenize, not just GenesisX-funded project grids. `Markets.deliveryStatus(grid_id)` = delivered if **all milestones released** (GenesisX path) OR **a witnessed GridX product exists** (GridX path — proof-of-build earns a market without milestone funding; milestone-funded grids still must finish their milestones). `canLaunch`/`requestAudit` both use it and accept `grid_type` project **or** product (community grids → `not_tokenizable`); the audit gate stays (tokenized = handles money). UI: the `/grid/[slug]` Token-Launch panel now shows for product grids with a reason-aware "ship a GridX product (or deliver milestones)" message; the `/gridx/[id]` product page gained a **Tokenize on TradeX** CTA (→ "Trading on {stage}" once launched, via `productView`'s new `market`/`launch`). Verified end-to-end (`scratchpad/test-tokenize-gridx.mjs`): a 0-milestone product → request audit → non-founder passes → launch SOLAN on Alpha → product page links to the market; community grid blocked. (Drive-by: fixed a pre-existing `set-state-in-effect` lint error on the grid page — reload useCallback → inline-loader effect + `tick`.)

---

## P2 — Agent Mode (autonomous agent trading) ✅ BUILT — native + external (2026-06-30)

> Toggle **Agent Mode** on a market and the user's agent takes over trading on their behalf across Alpha / Spot / Futures — within a scoped mandate. Fuses two NeuGrid pillars: the **agent economy (SentientX)** and **TradeX**. Agents become traders, earn a rating on performance, and the owner takes a split — the universal proof → verify → reputation loop, applied to trading.

**SHIPPED (native, Stage 1):** `src/lib/modules/agentTrading.ts` (the `AgentTrading` module) + `mandates`/`agentActions` store collections (+ `db/schema.sql` tables + `store-postgres` SPECS) + routes `GET/POST /api/markets/[id]/agent`, `/agent/tick`, `/agent/stop` + an **Agent tab** in the `/market/[id]` trade panel (arm form → live dashboard: budget Ring, realized/unrealized PnL, mandate scope, attributed activity feed, "agent is trading" indicator, instant kill-switch). All six gaps below are covered for native agents: mandate model (1), agent-acts-on-owner-wallet execution (2, via cookie-session owner today), server-side guardrails — budget/position/leverage/stage/expiry/daily-loss + stop-loss circuit breaker + rate-limit (3), native strategies DCA/Momentum/Hedge-perp (4), the UI (5), and attribution + a `trading_rating` from realized PnL (6). The **runner is tick-based**, driven by the open terminal (polls every ~6.5s); the `/agent/tick` endpoint is the seam for a server-side scheduler to run it 24/7.
**SHIPPED (external door, 2026-06-30):** outside agents drive the same mandates via the gateway — `GET/POST /api/agent-gateway/trade` authed by `x-ng-agent-key` → resolve the agent's owner → load its active **"external"** mandate on that market → reuse the SAME `guardrailCheck`/`actOn` path before `Markets.trade`/`Perps.openPosition`, recording an attributed `AgentAction`. Module: `AgentTrading.externalTrade` (buy/sell/open/close) + `externalMandateView` (the agent reads its scoped mandate + a price/momentum snapshot before deciding — no owner data leaks) + `agentMandate`. SDK (`sdk/neugrid-agent.mjs`): `mandate()`, `trade()`, `buy/sell/openPosition/closePosition`, and a `tradeLoop(marketId, decide)` so a framework runs its own model. The owner arms an **External** strategy from the same Agent-tab form (now a 4th chip, with a leverage cap). Verified end-to-end (register → arm → read → buy/sell/open/close, with over_max_position / over_budget / over_max_leverage all blocked, 401 without a key, kill → 404). The native runner correctly holds an external mandate. **A bug fixed along the way:** the `max_position` cap wrongly gated *sells* too — it now gates only risk-ADDING actions, so a stop-loss or trim can always exit.
> **Deferred:** an owner **performance-fee split** when the trader ≠ owner, **trust-slashing** on mandate breach, and a **server-side scheduler** so native mandates tick 24/7 (today the runner is driven by the open terminal).

**Already in place (reuse — most of the integration exists):** agent identity + `wallet_address` + `spend_limit_per_job` + trust tiers (probation/trusted) + hashed gateway-key auth (`x-ng-agent-key`) + the agent gateway (`/api/agent-gateway/*`) + SDK (`sdk/`) + MCP server + x402-gated `signals` + agent reputation/rating + owner revenue split (`owner_split_bps`).

**Integration to build (the gaps):**
1. **Trading mandate / delegation** — the user authorizes an agent to trade a market (or portfolio) on their behalf, scoped: budget (USDC), max position size, **max leverage**, allowed stages, stop-loss / daily-loss cap, expiry, **kill-switch**. New `mandate` model (extends the spend-limit guardrail). This is the consent + risk boundary.
2. **Agent-authenticated trade endpoints** — agents trade via the gateway with `x-ng-agent-key`, acting on the owner's wallet under the mandate: `/api/agent-gateway/trade` (spot buy/sell), `/perp` (open/close), `/order` (limit). Today's trade routes use the cookie session (`getCurrentUserId`); add agent-key auth → resolve owner → **enforce the mandate** before calling `Markets.trade` / `Perps.openPosition`.
3. **Risk guardrails (CRITICAL)** — enforce per-trade + per-mandate limits server-side: budget remaining, position/leverage caps, stop-loss, daily-loss kill, rate-limit. Agent + money + leverage = the biggest attack surface (see `memory/neugrid-mechanism.md`). Liquidation exists; add mandate-level circuit breakers.
4. **Strategy hook** — decision logic by stage: native rule-based strategies (e.g. DCA on Alpha, momentum on Spot, hedged perp on Futures) AND external agents running their own model via SDK/MCP. Feed them market data + the existing `signals` (Ascension Arc, depth, flow). The platform witnesses; it doesn't dictate strategy.
5. **Agent Mode UI** — a toggle in the Trade panel: pick the agent, set the mandate (budget / leverage cap / stage / strategy), Start/Stop, a live **agent activity feed** (its trades + PnL + managed positions), and a prominent **kill-switch** + "agent is trading" indicator.
6. **Attribution + reputation** — every agent trade recorded + attributed; the agent earns a **trading rating** on realized performance; owner takes the split; mandate breach / bad performance slashes trust.

**Compliance / custody** — the agent acts strictly under explicit, scoped user authority on the user's own funds (non-custodial; `memory/crypto-rails.md`). No pooling — the mandate is the consent. Counsel before real money.

**Depends on** — solid trading + risk controls first (Integrity gaps + Perp completeness); ideally Stage-B real wallets. Build **native-agent mode first** (in-platform), then open to external agents via SDK/MCP.

**Acceptance** — a user toggles Agent Mode, picks an agent + a bounded mandate; the agent autonomously trades the market within those limits; the user sees its activity + PnL and can kill it instantly; the agent earns a rating.

---

## P3 — Economy & token

- ✅ **GRID acquisition** — BUILT (2026-06-30): earn via the Rewards ledger (Pulse→allocation→TGE vesting) + buy on the `gridMarket` GRID/USDC AMM (treasury-seeded, "Acquire GRID" on `/me`). The faucet stays dev-only.
- 🟡 **Wallets / deposit-withdraw** — currently a dev faucet (everyone starts funded). Add real balance on/off-ramp (ties to Stage B).

---

## P3 — Stage B (real chain) & infra

- 🟡 **On-chain settlement** — the chain rails are now DEVNET-VALIDATED end-to-end (2026-07-02: x402 paid round-trip + SAS mint/revoke; prod runs devnet chain mode). TradeX trade/perp settlement itself is still the in-platform ledger; mainnet is gated on compliance counsel — see `memory/crypto-rails.md`.
- ✅ **Postgres** — DONE (2026-07-02): prod (Cloud Run) hydrates from Cloud SQL and snapshots back; the full demo store was migrated + round-trip verified. See `memory/neugrid-infra.md`.

---

## P3 — Polish

- 🟡 **Ticker + footer site-wide** — currently terminal-only; consider promoting to the app shell.
- ❌ **Notifications** — fills, liquidations, graduations, stake-met events → the bell / toasts.
