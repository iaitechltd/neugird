"use strict";
/**
 * Jobs — the universal work protocol:
 *   describe → assign → execute → submit proof → verify → pay → reputation
 *
 * One primitive for talent contracts, SubGrid tasks, and campaign deliverables
 * (human or agent executors). Pre-treasury, "pay" = award the assignee
 * reputation Pulse equal to the quality-weighted reward — the FIRST place real
 * builder reputation is earned, by verified work rather than a click.
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
exports.listJobs = listJobs;
exports.getJob = getJob;
exports.createJob = createJob;
exports.claimJob = claimJob;
exports.submitProof = submitProof;
exports.reviewJob = reviewJob;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
function listJobs(filter = {}) {
    return store_1.db.jobs.filter((j) => (!filter.grid_id || j.grid_id === filter.grid_id) &&
        (!filter.subgrid_id || j.subgrid_id === filter.subgrid_id) &&
        (!filter.status || j.status === filter.status) &&
        (!filter.assignee_id || j.assignee_id === filter.assignee_id) &&
        (!filter.created_by || j.created_by === filter.created_by));
}
function getJob(id) {
    return store_1.db.jobs.find((j) => j.job_id === id);
}
function createJob(input) {
    const job = {
        job_id: (0, id_1.newId)("job"),
        context: input.context ?? "talent_contract",
        grid_id: input.grid_id,
        subgrid_id: input.subgrid_id,
        campaign_id: input.campaign_id,
        title: input.title,
        description: input.description,
        required_skills: input.required_skills ?? [],
        executor_kind: input.executor_kind ?? "any",
        reward_amount: input.reward_amount,
        reward_token: input.reward_token ?? "Pulse",
        proof_required: input.proof_required ?? "link",
        status: "open",
        created_by: input.created_by,
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.jobs.unshift(job);
    return job;
}
function claimJob(id, user_id, type = "user") {
    const job = getJob(id);
    if (!job || job.status !== "open")
        return undefined;
    job.assignee_id = user_id;
    job.assignee_type = type;
    job.status = "in_progress";
    job.updated_at = (0, id_1.nowISO)();
    return job;
}
function submitProof(id, user_id, payload) {
    const job = getJob(id);
    if (!job || job.assignee_id !== user_id)
        return undefined;
    if (!["in_progress", "assigned", "rejected"].includes(job.status))
        return undefined;
    job.proof = { kind: job.proof_required, payload, submitted_at: (0, id_1.nowISO)() };
    job.status = "submitted";
    job.updated_at = (0, id_1.nowISO)();
    return job;
}
function reviewJob(id, input) {
    const job = getJob(id);
    if (!job || job.status !== "submitted")
        return undefined;
    const quality = input.quality_score ?? 80;
    job.verification = {
        method: "staked_review",
        outcome: input.approve ? "approved" : "rejected",
        quality_score: quality,
        reviewer_stakes: [
            {
                reviewer_id: input.reviewer_id,
                verdict: input.approve ? "approve" : "reject",
                staked_pulse: 0,
                reason: input.reason ?? (input.approve ? "Approved" : "Rejected"),
                created_at: (0, id_1.nowISO)(),
            },
        ],
        decided_at: (0, id_1.nowISO)(),
    };
    job.updated_at = (0, id_1.nowISO)();
    if (!input.approve) {
        job.status = "rejected";
        // Slash an agent's bond on rejected work; demote a trusted agent to probation.
        if (job.assignee_id && job.assignee_type === "agent") {
            const agent = store_1.db.agents.find((a) => a.agent_id === job.assignee_id);
            if (agent) {
                agent.bond_amount = Math.max(0, (agent.bond_amount ?? 0) - 100);
                if (agent.trust_tier === "trusted")
                    agent.trust_tier = "probation";
            }
        }
        return job;
    }
    job.status = "paid"; // pre-treasury: pay = reputation Pulse
    if (job.assignee_id && job.assignee_type !== "agent") {
        const { weight, reason } = Pulse.weightForApproval(job.reward_amount, quality);
        Pulse.recordEvent({
            target_type: "user",
            target_id: job.assignee_id,
            user_id: input.reviewer_id,
            action_type: "job_delivered",
            weight,
            reason: `Job "${job.title}" approved · ${reason}`,
            verification_source: `reviewer:${input.reviewer_id}`,
            dimension: "builder",
        });
    }
    else if (job.assignee_id && job.assignee_type === "agent") {
        const { weight, reason } = Pulse.weightForApproval(job.reward_amount, quality);
        // The agent earns reputation + a rating from verified work.
        Pulse.recordEvent({
            target_type: "agent",
            target_id: job.assignee_id,
            action_type: "job_delivered",
            weight,
            reason: `Job "${job.title}" approved · ${reason}`,
            verification_source: `reviewer:${input.reviewer_id}`,
            dimension: "agent",
        });
        const agent = store_1.db.agents.find((a) => a.agent_id === job.assignee_id);
        if (agent) {
            // Economic split: owner takes a revenue share, the agent keeps the rest in its wallet.
            const bps = Math.min(10000, Math.max(0, agent.owner_split_bps ?? 0));
            const ownerCut = Math.round((job.reward_amount * bps) / 10000);
            agent.earnings = (agent.earnings ?? 0) + Math.max(0, job.reward_amount - ownerCut);
            agent.rating = Math.round(Math.min(5, (agent.rating || 0) * 0.7 + (quality / 100) * 5 * 0.3) * 10) / 10;
            const owner = store_1.db.users.find((u) => u.id === agent.owner_id);
            if (owner && ownerCut > 0) {
                if (!owner.reward)
                    owner.reward = { accrued: 0, sybil_adjusted: 0, claimed: 0 };
                owner.reward.accrued += ownerCut;
            }
        }
    }
    return job;
}
