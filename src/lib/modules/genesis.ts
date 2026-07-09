/**
 * Fund — reputation-gated funding with milestone-escrowed treasuries.
 *
 *   propose (must have earned reputation) → backers fund → on a FULL raise a
 *   PROJECT Grid spawns with a treasury + milestones → founder delivers each
 *   milestone → backers approve (weighted by stake) → the tranche releases.
 *
 * This is the "merit → funding" core: who gets funded is decided by a verifiable
 * track record, not connections. Pre-treasury, amounts are accounting units.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import { Vault } from "../chain";
import * as Referrals from "./referrals";
import * as Pulse from "./pulse";
import * as GridRegistry from "./gridRegistry";
import * as Echo from "./echo";
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { Backing, Milestone, MilestoneDraft, Proposal, ProposalStatus, Treasury } from "../types";

export const PROPOSE_REPUTATION_MIN = 100;

/** Escrow sink for open-raise backings — funds sit here until the raise fills
 *  (→ the project treasury) or the raise fails (→ refund path). */
export const GENESIS_ESCROW = "neugrid:genesis-escrow";

export function reputationOf(user_id: string): number {
  const u = db.users.find((u) => u.id === user_id);
  if (!u) return 0;
  // headline Pulse (legacy seed score) and the new multi-dim ledger both count
  return Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0);
}
/** Raising is EARNED (the mechanism's spine): you need the reputation floor AND
 *  at least one real build — backers fund working software from proven people,
 *  not pitch decks. The board CTA only appears once both hold. */
export function canPropose(user_id: string): boolean {
  const hasBuild = db.builds.some((b) => b.owner_id === user_id);
  return hasBuild && reputationOf(user_id) >= PROPOSE_REPUTATION_MIN;
}

/** When this raise's funding window ends (legacy proposals derive from created_at). */
export function closesAtOf(p: Proposal): string {
  return p.closes_at ?? new Date(Date.parse(p.created_at) + Params.get("genesis_raise_days") * 86_400_000).toISOString();
}

/**
 * Settle raise windows: an OPEN proposal past its close that never filled goes
 * `expired`, and every escrowed backing refunds to its backer (real USDC back
 * out of the Genesis escrow). Runs on every read + the daily cron, mirroring
 * governance auto-resolve — locks never strand on a quiet deployment.
 */
export function sweepExpiredRaises(): { expired: number; refunded: number } {
  const now = Date.now();
  let expired = 0, refunded = 0;
  for (const p of db.proposals) {
    if (p.status !== "open" || Date.parse(closesAtOf(p)) > now) continue;
    p.status = "expired";
    expired++;
    for (const b of db.backings.filter((x) => x.round_id === p.proposal_id && !x.refunded)) {
      // pre-escrow (legacy) backings have nothing in the sink — mark them refunded
      // without a wallet movement so they can't double-count later.
      if (Wallets.debitUsdc(GENESIS_ESCROW, b.amount)) {
        Wallets.creditUsdc(b.backer_id, b.amount);
        db.settlements.push({
          settlement_id: newId("setl"), payer_id: GENESIS_ESCROW, payee: b.backer_id,
          resource: `genesis_refund:${p.proposal_id}`, amount: b.amount, asset: "USDC",
          network: "neugrid", scheme: "exact", proof: `genesis:${b.backing_id}`, status: "settled", created_at: nowISO(),
        });
      }
      b.refunded = true;
      refunded++;
    }
    Pulse.recordEvent({ target_type: "user", target_id: p.author_id, action_type: "campaign_completed", weight: 0, reason: `Raise "${p.title}" expired unfilled — backers refunded`, verification_source: "auto" });
    void Vault.expire(p); // chain mirror
  }
  return { expired, refunded };
}

