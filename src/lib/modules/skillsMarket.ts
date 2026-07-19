/**
 * Skills Marketplace — the agent economy's second earning surface.
 *
 * Agents learn reusable skills by doing real work (agentWork's Hermes-style
 * `skill_library`). Here an owner can PUBLISH a learned skill so other owners can
 * INSTALL it onto their agents — and earn GRID each time. Trust is PROVENANCE,
 * not just a scan (NeuGrid's edge over a generic skill store): a published skill
 * carries the mastery it actually earned (`source_uses`), its install count, and
 * the author's on-chain reputation — all real, all on the record.
 *
 * Anti-farm: you can't install your own listing (or your own account's), install
 * costs real GRID (a paid self-install just cycles your GRID minus the protocol
 * fee — no free anything), and the author's reputation from an install is
 * reward_excluded (reputation, never GRID allocation → no collusion farm).
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Wallets from "./wallets";
import * as Pulse from "./pulse";
import * as Params from "./params";
import type { Agent, LearnedSkill, PublishedSkill, Settlement, PluginFile } from "../types";

const AUTHOR_REP_PER_INSTALL = 3; // creator reputation to the author per distinct install (reputation-only)

function store(): PublishedSkill[] {
  return (db.publishedSkills ??= []);
}
function agentOf(id: string): Agent | undefined {
  return db.agents.find((a) => a.agent_id === id);
}
function libOf(agent: Agent): LearnedSkill[] {
  return (agent.skill_library ??= []);
}
const feeBps = () => Params.get("skill_market_fee_bps");

export function get(published_id: string): PublishedSkill | undefined {
  return store().find((p) => p.published_id === published_id);
}
export function listListed(): PublishedSkill[] {
  return store().filter((p) => p.status === "listed");
}
export function byAuthor(owner_id: string): PublishedSkill[] {
  return store().filter((p) => p.author_id === owner_id);
}
/** The published listing sourced from a given library skill (if any, still listed). */
export function listingForSkill(skill_id: string): PublishedSkill | undefined {
  return store().find((p) => p.skill_id === skill_id && p.status === "listed");
}

/** Publish a learned skill to the marketplace. Owner-gated; the skill must live in
 *  the named agent's library and not already be listed. */
export function publish(input: { agent_id: string; skill_id: string; owner_id: string; price_grid?: number; summary?: string }): { published?: PublishedSkill; error?: string } {
  const agent = agentOf(input.agent_id);
  if (!agent) return { error: "no_agent" };
  if (agent.owner_id !== input.owner_id) return { error: "not_owner" };
  const skill = libOf(agent).find((s) => s.skill_id === input.skill_id);
  if (!skill) return { error: "no_skill" };
  if (skill.from_published) return { error: "not_original" }; // a bought skill can't be re-sold — only work-earned skills are publishable
  if (listingForSkill(input.skill_id)) return { error: "already_listed" };
  const price = Math.max(0, Math.round(input.price_grid ?? 0));
  const published: PublishedSkill = {
    published_id: newId("pskill"),
    skill_id: skill.skill_id,
    title: skill.title,
    domain: skill.domain,
    recipe: skill.recipe,
    summary: (input.summary ?? "").trim().slice(0, 300) || undefined,
    author_agent_id: agent.agent_id,
    author_id: input.owner_id,
    source_uses: skill.uses,
    price_grid: price,
    installs: 0,
    status: "listed",
    created_at: nowISO(),
  };
  store().unshift(published);
  return { published };
}

export function delist(published_id: string, owner_id: string): { ok?: boolean; error?: string } {
  const p = get(published_id);
  if (!p) return { error: "not_found" };
  if (p.author_id !== owner_id) return { error: "not_owner" };
  p.status = "delisted";
  p.updated_at = nowISO();
  return { ok: true };
}

/** Author reprices a listing (0 = free). */
export function updatePrice(published_id: string, owner_id: string, price_grid: number): { published?: PublishedSkill; error?: string } {
  const p = get(published_id);
  if (!p) return { error: "not_found" };
  if (p.author_id !== owner_id) return { error: "not_owner" };
  if (!Number.isFinite(price_grid) || price_grid < 0) return { error: "bad_price" };
  p.price_grid = Math.round(price_grid);
  p.updated_at = nowISO();
  return { published: p };
}

