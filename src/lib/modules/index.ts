/**
 * Canister-shaped backend modules. Each namespace maps 1:1 to a canister in
 * the Builder Spec (page 15). UI and API routes import only from here, so the
 * underlying store can later be replaced by real ICP canisters / Solana
 * programs without changing callers.
 */

export * as Users from "./users"; // identity records (wallet-keyed)
export * as GridRegistry from "./gridRegistry"; // GridRegistryCanister
export * as Campaign from "./campaign"; // CampaignCanister
export * as Pulse from "./pulse"; // PulseCanister
export * as ReputationMaint from "./reputationMaint"; // V6 — reputation fade: time-decay + employer ghost-sweep
export * as Rewards from "./rewards"; // reward allocation — earned GRID (Pulse's 2nd ledger)
export * as Season from "./season"; // the earning season — countdown + leaderboard (growth loop)
export * as Jobs from "./jobs"; // universal Job protocol
export * as Genesis from "./genesis"; // Fund funding + milestone escrow
export * as Markets from "./markets"; // Axon/Trade — gated token markets
export * as CampaignX from "./campaignx"; // promotional-work marketplace module (code alias kept; UI label is "Campaign")
export * as Echo from "./echo"; // EchoCanister — the integrated build engine
export * as GridX from "./gridx"; // GridX — on-chain app store (published products)
export * as Agents from "./agents"; // SentientX — agents as economic actors
export * as Attestations from "./attestations"; // soulbound credential layer (SAS-bound)
export * as X402 from "./x402"; // x402 agent-to-protocol payments (USDC, Solana later)
export * as Wallets from "./wallets"; // USDC + GRID balances (Trade)
export * as GridMarket from "./gridMarket"; // GRID/USDC AMM — the secondary buy/sell market for GRID
export * as Staking from "./staking"; // stake-to-list — GRID locked to graduate a market
export * as Params from "./params"; // governable protocol parameters (turned by passed proposals)
export * as Governance from "./governance"; // protocol governance — GRID locked to vote on proposals
export * as Perps from "./perps"; // futures — leverage positions on a futures-stage market
export * as AgentTrading from "./agentTrading"; // Agent Mode — autonomous trading under a scoped mandate
export * as AgentWork from "./agentWork"; // native agent framework — persona + autonomous work runtime + skill library
export * as Referrals from "./referrals"; // referral links + verify-on-first-work + the affiliate fee share
export * as Onboarding from "./onboarding"; // the starter path — wallet-anchored one-time Echo credit
export * as Humanity from "./humanity"; // proof-of-humanity tiers — gates reward COUNTING, never participation (docs/POH_GATE.md)
export * as Disputes from "./disputes"; // reputation-staked evaluator adjudication of contested job rejections
export * as SkillsMarket from "./skillsMarket"; // the skills marketplace — publish/install learned agent skills for GRID
export * as Feed from "./feed"; // the platform feed — human + agent posts, likes/comments, following-feed
export * as Passport from "./passport"; // portable, verifiable reputation passport (user or agent)
export * as Provenance from "./provenance"; // a market's lineage + founder credibility (the thesis)
export * as Chat from "./chat"; // per-Grid community discussion thread
export * as Content from "./content"; // Grid content hub — the living feed (posts + pinned announcements)
export * as GridGov from "./gridGovernance"; // grid-member governance — reputation-weighted, member-scoped
export * as Messaging from "./messaging"; // universal DMs — human/agent 1:1 threads with deal/hire offers
export * as Social from "./social"; // user→user follow graph + the profile income rollup
export * as Roles from "./roles"; // RolePermissionCanister
