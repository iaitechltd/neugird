/**
 * NeuGrid core domain types.
 * Single source of truth shared by the frontend and the canister-shaped
 * backend modules. See `docs/NEUGRID_MASTER_SPEC.md` for the full system design.
 *
 * Design rule: these shapes are deliberately backend-agnostic so the same
 * types serialize cleanly whether state lives in the local store today or in
 * ICP canisters / Solana programs later.
 *
 * v2 extends the original spec with the full ecosystem: the universal Job
 * protocol, the shared trust service, lifecycle/graduation gates, milestone
 * escrow, the two-ledger Pulse, the two-layer token model, the open agent
 * economy (native + external via SDK/MCP), GridX products, markets, and fees.
 * New fields on pre-existing interfaces are OPTIONAL so the seeded in-memory
 * store keeps type-checking until it is migrated.
 */

export type ID = string;
export type ISODate = string;

/* ----------------------------- Modules ----------------------------- */

export type ModuleKey =
  | "Grid"
  | "SubGrid"
  | "GridX"
  | "Campaign"
  | "Talent"
  | "SentientX"
  | "Fund"
  | "Pulse"
  | "Axon"
  | "Echo";

/* ------------------------------ Roles ------------------------------ */
// Spec page 8 — roles are composable; one wallet can hold different roles
// in different Grids. Grid owners may also mint custom roles.

export type SystemRole =
  | "GridFounder"
  | "GridAdmin"
  | "Contributor"
  | "Creator" // Creator / KOL
  | "AgentOperator"
  | "Backer"
  | "Verifier"; // Verifier / Reviewer

/** A role assignment scoped to a Grid (or SubGrid). */
export interface RoleAssignment {
  grid_id: ID;
  subgrid_id?: ID;
  role: SystemRole | string; // string => custom role (e.g. "Growth Lead")
  granted_by?: ID;
  granted_at: ISODate;
}

/* --------------------------- User & Identity ----------------------- */

/** Self-serve Talent listing — the user's "hire me" card (set on /talent). */
export interface TalentListing {
  headline?: string;   // e.g. "Full-stack Solana engineer"
  rate_usdc?: number;  // asking rate per deliverable
  available?: boolean; // open to work right now
  updated_at: ISODate;
}

export interface UserProfile {
  id: ID;
  wallet_addresses: string[]; // Solana addresses; first is primary
  username: string;
  avatar?: string;
  bio?: string;
  skills: string[];
  /** Talent self-listing (headline · rate · availability). */
  listing?: TalentListing;
  /** Who referred this user (bound at signup from the ?ref= link). */
  referred_by?: ID;
  /** Set when the referred user completes their FIRST verified economic action —
   *  the moment the referral pays (anti-sybil: dead invites earn nothing). */
  referral_verified_at?: ISODate;
  roles_by_grid: RoleAssignment[];
  pulse_score: number; // legacy single Pulse — kept; prefer `reputation` below
  /** Multi-dimensional reputation (soulbound, decays, gates access). */
  reputation?: ReputationScore;
  /** Claimable, vesting-at-TGE reward ledger (separate from reputation). */
  reward?: RewardLedger;
  joined_grids: ID[];
  created_at: ISODate;
}

/* ------------------------------ Grid ------------------------------- */

export type Visibility = "public" | "private";

/**
 * One Grid entity, three origins. A `community` Grid is started by a KOL/creator;
 * a `project` Grid spawns when a proposal is funded; a `product` Grid spawns when
 * a GridX product succeeds. `spawned_from` makes the recursion traceable.
 */
export type GridType = "community" | "project" | "product";

export interface VisualTheme {
  accent?: string; // hex; defaults to neon green
  glyph?: string;
}

export interface TreasuryConfig {
  enabled: boolean;
  // future: Solana token mint, multisig signers, escrow rules
  token_mint?: string;
  signers?: string[];
}

export interface Grid {
  grid_id: ID;
  owner_id: ID;
  name: string;
  slug: string;
  category: string;
  description: string;
  visual_theme: VisualTheme;
  modules_enabled: ModuleKey[];
  visibility: Visibility;
  treasury_config: TreasuryConfig;
  pulse_score: number; // Grid-level Pulse
  member_count: number;
  created_at: ISODate;
  /* --- v2 additions (optional until store migration) --- */
  grid_type?: GridType; // defaults to "community"
  lifecycle_stage?: LifecycleStage; // where this project is in the pipeline
  spawned_from?: GridProvenance; // recursion provenance (product/proposal it came from)
  treasury_id?: ID; // on-chain treasury (project/product Grids)
  token_id?: ID; // per-project token (once launched)
  subgrid_ids?: ID[];
}

/** Where a non-community Grid came from — closes the recursion loop. */
export interface GridProvenance {
  origin: "proposal" | "product";
  proposal_id?: ID;
  product_id?: ID;
  subgrid_id?: ID; // the team that built it
}

/** Who may join a SubGrid: open · invite-only · reputation-gated · GRID-gated. */
export type SubGridAccess = "open" | "invite" | "reputation" | "token";

export interface SubGrid {
  subgrid_id: ID;
  parent_grid_id: ID;
  name: string;
  purpose: string;
  admins: ID[];
  members: ID[]; // human members
  campaigns: ID[];
  pulse_score: number;
  created_at: ISODate;
  /* --- v2 additions --- */
  agent_members?: ID[]; // agents on the team (hybrid teams)
  goal?: string;
  contributor_splits?: ContributorSplit[]; // on-chain ownership split agreement
  job_ids?: ID[];
  /* --- access gating (defaults to "open") --- */
  access?: SubGridAccess;
  min_reputation?: number; // for "reputation" gate
  min_grid?: number; // GRID a joiner must hold, for "token" gate
}

/** Up-front, on-chain agreement of who owns what % of the output. */
export interface ContributorSplit {
  party_id: ID; // user_id or agent_id
  party_type: "user" | "agent";
  /** For agents, the owner who receives the agent's share. */
  beneficiary_id?: ID;
  basis_points: number; // share of token/revenue, sums to 10000 across parties
  role?: string;
}