/** Skills the owner could publish right now: every library skill across their
 *  agents that was earned by the agent's own work (not bought here) and isn't
 *  already listed. */
export function publishableFor(owner_id: string): { agent_id: string; agent_name: string; skill_id: string; title: string; domain: string; uses: number }[] {
  return db.agents
    .filter((a) => a.owner_id === owner_id)
    .flatMap((a) => libOf(a)
      .filter((s) => !s.from_published && !listingForSkill(s.skill_id))
      .map((s) => ({ agent_id: a.agent_id, agent_name: a.name, skill_id: s.skill_id, title: s.title, domain: s.domain, uses: s.uses })));
}

/** Does this agent already carry the skill from this listing? */
export function agentHasInstalled(agent: Agent, published_id: string): boolean {
  return libOf(agent).some((s) => s.from_published === published_id);
}

/** Install a published skill onto one of the caller's agents. Charges GRID
 *  (installer → author, minus the protocol fee → treasury), copies the recipe
 *  into the target agent's library with provenance, and credits the author. */
export function install(input: { published_id: string; target_agent_id: string; installer_id: string }): { skill?: LearnedSkill; paid?: number; error?: string } {
  const p = get(input.published_id);
  if (!p || p.status !== "listed") return { error: "not_available" };
  if (p.domain === "studio" || p.domain === "studio-plugin") return { error: "studio_skill" }; // studio skills/plugins install into WORKSPACES, not agents
  const target = agentOf(input.target_agent_id);
  if (!target) return { error: "no_agent" };
  if (target.owner_id !== input.installer_id) return { error: "not_owner" };
  if (agentHasInstalled(target, p.published_id)) return { error: "already_installed" };

  // Your OWN skill → a free COPY between your agents: no payment, no public
  // install count, no author reputation (self-install farming stays closed).
  if (p.author_id === input.installer_id) {
    const skill: LearnedSkill = {
      skill_id: newId("skill"),
      title: p.title,
      domain: p.domain,
      recipe: p.recipe,
      uses: 0,
      from_published: p.published_id,
      source_author_id: p.author_id,
      created_at: nowISO(),
    };
    libOf(target).push(skill);
    return { skill, paid: 0 };
  }

  // Payment (GRID): installer → author (minus fee → treasury). Free skills skip it.
  let paid = 0;
  if (p.price_grid > 0) {
    if (!Wallets.debitGrid(input.installer_id, p.price_grid)) return { error: "insufficient_grid" };
    const fee = Math.round((p.price_grid * feeBps()) / 10000);
    Wallets.creditGrid(p.author_id, p.price_grid - fee);
    if (fee > 0) Wallets.creditGrid(Wallets.TREASURY, fee);
    paid = p.price_grid;
    const at = nowISO();
    const rec = (payee: string, resource: string, amount: number): Settlement => ({
      settlement_id: newId("setl"), payer_id: input.installer_id, payee, resource,
      amount, asset: "GRID", network: "neugrid", scheme: "exact", proof: newId("rcpt"), status: "settled", created_at: at,
    });
    db.settlements.push(rec(p.author_id, `skill_install:${p.published_id}`, p.price_grid - fee));
    if (fee > 0) db.settlements.push(rec(Wallets.TREASURY, `skill_fee:${p.published_id}`, fee));
  }

  // Copy the recipe into the target agent's library (provenance preserved).
  const skill: LearnedSkill = {
    skill_id: newId("skill"),
    title: p.title,
    domain: p.domain,
    recipe: p.recipe,
    uses: 0,
    from_published: p.published_id,
    source_author_id: p.author_id,
    created_at: nowISO(),
  };
  libOf(target).push(skill);
  p.installs += 1;
  p.updated_at = nowISO();

  // Author earns reputation (creator dim) — reputation ONLY, never GRID allocation.
  Pulse.recordEvent({
    target_type: "user", target_id: p.author_id, user_id: input.installer_id,
    action_type: "skill_installed", weight: AUTHOR_REP_PER_INSTALL,
    reason: `"${p.title}" installed by another builder`,
    verification_source: `skill:${p.published_id}`, dimension: "creator", reward_excluded: true,
  });
  return { skill, paid };
}

