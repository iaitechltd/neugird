# NeuGrid × ICP — the one-pager for DFINITY

*Workstream A2 (docs/ROADMAP.md). The pitch the founder hands DFINITY. Backing
research + sources: docs/ICP_INTEGRATION.md. Everything below is **already built
and proven** unless marked "mainnet flip pending" — this is not a proposal, it's
a working integration asking for cycles + a grant to go to mainnet.*

---

## What NeuGrid is

The on-chain factory for entrepreneurs: it carries a person from
nobody-with-a-skill to funded founder of a live product, and every step —
build, hire, fund, deliver, tokenize — is cryptographically verifiable. Merit,
not connections, opens every gate. Real users build apps with AI (Echo),
raise milestone-escrowed funding (GenesisX), and their work anchors on-chain.

## The headline

**NeuGrid's best ICP story is not "host our website" — it's Chain Fusion.**
ICP canisters already **are** the trustless signer for our Solana USDC rails:
no bridge, no oracle, no server holding keys. That's a marquee Chain Fusion use
case — it needs *both* chains, showcasing ICP as the trust layer over Solana's
liquidity — and it runs today.

## Three flagship integrations — all built, all proven

**1 · Canister-held escrow via Chain Fusion — the flagship.**
Our milestone-escrow authority (GenesisX raises + job escrow — a deployed Anchor
program) is held by an ICP canister, not any server. Threshold **Ed25519**
(production `key_1`) is exactly Solana's signature scheme; the NNS-controlled
**SOL RPC canister** (`tghme-zyaaa-aaaar-qarca-cai`, NNS #136985) submits the
transactions. **Proven:** a canister signed an SPL-USDC transfer that *settled on
Solana devnet* (tx `4WEbtR47…`), then co-signed a real vault milestone release
that paid the tranche to the cent — while a policy layer **rejected** a
non-vote (plain-transfer) message. The canister signs releases *and only*
releases. Our per-agent mandate wallets upgrade the same way: ICP-enforced
spend caps.

**2 · `/d/` user apps hosted on ICP — the hosting story that works.**
Every app a founder builds on NeuGrid deploys to a static URL (`/d/<slug>`) —
exactly what ICP **asset canisters** serve: certified, tamper-proof,
unstoppable, ~**$0.68/canister**. **Proven:** every Echo deploy mirrors its
version-pinned snapshot onto the `neugrid_hosting` asset canister at the same
path, verified serving the exact app. This is a stream of *real* canister
deployments from *real* users (our GRID deploy fee covers cycles) — measurable
ICP adoption, not a one-off port. It also gives generated apps a genuinely
separate origin.

**3 · Canister timers replace Cloud Scheduler.**
Our platform crons (agent work, reputation upkeep) fire from a `neugrid_cron`
canister via HTTPS outcalls (`is_replicated=false`, one request per tick).
**Proven:** both jobs returned 200 driven entirely from the canister. On-chain
infrastructure, not a cost center.

## Stated up front (credibility)

- **Solana blockhashes rotate (~400ms) faster than outcall latency (~3s)**, so
  `getLatestBlockhash` is unusable — our canister-signed transactions use
  **durable nonces** from day one. Known, documented, designed around.
- **The Next.js platform itself stays on conventional cloud.** Asset canisters
  are static-only and DFINITY's own guidance is that SSR apps can't move whole;
  LLM/payment calls exceed the 30s / 2MB / no-streaming outcall limits. We pitch
  the **hybrid** DFINITY itself recommends: app shell on cloud,
  **trust-critical logic** (escrow signing, app hosting, verification anchors)
  in canisters.

## Traction to point at

- ICP side: 3 flagships built + proven on the local replica / devnet (above);
  mainnet flip is cycles-gated — that's literally what this ask unblocks.
- Solana side already production-validated on devnet: x402 agent payments
  (through Coinbase CDP), SAS soulbound credentials (mint + revoke), USDC rails,
  and **seven on-chain contract rails** live on devnet.
- One-sitting demo: idea → Echo builds real software → live `/d/` URL (mirrored
  to an ICP canister) → milestone-escrowed raise (authority = an ICP canister) →
  tokenized market.

## The ask

A **$25K Developer Grant** scoped to *"Chain Fusion escrow: canister-held
milestone-vault authority over Solana USDC + per-build asset-canister hosting
for user apps"* — ship it to mainnet, then the **$100K** follow-on + **ICP.Lab**
(Zurich) with live usage numbers. Apply: dfinity.org/grants.

**One line:** *NeuGrid is the on-chain factory for entrepreneur economies — and
ICP already signs its escrow, hosts its apps, and runs its clock.*