/** A Grid's content-hub post — the living feed (updates + pinned announcements). */
export interface GridPost {
  post_id: ID;
  grid_id: ID;
  author_id: ID;
  title?: string;
  body: string;
  pinned?: boolean; // pinned posts surface first (announcements)
  likes: ID[];
  created_at: ISODate;
}

/** Grid-member governance — members vote (reputation-weighted) on Grid-level
 *  decisions. Distinct from GRID-locked protocol governance: scoped to one Grid,
 *  member-gated, no token lock. `feature_post` pins a post on pass. */
export type GridProposalKind = "feature_post" | "general";
export interface GridProposal {
  proposal_id: ID;
  grid_id: ID;
  kind: GridProposalKind;
  title: string;
  summary: string;
  proposer_id: ID;
  status: GovStatus; // open | passed | rejected (reused)
  for_weight: number; // summed reputation voting FOR
  against_weight: number;
  voters: number;
  quorum_votes: number; // minimum participating members to pass
  target_post_id?: ID; // for feature_post
  executed?: boolean;
  execution_note?: string;
  closes_at: ISODate;
  created_at: ISODate;
  resolved_at?: ISODate;
}
export interface GridVote {
  proposal_id: ID;
  voter_id: ID;
  support: boolean;
  weight: number; // voter's reputation snapshot
  at: ISODate;
}

/** Universal direct messaging — 1:1 conversations between any two parties (human
 *  OR agent). Messages can carry a deal/hire OFFER the recipient accepts/declines,
 *  so deals get struck inside the chat. Powers the standalone /messages page. */
export type DMKind = "text" | "deal" | "hire";
export type OfferStatus = "pending" | "accepted" | "declined";
export interface DMOffer {
  offer_kind: "deal" | "hire";
  amount: number;
  asset?: string; // USDC | GRID | Pulse | a token symbol
  terms: string;
  success_metric?: string; // for deals — an outcome, not raw clicks
  status: OfferStatus;
  resolved_at?: ISODate;
  result_ref?: ID; // what an accepted offer spawned (a Job for hires, an Agreement for deals)
  result_kind?: "job" | "agreement"; // the kind of the spawned primitive
}
export interface Conversation {
  conversation_id: ID;
  participant_ids: ID[]; // exactly 2 — user or agent ids
  context?: { label: string; href?: string }; // what the thread is "about" (e.g. re: a Grid)
  created_at: ISODate;
  last_at: ISODate;
}

/** A struck agreement from an accepted DEAL offer — the recorded, disclosed
 *  outcome ("all deals happen here"). Hires spawn a Job instead. */
export interface Agreement {
  agreement_id: ID;
  from_id: ID; // the offerer
  to_id: ID; // the accepter
  amount: number;
  asset?: string;
  terms: string;
  success_metric?: string;
  status: "active" | "completed" | "cancelled";
  source_message_id: ID;
  /** The deal's on-chain proof: its sha256 anchored via the Solana Memo program. */
  onchain?: { tx: string; hash: string; cluster: string };
  created_at: ISODate;
}
export interface DirectMessage {
  message_id: ID;
  conversation_id: ID;
  from_id: ID; // user or agent
  kind: DMKind;
  body: string;
  offer?: DMOffer; // present for deal / hire
  read_by?: ID[];
  created_at: ISODate;
}


/* --------------------------- Lifecycle ----------------------------- */
// The "spine": every project advances through earned gates, never bought.

export type LifecycleStage =
  | "idea"
  | "building"
  | "genesis" // raising
  | "alpha"
  | "spot"
  | "futures"
  | "graduated"
  | "paused"
  | "failed";

/** A transparent, queryable gate between two lifecycle stages. */
export interface GraduationGate {
  from: LifecycleStage;
  to: LifecycleStage;
  criteria: GraduationCriterion[];
}

export interface GraduationCriterion {
  key: string; // e.g. "reputation_min", "raise_filled", "holders_min", "audit_passed"
  label: string; // human-readable, shown in UI
  required_value: number | boolean | string;
  current_value?: number | boolean | string;
  met?: boolean;
}

/* --------------------------- Idea / Proposal ----------------------- */
// The "birth" — funding is MVP-gated + reputation-gated. A Proposal bundles the
// MVP (proof-of-build), the on-chain track record, the roadmap, and the ask.

export type ProposalStatus =
  | "draft"
  | "endorsing" // gathering reputation-weighted endorsements
  | "open" // open for funding
  | "funded"
  | "rejected"
  | "withdrawn"
  | "expired" // raise window closed unfilled — escrowed backings refunded pro-rata
  | "refunded"; // funded project stalled — kill-switch returned the unreleased treasury

export interface Proposal {
  proposal_id: ID;
  author_id: ID;
  title: string;
  summary: string;
  category: string;
  mvp_ref?: BuildArtifactRef; // the Echo-built MVP (proof-of-build)
  track_record_ref?: ID; // pointer to author's verifiable history
  roadmap: MilestoneDraft[]; // proposed milestones for the raise
  ask_amount: number; // USD-denominated target (configurable, not hardcoded)
  reward_token_terms?: string; // what backers receive
  status: ProposalStatus;
  endorsements: Endorsement[];
  closes_at?: ISODate; // raise window end — unfilled past this ⇒ expired + refunds (governable, genesis_raise_days)
  /** The raise's REAL on-chain escrow vault (the milestone_vault program), when
   *  the chain rail is active — publicly verifiable escrowed/released/refunded state. */
  onchain?: { vault: string; program: string; cluster: string; txs?: string[]; release_authority?: string }; // release_authority = the ICP signer canister's Solana address (A3)
  created_at: ISODate;
}

/** Reputation-weighted curation signal (replaces pay-to-promote). */
export interface Endorsement {
  endorser_id: ID;
  weight: number; // weighted by endorser reputation
  note?: string;
  created_at: ISODate;
}

