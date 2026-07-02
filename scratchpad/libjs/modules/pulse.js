"use strict";
/**
 * PulseCanister — records Pulse events, applies weighted deltas to targets,
 * and exposes an explainable Pulse v1 weighting. Every event carries a
 * human-readable `reason` (spec: "Every Pulse change should show a reason").
 *
 * v2: user events also update the multi-dimensional reputation ledger
 * (total + per-dimension) alongside the legacy single `pulse_score`, so
 * builder/backer/reviewer/creator reputation can be tracked separately.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordEvent = recordEvent;
exports.forTarget = forTarget;
exports.recent = recent;
exports.weightForApproval = weightForApproval;
const store_1 = require("../store");
const id_1 = require("../id");
function recordEvent(input) {
    const event = {
        event_id: (0, id_1.newId)("pulse"),
        timestamp: (0, id_1.nowISO)(),
        ...input,
    };
    store_1.db.pulseEvents.unshift(event);
    applyWeight(input.target_type, input.target_id, input.weight, input.dimension);
    return event;
}
function applyWeight(type, id, weight, dimension) {
    if (type === "user") {
        const u = store_1.db.users.find((u) => u.id === id);
        if (u) {
            u.pulse_score += weight;
            if (!u.reputation)
                u.reputation = { total: 0, by_dimension: {} };
            u.reputation.total += weight;
            if (dimension)
                u.reputation.by_dimension[dimension] = (u.reputation.by_dimension[dimension] ?? 0) + weight;
        }
    }
    else if (type === "grid") {
        const g = store_1.db.grids.find((g) => g.grid_id === id);
        if (g)
            g.pulse_score += weight;
    }
    else if (type === "subgrid") {
        const s = store_1.db.subgrids.find((s) => s.subgrid_id === id);
        if (s)
            s.pulse_score += weight;
    }
    else if (type === "agent") {
        const a = store_1.db.agents.find((a) => a.agent_id === id);
        if (a) {
            if (!a.reputation)
                a.reputation = { total: 0, by_dimension: {} };
            a.reputation.total += weight;
        }
    }
}
function forTarget(type, id) {
    return store_1.db.pulseEvents.filter((e) => e.target_type === type && e.target_id === id);
}
function recent(limit = 10) {
    return store_1.db.pulseEvents.slice(0, limit);
}
/**
 * Pulse v1 (explainable). Weight for an approved deliverable =
 * base reward × quality multiplier (0.5..1.2).
 */
function weightForApproval(taskReward, qualityScore) {
    const q = Math.max(0, Math.min(100, qualityScore));
    const multiplier = 0.5 + (q / 100) * 0.7; // 0.50 .. 1.20
    const weight = Math.round(taskReward * multiplier);
    return { weight, reason: `${taskReward} base × ${multiplier.toFixed(2)} quality` };
}
