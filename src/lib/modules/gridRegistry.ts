/**
 * GridRegistryCanister — create, update, query Grids and SubGrids.
 * Holds the canonical app state for the core primitive.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Wallets from "./wallets";
import { Splits as ChainSplits } from "../chain";
import type { Agent, ContributorSplit, Grid, GridSummary, GridType, Job, ModuleKey, SubGrid, SubGridAccess, UserProfile, Visibility } from "../types";

const repOf = (u?: UserProfile): number => (u ? Math.round(Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0)) : 0);

export function listGrids(opts?: { visibility?: Visibility }): Grid[] {
  let grids = db.grids;
  if (opts?.visibility) grids = grids.filter((g) => g.visibility === opts.visibility);
  return grids;
}

/** Total value flowing through a Grid's activity — campaign reward pools + agent
 *  earnings (its own + its SubGrids') + delivered (paid) job rewards (which include
 *  Campaign promo postings). A gross activity-value headline, not net profit. */
export function gridEarnings(grid_id: string): number {
  const subs = db.subgrids.filter((s) => s.parent_grid_id === grid_id);
  const subIds = new Set(subs.map((s) => s.subgrid_id));
  const agentIds = new Set<string>([
    ...db.agents.filter((a) => a.grid_id === grid_id).map((a) => a.agent_id),
    ...subs.flatMap((s) => s.agent_members ?? []),
  ]);
  const campaigns = db.campaigns.filter((c) => c.grid_id === grid_id).reduce((n, c) => n + (c.reward_pool || 0), 0);
  const agentEarn = [...agentIds].reduce((n, id) => n + (db.agents.find((a) => a.agent_id === id)?.earnings || 0), 0);
  const jobEarn = db.jobs.filter((j) => (j.grid_id === grid_id || (j.subgrid_id && subIds.has(j.subgrid_id))) && j.status === "paid").reduce((n, j) => n + (j.reward_amount || 0), 0);
  return Math.round(campaigns + agentEarn + jobEarn);
}

/** Grids enriched with directory stats — subgrid + agent counts and total earnings. */
export function listGridsWithStats(opts?: { visibility?: Visibility }) {
  return listGrids(opts).map((g) => ({
    ...g,
    subgrid_count: db.subgrids.filter((s) => s.parent_grid_id === g.grid_id).length,
    agent_count: db.agents.filter((a) => a.grid_id === g.grid_id).length,
    earnings: gridEarnings(g.grid_id),
  }));
}

export function getGrid(idOrSlug: string): Grid | undefined {
  return db.grids.find((g) => g.grid_id === idOrSlug || g.slug === idOrSlug);
}

export function getGridSummary(idOrSlug: string): GridSummary | undefined {
  const grid = getGrid(idOrSlug);
  if (!grid) return undefined;
  const subgrids = db.subgrids.filter((s) => s.parent_grid_id === grid.grid_id);
  const campaigns = db.campaigns.filter((c) => c.grid_id === grid.grid_id);
  const campaignIds = new Set(campaigns.map((c) => c.campaign_id));
  const openTasks = db.tasks.filter((t) => campaignIds.has(t.campaign_id) && t.status === "open");
  return {
    grid,
    subgrids: subgrids.length,
    active_campaigns: campaigns.filter((c) => c.status === "active").length,
    open_tasks: openTasks.length,
    recent_pulse: Pulse.forTarget("grid", grid.grid_id).slice(0, 5),
    lifecycle_stage: grid.lifecycle_stage,
  };
}

/** The Grid's member directory — humans who joined, with role + reputation. */
export function gridMembers(grid_id: string) {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  return db.users
    .filter((u) => u.id === grid?.owner_id || u.joined_grids?.includes(grid_id))
    .map((u) => {
      const owner = grid?.owner_id === u.id;
      const role = u.roles_by_grid?.find((r) => r.grid_id === grid_id)?.role;
      return {
        id: u.id,
        username: u.username,
        reputation: Math.round(Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0)),
        role: owner || role === "GridFounder" ? "Founder" : (role ?? "Member"),
        is_owner: owner,
      };
    })
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || b.reputation - a.reputation);
}

