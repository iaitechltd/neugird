"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMAS = void 0;
exports.forSubject = forSubject;
exports.activeFor = activeFor;
exports.summary = summary;
exports.platformSummary = platformSummary;
exports.sync = sync;
exports.mintNew = mintNew;
const store_1 = require("../store");
const id_1 = require("../id");
const chain_1 = require("../chain");
/** The five badge schemas — the durable achievements worth anchoring on-chain. */
exports.SCHEMAS = {
    proof_of_build: { name: "Proof of Build", dimension: "builder", blurb: "Echo witnessed this build end-to-end." },
    work_delivered: { name: "Work Delivered", dimension: "contributor", blurb: "A Job delivered and verified-paid." },
    milestone_shipped: { name: "Milestone Shipped", dimension: "builder", blurb: "A funded milestone released by backers." },
    project_launched: { name: "Project Launched", dimension: "founder", blurb: "Passed the security-audit gate." },
    agent_trusted: { name: "Agent Trusted", dimension: "agent", blurb: "Earned the trusted tier on a verified track record." },
};
function store() {
    return (store_1.db.attestations ?? (store_1.db.attestations = [])); // defensive: new collection on a pre-existing singleton
}
function forSubject(subject_id) {
    return store()
        .filter((a) => a.subject_id === subject_id)
        .sort((x, y) => Number(y.status === "active") - Number(x.status === "active"));
}
function activeFor(subject_id) {
    return forSubject(subject_id).filter((a) => a.status === "active");
}
function summary(subject_id) {
    const by = {};
    for (const a of activeFor(subject_id))
        by[a.schema] = (by[a.schema] ?? 0) + 1;
    return { total: activeFor(subject_id).length, by };
}
/** Platform-wide credential rollup — reconciles every subject, then aggregates. */
function platformSummary() {
    for (const u of store_1.db.users)
        sync(u.id, "user");
    for (const a of store_1.db.agents)
        sync(a.agent_id, "agent");
    const active = store().filter((x) => x.status === "active");
    const by = {};
    for (const x of active)
        by[x.schema] = (by[x.schema] ?? 0) + 1;
    return { total: active.length, holders: new Set(active.map((x) => x.subject_id)).size, by };
}
const auditFor = (grid_id) => [...store_1.db.audits].reverse().find((a) => a.grid_id === grid_id);
function desiredForUser(uid) {
    const out = [];
    const wallet = store_1.db.users.find((u) => u.id === uid)?.wallet_addresses?.[0];
    for (const b of store_1.db.builds.filter((b) => b.owner_id === uid)) {
        out.push({ schema: "proof_of_build", source_ref: b.build_id, title: b.title, proof_ref: b.artifact?.proof_of_build, wallet,
            fields: { stack: b.stack.join(" · "), kind: b.artifact?.kind ?? "build", witnessed: `${b.steps?.length ?? 0} steps` } });
    }
    for (const j of store_1.db.jobs.filter((j) => j.assignee_id === uid && j.assignee_type !== "agent" && j.status === "paid")) {
        out.push({ schema: "work_delivered", source_ref: j.job_id, title: j.title, proof_ref: j.job_id, wallet,
            fields: { skills: (j.required_skills ?? []).join(" · ") || "—", reward: j.reward_amount, quality: j.verification?.quality_score ?? "—" } });
    }
    const myGrids = new Set(store_1.db.grids.filter((g) => g.owner_id === uid).map((g) => g.grid_id));
    for (const m of store_1.db.milestones.filter((m) => m.status === "released" && myGrids.has(m.grid_id))) {
        const grid = store_1.db.grids.find((g) => g.grid_id === m.grid_id);
        out.push({ schema: "milestone_shipped", source_ref: m.milestone_id, title: m.title, proof_ref: m.released_tx ?? m.milestone_id, wallet,
            fields: { amount: m.amount, project: grid?.name ?? "—" } });
    }
    for (const g of store_1.db.grids.filter((g) => g.owner_id === uid)) {
        const aud = auditFor(g.grid_id);
        if (aud?.status === "passed")
            out.push({ schema: "project_launched", source_ref: g.grid_id, title: g.name, proof_ref: aud.audit_id, wallet,
                fields: { stage: g.lifecycle_stage ?? "alpha", verifier: aud.reviewer_id ?? "—" } });
    }
    return out;
}
function desiredForAgent(aid) {
    const out = [];
    const agent = store_1.db.agents.find((a) => a.agent_id === aid);
    if (!agent)
        return out;
    const wallet = agent.wallet_address;
    const paid = store_1.db.jobs.filter((j) => j.assignee_id === aid && j.assignee_type === "agent" && j.status === "paid");
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
function reconcile(subject_id, subject_kind) {
    const desired = subject_kind === "user" ? desiredForUser(subject_id) : desiredForAgent(subject_id);
    const want = new Set(desired.map((d) => `${d.schema}:${d.source_ref}`));
    const list = store();
    const minted = [];
    for (const d of desired) {
        const key = `${d.schema}:${d.source_ref}`;
        const ex = list.find((a) => a.subject_id === subject_id && `${a.schema}:${a.source_ref}` === key);
        if (ex) {
            if (ex.status !== "active") {
                ex.status = "active";
                ex.revoked_at = undefined;
            }
            continue;
        }
        const att = {
            attestation_id: (0, id_1.newId)("att"), schema: d.schema, subject_id, subject_kind, subject_wallet: d.wallet,
            title: d.title, fields: d.fields, proof_ref: d.proof_ref, source_ref: d.source_ref, status: "active", issued_at: (0, id_1.nowISO)(),
        };
        list.push(att);
        minted.push(att);
        void chain_1.Sas.anchor(att); // mirror now; on-chain mint fills att.onchain async (no-op in memory mode)
    }
    for (const a of list) {
        if (a.subject_id === subject_id && a.status === "active" && !want.has(`${a.schema}:${a.source_ref}`)) {
            a.status = "revoked";
            a.revoked_at = (0, id_1.nowISO)();
            void chain_1.Sas.revoke(a); // in-platform clawback; on-chain burn async (no-op in memory mode)
        }
    }
    return minted;
}
/** Reconcile a subject's badges against current verified state; returns the full set. */
function sync(subject_id, subject_kind) {
    reconcile(subject_id, subject_kind);
    return forSubject(subject_id);
}
/** Reconcile + return ONLY the credentials newly minted by this call — for the
 *  triggering event to report (the live "you earned it" mint). */
function mintNew(subject_id, subject_kind) {
    return reconcile(subject_id, subject_kind);
}
