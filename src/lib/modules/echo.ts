/**
 * EchoCanister — the integrated build engine.
 *
 * Stage 1.5 (2026-07-02): codegen is REAL when the model brain is active
 * (NEUGRID_BRAIN=claude + ANTHROPIC_API_KEY) — the model writes an actual compact
 * project (real files incl. README + a self-contained interactive preview), the
 * witnessed steps are the real generation log, and the proof-of-build seals a
 * sha256 over the REAL file contents. No brain configured → the deterministic
 * stub stands (sandbox/demo unchanged). If the brain is active but the call fails,
 * the build ERRORS and the GRID is refunded — a fake build is never passed off as
 * real. The witnessing economy (GRID cost → treasury, reputation, credential) is
 * identical on both paths.
 */

import { createHash } from "node:crypto";
import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Referrals from "./referrals";
import * as Wallets from "./wallets";
import * as Rewards from "./rewards";
import * as Params from "./params";
import * as Brain from "../brain";
import { IcpHosting } from "../chain";
import type { Build, BuildArtifactRef, BuildDeployment, BuildFile, BuildStatus, BuildStep } from "../types";

/** Reputation a witnessed build is worth (builder dimension). Tunable. */
export const BUILD_REPUTATION = 40;
/** GRID a build costs — Echo's compute is metered in the platform token. This is
 *  GRID's core UTILITY SINK (→ the treasury): building consumes GRID, and the same
 *  witnessed build EARNS reputation + a GRID allocation back (see [[neugrid-mechanism]]).
 *  The cost is GOVERNABLE — `buildCost()` reads Params; 500 is the default. */
export const BUILD_COST_GRID = 500;
export function buildCost(): number {
  return Params.get("echo_build_cost_grid");
}

export interface RunBuildInput {
  owner_id: string;
  prompt: string;
  title?: string;
  subgrid_id?: string;
  /** The compute cost was already paid in USDC via x402 (the on-ramp for agents
   *  without GRID) — skip the GRID debit. See /api/agent-gateway/x402/build. */
  paid_externally?: boolean;
}

/** sha256 over the REAL generated files — the honest proof-of-build. */
function proofOfFiles(owner: string, prompt: string, files: BuildFile[]): string {
  const h = createHash("sha256");
  h.update(owner).update("\0").update(prompt).update("\0");
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) h.update(f.path).update("\0").update(f.content).update("\0");
  return `ngpob:sha256:${h.digest("hex").slice(0, 24)}`;
}