/** Agents that call this Grid home (the Grid's autonomous workforce). */
export function gridAgents(grid_id: string) {
  return db.agents
    .filter((a) => a.grid_id === grid_id)
    .map((a) => ({ agent_id: a.agent_id, name: a.name, trust_tier: a.trust_tier ?? "trusted", earnings: a.earnings ?? 0, rating: a.rating ?? a.trading_rating ?? 0, status: a.status }));
}

/* Cumulative time series over a Grid's lifetime (created_at → now), n samples. */
function cumulativeWeight(items: { t: number; w: number }[], start: number, n = 16): number[] {
  if (!items.length) return [0, 0];
  const end = Math.max(Date.now(), start + 1);
  const span = end - start;
  const sorted = items.slice().sort((a, b) => a.t - b.t);
  return Array.from({ length: n }, (_, i) => {
    const t = start + (span * i) / (n - 1);
    return sorted.reduce((s, x) => (x.t <= t ? s + x.w : s), 0);
  });
}
function cumulativeCount(times: number[], start: number, n = 16): number[] {
  if (!times.length) return [0, 0];
  const end = Math.max(Date.now(), start + 1);
  const span = end - start;
  const sorted = times.slice().sort((a, b) => a - b);
  return Array.from({ length: n }, (_, i) => {
    const t = start + (span * i) / (n - 1);
    return sorted.filter((x) => x <= t).length;
  });
}

/** Grid-level analytics rollup — KPIs, growth trends, top contributors, agent
 *  performance, pulse-by-source, and feed/chat engagement. All from real state. */
export function gridAnalytics(grid_id: string) {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  const events = Pulse.forTarget("grid", grid_id);
  const posts = (db.gridPosts ?? []).filter((p) => p.grid_id === grid_id);
  const messages = (db.messages ?? []).filter((m) => m.grid_id === grid_id);
  const campaigns = db.campaigns.filter((c) => c.grid_id === grid_id);
  const jobs = db.jobs.filter((j) => j.grid_id === grid_id);
  const subgrids = db.subgrids.filter((s) => s.parent_grid_id === grid_id);
  const agents = db.agents.filter((a) => a.grid_id === grid_id);
  const start = grid ? Date.parse(grid.created_at) : Date.now();

  const bySrc = new Map<string, number>();
  const contrib = new Map<string, number>();
  for (const e of events) {
    if (e.weight > 0) bySrc.set(e.action_type, (bySrc.get(e.action_type) ?? 0) + e.weight);
    if (e.user_id && e.weight > 0) contrib.set(e.user_id, (contrib.get(e.user_id) ?? 0) + e.weight);
  }
  const mostLiked = posts.slice().sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0))[0];

  return {
    kpis: {
      members: grid?.member_count ?? 0,
      pulse: grid?.pulse_score ?? 0,
      posts: posts.length,
      messages: messages.length,
      likes: posts.reduce((n, p) => n + (p.likes?.length ?? 0), 0),
      campaigns: campaigns.length,
      open_jobs: jobs.filter((j) => j.status === "open").length,
      agents: agents.length,
      subgrids: subgrids.length,
    },
    pulse_trend: cumulativeWeight(events.map((e) => ({ t: Date.parse(e.timestamp), w: e.weight })), start),
    member_trend: cumulativeCount(db.users.flatMap((u) => (u.roles_by_grid ?? []).filter((r) => r.grid_id === grid_id).map((r) => Date.parse(r.granted_at))), start),
    pulse_by_source: [...bySrc.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    top_contributors: [...contrib.entries()].map(([id, pulse]) => ({ id, username: db.users.find((u) => u.id === id)?.username ?? id, pulse })).sort((a, b) => b.pulse - a.pulse).slice(0, 6),
    agent_performance: agents.map((a) => ({ agent_id: a.agent_id, name: a.name, earnings: a.earnings ?? 0, rating: a.rating ?? a.trading_rating ?? 0, jobs: (a.task_history ?? []).length })).sort((a, b) => b.earnings - a.earnings).slice(0, 6),
    most_liked: mostLiked ? { title: mostLiked.title ?? "(untitled)", likes: mostLiked.likes?.length ?? 0 } : null,
  };
}

