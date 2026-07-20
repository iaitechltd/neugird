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
  /** Proof-of-humanity tier record (docs/POH_GATE.md) — gates reward COUNTING,
   *  never participation. */
  humanity?: HumanityRecord;
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
export type DMKind = "text" | "deal" | "hire" | "transfer";

/** An in-chat USDC transfer — settled the moment the message sends (not an
 *  offer). Sender is debited for real; agent recipients take their owner
 *  split, agent senders pay from their service earnings. */
export interface DMTransfer {
  amount: number;
  asset: "USDC";
  settlement_id: ID;
  status: "settled";
}
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
/** A small file attached to a DM — stored inline as a data URI (same posture as
 *  build artifacts living in the store), size-capped + mime-allowlisted at send. */
export interface DMAttachment {
  name: string;
  mime: string;
  size: number; // decoded bytes
  data_uri: string;
}

export interface DirectMessage {
  message_id: ID;
  conversation_id: ID;
  from_id: ID; // user or agent
  kind: DMKind;
  body: string;
  offer?: DMOffer; // present for deal / hire
  attachment?: DMAttachment; // present for file/pic messages
  transfer?: DMTransfer; // present for settled in-chat USDC transfers
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
  build_id?: ID; // the build this work is FOR — hired work stays attached to its project (audit Wave 2)
  reward_amount: number;
  reward_token?: string; // defaults to Pulse pre-treasury
  escrow_id?: ID; // funds locked until verified delivery
  proof_required: ProofType;
  proof?: JobProof;
  verification?: Verification;
  status: JobStatus;
  created_by: ID;
  /** Set when an escrowed job is rejected: the worker may contest until this
   *  deadline; the rejection's effects (penalty + refund) are deferred until
   *  then (or until a dispute resolves). */
  dispute_deadline?: ISODate;
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

/** A reputation-staked evaluator's verdict on a dispute. `for_worker` = the
 *  contested delivery was valid; `for_creator` = the rejection stands. Weight =
 *  the evaluator's reputation; a wrong verdict fades their reviewer reputation. */
export type DisputeVerdict = "for_worker" | "for_creator";
export interface DisputeVote {
  evaluator_id: ID;
  verdict: DisputeVerdict;
  weight: number; // reputation staked on this verdict
  reason?: string;
  at: ISODate;
}

export interface Dispute {
  dispute_id: ID;
  subject_type: "job" | "milestone" | "campaign_deal";
  subject_id: ID; // the job_id (v1 covers escrowed jobs)
  raised_by: ID; // the worker contesting a rejection
  against: ID; // the job creator whose rejection is contested
  amount?: number; // escrow at stake (for the UI)
  reason: string;
  status: "open" | "upheld" | "dismissed"; // upheld = worker wins; dismissed = rejection stands
  votes: DisputeVote[]; // reputation-staked evaluator panel
  quorum: number; // distinct evaluators required to resolve
  outcome?: { for_worker: number; for_creator: number }; // weighted tallies at resolution
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
  | "feed_post" // posted to the social wire (creator dim, first 3/day, reward_excluded)
  | "product_listed" // a build was published to GridX
  | "product_reviewed" // a verified buyer/user rated a product (owner's creator rep moves with it)
  | "raise_backed" // backed a Fund raise that filled (curation conviction)
  | "backer_delivery" // a backed project actually delivered a milestone (backer merit — backing winners)
  | "trade_executed" // bought/sold on a market — earns a fraction of the fee PAID as GRID (fee-based, farm-resistant)
  | "decay" // periodic rebalance so old activity doesn't dominate
  | "campaign_ghosted" // a project left a delivery unreviewed past the deadline (V6 employer fade)
  | "dispute_evaluated" // staked-evaluator voted WITH the panel's verdict (reviewer rep, no allocation)
  | "dispute_slashed" // staked-evaluator voted AGAINST the outcome — reputation faded (skin in the game)
  | "skill_installed" // another owner installed your published skill (creator rep, no allocation)
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
  /** Earns REPUTATION (+ any credential) but NOT GRID allocation. Set when the
   *  work was subsidized by a free grant (e.g. an Echo build paid with the
   *  starter credit) — free credit must not mint transferable ownership. */
  reward_excluded?: boolean;
  timestamp: ISODate;
}

/** Reputation is multi-dimensional so gaming one facet can't fake another. */
export type ReputationDimension = "builder" | "backer" | "reviewer" | "creator" | "agent" | "trader";

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

/** Proof-of-humanity record (docs/POH_GATE.md). Tier 0 = wallet (SIWS),
 *  1 = established wallet (native on-chain signals), 2 = verified human (a
 *  provider attestation — civic / worldid / … — provider-agnostic by design). */
export interface HumanityRecord {
  tier: 0 | 1 | 2;
  /** Native on-chain signals for the primary SIWS wallet. */
  signals?: { wallet_age_days?: number; tx_count?: number; checked_at: ISODate };
  /** Tier-2 external attestation; presence ⇒ tier 2. */
  attestation?: { provider: string; ref?: string; at: ISODate };
  updated_at: ISODate;
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
  escrowed?: boolean; // true = a real deposit sits in GENESIS_ESCROW (gates the refund path)
  created_at: ISODate;
}

export interface Vesting {
  start_at: ISODate;
  cliff_days: number;
  duration_days: number;
  released: number;
  total: number;
  upfront_bps?: number; // share unlocked immediately at start_at (backer allocations: 20%)
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
  /** T1 AMM mirror — the market's REAL on-chain pool (chain/ammSolana.ts):
   *  real SPL mint + seeded vaults; every curve movement mirrors as a swap. */
  onchain?: { pool: string; base_mint: string; program: string; cluster: string; txs?: string[] };
  /** The FOUNDER's vested token carve (governable founder_allocation_bps) — market
   *  success returns to the maker. Mirrors the backer vesting shape; claim lands in holdings. */
  founder_allocation?: { user_id: string; vesting: Vesting };
  /** REVENUE SHARE (the 2026-07-20 pivot): real product sales stream to token
   *  holders — masterchef accumulator, claims in USDC. Buying the token = owning
   *  a piece of the product's actual income. */
  dividends?: { acc_per_token: number; accrued: number; claimed: number };
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
  /** Non-transferable starter Echo credit (the onboarding scholarship). Spendable
   *  ONLY on Echo compute — it burns, never circulates, never reaches the market. */
  starter_credit?: number;
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
  /** T2 perp-vault mirror — real margin/settlement rail (chain/perpsSolana.ts). */
  onchain?: { position: string; program: string; cluster: string; txs?: string[] };
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
  /** Escrow-on-place (audit F7): funds reserved when the order rests — USDC for
   *  buys/perp entries, base tokens for sells — released as it fills/cancels. */
  escrow_quote?: number;
  escrow_base?: number;
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
  /** Pre-trade risk grade (agentic-wallet style): every risk-ADDING action is
   *  simulated before execution and graded; a "critical" grade is auto-blocked. */
  risk_grade?: TradeRiskGrade;
  sim?: { price_impact_pct: number; budget_after_pct: number; leverage_ratio?: number };
  at: ISODate;
}

export type TradeRiskGrade = "low" | "medium" | "high" | "critical";

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
  /* --- gateway safety modes (owner-set; enforced on every external write) --- */
  gateway_mode?: "live" | "read_only"; // read_only = the agent may query but not act (claim/submit/trade/pay)
  rate_limit_per_hour?: number; // max write actions/hour via the gateway (0/undefined = unlimited)
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
  allow_posting?: boolean; // owner switch: the agent posts to the platform feed about its work
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
  from_published?: ID; // the marketplace listing this skill was INSTALLED from (provenance)
  source_author_id?: ID; // the owner who published the skill it was installed from
  created_at: ISODate;
  updated_at?: ISODate;
}

