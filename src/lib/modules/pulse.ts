/**
 * PulseCanister — records Pulse events, applies weighted deltas to targets,
 * and exposes an explainable Pulse v1 weighting. Every event carries a
 * human-readable `reason` (spec: "Every Pulse change should show a reason").
 *
 * v2: user events also update the multi-dimensional reputation ledger
 * (total + per-dimension) alongside the legacy single `pulse_score`, so
 * builder/backer/reviewer/creator reputation can be tracked separately.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import type { PulseActionType, PulseEvent, PulseTargetType, ReputationDimension } from "../types";

export interface RecordInput {
  target_type: PulseTargetType;
  target_id: string;
  user_id?: string;
  action_type: PulseActionType;
  weight: number;
  reason: string;
  verification_source: string;
  dimension?: ReputationDimension;
}

export function recordEvent(input: RecordInput): PulseEvent {
  const event: PulseEvent = {
    event_id: newId("pulse"),
    timestamp: nowISO(),
    ...input,
  };
  db.pulseEvents.unshift(event);
  applyWeight(input.target_type, input.target_id, input.weight, input.dimension);
  return event;
}

function applyWeight(type: PulseTargetType, id: string, weight: number, dimension?: ReputationDimension) {
  const floor = (n: number) => Math.max(0, n); // reputation never goes negative — a penalty caps at zeroing it out
  if (type === "user") {
    const u = db.users.find((u) => u.id === id);
    if (u) {
      u.pulse_score = floor(u.pulse_score + weight);
      if (!u.reputation) u.reputation = { total: 0, by_dimension: {} };
      u.reputation.total = floor(u.reputation.total + weight);
      if (dimension) u.reputation.by_dimension[dimension] = floor((u.reputation.by_dimension[dimension] ?? 0) + weight);
    }
  } else if (type === "grid") {
    const g = db.grids.find((g) => g.grid_id === id);
    if (g) g.pulse_score = floor(g.pulse_score + weight);
  } else if (type === "subgrid") {
    const s = db.subgrids.find((s) => s.subgrid_id === id);
    if (s) s.pulse_score = floor(s.pulse_score + weight);
  } else if (type === "agent") {
    const a = db.agents.find((a) => a.agent_id === id);
    if (a) {
      if (!a.reputation) a.reputation = { total: 0, by_dimension: {} };
      a.reputation.total = floor(a.reputation.total + weight);
      if (dimension) a.reputation.by_dimension[dimension] = floor((a.reputation.by_dimension[dimension] ?? 0) + weight); // V6: agent dimension was never populated
    }
  }
}

export function forTarget(type: PulseTargetType, id: string): PulseEvent[] {
  return db.pulseEvents.filter((e) => e.target_type === type && e.target_id === id);
}

export function recent(limit = 10): PulseEvent[] {
  return db.pulseEvents.slice(0, limit);
}

/**
 * Pulse v1 (explainable). Weight for an approved deliverable =
 * base reward × quality multiplier (0.5..1.2).
 */
export function weightForApproval(taskReward: number, qualityScore: number): { weight: number; reason: string } {
  const q = Math.max(0, Math.min(100, qualityScore));
  const multiplier = 0.5 + (q / 100) * 0.7; // 0.50 .. 1.20
  const weight = Math.round(taskReward * multiplier);
  return { weight, reason: `${taskReward} base × ${multiplier.toFixed(2)} quality` };
}
