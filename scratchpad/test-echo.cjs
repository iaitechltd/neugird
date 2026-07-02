/* In-process Stage-1 verification: Echo build → track record → GridX → GenesisX.
   Runs against a FRESH seeded store (cwd set to scratch so no snapshot loads). */
const path = require("path");
const SCRATCH = __dirname;
process.chdir(SCRATCH); // store reads cwd for its snapshot → none here → fresh seed()

const M = require(path.join(SCRATCH, "libjs/modules/index.js"));
const { Echo, GridX, Genesis, Users } = M;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const uid = "usr_neo"; // seeded founder, pulse 842 → can propose
const builderBefore = Users.getUser(uid).reputation?.by_dimension?.builder ?? 0;

// 1) Run a build (stubbed codegen, real witnessing)
const build = Echo.runBuild({ owner_id: uid, prompt: "Build a Solana yield vault with auto-compounding" });
ok("build created + status built", build && build.status === "built", build && build.build_id);
ok("stack detected = Solana program", build.stack.includes("Solana") && build.artifact.kind === "program", build.stack.join(","));
ok("proof-of-build attestation sealed", /^ngpob:[0-9a-f]{8}$/.test(build.artifact.proof_of_build || ""), build.artifact.proof_of_build);
ok("witnessed step log present", Array.isArray(build.steps) && build.steps.length >= 6, `${build.steps.length} steps`);
ok("built_with_echo flag set", build.artifact.built_with_echo === true);

// 2) Build credits builder reputation (proof of build → track record)
const builderAfter = Users.getUser(uid).reputation?.by_dimension?.builder ?? 0;
ok("builder reputation increased", builderAfter === builderBefore + Echo.BUILD_REPUTATION, `${builderBefore} → ${builderAfter}`);
ok("build appears in user's track record", Echo.buildsForUser(uid).some((b) => b.build_id === build.build_id));

// 3) Ensure home/project Grid (idempotent)
const g1 = GridX.ensureHomeGrid(build.build_id, uid);
ok("home grid created (project type)", g1.grid && g1.created === true && g1.grid.grid_type === "project", g1.grid && g1.grid.slug);
const g2 = GridX.ensureHomeGrid(build.build_id, uid);
ok("ensureHomeGrid is idempotent", g2.created === false && g2.grid.grid_id === g1.grid.grid_id);

// 4) List on GridX → real Product (idempotent), credits creator rep
const creatorBefore = Users.getUser(uid).reputation?.by_dimension?.creator ?? 0;
const listed = GridX.createProductFromBuild(build.build_id, uid);
ok("product created from build", listed.product && listed.product.artifact_ref.artifact_id === build.artifact.artifact_id, listed.product && listed.product.product_id);
ok("product owned by the home grid", listed.product.grid_id === g1.grid.grid_id);
ok("build marked listed + linked", Echo.getBuild(build.build_id).status === "listed" && Echo.getBuild(build.build_id).product_id === listed.product.product_id);
const listed2 = GridX.createProductFromBuild(build.build_id, uid);
ok("listing is idempotent", listed2.product && listed2.product.product_id === listed.product.product_id);
ok("product in GridX feed", GridX.listProducts().some((p) => p.product_id === listed.product.product_id));
ok("product in productsByOwner", GridX.productsByOwner(uid).some((p) => p.product_id === listed.product.product_id));
const creatorAfter = Users.getUser(uid).reputation?.by_dimension?.creator ?? 0;
ok("creator reputation increased on list", creatorAfter === creatorBefore + GridX.LIST_REPUTATION, `${creatorBefore} → ${creatorAfter}`);

// 5) Take to GenesisX with the build as proof-of-build (reputation-gated)
const r = Genesis.createProposal({ author_id: uid, title: "Fund DeFiVault v1", summary: "Audit + mainnet.", category: "Protocol", ask_amount: 100000, roadmap: [], build_id: build.build_id });
ok("proposal created", !!r.proposal && !r.error, r.error || (r.proposal && r.proposal.proposal_id));
ok("proposal carries mvp_ref = build artifact", r.proposal.mvp_ref && r.proposal.mvp_ref.artifact_id === build.artifact.artifact_id);
ok("build linked to proposal", Echo.getBuild(build.build_id).proposal_id === r.proposal.proposal_id);

// 6) Negative paths
const notOwner = GridX.createProductFromBuild(build.build_id, "usr_trinity");
ok("non-owner cannot list a build", notOwner.error === "not_owner", notOwner.error);
const fresh = Users.upsertByWallet("FreshWalletNoRep1111111111111111111111111111");
const gate = Genesis.createProposal({ author_id: fresh.id, title: "x", summary: "", category: "x", ask_amount: 1000, roadmap: [] });
ok("low-rep user is funding-gated", gate.error === "insufficient_reputation", gate.error);
const missing = Echo.getBuild("build_nope");
ok("getBuild(unknown) → undefined", missing === undefined);

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
