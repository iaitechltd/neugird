"use strict";
/**
 * CampaignX — the distribution exchange.
 *
 *   a project offers token allocation → a creator/community ACCEPTS → they
 *   DELIVER verified reach → the project VERIFIES → the deal settles, the
 *   creator earns creator-reputation + the allocation.
 *
 * Deals are disclosed on-chain by default (paid promotion is transparent here,
 * which is the credibility feature). Echo matchmakes communities for a project.
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
exports.listDeals = listDeals;
exports.getDeal = getDeal;
exports.createDeal = createDeal;
exports.acceptDeal = acceptDeal;
exports.deliverDeal = deliverDeal;
exports.verifyDeal = verifyDeal;
exports.suggestGrids = suggestGrids;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
function listDeals(f = {}) {
    return store_1.db.deals.filter((d) => (!f.status || d.status === f.status) &&
        (!f.project_grid_id || d.project_grid_id === f.project_grid_id) &&
        (!f.created_by || d.created_by === f.created_by) &&
        (!f.accepted_by || d.accepted_by === f.accepted_by));
}
function getDeal(id) {
    return store_1.db.deals.find((d) => d.deal_id === id);
}
function createDeal(input) {
    const grid = store_1.db.grids.find((g) => g.grid_id === input.project_grid_id);
    if (!grid)
        return { error: "no_grid" };
    if (grid.owner_id !== input.created_by)
        return { error: "not_owner" };
    if (!input.title || !(input.allocation > 0))
        return { error: "bad_input" };
    const deal = {
        deal_id: (0, id_1.newId)("deal"),
        project_grid_id: input.project_grid_id,
        created_by: input.created_by,
        title: input.title,
        pitch: input.pitch,
        allocation: input.allocation,
        allocation_token: input.allocation_token ?? "Pulse",
        success_metric: input.success_metric,
        status: "open",
        disclosed: true,
        created_at: (0, id_1.nowISO)(),
    };
    store_1.db.deals.unshift(deal);
    return { deal };
}
function acceptDeal(id, user_id) {
    const d = getDeal(id);
    if (!d)
        return { error: "not_found" };
    if (d.status !== "open")
        return { error: "not_open" };
    if (d.created_by === user_id)
        return { error: "cannot_accept_own" };
    d.accepted_by = user_id;
    d.status = "accepted";
    return { deal: d };
}
function deliverDeal(id, user_id, proof) {
    const d = getDeal(id);
    if (!d)
        return { error: "not_found" };
    if (d.accepted_by !== user_id)
        return { error: "not_acceptor" };
    if (d.status !== "accepted" && d.status !== "delivering")
        return { error: "bad_state" };
    d.proof = proof;
    d.status = "delivering";
    return { deal: d };
}
function verifyDeal(id, user_id) {
    const d = getDeal(id);
    if (!d)
        return { error: "not_found" };
    if (d.created_by !== user_id)
        return { error: "only_project_owner" };
    if (d.status !== "delivering")
        return { error: "not_delivering" };
    d.status = "settled";
    if (d.accepted_by) {
        Pulse.recordEvent({
            target_type: "user",
            target_id: d.accepted_by,
            user_id,
            action_type: "campaign_completed",
            weight: Math.max(5, Math.min(100, Math.round(d.allocation / 500))),
            reason: `Delivered campaign "${d.title}"`,
            verification_source: `project:${d.created_by}`,
            dimension: "creator",
        });
    }
    Pulse.recordEvent({ target_type: "grid", target_id: d.project_grid_id, action_type: "campaign_completed", weight: 15, reason: `Campaign "${d.title}" settled`, verification_source: "auto" });
    return { deal: d };
}
/** Echo matchmaking — community Grids ranked by audience size. */
function suggestGrids(limit = 5) {
    return store_1.db.grids
        .filter((g) => (g.grid_type ?? "community") === "community")
        .sort((a, b) => (b.member_count || 0) - (a.member_count || 0))
        .slice(0, limit)
        .map((g) => ({ grid_id: g.grid_id, slug: g.slug, name: g.name, members: g.member_count, pulse: g.pulse_score }));
}
