"use strict";
/**
 * EchoCanister — the integrated build engine.
 *
 * Stage 1: codegen + sandbox are STUBBED. `runBuild` synthesizes a deterministic
 * build (a witnessed step log + an artifact carrying a proof-of-build attestation)
 * from the user's prompt — no model inference, no real sandbox. What IS real is
 * the witnessing: every build is persisted and credits builder reputation, so the
 * "proof of build" becomes part of the verifiable track record (the moat). Swap
 * `synthesize` for real model calls + a sandbox without touching callers.
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
exports.BUILD_REPUTATION = void 0;
exports.runBuild = runBuild;
exports.getBuild = getBuild;
exports.listBuilds = listBuilds;
exports.buildsForUser = buildsForUser;
exports.markListed = markListed;
exports.attachProposal = attachProposal;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
/** Reputation a witnessed build is worth (builder dimension). Tunable. */
exports.BUILD_REPUTATION = 40;
function runBuild(input) {
    const prompt = input.prompt.trim();
    const { stack, kind, deploy } = detectStack(prompt);
    const title = (input.title?.trim() || deriveTitle(prompt)).slice(0, 60);
    const at = (0, id_1.nowISO)();
    const steps = STEP_PLAN.map((s) => ({
        label: s.label,
        detail: s.detail?.(stack),
        at,
    }));
    const artifact = {
        artifact_id: (0, id_1.newId)("art"),
        kind,
        subgrid_id: input.subgrid_id,
        built_with_echo: true,
        proof_of_build: attest(input.owner_id, prompt, stack, steps),
        preview_url: `https://preview.neugrid.io/${kind}`,
        deploy_target: deploy,
        created_at: at,
    };
    const build = {
        build_id: (0, id_1.newId)("build"),
        owner_id: input.owner_id,
        subgrid_id: input.subgrid_id,
        title,
        prompt,
        summary: summarize(title, kind, stack),
        stack,
        status: "built",
        artifact,
        steps,
        created_at: at,
    };
    store_1.db.builds.unshift(build);
    Pulse.recordEvent({
        target_type: "user",
        target_id: input.owner_id,
        user_id: input.owner_id,
        action_type: "build_completed",
        weight: exports.BUILD_REPUTATION,
        reason: `Echo witnessed a build: "${title}"`,
        verification_source: "echo:witness",
        dimension: "builder",
    });
    return build;
}
function getBuild(id) {
    return store_1.db.builds.find((b) => b.build_id === id);
}
function listBuilds(filter = {}) {
    return store_1.db.builds.filter((b) => (!filter.owner_id || b.owner_id === filter.owner_id) && (!filter.status || b.status === filter.status));
}
function buildsForUser(user_id) {
    return listBuilds({ owner_id: user_id });
}
/** Called by GridX once a build is published to a product. */
function markListed(build_id, product_id, grid_id) {
    const b = getBuild(build_id);
    if (!b)
        return;
    b.product_id = product_id;
    b.grid_id = grid_id;
    if (b.status === "built")
        b.status = "listed";
}
/** Called by GenesisX when a proposal is opened from a build (links proof-of-build). */
function attachProposal(build_id, proposal_id) {
    const b = getBuild(build_id);
    if (b)
        b.proposal_id = proposal_id;
}
/* ------------------------- stub synthesis (swap me) ------------------------ */
const STEP_PLAN = [
    { label: "Parsed intent & scoped the build" },
    { label: "Generated system blueprint" },
    { label: "Scaffolded project & dependencies", detail: (s) => s.join(" · ") },
    { label: "Wrote core modules" },
    { label: "Wired data + state layer" },
    { label: "Generated UI from the blueprint" },
    { label: "Ran checks & assembled live preview" },
    { label: "Sealed proof-of-build attestation" },
];
function detectStack(prompt) {
    const p = prompt.toLowerCase();
    const has = (...k) => k.some((x) => p.includes(x));
    if (has("canister", "icp", "internet computer", "motoko"))
        return { stack: ["ICP", "Motoko", "React"], kind: "canister", deploy: "icp" };
    if (has("nft", "mint", "collection", "metaplex"))
        return { stack: ["Solana", "Metaplex", "Next.js"], kind: "bundle", deploy: "devnet" };
    if (has("solana", "anchor", "program", "spl", "defi", "vault", "swap", "amm", "stake", "token"))
        return { stack: ["Solana", "Anchor", "Rust", "Next.js"], kind: "program", deploy: "devnet" };
    if (has("agent", " ai", "bot", "assistant", "llm", "model"))
        return { stack: ["Next.js", "Echo SDK", "TypeScript"], kind: "bundle", deploy: "devnet" };
    return { stack: ["Next.js", "React", "Tailwind"], kind: "frontend", deploy: "devnet" };
}
const KIND_NOUN = {
    program: "on-chain program",
    canister: "canister app",
    frontend: "web app",
    bundle: "dApp bundle",
    repo: "codebase",
};
function deriveTitle(prompt) {
    const words = prompt
        .replace(/^(?:(?:please\s+)?(?:build|make|create|generate|me|us|a|an|the)\s+)+/i, "")
        .split(/\s+/)
        .slice(0, 6)
        .join(" ")
        .replace(/[.,!?]+$/, "");
    const t = words.replace(/\b\w/g, (c) => c.toUpperCase());
    return t || "Untitled Build";
}
function summarize(title, kind, stack) {
    return `${title} — an Echo-built ${KIND_NOUN[kind]} on ${stack.join(", ")}, scaffolded with a live preview and a sealed proof of build.`;
}
/** Deterministic content attestation (NOT a security hash — a witnessing stamp). */
function attest(owner, prompt, stack, steps) {
    const material = [owner, prompt, stack.join(","), steps.map((s) => s.label).join("|")].join("::");
    let h = 5381;
    for (let i = 0; i < material.length; i++)
        h = ((h << 5) + h + material.charCodeAt(i)) >>> 0;
    return `ngpob:${h.toString(16).padStart(8, "0")}`;
}