/** Live work in a Grid — campaigns + open jobs (the activity the page surfaces). */
export function gridActivity(grid_id: string) {
  return {
    campaigns: db.campaigns
      .filter((c) => c.grid_id === grid_id)
      .map((c) => ({ campaign_id: c.campaign_id, title: c.title, status: c.status })),
    jobs: db.jobs
      .filter((j) => j.grid_id === grid_id)
      .map((j) => ({ job_id: j.job_id, title: j.title, status: j.status, reward_amount: j.reward_amount, required_skills: j.required_skills ?? [] })),
  };
}

export interface CreateGridInput {
  owner_id: string;
  name: string;
  category: string;
  description: string;
  modules_enabled?: ModuleKey[];
  visibility?: Visibility;
  accent?: string;
  grid_type?: GridType;
}

export function createGrid(input: CreateGridInput): Grid {
  const grid: Grid = {
    grid_id: newId("grid"),
    owner_id: input.owner_id,
    name: input.name,
    slug: slugify(input.name),
    category: input.category,
    description: input.description,
    visual_theme: { accent: input.accent ?? "#00ff88", glyph: "▦" },
    modules_enabled: input.modules_enabled ?? ["Grid", "SubGrid", "Campaign", "Talent", "Pulse"],
    visibility: input.visibility ?? "public",
    treasury_config: { enabled: false },
    pulse_score: 0,
    member_count: 1,
    created_at: nowISO(),
    grid_type: input.grid_type ?? "community",
  };
  db.grids.push(grid);

  const owner = db.users.find((u) => u.id === input.owner_id);
  if (owner) {
    owner.roles_by_grid.push({ grid_id: grid.grid_id, role: "GridFounder", granted_at: nowISO() });
    if (!owner.joined_grids.includes(grid.grid_id)) owner.joined_grids.push(grid.grid_id);
  }
  return grid;
}

export function updateGrid(grid_id: string, patch: Partial<Grid>): Grid | undefined {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (!grid) return undefined;
  Object.assign(grid, patch);
  return grid;
}

export function listSubGrids(grid_id: string): SubGrid[] {
  return db.subgrids.filter((s) => s.parent_grid_id === grid_id);
}

export function getSubGrid(id: string): SubGrid | undefined {
  return db.subgrids.find((s) => s.subgrid_id === id);
}

const isSubAdmin = (sub: SubGrid, uid: string): boolean => sub.admins.includes(uid);
const nameOf = (id: string): string =>
  db.users.find((u) => u.id === id)?.username ?? db.agents.find((a) => a.agent_id === id)?.name ?? id;

/** Is `user_id` allowed to join this SubGrid right now? (gate-aware, for the UI). */
export function canJoinSubGrid(subgrid_id: string, user_id: string): { ok: boolean; reason?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { ok: false, reason: "not_found" };
  if (sub.members.includes(user_id)) return { ok: false, reason: "already_member" };
  const grid = db.grids.find((g) => g.grid_id === sub.parent_grid_id);
  if (!(grid?.owner_id === user_id || isMember(sub.parent_grid_id, user_id))) return { ok: false, reason: "join_grid_first" };
  const access = sub.access ?? "open";
  if (access === "open") return { ok: true };
  if (access === "invite") return { ok: false, reason: "invite_only" };
  if (access === "reputation") return repOf(db.users.find((u) => u.id === user_id)) >= (sub.min_reputation ?? 0) ? { ok: true } : { ok: false, reason: "need_reputation" };
  if (access === "token") return Wallets.balances(user_id).grid >= (sub.min_grid ?? 0) ? { ok: true } : { ok: false, reason: "need_grid" };
  return { ok: true };
}

export function joinSubGrid(subgrid_id: string, user_id: string): { ok: boolean; reason?: string } {
  const can = canJoinSubGrid(subgrid_id, user_id);
  if (!can.ok) return can;
  getSubGrid(subgrid_id)!.members.push(user_id);
  return { ok: true };
}

export function leaveSubGrid(subgrid_id: string, user_id: string): { ok: boolean; reason?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { ok: false, reason: "not_found" };
  if (sub.admins.includes(user_id) && sub.admins.length <= 1) return { ok: false, reason: "sole_admin" };
  sub.members = sub.members.filter((id) => id !== user_id);
  sub.admins = sub.admins.filter((id) => id !== user_id);
  return { ok: true };
}