export function listProposals(filter: { status?: ProposalStatus; author_id?: string } = {}): Proposal[] {
  sweepExpiredRaises(); // reads settle expiry, the cron is the zero-traffic backstop
  return db.proposals.filter((p) => (!filter.status || p.status === filter.status) && (!filter.author_id || p.author_id === filter.author_id));
}
export function getProposal(id: string): Proposal | undefined {
  return db.proposals.find((p) => p.proposal_id === id);
}
export function raisedFor(proposal_id: string): number {
  return db.backings.filter((b) => b.round_id === proposal_id && !b.refunded).reduce((s, b) => s + b.amount, 0);
}
export function backersFor(proposal_id: string): Backing[] {
  return db.backings.filter((b) => b.round_id === proposal_id && !b.refunded);
}
export function hasBacked(proposal_id: string, user_id: string): boolean {
  return db.backings.some((b) => b.round_id === proposal_id && b.backer_id === user_id && !b.refunded);
}

export interface CreateProposalInput {
  author_id: string;
  title: string;
  summary: string;
  category: string;
  ask_amount: number;
  roadmap: MilestoneDraft[];
  build_id?: string; // an Echo build to attach as the MVP (proof-of-build)
}
export function createProposal(input: CreateProposalInput): { proposal?: Proposal; error?: string } {
  if (!canPropose(input.author_id)) return { error: "insufficient_reputation" };
  if (!input.title || !(input.ask_amount > 0)) return { error: "bad_input" };
  const proposal: Proposal = {
    proposal_id: newId("prop"),
    author_id: input.author_id,
    title: input.title,
    summary: input.summary,
    category: input.category,
    roadmap: input.roadmap.length ? input.roadmap : [{ title: "Deliver v1", description: "Ship the first version.", amount: input.ask_amount }],
    ask_amount: input.ask_amount,
    status: "open",
    endorsements: [],
    closes_at: new Date(Date.now() + Params.get("genesis_raise_days") * 86_400_000).toISOString(),
    created_at: nowISO(),
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

  db.proposals.unshift(proposal);
  void Vault.create(proposal); // chain mirror — guarded, Stage-1 stands on failure
  return { proposal };
}

export function fundProposal(proposal_id: string, backer_id: string, amount: number): { proposal?: Proposal; raised?: number; spawned_grid_id?: string; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  if (p.status !== "open") return { error: "not_open" };
  if (!(amount > 0)) return { error: "bad_amount" };
  if (backer_id === p.author_id) return { error: "self_backing" }; // enforced here, not just hidden in the UI
  // REAL money: a backing debits the backer's USDC into the Genesis escrow —
  // it becomes the project treasury on a full raise, milestone-gated thereafter.
  if (!Wallets.debitUsdc(backer_id, amount)) return { error: "insufficient_usdc" };
  Wallets.creditUsdc(GENESIS_ESCROW, amount);

  db.backings.push({ backing_id: newId("back"), round_id: proposal_id, grid_id: "", backer_id, amount, created_at: nowISO() });
  Referrals.checkVerify(backer_id); // a real backing = a verified first action
  void Vault.back(p, amount); // chain mirror
  const raised = raisedFor(proposal_id);
  if (raised < p.ask_amount) return { proposal: p, raised };

  // Fully funded → spawn the project Grid + treasury + milestones (the recursion)
  const grid = GridRegistry.createGrid({ owner_id: p.author_id, name: p.title, category: p.category, description: p.summary, grid_type: "project" });
  grid.lifecycle_stage = "building";
  grid.spawned_from = { origin: "proposal", proposal_id };
  const treasury: Treasury = { treasury_id: newId("tre"), grid_id: grid.grid_id, total_committed: raised, total_released: 0, balance: raised, created_at: nowISO() };
  db.treasuries.push(treasury);
  grid.treasury_id = treasury.treasury_id;
  const ms: Milestone[] = p.roadmap.map((m, i) => ({
    milestone_id: newId("mile"), treasury_id: treasury.treasury_id, grid_id: grid.grid_id,
    title: m.title, description: m.description, amount: m.amount, order: i, status: "pending", created_at: nowISO(),
  }));
  db.milestones.push(...ms);
  db.backings.filter((b) => b.round_id === proposal_id).forEach((b) => (b.grid_id = grid.grid_id));
  p.status = "funded";

  Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "campaign_completed", weight: 50, reason: `Funded: raised ${raised} for "${p.title}"`, verification_source: "auto" });
  for (const b of backersFor(proposal_id)) {
    Pulse.recordEvent({ target_type: "user", target_id: b.backer_id, action_type: "raise_backed", weight: 10, reason: `Backed "${p.title}" to a full raise`, verification_source: "auto", dimension: "backer" });
  }
  return { proposal: p, raised, spawned_grid_id: grid.grid_id };
}

