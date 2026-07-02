"use strict";
/**
 * CampaignCanister — campaigns, tasks, submissions, and review.
 * On approval it awards Pulse via the PulseCanister, keeping reputation and
 * coordination in lockstep (the core MVP loop).
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
exports.listCampaigns = listCampaigns;
exports.getCampaign = getCampaign;
exports.createCampaign = createCampaign;
exports.addTask = addTask;
exports.listTasks = listTasks;
exports.submit = submit;
exports.listSubmissions = listSubmissions;
exports.review = review;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
function listCampaigns(grid_id) {
    return grid_id ? store_1.db.campaigns.filter((c) => c.grid_id === grid_id) : store_1.db.campaigns;
}
function getCampaign(id) {
    return store_1.db.campaigns.find((c) => c.campaign_id === id);
}
function createCampaign(input) {
    const campaign = {
        campaign_id: (0, id_1.newId)("camp"),
        grid_id: input.grid_id,
        subgrid_id: input.subgrid_id,
        title: input.title,
        objective: input.objective,
        task_ids: [],
        reward_pool: input.reward_pool,
        start_date: input.start_date ?? (0, id_1.nowISO)(),
        end_date: input.end_date ?? (0, id_1.nowISO)(),
        status: "active",
        review_rules: input.review_rules ?? "manual",
        metrics: { submissions: 0, approved: 0, rejected: 0, contributors: 0, pulse_generated: 0 },
        created_by: input.created_by,
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.campaigns.push(campaign);
    return campaign;
}
function addTask(input) {
    const task = {
        task_id: (0, id_1.newId)("task"),
        campaign_id: input.campaign_id,
        type: input.type,
        title: input.title,
        description: input.description,
        reward: input.reward,
        proof_required: input.proof_required ?? "link",
        status: "open",
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.tasks.push(task);
    const c = getCampaign(input.campaign_id);
    if (c)
        c.task_ids.push(task.task_id);
    return task;
}
function listTasks(campaign_id) {
    return store_1.db.tasks.filter((t) => t.campaign_id === campaign_id);
}
function submit(input) {
    const task = store_1.db.tasks.find((t) => t.task_id === input.task_id);
    if (!task)
        return undefined;
    const submission = {
        submission_id: (0, id_1.newId)("sub"),
        task_id: task.task_id,
        campaign_id: task.campaign_id,
        user_id: input.user_id,
        proof: input.proof,
        reviewer_status: "pending",
        reward_status: "unpaid",
        pulse_delta: 0,
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.submissions.unshift(submission);
    const c = getCampaign(task.campaign_id);
    if (c)
        c.metrics.submissions += 1;
    return submission;
}
function listSubmissions(opts) {
    let subs = store_1.db.submissions;
    if (opts?.campaign_id)
        subs = subs.filter((s) => s.campaign_id === opts.campaign_id);
    if (opts?.status)
        subs = subs.filter((s) => s.reviewer_status === opts.status);
    return subs;
}
function review(input) {
    const sub = store_1.db.submissions.find((s) => s.submission_id === input.submission_id);
    if (!sub || sub.reviewer_status !== "pending")
        return sub;
    const task = store_1.db.tasks.find((t) => t.task_id === sub.task_id);
    const campaign = getCampaign(sub.campaign_id);
    sub.reviewed_by = input.reviewer_id;
    sub.reviewed_at = (0, id_1.nowISO)();
    if (input.approved) {
        const quality = input.quality_score ?? 75;
        const { weight, reason } = Pulse.weightForApproval(task?.reward ?? 0, quality);
        sub.reviewer_status = "approved";
        sub.quality_score = quality;
        sub.reward_status = "paid";
        sub.pulse_delta = weight;
        Pulse.recordEvent({
            target_type: "user",
            target_id: sub.user_id,
            user_id: sub.user_id,
            action_type: "submission_approved",
            weight,
            reason,
            verification_source: `reviewer:${input.reviewer_id}`,
        });
        if (campaign) {
            campaign.metrics.approved += 1;
            campaign.metrics.pulse_generated += weight;
        }
    }
    else {
        sub.reviewer_status = "rejected";
        sub.reward_status = "void";
        if (campaign)
            campaign.metrics.rejected += 1;
    }
    return sub;
}
