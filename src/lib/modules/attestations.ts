/**
 * Attestations — NeuGrid's soulbound credential layer.
 *
 * Each durable, independently-verified achievement becomes a non-transferable
 * credential bound to the actor's wallet. This is the on-chain-bound résumé that
 * sits alongside the live (decaying) Pulse score: Pulse gates eligibility in
 * real time; attestations are the permanent, portable, un-fakeable track record.
 *
 * Stage 1 (here): an in-platform mirror — `sync()` reconciles a subject's badges
 * from current verified state (issue earned, revoke lost), idempotently, on read.
 * Stage 2: swap `issue`/`revoke` for Solana Attestation Service calls
 * (createTokenizedAttestation → Token-2022 NonTransferable). The shape is the
 * SAS shape, so callers never change.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import { Sas } from "../chain";
import type { Attestation, AttestationSchemaKey } from "../types";

/** The five badge schemas — the durable achievements worth anchoring on-chain. */
export const SCHEMAS: Record<AttestationSchemaKey, { name: string; dimension: string; blurb: string }> = {
  proof_of_build: { name: "Proof of Build", dimension: "builder", blurb: "Echo witnessed this build end-to-end." },
  work_delivered: { name: "Work Delivered", dimension: "contributor", blurb: "A Job delivered and verified-paid." },
  milestone_shipped: { name: "Milestone Shipped", dimension: "builder", blurb: "A funded milestone released by backers." },
  project_launched: { name: "Project Launched", dimension: "founder", blurb: "Passed the security-audit gate." },
  agent_trusted: { name: "Agent Trusted", dimension: "agent", blurb: "Earned the trusted tier on a verified track record." },
  // threshold badges (audit Wave 3) — the dimensions that earned reputation but
  // could never mint a portable credential
  trusted_backer: { name: "Backer of Delivered Work", dimension: "backer", blurb: "Backed a raise whose milestones actually shipped." },
  verified_trader: { name: "Verified Trader", dimension: "trader", blurb: "A real, sustained trading record on NeuGrid markets." },
  top_creator: { name: "Top Creator", dimension: "creator", blurb: "A listed product with verified 4★+ reviews." },
  trusted_reviewer: { name: "Trusted Reviewer", dimension: "reviewer", blurb: "Multiple security audits verified for the community." },
};

function store(): Attestation[] {
  return (db.attestations ??= []); // defensive: new collection on a pre-existing singleton
}

export function forSubject(subject_id: string): Attestation[] {
  return store()
    .filter((a) => a.subject_id === subject_id)
    .sort((x, y) => Number(y.status === "active") - Number(x.status === "active"));
}

export function activeFor(subject_id: string): Attestation[] {
  return forSubject(subject_id).filter((a) => a.status === "active");
}

export function summary(subject_id: string): { total: number; by: Partial<Record<AttestationSchemaKey, number>> } {
  const by: Partial<Record<AttestationSchemaKey, number>> = {};
  for (const a of activeFor(subject_id)) by[a.schema] = (by[a.schema] ?? 0) + 1;
  return { total: activeFor(subject_id).length, by };
}

/** Platform-wide credential rollup — reconciles every subject, then aggregates. */
export function platformSummary(): { total: number; holders: number; by: Partial<Record<AttestationSchemaKey, number>> } {
  for (const u of db.users) sync(u.id, "user");
  for (const a of db.agents) sync(a.agent_id, "agent");
  const active = store().filter((x) => x.status === "active");
  const by: Partial<Record<AttestationSchemaKey, number>> = {};
  for (const x of active) by[x.schema] = (by[x.schema] ?? 0) + 1;
  return { total: active.length, holders: new Set(active.map((x) => x.subject_id)).size, by };
}

type Desired = { schema: AttestationSchemaKey; source_ref: string; title: string; fields: Record<string, string | number>; proof_ref?: string; wallet?: string };

const auditFor = (grid_id: string) => [...db.audits].reverse().find((a) => a.grid_id === grid_id);