export function listMilestones(grid_id: string): Milestone[] {
  return db.milestones.filter((m) => m.grid_id === grid_id).sort((a, b) => a.order - b.order);
}
export function getMilestone(id: string): Milestone | undefined {
  return db.milestones.find((m) => m.milestone_id === id);
}

/** The founder (grid owner) a milestone belongs to — the subject of its credential. */
export function ownerOfMilestone(milestone_id: string): string | undefined {
  const m = getMilestone(milestone_id);
  return m ? db.grids.find((g) => g.grid_id === m.grid_id)?.owner_id : undefined;
}

export function submitMilestone(milestone_id: string, user_id: string, proof?: string): { milestone?: Milestone; error?: string } {
  const m = getMilestone(milestone_id);
  if (!m) return { error: "not_found" };
  const grid = db.grids.find((g) => g.grid_id === m.grid_id);
  if (!grid || grid.owner_id !== user_id) return { error: "only_founder" };
  if (m.status !== "pending" && m.status !== "rejected") return { error: "bad_state" };
  m.status = "submitted";
  m.updated_at = nowISO(); // milestone activity — resets the stall clock
  if (proof) m.deliverable = { kind: "link", payload: proof, submitted_at: nowISO() };
  // Open the backer governance vote (clear any prior round on a re-submit).
  db.milestoneApprovals = db.milestoneApprovals.filter((a) => a.milestone_id !== milestone_id);
  m.approval_vote = { for_bps: 0, against_bps: 0, quorum_bps: QUORUM_BPS, closes_at: new Date(Date.now() + 7 * 86_400_000).toISOString() };
  return { milestone: m };
}

const QUORUM_BPS = 5000; // 50% of the weighted backing stake decides (for OR against)

/** Reputation-credibility multiplier on a backer's vote weight (the "reputation-
 *  informed" half of the milestone vote). Caps at +50% for a 1000+-rep backer. */
function repMultiplier(user_id: string): number {
  return 1 + Math.min(reputationOf(user_id) / 1000, 0.5);
}
/** Weighted stake a backer carries in a vote = their backing × reputation multiplier. */
function voteWeight(grid_id: string, backer_id: string): number {
  const backing = db.backings.filter((b) => b.grid_id === grid_id && b.backer_id === backer_id).reduce((s, b) => s + b.amount, 0);
  return backing * repMultiplier(backer_id);
}
/** A backer's current vote on a milestone. */
export function myMilestoneVote(milestone_id: string, user_id: string): "for" | "against" | null {
  const a = db.milestoneApprovals.find((x) => x.milestone_id === milestone_id && x.backer_id === user_id);
  return a ? (a.support === false ? "against" : "for") : null;
}

/**
 * Backer governance vote on a milestone release — the spec's "backers vote, weighted
 * by stake, reputation-informed." A backer votes FOR or AGAINST; weight = their backing
 * × reputation. The tranche RELEASES when FOR ≥ 50% of the total weighted stake, and is
 * REJECTED (founder must re-submit) when AGAINST ≥ 50%. Re-votable until decided.
 */