/** A learned skill PUBLISHED to the skills marketplace — reusable know-how other
 *  owners install onto their agents. The agent economy's second earning surface:
 *  agents earn not just by doing jobs, but by publishing skills others reuse.
 *  Trust is provenance, not just a scan: the mastery it earned (source_uses),
 *  install count, and the author's reputation are all real + on the record. */
export interface PublishedSkill {
  published_id: ID;
  skill_id: ID; // the source LearnedSkill (in the author's agent library)
  title: string;
  domain: string;
  recipe: string; // version-pinned snapshot at publish time
  summary?: string; // the author's blurb
  author_agent_id: ID; // the agent that learned it
  author_id: ID; // the owner who published (earns installs)
  source_uses: number; // mastery when published — the proven track record
  price_grid: number; // install price in GRID (0 = free)
  installs: number;
  status: "listed" | "delisted";
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

/* ---------------------------- Echo Studio ---------------------------- */
// The workshop (docs/ECHO_STUDIO.md Phase 2): a persistent workspace where the
// self-hosted engine builds a REAL project over many sessions — write→run→fix,
// checkpoints, and a sealed ACTION TRAIL. A workspace wraps a real Build, so
// proof / preview / deploy / GridX / Fund all ride the existing rails.

export type StudioStatus = "idle" | "building" | "failed";

/** One line of the workspace conversation — the builder's directive or the engine's report. */
export interface StudioTurn {
  turn_id: ID;
  role: "you" | "engine" | "chief" | "chatter" | "content" | "marketing"; // the crew seats (Phase 3)
  text: string;
  version?: number; // the build version this turn produced (engine turns)
  cost_grid?: number;
  duration_s?: number;
  files_changed?: number;
  error?: string;
  grade?: "pass" | "revise"; // chief review verdict (chief turns only)
  cost_usd?: number; // the engine's own reported dollar cost for this run (honest, from the end event)
  tokens?: number; // total tokens the run consumed
  quality?: "standard" | "verified" | "best3" | "gated"; // the tier the run was bought at
  at: ISODate;
}

/** One sealed step of the build trail — the receipt, not a claim. "tool" = an
 *  individual engine tool call (Phase 7 ACP mode streams every one). */
export interface StudioTrailEvent {
  at: ISODate;
  type: "run" | "narrate" | "files" | "done" | "error" | "crew" | "tool";
  summary: string;
}

/** A restorable version snapshot (files + the proofs sealed at that moment). */
export interface StudioCheckpoint {
  checkpoint_id: ID;
  version: number;
  note: string;
  files: BuildFile[];
  proof: string; // the sha256 proof-of-build sealed for this version
  trail_sha: string; // sha256 over the cumulative action trail at this point
  at: ISODate;
}

export interface StudioWorkspace {
  workspace_id: ID;
  owner_id: ID;
  name: string;
  status: StudioStatus;
  build_id?: ID; // the linked real Build (created on the first successful run)
  engine_session_id?: string; // engine resume handle (best-effort, warm containers only)
  turns: StudioTurn[]; // capped recent conversation
  checkpoints: StudioCheckpoint[]; // newest first, capped
  trail: StudioTrailEvent[]; // capped cumulative action trail (every step witnessed)
  trail_sha?: string; // seal over the full trail — re-sealed after every run
  progress?: string; // the live narration line while a run is in flight
  spent_grid: number;
  /** The chief's corrective brief after a "revise" grade — a fix run costs GRID,
   *  so it waits for the owner's approval (the venture defer-then-do grammar). */
  pending_fix?: { re_brief: string; notes: string; at: ISODate };
  /** The content seat's drafted launch post — publishing is public, so it waits
   *  for the owner's approval too (Phase 3 launch assets). */
  pending_post?: { title: string; body: string; tagline?: string; at: ISODate };
  /** Build-skills installed into THIS workspace (version-pinned bodies; mounted
   *  into the engine workdir's .grok/skills/ on every run — Phase 5). */
  skills?: { published_id: ID; name: string; title: string; body: string; at: ISODate }[];
  /** Plugins installed into THIS workspace (project-only; the toolbox carries the
   *  user-level ones) — mounted into .grok/plugins/<name>/ + enabled in config. */
  plugins?: { published_id: ID; name: string; title: string; files: PluginFile[]; at: ISODate }[];
  /** Escrowed Jobs opened from the room (Phase 4 HIRE HELP). */
  hired?: { job_id: ID; title: string; at: ISODate }[];
  /** The product's standing law — written to the workdir as AGENTS.md; the engine
   *  obeys it on every run automatically (Phase 6a). */
  rules?: string;
  /** Toolbox items the owner switched OFF for THIS project (by name/published_id) —
   *  inherited connections/skills are on by default; this opts specific ones out. */
  toolbox_off?: string[];
  /** Connected MCP servers — real services the engine can act on (Phase 6b).
   *  `env`/`headers` hold the user's secrets: NEVER returned raw by view() (masked).
   *  A server is EITHER a local command (command+args) OR a remote URL (url). */
  mcp?: { name: string; kind: string; command?: string; args?: string[]; url?: string; env?: Record<string, string>; headers?: Record<string, string>; added_at: ISODate }[]; // kind = an MCP_CATALOG key (mcpShared.ts) or "custom" | "remote"
  /** Cross-session engine memory for this workshop (--experimental-memory). */
  memory_enabled?: boolean;
  /** Fingerprint of the effective toolset (skills+plugins+mcp) last materialized —
   *  a change forces a fresh engine session so newly-mounted items are rescanned
   *  (they load at session START; a resumed warm session would miss them). */
  toolset_sig?: string;
  /** Cumulative REAL dollar cost of engine runs (the engine's own reports). */
  spent_usd?: number;
  created_at: ISODate;
  updated_at: ISODate;
}

/** One file inside a marketplace PLUGIN bundle (Phase 6c). v1 allows only INERT
 *  paths (skills/…, commands/…, agents/…, plugin.json) — anything that executes
 *  (hooks, bundled MCP/LSP) is rejected at publish AND at mount. */
export interface PluginFile { path: string; content: string }

/** A builder's person-level TOOLBOX (Phase 6b+): the powers they set up ONCE on the
 *  Echo hub — MCP connections, build-skills, and plugins — that flow into EVERY
 *  workshop they open (a workshop can still add project-only items, or switch an
 *  inherited one off). One row per user. Secrets masked in views. */
export interface BuilderToolbox {
  owner_id: ID;
  mcp?: StudioWorkspace["mcp"];                 // reuses the connection shape
  skills?: { published_id: ID; name: string; title: string; body: string; at: ISODate }[];
  plugins?: { published_id: ID; name: string; title: string; files: PluginFile[]; at: ISODate }[];
  updated_at?: ISODate;
}

/* -------------------- On-chain attestations (SAS) -------------------- */
// The verifiable, soulbound layer: each durable, independently-verified
// achievement (proof-of-build, delivered job, shipped milestone, launched
// project, promoted agent) becomes a non-transferable credential. Stage 1 is an
// in-platform mirror; Stage 2 mints these as Solana Attestation Service
// tokenized (Token-2022 NonTransferable) attestations — same shape, swap-ready.
export type AttestationSchemaKey = "proof_of_build" | "work_delivered" | "milestone_shipped" | "project_launched" | "agent_trusted" | "trusted_backer" | "verified_trader" | "top_creator" | "trusted_reviewer";
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
  followee_id: ID; // a user id — or an agent id (agents are followable)
  created_at: ISODate;
}

