/**
 * NeuGrid data store (web-first MVP).
 *
 * Today this is an in-process store seeded with example data so the UI has
 * something real to render. It is deliberately the ONLY place that holds
 * state, and every access goes through the canister-shaped modules in
 * ./modules. When we move to ICP canisters / a real DB, we swap this file's
 * implementation — the modules and UI stay unchanged.
 */

import type {
  Agent,
  AgentAction,
  Application,
  Attestation,
  Audit,
  Backing,
  Build,
  Campaign,
  GovProposal,
  GovVote,
  GridPost,
  GridProposal,
  GridVote,
  Conversation,
  DirectMessage,
  Agreement,
  Follow,
  FeedPost,
  Dispute,
  PublishedSkill,
  Grid,
  Job,
  LimitOrder,
  ListingStake,
  Mandate,
  Market,
  Message,
  Milestone,
  Position,
  Product,
  ProductReview,
  ProductEvent,
  Proposal,
  PulseEvent,
  Settlement,
  SubGrid,
  Submission,
  Task,
  Token,
  Treasury,
  UserProfile,
  Wallet,
} from "./types";

import fs from "node:fs";
import path from "node:path";
import { pgEnabled, loadFromPostgres, persistToPostgres } from "./store-postgres";

export interface DB {
  users: UserProfile[];
  grids: Grid[];
  subgrids: SubGrid[];
  campaigns: Campaign[];
  tasks: Task[];
  submissions: Submission[];
  pulseEvents: PulseEvent[];
  agents: Agent[];
  jobs: Job[];
  applications: Application[]; // campaign hiring — a worker applies, the poster selects one
  proposals: Proposal[];
  treasuries: Treasury[];
  milestones: Milestone[];
  backings: Backing[];
  milestoneApprovals: { milestone_id: string; backer_id: string; support?: boolean }[]; // backer milestone votes (support=false ⇒ against)
  tokens: Token[];
  markets: Market[];
  holdings: { market_id: string; user_id: string; base: number }[];
  trades: { market_id: string; user_id: string; side: "buy" | "sell"; base: number; quote: number; price: number; at: string }[];
  audits: Audit[];
  builds: Build[]; // Echo build engine — witnessed builds (proof of build)
  products: Product[]; // GridX — published products
  productReviews: ProductReview[]; // GridX — verified-purchase/usage reviews
  productEvents: ProductEvent[]; // GridX — real usage: opens + purchases (drives active-users/trending)
  attestations: Attestation[]; // soulbound credential layer (SAS-bound; Stage 1 in-platform mirror)
  settlements: Settlement[]; // x402 agent-to-protocol payments (Stage 1 accounting; Solana USDC later)
  wallets: Wallet[]; // USDC + GRID balances (Trade; accounting units pre-mainnet)
  listingStakes: ListingStake[]; // GRID locked to graduate a market to the next stage
  positions: Position[]; // futures (perp) leverage positions
  orders: LimitOrder[]; // spot/futures resting limit orders
  messages: Message[]; // per-Grid community chat
  mandates: Mandate[]; // Agent Mode — scoped authority for an agent to trade a market
  agentActions: AgentAction[]; // Agent Mode — the agent's decision/activity feed
  govProposals: GovProposal[]; // protocol governance — GRID-weighted proposals
  govVotes: GovVote[]; // protocol governance — locked GRID votes
  gridPosts: GridPost[]; // Grid content hub — the living feed (updates + pinned announcements)
  gridProposals: GridProposal[]; // grid-member governance — reputation-weighted proposals
  gridVotes: GridVote[]; // grid-member governance — member votes
  conversations: Conversation[]; // universal DMs — 1:1 threads (human or agent)
  directMessages: DirectMessage[]; // messages within conversations (text / deal / hire)
  agreements: Agreement[]; // struck deals from accepted DEAL offers in messaging
  follows: Follow[]; // user→user follow graph (activity surfaces in the bell)
  feedPosts: FeedPost[]; // the platform-wide social feed — human + agent posts (likes/comments inline)
  disputes: Dispute[]; // reputation-staked evaluator adjudication of contested job rejections
  publishedSkills: PublishedSkill[]; // the skills marketplace — learned skills published for other owners to install
  /** The GRID/USDC AMM pool — protocol-owned (treasury-seeded) liquidity for buying
   *  GRID. A singleton (not a collection), lazy-seeded by the gridMarket module — kept
   *  out of seed() so normalize() doesn't array-default it. */
  gridPool?: { grid_reserve: number; usdc_reserve: number; burned?: number };
  /** The one-time platform TGE event (singleton; out of seed() like gridPool). Once
   *  executed, each user's earned allocation is frozen into a vesting schedule. */
  tge?: { executed: boolean; at: string };
  /** Governable protocol parameters — overrides of the modules' hardcoded defaults,
   *  mutated only by a PASSED governance proposal (see modules/params.ts). Singleton
   *  (sparse map), kept out of seed() so normalize() doesn't array-default it. */
  params?: Record<string, number>;
  /** The current earning SEASON (singleton; out of seed() like gridPool). A numbered
   *  window with a snapshot deadline — the countdown + leaderboard people race up. */
  season?: { number: number; started_at: string; ends_at: string };
}

