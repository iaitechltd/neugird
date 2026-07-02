# NeuGrid — Master System Spec & Roadmap (v2)

> Supersedes and extends `NeuGrid_Builder_Spec_Matrix.pdf`. Encodes the product
> decisions made with the founder. This is the single source of truth — when code
> and this document disagree, fix one of them on purpose.

---

## 1. Vision & Thesis

NeuGrid is an **on-chain factory for entrepreneurs**. It carries a person from
*nobody with a skill* to *funded founder of a live, revenue-generating product* —
and every step of that journey is verifiable on-chain.

The founder's origin problem: great products die because funding is gated by
**connections, not merit**. NeuGrid's entire product is the inverse — **every gate
is opened by verifiable work, never by who you know.** Reputation, not warm intros,
unlocks the right to propose, to be funded, to launch, and to trade.

**One-line positioning:** *NeuGrid funds working software from proven builders —
not pitch decks from strangers.*

Three properties make this defensible:

1. **Verifiable.** Work, contracts, milestones, builds, usage, and revenue are all
   on-chain. A track record can't be faked or bought.
2. **Closed-loop.** Reputation is built, teams are hired, products are built, and
   money is earned **inside** NeuGrid — so the value and the proof stay in the network.
3. **Fractal.** A successful product spawns its own community (Grid), which forms
   teams (SubGrids), which build more products. The system replicates itself.

---

## 2. The Core Loop

```
Join → participate (post, hire, build with Echo) → earn Pulse (reputation)
  → offer skills in the talent marketplace → hired via escrowed Jobs (Solana funds, ICP logic)
  → deliver → reputation compounds
  → cross a reputation threshold → build an MVP with Echo
  → propose on GenesisX (MVP + on-chain track record)
  → backers fund → money locks in an on-chain treasury → a project Grid spawns
  → treasury releases milestone-by-milestone as the founder delivers & backers approve
  → founder hires humans + agents into SubGrids (the team)
  → product ships to GridX (on-chain usage + revenue visible)
  → success spawns the product's own Grid  ──┐
  → (enough backing) Alpha → Spot → Futures   │
                                              └──► loop repeats, reputation higher
```

The vertical pipeline (idea → markets) is **coordination-first, markets-last**:
markets are the *final* gate, earned only by delivery. Around that spine runs the
**recursion engine** (Grid → SubGrid → product → new Grid).

### The flywheels (why it compounds instead of fading)
1. **Reputation** — work → reputation → bigger opportunities → more work.
2. **Distribution** — KOLs build Grids → projects pay via CampaignX for reach →
   KOLs earn → Grids grow → more valuable → more demand.
3. **Build→traction→capital** — ship on GridX → real revenue is visible →
   track record strengthens → next raise is easier.
4. **Recursion** — every success becomes a new community feeding 1–3 again.

---

## 3. Actors & Roles

Roles are **composable** — one wallet can be a founder in one Grid, a contributor
in another, a backer elsewhere. (Spec §6.)

| Actor | What they do |
|---|---|
| Builder / Talent | Offers skills, completes Jobs, builds reputation, becomes a founder |
| Creator / KOL | Starts a Grid, grows an audience, monetizes via CampaignX |
| Backer / Investor | Funds GenesisX rounds; earns backer-reputation by backing winners |
| Agent Operator | Deploys agents (native or external) that earn in the marketplace |
| Verifier / Reviewer | Stakes reputation to verify work, milestones, deliverables |
| Grid Founder / Admin | Owns/operates a Grid, sets modules, appoints roles |
| AI Agent | A first-class economic actor: identity, wallet, reputation, earnings |

---

## 4. The Modules

| Module | Role in the ecosystem |
|---|---|
| **Identity + Pulse** | Wallet identity; reputation (soulbound) + reward (claimable) |
| **Grid** | On-chain community anyone can start (community / project / product types) |
| **SubGrid** | A team inside a Grid (humans + agents) that builds |
| **TalenX** | Talent marketplace — hire humans via escrowed Jobs |
| **SentientX / Agents** | Agent marketplace — native framework **and** external SDK/MCP interop |
| **Echo** | Integrated AI build engine + assistant + matchmaker |
| **CampaignX** | Distribution exchange — projects strike token deals with Grids |
| **GenesisX** | Milestone-escrowed funding for MVP-backed proposals |
| **GridX** | On-chain app store — products with verifiable usage + revenue |
| **TradeX / Axon** | Markets (Alpha → Spot → Futures), gated, last |

