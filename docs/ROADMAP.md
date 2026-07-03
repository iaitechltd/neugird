# NeuGrid Master Roadmap

*Set 2026-07-03 by the founder. Supersedes "go live ASAP" — the new north star:*

> **Build until it's perfect. No mainnet until the founder is happy. The platform
> must be strong enough to win formal partnerships with Solana and ICP (DFINITY),
> and ICP replaces conventional cloud as the host.**

Prod stays live on Cloud Run as the working environment (devnet money only), but
launch marketing / real money is OFF the table until this roadmap is deep enough.

---

## Workstream A — ICP integration (the partnership weapon)

ICP is not a checkbox: the founder plans to **host NeuGrid on ICP instead of
conventional cloud** and wants a concrete "here is where your tech carries our
platform" map to bring to DFINITY.

- **A1 · Deep research (first task)** — where ICP genuinely fits NeuGrid, mid-2026
  state: canister hosting for a Next.js app (SSR reality check, Juno, asset
  canisters), Chain Fusion ↔ Solana maturity (threshold Ed25519 signing —
  production or still devnet?), HTTPS outcalls, timers (our crons), vetKeys
  (secrets), on-chain frontends for `/d/` hosted apps, cost model vs Cloud Run,
  and DFINITY's grant/partnership programs. Output: a cited report.
- **A2 · Integration map (pitch document)** — rank NeuGrid features by ICP fit;
  pick the 2–3 flagship integrations; write the one-pager the founder hands to
  DFINITY ("NeuGrid runs X, Y, Z on ICP — we're the on-chain factory for
  entrepreneur economies").
- **A3 · Build the flagship integrations** — likely candidates (research will
  confirm/kill): host the `/d/` user-app deployments as ICP asset canisters
  (every Echo build gets an unstoppable URL — a killer demo), the NeuGrid
  frontend itself on ICP, ICP timers replacing Cloud Scheduler, phase-2
  treasury control via Chain Fusion.

## Workstream B — Product depth: TalentX + GridX (founder: "weak now")

- **B1 · TalentX overhaul** — from a listing wall to a real hiring market:
  rich profiles (portfolio, rates, availability), search/filter by skill +
  reputation, in-flow hire (offer → escrow → deliver, the messaging rail is
  already there), reviews from verified paid work only, ranked discovery.
- **B2 · GridX overhaul** — from a shelf to a real product marketplace:
  product detail pages that sell (live demo embed, proof-of-build provenance,
  version history from Echo), categories/search, usage + revenue stats,
  reviews from verified users, "built with Echo" → tokenize → trade pipeline
  made visible.
- Founder taste applies heavily here — build in increments, screenshot, confirm.

## Workstream C — Smart contracts (ALL of them; devnet first, audits before mainnet)

Order = the tiers from the 2026-07-03 review. Solana programs (Anchor) unless
an audited existing protocol does the job (borrow-don't-build still applies).

- **C1 · Milestone Vault — ✅ SHIPPED (2026-07-03)**: the program (4/4 test
  suites), devnet deploy (`DEnN1E…`), AND the platform rail — GenesisX raises
  mirror create/back/release/expire/kill onto the real vault (env-gated,
  fire-and-forget, prod-armed on devnet). v1 trust posture = platform-signed
  mirror; next stages: user-signed backings (wallet adapter) + the ICP
  canister as release authority (A3), then the Jobs-escrow lens.
- **C2 · GRID token + vesting** — standard SPL mint + audited vesting tooling
  (TGE-ready; no custom code expected).
- **C3 · Staking + slashing — ✅ SHIPPED (2026-07-03)**: per-market GRID
  lockups + MasterChef USDC fee share + fraud slash (principal sweeps,
  earned rewards survive). 5/5 suites, devnet-deployed (`3K6UCst…`), smoked
  with the real GRID mint, platform-mirrored + prod-armed (rev 00020).
- **C4 · Governance** — evaluate Realms (SPL Governance) integration vs custom;
  lock-to-vote with binding param execution.
- **C5 · Ownership splits** — SubGrid revenue splitter (human + agent teams).
- **C6 · Agent mandate wallets** — owner guardrails (budget/kill-switch)
  enforced by a contract wallet, not our server.
- **C7 · Deal proofs** — on-chain hash anchor for accepted agreements (cheap).
- **C8 · Trading rails** — graduated tokens list on an existing DEX (Raydium);
  perps via an existing protocol integration. We do NOT write an AMM/perp
  engine on-chain.
- Every contract ships devnet-first with an e2e harness; **mainnet deployment
  of any of them requires a professional audit** (budget line for later).

## Workstream D — Partnership readiness

- Metrics dashboard worth showing (real usage, agent economy stats, x402 volume).
- The pitch kit: A2's ICP map + the Solana story (already strong: x402 + SAS +
  USDC rails all validated on devnet through Coinbase).
- Demo script: idea → Echo build → live URL → funded raise → tokenized market,
  in one sitting.

---

## Sequencing (what happens in what order)

1. **A1 ICP research** → A2 integration map (this week; unblocks the pitch).
2. **C1 Milestone Vault** starts in parallel (longest engineering pole; it's
   the credibility centerpiece for BOTH partnerships).
3. **B1 TalentX → B2 GridX** as the continuous product track between contract
   milestones (founder feedback loops).
4. A3 flagship ICP builds once A2 picks them.
5. C2–C8 in tier order after C1 proves the pattern.
6. D assembles continuously; pitch when the founder says it's ready.

*Kept current as items ship — same convention as docs/TRADEX_ROADMAP.md.*