/* Stable seed so dashboards render real-looking data in dev. */
function seed(): DB {
  const now = "2026-06-25T12:00:00.000Z";

  const founder: UserProfile = {
    id: "usr_neo",
    wallet_addresses: ["7vNeoGrid1111111111111111111111111111111111"],
    username: "neo",
    bio: "Architect of the grid.",
    skills: ["solidity", "growth", "design"],
    roles_by_grid: [{ grid_id: "grid_zion", role: "GridFounder", granted_at: now }],
    pulse_score: 842,
    joined_grids: ["grid_zion"],
    created_at: now,
  };

  const trinity: UserProfile = {
    id: "usr_trinity",
    wallet_addresses: ["9xTrinityGrid22222222222222222222222222222222"],
    username: "trinity",
    bio: "Signal over noise.",
    skills: ["research", "content"],
    roles_by_grid: [{ grid_id: "grid_zion", role: "Contributor", granted_at: now }],
    pulse_score: 391,
    joined_grids: ["grid_zion"],
    created_at: now,
  };

  const grid: Grid = {
    grid_id: "grid_zion",
    owner_id: "usr_neo",
    name: "Zion Collective",
    slug: "zion",
    category: "DAO / Community",
    description:
      "A coordination network for builders escaping the noise. Campaigns, talent, and reputation in one Grid.",
    visual_theme: { accent: "#00ff88", glyph: "▦" },
    modules_enabled: ["Grid", "SubGrid", "Campaign", "Talent", "Pulse"],
    visibility: "public",
    treasury_config: { enabled: false },
    pulse_score: 1730,
    member_count: 248,
    created_at: now,
  };

  const subgrid: SubGrid = {
    subgrid_id: "sub_growth",
    parent_grid_id: "grid_zion",
    name: "Growth Pod",
    purpose: "Run referral and content missions to grow the Grid.",
    admins: ["usr_neo"],
    members: ["usr_neo", "usr_trinity"],
    campaigns: ["camp_awaken"],
    pulse_score: 420,
    created_at: now,
  };

  const campaign: Campaign = {
    campaign_id: "camp_awaken",
    grid_id: "grid_zion",
    subgrid_id: "sub_growth",
    title: "Awakening: 7-Day Contributor Push",
    objective: "Onboard 100 verified contributors through referrals and content.",
    task_ids: ["task_referral", "task_thread"],
    reward_pool: 10000,
    start_date: now,
    end_date: "2026-07-02T12:00:00.000Z",
    status: "active",
    review_rules: "manual",
    metrics: { submissions: 2, approved: 1, rejected: 0, contributors: 2, pulse_generated: 60 },
    created_by: "usr_neo",
    created_at: now,
  };

  const tasks: Task[] = [
    {
      task_id: "task_referral",
      campaign_id: "camp_awaken",
      type: "referral",
      title: "Refer a verified builder",
      description: "Invite a builder who connects a wallet and completes their profile.",
      reward: 50,
      proof_required: "link",
      status: "open",
      created_at: now,
    },
    {
      task_id: "task_thread",
      campaign_id: "camp_awaken",
      type: "content",
      title: "Publish a thread about the Grid",
      description: "Write a thread explaining what Zion Collective is building.",
      reward: 80,
      proof_required: "link",
      status: "open",
      created_at: now,
    },
  ];

  const submissions: Submission[] = [
    {
      submission_id: "sub_001",
      task_id: "task_thread",
      campaign_id: "camp_awaken",
      user_id: "usr_trinity",
      proof: "https://x.com/trinity/status/123",
      reviewer_status: "approved",
      quality_score: 88,
      reward_status: "paid",
      pulse_delta: 60,
      reviewed_by: "usr_neo",
      created_at: now,
      reviewed_at: now,
    },
    {
      submission_id: "sub_002",
      task_id: "task_referral",
      campaign_id: "camp_awaken",
      user_id: "usr_trinity",
      proof: "https://neugrid.io/invite/abc",
      reviewer_status: "pending",
      reward_status: "unpaid",
      pulse_delta: 0,
      created_at: now,
    },
  ];

  const pulseEvents: PulseEvent[] = [
    {
      event_id: "pulse_001",
      target_type: "user",
      target_id: "usr_trinity",
      user_id: "usr_trinity",
      action_type: "submission_approved",
      weight: 60,
      reason: "Thread approved (quality 88) in Awakening campaign",
      verification_source: "reviewer:usr_neo",
      timestamp: now,
    },
    {
      event_id: "pulse_002",
      target_type: "grid",
      target_id: "grid_zion",
      action_type: "campaign_completed",
      weight: 120,
      reason: "Growth Pod hit 50% of contributor target",
      verification_source: "auto",
      timestamp: now,
    },
  ];

  const agents: Agent[] = [
    {
      agent_id: "agent_oracle",
      owner_id: "usr_neo",
      grid_id: "grid_zion",
      name: "Oracle",
      capabilities: ["research", "analytics"],
      permissions: ["read:campaigns", "read:pulse"],
      task_history: [],
      rating: 4.6,
      status: "active",
      created_at: now,
    },
  ];

  const jobs: Job[] = [
    {
      job_id: "job_seed1",
      context: "talent_contract",
      grid_id: "grid_zion",
      title: "Design a landing hero for Zion",
      description: "Figma + responsive hero in the matrix aesthetic. Deliver a shareable link.",
      required_skills: ["design", "figma"],
      executor_kind: "human",
      reward_amount: 120,
      reward_token: "Pulse",
      proof_required: "link",
      status: "open",
      created_by: "usr_neo",
      created_at: now,
    },
    {
      job_id: "job_seed2",
      context: "subgrid_task",
      grid_id: "grid_zion",
      subgrid_id: "sub_growth",
      title: "Write 3 explainer threads",
      description: "Threads on Grids, Pulse, and Fund. Post and submit the links.",
      required_skills: ["content", "writing"],
      executor_kind: "human",
      reward_amount: 80,
      reward_token: "Pulse",
      proof_required: "link",
      status: "open",
      created_by: "usr_neo",
      created_at: now,
    },
    {
      job_id: "job_seed3",
      context: "agent_job",
      grid_id: "grid_zion",
      title: "Audit the vault for reentrancy",
      description: "Review access control + reentrancy paths; deliver a findings summary.",
      required_skills: ["security", "audit"],
      executor_kind: "any",
      reward_amount: 300,
      reward_token: "Pulse",
      proof_required: "link",
      status: "open",
      created_by: "usr_trinity",
      created_at: now,
    },
  ];

  const proposals: Proposal[] = [
    {
      proposal_id: "prop_seed1",
      author_id: "usr_neo",
      title: "DeFiVault — yield aggregator",
      summary: "Auto-compounding vault on Solana. MVP live; raising to ship v1 + a security audit.",
      category: "Protocol",
      roadmap: [
        { title: "Audit + mainnet beta", description: "Third-party audit and a public beta.", amount: 60000 },
        { title: "Liquidity + integrations", description: "Seed liquidity and three integrations.", amount: 40000 },
      ],
      ask_amount: 100000,
      status: "open",
      endorsements: [],
      created_at: now,
    },
  ];

  return {
    users: [founder, trinity],
    grids: [grid],
    subgrids: [subgrid],
    campaigns: [campaign],
    tasks,
    submissions,
    pulseEvents,
    agents,
    jobs,
    proposals,
    treasuries: [],
    milestones: [],
    backings: [],
    milestoneApprovals: [],
    tokens: [],
    markets: [],
    holdings: [],
    trades: [],
    audits: [],
    builds: [],
    products: [],
    productReviews: [],
    productEvents: [],
    attestations: [],
    settlements: [],
    // Dev balances so trading + staking are live in the sandbox (accounting units).
    wallets: [
      { user_id: "usr_neo", usdc: 250000, grid: 100000 },
      { user_id: "usr_trinity", usdc: 100000, grid: 50000 },
    ],
    listingStakes: [],
    positions: [],
    orders: [],
    messages: [
      { message_id: "msg_seed1", grid_id: "grid_zion", user_id: "usr_neo", text: "Welcome to the Zion community — this is where we coordinate. Ask anything.", likes: ["usr_trinity"], created_at: now },
      { message_id: "msg_seed2", grid_id: "grid_zion", user_id: "usr_trinity", text: "Loving the momentum. The proof-of-build track record is what sold me.", likes: [], created_at: now },
    ],
    mandates: [],
    agentActions: [],
    govProposals: [],
    govVotes: [],
    gridPosts: [],
    gridProposals: [],
    gridVotes: [],
    conversations: [],
    directMessages: [],
    agreements: [],
    follows: [],
    feedPosts: [],
    disputes: [],
    publishedSkills: [],
    applications: [],
  };
}