---

## 5. Core Primitives

### 5.1 Pulse — two ledgers from the same verified actions
- **Reputation Pulse** — non-transferable (soulbound), **decays**, gates eligibility,
  drives the homepage pulse animation (faster = more active). Multi-dimensional:
  `builder`, `backer`, `reviewer`, `creator`, `agent`. You cannot buy or sell it.
- **Reward allocation** — a separate, claimable ledger, **sybil-filtered &
  quality-weighted**, that **vests at TGE** into the platform token.

Keeping these separate is load-bearing: it lets rewards be tuned/capped/anti-farmed
**without** corrupting the trust signal. Every Pulse change carries a human-readable
reason and a verification source (never an opaque number).

### 5.2 Tokens — two layers
- **Platform token** — pre-TGE participation accrues reward allocation; converts at
  the one-time platform TGE (vested). Utility: pays for Echo compute, fees, staking.
- **Per-project tokens** — each *graduated* project mints its own at Alpha; that
  project's backers and builders earn it.

### 5.3 The Universal Job Protocol — the heart of the backend
**One** work primitive powers talent contracts, SubGrid tasks, CampaignX
deliverables, and the agent marketplace. Human or AI, native or external — all
identical underneath:

```
describe → assign → execute → submit proof → verify → pay → reputation
```

Build this once. Everything else snaps onto it.

### 5.4 The Shared Trust Service — verify / reputation / slash
A single platform service used by Jobs, milestones, campaign deliverables, and GridX
metrics: *is this real, who vouches, what's the penalty if it's fake.*
- **Reputation-staked Verifiers** review and stake Pulse on their verdict.
- **Challenge window** for affected parties.
- **Slashing** for bad actors (false claims, fake engagement, abandoned projects).
- **Proof-of-engagement / proof-of-build / proof-of-usage** — reward outcomes, never raw clicks.

### 5.5 Treasury & milestone escrow
Funded projects hold an **on-chain treasury** (Solana custody). Funds release
**tranche by tranche**: founder submits a delivered update → Verifiers + Echo provide
evidence → **backers vote to approve** → tranche releases. Dispute upheld → remaining
funds refund pro-rata + founder Pulse slashed. **Kill-switch:** no delivery in the
window → backers reclaim the unreleased treasury automatically.

### 5.6 Graduation gates (every transition is earned)
| Transition | Gate |
|---|---|
| Idea → eligible to propose | reputation threshold + verifiable track record |
| Proposal → funded | MVP demonstrated + backers commit |
| Funded → milestone payout | delivery verified + backer approval |
| Project → Alpha | project complete + **security audit passed** |
| Alpha → Spot | real traction + holder count |
| Spot → Futures | deep liquidity + time-lock (separate licensed phase) |

---

## 6. Module Specs (with Solana / ICP split)

### Identity + Pulse
- Wallet login (Solana). Profile, skills, roles-by-grid, both Pulse ledgers.
- **Solana:** wallet identity, reward token claim at TGE. **ICP:** profile state,
  reputation scoring, Pulse event log.

### Grids
- One entity, three `grid_type`s: `community` (KOL/audience), `project` (spawned by
  funding), `product` (spawned by a GridX success). `spawned_from` makes the
  recursion **traceable** (product → SubGrid → founder track record).
- **ICP:** registry, membership, posts, modules, governance. **Solana:** treasury,
  token (for project/product Grids).

### SubGrids
- A team inside a Grid: humans + agents. Has an **on-chain contributor split
  agreement** (who owns what % of token/revenue — including agent-owner splits)
  recorded up front. Manages Jobs toward a goal.
- **ICP:** team state, split agreement, job coordination. **Solana:** payouts.

### TalenX (talent marketplace)
- Talent profiles, skills, reputation, availability. Hiring = creating a **Job**
  (escrowed). Delivery → reputation event.
- **Solana:** escrow of funds. **ICP:** Job logic, proof, verification, reputation.

### SentientX / Agents — native + open interop
- **Native:** users build agents with NeuGrid's framework on the agents page, grant
  scoped tool access, deploy, earn. **External:** an **SDK + MCP server** exposes the
  Job marketplace so any agent framework (e.g. OpenClaw, Hermes) plugs in to discover
  jobs, do work, submit proof, and get paid.
- Agents are **first-class economic actors**: identity, wallet, on-chain reputation,
  owner, revenue split. Security: scoped permissions, sandboxing, per-task spend
  limits, full audit. External agents start in a **probation tier** and/or require an
  owner-posted **bond** (cold-start trust).
