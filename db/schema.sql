-- NeuGrid database schema (PostgreSQL 16) — mirrors the `DB` store interface
-- in src/lib/store.ts (which in turn mirrors src/lib/types.ts).
--
-- ONE table per persisted store collection. Top-level primitive fields become
-- scalar columns (text / numeric / boolean / timestamptz / text[]); nested
-- objects and arrays-of-objects become `jsonb`. This hybrid keeps the store →
-- Postgres swap a straight per-row serialize/deserialize: store.ts is the SINGLE
-- swap-point (see its load()/persist()), and the modules + UI never change.
--
-- Apply via server-side import in the deploy env (the sandbox can't reach the
-- instance — see the neugrid-infra notes):
--   gcloud storage cp db/schema.sql gs://neugrid-io-sql/schema.sql
--   gcloud sql import sql neugrid-db gs://neugrid-io-sql/schema.sql --database=neugrid
--
-- Tables are ordered so foreign keys reference an already-created table.
-- Polymorphic / optional references (target_id, subject_id, assignee_id, …) are
-- left FK-free on purpose — they may point at either a user or an agent.

/* ============================== Identity ============================== */

-- roles_by_grid is embedded as jsonb (mirrors UserProfile.roles_by_grid), not a
-- separate join table — the store serializes the whole user, roles included.
create table if not exists users (
  id               text primary key,
  wallet_addresses text[]      not null default '{}',
  username         text        not null,
  avatar           text,
  bio              text,
  skills           text[]      not null default '{}',
  roles_by_grid    jsonb       not null default '[]',
  pulse_score      numeric     not null default 0,
  reputation       jsonb,      -- ReputationScore (soulbound, multi-dimensional)
  reward           jsonb,      -- RewardLedger (claimable, vests at TGE)
  joined_grids     text[]      not null default '{}',
  created_at       timestamptz not null default now()
);

/* ================================ Grids ============================== */