/* -----------------------------------------------------------------------
 * Persistence — the SINGLE swap-point for the backing store.
 *
 * Default (no DATABASE_URL): a JSON snapshot, so the store survives dev-server
 * restarts. Stage B (DATABASE_URL set): Cloud SQL Postgres via ./store-postgres
 * — hydrate the in-memory working set at boot, snapshot it back on persist. The
 * modules and UI only ever touch `db`, so swapping the backing store changes
 * nothing above this line. See ./store-postgres for the deploy-env checklist.
 * --------------------------------------------------------------------- */

const SNAPSHOT = path.join(process.cwd(), ".neugrid-store.json");

/** Ensure every collection key exists, so older snapshots stay forward-compatible. */
function normalize(d: Partial<DB>): DB {
  const shape = seed();
  for (const k of Object.keys(shape) as (keyof DB)[]) {
    if (d[k] === undefined) (d as Record<string, unknown>)[k] = [];
  }
  return d as DB;
}

function loadJson(): DB | null {
  try {
    if (fs.existsSync(SNAPSHOT)) return normalize(JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")));
  } catch {
    /* corrupt/missing → fall back to a fresh seed */
  }
  return null;
}

function persistJson(d: DB): void {
  try {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(d));
  } catch {
    /* best-effort; never crash a request on a failed write */
  }
}

