/**
 * Postgres backing for the NeuGrid store — the Stage-B data-layer swap.
 *
 * Model: the in-memory `db` (see ./store) stays the synchronous working set the
 * modules read/write. This adapter HYDRATES that working set from Cloud SQL at
 * boot and SNAPSHOTS it back on persist — the same "load whole DB / write whole
 * DB" shape the JSON snapshot uses, so nothing above store.ts changes.
 *
 * Activation: set DATABASE_URL. Absent ⇒ store.ts keeps the JSON snapshot and
 * none of this runs. `pg` is loaded via a dynamic, non-analyzable import so the
 * sandbox build never needs the dependency.
 *
 * Mirrors db/schema.sql exactly (one table per DB collection; scalars as columns,
 * nested objects/arrays as jsonb). The SPECS table below is the single mapping to
 * keep in sync with types.ts / schema.sql.
 *
 * ⚠️ UNTESTED against a live Cloud SQL instance (the sandbox can't reach it).
 * Deploy-env checklist:
 *   1. Apply db/schema.sql (server-side import — see the neugrid-infra notes).
 *   2. Set DATABASE_URL. Cloud Run + Cloud SQL via unix socket:
 *        postgresql://USER:PASS@/neugrid?host=/cloudsql/neugrid-io:us-central1:neugrid-db
 *      (password from Secret Manager `neugrid-db-password`). Public-IP fallback:
 *        postgresql://USER:PASS@35.184.243.67:5432/neugrid  (+ PGSSL=require)
 *   3. Optionally `await dbReady` in instrumentation/middleware to skip the brief
 *      pre-hydration seed window (see store.ts).
 *   4. Verify a round-trip: boot (hydrate), mutate via the UI, confirm rows land.
 * TODO(perf): persist is a full transactional snapshot (TRUNCATE+INSERT). Fine at
 *   MVP scale; move to dirty-tracking / event-driven writes before real volume.
 */

import type { DB } from "./store";

/* --------------------------- pg (loaded lazily) --------------------------- */

interface PgResult { rows: Record<string, unknown>[]; }
interface PgClient { query: (text: string, params?: unknown[]) => Promise<PgResult>; release: () => void; }
interface PgPool { query: (text: string, params?: unknown[]) => Promise<PgResult>; connect: () => Promise<PgClient>; end: () => Promise<void>; }

const globalForPg = globalThis as unknown as { __neugridPgPool?: PgPool };

export function pgEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

async function getPool(): Promise<PgPool> {
  if (globalForPg.__neugridPgPool) return globalForPg.__neugridPgPool;
  const moduleName = "pg"; // variable specifier ⇒ not statically resolved/bundled
  const pg = (await import(moduleName)) as unknown as { Pool?: new (c: unknown) => PgPool; default?: { Pool: new (c: unknown) => PgPool } };
  const Pool = pg.Pool ?? pg.default?.Pool;
  if (!Pool) throw new Error("[store-postgres] could not load pg.Pool — is `pg` installed in the deploy env?");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  globalForPg.__neugridPgPool = pool;
  return pool;
}

/* ------------------------------ Table mapping ----------------------------- */

interface Spec {
  key: keyof DB;       // the DB collection
  table: string;       // its schema table
  cols: string[];      // columns to read/write (omit serial-only like trades.id)
  num?: string[];      // numeric/decimal ⇒ Number() on read (pg returns these as strings)
  ts?: string[];       // timestamptz ⇒ ISO string on read
  json?: string[];     // jsonb ⇒ JSON.stringify on write (pg parses on read)
  arr?: string[];      // text[] ⇒ JS string array
  alias?: Record<string, string>; // dbColumn -> objectKey (default: identical)
}