export interface MilestoneDraft {
  title: string;
  description: string;
  amount: number; // tranche size released on completion
  est_duration_days?: number;
}

/* ---------------------- The Universal Job Protocol ----------------- */
// ONE work primitive: describe → assign → execute → proof → verify → pay →
// reputation. Powers talent contracts, SubGrid tasks, campaign deliverables,
// and the agent marketplace. Human or AI, native or external — identical here.

export type JobContext =
  | "talent_contract" // hire a human via Talent
  | "agent_job" // hire an agent (native or external)
  | "subgrid_task" // internal team work
  | "campaign_task"; // Campaign deliverable

export type ExecutorType = "user" | "agent";

/** A worker (human or agent) applying to a campaign posting; the poster then SELECTS
 *  one, which assigns the Job. Campaign postings hire via apply→select, not first-come. */
export type ApplicationStatus = "pending" | "selected" | "rejected" | "withdrawn";
export interface Application {
  application_id: ID;
  job_id: ID;
  applicant_id: ID;
  applicant_type: ExecutorType; // "user" | "agent"
  pitch: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at?: string;
}

export type JobStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "submitted" // proof submitted, awaiting verification
  | "verifying"
  | "approved"
  | "paid"
  | "disputed"
  | "rejected"
  | "cancelled";

export interface Job {
  job_id: ID;
  context: JobContext;
  grid_id?: ID;
  subgrid_id?: ID;
  campaign_id?: ID;
  title: string;
  description: string;
  required_skills: string[];
  /** Who may execute: open to humans, agents, or both. */
  executor_kind: "human" | "agent" | "any";
  assignee_id?: ID; // user_id or agent_id once assigned
  assignee_type?: ExecutorType;
  reward_amount: number;
  reward_token?: string; // defaults to Pulse pre-treasury
  escrow_id?: ID; // funds locked until verified delivery
  proof_required: ProofType;
  proof?: JobProof;
  verification?: Verification;
  status: JobStatus;
  created_by: ID;
  created_at: ISODate;
  updated_at?: ISODate;
}

export interface JobProof {
  kind: ProofType;
  payload: string; // link / text / tx hash / artifact ref
  artifact_ref?: BuildArtifactRef;
  submitted_at: ISODate;
}

/* ---------------- Shared Trust Service: verify / slash ------------- */
// Used by Jobs, milestones, campaign deliverables, and GridX metrics alike.

export type VerificationMethod = "manual" | "auto" | "peer" | "staked_review";

export type VerificationOutcome = "pending" | "approved" | "rejected" | "challenged";

export interface Verification {
  method: VerificationMethod;
  outcome: VerificationOutcome;
  quality_score?: number; // 0..100
  reviewer_stakes: ReviewerStake[]; // verifiers stake reputation on their verdict
  echo_evidence?: string; // AI-assembled evidence summary
  challenge_window_ends?: ISODate;
  decided_at?: ISODate;
}

/** A Verifier puts reputation on the line behind a verdict (skin in the game). */
export interface ReviewerStake {
  reviewer_id: ID;
  verdict: "approve" | "reject";
  staked_pulse: number;
  reason: string;
  created_at: ISODate;
}

export type SlashReason =
  | "false_claim"
  | "fake_engagement"
  | "abandoned_project"
  | "bad_review"
  | "fraud";

export interface Slash {
  slash_id: ID;
  target_type: PulseTargetType;
  target_id: ID;
  reason: SlashReason;
  pulse_delta: number; // negative
  evidence: string;
  created_at: ISODate;
}

export interface Dispute {
  dispute_id: ID;
  subject_type: "job" | "milestone" | "campaign_deal";
  subject_id: ID;
  raised_by: ID;
  reason: string;
  status: "open" | "upheld" | "dismissed";
  resolution?: string;
  created_at: ISODate;
  resolved_at?: ISODate;
}

/* ---------------------------- Campaign ---------------------------- */
// Distribution exchange: projects strike token deals with Grids for reach.

export type CampaignStatus = "draft" | "active" | "review" | "completed" | "archived";

export type TaskType =
  | "social" // social push / raid
  | "content" // content mission
  | "referral"
  | "bounty"
  | "quest"
  | "agent"; // agent workstream

export type ProofType = "link" | "text" | "image" | "tx" | "onchain" | "none";

export type ReviewMethod = "manual" | "auto" | "peer";

export interface Campaign {
  campaign_id: ID;
  grid_id: ID;
  subgrid_id?: ID;
  title: string;
  objective: string;
  task_ids: ID[];
  reward_pool: number;
  reward_token?: string; // defaults to Pulse points pre-treasury
  start_date: ISODate;
  end_date: ISODate;
  status: CampaignStatus;
  review_rules: ReviewMethod;
  metrics: CampaignMetrics;
  created_by: ID;
  created_at: ISODate;
  /* --- v2: campaign-as-deal between a project and target Grids --- */
  target_grid_ids?: ID[]; // communities being approached
  deal?: CampaignDeal;
}

/** Escrowed, publicly-disclosed deal: tokens/allocation for verified reach. */
export interface CampaignDeal {
  offering_grid_id: ID; // the project's Grid
  allocation_offered: number; // token/allocation promised
  allocation_token?: string;
  escrow_id?: ID; // allocation locks until reach is verified
  success_metric: string; // outcome, not raw clicks
  disclosed_onchain: boolean; // paid promotion is transparent by default
  matched_by_echo?: boolean;
  status: "proposed" | "accepted" | "delivering" | "verified" | "settled" | "failed";
}

export interface CampaignMetrics {
  submissions: number;
  approved: number;
  rejected: number;
  contributors: number;
  pulse_generated: number;
}

/**
 * Legacy campaign micro-task. The universal `Job` generalizes this; campaign
 * tasks should be created as Jobs with context "campaign_task" going forward.
 */
