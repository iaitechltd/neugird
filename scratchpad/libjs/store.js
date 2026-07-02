"use strict";
/**
 * NeuGrid data store (web-first MVP).
 *
 * Today this is an in-process store seeded with example data so the UI has
 * something real to render. It is deliberately the ONLY place that holds
 * state, and every access goes through the canister-shaped modules in
 * ./modules. When we move to ICP canisters / a real DB, we swap this file's
 * implementation — the modules and UI stay unchanged.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbReady = exports.db = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const store_postgres_1 = require("./store-postgres");
/* Stable seed so dashboards render real-looking data in dev. */
function seed() {
    const now = "2026-06-25T12:00:00.000Z";
    const founder = {
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
    const trinity = {
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
    const grid = {
        grid_id: "grid_zion",
        owner_id: "usr_neo",
        name: "Zion Collective",
        slug: "zion",
        category: "DAO / Community",
        description: "A coordination network for builders escaping the noise. Campaigns, talent, and reputation in one Grid.",
        visual_theme: { accent: "#00ff88", glyph: "▦" },
        modules_enabled: ["Grid", "SubGrid", "CampaignX", "TalenX", "Pulse"],
        visibility: "public",
        treasury_config: { enabled: false },
        pulse_score: 1730,
        member_count: 248,
        created_at: now,
    };
    const subgrid = {
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
    const campaign = {
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
    const tasks = [
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
    const submissions = [
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
    const pulseEvents = [
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
    const agents = [
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
    const jobs = [
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
            description: "Threads on Grids, Pulse, and GenesisX. Post and submit the links.",
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
    const proposals = [
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
    const deals = [
        {
            deal_id: "deal_seed1",
            project_grid_id: "grid_zion",
            created_by: "usr_neo",
            title: "Launch push for Zion",
            pitch: "Drive 5k verified signups in two weeks — threads, spaces, and a meme wave.",
            allocation: 25000,
            allocation_token: "Pulse",
            success_metric: "5,000 verified signups",
            status: "open",
            disclosed: true,
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
        deals,
        audits: [],
        builds: [],
        products: [],
        attestations: [],
        settlements: [],
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
const SNAPSHOT = node_path_1.default.join(process.cwd(), ".neugrid-store.json");
/** Ensure every collection key exists, so older snapshots stay forward-compatible. */
function normalize(d) {
    const shape = seed();
    for (const k of Object.keys(shape)) {
        if (d[k] === undefined)
            d[k] = [];
    }
    return d;
}
function loadJson() {
    try {
        if (node_fs_1.default.existsSync(SNAPSHOT))
            return normalize(JSON.parse(node_fs_1.default.readFileSync(SNAPSHOT, "utf8")));
    }
    catch {
        /* corrupt/missing → fall back to a fresh seed */
    }
    return null;
}
function persistJson(d) {
    try {
        node_fs_1.default.writeFileSync(SNAPSHOT, JSON.stringify(d));
    }
    catch {
        /* best-effort; never crash a request on a failed write */
    }
}
const globalForDb = globalThis;
// Working set: hydrated synchronously from the JSON snapshot (or seed). In
// Postgres mode it is overwritten in place by hydrate() once Cloud SQL responds.
exports.db = globalForDb.__neugridDb ?? (globalForDb.__neugridDb = loadJson() ?? seed());
/**
 * Boot hydration. In Postgres mode, load every collection from Cloud SQL and
 * replace the in-memory arrays IN PLACE (so module-held references stay valid).
 * Resolves immediately in JSON mode. Route handlers / instrumentation may
 * `await dbReady` to skip the brief pre-hydration seed window.
 */
async function hydrate() {
    if (!(0, store_postgres_1.pgEnabled)())
        return;
    try {
        const fresh = await (0, store_postgres_1.loadFromPostgres)();
        for (const k of Object.keys(exports.db)) {
            const source = fresh[k];
            if (!Array.isArray(source))
                continue;
            const target = exports.db[k];
            target.splice(0, target.length, ...source);
        }
        globalForDb.__neugridPgOk = true;
    }
    catch (e) {
        globalForDb.__neugridPgOk = false; // hydrate failed → keep the seed, but DON'T persist over real data
        console.error("[store] Postgres hydrate failed — running on in-memory seed (persist disabled):", e instanceof Error ? e.message : e);
    }
}
exports.dbReady = globalForDb.__neugridReady ?? (globalForDb.__neugridReady = hydrate());
function persist(d) {
    if ((0, store_postgres_1.pgEnabled)()) {
        if (!globalForDb.__neugridPgOk)
            return; // never overwrite real Postgres data with the seed fallback
        void (0, store_postgres_1.persistToPostgres)(d).catch((e) => console.warn("[store] Postgres persist failed:", e instanceof Error ? e.message : e));
        return;
    }
    persistJson(d);
}
/* Debounced autosave; unref'd so it never holds the process open. Started only
 * after hydration settles so Postgres mode can't snapshot the seed mid-boot. */
if (!globalForDb.__neugridSave) {
    void exports.dbReady.finally(() => {
        if (globalForDb.__neugridSave)
            return;
        const timer = setInterval(() => persist(exports.db), (0, store_postgres_1.pgEnabled)() ? 15000 : 3000);
        timer.unref?.();
        globalForDb.__neugridSave = timer;
    });
}