const SPECS: Spec[] = [
  { key: "users", table: "users",
    cols: ["id", "wallet_addresses", "username", "avatar", "bio", "skills", "listing", "referred_by", "referral_verified_at", "roles_by_grid", "pulse_score", "reputation", "reward", "humanity", "joined_grids", "created_at"],
    num: ["pulse_score"], ts: ["created_at", "referral_verified_at"], json: ["listing", "roles_by_grid", "reputation", "reward", "humanity"], arr: ["wallet_addresses", "skills", "joined_grids"] },
  { key: "grids", table: "grids",
    cols: ["grid_id", "owner_id", "name", "slug", "category", "description", "visual_theme", "modules_enabled", "visibility", "treasury_config", "pulse_score", "member_count", "grid_type", "lifecycle_stage", "spawned_from", "treasury_id", "token_id", "subgrid_ids", "created_at"],
    num: ["pulse_score", "member_count"], ts: ["created_at"], json: ["visual_theme", "treasury_config", "spawned_from"], arr: ["modules_enabled", "subgrid_ids"] },
  { key: "subgrids", table: "subgrids",
    cols: ["subgrid_id", "parent_grid_id", "name", "purpose", "goal", "admins", "members", "agent_members", "campaigns", "job_ids", "contributor_splits", "pulse_score", "access", "min_reputation", "min_grid", "created_at"],
    num: ["pulse_score", "min_reputation", "min_grid"], ts: ["created_at"], json: ["contributor_splits"], arr: ["admins", "members", "agent_members", "campaigns", "job_ids"] },
  { key: "campaigns", table: "campaigns",
    cols: ["campaign_id", "grid_id", "subgrid_id", "title", "objective", "task_ids", "reward_pool", "reward_token", "start_date", "end_date", "status", "review_rules", "metrics", "target_grid_ids", "deal", "created_by", "created_at"],
    num: ["reward_pool"], ts: ["start_date", "end_date", "created_at"], json: ["metrics", "deal"], arr: ["task_ids", "target_grid_ids"] },
  { key: "tasks", table: "tasks",
    cols: ["task_id", "campaign_id", "type", "title", "description", "reward", "proof_required", "reviewer", "status", "created_at"],
    num: ["reward"], ts: ["created_at"] },
  { key: "submissions", table: "submissions",
    cols: ["submission_id", "task_id", "campaign_id", "user_id", "proof", "reviewer_status", "quality_score", "reward_status", "pulse_delta", "reviewed_by", "created_at", "reviewed_at"],
    num: ["quality_score", "pulse_delta"], ts: ["created_at", "reviewed_at"] },
  { key: "pulseEvents", table: "pulse_events",
    cols: ["event_id", "target_type", "target_id", "user_id", "action_type", "weight", "reason", "verification_source", "dimension", "reward_excluded", "created_at"],
    num: ["weight"], ts: ["created_at"], alias: { created_at: "timestamp" } },
  { key: "agents", table: "agents",
    cols: ["agent_id", "owner_id", "grid_id", "name", "capabilities", "permissions", "tools_granted", "task_history", "rating", "trading_rating", "status", "origin", "external_framework", "wallet_address", "reputation", "owner_split_bps", "trust_tier", "bond_amount", "spend_limit_per_job", "gateway_mode", "rate_limit_per_hour", "earnings", "api_key", "api_key_hash", "persona", "work", "skill_library", "offer_policy", "allow_posting", "created_at"],
    num: ["rating", "trading_rating", "owner_split_bps", "bond_amount", "spend_limit_per_job", "rate_limit_per_hour", "earnings"], ts: ["created_at"], json: ["reputation", "persona", "work", "skill_library", "offer_policy"], arr: ["capabilities", "permissions", "tools_granted", "task_history"] },
  { key: "jobs", table: "jobs",
    cols: ["job_id", "context", "grid_id", "subgrid_id", "campaign_id", "title", "description", "required_skills", "executor_kind", "assignee_id", "assignee_type", "reward_amount", "reward_token", "escrow_id", "proof_required", "proof", "verification", "status", "created_by", "dispute_deadline", "created_at", "updated_at"],
    num: ["reward_amount"], ts: ["dispute_deadline", "created_at", "updated_at"], json: ["proof", "verification"], arr: ["required_skills"] },
  { key: "disputes", table: "disputes",
    cols: ["dispute_id", "subject_type", "subject_id", "raised_by", "against", "amount", "reason", "status", "votes", "quorum", "outcome", "resolution", "created_at", "resolved_at"],
    num: ["amount", "quorum"], ts: ["created_at", "resolved_at"], json: ["votes", "outcome"] },
  { key: "publishedSkills", table: "published_skills",
    cols: ["published_id", "skill_id", "title", "domain", "recipe", "summary", "author_agent_id", "author_id", "source_uses", "price_grid", "installs", "status", "created_at", "updated_at"],
    num: ["source_uses", "price_grid", "installs"], ts: ["created_at", "updated_at"] },
  { key: "applications", table: "applications",
    cols: ["application_id", "job_id", "applicant_id", "applicant_type", "pitch", "status", "created_at", "updated_at"],
    ts: ["created_at", "updated_at"] },
  { key: "proposals", table: "proposals",
    cols: ["proposal_id", "author_id", "title", "summary", "category", "mvp_ref", "track_record_ref", "roadmap", "ask_amount", "reward_token_terms", "status", "endorsements", "closes_at", "onchain", "created_at"],
    num: ["ask_amount"], ts: ["closes_at", "created_at"], json: ["mvp_ref", "roadmap", "endorsements", "onchain"] },
  { key: "treasuries", table: "treasuries",
    cols: ["treasury_id", "grid_id", "token_mint", "total_committed", "total_released", "balance", "signers", "created_at"],
    num: ["total_committed", "total_released", "balance"], ts: ["created_at"], arr: ["signers"] },
  { key: "milestones", table: "milestones",
    cols: ["milestone_id", "treasury_id", "grid_id", "title", "description", "amount", "order", "status", "deliverable", "verification", "approval_vote", "released_tx", "due_at", "updated_at", "created_at"],
    num: ["amount", "order"], ts: ["due_at", "updated_at", "created_at"], json: ["deliverable", "verification", "approval_vote"] },
  { key: "backings", table: "backings",
    cols: ["backing_id", "round_id", "grid_id", "backer_id", "amount", "token_allocation", "vesting", "refunded", "escrowed", "created_at"],
    num: ["amount", "token_allocation"], ts: ["created_at"], json: ["vesting"] },
  { key: "milestoneApprovals", table: "milestone_approvals",
    cols: ["milestone_id", "backer_id", "support"] },
  { key: "tokens", table: "tokens",
    cols: ["token_id", "layer", "symbol", "name", "mint", "grid_id", "total_supply", "launched_at"],
    num: ["total_supply"], ts: ["launched_at"] },
  { key: "markets", table: "markets",
    cols: ["market_id", "token_id", "grid_id", "stage", "base_symbol", "quote_symbol", "liquidity_usd", "holders", "base_reserve", "quote_reserve", "price", "volume", "eligibility", "status", "stage_changed_at", "fraud_flags", "onchain", "created_at"],
    num: ["liquidity_usd", "holders", "base_reserve", "quote_reserve", "price", "volume"], ts: ["stage_changed_at", "created_at"], json: ["eligibility", "fraud_flags", "onchain"] },
  { key: "holdings", table: "holdings",
    cols: ["market_id", "user_id", "base"], num: ["base"] },
  { key: "trades", table: "trades",
    cols: ["market_id", "user_id", "side", "base", "quote", "price", "at"], num: ["base", "quote", "price"], ts: ["at"] },
  { key: "audits", table: "audits",
    cols: ["audit_id", "grid_id", "requested_by", "status", "reviewer_id", "notes", "created_at", "reviewed_at"],
    ts: ["created_at", "reviewed_at"] },
  { key: "builds", table: "builds",
    cols: ["build_id", "owner_id", "subgrid_id", "title", "prompt", "summary", "stack", "status", "artifact", "steps", "version", "revisions", "deployment", "product_id", "proposal_id", "grid_id", "created_at"],
    num: ["version"], ts: ["created_at"], json: ["artifact", "steps", "revisions", "deployment"], arr: ["stack"] },
  { key: "products", table: "products",
    cols: ["product_id", "grid_id", "subgrid_id", "name", "description", "artifact_ref", "category", "price_usdc", "onchain_revenue", "active_users", "followers", "rating", "review_count", "spawned_grid_id", "listed_at"],
    num: ["price_usdc", "onchain_revenue", "active_users", "followers", "rating", "review_count"], ts: ["listed_at"], json: ["artifact_ref"] },
  { key: "productReviews", table: "product_reviews",
    cols: ["review_id", "product_id", "user_id", "rating", "text", "created_at"],
    num: ["rating"], ts: ["created_at"], json: [] },
  { key: "productEvents", table: "product_events",
    cols: ["event_id", "product_id", "user_id", "kind", "at"],
    num: [], ts: ["at"], json: [] },
  { key: "attestations", table: "attestations",
    cols: ["attestation_id", "schema", "subject_id", "subject_kind", "subject_wallet", "title", "fields", "proof_ref", "source_ref", "status", "issued_at", "revoked_at", "onchain"],
    ts: ["issued_at", "revoked_at"], json: ["fields", "onchain"] },
  { key: "settlements", table: "settlements",
    cols: ["settlement_id", "payer_id", "payee", "resource", "amount", "asset", "network", "scheme", "proof", "status", "created_at", "onchain"],
    num: ["amount"], ts: ["created_at"], json: ["onchain"] },
  { key: "wallets", table: "wallets",
    cols: ["user_id", "usdc", "grid", "pay_fees_in_grid", "starter_credit"], num: ["usdc", "grid", "starter_credit"] },
  { key: "listingStakes", table: "listing_stakes",
    cols: ["stake_id", "grid_id", "market_id", "staker_id", "amount", "stage_target", "locked_until", "released", "fees_earned", "slashed", "slashed_at", "slash_reason", "created_at"],
    num: ["amount", "fees_earned"], ts: ["locked_until", "slashed_at", "created_at"] },
  { key: "positions", table: "positions",
    cols: ["position_id", "market_id", "user_id", "side", "size", "leverage", "entry_price", "margin", "liquidation_price", "status", "opened_at", "closed_at", "pnl", "funding_paid", "last_funding_at", "take_profit", "stop_loss", "trailing_stop_pct", "trail_anchor", "close_reason", "mandate_id", "agent_id", "pnl_booked", "onchain"],
    num: ["size", "leverage", "entry_price", "margin", "liquidation_price", "pnl", "funding_paid", "take_profit", "stop_loss", "trailing_stop_pct", "trail_anchor"], ts: ["opened_at", "closed_at", "last_funding_at"], json: ["onchain"] },
  { key: "orders", table: "orders",
    cols: ["order_id", "market_id", "user_id", "side", "price", "qty", "filled", "status", "created_at", "filled_at", "kind", "pside", "collateral", "leverage", "take_profit", "stop_loss", "trailing_stop_pct", "escrow_quote", "escrow_base"],
    num: ["price", "qty", "filled", "collateral", "leverage", "take_profit", "stop_loss", "trailing_stop_pct", "escrow_quote", "escrow_base"], ts: ["created_at", "filled_at"] },
  { key: "messages", table: "messages",
    cols: ["message_id", "grid_id", "user_id", "text", "likes", "created_at"],
    arr: ["likes"], ts: ["created_at"] },
  { key: "mandates", table: "mandates",
    cols: ["mandate_id", "market_id", "grid_id", "agent_id", "owner_id", "budget_usdc", "max_position_usd", "max_leverage", "allowed_stages", "stop_loss_pct", "daily_loss_cap", "strategy", "expiry", "status", "deployed_usdc", "position_base", "realized_pnl", "trades_count", "last_action_at", "created_at", "stopped_at", "stop_reason"],
    num: ["budget_usdc", "max_position_usd", "max_leverage", "stop_loss_pct", "daily_loss_cap", "deployed_usdc", "position_base", "realized_pnl", "trades_count"], ts: ["expiry", "last_action_at", "created_at", "stopped_at"], arr: ["allowed_stages"] },
  { key: "agentActions", table: "agent_actions",
    cols: ["action_id", "mandate_id", "market_id", "agent_id", "kind", "rationale", "amount", "price", "pnl", "ok", "detail", "risk_grade", "sim", "at"],
    num: ["amount", "price", "pnl"], ts: ["at"], json: ["sim"] },
  { key: "govProposals", table: "gov_proposals",
    cols: ["proposal_id", "kind", "title", "summary", "proposer_id", "status", "for_grid", "against_grid", "quorum_grid", "action", "executed", "execution_note", "closes_at", "created_at", "resolved_at"],
    num: ["for_grid", "against_grid", "quorum_grid"], ts: ["closes_at", "created_at", "resolved_at"], json: ["action"] },
  { key: "govVotes", table: "gov_votes",
    cols: ["proposal_id", "voter_id", "support", "grid", "released", "at"],
    num: ["grid"], ts: ["at"] },
  { key: "gridPosts", table: "grid_posts",
    cols: ["post_id", "grid_id", "author_id", "title", "body", "pinned", "likes", "created_at"],
    arr: ["likes"], ts: ["created_at"] },
  { key: "gridProposals", table: "grid_proposals",
    cols: ["proposal_id", "grid_id", "kind", "title", "summary", "proposer_id", "status", "for_weight", "against_weight", "voters", "quorum_votes", "target_post_id", "executed", "execution_note", "closes_at", "created_at", "resolved_at"],
    num: ["for_weight", "against_weight", "voters", "quorum_votes"], ts: ["closes_at", "created_at", "resolved_at"] },
  { key: "gridVotes", table: "grid_votes",
    cols: ["proposal_id", "voter_id", "support", "weight", "at"],
    num: ["weight"], ts: ["at"] },
  { key: "conversations", table: "conversations",
    cols: ["conversation_id", "participant_ids", "context", "created_at", "last_at"],
    arr: ["participant_ids"], json: ["context"], ts: ["created_at", "last_at"] },
  { key: "directMessages", table: "direct_messages",
    cols: ["message_id", "conversation_id", "from_id", "kind", "body", "offer", "attachment", "transfer", "read_by", "created_at"],
    arr: ["read_by"], json: ["offer", "attachment", "transfer"], ts: ["created_at"] },
  { key: "agreements", table: "agreements",
    cols: ["agreement_id", "from_id", "to_id", "amount", "asset", "terms", "success_metric", "status", "source_message_id", "onchain", "created_at"],
    num: ["amount"], ts: ["created_at"], json: ["onchain"] },
  { key: "follows", table: "follows",
    cols: ["follower_id", "followee_id", "created_at"], ts: ["created_at"] },
  { key: "feedPosts", table: "feed_posts",
    cols: ["post_id", "author_type", "author_id", "owner_id", "topic", "title", "body", "ref", "attachments", "likes", "comments", "created_at"],
    arr: ["likes"], json: ["ref", "attachments", "comments"], ts: ["created_at"] },
];

