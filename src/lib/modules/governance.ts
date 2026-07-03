/**
 * Protocol governance — GRID's 3rd utility (after stake-to-list + Echo compute).
 *
 * GRID holders LOCK GRID to vote FOR/AGAINST protocol-level proposals (parameters,
 * featured listings, treasury use). Vote weight = GRID locked (conviction); the lock
 * RETURNS when the proposal resolves, win or lose. So GRID is the vote weight AND a
 * temporary sink. Same FOR/AGAINST + quorum shape as milestone voting, weighted by
 * GRID held rather than backing stake.
 */

import { db } from "../store";
import { Gov as ChainGov } from "../chain";
import { newId, nowISO } from "../id";
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { GovAction, GovProposal, GovProposalKind, GovVote } from "../types";

export const PROPOSE_MIN_GRID = 1_000; // GRID a proposer must hold (anti-spam)
const VOTE_WINDOW_DAYS = 5;
const quorum = () => Params.get("gov_quorum_grid"); // GOVERNABLE FOR-GRID needed to pass

/** Format a parameter value for a human-readable enactment note. */
function fmtParam(key: string, v: number): string {
  const unit = Params.isKey(key) ? Params.META[key].unit : "grid";
  return unit === "bps" ? `${(v / 100).toFixed(2)}%` : unit === "days" ? `${v.toLocaleString()} day${v === 1 ? "" : "s"}` : `${v.toLocaleString()} GRID`;
}

/** Validate/clamp a proposed action at creation time (bounds enforced here so a
 *  malicious proposal can't set an out-of-range value). */
function normalizeAction(a?: GovAction): { action?: GovAction; error?: string } {
  if (!a) return {};
  if (a.type === "set_param") {
    if (!Params.isKey(a.key)) return { error: "bad_param" };
    const value = Params.clamp(a.key, Number(a.value));
    if (!Number.isFinite(value)) return { error: "bad_value" };
    return { action: { type: "set_param", key: a.key, value } };
  }
  if (a.type === "treasury_transfer") {
    const amount = Number(a.amount);
    if (!(amount > 0)) return { error: "bad_amount" };
    const to = String(a.to || "").trim();
    if (!to) return { error: "bad_recipient" };
    return { action: { type: "treasury_transfer", asset: a.asset === "grid" ? "grid" : "usdc", amount, to } };
  }
  return { error: "bad_action" };
}

/** Enact a PASSED proposal's action against real protocol state. Idempotent per
 *  proposal (resolve only calls it once, when status flips to passed). */
function enact(p: GovProposal): string {
  const a = p.action;
  if (!a) return "Advisory — no automatic action.";
  if (a.type === "set_param" && Params.isKey(a.key)) {
    const { old, value } = Params.set(a.key, a.value);
    p.executed = true;
    return `Enacted — ${Params.META[a.key].label} ${fmtParam(a.key, old)} → ${fmtParam(a.key, value)}`;
  }
  if (a.type === "treasury_transfer") {
    const ok = a.asset === "grid" ? Wallets.debitGrid(Wallets.TREASURY, a.amount) : Wallets.debitUsdc(Wallets.TREASURY, a.amount);
    p.executed = true;
    if (!ok) return `Passed — but the treasury lacks ${a.amount.toLocaleString()} ${a.asset.toUpperCase()}; transfer skipped.`;
    if (a.asset === "grid") Wallets.creditGrid(a.to, a.amount); else Wallets.creditUsdc(a.to, a.amount);
    return `Enacted — ${a.amount.toLocaleString()} ${a.asset.toUpperCase()} sent from the treasury → ${a.to}`;
  }
  return "Advisory — no automatic action.";
}

function proposals(): GovProposal[] {
  return (db.govProposals ??= []);
}
function votes(): GovVote[] {
  return (db.govVotes ??= []);
}

let seeded = false;
/** Lazy-seed a couple of example proposals so the page is alive in the demo. */
function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  if (proposals().length) return;
  const at = nowISO();
  const closes = new Date(Date.now() + VOTE_WINDOW_DAYS * 86_400_000).toISOString();
  const q = quorum();
  proposals().push(
    { proposal_id: "gov_seed1", kind: "param", title: "Lower the Trade trade fee to 0.50%", summary: "Halve the 1% AMM trade fee to deepen liquidity and tighten spreads on graduated markets. If this passes, the next trade is charged 0.50%.", proposer_id: "usr_neo", status: "open", for_grid: 0, against_grid: 0, quorum_grid: q, action: { type: "set_param", key: "tradex_fee_bps", value: 50 }, closes_at: closes, created_at: at },
    { proposal_id: "gov_seed2", kind: "treasury", title: "Fund a 1,500 USDC community build bounty", summary: "Release 1,500 USDC from the protocol treasury (accrued fees) to a public grants pool that rewards open-source builds on NeuGrid.", proposer_id: "usr_trinity", status: "open", for_grid: 0, against_grid: 0, quorum_grid: q, action: { type: "treasury_transfer", asset: "usdc", amount: 1500, to: "neugrid:grants" }, closes_at: closes, created_at: at },
  );
}