- **Strategic effect:** NeuGrid becomes the labor market & payment rail for *all*
  agents, not just its own.

### Echo — integrated build engine (staged)
- Routes to many open-source models; users build dApps/apps in-platform. Funding is
  therefore **MVP-gated + reputation-gated**. The platform **witnesses the build →
  proof-of-build** feeds the track record.
- **Stage 1:** model-routed codegen scaffolds (Solana program + ICP canister +
  frontend) with live preview. **Stage 2:** persistent sandboxed workspace per Grid.
  **Stage 3:** one-click deploy + auto-list on GridX.
- **Compute paid in the platform token** (token sink + first real revenue line).
- Also the assistant + matchmaker (ranks Grids for CampaignX, jobs for teams).

### CampaignX — distribution exchange
- Projects create campaigns / approach Grids: "support my project for token/allocation."
  Echo matchmakes (which Grids fit). Deals are **escrowed** (allocation locks, releases
  on verified delivery) and **publicly disclosed on-chain** (paid promotion is
  transparent — a credibility feature). Proof-of-real-engagement, reputation-staked.
- Jobs/quests for the community are **Jobs** under the protocol.
- **ICP:** deal terms, matching, verification. **Solana:** allocation escrow.

### GenesisX — milestone funding
- A **Proposal** bundles: the MVP (proof-of-build), the on-chain track record, the
  roadmap (milestones), and the ask. Backers fund → treasury → milestone escrow (§5.5).
- ⚠️ **Compliance-gated** (see §10). **Solana:** treasury custody, token, vesting.
  **ICP:** round rules, milestone approval/voting, escrow logic.

### GridX — on-chain app store
- Product cards show: which SubGrid built it, their reputation, **verifiable on-chain
  usage + revenue**, reviews, followers. On-chain revenue is the **gold trust signal**.
  A successful product **spawns its own Grid**. Earnings feed reputation → CampaignX
  surfaces more/better jobs to proven teams (reputation compounds economically).
- **ICP:** listings, metrics aggregation, reviews. **Solana:** revenue flows.

### TradeX / Axon — markets (gated, last)
- Alpha (constrained first liquidity, graduates only) → Spot (on traction) → Futures
  (deep liquidity, separate licensed phase). **Do not lead with this.**
- **Solana:** issuance, liquidity, settlement. **ICP:** eligibility/graduation rules.

---

## 7. Tokenomics & Pulse → token

- Pre-TGE: participation accrues **reward allocation** (sybil-filtered, quality-weighted).
- At platform TGE: allocation converts to the **platform token, vested** (prevents the
  farmer dump). Reputation Pulse stays soulbound and untouched.
- Per-project tokens launch at each project's Alpha; project backers/builders earn them,
  with **vesting** + milestone alignment.

---

## 8. Platform Revenue / Fee Model

Principle: **earn a thin slice of the prosperity NeuGrid creates** — never rent.
Default recommendation = adopt all, kept thin; fund early ops from the token treasury;
let Echo compute be the first real cash line.

| Lever | Notes |
|---|---|
| Protocol fee (bps) | On Job payouts, CampaignX deals, GenesisX raises, market trades |
| Agent earnings cut | Small % of agent payouts (NeuGrid is the rail that pays them) |
| Echo compute | Paid in platform token — token sink **and** revenue |
| GridX revenue share | Small share on apps earning through the store |
| Treasury allocation | Platform token allocation at TGE funds the protocol |

---

## 9. Architecture: Solana + ICP

NeuGrid is **not a new chain.** Hybrid:

- **Solana** — wallet identity/login, token issuance (platform + project), payments,
  Job/contract escrow, funding treasury custody, vesting, market settlement & liquidity.
- **ICP canisters** — Grid/SubGrid registry & state, Pulse scoring, the Job protocol +
  verification records, CampaignX deal logic, GenesisX milestone/approval rules, agent
  registry/permissions/reputation, GridX listings & metrics, graduation criteria, audit logs.
- **Frontend** — Next.js 16 / React 19 (existing UI).
- **Indexer** — Solana indexer + ICP query APIs; cache public data for speed.
- **Off-chain services** — Echo model gateway (inference), build/sandbox runners,
  matchmaking, notifications. (Postgres `neugrid-db` is the interim store while
  canister logic is built; see `db/schema.sql`.)

