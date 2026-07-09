# Proof-of-Humanity Gate — scoping + Phase-1 build (2026-07-09)

The red-team (2026-07-08, see the go-live hardening work) closed the big reputation
wash-farm but left four **residual sybil vectors, all with the same root**: one
human can present as N wallets. This doc scopes the identity gate that closes
them, records the verified provider landscape, and locks the architecture. The
Phase-1 machinery is BUILT (see §6); every gate defaults **OFF** until governance
(the founder) flips it for Season 0.

## 1 · Threat model — what's still farmable without identity

| Vector | Cost to attacker | Prize |
|---|---|---|
| Starter-credit farm at N wallets | fresh wallet per run | +40 builder rep + credential per wallet (allocation already excluded) — inflates leaderboard/discovery |
| `product_listed` from a starter build | fresh wallet | +20 creator rep+allocation per wallet |
| Referral bonus via sockpuppet's first real action | small real spend | +15 creator rep+allocation to the referrer, repeatable at N sockpuppets |
| GridX self-review from a funded 2nd account | real USDC + 2.5% fee | 5★ "verified" review — credibility at the point of trade |

**Common root:** the platform can prove *work happened* (escrow, proofs, SAS) but
not *how many humans are behind the wallets*. Identity gates the reward-COUNTING.

## 2 · Design principles (locked)

1. **Participation stays open; extraction is gated.** Anyone with a wallet can
   work, build, chat, trade — no KYC to *use* NeuGrid (the non-custodial posture
   in docs/DEVNET.md / the crypto-rails research). Verification is required only where value *leaves* the
   system: reward counting → TGE, the starter subsidy, referral payouts.
2. **The gate is a read-time predicate, so verification is RETROACTIVE.** The
   reward ledger is *derived* from Pulse events on every read (`rewards.ts`);
   nothing is stored per-event. A user who verifies the day before the TGE has
   their **entire earned history count**. No event migration, no lost work — the
   unverified state shows as "pending verification", never "gone".
3. **Tiers, not a binary.** Different gates need different assurance; a single
   hard gate either kills onboarding or under-protects the TGE.
4. **Pluggable providers.** The attestation record is provider-agnostic; the
   provider choice is config, not architecture. Never marry one identity vendor
   (same rule as the agent-brain seam).

## 3 · The tier model

| Tier | Name | Proof | Farm cost |
|---|---|---|---|
| **T0** | Wallet | SIWS signature (exists today) | ~zero |
| **T1** | Established wallet | native on-chain signals: wallet age ≥ 30d AND ≥ 25 transactions (thresholds in `humanity.ts`) | time — a wallet farm needs N aged, active wallets |
| **T2** | Verified human | an external PoH attestation (Civic uniqueness / World ID / …) bound to the wallet | a real face/identity per account |

**What each gate requires (governable Params, both default 0 = OFF):**

| Gate | Param | Season-0 recommendation |
|---|---|---|
| Starter Echo credit | `starter_gate_tier` | **1** — keeps onboarding self-serve but ends the fresh-wallet credit farm |
| Reward counting + TGE snapshot + referral verification | `rewards_gate_tier` | **2** — allocation is ownership; one human, one counted ledger |

The referral gate rides `rewards_gate_tier` on the **referee**: a sockpuppet's
first action can't pay its referrer until the sockpuppet proves a human. GridX
review-credibility weighting is a Phase-2 wiring of the same tier check.

## 4 · Provider landscape (web-verified 2026-07-09)

- **Civic — the recommended first provider.** Solana-native and an SAS launch
  partner (May 2025, with Trusta Labs + Solid + Solana.ID) — i.e. it lives on the
  SAME attestation rail NeuGrid already runs. 2M+ verifications. Pass ladder fits
  our tiers exactly: CAPTCHA → **Liveness/Uniqueness (video selfie → 3D face map,
  one pass per human per Solana wallet)** → full ID+sanctions. Passes are
  on-chain gateway tokens — server-side verifiable with a read. Pricing listed at
  $0.05/active pass/month. **Open item:** commercial model — issuing under our own
  gatekeeper network (we pay) vs verifying a user-acquired uniqueness pass
  (getpass.civic.com); confirm with Civic before Season 0.
- **World ID — the high-assurance alternative.** Live on Solana via Wormhole
  (`solana-world-id-program`); DRiP and DSCVR already gate with it. April 2026
  "full-stack proof of human" adds agent-vs-human signals (relevant to our agent
  economy). Strongest uniqueness (orb), but hardware-gated user coverage. Ship as
  a second adapter, not the default.
- **Human Passport (ex-Gitcoin Passport, Holonym/human.tech)** — 0–100 score
  (≥20 = human threshold), ML sybil models, EigenLayer AVS. **EVM-centric** —
  weak Solana-wallet fit today. Skip; revisit if they land Solana stamps.
- **Trusta Labs** — AI/graph sybil scoring, also an SAS partner. Candidate for a
  later funding-graph score (the Linea airdrop filtered ~40% of claimants with
  cluster analysis — the industry norm we should eventually match).
- **Native heuristics** (wallet age/activity) — standard first line everywhere;
  cheap, real, and already sufficient for T1.