/** Admin adds a parent-Grid member directly (the path for invite-only SubGrids). */
export function addSubGridMember(subgrid_id: string, admin_id: string, target_id: string): { ok: boolean; reason?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { ok: false, reason: "not_found" };
  if (!isSubAdmin(sub, admin_id)) return { ok: false, reason: "not_admin" };
  if (sub.members.includes(target_id)) return { ok: false, reason: "already_member" };
  const grid = db.grids.find((g) => g.grid_id === sub.parent_grid_id);
  if (!(grid?.owner_id === target_id || isMember(sub.parent_grid_id, target_id))) return { ok: false, reason: "not_grid_member" };
  sub.members.push(target_id);
  return { ok: true };
}

export function setSubGridAccess(subgrid_id: string, admin_id: string, patch: { access?: SubGridAccess; min_reputation?: number; min_grid?: number }): { ok: boolean; reason?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { ok: false, reason: "not_found" };
  if (!isSubAdmin(sub, admin_id)) return { ok: false, reason: "not_admin" };
  if (patch.access) sub.access = patch.access;
  if (patch.min_reputation !== undefined) sub.min_reputation = Math.max(0, Math.round(patch.min_reputation));
  if (patch.min_grid !== undefined) sub.min_grid = Math.max(0, Math.round(patch.min_grid));
  return { ok: true };
}

/** Set the on-chain ownership split agreement (basis points must sum to 10000). */
export function setSubGridSplits(subgrid_id: string, admin_id: string, splits: ContributorSplit[]): { ok: boolean; reason?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { ok: false, reason: "not_found" };
  if (!isSubAdmin(sub, admin_id)) return { ok: false, reason: "not_admin" };
  if (!Array.isArray(splits) || splits.length === 0) { sub.contributor_splits = []; return { ok: true }; }
  const valid = new Set<string>([...sub.members, ...(sub.agent_members ?? [])]);
  for (const s of splits) if (!valid.has(s.party_id)) return { ok: false, reason: "unknown_party" };
  const total = splits.reduce((n, s) => n + (Number(s.basis_points) || 0), 0);
  if (total !== 10000) return { ok: false, reason: "must_sum_10000" };
  sub.contributor_splits = splits.map((s) => ({ party_id: s.party_id, party_type: s.party_type, beneficiary_id: s.beneficiary_id, basis_points: Math.round(s.basis_points), role: s.role }));
  void ChainSplits.configure(subgrid_id, sub.contributor_splits); // chain mirror
  return { ok: true };
}

/** Pay revenue THROUGH the split agreement: the payer's USDC divides across the
 *  parties by their basis points (an agent's share lands on its beneficiary/owner).
 *  Admin-only — this is how a team routes what it earned. */
export function distributeSubGridRevenue(subgrid_id: string, payer_id: string, amount: number): { paid?: { party: string; share: number }[]; error?: string } {
  const sub = getSubGrid(subgrid_id);
  if (!sub) return { error: "not_found" };
  if (!isSubAdmin(sub, payer_id)) return { error: "not_admin" };
  const splits = sub.contributor_splits ?? [];
  if (!splits.length) return { error: "no_splits" };
  if (!(amount > 0)) return { error: "bad_amount" };
  if (!Wallets.debitUsdc(payer_id, amount)) return { error: "insufficient_usdc" };

  const paid: { party: string; share: number }[] = [];
  let dispensed = 0;
  splits.forEach((s, i) => {
    // the last party takes the rounding remainder so the whole amount moves
    const share = i === splits.length - 1
      ? Math.round((amount - dispensed) * 100) / 100
      : Math.round(amount * s.basis_points) / 10_000;
    dispensed += share;
    const recipient = s.party_type === "agent"
      ? (s.beneficiary_id ?? db.agents.find((a) => a.agent_id === s.party_id)?.owner_id ?? s.party_id)
      : s.party_id;
    Wallets.creditUsdc(recipient, share);
    db.settlements.push({
      settlement_id: newId("setl"), payer_id, payee: recipient,
      resource: `subgrid_split:${subgrid_id}`, amount: share, asset: "USDC",
      network: "neugrid", scheme: "exact", proof: `split:${s.party_id}`, status: "settled", created_at: nowISO(),
    });
    paid.push({ party: s.party_id, share });
  });
  void ChainSplits.distribute(subgrid_id, amount); // chain mirror — atomic on-chain split
  return { paid };
}

