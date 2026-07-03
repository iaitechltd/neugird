# NeuGrid × ICP — Integration Map

*Workstream A2 on docs/ROADMAP.md. Built from adversarially-verified research
(2026-07-03, 15 sources, 3-vote verification per claim) + a follow-up grants
check. This is the map the founder brings to DFINITY.*

**The headline: NeuGrid's best ICP story is NOT "host our website" — it is
Chain Fusion. ICP canisters can BE the trustless escrow signer for our Solana
USDC rails, with no bridge and no server holding keys. That is a flagship
Chain Fusion use case, and it is production-ready on ICP mainnet today.**

---

## Rank 1 — Canister-held escrow via Chain Fusion (the flagship)

**What:** NeuGrid's milestone escrow (GenesisX raises + job escrow — now a
deployed Anchor program, `contracts/milestone_vault`) gets its authority held
by an ICP canister instead of any server: threshold **Ed25519** signing
(production `key_1`, GA since Sept 2024) is exactly Solana's signature scheme,
and the NNS-controlled **SOL RPC canister**
(`tghme-zyaaa-aaaar-qarca-cai`, live on the fiduciary subnet, NNS proposal
#136985, June 2025) reads balances and submits transactions with 3-provider
consensus — no bridges, no oracles, no API keys.

**Why it matters for the pitch:** "an entrepreneur-funding platform whose
escrow releases are signed by an unstoppable canister, moving real USDC on
Solana" is a marquee Chain Fusion demo — it needs BOTH chains, showcasing
ICP as the trust layer over Solana's liquidity. Our x402 agent-payment rail
and per-agent wallets upgrade the same way (a canister as each agent's
mandate-enforcing wallet = ICP-enforced spend caps).

**Engineering caveat to state up front (credibility):** Solana blockhashes
rotate (~400ms) faster than fiduciary-subnet outcall latency (~3s), so
`getLatestBlockhash` is unsupported — canister-signed transactions must use
**durable nonces** from day one. Known, documented, designable-around.

Sources: [DFINITY: ICP reaches the shores of Solana](https://medium.com/dfinity/icp-reaches-the-shores-of-solana-0f373a886dce) ·
[sol-rpc-canister repo](https://github.com/dfinity/sol-rpc-canister) ·
[Chain Fusion / Solana docs](https://docs.internetcomputer.org/building-apps/chain-fusion/solana/overview) ·
[Threshold Schnorr/EdDSA](https://medium.com/dfinity/unlocking-chain-fusion-with-schnorr-and-ecdsa-signatures-b951d01ec9c3)

## Rank 2 — `/d/<slug>` user apps hosted on ICP (the hosting story that works)

**What:** every Echo build deploys a static single-page app to NeuGrid hosting
(`/d/<slug>`). Those are exactly what ICP **asset canisters** serve — certified,
tamper-proof, unstoppable. Verified cost floor: **500B cycles ≈ $0.68 per
canister** on a 13-node subnet, plus small storage/idle burn.

**The pitch line:** "every app a founder builds on NeuGrid gets an on-chain,
censorship-resistant URL on ICP" — a stream of REAL canister deployments from
real users (with our GRID deploy fee covering cycles), i.e. measurable ICP
adoption, not a one-off port. Also kills our CSP-sandbox problem: user apps
live on a genuinely separate origin.

Sources: [ICP gas costs](https://internetcomputer.org/docs/building-apps/essentials/gas-cost) ·
[JS frameworks on ICP](https://internetcomputer.org/docs/current/developer-docs/web-apps/browser-js/js-frameworks)

## Rank 3 — Platform data integrity anchors (cheap, incremental)

Canister timers can replace Cloud Scheduler for on-chain-touching crons, and
small deterministic reads (SOL RPC consensus reads, credential existence
checks) fit HTTPS outcalls / the SOL RPC canister fine. Reputation-event and
deal-agreement hash anchoring into a canister (certified variables) gives
"NeuGrid's track records are externally verifiable" without moving the
database. Secondary talking points, not the lead.

---

## Honest blockers (do NOT pitch these — pitch the hybrid)

- **The Next.js 16 platform itself cannot move to ICP.** Asset canisters are
  static-only; DFINITY's own guidance: canisters can't run server-side JS —
  static export breaks our server components, route handlers, middleware, and
  SSR. **Juno is in maintenance mode** ("do not use it for anything serious")
  and even active it was static-export-only. The credible architecture is
  **hybrid**: app shell on conventional cloud, TRUST-CRITICAL logic (escrow
  signing, mini-app hosting, verification anchors) in canisters. This is also
  what DFINITY's docs themselves recommend for SSR apps.
- **LLM + payment API calls stay off-canister.** HTTPS outcalls: ~30s hard
  timeout (Claude generations exceed it), 2MB cap, no streaming/SSE, and
  replicated mode fires ~13 duplicate requests (a paid non-idempotent call
  billed 13×; non-deterministic LLM bodies fail consensus). Echo codegen, the
  agent brain, and Coinbase CDP settlement remain server-side.

*(Two refuted claims we must never cite: the wrong SOL RPC principal
`2xib7-jqaaa-aaaar-qai6q-cai`, and "Solana is the least mature Chain Fusion
rail with no SPL helpers" — both failed verification.)*

## The ask — DFINITY programs (verified 2026-07-03)

- **Developer Grants Program** — tiers **$5K / $25K / $100K** (the $100K
  generally follows a smaller grant), paid in ICP; focus areas include
  Infrastructure, Integrations & APIs, and Apps & Open Internet Services (we
  fit the last two). Apply: [dfinity.org/grants](https://dfinity.org/grants)
  (Submittable form). Grantees get access to **ICP.Lab acceleration camps**
  (Zurich).
- **Community Grants Program** — the community-facing sibling:
  [dfinity.org/community-grants](https://dfinity.org/community-grants).

**Suggested sequence:** apply for a $25K Developer Grant scoped to "Chain
Fusion escrow: canister-held milestone vault authority over Solana USDC +
per-build asset-canister hosting for user apps," ship it, then pursue the
$100K follow-on / ICP.Lab with live usage numbers.

## Build order (workstream A3, once the founder approves)

1. **PoC: canister signs a Solana devnet USDC transfer** via threshold Ed25519
   + SOL RPC canister with a durable nonce (the whole Rank-1 thesis in one
   demo).
2. `/d/` deploys → per-app asset canisters (behind a flag beside current
   hosting; GRID deploy fee covers cycles).
3. Milestone-vault authority handover: the vault program accepts a
   canister-derived signer as release authority.
4. Timers/anchoring tail (Rank 3).

Sources for grants: [Developer Grants](https://dfinity.org/grants) ·
[Grants overview](https://dfinity.org/grants-overview) ·
[Submission guide](https://support.dfinity.org/hc/en-us/articles/4401932864020-How-to-Submit-a-Grant-Application) ·
[Community Grants](https://dfinity.org/community-grants)
