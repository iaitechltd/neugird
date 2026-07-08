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
import type { Agent, LearnedSkill, PublishedSkill, Settlement } from "../types";

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
  const target = agentOf(input.target_agent_id);
  if (!target) return { error: "no_agent" };
  if (target.owner_id !== input.installer_id) return { error: "not_owner" };
  if (p.author_id === input.installer_id) return { error: "own_skill" }; // no self-install farming
  if (agentHasInstalled(target, p.published_id)) return { error: "already_installed" };

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

/** A listing enriched for the UI (author identity + provenance). */
export function view(p: PublishedSkill, viewer_id?: string) {
  const author = db.users.find((u) => u.id === p.author_id);
  return {
    ...p,
    author_name: author?.username ?? p.author_id,
    author_reputation: author?.reputation?.total ?? 0,
    author_agent_name: agentOf(p.author_agent_id)?.name ?? p.author_agent_id,
    mine: viewer_id ? p.author_id === viewer_id : false,
  };
}

/** Global marketplace rollup (for KPIs). */
export function marketStats(): { listings: number; installs: number; authors: number; volume_grid: number } {
  const listed = listListed();
  const volume = (db.settlements ?? []).filter((s) => s.resource.startsWith("skill_install:") && s.status === "settled").reduce((a, s) => a + s.amount, 0);
  return { listings: listed.length, installs: listed.reduce((a, p) => a + p.installs, 0), authors: new Set(listed.map((p) => p.author_id)).size, volume_grid: Math.round(volume) };
}