/* Non-array singleton state on DB (gridPool / tge / params) — stored one jsonb
 * row per key in the `singletons` table (upserted, never truncated). */
const SINGLETON_KEYS = ["gridPool", "tge", "params"] as const satisfies readonly (keyof DB)[];

const q = (ident: string) => `"${ident}"`; // safe-quote a lowercase identifier (handles "order")

/* Row (from SELECT *) → a typed store object. pg already parses jsonb→JS and
 * text[]→array; we coerce numeric→Number and timestamptz(Date)→ISO string. */
function rowToObj(row: Record<string, unknown>, spec: Spec): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const num = new Set(spec.num ?? []);
  const ts = new Set(spec.ts ?? []);
  for (const col of spec.cols) {
    const v = row[col];
    if (v === null || v === undefined) continue; // optional fields stay undefined
    const key = spec.alias?.[col] ?? col;
    if (num.has(col)) obj[key] = Number(v);
    else if (ts.has(col)) obj[key] = v instanceof Date ? v.toISOString() : String(v);
    else obj[key] = v; // jsonb (object/array), text[], text, boolean — already correct
  }
  return obj;
}

/* A store object → the ordered parameter list for one INSERT row. */
function objToParams(obj: Record<string, unknown>, spec: Spec): unknown[] {
  const json = new Set(spec.json ?? []);
  const arr = new Set(spec.arr ?? []);
  return spec.cols.map((col) => {
    const v = obj[spec.alias?.[col] ?? col];
    // text[] columns are NOT NULL DEFAULT '{}' — coerce missing to [] (an explicit
    // NULL param bypasses the column default and violates the constraint).
    if (arr.has(col)) return Array.isArray(v) ? v : [];
    if (v === undefined || v === null) return null;
    if (json.has(col)) return JSON.stringify(v);     // → jsonb
    return v;                                          // number / string / boolean / ISO string
  });
}