/** GRID a publisher has earned from installs (from the settlements ledger). */
export function earningsFor(owner_id: string): number {
  return (db.settlements ?? [])
    .filter((s) => s.payee === owner_id && s.resource.startsWith("skill_install:") && s.status === "settled")
    .reduce((a, s) => a + s.amount, 0);
}
export function statsFor(owner_id: string): { published: number; installs: number; earned_grid: number } {
  const mine = byAuthor(owner_id).filter((p) => p.status === "listed");
  return { published: mine.length, installs: mine.reduce((a, p) => a + p.installs, 0), earned_grid: Math.round(earningsFor(owner_id)) };
}

/** A listing enriched for the UI (author identity + provenance). Explicit field
 *  list — the RECIPE is the paid good and must NEVER ship to non-buyers (it's
 *  copied server-side on install); buyers see its size, not its content. */
export function view(p: PublishedSkill, viewer_id?: string) {
  const author = db.users.find((u) => u.id === p.author_id);
  return {
    published_id: p.published_id,
    skill_id: p.skill_id,
    title: p.title,
    domain: p.domain,
    summary: p.summary,
    source_uses: p.source_uses,
    price_grid: p.price_grid,
    installs: p.installs,
    status: p.status,
    created_at: p.created_at,
    recipe_chars: p.recipe.length,
    author_id: p.author_id,
    author_name: author?.username ?? p.author_id,
    author_reputation: author?.reputation?.total ?? 0,
    author_agent_name: agentOf(p.author_agent_id)?.name ?? p.author_agent_id,
    mine: viewer_id ? p.author_id === viewer_id : false,
  };
}

/** Global marketplace rollup (for KPIs + the GRID-flow chart). Volume is GROSS
 *  (what installers paid); it splits into author take + treasury fees. */
export function marketStats(): { listings: number; installs: number; authors: number; volume_grid: number; author_take_grid: number; fees_grid: number } {
  const listed = listListed();
  const settled = (db.settlements ?? []).filter((s) => s.status === "settled");
  const take = settled.filter((s) => s.resource.startsWith("skill_install:")).reduce((a, s) => a + s.amount, 0);
  const fees = settled.filter((s) => s.resource.startsWith("skill_fee:")).reduce((a, s) => a + s.amount, 0);
  return {
    listings: listed.length,
    installs: listed.reduce((a, p) => a + p.installs, 0),
    authors: new Set(listed.map((p) => p.author_id)).size,
    volume_grid: Math.round(take + fees),
    author_take_grid: Math.round(take),
    fees_grid: Math.round(fees),
  };
}

/* ================= BUILD-SKILLS — the Studio's skill economy (Phase 5) ================= */
// A build-skill is a SKILL.md prompt package in the open grok-build format: it
// teaches the ENGINE a repeatable build procedure (a house style, a checklist, a
// convention). Published here like agent skills — the reserved domain "studio"
// marks the kind, `recipe` holds the SKILL.md body (version-pinned at publish) —
// and installed into a Studio WORKSPACE, where it mounts into the engine's
// workdir. Same economics: GRID per install, fee → treasury, creator reputation.

const BUILD_SKILL_DOMAIN = "studio";
const BUILD_SKILL_BODY_MAX = 8_000;

export function isBuildSkill(p: PublishedSkill): boolean {
  return p.domain === BUILD_SKILL_DOMAIN;
}

export function listBuildSkills(): PublishedSkill[] {
  return store().filter((p) => p.status === "listed" && isBuildSkill(p));
}

/** Publish a build-skill (SKILL.md body). Any user may author one — the toolbox
 *  grows itself because making tools pays. */
export function publishBuildSkill(input: { owner_id: string; title: string; summary?: string; body: string; price_grid?: number }): { published?: PublishedSkill; error?: string } {
  const title = (input.title ?? "").trim().slice(0, 60);
  const body = (input.body ?? "").trim();
  if (!title) return { error: "title_required" };
  if (body.length < 40) return { error: "body_too_short" };
  if (body.length > BUILD_SKILL_BODY_MAX) return { error: "body_too_long" };
  if (store().some((p) => isBuildSkill(p) && p.status === "listed" && p.author_id === input.owner_id && p.title.toLowerCase() === title.toLowerCase())) {
    return { error: "already_listed" };
  }
  const published: PublishedSkill = {
    published_id: newId("pskill"),
    skill_id: newId("bskill"),
    title,
    domain: BUILD_SKILL_DOMAIN,
    recipe: body,
    summary: (input.summary ?? "").trim().slice(0, 300) || undefined,
    author_agent_id: "",
    author_id: input.owner_id,
    source_uses: 0,
    price_grid: Math.max(0, Math.round(input.price_grid ?? 0)),
    installs: 0,
    status: "listed",
    created_at: nowISO(),
  };
  store().unshift(published);
  return { published };
}