/** Full read model for a SubGrid: parent Grid, members, agents, jobs, access policy,
 *  resolved ownership splits, and (if `viewer` given) that user's membership/eligibility. */
export function subGridView(id: string, viewer?: string) {
  const subgrid = getSubGrid(id);
  if (!subgrid) return undefined;
  const grid = db.grids.find((g) => g.grid_id === subgrid.parent_grid_id) ?? null;
  const members = subgrid.members
    .map((uid) => db.users.find((u) => u.id === uid))
    .filter((u): u is UserProfile => !!u);
  const agents = (subgrid.agent_members ?? [])
    .map((aid) => db.agents.find((a) => a.agent_id === aid))
    .filter((a): a is Agent => !!a);
  const jobs: Job[] = db.jobs.filter((j) => j.subgrid_id === id);
  const splits = (subgrid.contributor_splits ?? []).map((s) => ({
    ...s,
    pct: s.basis_points / 100,
    name: nameOf(s.party_id),
    beneficiary_name: s.beneficiary_id ? nameOf(s.beneficiary_id) : undefined,
  }));
  // parent-Grid members not yet on the team — the admin's invite/splits candidates
  const memberSet = new Set(subgrid.members);
  const invite_candidates = db.users
    .filter((u) => !memberSet.has(u.id) && (grid?.owner_id === u.id || u.joined_grids?.includes(subgrid.parent_grid_id)))
    .map((u) => ({ id: u.id, username: u.username }));
  return {
    subgrid,
    grid,
    members,
    agents,
    jobs,
    splits,
    access: { access: subgrid.access ?? "open", min_reputation: subgrid.min_reputation ?? 0, min_grid: subgrid.min_grid ?? 0 },
    invite_candidates,
    viewer: viewer ? { id: viewer, is_member: subgrid.members.includes(viewer), is_admin: subgrid.admins.includes(viewer), can_join: canJoinSubGrid(id, viewer) } : null,
  };
}

export interface CreateSubGridInput {
  parent_grid_id: string;
  name: string;
  purpose: string;
  admin_id: string;
}

export function createSubGrid(input: CreateSubGridInput): SubGrid {
  const sub: SubGrid = {
    subgrid_id: newId("sub"),
    parent_grid_id: input.parent_grid_id,
    name: input.name,
    purpose: input.purpose,
    admins: [input.admin_id],
    members: [input.admin_id],
    campaigns: [],
    pulse_score: 0,
    created_at: nowISO(),
  };
  db.subgrids.push(sub);
  return sub;
}

export function joinGrid(grid_id: string, user_id: string): void {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  const user = db.users.find((u) => u.id === user_id);
  if (!grid || !user) return;
  if (!user.joined_grids.includes(grid_id)) {
    user.joined_grids.push(grid_id);
    grid.member_count += 1;
    if (!user.roles_by_grid.some((r) => r.grid_id === grid_id)) {
      user.roles_by_grid.push({ grid_id, role: "Contributor", granted_at: nowISO() });
    }
  }
}

export function leaveGrid(grid_id: string, user_id: string): void {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  const user = db.users.find((u) => u.id === user_id);
  if (!grid || !user) return;
  if (user.joined_grids.includes(grid_id)) {
    user.joined_grids = user.joined_grids.filter((id) => id !== grid_id);
    grid.member_count = Math.max(0, grid.member_count - 1);
    // keep any non-Contributor roles (e.g. founder); only drop the join role
    user.roles_by_grid = user.roles_by_grid.filter((r) => !(r.grid_id === grid_id && r.role === "Contributor"));
  }
}

export function isMember(grid_id: string, user_id: string): boolean {
  const user = db.users.find((u) => u.id === user_id);
  return !!user?.joined_grids.includes(grid_id);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "grid"
  );
}