export async function runBuild(input: RunBuildInput): Promise<{ build?: Build; cost?: number; error?: string }> {
  const prompt = input.prompt.trim();
  // Echo compute is metered in GRID — the platform-token utility sink (governable cost).
  const cost = buildCost();
  // Starter credit pays first (the onboarding scholarship — it burns); only the
  // real-GRID portion of the charge flows to the treasury.
  let charge: Wallets.ComputeCharge | null = null;
  if (!input.paid_externally) {
    charge = Wallets.debitCompute(input.owner_id, cost);
    if (!charge) return { error: "insufficient_grid", cost };
    if (charge.grid > 0) Wallets.creditGrid(Wallets.TREASURY, charge.grid); // → protocol treasury
  }

  const build_id = newId("build");
  let title: string;
  let summary: string;
  let stack: string[];
  let kind: BuildArtifactRef["kind"];
  let deploy: BuildArtifactRef["deploy_target"];
  let steps: BuildStep[];
  let files: BuildFile[] | undefined;
  let preview_url: string | undefined;
  let proof: string;
  const at = nowISO();

  if (Brain.activeBrain()) {
    // REAL codegen — the model writes the project; a failure refunds, never fakes.
    const synth = await Brain.synthesizeBuild(prompt);
    if (!synth) {
      if (charge) {
        if (charge.grid > 0) Wallets.debitGrid(Wallets.TREASURY, charge.grid); // reclaim the credited GRID from the treasury (best-effort reconcile)
        Wallets.refundCompute(input.owner_id, charge); // the user ALWAYS gets their GRID + starter back — never gated on the treasury
      }
      return { error: "synthesis_failed", cost };
    }
    title = (input.title?.trim() || synth.title || deriveTitle(prompt)).slice(0, 60);
    summary = synth.summary.slice(0, 240);
    stack = synth.stack.slice(0, 8);
    kind = synth.kind;
    deploy = kind === "canister" ? "icp" : "devnet";
    steps = synth.steps.map((s) => ({ label: s.label, detail: s.detail, at }));
    files = synth.files;
    if (files.some((f) => f.path === "preview/index.html")) preview_url = `/api/echo/builds/${build_id}/preview`;
    proof = proofOfFiles(input.owner_id, prompt, files);
  } else {
    // No brain configured — the deterministic stub (sandbox/demo) stands, unchanged.
    const d = detectStack(prompt);
    stack = d.stack;
    kind = d.kind;
    deploy = d.deploy;
    title = (input.title?.trim() || deriveTitle(prompt)).slice(0, 60);
    summary = summarize(title, kind, stack);
    steps = STEP_PLAN.map((s) => ({ label: s.label, detail: s.detail?.(stack), at }));
    proof = attest(input.owner_id, prompt, stack, steps);
  }

  const artifact: BuildArtifactRef = {
    artifact_id: newId("art"),
    kind,
    subgrid_id: input.subgrid_id,
    built_with_echo: true,
    proof_of_build: proof,
    files,
    preview_url,
    deploy_target: deploy,
    created_at: at,
  };

  const build: Build = {
    build_id,
    owner_id: input.owner_id,
    subgrid_id: input.subgrid_id,
    title,
    prompt,
    summary,
    stack,
    status: "built",
    artifact,
    steps,
    created_at: at,
  };
  db.builds.unshift(build);

  // A build subsidized by the starter credit earns full reputation + the sealed
  // proof-of-build credential, but NOT GRID allocation — free credit must never
  // mint transferable ownership (else every fresh wallet farms it). A build paid
  // with real GRID (or externally via x402) counts normally.
  const starterFunded = !input.paid_externally && (charge?.starter ?? 0) > 0;
  const realPayment = !!input.paid_externally || (charge?.grid ?? 0) > 0;
  Pulse.recordEvent({
    target_type: "user",
    target_id: input.owner_id,
    user_id: input.owner_id,
    action_type: "build_completed",
    weight: BUILD_REPUTATION,
    reason: `Echo witnessed a build: "${title}"${starterFunded ? " (starter — reputation only)" : ""}`,
    verification_source: "echo:witness",
    dimension: "builder",
    reward_excluded: starterFunded,
  });
  // A referral verifies on a REAL economic action — a free starter build doesn't
  // count (else the starter grant funds a referral-bonus farm).
  if (realPayment) Referrals.checkVerify(input.owner_id);

  return { build, cost };
}

/** GRID a build REVISION costs (the iterate loop) — governable, cheaper than a build. */
export function revisionCost(): number {
  return Params.get("echo_revision_cost_grid");
}

const REVISIONS_MAX = 20;

export interface ReviseBuildInput {
  build_id: string;
  owner_id: string;
  instruction: string;
  /** Who pays the revision cost. Defaults to owner_id (the iterate loop). A Venture
   *  passes its treasury so the company — not the founder's wallet — funds the ship. */
  payer_id?: string;
}

/** The iterate loop: a follow-up instruction revises the CURRENT build — the model
 *  patches the real files, the proof re-seals over the new content, and the version
 *  history records the change. Costs `revisionCost()` GRID (refunded on failure). */