/** Install a build-skill for a workspace: pays the creator (minus the market fee)
 *  and returns the version-pinned body for the Studio to mount. The caller
 *  (studio.ts) records it on the workspace — installing twice is ITS guard. */
export function installBuildSkill(input: { published_id: string; installer_id: string }): { title?: string; body?: string; paid?: number; error?: string } {
  const p = get(input.published_id);
  if (!p || p.status !== "listed" || !isBuildSkill(p)) return { error: "not_available" };

  // your own skill mounts free — no counts, no reputation (self-farming stays closed)
  if (p.author_id === input.installer_id) return { title: p.title, body: p.recipe, paid: 0 };

  let paid = 0;
  if (p.price_grid > 0) {
    if (!Wallets.debitGrid(input.installer_id, p.price_grid)) return { error: "insufficient_grid" };
    const fee = Math.round((p.price_grid * feeBps()) / 10000);
    Wallets.creditGrid(p.author_id, p.price_grid - fee);
    if (fee > 0) Wallets.creditGrid(Wallets.TREASURY, fee);
    paid = p.price_grid;
    const at = nowISO();
    const rec = (payee: string, resource: string, amount: number): Settlement => ({
      settlement_id: newId("setl"), payer_id: input.installer_id, payee, resource,
      amount, asset: "GRID", network: "neugrid", scheme: "exact", proof: newId("rcpt"), status: "settled", created_at: at,
    });
    db.settlements.push(rec(p.author_id, `skill_install:${p.published_id}`, p.price_grid - fee));
    if (fee > 0) db.settlements.push(rec(Wallets.TREASURY, `skill_fee:${p.published_id}`, fee));
  }
  p.installs += 1;
  p.updated_at = nowISO();
  Pulse.recordEvent({
    target_type: "user", target_id: p.author_id, user_id: input.installer_id,
    action_type: "skill_installed", weight: AUTHOR_REP_PER_INSTALL,
    reason: `build-skill "${p.title}" installed into a Studio workspace`,
    verification_source: `skill:${p.published_id}`, dimension: "creator", reward_excluded: true,
  });
  return { title: p.title, body: p.recipe, paid };
}

/* ================= PLUGINS — multi-file toolkits (Phase 6c) ================= */
// A plugin bundles several INERT components — skills, slash-commands, agent
// personas, a manifest — in the open grok-build layout. Published on the same
// rails (domain "studio-plugin", `recipe` = the JSON-encoded file map, pinned at
// publish) and installed into a TOOLBOX or a workshop, where the Studio mounts
// it under `.grok/plugins/<name>/`. v1 REJECTS anything that executes (hooks,
// bundled MCP/LSP) at publish AND the Studio re-checks at mount — the store
// sells recipes, not code execution.

const PLUGIN_DOMAIN = "studio-plugin";
const PLUGIN_FILES_MAX = 12;
const PLUGIN_BYTES_MAX = 64_000;
/** The INERT allowlist — the only paths a marketplace plugin may carry. */
const PLUGIN_PATH_RE = /^(plugin\.json|skills\/[a-z0-9][a-z0-9-]{0,40}\/SKILL\.md|commands\/[a-z0-9][a-z0-9-]{0,40}\.md|agents\/[a-z0-9][a-z0-9-]{0,40}\.(md|json))$/;

export function isPlugin(p: PublishedSkill): boolean {
  return p.domain === PLUGIN_DOMAIN;
}

/** Is this a path a marketplace plugin may carry (inert components only)? The
 *  Studio re-checks this at mount — defense in depth. */
export function isInertPluginPath(path: string): boolean {
  return PLUGIN_PATH_RE.test(path.trim());
}

export function listPlugins(): PublishedSkill[] {
  return store().filter((p) => p.status === "listed" && isPlugin(p));
}

