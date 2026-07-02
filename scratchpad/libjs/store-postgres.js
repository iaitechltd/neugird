"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pgEnabled = pgEnabled;
exports.loadFromPostgres = loadFromPostgres;
exports.persistToPostgres = persistToPostgres;
const globalForPg = globalThis;
function pgEnabled() {
    return !!process.env.DATABASE_URL;
}
async function getPool() {
    if (globalForPg.__neugridPgPool)
        return globalForPg.__neugridPgPool;
    const moduleName = "pg"; // variable specifier ⇒ not statically resolved/bundled
    const pg = (await Promise.resolve(`${moduleName}`).then(s => __importStar(require(s))));
    const Pool = pg.Pool ?? pg.default?.Pool;
    if (!Pool)
        throw new Error("[store-postgres] could not load pg.Pool — is `pg` installed in the deploy env?");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: Number(process.env.PG_POOL_MAX ?? 5),
        ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
    });
    globalForPg.__neugridPgPool = pool;
    return pool;
}
const SPECS = [
    { key: "users", table: "users",
        cols: ["id", "wallet_addresses", "username", "avatar", "bio", "skills", "roles_by_grid", "pulse_score", "reputation", "reward", "joined_grids", "created_at"],
        num: ["pulse_score"], ts: ["created_at"], json: ["roles_by_grid", "reputation", "reward"], arr: ["wallet_addresses", "skills", "joined_grids"] },
    { key: "grids", table: "grids",
        cols: ["grid_id", "owner_id", "name", "slug", "category", "description", "visual_theme", "modules_enabled", "visibility", "treasury_config", "pulse_score", "member_count", "grid_type", "lifecycle_stage", "spawned_from", "treasury_id", "token_id", "subgrid_ids", "created_at"],
        num: ["pulse_score", "member_count"], ts: ["created_at"], json: ["visual_theme", "treasury_config", "spawned_from"], arr: ["modules_enabled", "subgrid_ids"] },
    { key: "subgrids", table: "subgrids",
        cols: ["subgrid_id", "parent_grid_id", "name", "purpose", "goal", "admins", "members", "agent_members", "campaigns", "job_ids", "contributor_splits", "pulse_score", "created_at"],
        num: ["pulse_score"], ts: ["created_at"], json: ["contributor_splits"], arr: ["admins", "members", "agent_members", "campaigns", "job_ids"] },
    { key: "campaigns", table: "campaigns",
        cols: ["campaign_id", "grid_id", "subgrid_id", "title", "objective", "task_ids", "reward_pool", "reward_token", "start_date", "end_date", "status", "review_rules", "metrics", "target_grid_ids", "deal", "created_by", "created_at"],
        num: ["reward_pool"], ts: ["start_date", "end_date", "created_at"], json: ["metrics", "deal"], arr: ["task_ids", "target_grid_ids"] },
    { key: "tasks", table: "tasks",
        cols: ["task_id", "campaign_id", "type", "title", "description", "reward", "proof_required", "reviewer", "status", "created_at"],
        num: ["reward"], ts: ["created_at"] },
    { key: "submissions", table: "submissions",
        cols: ["submission_id", "task_id", "campaign_id", "user_id", "proof", "reviewer_status", "quality_score", "reward_status", "pulse_delta", "reviewed_by", "created_at", "reviewed_at"],
        num: ["quality_score", "pulse_delta"], ts: ["created_at", "reviewed_at"] },
    { key: "deals", table: "deals",
        cols: ["deal_id", "project_grid_id", "created_by", "title", "pitch", "allocation", "allocation_token", "success_metric", "status", "accepted_by", "proof", "disclosed", "created_at"],
        num: ["allocation"], ts: ["created_at"] },
    { key: "pulseEvents", table: "pulse_events",
        cols: ["event_id", "target_type", "target_id", "user_id", "action_type", "weight", "reason", "verification_source", "dimension", "created_at"],
        num: ["weight"], ts: ["created_at"], alias: { created_at: "timestamp" } },
    { key: "agents", table: "agents",
        cols: ["agent_id", "owner_id", "grid_id", "name", "capabilities", "permissions", "tools_granted", "task_history", "rating", "status", "origin", "external_framework", "wallet_address", "reputation", "owner_split_bps", "trust_tier", "bond_amount", "spend_limit_per_job", "earnings", "api_key", "api_key_hash", "created_at"],
        num: ["rating", "owner_split_bps", "bond_amount", "spend_limit_per_job", "earnings"], ts: ["created_at"], json: ["reputation"], arr: ["capabilities", "permissions", "tools_granted", "task_history"] },
    { key: "jobs", table: "jobs",
        cols: ["job_id", "context", "grid_id", "subgrid_id", "campaign_id", "title", "description", "required_skills", "executor_kind", "assignee_id", "assignee_type", "reward_amount", "reward_token", "escrow_id", "proof_required", "proof", "verification", "status", "created_by", "created_at", "updated_at"],
        num: ["reward_amount"], ts: ["created_at", "updated_at"], json: ["proof", "verification"], arr: ["required_skills"] },
    { key: "proposals", table: "proposals",
        cols: ["proposal_id", "author_id", "title", "summary", "category", "mvp_ref", "track_record_ref", "roadmap", "ask_amount", "reward_token_terms", "status", "endorsements", "created_at"],
        num: ["ask_amount"], ts: ["created_at"], json: ["mvp_ref", "roadmap", "endorsements"] },
    { key: "treasuries", table: "treasuries",
        cols: ["treasury_id", "grid_id", "token_mint", "total_committed", "total_released", "balance", "signers", "created_at"],
        num: ["total_committed", "total_released", "balance"], ts: ["created_at"], arr: ["signers"] },
    { key: "milestones", table: "milestones",
        cols: ["milestone_id", "treasury_id", "grid_id", "title", "description", "amount", "order", "status", "deliverable", "verification", "approval_vote", "released_tx", "due_at", "created_at"],
        num: ["amount", "order"], ts: ["due_at", "created_at"], json: ["deliverable", "verification", "approval_vote"] },
    { key: "backings", table: "backings",
        cols: ["backing_id", "round_id", "grid_id", "backer_id", "amount", "token_allocation", "vesting", "refunded", "created_at"],
        num: ["amount", "token_allocation"], ts: ["created_at"], json: ["vesting"] },
    { key: "milestoneApprovals", table: "milestone_approvals",
        cols: ["milestone_id", "backer_id"] },
    { key: "tokens", table: "tokens",
        cols: ["token_id", "layer", "symbol", "name", "mint", "grid_id", "total_supply", "launched_at"],
        num: ["total_supply"], ts: ["launched_at"] },
    { key: "markets", table: "markets",
        cols: ["market_id", "token_id", "grid_id", "stage", "base_symbol", "quote_symbol", "liquidity_usd", "holders", "base_reserve", "quote_reserve", "price", "volume", "eligibility", "status", "created_at"],
        num: ["liquidity_usd", "holders", "base_reserve", "quote_reserve", "price", "volume"], ts: ["created_at"], json: ["eligibility"] },
    { key: "holdings", table: "holdings",
        cols: ["market_id", "user_id", "base"], num: ["base"] },
    { key: "trades", table: "trades",
        cols: ["market_id", "user_id", "side", "base", "quote", "price", "at"], num: ["base", "quote", "price"], ts: ["at"] },
    { key: "audits", table: "audits",
        cols: ["audit_id", "grid_id", "requested_by", "status", "reviewer_id", "notes", "created_at", "reviewed_at"],
        ts: ["created_at", "reviewed_at"] },
    { key: "builds", table: "builds",
        cols: ["build_id", "owner_id", "subgrid_id", "title", "prompt", "summary", "stack", "status", "artifact", "steps", "product_id", "proposal_id", "grid_id", "created_at"],
        ts: ["created_at"], json: ["artifact", "steps"], arr: ["stack"] },
    { key: "products", table: "products",
        cols: ["product_id", "grid_id", "subgrid_id", "name", "description", "artifact_ref", "category", "onchain_revenue", "active_users", "followers", "rating", "review_count", "spawned_grid_id", "listed_at"],
        num: ["onchain_revenue", "active_users", "followers", "rating", "review_count"], ts: ["listed_at"], json: ["artifact_ref"] },
    { key: "attestations", table: "attestations",
        cols: ["attestation_id", "schema", "subject_id", "subject_kind", "subject_wallet", "title", "fields", "proof_ref", "source_ref", "status", "issued_at", "revoked_at", "onchain"],
        ts: ["issued_at", "revoked_at"], json: ["fields", "onchain"] },
    { key: "settlements", table: "settlements",
        cols: ["settlement_id", "payer_id", "payee", "resource", "amount", "asset", "network", "scheme", "proof", "status", "created_at", "onchain"],
        num: ["amount"], ts: ["created_at"], json: ["onchain"] },
];
const q = (ident) => `"${ident}"`; // safe-quote a lowercase identifier (handles "order")
/* Row (from SELECT *) → a typed store object. pg already parses jsonb→JS and
 * text[]→array; we coerce numeric→Number and timestamptz(Date)→ISO string. */