create table if not exists grids (
  grid_id         text primary key,
  owner_id        text        not null references users(id),
  name            text        not null,
  slug            text        unique not null,
  category        text        not null,
  description     text,
  visual_theme    jsonb       not null default '{}',
  modules_enabled text[]      not null default '{}',
  visibility      text        not null default 'public',
  treasury_config jsonb       not null default '{}',
  pulse_score     numeric     not null default 0,
  member_count    integer     not null default 0,
  grid_type       text        default 'community', -- community | project | product
  lifecycle_stage text,       -- idea | building | genesis | alpha | spot | futures | graduated | paused | failed
  spawned_from    jsonb,      -- GridProvenance (recursion provenance)
  treasury_id     text,
  token_id        text,
  subgrid_ids     text[]      not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists subgrids (
  subgrid_id        text primary key,
  parent_grid_id    text        not null references grids(grid_id) on delete cascade,
  name              text        not null,
  purpose           text,
  goal              text,
  admins            text[]      not null default '{}',
  members           text[]      not null default '{}', -- human members
  agent_members     text[]      not null default '{}', -- agents on hybrid teams
  campaigns         text[]      not null default '{}',
  job_ids           text[]      not null default '{}',
  contributor_splits jsonb      default '[]', -- ContributorSplit[] ownership agreement
  pulse_score       numeric     not null default 0,
  created_at        timestamptz not null default now()
);

/* ============================== CampaignX ============================ */

create table if not exists campaigns (
  campaign_id     text primary key,
  grid_id         text        not null references grids(grid_id) on delete cascade,
  subgrid_id      text        references subgrids(subgrid_id) on delete set null,
  title           text        not null,
  objective       text,
  task_ids        text[]      not null default '{}',
  reward_pool     numeric     not null default 0,
  reward_token    text,
  start_date      timestamptz,
  end_date        timestamptz,
  status          text        not null default 'active',
  review_rules    text        not null default 'manual',
  metrics         jsonb       not null default '{}',
  target_grid_ids text[]      not null default '{}',
  deal            jsonb,      -- CampaignDeal (escrowed reach-for-allocation)
  created_by      text        not null references users(id),
  created_at      timestamptz not null default now()
);

-- Legacy campaign micro-task. The universal `jobs` table generalizes this.
create table if not exists tasks (
  task_id        text primary key,
  campaign_id    text        not null references campaigns(campaign_id) on delete cascade,
  type           text        not null,
  title          text        not null,
  description    text,
  reward         numeric     not null default 0,
  proof_required text        not null default 'link',
  reviewer       text,
  status         text        not null default 'open',
  created_at     timestamptz not null default now()
);

create table if not exists submissions (
  submission_id   text primary key,
  task_id         text        not null references tasks(task_id) on delete cascade,
  campaign_id     text        not null references campaigns(campaign_id) on delete cascade,
  user_id         text        not null references users(id),
  proof           text,
  reviewer_status text        not null default 'pending',
  quality_score   integer,
  reward_status   text        not null default 'unpaid',
  pulse_delta     numeric     not null default 0,
  reviewed_by     text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

/* =============================== Pulse ============================== */

create table if not exists pulse_events (
  event_id            text primary key,
  target_type         text        not null, -- user | grid | subgrid | agent | campaign
  target_id           text        not null,
  user_id             text,                 -- actor, when applicable
  action_type         text        not null,
  weight              numeric     not null default 0, -- signed delta
  reason              text        not null,
  verification_source text        not null,
  dimension           text,                 -- builder | backer | reviewer | creator | agent
  created_at          timestamptz not null default now()
);

/* ============================== SentientX =========================== */

create table if not exists agents (
  agent_id            text primary key,
  owner_id            text        not null references users(id),
  grid_id             text        references grids(grid_id) on delete set null,
  name                text        not null,
  capabilities        text[]      not null default '{}',
  permissions         text[]      not null default '{}',
  tools_granted       text[]      not null default '{}',
  task_history        text[]      not null default '{}',
  rating              numeric     not null default 0,
  trading_rating      numeric,    -- 0..5, earned from Agent-Mode trading performance
  status              text        not null default 'idle', -- idle | active | suspended
  origin              text        default 'native', -- native | external
  external_framework  text,
  wallet_address      text,
  reputation          jsonb,      -- ReputationScore
  owner_split_bps     integer,
  trust_tier          text,       -- probation | trusted | suspended
  bond_amount         numeric,
  spend_limit_per_job numeric,
  earnings            numeric     not null default 0,
  api_key             text,       -- legacy plaintext (seed agents only)
  api_key_hash        text,       -- sha256 of the gateway key (new agents)
  persona             jsonb,      -- native agent persona/character (Tier 2)
  work                jsonb,      -- autonomous work-runtime session state
  skill_library       jsonb,      -- LearnedSkill[] — Hermes-style self-improvement
  created_at          timestamptz not null default now()
);

/* ===================== Universal Job protocol ======================= */

create table if not exists jobs (
  job_id         text primary key,
  context        text        not null, -- talent_contract | agent_job | subgrid_task | campaign_task
  grid_id        text        references grids(grid_id) on delete set null,
  subgrid_id     text        references subgrids(subgrid_id) on delete set null,
  campaign_id    text,
  title          text        not null,
  description    text,
  required_skills text[]     not null default '{}',
  executor_kind  text        not null default 'any', -- human | agent | any
  assignee_id    text,                 -- user_id OR agent_id (polymorphic, no FK)
  assignee_type  text,                 -- user | agent
  reward_amount  numeric     not null default 0,
  reward_token   text,
  escrow_id      text,
  proof_required text        not null default 'link',
  proof          jsonb,      -- JobProof
  verification   jsonb,      -- Verification (reviewer stakes, outcome, …)
  status         text        not null default 'open',
  created_by     text        not null references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

-- CampaignX applications — a worker (human or agent) applies to a posting; the poster
-- selects one, which assigns the Job. Campaign hiring = apply→select (not first-come).
create table if not exists applications (
  application_id text primary key,
  job_id         text        not null references jobs(job_id) on delete cascade,
  applicant_id   text        not null, -- polymorphic: a user id or an agent id
  applicant_type text        not null default 'user', -- user | agent
  pitch          text,
  status         text        not null default 'pending', -- pending | selected | rejected | withdrawn
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);
create index if not exists idx_applications_job on applications(job_id);

/* ============================== GenesisX ============================ */
-- Funding model = proposal → treasury → milestones → backings (the GenesisRound
-- type exists in types.ts but is NOT a persisted store collection, so it has no
-- table here — the schema mirrors the live `DB`, not every declared type).

create table if not exists proposals (
  proposal_id        text primary key,
  author_id          text        not null references users(id),
  title              text        not null,
  summary            text,
  category           text,
  mvp_ref            jsonb,      -- BuildArtifactRef (the Echo-built MVP)
  track_record_ref   text,
  roadmap            jsonb       not null default '[]', -- MilestoneDraft[]
  ask_amount         numeric     not null default 0,
  reward_token_terms text,
  status             text        not null default 'open',
  endorsements       jsonb       not null default '[]', -- Endorsement[]
  created_at         timestamptz not null default now()
);

create table if not exists treasuries (
  treasury_id     text primary key,
  grid_id         text        not null references grids(grid_id) on delete cascade,
  token_mint      text,
  total_committed numeric     not null default 0,
  total_released  numeric     not null default 0,
  balance         numeric     not null default 0,
  signers         text[]      not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists milestones (
  milestone_id  text primary key,
  treasury_id   text        not null references treasuries(treasury_id) on delete cascade,
  grid_id       text,
  title         text        not null,
  description   text,
  amount        numeric     not null default 0, -- tranche released on approval
  "order"       integer     not null default 0,
  status        text        not null default 'pending',
  deliverable   jsonb,      -- JobProof
  verification  jsonb,      -- Verification
  approval_vote jsonb,      -- BackerVote (backers hold the deciding vote)
  released_tx   text,
  due_at        timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists backings (
  backing_id       text primary key,
  round_id         text,                 -- soft ref (no persisted rounds collection)
  grid_id          text,
  backer_id        text        not null references users(id),
  amount           numeric     not null default 0,
  token_allocation numeric,
  vesting          jsonb,      -- Vesting
  refunded         boolean     default false,
  created_at       timestamptz not null default now()
);

-- Backer approval votes on milestone releases (DB.milestoneApprovals junction).
create table if not exists milestone_approvals (
  milestone_id text not null references milestones(milestone_id) on delete cascade,
  backer_id    text not null references users(id) on delete cascade,
  support      boolean default true, -- backer governance vote: FOR (true) / AGAINST (false)
  primary key (milestone_id, backer_id)
);

/* =============================== Tokens ============================= */

create table if not exists tokens (
  token_id     text primary key,
  layer        text        not null, -- platform | project
  symbol       text        not null,
  name         text        not null,
  mint         text,                 -- Solana mint address
  grid_id      text        references grids(grid_id) on delete set null,
  total_supply numeric,
  launched_at  timestamptz
);

/* =============================== Markets ============================ */
-- Axon / TradeX — constant-product AMM pools per project token.

create table if not exists markets (
  market_id     text primary key,
  token_id      text        not null references tokens(token_id) on delete cascade,
  grid_id       text        references grids(grid_id) on delete set null,
  stage         text        not null default 'alpha', -- alpha | spot | futures
  base_symbol   text        not null,
  quote_symbol  text        not null, -- e.g. USDC / SOL
  liquidity_usd numeric,
  holders       integer,
  base_reserve  numeric,
  quote_reserve numeric,
  price         numeric,
  volume        numeric,
  eligibility   jsonb,      -- GraduationCriterion[] gate to reach this stage
  status        text        not null default 'pending',
  stage_changed_at timestamptz, -- last graduation moment (holder notifications)
  fraud_flags   jsonb,      -- Verifier fraud reports; halt+slash at quorum
  created_at    timestamptz not null default now()
);

-- Per-user pool position (DB.holdings).
create table if not exists holdings (
  market_id text    not null references markets(market_id) on delete cascade,
  user_id   text    not null references users(id) on delete cascade,
  base      numeric not null default 0,
  primary key (market_id, user_id)
);

-- Trade ledger (DB.trades — append-only, no natural id).
create table if not exists trades (
  id        bigserial primary key,
  market_id text        not null references markets(market_id) on delete cascade,
  user_id   text        not null references users(id),
  side      text        not null, -- buy | sell
  base      numeric     not null,
  quote     numeric     not null,
  price     numeric     not null,
  at        timestamptz not null default now()
);

/* ========================== Security audit ========================== */

create table if not exists audits (
  audit_id     text primary key,
  grid_id      text        not null references grids(grid_id) on delete cascade,
  requested_by text        not null references users(id),
  status       text        not null default 'requested', -- requested | passed | failed
  reviewer_id  text,
  notes        text,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

/* ========================= Echo / GridX ============================ */

-- Echo build engine — builds the platform witnessed end-to-end (proof of build).
create table if not exists builds (
  build_id    text primary key,
  owner_id    text        not null references users(id), -- the builder
  subgrid_id  text,
  title       text        not null,
  prompt      text,
  summary     text,
  stack       text[]      not null default '{}',
  status      text        not null default 'built', -- building | built | listed | funded
  artifact    jsonb       not null default '{}', -- BuildArtifactRef (carries proof_of_build + files)
  steps       jsonb       not null default '[]', -- BuildStep[] witnessed stream
  version     numeric     default 1, -- current version (the iterate loop)
  revisions   jsonb       default '[]', -- BuildRevision[] — instruction + re-sealed proof per revision
  deployment  jsonb, -- BuildDeployment — live on NeuGrid hosting (/d/<slug>), version-pinned snapshot
  product_id  text,
  proposal_id text,
  grid_id     text,
  created_at  timestamptz not null default now()
);

-- GridX — published products (on-chain app store).
create table if not exists products (
  product_id      text primary key,
  grid_id         text        not null references grids(grid_id) on delete cascade,
  subgrid_id      text,
  name            text        not null,
  description     text,
  artifact_ref    jsonb,      -- BuildArtifactRef
  category        text,
  onchain_revenue numeric,    -- the gold trust signal
  active_users    integer,
  followers       integer,
  rating          numeric,
  review_count    integer,
  spawned_grid_id text,
  listed_at       timestamptz not null default now()
);

/* ==================== On-chain attestations (SAS) =================== */
-- Soulbound credential layer. Stage 1 = in-platform mirror; Stage 2 fills
-- `onchain` from Solana Attestation Service (Token-2022 NonTransferable).

create table if not exists attestations (
  attestation_id text primary key,
  schema         text        not null, -- proof_of_build | work_delivered | milestone_shipped | project_launched | agent_trusted
  subject_id     text        not null, -- user_id OR agent_id (polymorphic, no FK)
  subject_kind   text        not null, -- user | agent
  subject_wallet text,                 -- Solana address the SAS token mints to
  title          text        not null,
  fields         jsonb       not null default '{}',
  proof_ref      text,                 -- ngpob hash / verifier id / external anchor
  source_ref     text        not null, -- originating record (dedup key)
  status         text        not null default 'active', -- active | revoked | expired
  issued_at      timestamptz not null default now(),
  revoked_at     timestamptz,
  onchain        jsonb       -- { mint, tx, cluster } once minted on Solana
);

/* ==================== Agent-to-agent payments (x402) =============== */
-- HTTP-402 machine payments. Stage 1 = accounting unit; Stage 2 fills `onchain`
-- from a real Solana USDC settlement via an x402 facilitator.

create table if not exists settlements (
  settlement_id text primary key,
  payer_id      text        not null, -- the paying agent (polymorphic, no FK)
  payee         text        not null, -- resource server / protocol treasury (Stage 2: a Solana ATA)
  resource      text        not null,
  amount        numeric     not null default 0, -- priced in USDC
  asset         text        not null default 'USDC',
  network       text        not null default 'solana',
  scheme        text        not null default 'exact',
  proof         text,                 -- x402 proof (Stage 2: on-chain tx signature)
  status        text        not null default 'settled', -- settled | refunded
  created_at    timestamptz not null default now(),
  onchain       jsonb       -- { tx, cluster } once settled on Solana
);

/* =============================== TradeX ============================= */
-- USDC + GRID balances (accounting units pre-mainnet). user_id may be a
-- "neugrid:*" protocol sink (e.g. neugrid:treasury) — so no FK to users.

create table if not exists wallets (
  user_id text primary key,
  usdc    numeric not null default 0,
  grid    numeric not null default 0
);

-- GRID locked to graduate a market to its next stage (stake-to-list).
create table if not exists listing_stakes (
  stake_id     text primary key,
  grid_id      text        not null,
  market_id    text        not null,
  staker_id    text        not null references users(id),
  amount       numeric     not null default 0,
  stage_target text        not null, -- spot | futures
  locked_until timestamptz,
  released     boolean     not null default false,
  fees_earned  numeric     not null default 0, -- USDC trade-fee share accrued to this stake
  created_at   timestamptz not null default now()
);

-- Futures (perp) leverage positions.
create table if not exists positions (
  position_id       text primary key,
  market_id         text        not null,
  user_id           text        not null references users(id),
  side              text        not null, -- long | short
  size              numeric     not null default 0,
  leverage          numeric     not null default 1,
  entry_price       numeric     not null default 0,
  margin            numeric     not null default 0,
  liquidation_price numeric     not null default 0,
  status            text        not null default 'open', -- open | closed | liquidated
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  pnl               numeric,
  funding_paid      numeric,    -- cumulative skew-carry paid from margin
  last_funding_at   timestamptz,
  take_profit       numeric,    -- conditional close triggers (TP+SL ⇒ OCO)
  stop_loss         numeric,
  trailing_stop_pct numeric,    -- trailing stop: % behind the best mark seen
  trail_anchor      numeric,
  close_reason      text,       -- manual | liquidation | take_profit | stop_loss | trailing_stop
  mandate_id        text,       -- set when an agent opened this under a mandate (Agent Mode)
  agent_id          text,
  pnl_booked        boolean     default false -- mandate has accounted this position's PnL
);

-- Spot/futures resting limit orders.
create table if not exists orders (
  order_id   text primary key,
  market_id  text        not null,
  user_id    text        not null references users(id),
  side       text        not null, -- buy | sell
  price      numeric     not null default 0,
  qty        numeric     not null default 0,
  filled     numeric     not null default 0,
  status     text        not null default 'open', -- open | filled | cancelled
  created_at timestamptz not null default now(),
  filled_at  timestamptz,
  kind       text,       -- spot (default) | perp_entry (opens a position on cross)
  pside      text,       -- perp entry side: long | short
  collateral numeric,    -- perp entry margin (USDC), debited at trigger
  leverage   numeric     -- perp entry leverage
);

-- Per-Grid community chat (surfaced on the market terminal + the Grid page).
create table if not exists messages (
  message_id text primary key,
  grid_id    text        not null,
  user_id    text        not null references users(id),
  text       text        not null,
  likes      text[]      not null default '{}',
  created_at timestamptz not null default now()
);

-- Agent Mode: a scoped authority for an agent to trade a market on the owner's
-- behalf (budget / max position / leverage / stop-loss / kill-switch).
create table if not exists mandates (
  mandate_id       text primary key,
  market_id        text        not null,
  grid_id          text        not null,
  agent_id         text        not null references agents(agent_id),
  owner_id         text        not null references users(id),
  budget_usdc      numeric     not null default 0,
  max_position_usd numeric     not null default 0,
  max_leverage     numeric     not null default 1,
  allowed_stages   text[]      not null default '{}', -- alpha | spot | futures
  stop_loss_pct    numeric     not null default 0.25,
  daily_loss_cap   numeric     not null default 0,
  strategy         text        not null default 'dca', -- dca | momentum | hedge | external
  expiry           timestamptz not null,
  status           text        not null default 'active', -- active | stopped | expired | completed
  deployed_usdc    numeric     not null default 0,
  position_base    numeric     not null default 0,
  realized_pnl     numeric     not null default 0,
  trades_count     integer     not null default 0,
  last_action_at   timestamptz,
  created_at       timestamptz not null default now(),
  stopped_at       timestamptz,
  stop_reason      text
);

-- Agent Mode: the agent's attributed decision/activity feed (one row per action).
create table if not exists agent_actions (
  action_id  text primary key,
  mandate_id text        not null references mandates(mandate_id) on delete cascade,
  market_id  text        not null,
  agent_id   text        not null,
  kind       text        not null, -- buy | sell | open_long | open_short | close | hold | stop
  rationale  text        not null,
  amount     numeric,
  price      numeric,
  pnl        numeric,
  ok         boolean     not null default true,
  detail     text,
  at         timestamptz not null default now()
);

/* Protocol governance — GRID locked to vote on protocol proposals. */
create table if not exists gov_proposals (
  proposal_id  text primary key,
  kind         text        not null, -- param | listing | treasury | general
  title        text        not null,
  summary      text        not null default '',
  proposer_id  text        not null,
  status       text        not null default 'open', -- open | passed | rejected
  for_grid     numeric     not null default 0,
  against_grid numeric     not null default 0,
  quorum_grid  numeric     not null default 0,
  closes_at    timestamptz not null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create table if not exists gov_votes (
  proposal_id text        not null references gov_proposals(proposal_id) on delete cascade,
  voter_id    text        not null,
  support     boolean     not null,
  grid        numeric     not null,
  released    boolean     not null default false,
  at          timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

/* Grid content hub — the living feed (updates + pinned announcements). */
create table if not exists grid_posts (
  post_id    text primary key,
  grid_id    text        not null,
  author_id  text        not null,
  title      text,
  body       text        not null,
  pinned     boolean     not null default false,
  likes      text[]      not null default '{}',
  created_at timestamptz not null default now()
);

/* Grid-member governance — reputation-weighted, member-scoped proposals + votes. */
create table if not exists grid_proposals (
  proposal_id    text primary key,
  grid_id        text        not null,
  kind           text        not null, -- feature_post | general
  title          text        not null,
  summary        text        not null default '',
  proposer_id    text        not null,
  status         text        not null default 'open', -- open | passed | rejected
  for_weight     numeric     not null default 0,
  against_weight numeric     not null default 0,
  voters         integer     not null default 0,
  quorum_votes   integer     not null default 2,
  target_post_id text,
  executed       boolean     default false,
  execution_note text,
  closes_at      timestamptz not null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create table if not exists grid_votes (
  proposal_id text        not null references grid_proposals(proposal_id) on delete cascade,
  voter_id    text        not null,
  support     boolean     not null,
  weight      numeric     not null,
  at          timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

/* Universal DMs — 1:1 conversations (human or agent) with deal/hire offers. */
create table if not exists conversations (
  conversation_id text primary key,
  participant_ids text[]      not null,
  context         jsonb,
  created_at      timestamptz not null default now(),
  last_at         timestamptz not null default now()
);
create table if not exists agreements (
  agreement_id      text primary key,
  from_id           text        not null,
  to_id             text        not null,
  amount            numeric     not null default 0,
  asset             text,
  terms             text        not null default '',
  success_metric    text,
  status            text        not null default 'active', -- active | completed | cancelled
  source_message_id text,
  created_at        timestamptz not null default now()
);
create table if not exists direct_messages (
  message_id      text primary key,
  conversation_id text        not null references conversations(conversation_id) on delete cascade,
  from_id         text        not null,
  kind            text        not null default 'text', -- text | deal | hire
  body            text        not null default '',
  offer           jsonb,
  read_by         text[]      not null default '{}',
  created_at      timestamptz not null default now()
);

/* ========================= Protocol singletons ===================== */
-- Non-collection state kept as one row per key (jsonb value): the GRID/USDC AMM
-- pool (gridPool), the one-time TGE event (tge), and governable param overrides
-- (params). Mirrors the optional singleton fields on the `DB` interface in
-- store.ts — these are upserted (never truncated) by the Postgres adapter.
create table if not exists singletons (
  key   text primary key, -- gridPool | tge | params
  value jsonb not null
);

/* =============================== Indexes ============================ */

create index if not exists idx_grids_owner          on grids(owner_id);
create index if not exists idx_subgrids_parent       on subgrids(parent_grid_id);
create index if not exists idx_campaigns_grid        on campaigns(grid_id);
create index if not exists idx_tasks_campaign        on tasks(campaign_id);
create index if not exists idx_submissions_task      on submissions(task_id);
create index if not exists idx_pulse_target          on pulse_events(target_type, target_id);
create index if not exists idx_agents_owner          on agents(owner_id);
create index if not exists idx_jobs_grid             on jobs(grid_id);
create index if not exists idx_jobs_status           on jobs(status);
create index if not exists idx_jobs_assignee         on jobs(assignee_id);
create index if not exists idx_proposals_author      on proposals(author_id);
create index if not exists idx_proposals_status      on proposals(status);
create index if not exists idx_treasuries_grid       on treasuries(grid_id);
create index if not exists idx_milestones_treasury   on milestones(treasury_id);
create index if not exists idx_backings_backer       on backings(backer_id);
create index if not exists idx_tokens_grid           on tokens(grid_id);
create index if not exists idx_markets_token         on markets(token_id);
create index if not exists idx_holdings_user         on holdings(user_id);
create index if not exists idx_trades_market         on trades(market_id);
create index if not exists idx_audits_grid           on audits(grid_id);
create index if not exists idx_builds_owner          on builds(owner_id);
create index if not exists idx_products_grid         on products(grid_id);
create index if not exists idx_attestations_subject  on attestations(subject_id);
create index if not exists idx_attestations_source   on attestations(source_ref);
create index if not exists idx_settlements_payer     on settlements(payer_id);
create index if not exists idx_stakes_market         on listing_stakes(market_id);
create index if not exists idx_stakes_grid           on listing_stakes(grid_id);
create index if not exists idx_positions_market      on positions(market_id);
create index if not exists idx_positions_user        on positions(user_id);
create index if not exists idx_orders_market         on orders(market_id);
create index if not exists idx_messages_grid         on messages(grid_id);
create index if not exists idx_mandates_market       on mandates(market_id);
create index if not exists idx_mandates_owner        on mandates(owner_id);
create index if not exists idx_mandates_agent        on mandates(agent_id);
create index if not exists idx_agent_actions_mandate on agent_actions(mandate_id);
create index if not exists idx_gov_proposals_status   on gov_proposals(status);
create index if not exists idx_gov_votes_proposal     on gov_votes(proposal_id);
create index if not exists idx_grid_posts_grid        on grid_posts(grid_id);
create index if not exists idx_grid_proposals_grid    on grid_proposals(grid_id);
create index if not exists idx_grid_votes_proposal    on grid_votes(proposal_id);
create index if not exists idx_direct_messages_convo   on direct_messages(conversation_id);