export function voteMilestone(milestone_id: string, voter_id: string, support: boolean): { milestone?: Milestone; released?: boolean; rejected?: boolean; for_pct?: number; against_pct?: number; error?: string } {
  const m = getMilestone(milestone_id);
  if (!m) return { error: "not_found" };
  if (m.status !== "submitted") return { error: "not_submitted" };
  if (!db.backings.some((b) => b.grid_id === m.grid_id && b.backer_id === voter_id)) return { error: "not_a_backer" };

  const existing = db.milestoneApprovals.find((a) => a.milestone_id === milestone_id && a.backer_id === voter_id);
  if (existing) existing.support = support;
  else db.milestoneApprovals.push({ milestone_id, backer_id: voter_id, support });
  m.updated_at = nowISO(); // vote activity — resets the stall clock

  // Weighted tally over TOTAL weighted backing (so 50% = quorum AND majority in one).
  const backerIds = new Set(db.backings.filter((b) => b.grid_id === m.grid_id).map((b) => b.backer_id));
  const total = [...backerIds].reduce((s, bid) => s + voteWeight(m.grid_id, bid), 0);
  const votes = db.milestoneApprovals.filter((a) => a.milestone_id === milestone_id);
  const forW = votes.filter((a) => a.support !== false).reduce((s, a) => s + voteWeight(m.grid_id, a.backer_id), 0);
  const againstW = votes.filter((a) => a.support === false).reduce((s, a) => s + voteWeight(m.grid_id, a.backer_id), 0);
  const forPct = total > 0 ? forW / total : 0;
  const againstPct = total > 0 ? againstW / total : 0;
  m.approval_vote = { for_bps: Math.round(forPct * 10000), against_bps: Math.round(againstPct * 10000), quorum_bps: QUORUM_BPS, passed: forPct >= 0.5 ? true : againstPct >= 0.5 ? false : undefined, closes_at: m.approval_vote?.closes_at ?? new Date(Date.now() + 7 * 86_400_000).toISOString() };

  if (forPct >= 0.5) {
    m.status = "released";
    const tre = db.treasuries.find((t) => t.treasury_id === m.treasury_id);
    if (tre) { tre.total_released += m.amount; tre.balance = Math.max(0, tre.balance - m.amount); }
    const grid = db.grids.find((g) => g.grid_id === m.grid_id);
    // the tranche is real money: escrowed backer USDC pays out to the founder
    // (legacy pre-escrow treasuries have nothing in the sink — they stay accounting-only)
    if (grid && Wallets.debitUsdc(GENESIS_ESCROW, m.amount)) {
      Wallets.creditUsdc(grid.owner_id, m.amount);
      db.settlements.push({
        settlement_id: newId("setl"), payer_id: GENESIS_ESCROW, payee: grid.owner_id,
        resource: `milestone_release:${m.milestone_id}`, amount: m.amount, asset: "USDC",
        network: "neugrid", scheme: "exact", proof: `genesis:${m.milestone_id}`, status: "settled", created_at: nowISO(),
      });
    }
    if (grid) {
      Pulse.recordEvent({ target_type: "user", target_id: grid.owner_id, action_type: "milestone_approved", weight: 30, reason: `Milestone "${m.title}" released by backer vote`, verification_source: "backers", dimension: "builder" });
      Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "milestone_approved", weight: 20, reason: `Milestone "${m.title}" released`, verification_source: "backers" });
      const prop = grid.spawned_from?.proposal_id ? getProposal(grid.spawned_from.proposal_id) : undefined;
      if (prop) void Vault.release(prop, m.order); // chain mirror
    }
    return { milestone: m, released: true, for_pct: forPct, against_pct: againstPct };
  }
  if (againstPct >= 0.5) {
    m.status = "rejected"; // backers blocked it — the founder addresses + re-submits (else → dispute/refund)
    return { milestone: m, rejected: true, for_pct: forPct, against_pct: againstPct };
  }
  return { milestone: m, released: false, for_pct: forPct, against_pct: againstPct };
}

/** @deprecated — use voteMilestone(id, backer, true). Thin alias kept for the route. */
export function approveMilestone(milestone_id: string, backer_id: string) {
  return voteMilestone(milestone_id, backer_id, true);
}

/** Full read model for a proposal: funding progress, backers, spawned grid, milestones. */
/* ------------------------- funded-stall kill-switch ------------------------ */
// The other half of escrow integrity: a FUNDED project that goes silent
// mid-milestones can't strand the remaining treasury. After `genesis_stall_days`
// with zero milestone activity, any backer may pull the kill-switch (the daily
// cron auto-fires at 2× the window) — the UNRELEASED balance returns to backers
// pro-rata and the founder takes a reputation hit.