function desiredForUser(uid: string): Desired[] {
  const out: Desired[] = [];
  const wallet = db.users.find((u) => u.id === uid)?.wallet_addresses?.[0];

  for (const b of db.builds.filter((b) => b.owner_id === uid)) {
    out.push({ schema: "proof_of_build", source_ref: b.build_id, title: b.title, proof_ref: b.artifact?.proof_of_build, wallet,
      fields: { stack: b.stack.join(" · "), kind: b.artifact?.kind ?? "build", witnessed: `${b.steps?.length ?? 0} steps` } });
  }
  for (const j of db.jobs.filter((j) => j.assignee_id === uid && j.assignee_type !== "agent" && j.status === "paid")) {
    out.push({ schema: "work_delivered", source_ref: j.job_id, title: j.title, proof_ref: j.job_id, wallet,
      fields: { skills: (j.required_skills ?? []).join(" · ") || "—", reward: j.reward_amount, quality: j.verification?.quality_score ?? "—" } });
  }
  const myGrids = new Set(db.grids.filter((g) => g.owner_id === uid).map((g) => g.grid_id));
  for (const m of db.milestones.filter((m) => m.status === "released" && myGrids.has(m.grid_id))) {
    const grid = db.grids.find((g) => g.grid_id === m.grid_id);
    out.push({ schema: "milestone_shipped", source_ref: m.milestone_id, title: m.title, proof_ref: m.released_tx ?? m.milestone_id, wallet,
      fields: { amount: m.amount, project: grid?.name ?? "—" } });
  }
  for (const g of db.grids.filter((g) => g.owner_id === uid)) {
    const aud = auditFor(g.grid_id);
    if (aud?.status === "passed") out.push({ schema: "project_launched", source_ref: g.grid_id, title: g.name, proof_ref: aud.audit_id, wallet,
      fields: { stage: g.lifecycle_stage ?? "alpha", verifier: aud.reviewer_id ?? "—" } });
  }

  // — threshold badges: derived from the same verified state, reconciled like the rest —
  const myBackings = db.backings.filter((b) => b.backer_id === uid && !b.refunded);
  if (myBackings.some((b) => db.milestones.some((m) => m.grid_id === b.grid_id && m.status === "released"))) {
    out.push({ schema: "trusted_backer", source_ref: `backer:${uid}`, title: "Backer of delivered work", wallet,
      fields: { backings: myBackings.length, delivered: myBackings.filter((b) => db.milestones.some((m) => m.grid_id === b.grid_id && m.status === "released")).length } });
  }
  const myTrades = db.trades.filter((t) => t.user_id === uid);
  if (myTrades.length >= 25) {
    out.push({ schema: "verified_trader", source_ref: `trader:${uid}`, title: "Verified trader", wallet,
      fields: { trades: myTrades.length, volume_usd: Math.round(myTrades.reduce((s, t) => s + (t.quote ?? 0), 0)) } });
  }
  const ownGrids = new Set(db.grids.filter((g) => g.owner_id === uid).map((g) => g.grid_id));
  for (const p of db.products.filter((p) => ownGrids.has(p.grid_id))) {
    const reviews = (db.productReviews ?? []).filter((r) => r.product_id === p.product_id);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    if (reviews.length >= 3 && avg >= 4) out.push({ schema: "top_creator", source_ref: p.product_id, title: p.name, wallet,
      fields: { reviews: reviews.length, rating: Math.round(avg * 10) / 10 } });
  }
  const reviewedAudits = db.audits.filter((a) => a.reviewer_id === uid && a.reviewed_at).length;
  if (reviewedAudits >= 2) {
    out.push({ schema: "trusted_reviewer", source_ref: `reviewer:${uid}`, title: "Trusted reviewer", wallet,
      fields: { audits: reviewedAudits } });
  }
  return out;
}

function desiredForAgent(aid: string): Desired[] {
  const out: Desired[] = [];
  const agent = db.agents.find((a) => a.agent_id === aid);
  if (!agent) return out;
  const wallet = agent.wallet_address;
  const paid = db.jobs.filter((j) => j.assignee_id === aid && j.assignee_type === "agent" && j.status === "paid");

  // earned trust (native agents are trusted by construction — only badge external, earned promotions)
  if (agent.origin === "external" && agent.trust_tier === "trusted") {
    out.push({ schema: "agent_trusted", source_ref: aid, title: agent.name, proof_ref: aid, wallet,
      fields: { verified_jobs: paid.length, bond: agent.bond_amount ?? 0, framework: agent.external_framework ?? "external" } });
  }
  for (const j of paid) {
    out.push({ schema: "work_delivered", source_ref: j.job_id, title: j.title, proof_ref: j.job_id, wallet,
      fields: { skills: (j.required_skills ?? []).join(" · ") || "—", reward: j.reward_amount, quality: j.verification?.quality_score ?? "—" } });
  }
  return out;
}

/**
 * Reconcile one subject's soulbound credentials against current verified state.
 * Idempotent: issues newly-earned badges, revokes ones no longer earned (the
 * in-platform analog of an SAS clawback). Returns the subject's full badge set.
 */
function reconcile(subject_id: string, subject_kind: "user" | "agent"): Attestation[] {
  const desired = subject_kind === "user" ? desiredForUser(subject_id) : desiredForAgent(subject_id);
  const want = new Set(desired.map((d) => `${d.schema}:${d.source_ref}`));
  const list = store();
  const minted: Attestation[] = [];

  for (const d of desired) {
    const key = `${d.schema}:${d.source_ref}`;
    const ex = list.find((a) => a.subject_id === subject_id && `${a.schema}:${a.source_ref}` === key);
    if (ex) {
      if (ex.status !== "active") { ex.status = "active"; ex.revoked_at = undefined; }
      continue;
    }
    const att: Attestation = {
      attestation_id: newId("att"), schema: d.schema, subject_id, subject_kind, subject_wallet: d.wallet,
      title: d.title, fields: d.fields, proof_ref: d.proof_ref, source_ref: d.source_ref, status: "active", issued_at: nowISO(),
    };
    list.push(att);
    minted.push(att);
    void Sas.anchor(att); // mirror now; on-chain mint fills att.onchain async (no-op in memory mode)
  }
  for (const a of list) {
    if (a.subject_id === subject_id && a.status === "active" && !want.has(`${a.schema}:${a.source_ref}`)) {
      a.status = "revoked"; a.revoked_at = nowISO();
      void Sas.revoke(a); // in-platform clawback; on-chain burn async (no-op in memory mode)
    }
  }
  return minted;
}

/** Reconcile a subject's badges against current verified state; returns the full set. */
export function sync(subject_id: string, subject_kind: "user" | "agent"): Attestation[] {
  reconcile(subject_id, subject_kind);
  return forSubject(subject_id);
}

/** Reconcile + return ONLY the credentials newly minted by this call — for the
 *  triggering event to report (the live "you earned it" mint). */
export function mintNew(subject_id: string, subject_kind: "user" | "agent"): Attestation[] {
  return reconcile(subject_id, subject_kind);
}
