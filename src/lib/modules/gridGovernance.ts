/**
 * Grid-member governance — a Grid's members vote on Grid-level decisions
 * (feature a post, or an advisory call). Distinct from the two other governance
 * surfaces: protocol governance is GRID-locked + global ([[governance]]); milestone
 * governance is backing-weighted ([[genesis]]). This one is **reputation-weighted +
 * member-scoped** — no token lock, merit decides — true to "earned, not bought".
 * A passed `feature_post` proposal pins the post (the community curates its feed).
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import type { GridProposal, GridProposalKind, GridVote } from "../types";

const VOTE_WINDOW_DAYS = 3;

const repOf = (uid: string): number => {
  const u = db.users.find((x) => x.id === uid);
  return Math.max(1, Math.round(Math.max(u?.pulse_score ?? 0, u?.reputation?.total ?? 0)));
};
const isMember = (grid_id: string, uid: string): boolean => {
  const g = db.grids.find((x) => x.grid_id === grid_id);
  return g?.owner_id === uid || !!db.users.find((u) => u.id === uid)?.joined_grids?.includes(grid_id);
};
const isAdmin = (grid_id: string, uid: string): boolean => {
  const g = db.grids.find((x) => x.grid_id === grid_id);
  if (g?.owner_id === uid) return true;
  const r = db.users.find((u) => u.id === uid)?.roles_by_grid?.find((x) => x.grid_id === grid_id)?.role;
  return r === "GridFounder" || r === "Admin";
};

function proposals(): GridProposal[] {
  return (db.gridProposals ??= []);
}
function votes(): GridVote[] {
  return (db.gridVotes ??= []);
}

/** Quorum scales with the Grid's real (on-record) membership, min 2 participants. */
function quorumFor(grid_id: string): number {
  const n = db.users.filter((u) => u.joined_grids?.includes(grid_id)).length + 1; // +1 ≈ owner
  return Math.max(2, Math.ceil(n * 0.25));
}

export function listProposals(grid_id: string): GridProposal[] {
  return proposals()
    .filter((p) => p.grid_id === grid_id)
    .sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || Date.parse(b.created_at) - Date.parse(a.created_at));
}
export function getProposal(id: string): GridProposal | undefined {
  return proposals().find((p) => p.proposal_id === id);
}
export function myVote(proposal_id: string, voter_id: string): GridVote | undefined {
  return votes().find((v) => v.proposal_id === proposal_id && v.voter_id === voter_id);
}

export interface CreateGridProposalInput { kind?: GridProposalKind; title: string; summary?: string; target_post_id?: string; }
export function createProposal(grid_id: string, proposer_id: string, input: CreateGridProposalInput): { proposal?: GridProposal; error?: string } {
  if (!db.grids.find((g) => g.grid_id === grid_id)) return { error: "no_grid" };
  if (!isMember(grid_id, proposer_id)) return { error: "not_member" };
  const title = (input.title ?? "").trim();
  if (!title) return { error: "title_required" };
  const kind: GridProposalKind = input.kind === "feature_post" ? "feature_post" : "general";
  if (kind === "feature_post" && !(db.gridPosts ?? []).some((p) => p.post_id === input.target_post_id && p.grid_id === grid_id)) return { error: "bad_post" };
  const p: GridProposal = {
    proposal_id: newId("gprop"),
    grid_id,
    kind,
    title: title.slice(0, 120),
    summary: (input.summary ?? "").trim().slice(0, 400),
    proposer_id,
    status: "open",
    for_weight: 0,
    against_weight: 0,
    voters: 0,
    quorum_votes: quorumFor(grid_id),
    target_post_id: kind === "feature_post" ? input.target_post_id : undefined,
    closes_at: new Date(Date.now() + VOTE_WINDOW_DAYS * 86_400_000).toISOString(),
    created_at: nowISO(),
  };
  proposals().push(p);
  return { proposal: p };
}

/** Cast a reputation-weighted FOR/AGAINST vote (members only, one per voter). */
export function vote(proposal_id: string, voter_id: string, support: boolean): { proposal?: GridProposal; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  if (p.status !== "open") return { error: "not_open" };
  if (!isMember(p.grid_id, voter_id)) return { error: "not_member" };
  if (myVote(proposal_id, voter_id)) return { error: "already_voted" };
  const weight = repOf(voter_id);
  votes().push({ proposal_id, voter_id, support, weight, at: nowISO() });
  if (support) p.for_weight += weight;
  else p.against_weight += weight;
  p.voters += 1;
  return { proposal: p };
}

function enact(p: GridProposal): string {
  if (p.kind === "feature_post" && p.target_post_id) {
    const post = (db.gridPosts ?? []).find((x) => x.post_id === p.target_post_id);
    if (!post) return "Post no longer exists — nothing to feature.";
    post.pinned = true;
    p.executed = true;
    return `Enacted — featured "${post.title ?? "untitled"}" on the Grid feed.`;
  }
  return "Advisory — recorded, no automatic action.";
}

/** Tally → passed (quorum met AND FOR-weight > AGAINST-weight) / rejected; enact on pass. */
export function resolve(proposal_id: string, by_user_id?: string): { proposal?: GridProposal; passed?: boolean; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  if (p.status !== "open") return { error: "already_resolved" };
  if (by_user_id && !isAdmin(p.grid_id, by_user_id) && p.proposer_id !== by_user_id) return { error: "not_allowed" };
  p.status = p.voters >= p.quorum_votes && p.for_weight > p.against_weight ? "passed" : "rejected";
  p.resolved_at = nowISO();
  if (p.status === "passed") p.execution_note = enact(p);
  return { proposal: p, passed: p.status === "passed" };
}

/** Enriched view for the UI. */
export function proposalView(p: GridProposal, user_id?: string) {
  const mv = user_id ? myVote(p.proposal_id, user_id) : undefined;
  const total = p.for_weight + p.against_weight;
  const post = p.target_post_id ? (db.gridPosts ?? []).find((x) => x.post_id === p.target_post_id) : undefined;
  return {
    ...p,
    total_weight: total,
    for_pct: total > 0 ? Math.round((p.for_weight / total) * 100) : 0,
    against_pct: total > 0 ? Math.round((p.against_weight / total) * 100) : 0,
    my_vote: mv ? { support: mv.support, weight: mv.weight } : null,
    target_post_title: post ? post.title ?? "(untitled)" : undefined,
  };
}