Sources: [Civic on SAS](https://attest.solana.com/use-cases/civic) ·
[SAS launch](https://solana.com/news/solana-attestation-service) ·
[Civic pricing](https://www.civic.com/pricing/pass-pricing) ·
[Uniqueness Pass](https://support.civic.com/hc/en-us/articles/6855280050839-What-is-Civic-Uniqueness-Pass) ·
[World ID on Solana via Wormhole](https://world.org/blog/announcements/wormhole-brings-world-id-solana-new-integrations-take-off-globally) ·
[solana-world-id-program](https://github.com/wormholelabs-xyz/solana-world-id-program) ·
[World ID full-stack PoH](https://world.org/blog/announcements/world-id-full-stack-proof-of-human) ·
[Human Passport](https://human.tech/blog/human-passport-proof-of-personhood-and-sybil-resistance-for-web3)

## 5 · Recommendation (the locked pick, pending founder sign-off)

**Hybrid, tiered, Civic-first:**
1. **Phase 1 (BUILT, this session):** the tier machinery + native T1 signals +
   read-time gates behind governable Params (default off) + `/rewards`
   verification surface. Zero external dependency; nothing changes for users
   until governance flips the params.
2. **Phase 2 (next):** the Civic uniqueness adapter — `Humanity.attest(user,
   "civic", ref)` fired by an on-chain gateway-token check on the user's SIWS
   wallet. Settle the Civic commercial question first. World ID adapter follows
   as the alternative path to T2 (user picks either).
3. **Phase 3 (later/optional):** funding-graph clustering (Trusta-style) as a
   TGE-eve sweep; an optional GRID-bond path to T1 for fresh-but-serious wallets.

Why not World-ID-first: coverage (orb access) would throttle Season-0 onboarding.
Why not Human-Passport: EVM-centric. Why Civic: Solana-first, SAS-aligned,
pass ladder maps 1:1 onto our tiers, and the check is an on-chain read.

## 6 · Phase-1 build (shipped with this doc)

- **`src/lib/modules/humanity.ts`** — `HumanityRecord` on the user (`tier` ·
  native `signals` · provider-agnostic `attestation`); `tierFor` / `attest` /
  `revoke` / `refreshSignals` (dependency-free Solana JSON-RPC:
  `getSignaturesForAddress` → tx count + oldest-signature age; fail-safe on
  pseudo/dev wallets) / `starterGateOk` / `rewardsGateOk` / `view`.
- **Params (22 now):** `starter_gate_tier` + `rewards_gate_tier` (0–2, default
  0 = open) — flipping them is a governance action, so turning the gate on for
  Season 0 is itself on-chain-governable.
- **Gates wired:** `onboarding.claimStarterGrant` (+ `starterState.needs_verification`)
  · `rewards.ledgerFor` (splits `total_allocation` into `counted` vs
  `pending_verification` + a `humanity` block) · `rewards.runTGE` (snapshot skips
  unverified when gated — verify-then-rerun still works pre-TGE) ·
  `rewards.totalIssued` · `referrals.checkVerify` (referee tier).
- **Routes:** `GET /api/humanity` (state + gates) · `POST /api/humanity/refresh`
  (re-reads chain signals).
- **UI:** a VERIFICATION panel on `/rewards` (tier, signals, refresh, gate
  status, pending-verification callout when gated).
- **Persistence:** `users.humanity` jsonb (schema + SPEC + migration
  `db/migrations/2026-07-09-humanity.sql`).

## 7 · Founder decisions — LOCKED 2026-07-09

1. ✅ **Starter grant requires T1** (lived-in wallet) — `starter_gate_tier = 1`
   at Season 0.
2. ✅ **Reward counting requires T2** (verified human) — `rewards_gate_tier = 2`
   at Season 0. Both flips happen via governance proposals, not at deploy.
3. ✅ **Provider = Civic** (Uniqueness Pass). Adapter BUILT (§8).

Still open (non-blocking): T1 thresholds (30d/25tx — constants for now) · a
GRID-bond alternate path to T1 · the Civic commercial-model confirmation below.

## 8 · Phase-2 build — the Civic adapter (shipped 2026-07-09)

- **Flow:** the user acquires a Uniqueness Pass themselves at
  [getpass.civic.com](https://getpass.civic.com/?pass=unique&chain=solana)
  (video selfie → a non-transferable on-chain gateway token on their wallet) →
  on `/rewards` clicks **Check my pass** → `POST /api/humanity/civic` reads the
  token on their SIWS wallet → valid ⇒ `Humanity.attest(uid, "civic", <token>)`
  ⇒ tier 2. We only READ chain state — nothing custodial, no PII touches NeuGrid.
- **Verified constants (2026-07-09):** gateway program
  `gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs` (identity.com
  on-chain-identity-gateway repo) · Uniqueness network
  `uniqobk8oGh4XBLMqM68K8M2zNu3CdYX7q5go7whQiv` (Civic CTO's mainnet script —
  note: differs from older third-party lists; trust this one).
- **Lib:** `@identity.com/solana-gateway-ts` → `findGatewayToken(conn, owner,
  network)` + `token.isValid()`. Dynamic tracer-invisible import → in the
  Dockerfile overlay. Envs: `NEUGRID_CIVIC_RPC` (default mainnet-beta — passes
  live on MAINNET even while chain rails run devnet) ·
  `NEUGRID_CIVIC_NETWORK` (default = the uniqueness network above).
- **⚠️ Risks to clear before ARMING (not before merging):** (1) Civic's docs
  now front their agent/auth platform — confirm Pass product longevity + the
  commercial model (user-acquired passes vs our own gatekeeper network and who
  pays the $0.05/pass/mo) with Civic (bd@civic.com); (2) Civic joined SAS
  (May 2025) — their PoH may ship as SAS attestations going forward, which is
  even better for us (we already read SAS); the `attest()` seam absorbs either
  shape. (3) The positive path (a real pass ⇒ tier 2) needs one live human test
  — the founder getting a pass on their own wallet is the cheapest QA.