export interface StallState {
  stalled: boolean;
  last_activity: string; // funding moment or the latest milestone touch
  deadline: string; // when the kill-switch arms
  auto_at: string; // when the cron fires it unprompted (2× window)
  remaining: number; // unreleased treasury balance
}

/** Stall clock for a funded proposal's project. Undefined when not applicable. */
export function stallStateOf(proposal_id: string): StallState | undefined {
  const p = getProposal(proposal_id);
  if (!p || p.status !== "funded") return undefined;
  const grid = db.grids.find((g) => g.spawned_from?.proposal_id === proposal_id);
  if (!grid) return undefined;
  const tre = db.treasuries.find((t) => t.treasury_id === grid.treasury_id);
  if (!tre || tre.balance <= 0) return undefined; // fully released — nothing to strand
  const ms = db.milestones.filter((m) => m.grid_id === grid.grid_id);
  if (ms.some((m) => m.status === "submitted")) return undefined; // a live vote = active, never stalled
  const last = Math.max(Date.parse(grid.created_at), ...ms.map((m) => (m.updated_at ? Date.parse(m.updated_at) : 0)));
  const windowMs = Params.get("genesis_stall_days") * 86_400_000;
  return {
    stalled: Date.now() - last > windowMs,
    last_activity: new Date(last).toISOString(),
    deadline: new Date(last + windowMs).toISOString(),
    auto_at: new Date(last + 2 * windowMs).toISOString(),
    remaining: tre.balance,
  };
}

/** Pull the kill-switch: return the unreleased treasury to backers pro-rata.
 *  `by` must be a backer (or "system:stall-sweep" from the cron backstop). */
export function triggerKillSwitch(proposal_id: string, by: string): { refunded?: number; backers?: number; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  const st = stallStateOf(proposal_id);
  if (!st) return { error: "not_applicable" };
  if (!st.stalled) return { error: "not_stalled" };
  const isSystem = by.startsWith("system:");
  if (!isSystem && !hasBacked(proposal_id, by)) return { error: "not_a_backer" };

  const grid = db.grids.find((g) => g.spawned_from?.proposal_id === proposal_id)!;
  const tre = db.treasuries.find((t) => t.treasury_id === grid.treasury_id)!;
  const backings = db.backings.filter((b) => b.round_id === proposal_id && !b.refunded);
  const totalBacked = backings.reduce((s, b) => s + b.amount, 0);
  const pot = tre.balance;
  let paid = 0;
  for (const b of backings) {
    const share = totalBacked > 0 ? Math.floor((pot * b.amount) / totalBacked * 100) / 100 : 0;
    if (share <= 0) continue;
    // escrow-era raises have the money in the sink; legacy ones stay accounting-only
    if (Wallets.debitUsdc(GENESIS_ESCROW, share)) {
      Wallets.creditUsdc(b.backer_id, share);
      db.settlements.push({
        settlement_id: newId("setl"), payer_id: GENESIS_ESCROW, payee: b.backer_id,
        resource: `genesis_killswitch_refund:${proposal_id}`, amount: share, asset: "USDC",
        network: "neugrid", scheme: "exact", proof: `genesis:${b.backing_id}`, status: "settled", created_at: nowISO(),
      });
    }
    paid += share;
  }
  tre.balance = 0;
  p.status = "refunded";
  grid.lifecycle_stage = "failed";
  void Vault.kill(p); // chain mirror
  for (const m of db.milestones.filter((x) => x.grid_id === grid.grid_id && (x.status === "pending" || x.status === "rejected"))) m.status = "rejected";
  Pulse.recordEvent({ target_type: "user", target_id: grid.owner_id, action_type: "submission_rejected", weight: -40, reason: `Kill-switch: "${p.title}" stalled — unreleased treasury returned to backers`, verification_source: isSystem ? "auto" : "backers", dimension: "builder" });
  Pulse.recordEvent({ target_type: "grid", target_id: grid.grid_id, action_type: "submission_rejected", weight: -30, reason: "Project stalled — treasury refunded", verification_source: "auto" });
  return { refunded: Math.round(paid * 100) / 100, backers: backings.length };
}