export async function reviseBuild(input: ReviseBuildInput): Promise<{ build?: Build; cost?: number; error?: string }> {
  const build = getBuild(input.build_id);
  if (!build) return { error: "not_found" };
  if (build.owner_id !== input.owner_id) return { error: "not_owner" };
  const files = build.artifact.files;
  if (!files?.length) return { error: "no_files" }; // stub/legacy builds have nothing to revise
  const instruction = input.instruction.trim();
  if (!instruction) return { error: "instruction_required" };
  if (!Brain.activeBrain()) return { error: "brain_inactive" };
  if ((build.revisions?.length ?? 0) >= REVISIONS_MAX) return { error: "too_many_revisions" };

  const cost = revisionCost();
  const payer = input.payer_id ?? input.owner_id;
  const treasuryPays = payer !== input.owner_id; // a Venture treasury (neugrid:ven:*) — plain GRID, no starter credit
  let charge: Wallets.ComputeCharge | null = null;
  if (cost > 0) {
    if (treasuryPays) {
      if (!Wallets.debitGrid(payer, cost)) return { error: "insufficient_grid", cost };
      Wallets.creditGrid(Wallets.TREASURY, cost); // revision fee → protocol sink
      charge = { starter: 0, grid: cost };
    } else {
      charge = Wallets.debitCompute(input.owner_id, cost);
      if (!charge) return { error: "insufficient_grid", cost };
      if (charge.grid > 0) Wallets.creditGrid(Wallets.TREASURY, charge.grid);
    }
  }

  const revised = await Brain.reviseBuild({ title: build.title, summary: build.summary, stack: build.stack, files }, instruction);
  if (!revised) {
    if (charge) {
      if (charge.grid > 0) Wallets.debitGrid(Wallets.TREASURY, charge.grid); // reclaim the credited fee from the sink
      if (treasuryPays) Wallets.creditGrid(payer, cost); // refund the treasury
      else Wallets.refundCompute(input.owner_id, charge); // the user ALWAYS gets their GRID + starter back
    }
    return { error: "synthesis_failed", cost };
  }

  const before = new Map(files.map((f) => [f.path, f.content]));
  const files_changed =
    revised.files.filter((f) => before.get(f.path) !== f.content).length +
    files.filter((f) => !revised.files.some((n) => n.path === f.path)).length; // edits/adds + removals

  const at = nowISO();
  const version = (build.version ?? 1) + 1;
  build.version = version;
  build.summary = (revised.summary || build.summary).slice(0, 240);
  build.stack = revised.stack?.length ? revised.stack.slice(0, 8) : build.stack;
  build.artifact.files = revised.files;
  build.artifact.proof_of_build = proofOfFiles(input.owner_id, `${build.prompt}\n[rev v${version}] ${instruction}`, revised.files);
  if (revised.files.some((f) => f.path === "preview/index.html")) build.artifact.preview_url = `/api/echo/builds/${build.build_id}/preview`;
  (build.revisions ??= []).push({
    version,
    instruction: instruction.slice(0, 300),
    proof: build.artifact.proof_of_build,
    notes: revised.steps.map((s) => s.label).join(" · ").slice(0, 300),
    files_changed,
    at,
  });
  return { build, cost };
}

/* ------------------- Echo ask — Personal / Analyst / Observer ------------------- */
// The last three modes, made real: one grounded Q&A over a LIVE data snapshot the
// server assembles (the user's real position · the platform's real numbers · the
// real event stream). GET the snapshot for the UI rails; POST a question to answer.

export type EchoAskMode = Brain.EchoAskMode;

export function askCost(): number {
  return Params.get("echo_ask_cost_grid");
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const ago = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};

/** The live snapshot for a mode: `context` = the model's grounding text; `snapshot`
 *  = the same facts as JSON for the UI rails. */