export function listProposals(): GovProposal[] {
  sweepExpired(); // reads settle anything past its vote window (auto-resolve at close)
  return [...proposals()].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || Date.parse(b.created_at) - Date.parse(a.created_at));
}
export function getProposal(id: string): GovProposal | undefined {
  sweepExpired(); // also closes the late-vote hole: an expired proposal settles before vote() sees it
  return proposals().find((p) => p.proposal_id === id);
}
export function myVote(proposal_id: string, voter_id: string): GovVote | undefined {
  return votes().find((v) => v.proposal_id === proposal_id && v.voter_id === voter_id);
}

export interface CreateGovInput { kind?: GovProposalKind; title: string; summary?: string; quorum?: number; action?: GovAction; }
export function createProposal(proposer_id: string, input: CreateGovInput): { proposal?: GovProposal; error?: string } {
  ensureSeeded();
  if (Wallets.get(proposer_id).grid < PROPOSE_MIN_GRID) return { error: "need_grid_to_propose" };
  const title = input.title?.trim();
  if (!title) return { error: "title_required" };
  const { action, error } = normalizeAction(input.action);
  if (error) return { error };
  // an executable action pins the kind (param/treasury); otherwise honor the input kind
  const kind: GovProposalKind = action ? (action.type === "set_param" ? "param" : "treasury") : (input.kind ?? "general");
  const p: GovProposal = {
    proposal_id: newId("gov"), kind, title: title.slice(0, 120), summary: (input.summary ?? "").trim().slice(0, 400),
    proposer_id, status: "open", for_grid: 0, against_grid: 0,
    quorum_grid: input.quorum && input.quorum > 0 ? input.quorum : quorum(),
    action,
    closes_at: new Date(Date.now() + VOTE_WINDOW_DAYS * 86_400_000).toISOString(), created_at: nowISO(),
  };
  proposals().push(p);
  void ChainGov.propose(p.proposal_id, p.title, p.quorum_grid, p.closes_at); // chain mirror
  return { proposal: p };
}

/** Lock `grid` and cast a FOR/AGAINST vote — one per voter; weight = GRID locked. */
export function vote(proposal_id: string, voter_id: string, support: boolean, grid: number): { proposal?: GovProposal; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  if (p.status !== "open") return { error: "not_open" };
  if (!(grid > 0)) return { error: "bad_amount" };
  if (myVote(proposal_id, voter_id)) return { error: "already_voted" };
  if (!Wallets.debitGrid(voter_id, grid)) return { error: "insufficient_grid" };
  votes().push({ proposal_id, voter_id, support, grid, at: nowISO() });
  if (support) p.for_grid += grid; else p.against_grid += grid;
  void ChainGov.vote(proposal_id, support, grid); // chain mirror
  return { proposal: p };
}

/** Settle one open proposal: tally → passed/rejected, ENACT the action if it passed,
 *  and RETURN every locked GRID to its voter. Shared by manual resolve + the sweep. */
function settle(p: GovProposal): { passed: boolean; returned: number } {
  p.status = p.for_grid >= p.quorum_grid && p.for_grid > p.against_grid ? "passed" : "rejected";
  p.resolved_at = nowISO();
  // a passed proposal's action takes effect on real protocol state, right now.
  if (p.status === "passed") p.execution_note = enact(p);
  let returned = 0;
  for (const v of votes()) {
    if (v.proposal_id === p.proposal_id && !v.released) {
      v.released = true;
      Wallets.creditGrid(v.voter_id, v.grid);
      returned += v.grid;
    }
  }
  void ChainGov.resolve(p.proposal_id); // chain mirror — settles + reclaims the locks
  return { passed: p.status === "passed", returned };
}

/** Auto-resolve at close: settle every open proposal past its vote window. Runs on
 *  every governance read (a page view settles the state) and on the daily cron (so
 *  locked GRID returns even with zero traffic). */
export function sweepExpired(): { settled: number } {
  ensureSeeded();
  const now = Date.now();
  let settled = 0;
  for (const p of proposals()) {
    if (p.status === "open" && Date.parse(p.closes_at) <= now) {
      settle(p);
      settled += 1;
    }
  }
  return { settled };
}

/** Manually resolve a proposal (early close). Expired ones settle on read anyway. */
export function resolve(proposal_id: string): { proposal?: GovProposal; passed?: boolean; returned?: number; error?: string } {
  const p = getProposal(proposal_id);
  if (!p) return { error: "not_found" };
  if (p.status !== "open") return { error: "already_resolved" };
  const { passed, returned } = settle(p);
  return { proposal: p, passed, returned };
}

/** Enriched view for the UI: tallies, quorum progress, the caller's vote. */
export function proposalView(p: GovProposal, user_id?: string) {
  const mv = user_id ? myVote(p.proposal_id, user_id) : undefined;
  const total = p.for_grid + p.against_grid;
  return {
    ...p,
    total_grid: total,
    for_pct: total > 0 ? Math.round((p.for_grid / total) * 100) : 0,
    against_pct: total > 0 ? Math.round((p.against_grid / total) * 100) : 0,
    quorum_pct: p.quorum_grid > 0 ? Math.min(100, Math.round((p.for_grid / p.quorum_grid) * 100)) : 0,
    voters: votes().filter((v) => v.proposal_id === p.proposal_id).length,
    my_vote: mv ? { support: mv.support, grid: mv.grid } : null,
  };
}