/** The platform-wide feed — humans AND agents post about what they build,
 *  learn, and trade. Cards are visually distinct per author kind. */
export type FeedTopic = "build" | "skill" | "job" | "market" | "general";
export interface FeedComment {
  comment_id: ID;
  author_type: "human" | "agent";
  author_id: ID;
  body: string;
  likes?: ID[]; // user ids
  created_at: ISODate;
}
export interface FeedPost {
  post_id: ID;
  author_type: "human" | "agent";
  author_id: ID; // user id or agent id
  owner_id?: ID; // agent posts: the owning user (rewards route here)
  grid_id?: ID; // scopes the post to a community Grid's wire; absent = the global platform wire
  topic: FeedTopic;
  title?: string;
  body: string;
  /** Optional real-entity link — the post is ABOUT something on the platform. */
  ref?: { kind: "build" | "product" | "job" | "market" | "skill" | "grid"; id: ID; label: string };
  /** Uploaded media — images render in the card, video plays inline, other
   *  files download. Stored as data-URIs (client-capped). */
  attachments?: { kind: "image" | "video" | "file"; name: string; mime: string; data_uri: string; size: number }[];
  likes: ID[]; // user ids
  comments: FeedComment[];
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

/* ------------------------------- Ventures -------------------------------- */
// A Venture is an AGENT COMPANY. A builder (someone who has shipped an Echo
// build) owns it; a CEO-agent orchestrates it; specialist department agents
// (marketing / content / finance / build) execute real, attested work through
// NeuGrid's existing rails. The owner sets objectives in plain English and funds
// a GRID treasury — the CEO turns each objective into internal Jobs the
// specialists deliver, and the product's revenue flows back into the treasury
// (the self-funding loop). Composed from primitives that already exist — Agents
// (the employees), Jobs (delegation), Wallets (the treasury), ContributorSplit
// (the cap table) — plus this thin orchestration layer.

export type VentureDept = "ceo" | "marketing" | "content" | "finance" | "build";
export type VentureStatus = "active" | "paused" | "archived";

/** One seat on the org chart: a department agent with a title and a per-cycle
 *  spend cap drawn from the treasury. */
export interface VentureSeat {
  agent_id: ID;
  dept: VentureDept;
  title: string;            // e.g. "Chief marketing officer"
  budget_grid?: number;     // GRID the seat may spend per cycle (0/undefined = none)
}

/** A goal the owner hands the company, in plain English. The CEO decomposes it
 *  into department tasks; it closes once every spawned task is delivered. */
export type VentureObjectiveStatus = "queued" | "running" | "done";
export interface VentureObjective {
  objective_id: ID;
  text: string;
  status: VentureObjectiveStatus;
  created_at: ISODate;
  tasks_total?: number;
  tasks_done?: number;
}

/** One line in the company's activity log — what the CEO / department agents did. */
export type VentureEventKind =
  | "created" | "hired" | "objective" | "delegated" | "delivered"
  | "spend" | "revenue" | "fund" | "hold" | "approval" | "paused"
  | "recruited"   // the crew posted a real open job to the board to bring in help
  | "reached"     // the crew sent a real outreach DM to a relevant user (owner-approved)
  | "raised";     // the crew opened a real funding raise on the product (owner-approved)
export interface VentureEvent {
  at: ISODate;
  kind: VentureEventKind;
  text: string;
  detail?: string;          // the full work product (e.g. a specialist's brain-written deliverable)
  tool?: string;            // the capability the specialist used (e.g. "computed", "spec → Echo")
  dept?: VentureDept;
  agent_id?: ID;
  job_id?: ID;
  post_id?: ID;             // set when the content agent actually published this to the wire
  amount_grid?: number;
}

/** A high-impact action the CEO wants that needs the owner's sign-off (over a
 *  seat's budget, or anything reaching outside the platform). Phase 1 raises
 *  these for over-budget spend; Phase 2 adds external/public actions. */
export type VentureApprovalStatus = "pending" | "approved" | "declined";
export type VentureApprovalAction = "echo_ship" | "wire_post" | "recruit_job" | "outreach_dm" | "open_raise";
export interface VentureApproval {
  approval_id: ID;
  venture_id: ID;
  kind: "over_budget" | "external_action";
  action?: VentureApprovalAction; // what executes on approval (defer-then-do)
  summary: string;
  detail?: string;                // the drafted payload (post title+body / ship instruction)
  dept?: VentureDept;
  agent_id?: ID;                  // the specialist that proposed it
  objective_id?: ID;              // the objective it came from
  build_id?: ID;                  // target build for an echo_ship
  to_id?: ID;                     // outreach_dm recipient (a real user)
  to_name?: string;               // outreach_dm recipient's display name
  raise?: { title: string; summary: string; category: string; ask_amount: number; roadmap: { title: string; description: string; amount: number }[] }; // open_raise draft
  amount_grid?: number;
  status: VentureApprovalStatus;
  post_id?: ID;                   // set once a wire_post approval publishes
  version?: number;               // set once an echo_ship approval ships
  job_id?: ID;                    // set once a recruit_job approval posts the open job
  conversation_id?: ID;           // set once an outreach_dm approval sends the message
  proposal_id?: ID;               // set once an open_raise approval opens the real raise
  report_id?: ID;                 // the cycle report this action belongs to (so the report stays complete on execution)
  created_at: ISODate;
  resolved_at?: ISODate;
}

/** One entry in a cycle report — a specialist's deliverable and any REAL action it
 *  took (shipped code, published a post, posted an open job to recruit help…). */
export type VentureReportAction = "shipped" | "posted" | "recruited" | "reached" | "raised" | "researched" | "budgeted" | "planned" | "drafted";
export interface VentureReportItem {
  dept: VentureDept;
  agent_id?: ID;
  title: string;
  detail?: string;                // the full work product
  action: VentureReportAction;    // what the specialist actually did
  link?: string;                  // where the real artifact lives (/post/<id>, /jobs, /d/<slug>…)
  status: "done" | "pending_approval";
}
/** A durable, per-cycle report the owner can read in full — the complete archive of
 *  what the company did, cycle by cycle (unlike the bounded activity log). */
export interface VentureReport {
  report_id: ID;
  venture_id: ID;
  cycle: number;                  // the cycle number this report covers
  objective: string;              // the goal that drove the cycle
  headline: string;               // the CEO's one-line summary of the cycle
  items: VentureReportItem[];     // one per specialist deliverable / action
  actions: number;                // how many items were REAL actions (ship/post/recruit)
  created_at: ISODate;
}

export interface Venture {
  venture_id: ID;
  owner_id: ID;
  name: string;
  mission: string;
  template?: string;          // the team template it was created from
  build_id?: ID;              // the linked Echo product it operates
  status: VentureStatus;
  treasury_id: ID;            // the company wallet key ("ven:<venture_id>")
  ceo_agent_id?: ID;          // the orchestrator seat's agent
  seats: VentureSeat[];       // the CEO + department agents
  objectives: VentureObjective[];
  contributor_splits?: ContributorSplit[]; // cap table (owner + each agent's owner)
  approvals?: VentureApproval[];
  require_approval?: boolean;  // gate big actions (ships/posts) behind owner sign-off; default ON
  cycles: number;             // how many work cycles the company has run
  revenue_grid?: number;      // cumulative revenue routed into the treasury (in GRID)
  revenue_synced_usdc?: number; // high-water mark: product USDC revenue already recognized (self-funding loop)
  spent_grid?: number;        // cumulative GRID spent on compute + work
  log: VentureEvent[];        // bounded recent activity feed
  reports?: VentureReport[];  // durable per-cycle reports — the complete, uncapped archive the owner audits
  created_at: ISODate;
  updated_at?: ISODate;
}
