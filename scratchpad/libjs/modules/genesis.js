"use strict";
/**
 * GenesisX — reputation-gated funding with milestone-escrowed treasuries.
 *
 *   propose (must have earned reputation) → backers fund → on a FULL raise a
 *   PROJECT Grid spawns with a treasury + milestones → founder delivers each
 *   milestone → backers approve (weighted by stake) → the tranche releases.
 *
 * This is the "merit → funding" core: who gets funded is decided by a verifiable
 * track record, not connections. Pre-treasury, amounts are accounting units.
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
exports.PROPOSE_REPUTATION_MIN = void 0;
exports.reputationOf = reputationOf;
exports.canPropose = canPropose;
exports.listProposals = listProposals;
exports.getProposal = getProposal;
exports.raisedFor = raisedFor;
exports.backersFor = backersFor;
exports.hasBacked = hasBacked;
exports.createProposal = createProposal;
exports.fundProposal = fundProposal;
exports.listMilestones = listMilestones;
exports.getMilestone = getMilestone;
exports.ownerOfMilestone = ownerOfMilestone;
exports.submitMilestone = submitMilestone;
exports.approveMilestone = approveMilestone;
exports.proposalView = proposalView;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
const GridRegistry = __importStar(require("./gridRegistry"));
const Echo = __importStar(require("./echo"));
exports.PROPOSE_REPUTATION_MIN = 100;
function reputationOf(user_id) {
    const u = store_1.db.users.find((u) => u.id === user_id);
    if (!u)
        return 0;
    // headline Pulse (legacy seed score) and the new multi-dim ledger both count
    return Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0);
}
function canPropose(user_id) {
    return reputationOf(user_id) >= exports.PROPOSE_REPUTATION_MIN;
}
function listProposals(filter = {}) {
    return store_1.db.proposals.filter((p) => (!filter.status || p.status === filter.status) && (!filter.author_id || p.author_id === filter.author_id));
}
function getProposal(id) {
    return store_1.db.proposals.find((p) => p.proposal_id === id);
}
function raisedFor(proposal_id) {
    return store_1.db.backings.filter((b) => b.round_id === proposal_id && !b.refunded).reduce((s, b) => s + b.amount, 0);
}
function backersFor(proposal_id) {
    return store_1.db.backings.filter((b) => b.round_id === proposal_id && !b.refunded);
}
function hasBacked(proposal_id, user_id) {
    return store_1.db.backings.some((b) => b.round_id === proposal_id && b.backer_id === user_id && !b.refunded);
}
function createProposal(input) {
    if (!canPropose(input.author_id))
        return { error: "insufficient_reputation" };
    if (!input.title || !(input.ask_amount > 0))
        return { error: "bad_input" };
    const proposal = {
        proposal_id: (0, id_1.newId)("prop"),
        author_id: input.author_id,
        title: input.title,
        summary: input.summary,
        category: input.category,
        roadmap: input.roadmap.length ? input.roadmap : [{ title: "Deliver v1", description: "Ship the first version.", amount: input.ask_amount }],
        ask_amount: input.ask_amount,
        status: "open",
        endorsements: [],
        created_at: (0, id_1.nowISO)(),
    };
    // Attach the Echo-built MVP as proof-of-build, if one was supplied + owned by the author.
    if (input.build_id) {
        const build = Echo.getBuild(input.build_id);
        if (build && build.owner_id === input.author_id) {
            proposal.mvp_ref = build.artifact;
            proposal.track_record_ref = input.author_id;
            Echo.attachProposal(build.build_id, proposal.proposal_id);
        }
    }
    store_1.db.proposals.unshift(proposal);
    return { proposal };
}
function fundProposal(proposal_id, backer_id, amount) {
    const p = getProposal(proposal_id);
    if (!p)
        return { error: "not_found" };
    if (p.status !== "open")
        return { error: "not_open" };
    if (!(amount > 0))
        return { error: "bad_amount" };
    store_1.db.backings.push({ backing_id: (0, id_1.newId)("back"), round_id: proposal_id, grid_id: "", backer_id, amount, created_at: (0, id_1.nowISO)() });
    const raised = raisedFor(proposal_id);
    if (raised < p.ask_amount)
        return { proposal: p, raised };
    // Fully funded → spawn the project Grid + treasury + milestones (the recursion)
    const grid = GridRegistry.createGrid({ owner_id: p.author_id, name: p.title, category: p.category, description: p.summary, grid_type: "project" });
    grid.lifecycle_stage = "building";
    grid.spawned_from = { origin: "proposal", proposal_id };
    const treasury = { treasury_id: (0, id_1.newId)("tre"), grid_id: grid.grid_id, total_committed: raised, total_released: 0, balance: raised, created_at: (0, id_1.nowISO)() };
    store_1.db.treasuries.push(treasury);
    grid.treasury_id = treasury.treasury_id;
    const ms = p.roadmap.map((m, i) => ({
        milestone_id: (0, id_1.newId)("mile"), treasury_id: treasury.treasury_id, grid_id: grid.grid_id,
        title: m.title, description: m.description, amount: m.amount, order: i, status: "pending", created_at: (0, id_1.nowISO)(),
    }));
    store_1.db.milestones.push(...ms);
    store_1.db.backings.filter((b) => b.round_id === proposal_id).forEach((b) => (b.grid_id = grid.grid_id));
    p.status = "funded";
    Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 50, reason: `Funded: raised ${raised} for "${p.title}"`, verification_source: "auto" });
    for (const b of backersFor(proposal_id)) {
        Pulse.recordEvent({ target_type: "user", target_id: b.backer_id, action_type: "referral_verified", weight: 10, reason: `Backed "${p.title}" to a full raise`, verification_source: "auto", dimension: "backer" });
    }
    return { proposal: p, raised, spawned_grid_id: grid.grid_id };
}
function listMilestones(grid_id) {
    return store_1.db.milestones.filter((m) => m.grid_id === grid_id).sort((a, b) => a.order - b.order);
}
function getMilestone(id) {
    return store_1.db.milestones.find((m) => m.milestone_id === id);
}
/** The founder (grid owner) a milestone belongs to — the subject of its credential. */
function ownerOfMilestone(milestone_id) {
    const m = getMilestone(milestone_id);
    return m ? store_1.db.grids.find((g) => g.grid_id === m.grid_id)?.owner_id : undefined;
}
function submitMilestone(milestone_id, user_id, proof) {
    const m = getMilestone(milestone_id);
    if (!m)
        return { error: "not_found" };
    const grid = store_1.db.grids.find((g) => g.grid_id === m.grid_id);
    if (!grid || grid.owner_id !== user_id)
        return { error: "only_founder" };
    if (m.status !== "pending" && m.status !== "rejected")
        return { error: "bad_state" };
    m.status = "submitted";
    if (proof)
        m.deliverable = { kind: "link", payload: proof, submitted_at: (0, id_1.nowISO)() };
    return { milestone: m };
}
/** Backers approve (weighted by stake); ≥50% of committed funds releases the tranche. */
function approveMilestone(milestone_id, backer_id) {
    const m = getMilestone(milestone_id);
    if (!m)
        return { error: "not_found" };
    if (m.status !== "submitted")
        return { error: "not_submitted" };
    const myBacking = store_1.db.backings.find((b) => b.grid_id === m.grid_id && b.backer_id === backer_id);
    if (!myBacking)
        return { error: "not_a_backer" };
    if (!store_1.db.milestoneApprovals.some((a) => a.milestone_id === milestone_id && a.backer_id === backer_id)) {
        store_1.db.milestoneApprovals.push({ milestone_id, backer_id });
    }
    const approvers = new Set(store_1.db.milestoneApprovals.filter((a) => a.milestone_id === milestone_id).map((a) => a.backer_id));
    const committed = store_1.db.treasuries.find((t) => t.treasury_id === m.treasury_id)?.total_committed ?? 0;
    const approvedAmount = store_1.db.backings.filter((b) => b.grid_id === m.grid_id && approvers.has(b.backer_id)).reduce((s, b) => s + b.amount, 0);
    const pct = committed > 0 ? approvedAmount / committed : 0;
    if (pct >= 0.5) {
        m.status = "released";
        const tre = store_1.db.treasuries.find((t) => t.treasury_id === m.treasury_id);
        if (tre) {
            tre.total_released += m.amount;
            tre.balance = Math.max(0, tre.balance - m.amount);
        }
        const grid = store_1.db.grids.find((g) => g.grid_id === m.grid_id);
        if (grid) {
            Pulse.recordEvent({ target_type: "user", target_id: grid.owner_id, action_type: "milestone_approved", weight: 30, reason: `Milestone "${m.title}" released`, verification_source: "backers", dimension: "builder" });
            Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "milestone_approved", weight: 20, reason: `Milestone "${m.title}" released`, verification_source: "backers" });
        }
        return { milestone: m, released: true, approved_pct: pct };
    }
    return { milestone: m, released: false, approved_pct: pct };
}
/** Full read model for a proposal: funding progress, backers, spawned grid, milestones. */
function proposalView(id) {
    const p = getProposal(id);
    if (!p)
        return undefined;
    const grid = store_1.db.grids.find((g) => g.spawned_from?.proposal_id === id);
    return {
        proposal: p,
        raised: raisedFor(id),
        backers: backersFor(id).length,
        spawned_grid_id: grid?.grid_id ?? null,
        spawned_grid_slug: grid?.slug ?? null,
        milestones: grid ? listMilestones(grid.grid_id) : [],
    };
}