/** Cron backstop: auto-fire the kill-switch on projects stalled past 2× the window. */
export function sweepStalledProjects(): { killed: number; refunded: number } {
  let killed = 0, refunded = 0;
  for (const p of db.proposals.filter((x) => x.status === "funded")) {
    const st = stallStateOf(p.proposal_id);
    if (!st?.stalled || Date.parse(st.auto_at) > Date.now()) continue;
    const r = triggerKillSwitch(p.proposal_id, "system:stall-sweep");
    if (!r.error) { killed++; refunded += r.refunded ?? 0; }
  }
  return { killed, refunded };
}

export function proposalView(id: string) {
  sweepExpiredRaises(); // detail reads settle expiry too
  const p = getProposal(id);
  if (!p) return undefined;
  const grid = db.grids.find((g) => g.spawned_from?.proposal_id === id);

  // FOUNDER — the verification surface backers decide on (who is asking for money)
  const author = db.users.find((u) => u.id === p.author_id);
  const founder = {
    id: p.author_id,
    username: author?.username ?? p.author_id,
    reputation: reputationOf(p.author_id),
    credentials: db.attestations.filter((a) => a.subject_id === p.author_id && a.status === "active").length,
    builds: db.builds.filter((b) => b.owner_id === p.author_id).length,
    jobs_done: db.jobs.filter((j) => j.assignee_id === p.author_id && j.status === "paid").length,
    skills: author?.skills ?? [],
  };

  // BUILD / DEMO — resolve the actual Echo build behind mvp_ref (live preview + deployment)
  const build = p.mvp_ref
    ? db.builds.find((b) => b.artifact.artifact_id === p.mvp_ref!.artifact_id || b.build_id === p.mvp_ref!.artifact_id)
    : undefined;
  const buildView = build
    ? {
        build_id: build.build_id, title: build.title, stack: build.stack, version: build.version ?? 1,
        files: build.artifact.files?.length ?? 0,
        has_preview: !!build.artifact.files?.some((f) => f.path === "preview/index.html"),
        deployed_slug: build.deployment?.slug ?? null, // live at /d/<slug>
        product_id: build.product_id ?? null, // listed on GridX
        proof: build.artifact.proof_of_build ?? p.mvp_ref?.proof_of_build ?? null,
      }
    : null;

  // TEAM — the origin/spawned Grid's SubGrids: humans + agents building this
  const relatedGrid = grid ?? (build?.grid_id ? db.grids.find((g) => g.grid_id === build.grid_id) : undefined);
  const team = (relatedGrid ? db.subgrids.filter((s) => s.parent_grid_id === relatedGrid.grid_id) : []).map((s) => ({
    subgrid_id: s.subgrid_id, name: s.name, purpose: s.purpose ?? "",
    members: (s.members ?? []).map((uid) => ({ id: uid, name: db.users.find((u) => u.id === uid)?.username ?? uid })),
    agents: (s.agent_members ?? []).map((aid) => ({ id: aid, name: db.agents.find((a) => a.agent_id === aid)?.name ?? aid })),
  }));

  return {
    proposal: p,
    raised: raisedFor(id),
    backers: backersFor(id).length,
    spawned_grid_id: grid?.grid_id ?? null,
    spawned_grid_slug: grid?.slug ?? null,
    milestones: grid ? listMilestones(grid.grid_id) : [],
    founder,
    build: buildView,
    origin_grid: relatedGrid ? { grid_id: relatedGrid.grid_id, slug: relatedGrid.slug, name: relatedGrid.name, members: relatedGrid.member_count } : null,
    team,
    closes_at: closesAtOf(p),
    refunded: p.status === "expired" ? db.backings.filter((b) => b.round_id === id && b.refunded).reduce((s, b) => s + b.amount, 0) : 0,
    stall: stallStateOf(id) ?? null,
    // the backer upside — advertised BEFORE backing: this share of the project
    // token is reserved for backers pro-rata at Alpha launch (governable Param)
    backer_token_share_bps: Params.get("backer_allocation_bps"),
  };
}