const globalForDb = globalThis as unknown as {
  __neugridDb?: DB;
  __neugridSave?: ReturnType<typeof setInterval>;
  __neugridReady?: Promise<void>;
  __neugridPgOk?: boolean;
};

// Working set: hydrated synchronously from the JSON snapshot (or seed). In
// Postgres mode it is overwritten in place by hydrate() once Cloud SQL responds.
export const db: DB = globalForDb.__neugridDb ?? (globalForDb.__neugridDb = loadJson() ?? seed());

/**
 * Boot hydration. In Postgres mode, load every collection from Cloud SQL and
 * replace the in-memory arrays IN PLACE (so module-held references stay valid).
 * Resolves immediately in JSON mode. Route handlers / instrumentation may
 * `await dbReady` to skip the brief pre-hydration seed window.
 */
async function hydrate(): Promise<void> {
  if (!pgEnabled()) return;
  try {
    const fresh = await loadFromPostgres();
    for (const k of Object.keys(fresh) as (keyof DB)[]) {
      const source = (fresh as unknown as Record<string, unknown>)[k];
      if (Array.isArray(source)) {
        // collection: replace contents IN PLACE so module-held references stay valid
        const target = db[k];
        if (Array.isArray(target)) target.splice(0, target.length, ...source);
        else (db as unknown as Record<string, unknown>)[k] = source;
      } else if (source !== undefined && source !== null) {
        // singleton (gridPool / tge / params): modules read db.x dynamically, so reassign
        (db as unknown as Record<string, unknown>)[k] = source;
      }
    }
    globalForDb.__neugridPgOk = true;
  } catch (e) {
    globalForDb.__neugridPgOk = false; // hydrate failed → keep the seed, but DON'T persist over real data
    console.error("[store] Postgres hydrate failed — running on in-memory seed (persist disabled):", e instanceof Error ? e.message : e);
  }
}

export const dbReady: Promise<void> =
  globalForDb.__neugridReady ?? (globalForDb.__neugridReady = hydrate());

function persist(d: DB): void {
  if (pgEnabled()) {
    if (!globalForDb.__neugridPgOk) return; // never overwrite real Postgres data with the seed fallback
    void persistToPostgres(d).catch((e) => console.warn("[store] Postgres persist failed:", e instanceof Error ? e.message : e));
    return;
  }
  persistJson(d);
}

/* Debounced autosave; unref'd so it never holds the process open. Started only
 * after hydration settles so Postgres mode can't snapshot the seed mid-boot. */
if (!globalForDb.__neugridSave) {
  void dbReady.finally(() => {
    if (globalForDb.__neugridSave) return;
    const timer = setInterval(() => persist(db), pgEnabled() ? 15000 : 3000);
    (timer as { unref?: () => void }).unref?.();
    globalForDb.__neugridSave = timer;
  });
}