export function pluginFiles(p: PublishedSkill): PluginFile[] {
  try {
    const f = JSON.parse(p.recipe) as PluginFile[];
    return Array.isArray(f) ? f.filter((x) => x && typeof x.path === "string" && typeof x.content === "string") : [];
  } catch { return []; }
}

/** Publish a plugin bundle. Every file must pass the inert allowlist. */
export function publishPlugin(input: { owner_id: string; title: string; summary?: string; price_grid?: number; files: PluginFile[] }): { published?: PublishedSkill; error?: string } {
  const title = (input.title ?? "").trim().slice(0, 60);
  if (!title) return { error: "title_required" };
  const files = (input.files ?? []).filter((f) => f && typeof f.path === "string" && typeof f.content === "string");
  if (!files.length) return { error: "files_required" };
  if (files.length > PLUGIN_FILES_MAX) return { error: "too_many_files" };
  let bytes = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const path = f.path.trim();
    if (!PLUGIN_PATH_RE.test(path)) return { error: `bad_path:${path.slice(0, 60)}` }; // hooks/.mcp.json/.lsp.json land here too — executing components are not sellable (v1)
    if (seen.has(path)) return { error: "duplicate_path" };
    seen.add(path);
    if (!f.content.trim()) return { error: `empty_file:${path.slice(0, 60)}` };
    bytes += f.content.length;
  }
  if (bytes > PLUGIN_BYTES_MAX) return { error: "bundle_too_large" };
  if (store().some((p) => isPlugin(p) && p.status === "listed" && p.author_id === input.owner_id && p.title.toLowerCase() === title.toLowerCase())) {
    return { error: "already_listed" };
  }
  const published: PublishedSkill = {
    published_id: newId("pskill"),
    skill_id: newId("bplug"),
    title,
    domain: PLUGIN_DOMAIN,
    recipe: JSON.stringify(files.map((f) => ({ path: f.path.trim(), content: f.content }))),
    summary: (input.summary ?? "").trim().slice(0, 300) || undefined,
    author_agent_id: "",
    author_id: input.owner_id,
    source_uses: 0,
    price_grid: Math.max(0, Math.round(input.price_grid ?? 0)),
    installs: 0,
    status: "listed",
    created_at: nowISO(),
  };
  store().unshift(published);
  return { published };
}

/** Install a plugin: pays the creator (same split as skills) and returns the
 *  version-pinned file map for the caller (toolbox/studio) to record + mount. */
export function installPlugin(input: { published_id: string; installer_id: string }): { title?: string; files?: PluginFile[]; paid?: number; error?: string } {
  const p = get(input.published_id);
  if (!p || p.status !== "listed" || !isPlugin(p)) return { error: "not_available" };
  const files = pluginFiles(p);
  if (!files.length) return { error: "corrupt_bundle" };

  if (p.author_id === input.installer_id) return { title: p.title, files, paid: 0 }; // own work mounts free

  let paid = 0;
  if (p.price_grid > 0) {
    if (!Wallets.debitGrid(input.installer_id, p.price_grid)) return { error: "insufficient_grid" };
    const fee = Math.round((p.price_grid * feeBps()) / 10000);
    Wallets.creditGrid(p.author_id, p.price_grid - fee);
    if (fee > 0) Wallets.creditGrid(Wallets.TREASURY, fee);
    paid = p.price_grid;
    const at = nowISO();
    const rec = (payee: string, resource: string, amount: number): Settlement => ({
      settlement_id: newId("setl"), payer_id: input.installer_id, payee, resource,
      amount, asset: "GRID", network: "neugrid", scheme: "exact", proof: newId("rcpt"), status: "settled", created_at: at,
    });
    db.settlements.push(rec(p.author_id, `skill_install:${p.published_id}`, p.price_grid - fee));
    if (fee > 0) db.settlements.push(rec(Wallets.TREASURY, `skill_fee:${p.published_id}`, fee));
  }
  p.installs += 1;
  p.updated_at = nowISO();
  Pulse.recordEvent({
    target_type: "user", target_id: p.author_id, user_id: input.installer_id,
    action_type: "skill_installed", weight: AUTHOR_REP_PER_INSTALL,
    reason: `plugin "${p.title}" installed into a Studio toolbox`,
    verification_source: `skill:${p.published_id}`, dimension: "creator", reward_excluded: true,
  });
  return { title: p.title, files, paid };
}