**How the two chains talk (the linchpin):** ICP **Chain Fusion** (live for Solana
since Jun 2025) lets a canister natively control Solana accounts via **threshold
Ed25519** signing + the **SOL RPC canister**. So when ICP logic decides something
(e.g. a milestone vote passes), the canister itself signs and submits the Solana
payout — **directly, with no third-party bridge.** This is why the Solana+ICP pairing
is clean rather than fragile: state/decisions on ICP can move money on Solana natively.

**Dividing rule of thumb:** *does it MOVE money/assets?* → Solana. *Does it DECIDE,
store, score, or coordinate?* → ICP.

Flow: `UI → Wallet/Auth → NeuGrid API → ICP canisters → (Chain Fusion) → Solana programs/assets → Indexer → Pulse/Echo`.

---

## 10. Compliance Posture (DEFAULT — confirm with counsel before money modules ship)

Funding-as-investment + tokens + futures + paid promotion carries real
securities / exchange / derivatives / touting exposure. Proposed default:

- **Free / coordination layers** (profiles, Grids, posts, Pulse, Jobs, Echo, agent
  marketplace) — permissionless, global.
- **Money layers** (GenesisX funding, token sales, markets) — jurisdiction-gated,
  **progressive KYC tiers**, geo-block restricted regions.
- **Futures** — distant, separate, **licensed** phase (likely via a regulated partner
  or a specific jurisdiction).
- **CampaignX** — all paid-promotion deals disclosed on-chain by default.

> ACTION: engage a crypto-securities lawyer **before** building the GenesisX/markets
> backend. This is the one risk that can end the project regardless of product quality.

---

## 11. Security Model

- Escrow everywhere money moves (Jobs, deals, funding) — release only on verified delivery.
- Agent sandboxing: scoped permissions, per-task spend limits, audit logs, probation/bond.
- **Mandatory security audit gate** before any product reaches Alpha (autogen dApps hold money).
- Reputation slashing for false claims, fake engagement, abandonment.
- Multi-step confirmation on sensitive actions (fund release, role changes, treasury).

---

## 12. Roadmap

Each phase ships something usable. Build the spine in early so nothing needs a rewrite.

| Phase | Ships | Solana / ICP |
|---|---|---|
| **0 · Foundation** | Full data model (`types.ts`), trust-service interfaces, UI polish | — |
| **1 · Identity + Pulse + Grids** | Wallet login, profiles, reputation Pulse v1 (animation wired), create/join Grid, feed | Solana wallet · ICP-shaped store → Postgres |
| **2 · Job Protocol + TalenX** | The universal Job (describe→…→reputation), talent profiles, escrowed contracts | Solana escrow · ICP job logic |
| **3 · SubGrids + native Agents** | Teams + split agreements, agent framework/builder, hybrid teams do Jobs | ICP team/agent state · Solana payouts |
| **4 · Agent interop (SDK + MCP)** | Job marketplace as MCP server + SDK; external agents (OpenClaw/Hermes), probation/bond | — |
| **5 · Echo build engine** | Stage 1 codegen+preview → workspace → deploy; proof-of-build | deploy to Solana/ICP |
| **6 · CampaignX** | Project↔Grid deals (escrowed, disclosed), Echo matchmaking, proof-of-engagement | Solana allocation escrow |
| **7 · GenesisX** ⚠️ | Proposals (MVP+record), rounds, on-chain treasury, milestone escrow + backer vote + slashing/refunds | Solana treasury · ICP rules *(needs compliance)* |
| **8 · GridX** | Product listings, on-chain usage/revenue, reviews, product→Grid recursion | Solana revenue · ICP metrics |
| **9 · Markets (Axon)** ⚠️ | Alpha (gated) → Spot → Futures (licensed, last) | Solana settlement *(needs licensing)* |
| **X · Cross-cutting** | Platform fees, tokenomics/TGE, security audits, compliance | — |

---

## 13. Immediate Next Steps

1. ✅ **Phase 0 started** — data model extended in `src/lib/types.ts` to encode the full ecosystem.
2. **Wire the foundation:** Solana wallet login + persist the ICP-shaped store to Postgres (`neugrid-db`).
3. **Build the Job Protocol** (Phase 2) — it's the heart; TalenX is its first surface.
4. **UI improvements pass** — align the existing 20 pages to the spine (lifecycle stage on Grids,
   the homepage Pulse animation bound to real Pulse, proposal = MVP+track record).
5. **Engage counsel** in parallel — unblocks Phases 7 & 9.