export function askSnapshot(mode: EchoAskMode, user_id: string): { context: string; snapshot: Record<string, unknown> } {
  if (mode === "personal") {
    const u = db.users.find((x) => x.id === user_id);
    const bal = Wallets.balances(user_id);
    const reward = Rewards.ledgerFor(user_id);
    const builds = db.builds.filter((b) => b.owner_id === user_id);
    const agents = db.agents.filter((a) => a.owner_id === user_id);
    const working = db.jobs.filter((j) => j.assignee_id === user_id && ["assigned", "in_progress", "submitted"].includes(j.status));
    const proposals = db.proposals.filter((p) => p.author_id === user_id);
    const events = db.pulseEvents.filter((e) => e.target_type === "user" && e.target_id === user_id).slice(0, 8);
    const dims = Object.entries(u?.reputation?.by_dimension ?? {}).map(([k, v]) => `${k} ${n0(v as number)}`).join(", ");
    const context = [
      `USER: ${u?.username ?? user_id}`,
      `REPUTATION: ${n0(u?.reputation?.total ?? 0)} total (${dims || "no dimensions yet"}) · pulse ${n0(u?.pulse_score ?? 0)}`,
      `WALLET: ${n0(bal.usdc)} USDC · ${n0(bal.grid)} GRID · earned GRID allocation ${n0(reward?.sybil_adjusted ?? 0)} (vests at TGE)`,
      `BUILDS (${builds.length} total${builds.length > 6 ? ", newest 6 shown" : ""}): ${builds.slice(0, 6).map((b) => `"${b.title}" v${b.version ?? 1} ${b.status}${b.proposal_id ? " · raising" : ""}${b.product_id ? " · on GridX" : ""}`).join(" | ") || "none"}`,
      `AGENTS (${agents.length} total${agents.length > 6 ? ", top 6 shown" : ""}): ${agents.slice(0, 6).map((a) => `${a.name} (${a.trust_tier ?? "trusted"}, earned ${n0(a.earnings ?? 0)}${a.work?.active ? ", WORKING autonomously" : ""})`).join(" | ") || "none"}`,
      `ACTIVE WORK: ${working.map((j) => `"${j.title}" ${j.status}`).join(" | ") || "none"}`,
      `MY RAISES: ${proposals.map((p) => `"${p.title}" ${p.status} (ask ${n0(p.ask_amount)})`).join(" | ") || "none"}`,
      `RECENT REPUTATION EVENTS: ${events.map((e) => `${e.weight > 0 ? "+" : ""}${e.weight} ${e.reason}`).join(" | ") || "none"}`,
    ].join("\n");
    return {
      context,
      snapshot: {
        reputation: Math.round(u?.reputation?.total ?? 0),
        grid: Math.round(bal.grid),
        usdc: Math.round(bal.usdc),
        allocation: Math.round(reward?.sybil_adjusted ?? 0),
        builds: builds.length,
        agents: agents.length,
        working: working.length,
        raises: proposals.length,
      },
    };
  }

  if (mode === "analyst") {
    const markets = db.markets.map((m) => ({ symbol: m.base_symbol, stage: m.stage, price: m.price ?? 0, liq: Math.round(m.liquidity_usd ?? 0), vol: Math.round(m.volume ?? 0), holders: m.holders ?? 0, status: m.status }));
    const grids = [...db.grids].sort((a, b) => (b.pulse_score ?? 0) - (a.pulse_score ?? 0));
    const openProps = db.proposals.filter((p) => p.status === "open");
    const fundedProps = db.proposals.filter((p) => p.status === "funded");
    const openJobs = db.jobs.filter((j) => j.status === "open");
    const paidJobs = db.jobs.filter((j) => j.status === "paid");
    const agents = db.agents;
    const treasury = Wallets.balances("neugrid:treasury");
    const pool = db.gridPool;
    const gridPrice = pool && pool.grid_reserve > 0 ? pool.usdc_reserve / pool.grid_reserve : 0;
    const x402 = db.settlements.filter((s) => s.payee === "neugrid:treasury");
    const context = [
      `MARKETS (${markets.length}): ${markets.map((m) => `${m.symbol} [${m.stage}${m.status !== "active" ? "/" + m.status : ""}] price ${m.price.toFixed(4)} · liq $${n0(m.liq)} · vol ${n0(m.vol)} · ${m.holders} holders`).join(" | ") || "none"}`,
      `GRID TOKEN: $${gridPrice.toFixed(4)} on the GRID/USDC pool (protocol-owned liquidity $${n0((pool?.usdc_reserve ?? 0) * 2)})`,
      `GRIDS (${grids.length} communities): top — ${grids.slice(0, 5).map((g) => `${g.name} (${g.member_count} members, pulse ${n0(g.pulse_score ?? 0)})`).join(" | ")}`,
      `FUNDING: ${openProps.length} open raises asking ${n0(openProps.reduce((a, p) => a + p.ask_amount, 0))} total · ${fundedProps.length} funded`,
      `JOBS: ${openJobs.length} open · ${paidJobs.length} delivered+paid (volume ${n0(paidJobs.reduce((a, j) => a + j.reward_amount, 0))})`,
      `AGENT ECONOMY: ${agents.length} agents (${agents.filter((a) => a.trust_tier === "trusted").length} trusted) · total agent earnings ${n0(agents.reduce((a, x) => a + (x.earnings ?? 0), 0))}`,
      `PROTOCOL TREASURY: ${n0(treasury.usdc)} USDC · ${n0(treasury.grid)} GRID · x402 payments received: ${x402.length}`,
      `GOVERNABLE PARAMS: ${Params.all().map((p) => `${p.label}=${p.value}${p.overridden ? " (gov-set)" : ""}`).join(" · ")}`,
    ].join("\n");
    return {
      context,
      snapshot: {
        markets,
        grid_price: gridPrice,
        grids: grids.length,
        top_grids: grids.slice(0, 5).map((g) => ({ name: g.name, members: g.member_count, pulse: Math.round(g.pulse_score ?? 0) })),
        open_raises: openProps.length,
        open_jobs: openJobs.length,
        agents: agents.length,
        treasury_usdc: Math.round(treasury.usdc),
      },
    };
  }

  // observer — the merged live event stream, newest first
  const feed: { at: string; line: string; kind: string }[] = [];
  for (const e of db.pulseEvents.slice(0, 14)) feed.push({ at: e.timestamp, kind: "pulse", line: `[reputation] ${e.weight > 0 ? "+" : ""}${e.weight} ${e.action_type} — ${e.reason}` });
  for (const t of db.trades.slice(-10)) feed.push({ at: t.at, kind: "trade", line: `[trade] ${t.side.toUpperCase()} ${n0(t.base)} @ ${t.price.toFixed(4)} (${n0(t.quote)} USDC)` });
  for (const b of db.builds.slice(0, 5)) feed.push({ at: b.created_at, kind: "build", line: `[build] "${b.title}" v${b.version ?? 1} — ${b.status} (${b.artifact.files?.length ?? 0} files)` });
  for (const j of [...db.jobs].sort((a, b) => Date.parse(b.updated_at ?? b.created_at) - Date.parse(a.updated_at ?? a.created_at)).slice(0, 8)) feed.push({ at: j.updated_at ?? j.created_at, kind: "job", line: `[job] "${j.title}" — ${j.status}${j.assignee_type === "agent" ? " (agent worker)" : ""}` });
  for (const s of db.settlements.slice(-5)) feed.push({ at: s.created_at, kind: "x402", line: `[x402] ${s.amount} USDC — ${s.resource} (${s.payer_id} → ${s.payee})` });
  feed.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const top = feed.slice(0, 28);
  const counts = { reputation: db.pulseEvents.length, trades: db.trades.length, jobs: db.jobs.length, builds: db.builds.length, payments: db.settlements.length };
  const context = [
    `EVENT COUNTS (all-time): ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    `RECENT EVENTS (newest first):`,
    ...top.map((f) => `${ago(f.at)} ago · ${f.line}`),
  ].join("\n");
  return { context, snapshot: { counts, feed: top.map((f) => ({ ago: ago(f.at), kind: f.kind, line: f.line })) } };
}

/** Answer a grounded question in one of the three modes. Metered in GRID
 *  (`echo_ask_cost_grid`, refunded on failure); requires the model brain. */
export async function askEcho(mode: EchoAskMode, user_id: string, question: string): Promise<{ answer?: string; cost?: number; error?: string }> {
  const q = question.trim();
  if (!q) return { error: "question_required" };
  if (!Brain.activeBrain()) return { error: "brain_inactive" };
  const cost = askCost();
  let charge: Wallets.ComputeCharge | null = null;
  if (cost > 0) {
    charge = Wallets.debitCompute(user_id, cost);
    if (!charge) return { error: "insufficient_grid", cost };
    if (charge.grid > 0) Wallets.creditGrid(Wallets.TREASURY, charge.grid);
  }
  const { context } = askSnapshot(mode, user_id);
  const answer = await Brain.echoAsk(mode, q, context);
  if (!answer) {
    if (charge) {
      if (charge.grid > 0) Wallets.debitGrid(Wallets.TREASURY, charge.grid); // reclaim the credited GRID from the treasury (best-effort reconcile)
      Wallets.refundCompute(user_id, charge); // the user ALWAYS gets their GRID + starter back — never gated on the treasury
    }
    return { error: "synthesis_failed", cost };
  }
  return { answer, cost };
}

/* --------------------- deploy — NeuGrid hosting (/d/<slug>) --------------------- */
// The real deploy rail: one click publishes the build's standalone app to a live,
// shareable URL served by the platform itself. Version-PINNED — the deployment
// snapshots the app at deploy time; later revisions change the live site only when
// the owner redeploys. Metered in GRID (`echo_deploy_cost_grid`, refund on failure).

export function deployCost(): number {
  return Params.get("echo_deploy_cost_grid");
}

function slugify(title: string, build_id: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "app";
  const taken = (s: string) => db.builds.some((b) => b.deployment?.slug === s && b.build_id !== build_id);
  if (!taken(base)) return base;
  // Fallback: append the build id (widening the slice until unique) — the raw
  // `-4` suffix could itself collide, serving the wrong app on /d/<slug>.
  for (let n = 4; n <= build_id.length; n++) {
    const candidate = `${base}-${build_id.slice(-n)}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base}-${build_id}`;
}

/** Publish (or republish) a build's standalone app to NeuGrid hosting. */
export function deployBuild(build_id: string, owner_id: string): { deployment?: BuildDeployment; url?: string; cost?: number; error?: string } {
  const build = getBuild(build_id);
  if (!build) return { error: "not_found" };
  if (build.owner_id !== owner_id) return { error: "not_owner" };
  const html = build.artifact.files?.find((f) => f.path === "preview/index.html")?.content;
  if (!html) return { error: "no_app" }; // stub/legacy builds have no standalone app to serve
  const version = build.version ?? 1;
  if (build.deployment && build.deployment.version === version) return { error: "already_live", deployment: build.deployment, url: `/d/${build.deployment.slug}` };

  const cost = deployCost();
  if (cost > 0) {
    const charge = Wallets.debitCompute(owner_id, cost);
    if (!charge) return { error: "insufficient_grid", cost };
    if (charge.grid > 0) Wallets.creditGrid(Wallets.TREASURY, charge.grid);
  }

  const prior = build.deployment;
  build.deployment = {
    slug: prior?.slug ?? slugify(build.title, build.build_id),
    version,
    html,
    proof: build.artifact.proof_of_build ?? "",
    deployed_at: nowISO(),
    redeploys: prior ? prior.redeploys + 1 : 0,
  };
  void IcpHosting.deploy(build); // chain mirror (A3) — guarded, platform hosting stands on failure
  return { deployment: build.deployment, url: `/d/${build.deployment.slug}`, cost };
}

/** Resolve a live deployment by its public slug (the /d/[slug] server). */
export function deploymentBySlug(slug: string): { build: Build; deployment: BuildDeployment } | undefined {
  const build = db.builds.find((b) => b.deployment?.slug === slug);
  return build?.deployment ? { build, deployment: build.deployment } : undefined;
}

/** The founder journey: Echo drafts a Fund funding proposal from a REAL build —
 *  pitch + realistic ask + next-phase milestone tranches, grounded in the actual
 *  files. Review-then-submit; drafting itself is free (it drives funding). */
export async function draftProposal(build_id: string, owner_id: string): Promise<{ draft?: Brain.ProposalDraft; error?: string }> {
  const build = getBuild(build_id);
  if (!build) return { error: "not_found" };
  if (build.owner_id !== owner_id) return { error: "not_owner" };
  const files = build.artifact.files;
  if (!files?.length) return { error: "no_files" };
  if (!Brain.activeBrain()) return { error: "brain_inactive" };
  const draft = await Brain.draftProposal({
    title: build.title,
    summary: build.summary,
    prompt: build.prompt,
    stack: build.stack,
    readme: files.find((f) => f.path === "README.md")?.content,
    file_paths: files.map((f) => f.path),
  });
  if (!draft) return { error: "synthesis_failed" };
  return { draft };
}

export function getBuild(id: string): Build | undefined {
  return db.builds.find((b) => b.build_id === id);
}

export function listBuilds(filter: { owner_id?: string; status?: BuildStatus } = {}): Build[] {
  return db.builds.filter(
    (b) => (!filter.owner_id || b.owner_id === filter.owner_id) && (!filter.status || b.status === filter.status),
  );
}

export function buildsForUser(user_id: string): Build[] {
  return listBuilds({ owner_id: user_id });
}

/** Called by GridX once a build is published to a product. */
export function markListed(build_id: string, product_id: string, grid_id: string): void {
  const b = getBuild(build_id);
  if (!b) return;
  b.product_id = product_id;
  b.grid_id = grid_id;
  if (b.status === "built") b.status = "listed";
}

/** Called by Fund when a proposal is opened from a build (links proof-of-build). */
export function attachProposal(build_id: string, proposal_id: string): void {
  const b = getBuild(build_id);
  if (b) b.proposal_id = proposal_id;
}

/* ------------------------- stub synthesis (swap me) ------------------------ */

const STEP_PLAN: { label: string; detail?: (stack: string[]) => string }[] = [
  { label: "Parsed intent & scoped the build" },
  { label: "Generated system blueprint" },
  { label: "Scaffolded project & dependencies", detail: (s) => s.join(" · ") },
  { label: "Wrote core modules" },
  { label: "Wired data + state layer" },
  { label: "Generated UI from the blueprint" },
  { label: "Ran checks & assembled live preview" },
  { label: "Sealed proof-of-build attestation" },
];

function detectStack(prompt: string): {
  stack: string[];
  kind: BuildArtifactRef["kind"];
  deploy: BuildArtifactRef["deploy_target"];
} {
  const p = prompt.toLowerCase();
  const has = (...k: string[]) => k.some((x) => p.includes(x));
  if (has("canister", "icp", "internet computer", "motoko")) return { stack: ["ICP", "Motoko", "React"], kind: "canister", deploy: "icp" };
  if (has("nft", "mint", "collection", "metaplex")) return { stack: ["Solana", "Metaplex", "Next.js"], kind: "bundle", deploy: "devnet" };
  if (has("solana", "anchor", "program", "spl", "defi", "vault", "swap", "amm", "stake", "token")) return { stack: ["Solana", "Anchor", "Rust", "Next.js"], kind: "program", deploy: "devnet" };
  if (has("agent", " ai", "bot", "assistant", "llm", "model")) return { stack: ["Next.js", "Echo SDK", "TypeScript"], kind: "bundle", deploy: "devnet" };
  return { stack: ["Next.js", "React", "Tailwind"], kind: "frontend", deploy: "devnet" };
}

const KIND_NOUN: Record<BuildArtifactRef["kind"], string> = {
  program: "on-chain program",
  canister: "canister app",
  frontend: "web app",
  bundle: "dApp bundle",
  repo: "codebase",
};

function deriveTitle(prompt: string): string {
  const words = prompt
    .replace(/^(?:(?:please\s+)?(?:build|make|create|generate|me|us|a|an|the)\s+)+/i, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[.,!?]+$/, "");
  const t = words.replace(/\b\w/g, (c) => c.toUpperCase());
  return t || "Untitled Build";
}

function summarize(title: string, kind: BuildArtifactRef["kind"], stack: string[]): string {
  return `${title} — an Echo-built ${KIND_NOUN[kind]} on ${stack.join(", ")}, scaffolded with a live preview and a sealed proof of build.`;
}

/** Deterministic content attestation (NOT a security hash — a witnessing stamp). */
function attest(owner: string, prompt: string, stack: string[], steps: BuildStep[]): string {
  const material = [owner, prompt, stack.join(","), steps.map((s) => s.label).join("|")].join("::");
  let h = 5381;
  for (let i = 0; i < material.length; i++) h = ((h << 5) + h + material.charCodeAt(i)) >>> 0;
  return `ngpob:${h.toString(16).padStart(8, "0")}`;
}