/* -------------------------------- Hydrate --------------------------------- */

/** Read every table into a fresh DB shape. Throws if the schema isn't applied. */
export async function loadFromPostgres(): Promise<DB> {
  const pool = await getPool();
  const out = {} as Record<string, unknown>;
  for (const spec of SPECS) {
    const { rows } = await pool.query(`SELECT * FROM ${q(spec.table)}`);
    out[spec.key] = rows.map((r) => rowToObj(r, spec));
  }
  // singletons: one jsonb row per key (pg parses jsonb → JS object)
  const valid = new Set<string>(SINGLETON_KEYS);
  const { rows: singles } = await pool.query(`SELECT key, value FROM ${q("singletons")}`);
  for (const r of singles) {
    const key = String(r.key);
    if (valid.has(key)) out[key] = r.value;
  }
  return out as unknown as DB;
}

/* -------------------------------- Persist --------------------------------- */

/** Snapshot the whole working set back to Postgres in one transaction. */
export async function persistToPostgres(db: DB): Promise<void> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // CASCADE handles delete ordering; RESTART IDENTITY resets trades' serial id.
    await client.query(`TRUNCATE ${SPECS.map((s) => q(s.table)).join(", ")} RESTART IDENTITY CASCADE`);
    for (const spec of SPECS) { // SPECS is in FK-safe parent→child order
      const rows = (db[spec.key] as Record<string, unknown>[]) ?? [];
      if (!rows.length) continue;
      const colCount = spec.cols.length;
      const perChunk = Math.max(1, Math.floor(60000 / colCount)); // stay under the param cap
      const colList = spec.cols.map(q).join(", ");
      for (let i = 0; i < rows.length; i += perChunk) {
        const chunk = rows.slice(i, i + perChunk);
        const values = chunk
          .map((_, ri) => `(${spec.cols.map((__, ci) => `$${ri * colCount + ci + 1}`).join(", ")})`)
          .join(", ");
        const params = chunk.flatMap((r) => objToParams(r, spec));
        await client.query(`INSERT INTO ${q(spec.table)} (${colList}) VALUES ${values}`, params);
      }
    }
    // singletons: upsert (kept out of the TRUNCATE so they survive even when unset)
    for (const key of SINGLETON_KEYS) {
      const val = (db as unknown as Record<string, unknown>)[key];
      if (val === undefined || val === null) continue;
      await client.query(
        `INSERT INTO ${q("singletons")} (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(val)],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