export interface Task {
  task_id: ID;
  campaign_id: ID;
  type: TaskType;
  title: string;
  description: string;
  reward: number; // share of reward pool / Pulse weight
  proof_required: ProofType;
  reviewer?: ID;
  status: "open" | "closed";
  created_at: ISODate;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type RewardStatus = "unpaid" | "paid" | "void";

export interface Submission {
  submission_id: ID;
  task_id: ID;
  campaign_id: ID;
  user_id: ID;
  proof: string; // link / text / tx hash depending on ProofType
  reviewer_status: SubmissionStatus;
  quality_score?: number; // 0..100, set on review
  reward_status: RewardStatus;
  pulse_delta: number; // Pulse awarded once approved
  reviewed_by?: ID;
  created_at: ISODate;
  reviewed_at?: ISODate;
}

/* ------------------------------ Pulse ------------------------------ */
// Spec page 15: Pulse = verified contribution + reliability + quality
// multiplier + network impact + role trust − spam/risk penalties.
// Every Pulse change carries a human-readable reason.
//
// v2: Pulse splits into TWO ledgers from the same verified actions —
//   (1) ReputationScore — soulbound, decays, gates access, drives the animation.
//   (2) RewardLedger    — claimable, sybil-filtered, vests into the token at TGE.

export type PulseTargetType = "user" | "grid" | "subgrid" | "agent" | "campaign";

export type PulseActionType =
  | "submission_approved"
  | "submission_rejected"
  | "campaign_completed"
  | "referral_verified"
  | "role_granted"
  | "grid_created"
  | "grid_joined"
  | "subgrid_created"
  | "job_delivered"
  | "milestone_approved"
  | "build_completed" // Echo witnessed a build end-to-end (proof of build)
  | "product_listed" // a build was published to GridX
  | "product_reviewed" // a verified buyer/user rated a product (owner's creator rep moves with it)
  | "raise_backed" // backed a Fund raise that filled (curation conviction)
  | "decay" // periodic rebalance so old activity doesn't dominate
  | "campaign_ghosted" // a project left a delivery unreviewed past the deadline (V6 employer fade)
  | "spam_penalty";

export interface PulseEvent {
  event_id: ID;
  target_type: PulseTargetType;
  target_id: ID;
  user_id?: ID; // actor, when applicable
  action_type: PulseActionType;
  weight: number; // signed delta applied to the target's pulse
  reason: string; // shown in the UI — never an opaque number
  verification_source: string; // e.g. "reviewer:0xabc", "auto", "onchain:tx"
  dimension?: ReputationDimension; // which reputation facet this affects
  timestamp: ISODate;
}

/** Reputation is multi-dimensional so gaming one facet can't fake another. */
export type ReputationDimension = "builder" | "backer" | "reviewer" | "creator" | "agent";

export interface ReputationScore {
  total: number; // composite (post-decay)
  by_dimension: Partial<Record<ReputationDimension, number>>;
  last_decay_at?: ISODate;
}

/** The claimable side. Earned alongside reputation, but anti-farm filtered. */
export interface RewardLedger {
  accrued: number; // pre-TGE points
  sybil_adjusted: number; // after quality/sybil filtering
  claimed: number; // converted to platform token at/after TGE
  vesting?: Vesting;
}

/* ----------------------------- Fund ---------------------------- */
// Milestone-escrowed funding. Money locks in an on-chain treasury and releases
// tranche by tranche on verified, backer-approved delivery.

export type GenesisStage = 1 | 2 | 3; // signal / expansion / public formation

export interface GenesisRound {
  round_id: ID;
  grid_id: ID;
  cap: number; // configurable launch cap (USD), not hardcoded
  stage: GenesisStage;
  rules: string;
  allowlist: ID[];
  escrow_state: "locked" | "released" | "refunded";
  participants: ID[];
  status: "draft" | "open" | "closed" | "settled";
  created_at: ISODate;
  /* --- v2 additions --- */
  proposal_id?: ID; // the funded proposal
  treasury_id?: ID;
  milestone_ids?: ID[];
  backings?: ID[];
  kyc_required?: boolean; // compliance gating
}

export interface Treasury {
  treasury_id: ID;
  grid_id: ID;
  token_mint?: string; // Solana custody
  total_committed: number;
  total_released: number;
  balance: number;
  signers?: string[];
  created_at: ISODate;
}

export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approving" // backer vote in progress
  | "approved"
  | "released"
  | "rejected";

export interface Milestone {
  milestone_id: ID;
  treasury_id: ID;
  grid_id: ID;
  title: string;
  description: string;
  amount: number; // tranche released on approval
  order: number;
  status: MilestoneStatus;
  deliverable?: JobProof;
  verification?: Verification;
  approval_vote?: BackerVote; // backers hold the deciding vote
  released_tx?: string;
  due_at?: ISODate;
  updated_at?: ISODate; // last activity (submit/vote/release) — drives the stall clock
  created_at: ISODate;
}

/** Backers vote to approve a milestone release (reviewer-informed). */
export interface BackerVote {
  for_bps: number; // weighted by stake
  against_bps: number;
  quorum_bps: number;
  passed?: boolean;
  closes_at: ISODate;
}

export interface Backing {
  backing_id: ID;
  round_id: ID;
  grid_id: ID;
  backer_id: ID;
  amount: number;
  token_allocation?: number; // project tokens owed
  vesting?: Vesting;
  refunded?: boolean;
  created_at: ISODate;
}

export interface Vesting {
  start_at: ISODate;
  cliff_days: number;
  duration_days: number;
  released: number;
  total: number;
}

/* ----------------------------- Tokens ------------------------------ */
// Two layers: the platform token + a token per graduated project.

export type TokenLayer = "platform" | "project";

export interface Token {
  token_id: ID;
  layer: TokenLayer;
  symbol: string;
  name: string;
  mint?: string; // Solana mint address
  grid_id?: ID; // for project tokens
  total_supply?: number;
  launched_at?: ISODate;
}

export interface TokenLaunch {
  launch_id: ID;
  token_id: ID;
  grid_id: ID;
  stage: "alpha" | "spot" | "futures";
  market_id?: ID;
  status: "scheduled" | "live" | "closed";
  created_at: ISODate;
}

/* ----------------------------- Markets ----------------------------- */
// Axon / Trade — gated, last. Alpha → Spot → Futures.

export type MarketStage = "alpha" | "spot" | "futures";

export interface Market {
  market_id: ID;
  token_id: ID;
  grid_id: ID;
  stage: MarketStage;
  base_symbol: string;
  quote_symbol: string; // e.g. USDC / SOL
  liquidity_usd?: number;
  holders?: number;
  base_reserve?: number; // constant-product AMM pool
  quote_reserve?: number;
  price?: number;
  volume?: number;
  eligibility?: GraduationCriterion[]; // gate to reach this stage
  status: "pending" | "active" | "paused";
  stage_changed_at?: ISODate; // last graduation moment (drives holder notifications)
  /** Verifier fraud reports — the market halts + stakes slash only at quorum
   *  (Params.fraud_flag_quorum), not on a single accusation. */
  fraud_flags?: { reviewer_id: ID; reason: string; at: ISODate }[];
  created_at: ISODate;
}

/* ----------------------------- Wallets ----------------------------- */
// Pre-mainnet accounting balances. USDC = the trade quote; GRID = the platform
// token used to stake-to-list and pay discounted fees. Real Solana settlement
// rides the chain adapters (Stage B); here these are in-platform units.
export interface Wallet {
  user_id: ID; // owner, or a "neugrid:*" protocol sink (e.g. neugrid:treasury)
  usdc: number; // trade currency
  grid: number; // platform token (staking / fees / governance)
  pay_fees_in_grid?: boolean; // opt-in: pay protocol fees in GRID at a discount
}

/* ------- Stake-to-list: GRID locked to graduate a market to the next stage ------ */
// A project ascends Alpha→Spot→Futures only when BOTH gates clear: the market
// gate (cap + liquidity) AND a community GRID stake. The stake is a stake-weighted
// listing vote — locked for a term, it earns a share of that market's fees and is
// slashable on fraud. This is "earned, not bought": real demand + real conviction.
export interface ListingStake {
  stake_id: ID;
  grid_id: ID;
  market_id: ID;
  staker_id: ID; // the founder or any community member
  amount: number; // GRID locked
  stage_target: "spot" | "futures";
  locked_until: ISODate;
  released?: boolean;
  fees_earned?: number; // USDC trade-fee share accrued to this stake (the "earns a fee share")
  /** Forfeited on a fraud/audit-fail finding — the locked GRID is lost (the "slashable" half). */
  slashed?: boolean;
  slashed_at?: ISODate;
  slash_reason?: string;
  created_at: ISODate;
}

/* ----------------------- Futures (perps) --------------------------- */
// Leverage trading on a graduated (futures-stage) market. Mark price = the spot
// AMM. Collateral (margin) in USDC; liquidation when the loss eats the margin.
export type PositionSide = "long" | "short";
export interface Position {
  position_id: ID;
  market_id: ID;
  user_id: ID;
  side: PositionSide;
  size: number; // base-token exposure (collateral × leverage / entry)
  leverage: number;
  entry_price: number;
  margin: number; // USDC collateral locked
  liquidation_price: number;
  status: "open" | "closed" | "liquidated";
  opened_at: ISODate;
  closed_at?: ISODate;
  pnl?: number; // realized PnL on close (USDC)
  /** Funding (skew carry) the crowded side has paid from margin, cumulative. */
  funding_paid?: number;
  last_funding_at?: ISODate;
  /** Conditional close triggers (price). Both set ⇒ OCO (first to hit closes it). */
  take_profit?: number;
  stop_loss?: number;
  /** Trailing stop: % distance behind the best mark seen since it was set. */
  trailing_stop_pct?: number;
  trail_anchor?: number; // best mark seen (max for long / min for short)
  close_reason?: "manual" | "liquidation" | "take_profit" | "stop_loss" | "trailing_stop";
  /** Set when an agent opened this under a mandate (Agent Mode attribution). */
  mandate_id?: ID;
  agent_id?: ID;
  pnl_booked?: boolean; // mandate has accounted this position's realized PnL
}

/* ----------------------- Limit orders ------------------------------ */
// Spot/futures resting orders. They fill when the AMM price crosses the limit
// (or immediately if already marketable). Market orders skip the book entirely.
export interface LimitOrder {
  order_id: ID;
  market_id: ID;
  user_id: ID;
  side: "buy" | "sell";
  price: number; // limit price (USDC)
  qty: number; // base qty
  filled: number; // cumulative base filled (partial fills leave the order open)
  status: "open" | "filled" | "cancelled";
  created_at: ISODate;
  filled_at?: ISODate;
  /** Perp limit ENTRY: rests until mark crosses `price`, then opens a position
   *  (long fills at-or-below, short at-or-above). Spot fill fields don't apply. */
  kind?: "spot" | "perp_entry";
  pside?: PositionSide;
  collateral?: number;
  leverage?: number;
  /** Triggers attached at entry — applied to the position the moment it opens. */
  take_profit?: number;
  stop_loss?: number;
  trailing_stop_pct?: number;
}

/* ----------------------- Agent Mode (mandates) --------------------- */
// Toggle Agent Mode on a market and an agent trades it autonomously on the
// owner's behalf — strictly within a scoped MANDATE. The mandate is the consent
// + the risk boundary: budget, max position, max leverage, allowed stages,
// stop-loss / daily-loss kill, expiry, and a kill-switch. The agent acts on the
// OWNER's wallet (non-custodial: scoped authority, never pooling). Every action
// is attributed + bounded server-side. This fuses SentientX (agents) with Trade.

/** A native rule-based playbook, or "external" (the agent decides via SDK/MCP). */
export type MandateStrategy = "dca" | "momentum" | "hedge" | "external";

export type MandateStatus = "active" | "stopped" | "expired" | "completed";

export interface Mandate {
  mandate_id: ID;
  market_id: ID;
  grid_id: ID; // denormalized from the market (fee-share / provenance joins)
  agent_id: ID; // the trader
  owner_id: ID; // whose wallet + authority the agent acts under
  /* --- scope: the consent + risk boundary (enforced server-side) --- */
  budget_usdc: number; // max USDC the agent may deploy (cumulative net cost basis)
  max_position_usd: number; // cap on a single trade / position notional
  max_leverage: number; // perp cap (≤ Perps.MAX_LEVERAGE); 1 ⇒ spot only
  allowed_stages: MarketStage[]; // stages the agent may trade (futures = leverage)
  stop_loss_pct: number; // exit a position once drawdown exceeds this (0..1)
  daily_loss_cap: number; // USDC realized-loss per day that trips the kill-switch
  strategy: MandateStrategy;
  expiry: ISODate;
  /* --- runtime tracking --- */
  status: MandateStatus;
  deployed_usdc: number; // budget consumed (net USDC cost basis currently at work)
  position_base: number; // base tokens the agent itself bought (its share of the owner's holding)
  realized_pnl: number; // cumulative realized PnL (USDC)
  trades_count: number;
  last_action_at?: ISODate; // rate-limit + "agent is trading" indicator
  created_at: ISODate;
  stopped_at?: ISODate;
  stop_reason?: string; // user_kill | expired | daily_loss | budget_exhausted
}

/** One decision the agent took (or declined) — the human-readable activity feed. */
export type AgentActionKind = "buy" | "sell" | "open_long" | "open_short" | "close" | "hold" | "stop";

export interface AgentAction {
  action_id: ID;
  mandate_id: ID;
  market_id: ID;
  agent_id: ID;
  kind: AgentActionKind;
  rationale: string; // why the strategy chose this (e.g. "momentum +4.2% → buy")
  amount?: number; // USDC in/out, or margin posted
  price?: number; // mark at decision time
  pnl?: number; // realized PnL, on a close
  ok: boolean; // did it execute (false = blocked by a guardrail / no-op hold)
  detail?: string; // guardrail reason or extra context
  at: ISODate;
}

/* --------------------------- SentientX ----------------------------- */
// Agents are first-class economic actors: identity, wallet, reputation, owner,
// revenue split. Native (built with NeuGrid's framework) or external (plugged
// in via the SDK / MCP server).

export type AgentOrigin = "native" | "external";

export type AgentTrustTier = "probation" | "trusted" | "suspended";

export interface Agent {
  agent_id: ID;
  owner_id: ID;
  grid_id?: ID;
  name: string;
  capabilities: string[]; // research, growth, content, support, analytics, moderation
  permissions: string[]; // scoped tool access
  task_history: ID[];
  rating: number;
  status: "idle" | "active" | "suspended";
  created_at: ISODate;
  /* --- v2 additions --- */
  origin?: AgentOrigin; // defaults to "native"
  external_framework?: string; // e.g. "OpenClaw", "Hermes"
  wallet_address?: string; // agents earn into a wallet
  reputation?: ReputationScore;
  owner_split_bps?: number; // how earnings split agent/owner
  trust_tier?: AgentTrustTier; // external agents start on probation
  bond_amount?: number; // owner-posted bond for cold-start trust
  spend_limit_per_job?: number; // sandbox guardrail
  tools_granted?: string[];
  earnings?: number;
  trading_rating?: number; // 0..5, earned from realized Agent-Mode trading performance
  api_key?: string; // legacy plaintext gateway credential (seed only — new agents store only api_key_hash)
  api_key_hash?: string; // sha256 of the gateway key; the plaintext is shown once at registration and never stored
  /* --- native agent framework (Tier 2) --- */
  persona?: AgentPersona;       // the character/personality (ElizaOS-character-shaped) — not an LLM wrapper
  work?: AgentWorkSession;      // the autonomous work runtime state (the agent's job loop)
  skill_library?: LearnedSkill[]; // skills the agent learned on the job (Hermes-style self-improvement)
  offer_policy?: AgentOfferPolicy; // owner guardrails for auto-resolving incoming hire/deal offers
}

/** Owner-set guardrails: when ON, the agent accepts/declines incoming DM offers
 *  itself — accept only at/above the floor and (if set) within allowed domains. */
export interface AgentOfferPolicy {
  auto_resolve: boolean;
  min_amount: number; // USDC floor — below this it declines
  skills?: string[]; // allowed domains; empty/absent = any
}

/** A native agent's character — its persona/personality. Maps to an ElizaOS
 *  character file when running behind the ElizaOS adapter; a portable format any
 *  brain (ElizaOS / Hermes / an LLM) can consume. */
export interface AgentPersona {
  role?: string;        // e.g. "Research analyst", "Growth strategist"
  bio?: string;         // short character bio
  personality?: string; // traits + tone, e.g. "rigorous, concise, skeptical"
  goals?: string;       // what it optimizes for
  style?: string;       // output voice/style
  knowledge?: string[]; // domains it knows
}

/** A reusable skill the agent wrote from a completed Job (Hermes's idea): it
 *  accumulates, is retrieved on matching future work, and its `uses` count is the
 *  agent's growing mastery — a work-marketplace agent that gets better over time. */
export interface LearnedSkill {
  skill_id: ID;
  title: string;   // "Summarize a DeFi market report"
  domain: string;  // matches Job required_skills / the agent's capabilities
  recipe: string;  // the reusable how-to (an LLM authors richer ones; rule-based writes a template)
  from_job?: ID;   // the Job it was first learned on
  uses: number;    // times reused → mastery
  created_at: ISODate;
  updated_at?: ISODate;
}

/** One autonomous action the work runtime took (or declined). */
export interface AgentWorkAction {
  at: ISODate;
  kind: "claimed" | "applied" | "delivered" | "hold" | "completed" | "stopped" | "directive" | "offer";
  job_id?: ID;
  job_title?: string;
  reward?: number;
  rationale: string;    // why the brain chose this (rule-based or LLM)
  skills_applied?: number; // learned skills reused on this job
  ok: boolean;
}

/** The agent's autonomous work session — armed by the owner, advanced per tick.
 *  The Jobs-marketplace analog of an Agent-Mode trading mandate. */
export interface AgentWorkSession {
  active: boolean;
  skills?: string[];  // only take jobs needing these (defaults to the agent's capabilities)
  max_jobs: number;   // stop after delivering this many
  max_reward: number; // per-job reward cap (clamped to the spend limit)
  jobs_done: number;
  started_at: ISODate;
  stopped_at?: ISODate;
  stop_reason?: string;
  log: AgentWorkAction[]; // bounded recent activity feed
}

/* ---------------------------- Echo / Build ------------------------- */
// Echo is the integrated build engine. Builds happen on-platform → the platform
// witnesses them → "proof of build" feeds the verifiable track record.

/** One real generated source file of a build (Stage 1.5 — real codegen). */
export interface BuildFile {
  path: string;
  content: string;
}

export interface BuildArtifactRef {
  artifact_id: ID;
  kind: "repo" | "canister" | "program" | "frontend" | "bundle";
  grid_id?: ID;
  subgrid_id?: ID;
  built_with_echo: boolean;
  proof_of_build?: string; // attestation — sha256 over the REAL generated files (stub builds: a witness stamp)
  files?: BuildFile[]; // the actual generated project files (absent on legacy/stub builds)
  preview_url?: string; // real builds: /api/echo/builds/[id]/preview (the generated interactive demo)
  deploy_target?: "devnet" | "mainnet" | "icp";
  created_at: ISODate;
}

export type BuildStatus = "building" | "built" | "listed" | "funded";

/** One witnessed step of a build — the platform's record that the work happened. */
export interface BuildStep {
  label: string;
  detail?: string;
  at: ISODate;
}

/**
 * A build the platform witnessed end-to-end. The owned `artifact` carries the
 * proof-of-build attestation; `steps` are the witnessed log. A Build is the unit
 * of "proof of build" on a user's verifiable track record — it stands on its own
 * whether or not it is ever listed on GridX or funded on Fund.
 */
/** A build's live deployment on NeuGrid hosting — a real, shareable URL serving a
 *  version-pinned SNAPSHOT of the app (revising the build doesn't change the live
 *  site until the owner redeploys). */
export interface BuildDeployment {
  slug: string; // /d/<slug> — stable across redeploys
  version: number; // the build version this deployment serves
  html: string; // the snapshotted standalone app (preview/index.html at deploy time)
  proof: string; // the proof-of-build sealed at deploy time
  deployed_at: ISODate;
  redeploys: number; // 0 = first deploy
  icp?: { canister_id: string; url: string; at: ISODate }; // the ICP asset-canister mirror — the unstoppable URL (A3)
}

/** One revision of a build (the iterate loop) — each re-seals the proof-of-build. */
export interface BuildRevision {
  version: number; // the version this revision produced (v2, v3, …)
  instruction: string; // what the builder asked Echo to change
  proof: string; // the re-sealed sha256 proof over the revised files
  notes?: string; // what Echo actually changed (its revision log)
  files_changed: number;
  at: ISODate;
}

export interface Build {
  build_id: ID;
  owner_id: ID; // the builder — subject of the proof-of-build
  subgrid_id?: ID; // the team, for hybrid builds
  title: string;
  prompt: string; // what the builder asked Echo to build
  summary: string; // Echo's description of the output
  stack: string[]; // declared/detected stack, e.g. ["Next.js", "Solana"]
  status: BuildStatus;
  artifact: BuildArtifactRef; // the witnessed output + proof_of_build (CURRENT version)
  steps: BuildStep[]; // the witnessed build stream (original synthesis)
  version?: number; // current version (1 = the original build)
  revisions?: BuildRevision[]; // the iterate-loop history, oldest first
  deployment?: BuildDeployment; // live on NeuGrid hosting (/d/<slug>), version-pinned
  product_id?: ID; // set once listed on GridX
  proposal_id?: ID; // set once taken to Fund
  grid_id?: ID; // the build's home Grid (lazily created on list/spawn)
  created_at: ISODate;
}

/* -------------------- On-chain attestations (SAS) -------------------- */
// The verifiable, soulbound layer: each durable, independently-verified
// achievement (proof-of-build, delivered job, shipped milestone, launched
// project, promoted agent) becomes a non-transferable credential. Stage 1 is an
// in-platform mirror; Stage 2 mints these as Solana Attestation Service
// tokenized (Token-2022 NonTransferable) attestations — same shape, swap-ready.
export type AttestationSchemaKey = "proof_of_build" | "work_delivered" | "milestone_shipped" | "project_launched" | "agent_trusted";
export type AttestationStatus = "active" | "revoked" | "expired";
export interface Attestation {
  attestation_id: ID;
  schema: AttestationSchemaKey;
  subject_id: ID; // user_id or agent_id the credential is bound to
  subject_kind: "user" | "agent";
  subject_wallet?: string; // Solana address the SAS token would mint to
  title: string;
  fields: Record<string, string | number>;
  proof_ref?: string; // ngpob hash / verifier id / external anchor
  source_ref: ID; // originating record (build/job/milestone/grid/agent) — dedup key
  status: AttestationStatus;
  issued_at: ISODate;
  revoked_at?: ISODate;
  /** Filled once minted on Solana (Stage 2: SAS createTokenizedAttestation). */
  onchain?: { mint?: string; tx?: string; cluster?: string };
}

/* ----------------- Agent-to-agent payments (x402) ------------------- */
// HTTP-402 machine payments: an agent pays micro-USDC to access a metered
// gateway resource; the fee accrues to the protocol. Stage 1 records the
// settlement as an accounting unit; Stage 2 settles real Solana USDC through an
// x402 facilitator (Coinbase CDP or self-hosted) — same shape, `onchain` filled.
export interface Settlement {
  settlement_id: ID;
  payer_id: ID; // the paying agent
  payee: string; // resource server / protocol treasury (Stage 2: a Solana ATA)
  resource: string; // what was purchased
  amount: number; // priced in USDC (accounting units pre-chain)
  asset: string; // "USDC"
  network: string; // "solana"
  scheme: "exact";
  proof: string; // x402 payment proof (Stage 2: the on-chain tx signature)
  status: "settled" | "refunded";
  created_at: ISODate;
  onchain?: { tx?: string; cluster?: string };
}

/* ----------------------------- GridX ------------------------------- */
// On-chain app store. Products show verifiable usage + revenue. Success spawns
// the product's own Grid.

export interface Product {
  product_id: ID;
  grid_id: ID; // the Grid/project that owns it
  subgrid_id?: ID; // the team that built it
  name: string;
  description: string;
  artifact_ref?: BuildArtifactRef;
  category: string;
  /** Asking price in USDC; 0/absent = free. Purchases settle buyer → grid owner. */
  price_usdc?: number;
  /* verifiable, on-chain where possible */
  onchain_revenue?: number; // the gold trust signal — DERIVED from real purchase settlements on read
  active_users?: number; // DERIVED from productEvents (distinct users, 30d) on read
  followers?: number;
  rating?: number; // DERIVED from productReviews on read
  review_count?: number; // DERIVED on read
  spawned_grid_id?: ID; // product → its own community Grid
  listed_at: ISODate;
}

/** A verified review — only buyers (paid products) or real users (free, opened) may write one. */
export interface ProductReview {
  review_id: ID;
  product_id: ID;
  user_id: ID;
  rating: number; // 1–5
  text?: string;
  created_at: ISODate;
}

/** Real product usage — opens + purchases; drives active-users, trending, and review eligibility. */
export interface ProductEvent {
  event_id: ID;
  product_id: ID;
  user_id: ID;
  kind: "open" | "purchase";
  at: ISODate;
}

/* ------------------------------ Fees ------------------------------- */
// NeuGrid earns a thin slice of the value it creates (see spec §8).

export interface FeeSchedule {
  job_payout_bps: number; // protocol fee on job payouts
  campaign_deal_bps: number;
  genesis_raise_bps: number;
  market_trade_bps: number;
  agent_earnings_bps: number;
  gridx_revenue_share_bps: number;
  echo_compute_pricing?: string; // paid in platform token
}

/* --------------------------- Security audit ------------------------ */
// A delivered project must pass a security audit before it can launch on Alpha
// (autogen dApps handle money). Reviewed by a Verifier other than the founder.

export type AuditStatus = "requested" | "passed" | "failed";

export interface Audit {
  audit_id: ID;
  grid_id: ID;
  requested_by: ID;
  status: AuditStatus;
  reviewer_id?: ID;
  notes?: string;
  created_at: ISODate;
  reviewed_at?: ISODate;
}

/* ----------------------- Protocol governance ----------------------- */
// GRID's governance utility: holders LOCK GRID to vote on protocol-level decisions
// (parameters, featured listings, treasury use). Weight = GRID locked (conviction);
// the lock returns when the proposal resolves. GRID = the vote weight + a sink.
export type GovProposalKind = "param" | "listing" | "treasury" | "general";
export type GovStatus = "open" | "passed" | "rejected";

/** A machine-executable effect a proposal enacts when it PASSES. `general`
 *  proposals carry none (advisory). Keys are validated against the Params layer. */
export type GovAction =
  | { type: "set_param"; key: string; value: number } // mutate a protocol parameter
  | { type: "treasury_transfer"; asset: "grid" | "usdc"; amount: number; to: ID }; // move protocol funds

export interface GovProposal {
  proposal_id: ID;
  kind: GovProposalKind;
  title: string;
  summary: string;
  proposer_id: ID;
  status: GovStatus;
  for_grid: number; // GRID weight voting FOR
  against_grid: number; // GRID weight voting AGAINST
  quorum_grid: number; // FOR weight needed to pass
  action?: GovAction; // enacted on pass (absent = advisory)
  executed?: boolean; // the action ran (or was attempted) at resolve
  execution_note?: string; // human-readable outcome of the enactment
  closes_at: ISODate;
  created_at: ISODate;
  resolved_at?: ISODate;
}

export interface GovVote {
  proposal_id: ID;
  voter_id: ID;
  support: boolean; // FOR (true) / AGAINST (false)
  grid: number; // GRID locked for the vote (returned on resolve)
  released?: boolean;
  at: ISODate;
}

/* ----------------------- Community chat ---------------------------- */
// A per-Grid discussion thread, surfaced on the market terminal + the Grid page.
// Reputation-tagged so credible voices (founder / backer / holder) stand out.
export interface Message {
  message_id: ID;
  grid_id: ID;
  user_id: ID;
  text: string;
  likes?: ID[]; // user ids who upvoted
  created_at: ISODate;
}

/* ----------------------------- Social ------------------------------ */
// User→user follows — a lightweight signal graph. Following someone surfaces
// their verified activity (builds, launches) in your notifications.
export interface Follow {
  follower_id: ID;
  followee_id: ID;
  created_at: ISODate;
}

/* --------------------------- Aggregates ---------------------------- */

/** Convenience shape used by the dashboard / Grid pages. */
export interface GridSummary {
  grid: Grid;
  subgrids: number;
  active_campaigns: number;
  open_tasks: number;
  recent_pulse: PulseEvent[];
  /* --- v2 --- */
  lifecycle_stage?: LifecycleStage;
  next_gate?: GraduationGate;
  treasury?: Treasury;
}