function rowToObj(row, spec) {
    const obj = {};
    const num = new Set(spec.num ?? []);
    const ts = new Set(spec.ts ?? []);
    for (const col of spec.cols) {
        const v = row[col];
        if (v === null || v === undefined)
            continue; // optional fields stay undefined
        const key = spec.alias?.[col] ?? col;
        if (num.has(col))
            obj[key] = Number(v);
        else if (ts.has(col))
            obj[key] = v instanceof Date ? v.toISOString() : String(v);
        else
            obj[key] = v; // jsonb (object/array), text[], text, boolean — already correct
    }
    return obj;
}
/* A store object → the ordered parameter list for one INSERT row. */
function objToParams(obj, spec) {
    const json = new Set(spec.json ?? []);
    const arr = new Set(spec.arr ?? []);
    return spec.cols.map((col) => {
        const v = obj[spec.alias?.[col] ?? col];
        if (v === undefined || v === null)
            return null;
        if (json.has(col))
            return JSON.stringify(v); // → jsonb
        if (arr.has(col))
            return Array.isArray(v) ? v : []; // → text[]
        return v; // number / string / boolean / ISO string
    });
}
/* -------------------------------- Hydrate --------------------------------- */
/** Read every table into a fresh DB shape. Throws if the schema isn't applied. */
async function loadFromPostgres() {
    const pool = await getPool();
    const out = {};
    for (const spec of SPECS) {
        const { rows } = await pool.query(`SELECT * FROM ${q(spec.table)}`);
        out[spec.key] = rows.map((r) => rowToObj(r, spec));
    }
    return out;
}
/* -------------------------------- Persist --------------------------------- */
/** Snapshot the whole working set back to Postgres in one transaction. */
async function persistToPostgres(db) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // CASCADE handles delete ordering; RESTART IDENTITY resets trades' serial id.
        await client.query(`TRUNCATE ${SPECS.map((s) => q(s.table)).join(", ")} RESTART IDENTITY CASCADE`);
        for (const spec of SPECS) { // SPECS is in FK-safe parent→child order
            const rows = db[spec.key] ?? [];
            if (!rows.length)
                continue;
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
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK").catch(() => { });
        throw e;
    }
    finally {
        client.release();
    }
}
