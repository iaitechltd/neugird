/**
 * Ventures — the AGENT COMPANY layer.
 *
 * A builder (someone who has shipped ≥1 Echo build) forms a company of agents:
 * a CEO-agent orchestrates, and specialist department agents (marketing /
 * content / finance / build) do the work. The owner sets objectives in plain
 * English and funds a GRID treasury; the CEO decomposes each objective into
 * internal tasks its team delivers, paying a small GRID compute cost per cycle
 * (the agent-company sink). The linked product's revenue flows back into the
 * treasury — the self-funding loop.
 *
 * This is the thin ORCHESTRATION layer. The employees are real Agents, the
 * treasury is a real Wallet, the cap table is ContributorSplit, delegation is
 * the Jobs primitive — all pre-existing. Internal work is unpaid (reward 0) and
 * confers NO reputation: an owner's own agents doing the owner's own work must
 * not mint free rep (the same anti-farm invariant Jobs enforces via the
 * self-deal gate). Reputation is earned from EXTERNAL paid work, not here.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Agents from "./agents";
import * as Jobs from "./jobs";
import * as Wallets from "./wallets";
import * as Params from "./params";
import * as Echo from "./echo";
import * as Feed from "./feed";
import * as GridX from "./gridx";
import * as GridMarket from "./gridMarket";
import * as Messaging from "./messaging";
import * as Genesis from "./genesis";
import * as Brain from "../brain";
import type {
  Agent, AgentPersona, ContributorSplit, Job, Venture, VentureApproval, VentureDept, VentureEvent, VentureObjective, VentureReport, VentureReportItem, VentureSeat,
} from "../types";

const LOG_MAX = 40;
const REPORTS_MAX = 50;    // durable per-cycle reports kept — the complete archive (the log stays a short recent feed)
const RECRUIT_PULSE = 25;  // reputation bounty on an open recruit job (Pulse — no treasury debit, no mint risk; real rep for real help)

// Per-venture / per-approval in-flight guards — a real mutex in the single-instance
// process so two concurrent requests (e.g. a double-click during the multi-second LLM
// calls) can't double-charge, double-work, double-ship, or mint GRID. Transient runtime
// state, intentionally NOT persisted.
const cyclesInFlight = new Set<string>();
const approvalsInFlight = new Set<string>();
const clip = (s: string, n = 52): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* -------------------------------- templates ------------------------------- */
// A template is a ready-made org chart: the CEO seat plus specialist seats, each
// with a persona the department agent is created from. "Own your team, built
// from our templates" — the low-friction door (vs. writing every persona).

interface SeatTemplate {
  dept: VentureDept;
  title: string;
  capabilities: string[];
  persona: AgentPersona;
}
export interface VentureTemplate {
  id: string;
  name: string;
  tagline: string;
  seats: SeatTemplate[]; // seats[0] is always the CEO
}

const CEO_SEAT: SeatTemplate = {
  dept: "ceo",
  title: "CEO",
  capabilities: ["strategy", "operations", "delegation"],
  persona: {
    role: "Chief executive",
    bio: "Runs the company: turns the owner's objectives into a plan and delegates it to the team.",
    personality: "decisive, outcome-driven, concise",
    goals: "advance every objective the owner sets, on budget",
    style: "brief, plainspoken, action-first",
    knowledge: ["strategy", "operations", "prioritisation"],
  },
};

const SEATS: Record<Exclude<VentureDept, "ceo">, SeatTemplate> = {
  marketing: {
    dept: "marketing", title: "Head of marketing", capabilities: ["growth", "marketing", "distribution"],
    persona: { role: "Growth strategist", bio: "Owns acquisition and distribution.", personality: "creative, data-aware", goals: "acquire the right users efficiently", style: "punchy, channel-specific", knowledge: ["growth", "content distribution", "funnels"] },
  },
  content: {
    dept: "content", title: "Head of content", capabilities: ["content", "writing", "social"],
    persona: { role: "Content lead", bio: "Produces the narrative and the assets.", personality: "articulate, on-brand", goals: "tell the product's story clearly", style: "clear, engaging", knowledge: ["copywriting", "social", "editorial"] },
  },
  finance: {
    dept: "finance", title: "Head of finance", capabilities: ["finance", "accounting", "analytics"],
    persona: { role: "Finance lead", bio: "Owns the budget, spend, and unit economics.", personality: "rigorous, skeptical", goals: "keep the company solvent and efficient", style: "precise, numbers-first", knowledge: ["budgeting", "accounting", "reporting"] },
  },
  build: {
    dept: "build", title: "Head of engineering", capabilities: ["engineering", "product", "build"],
    persona: { role: "Engineering lead", bio: "Ships and improves the product.", personality: "pragmatic, quality-focused", goals: "ship the highest-leverage improvements", style: "technical, direct", knowledge: ["product", "engineering", "shipping"] },
  },
};

export const TEMPLATES: VentureTemplate[] = [
  { id: "solo-saas", name: "Solo SaaS", tagline: "The full company — market, write, ship, and keep the books.", seats: [CEO_SEAT, SEATS.build, SEATS.marketing, SEATS.content, SEATS.finance] },
  { id: "launch-team", name: "Launch team", tagline: "Get a product to market: build + growth, lean.", seats: [CEO_SEAT, SEATS.build, SEATS.marketing] },
  { id: "content-studio", name: "Content studio", tagline: "A storytelling shop: content + distribution.", seats: [CEO_SEAT, SEATS.content, SEATS.marketing] },
];

export function listTemplates(): VentureTemplate[] {
  return TEMPLATES;
}

/* ------------------------------- eligibility ------------------------------ */

/** Only builders (≥1 shipped Echo build) may form a company — merit opens the gate. */
export function eligible(owner_id: string): { ok: boolean; reason?: string; builds: number } {
  const builds = db.builds.filter((b) => b.owner_id === owner_id).length;
  return builds > 0 ? { ok: true, builds } : { ok: false, reason: "need_a_build", builds: 0 };
}

/* --------------------------------- create --------------------------------- */

export interface CreateVentureInput {
  owner_id: string;
  name: string;
  mission?: string;
  template?: string;
  build_id?: string;
  fund_grid?: number; // optionally seed the treasury from the owner's GRID at create
}

export function createVenture(input: CreateVentureInput): { venture?: Venture; error?: string } {
  const owner_id = input.owner_id;
  const gate = eligible(owner_id);
  if (!gate.ok) return { error: gate.reason ?? "not_eligible" };

  const name = (input.name || "").trim().slice(0, 60) || "Untitled venture";
  const tpl = TEMPLATES.find((t) => t.id === input.template) ?? TEMPLATES[0];
  const build = input.build_id ? db.builds.find((b) => b.build_id === input.build_id && b.owner_id === owner_id) : undefined;
  const mission = (input.mission || build?.summary || "").trim().slice(0, 240);

  const venture_id = newId("ven");
  // Protocol-managed sink → the "neugrid:" prefix keeps it OUT of the dev faucet
  // (Wallets.get seeds real user wallets, never neugrid:* sinks). Treasury starts at 0.
  const treasury_id = `neugrid:ven:${venture_id}`;

  // hire the team: each seat is a real native agent created from the template persona
  const seats: VentureSeat[] = [];
  let ceo_agent_id: string | undefined;
  for (const st of tpl.seats) {
    const agent = Agents.createAgent({
      owner_id,
      name: `${name} · ${st.title}`,
      capabilities: st.capabilities,
      permissions: ["venture:work"],
    });
    agent.persona = { ...st.persona };
    if (st.dept === "ceo") ceo_agent_id = agent.agent_id;
    seats.push({ agent_id: agent.agent_id, dept: st.dept, title: st.title });
  }

  const splits: ContributorSplit[] = [{ party_id: owner_id, party_type: "user", basis_points: 10000, role: "Founder" }];

  const venture: Venture = {
    venture_id,
    owner_id,
    name,
    mission,
    template: tpl.id,
    build_id: build?.build_id,
    status: "active",
    treasury_id,
    ceo_agent_id,
    seats,
    objectives: [],
    contributor_splits: splits,
    approvals: [],
    require_approval: true, // safe by default — the crew checks with the owner before big moves
    cycles: 0,
    revenue_grid: 0,
    // baseline the self-funding mark so only sales after formation fund the company
    revenue_synced_usdc: build?.product_id && GridX.getProduct(build.product_id) ? GridX.revenueFor(build.product_id) : 0,
    spent_grid: 0,
    log: [],
    created_at: nowISO(),
  };
  (db.ventures ??= []).unshift(venture);
  pushEvent(venture, { kind: "created", text: `${name} formed from the "${tpl.name}" template — ${seats.length} seats hired (CEO + ${seats.length - 1} specialists).` });

  // optional treasury seed from the owner's GRID
  const fund = Math.max(0, Math.floor(input.fund_grid ?? 0));
  if (fund > 0) fundTreasury(venture_id, owner_id, fund);

  return { venture };
}

/* -------------------------------- treasury -------------------------------- */

/** Deposit GRID from the owner's wallet into the company treasury. */
export function fundTreasury(venture_id: string, owner_id: string, amount: number): { balance?: number; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  if (!Number.isFinite(amount)) return { error: "invalid_amount" }; // NaN/Inf never reach the ledger
  const amt = Math.max(0, Math.floor(amount));
  if (amt <= 0) return { error: "invalid_amount" };
  if (!Wallets.debitGrid(owner_id, amt)) return { error: "insufficient_grid" };
  Wallets.creditGrid(v.treasury_id, amt);
  pushEvent(v, { kind: "fund", text: `Owner funded the treasury with ${amt} GRID.`, amount_grid: amt });
  v.updated_at = nowISO();
  return { balance: Wallets.balances(v.treasury_id).grid };
}

/* -------------------------------- product --------------------------------- */

/** The owner's Echo builds — the products a company can be pointed at to run. */
export function linkableBuilds(owner_id: string) {
  return db.builds
    .filter((b) => b.owner_id === owner_id)
    .map((b) => ({ build_id: b.build_id, title: b.title, summary: b.summary, deployed: !!b.deployment?.slug, slug: b.deployment?.slug ?? null }));
}

/** Point the company at one of the owner's real built products (or clear it). The
 *  CEO grounds every cycle's work in it — "a builder hands their product to a team". */
export function linkProduct(venture_id: string, owner_id: string, build_id: string | null): { venture?: Venture; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  if (build_id === null) {
    v.build_id = undefined;
    pushEvent(v, { kind: "objective", text: "Product unlinked — the team is running without a product for now." });
    v.updated_at = nowISO();
    return { venture: v };
  }
  const build = db.builds.find((b) => b.build_id === build_id && b.owner_id === owner_id);
  if (!build) return { error: "build_not_found" };
  v.build_id = build.build_id;
  // baseline the revenue mark: only sales AFTER the company takes the product count
  v.revenue_synced_usdc = productRevenueUsdc(v);
  pushEvent(v, { kind: "objective", text: `Product linked: "${build.title}" — the team now runs it.` });
  v.updated_at = nowISO();
  return { venture: v };
}

// recordRevenue() was removed (finding L11): it credited treasury GRID with no matching
// debit and no supply/pool accounting — a latent unaccounted GRID mint. It was dead code
// (zero callers) — syncRevenue() replaced it with the conserving AMM-backed loop below.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether this company gates its big actions (Echo ships + wire posts) behind the
 *  owner's sign-off. Default ON (safe) — set require_approval false for full autonomy. */
function gatesApproval(v: Venture): boolean {
  return v.require_approval !== false;
}

/** The GridX product the company's linked build is listed as (if any). The build↔product
 *  link is authoritative on the build record (set when it's published to GridX). */
function productIdFor(v: Venture): string | undefined {
  if (!v.build_id) return undefined;
  const build = db.builds.find((b) => b.build_id === v.build_id);
  const pid = build?.product_id;
  return pid && GridX.getProduct(pid) ? pid : undefined;
}

/** All-time real USDC the linked product has earned its owner (net of protocol fee),
 *  derived from settled purchase receipts — never a stored counter. 0 if unlisted. */
export function productRevenueUsdc(v: Venture): number {
  const pid = productIdFor(v);
  return pid ? GridX.revenueFor(pid) : 0;
}

export interface RevenueResult { synced_usdc?: number; grid_in?: number; balance?: number; skipped?: boolean; reason?: string; error?: string }

/**
 * The self-funding loop, made real. The company's linked product earns USDC (into the
 * owner's wallet, as normal); a governable SHARE of the NEW revenue since the last sync
 * is reinvested into the treasury — bought as GRID through the real GRID/USDC AMM (one
 * unit across the whole company, actual pool + price impact, no minting). Only revenue
 * earned AFTER the product was linked counts (baselined at link time). The reinvest is
 * capped at the owner's available USDC; the high-water mark only advances for revenue
 * actually recognized, so a shortfall simply catches up next time. Conservation holds:
 * pool GRID → treasury, owner USDC → pool (+ swap fee → protocol treasury).
 */
export function syncRevenue(venture_id: string): RevenueResult {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  const pid = productIdFor(v);
  if (!pid) return { skipped: true, reason: "no_product" };

  const total = GridX.revenueFor(pid);
  const synced = v.revenue_synced_usdc ?? 0;
  const newRev = round2(total - synced);
  if (newRev <= 0) return { skipped: true, reason: "no_new_revenue" };

  const rate = Params.get("venture_revenue_share_bps") / 10_000;
  if (rate <= 0) { v.revenue_synced_usdc = total; return { skipped: true, reason: "share_zero" }; }

  const desired = round2(newRev * rate);
  const avail = round2(Wallets.get(v.owner_id).usdc);
  const pull = Math.min(desired, avail);
  if (pull < 0.01) return { skipped: true, reason: "owner_no_usdc" };

  // convert the owner's product USDC → GRID via the real AMM, then move it to the treasury
  const sw = GridMarket.swap(v.owner_id, "buy", pull);
  if (sw.error || !sw.out || sw.out <= 0) return { skipped: true, reason: sw.error ?? "swap_failed" };
  const gridIn = sw.out;
  if (!Wallets.debitGrid(v.owner_id, gridIn)) return { skipped: true, reason: "transfer_failed" };
  Wallets.creditGrid(v.treasury_id, gridIn);

  v.revenue_grid = round2((v.revenue_grid ?? 0) + gridIn);
  // recognize the portion of newRev this pull covers (proportional if the owner was USDC-short)
  const recognized = Math.min(newRev, round2(pull / rate));
  v.revenue_synced_usdc = round2(synced + recognized);

  const build = db.builds.find((b) => b.build_id === v.build_id);
  pushEvent(v, {
    kind: "revenue",
    text: `Product revenue: $${pull.toFixed(2)} from "${clip(build?.title ?? "the product", 28)}" reinvested → +${Math.round(gridIn)} GRID into the treasury.`,
    amount_grid: Math.round(gridIn),
  });
  v.updated_at = nowISO();
  return { synced_usdc: pull, grid_in: gridIn, balance: Wallets.balances(v.treasury_id).grid };
}

/* ------------------------------- objectives ------------------------------- */

/** The owner hands the company a goal in plain English; the CEO works it next cycle. */
export function addObjective(venture_id: string, owner_id: string, text: string): { objective?: VentureObjective; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  const t = (text || "").trim().slice(0, 240);
  if (!t) return { error: "empty" };
  const objective: VentureObjective = { objective_id: newId("obj"), text: t, status: "queued", created_at: nowISO(), tasks_total: 0, tasks_done: 0 };
  v.objectives.unshift(objective);
  pushEvent(v, { kind: "objective", text: `New objective: "${clip(t, 80)}"` });
  v.updated_at = nowISO();
  return { objective };
}

/* ----------------------------- the orchestration -------------------------- */
// One cycle: the CEO takes the next queued objective, decomposes it into one task
// per department seat, and each specialist agent delivers it. The treasury pays a
// GRID compute cost per cycle; if it can't, the cycle HOLDS and asks the owner to
// fund it (the economy is real — a company that can't pay its bills stops).

/** Rule-based CEO planner: one task per non-CEO seat, phrased for that department.
 *  This is the brain SEAM — a model brain writes richer, objective-specific plans
 *  later behind the same shape; the rule-based plan always works. */
function planTasks(objective: string, seats: VentureSeat[]): { seat: VentureSeat; title: string; desc: string }[] {
  const o = objective;
  const phrasing: Record<Exclude<VentureDept, "ceo">, { title: string; desc: string }> = {
    marketing: { title: `Acquisition push — ${clip(o, 40)}`, desc: `Map the marketing plan toward the objective "${o}": pick the channels, frame the angle, and set the funnel in motion.` },
    content: { title: `Content plan — ${clip(o, 40)}`, desc: `Produce the content that serves "${o}": the narrative, the assets, and the publishing cadence.` },
    finance: { title: `Budget & tracking — ${clip(o, 40)}`, desc: `Set the budget and track spend/return for "${o}": allocate the treasury, watch burn, and report the unit economics.` },
    build: { title: `Product work — ${clip(o, 40)}`, desc: `Ship the product changes that advance "${o}": prioritise the highest-leverage improvements and implement them.` },
  };
  return seats
    .filter((s) => s.dept !== "ceo")
    .map((seat) => ({ seat, ...phrasing[seat.dept as Exclude<VentureDept, "ceo">] }));
}

/** An honest, persona-grounded record of what the department agent did — no
 *  fabricated metrics (the brain writes substantive deliverables once wired). */
function deliverable(agentName: string, dept: VentureDept, objective: string): string {
  const verb: Record<VentureDept, string> = {
    ceo: "coordinated", marketing: "ran a growth pass on", content: "produced content for",
    finance: "budgeted and tracked", build: "shipped product work for",
  };
  return `[${agentName}] ${verb[dept]} "${clip(objective, 60)}" — autonomous run, artifacts attached for the CEO's review.`;
}

/** Internal delegation: create the Job record, assign it to the seat's agent, and
 *  accept the synthesized deliverable. reward 0 / no rep (anti-farm: internal work
 *  on the owner's own agents mints nothing) — the value is the product + revenue. */
function delegate(v: Venture, seat: VentureSeat, title: string, desc: string, brainDeliverable?: string): { job_id: string; deliverable: string } | null {
  const agent = Agents.getAgent(seat.agent_id);
  if (!agent) return null;
  const job = Jobs.createJob({
    context: "subgrid_task",
    title,
    description: desc,
    required_skills: agent.capabilities.slice(0, 3),
    executor_kind: "agent",
    reward_amount: 0,
    reward_token: "Pulse",
    created_by: v.owner_id,
  });
  const out = brainDeliverable && brainDeliverable.trim() ? brainDeliverable.trim() : deliverable(agent.name, seat.dept, title);
  job.assignee_id = agent.agent_id;
  job.assignee_type = "agent";
  job.proof = { kind: job.proof_required, payload: out, submitted_at: nowISO() };
  job.status = "approved"; // the CEO accepts its own team's internal work
  job.updated_at = nowISO();
  if (!agent.task_history.includes(job.job_id)) agent.task_history.push(job.job_id);
  return { job_id: job.job_id, deliverable: out };
}

/* --- RECRUIT: the crew brings in real help by posting a REAL open job --- */

/** The product shape used to frame a recruit post (title + live URL if deployed). */
function productShape(v: Venture): { title: string; url?: string } | null {
  const build = v.build_id ? db.builds.find((b) => b.build_id === v.build_id) : undefined;
  return build ? { title: build.title, url: build.deployment?.slug ? `/d/${build.deployment.slug}` : undefined } : null;
}
function recruitSkills(v: Venture, agent_id?: string): string[] {
  const agent = agent_id ? Agents.getAgent(agent_id) : undefined;
  const build = v.build_id ? db.builds.find((b) => b.build_id === v.build_id) : undefined;
  return (agent?.capabilities ?? build?.stack ?? []).slice(0, 4);
}
/** The public description for a recruit job — frames it as helping the company grow. */
function recruitBody(v: Venture, product: { title: string; url?: string } | null, ask: string): string {
  const what = product ? `“${product.title}”${product.url ? ` (live at ${product.url})` : ""}` : (v.mission || "the project");
  return `${ask}\n\nPosted by ${v.name}'s crew to help grow ${what}. Deliver real, verifiable work — ${v.name}'s owner reviews submissions and awards reputation for genuine help.`.slice(0, 1600);
}
/** Post the recruit job on the community board. When `paid`, escrow a REAL bounty: sell a GRID
 *  slice of the treasury for USDC and fund the job's escrow — the proven USDC job-escrow path
 *  pays the real worker on the owner's delivery approval (and refunds on rejection). Conserved:
 *  a real AMM sell, no mint. Falls back to reputation (Pulse) when unpaid / unaffordable / dry.
 *  The Jobs self-deal gate blocks the owner's own agents from farming it either way. */
function createRecruitJob(v: Venture, title: string, description: string, skills: string[], paid: boolean): { job: Job; bountyGrid?: number; bountyUsdc?: number } {
  const base = { context: "talent_contract" as const, title: clip(title, 90), description, required_skills: skills.slice(0, 4), executor_kind: "any" as const, created_by: v.owner_id };
  if (paid) {
    const bountyGrid = Params.get("venture_bounty_grid");
    if (bountyGrid > 0 && Wallets.balances(v.treasury_id).grid >= bountyGrid) {
      const sw = GridMarket.swap(v.treasury_id, "sell", bountyGrid); // treasury GRID → treasury USDC (real trade)
      const usdc = round2(sw.out ?? 0);
      if (usdc > 0) {
        const fj = Jobs.postFundedJob({ ...base, reward_amount: usdc }, v.treasury_id); // escrows the USDC bounty
        if (fj.job) { v.spent_grid = round2((v.spent_grid ?? 0) + bountyGrid); return { job: fj.job, bountyGrid, bountyUsdc: usdc }; }
        // couldn't fund → the swapped USDC stays in the treasury; fall through to a reputation post
      }
    }
  }
  return { job: Jobs.createJob({ ...base, reward_amount: RECRUIT_PULSE, reward_token: "Pulse" }) };
}
/* --- REACH: the crew sends a real outreach DM to a relevant user (always owner-approved) --- */

/** Real users worth reaching — community leaders (grid owners) + high-reputation builders —
 *  excluding the owner, the venture's own wallets, and anyone already contacted (no spam). */
function outreachCandidates(v: Venture): { id: string; name: string; why: string }[] {
  const reached = new Set((v.approvals ?? []).filter((a) => a.action === "outreach_dm" && a.to_id).map((a) => a.to_id));
  const gridOwners = new Map<string, string>();
  for (const g of db.grids) if (g.owner_id && g.owner_id !== v.owner_id && !gridOwners.has(g.owner_id)) gridOwners.set(g.owner_id, g.name);
  return db.users
    .filter((u) => u.id !== v.owner_id && !reached.has(u.id) && !u.id.startsWith("neugrid:"))
    .map((u) => {
      const rep = Math.round(Math.max(u.pulse_score ?? 0, u.reputation?.total ?? 0));
      const grid = gridOwners.get(u.id);
      return { id: u.id, name: u.username ?? u.id, why: grid ? `runs the “${grid}” community` : `${rep} reputation builder`, reach: (grid ? 100000 : 0) + rep };
    })
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 6)
    .map(({ id, name, why }) => ({ id, name, why }));
}
/** A safe outreach message if the brain is unavailable — real names + product only, no fabrication. */
function outreachFallback(v: Venture, product: { title: string; summary?: string } | null, cand: { name: string; why: string }): string {
  const p = product ? `${product.title}${product.summary ? ` — ${clip(product.summary, 90)}` : ""}` : "a new product";
  return `Hi ${cand.name}, I'm reaching out from ${v.name}. We're building ${p}, and given that you ${cand.why}, I thought there could be a real fit. Would you be open to a short conversation about ways we might help each other grow?`;
}

/** Mark a report's pending item done once its gated action executes — keeps the archive accurate. */
function completeReportItem(v: Venture, report_id: string | undefined, agent_id: string | undefined, patch: Partial<VentureReportItem>): void {
  if (!report_id) return;
  const rep = (v.reports ?? []).find((r) => r.report_id === report_id);
  if (!rep) return;
  const item = rep.items.find((it) => it.status === "pending_approval" && (!agent_id || it.agent_id === agent_id));
  if (item) Object.assign(item, patch);
  rep.actions = rep.items.filter((it) => it.status === "done" && (it.action === "shipped" || it.action === "posted" || it.action === "recruited" || it.action === "reached" || it.action === "raised")).length;
}

export interface CycleResult { ok: boolean; reason?: string; objective_id?: string; tasks?: number; cost?: number; balance?: number; brain?: boolean; error?: string }

/* --- specialist domains, tools, memory, and real grounding --- */

const DOMAIN: Record<VentureDept, string> = { ceo: "operations", marketing: "marketing", content: "content", finance: "finance", build: "engineering" };
const TOOL: Record<VentureDept, string> = { ceo: "", marketing: "web research", content: "drafted", finance: "computed", build: "spec → Echo" };

/** The authoritative, REAL numbers the finance specialist must work from (never invents). */
function financeFacts(v: Venture): string {
  const t = Wallets.balances(v.treasury_id).grid;
  const cost = Params.get("venture_cycle_cost_grid");
  const runway = cost > 0 ? Math.floor(t / cost) : Infinity;
  const funded = Math.max(0, t + (v.spent_grid ?? 0) - (v.revenue_grid ?? 0));
  return [
    "AUTHORITATIVE NUMBERS (use ONLY these; do not invent any others):",
    `- Treasury balance: ${t} GRID`,
    `- Compute cost per cycle: ${cost} GRID`,
    `- Runway at current burn: ${runway === Infinity ? "unlimited" : `${runway} cycles`}`,
    `- Cumulative compute spent: ${v.spent_grid ?? 0} GRID`,
    `- Product revenue to date: ${v.revenue_grid ?? 0} GRID`,
    `- Owner funding to date: ${funded} GRID`,
    "GRID is the company's internal accounting unit. If the objective implies real-world money (ad spend, salaries), denominate that in USD and keep it separate from the GRID treasury above.",
  ].join("\n");
}

/** The agent's own track record in its domain — passed back so a specialist builds on
 *  (rather than repeats) its prior work. Real memory that makes it sharper over cycles. */
function expertiseOf(agent: Agent | undefined, dept: VentureDept): string | undefined {
  if (!agent) return undefined;
  const domain = DOMAIN[dept];
  const total = (agent.skill_library ?? []).filter((s) => s.domain.toLowerCase() === domain.toLowerCase()).reduce((a, s) => a + s.uses, 0);
  return total > 0 ? `${total} prior ${domain} deliveries for this company` : undefined;
}

/** A specialist sharpens in its domain each time it delivers (skill mastery grows). */
function growSkill(agent_id: string, dept: VentureDept): void {
  const agent = Agents.getAgent(agent_id);
  if (!agent) return;
  const domain = DOMAIN[dept];
  const lib = (agent.skill_library ??= []);
  const existing = lib.find((s) => s.domain.toLowerCase() === domain.toLowerCase());
  if (existing) { existing.uses += 1; existing.updated_at = nowISO(); return; }
  lib.unshift({ skill_id: newId("skill"), title: `${domain} operator`.slice(0, 80), domain, recipe: `Reusable ${domain} approach honed running this company's work cycles.`, uses: 1, created_at: nowISO() });
  if (lib.length > 60) agent.skill_library = lib.slice(0, 60);
}

/** Run async tasks with a concurrency cap — the specialists work in parallel, but a
 *  bounded burst so a big team can't trip the model's rate limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, worker));
  return out;
}

/** Advance the company one cycle. A REAL agent graph: the CEO decomposes the objective
 *  into per-department briefs (Brain.ceoPlan), then each specialist runs its OWN brain on
 *  its brief IN PARALLEL (Brain.specialistWork) with a deep domain prompt — finance grounded
 *  in real numbers, each agent building on its own track record. Rule-based fallback so a
 *  cycle ALWAYS completes. */
export async function runCycle(venture_id: string): Promise<CycleResult> {
  if (cyclesInFlight.has(venture_id)) return { ok: false, reason: "busy" }; // a cycle is already running
  cyclesInFlight.add(venture_id);
  try { return await runCycleInner(venture_id); }
  finally { cyclesInFlight.delete(venture_id); }
}

async function runCycleInner(venture_id: string): Promise<CycleResult> {
  const v = get(venture_id);
  if (!v) return { ok: false, error: "not_found" };
  if (v.status !== "active") return { ok: false, reason: "not_active" };

  const objective = v.objectives.find((o) => o.status === "queued" || o.status === "running");
  if (!objective) {
    pushEvent(v, { kind: "hold", text: "No objectives queued — give the company a goal and it'll get to work." });
    return { ok: false, reason: "no_objectives" };
  }

  // pull in any new product revenue FIRST — a company that's earning funds its own cycle
  // (the self-funding loop). Wrapped so a revenue-sync hiccup can never block the work.
  try { syncRevenue(venture_id); } catch { /* non-fatal */ }

  // can the company afford this cycle's compute? (check up front — don't burn a CEO call if broke)
  const cost = Params.get("venture_cycle_cost_grid");
  if (cost > 0 && Wallets.balances(v.treasury_id).grid < cost) {
    pushEvent(v, { kind: "hold", text: `Treasury can't cover this cycle's ${cost} GRID compute — fund it to keep the company running.` });
    return { ok: false, reason: "treasury_empty", cost, balance: Wallets.balances(v.treasury_id).grid };
  }

  objective.status = "running";

  const build = v.build_id ? db.builds.find((b) => b.build_id === v.build_id) : undefined;
  const product = build ? { title: build.title, summary: build.summary, stack: build.stack, url: build.deployment?.slug ? `/d/${build.deployment.slug}` : undefined } : null;
  const deptSeats = v.seats.filter((s) => s.dept !== "ceo");

  // 1) the CEO decomposes the objective into per-department briefs (it does NOT do the work)
  const plan = await Brain.ceoPlan({
    company: v.name,
    mission: v.mission || undefined,
    product,
    departments: deptSeats.map((s) => ({ dept: s.dept, title: s.title, role: Agents.getAgent(s.agent_id)?.persona?.role ?? s.title })),
    objective: objective.text,
  });

  type Assignment = { seat: VentureSeat; dept: VentureDept; task: string };
  let assignments: Assignment[] = [];
  let ceoLine = "";
  const usedBrain = !!(plan && plan.assignments.length);
  if (usedBrain) {
    assignments = plan!.assignments
      .map((a): Assignment | null => {
        const seat = deptSeats.find((s) => s.dept === a.dept);
        return seat ? { seat, dept: seat.dept, task: a.task } : null;
      })
      .filter((x): x is Assignment => x !== null);
    ceoLine = `CEO: ${plan!.summary}`;
  }
  if (!assignments.length) {
    assignments = planTasks(objective.text, v.seats).map((p) => ({ seat: p.seat, dept: p.seat.dept, task: p.desc }));
    ceoLine = `CEO broke "${clip(objective.text, 60)}" into ${assignments.length} brief(s) and delegated to the team.`;
  }

  // settle the cycle's compute bill (treasury → protocol sink). ONLY credit the sink if
  // the treasury actually paid — an unconditional credit would mint GRID if the balance
  // dropped (e.g. a concurrent approval ship) between the affordability check and here.
  if (cost > 0) {
    if (!Wallets.debitGrid(v.treasury_id, cost)) {
      objective.status = "queued"; // release the objective so it can retry once funded
      pushEvent(v, { kind: "hold", text: `Treasury can't cover this cycle's ${cost} GRID compute — fund it to keep the company running.` });
      return { ok: false, reason: "treasury_empty", cost, balance: Wallets.balances(v.treasury_id).grid };
    }
    Wallets.creditGrid(Wallets.TREASURY, cost);
    v.spent_grid = (v.spent_grid ?? 0) + cost;
    pushEvent(v, { kind: "spend", text: `Paid ${cost} GRID compute — ${assignments.length} specialist${assignments.length === 1 ? "" : "s"} briefed this cycle.`, amount_grid: cost });
  }

  pushEvent(v, { kind: "delegated", text: clip(ceoLine, 160), agent_id: v.ceo_agent_id });

  // 2) every specialist runs its OWN brain on its brief — parallel, capped at 2 concurrent.
  //    The BUILD agent, when a product is linked and the treasury can afford it, doesn't just
  //    write a spec — it SHIPS a real new version of the product through Echo (real code + proof).
  type Ship = { version: number; cost: number };
  type Pub = { post_id: string };
  type Recruit = { job_id: string; title: string };
  type Raise = { title: string; summary: string; category: string; ask_amount: number; roadmap: { title: string; description: string; amount: number }[] };
  type Propose = { action: "echo_ship" | "wire_post" | "recruit_job" | "outreach_dm" | "open_raise"; summary: string; detail: string; amount_grid?: number; to_id?: string; to_name?: string; raise?: Raise };
  type Out = { a: Assignment; out: { title: string; deliverable: string } | null; ship: Ship | null; published: Pub | null; recruited: Recruit | null; propose: Propose | null };
  const PUBLISH_INTENT = /\b(post|posts|publish|published|announce|announcement|wire|share|social|tweet|thread|blog|launch)\b/i;
  const RECRUIT_INTENT = /\b(recruit|recruiting|hire|hiring|find help|bring on|team up|contributor|contributors|freelancer|designer|developer|engineer|writer|marketer|specialist|onboard|staff up)\b/i;
  const REACH_INTENT = /\b(reach out|reaching out|outreach|message|contact|get in touch|connect with|partner|partnership|influencer|creator|collab|collaborate|introduce)\b/i;
  const FUND_INTENT = /\b(fundrais|funding|raise (capital|money|funding|a round|from)|raise for|seek(ing)? (funding|investment|capital|backers)|investment|investors?|backers|capital|genesis|get funded|open a raise)\b/i;
  const gate = gatesApproval(v); // when ON, big actions become approvals instead of firing now
  const outputs = await mapLimit(assignments, 2, async (a): Promise<Out> => {
    const base: Out = { a, out: null, ship: null, published: null, recruited: null, propose: null };
    if (!usedBrain) return base;
    const agent = Agents.getAgent(a.seat.agent_id);

    const wantsShip = a.dept === "build" && !!v.build_id && Brain.activeBrain() && Wallets.balances(v.treasury_id).grid >= Echo.revisionCost();

    // autonomous ship (only when the owner has NOT gated it) — ships real code right now
    if (wantsShip && !gate) {
      const r = await Echo.reviseBuild({ build_id: v.build_id!, owner_id: v.owner_id, instruction: a.task, payer_id: v.treasury_id }).catch(() => null);
      if (r?.build && !r.error) {
        const rev = r.build.revisions?.[r.build.revisions.length - 1];
        const s: Ship = { version: r.build.version ?? 1, cost: r.cost ?? Echo.revisionCost() };
        const deliverable = `Shipped v${s.version} of "${r.build.title}" — ${rev?.files_changed ?? 0} file(s) changed.\n\n${r.build.summary}${rev?.notes ? `\n\nChangelog: ${rev.notes}` : ""}\n\nThis is a new version in the build's history; it goes live when you deploy it.`;
        return { ...base, out: { title: `Shipped v${s.version} — ${clip(a.task, 40)}`, deliverable }, ship: s };
      }
      // Echo ship unavailable (no files / synthesis failed / limit) → fall through to the spec path
    }

    // REACH — draft a real outreach DM to a relevant user. ALWAYS owner-approved (even in
    // full autonomy): a message to a real third party only ever sends when the owner says so.
    // Marketing owns outreach (one seat) → at most one outreach per cycle, no duplicates.
    if (a.dept === "marketing" && REACH_INTENT.test(a.task)) {
      const cand = outreachCandidates(v)[0];
      if (cand) {
        const facts = `OUTREACH TARGET — write a short, warm, SPECIFIC direct message to this exact person (address them by name, 3–5 sentences, propose ONE concrete way to help each other, no fluff, invent nothing):\nName: ${cand.name}\nWhy relevant: ${cand.why}`;
        const draft = await Brain.specialistWork({
          company: v.name, mission: v.mission || undefined, product, objective: objective.text,
          dept: a.dept, role: agent?.persona?.role ?? a.seat.title,
          task: `Write a personal outreach DM to ${cand.name} to help grow the product.`, facts, expertise: expertiseOf(agent, a.dept),
        }).catch(() => null);
        const msg = draft?.deliverable?.trim() ? draft.deliverable.trim() : outreachFallback(v, product, cand);
        return { ...base, out: { title: `Outreach to ${cand.name}`, deliverable: msg }, propose: { action: "outreach_dm", summary: `Reach out to ${cand.name} — ${cand.why}`, detail: msg, to_id: cand.id, to_name: cand.name } };
      }
      // no candidate available → fall through to normal delivery
    }

    // FUND — draft a real funding raise for the product. ALWAYS owner-approved: opening a
    // public raise is a big commitment, so it only goes live when the owner says so. Finance
    // owns it (one seat) → at most one raise draft per cycle, and never while one is already open.
    if (a.dept === "finance" && FUND_INTENT.test(a.task) && v.build_id) {
      const build = db.builds.find((b) => b.build_id === v.build_id);
      const alreadyRaising = !!build?.proposal_id || (v.approvals ?? []).some((ap) => ap.action === "open_raise" && ap.status === "pending");
      if (!alreadyRaising) {
        const dr = await Echo.draftProposal(v.build_id, v.owner_id).catch(() => null);
        if (dr?.draft) {
          const d = dr.draft;
          const roadmap = d.milestones.map((m) => ({ title: m.title, description: m.description, amount: m.amount_usdc }));
          const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
          const detail = `${d.pitch}\n\nAsk: ${money(d.ask_usdc)} · ${d.milestones.length} milestone${d.milestones.length === 1 ? "" : "s"}:\n${d.milestones.map((m) => `• ${m.title} — ${money(m.amount_usdc)}`).join("\n")}`;
          return { ...base, out: { title: `Raise for ${d.title}`, deliverable: detail }, propose: { action: "open_raise", summary: `Open a raise — ${clip(d.title, 40)} · ${money(d.ask_usdc)}`, detail, raise: { title: d.title, summary: d.pitch, category: d.category, ask_amount: d.ask_usdc, roadmap } } };
        }
      }
      // couldn't draft (no files / brain inactive / already raising) → fall through to normal delivery
    }

    // gather the specialist's grounding facts: finance gets the real numbers; marketing
    // does LIVE WEB RESEARCH (real channels/communities/competitors) before it writes.
    let facts: string | undefined;
    if (a.dept === "finance") {
      facts = financeFacts(v);
    } else if (a.dept === "marketing") {
      const query = `Market research for the goal "${objective.text}". Product: ${product ? `${product.title} — ${product.summary}${product.url ? ` (live at ${product.url})` : ""}` : "(no product linked yet)"}. Find the best real acquisition channels, the specific online communities where the target users gather, notable competitors, and any pricing or benchmark data.`;
      const findings = await Brain.webResearch(query);
      if (findings) facts = `WEB RESEARCH FINDINGS (real, from live web search — ground your plan in these and cite the sources):\n${findings}`;
    }
    const out = await Brain.specialistWork({
      company: v.name,
      mission: v.mission || undefined,
      product,
      objective: objective.text,
      dept: a.dept,
      role: agent?.persona?.role ?? a.seat.title,
      task: a.task,
      facts,
      expertise: expertiseOf(agent, a.dept),
    }).catch(() => null);

    let propose: Propose | null = null;

    // gated BUILD → the spec is the deliverable; the actual ship waits for the owner's OK
    if (wantsShip && gate) {
      propose = { action: "echo_ship", summary: `Ship an update — ${clip(a.task, 44)}`, detail: a.task, amount_grid: Echo.revisionCost() };
    }

    // CONTENT publishing: fire now if autonomous, else file the drafted post for approval
    let pub: Pub | null = null;
    if (a.dept === "content" && out && PUBLISH_INTENT.test(a.task)) {
      if (gate) {
        propose = { action: "wire_post", summary: `Publish to the wire — ${clip(out.title, 40)}`, detail: `${out.title}\n\n${out.deliverable}` };
      } else {
        const r = Feed.create({ as_agent_id: a.seat.agent_id, user_id: v.owner_id, title: out.title.slice(0, 120), body: out.deliverable.slice(0, 1200) });
        if (r.post) pub = { post_id: r.post.post_id };
      }
    }

    // RECRUIT: bring in real help by posting a REAL open job to the community board.
    // A public action (like a wire post): fire now if autonomous, else file it for approval.
    let recruited: Recruit | null = null;
    if (out && !pub && !propose && a.dept !== "build" && RECRUIT_INTENT.test(a.task)) {
      const bountyGrid = Params.get("venture_bounty_grid");
      const canPay = bountyGrid > 0 && Wallets.balances(v.treasury_id).grid >= bountyGrid;
      if (gate || canPay) {
        // a paid bounty spends the treasury → always the owner's call, even in full autonomy
        propose = { action: "recruit_job", summary: canPay ? `Recruit help · fund a ${bountyGrid} GRID bounty — ${clip(out.title, 34)}` : `Recruit help — ${clip(out.title, 40)}`, detail: `${out.title}\n\n${out.deliverable}`, amount_grid: canPay ? bountyGrid : undefined };
      } else {
        const { job } = createRecruitJob(v, `Help ${v.name}: ${out.title}`, recruitBody(v, product, out.deliverable), agent?.capabilities ?? product?.stack ?? [], false);
        recruited = { job_id: job.job_id, title: job.title };
      }
    }
    return { a, out, ship: null, published: pub, recruited, propose };
  });

  // 3) record each specialist's deliverable + sharpen its domain mastery, and assemble
  //    the durable cycle report — the complete archive (unlike the bounded activity log).
  const reportId = newId("vrep");
  const reportItems: VentureReportItem[] = [];
  let done = 0;
  for (const { a, out, ship, published, recruited, propose } of outputs) {
    const title = out?.title || clip(a.task, 60);
    const res = delegate(v, a.seat, title, a.task, out?.deliverable);
    if (!res) continue;
    done += 1;
    growSkill(a.seat.agent_id, a.dept);
    pushEvent(v, {
      kind: recruited ? "recruited" : "delivered",
      text: recruited ? `${a.seat.title} · posted an open job — ${clip(title, 50)}` : `${a.seat.title} · ${clip(title, 60)}`,
      detail: res.deliverable,
      tool: published ? "posted · wire" : ship ? `shipped v${ship.version} · Echo` : recruited ? "recruiting · board" : propose?.action === "outreach_dm" ? "outreach · awaiting ok" : propose?.action === "open_raise" ? "raise · awaiting ok" : propose ? "drafted · awaiting ok" : (TOOL[a.dept] || undefined),
      post_id: published?.post_id,
      dept: a.dept, agent_id: a.seat.agent_id, job_id: recruited?.job_id ?? res.job_id,
    });
    reportItems.push({
      dept: a.dept, agent_id: a.seat.agent_id, title, detail: res.deliverable,
      action: published ? "posted" : ship ? "shipped" : recruited ? "recruited" : propose?.action === "outreach_dm" ? "reached" : propose?.action === "open_raise" ? "raised" : propose ? "drafted" : (a.dept === "marketing" ? "researched" : a.dept === "finance" ? "budgeted" : "planned"),
      link: published ? `/post/${published.post_id}` : recruited ? "/jobs" : (ship && product?.url) ? product.url : undefined,
      status: propose ? "pending_approval" : "done",
    });
    if (ship) {
      v.spent_grid = (v.spent_grid ?? 0) + ship.cost;
      pushEvent(v, { kind: "spend", text: `Build shipped v${ship.version} through Echo — paid ${ship.cost} GRID for the build.`, amount_grid: ship.cost });
    }
    // gated big action → file it for the owner's approval (defer-then-do)
    if (propose) {
      const ap: VentureApproval = {
        approval_id: newId("apr"), venture_id: v.venture_id,
        kind: propose.action === "echo_ship" ? "over_budget" : "external_action",
        action: propose.action, summary: propose.summary, detail: propose.detail,
        dept: a.dept, agent_id: a.seat.agent_id, objective_id: objective.objective_id,
        build_id: propose.action === "echo_ship" ? v.build_id : undefined,
        to_id: propose.to_id, to_name: propose.to_name, raise: propose.raise,
        report_id: reportId,
        amount_grid: propose.amount_grid, status: "pending", created_at: nowISO(),
      };
      (v.approvals ??= []).unshift(ap);
      pushEvent(v, { kind: "approval", text: `Needs your OK: ${clip(propose.summary, 66)}`, dept: a.dept, agent_id: a.seat.agent_id });
    }
  }

  // the durable per-cycle report — the complete archive the owner audits (the log keeps only the last 40 lines)
  if (reportItems.length) {
    const report: VentureReport = {
      report_id: reportId, venture_id: v.venture_id, cycle: v.cycles + 1,
      objective: objective.text, headline: clip(ceoLine.replace(/^CEO:\s*/, ""), 150),
      items: reportItems,
      actions: reportItems.filter((it) => it.status === "done" && (it.action === "shipped" || it.action === "posted" || it.action === "recruited" || it.action === "reached" || it.action === "raised")).length,
      created_at: nowISO(),
    };
    (v.reports ??= []).unshift(report);
    if (v.reports.length > REPORTS_MAX) v.reports = v.reports.slice(0, REPORTS_MAX);
  }

  objective.tasks_total = assignments.length;
  objective.tasks_done = done;
  objective.status = "done";
  v.cycles += 1;
  v.updated_at = nowISO();
  return { ok: true, objective_id: objective.objective_id, tasks: done, cost, balance: Wallets.balances(v.treasury_id).grid, brain: usedBrain };
}

/* -------------------------------- approvals ------------------------------- */
// Phase 2: the crew proposes a big/irreversible action (a code ship or a public
// post); the owner approves or declines it right on Mission Control. Approve →
// the deferred action actually executes; decline → it's dropped.

export interface ApprovalResult { ok?: boolean; executed?: string; post_id?: string; version?: number; job_id?: string; to_id?: string; proposal_id?: string; error?: string }

/** Turn the approval gate on/off for a company (owner sets its autonomy level). */
export function setApprovalPolicy(venture_id: string, owner_id: string, require: boolean): { venture?: Venture; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  v.require_approval = require;
  pushEvent(v, { kind: "objective", text: require ? "Approval gate ON — the crew checks with you before big moves." : "Full autonomy — the crew ships and posts on its own." });
  v.updated_at = nowISO();
  return { venture: v };
}

/** Resolve a pending approval. On approve the deferred action runs for real (ship via
 *  Echo / publish to the wire); on decline it's dropped. Idempotent per approval. */
export async function resolveApproval(venture_id: string, owner_id: string, approval_id: string, decision: "approve" | "decline"): Promise<ApprovalResult> {
  if (approvalsInFlight.has(approval_id)) return { error: "already_resolved" }; // being resolved right now
  approvalsInFlight.add(approval_id);
  try { return await resolveApprovalInner(venture_id, owner_id, approval_id, decision); }
  finally { approvalsInFlight.delete(approval_id); }
}

async function resolveApprovalInner(venture_id: string, owner_id: string, approval_id: string, decision: "approve" | "decline"): Promise<ApprovalResult> {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  const ap = (v.approvals ?? []).find((x) => x.approval_id === approval_id);
  if (!ap) return { error: "approval_not_found" };
  if (ap.status !== "pending") return { error: "already_resolved" };

  if (decision === "decline") {
    ap.status = "declined"; ap.resolved_at = nowISO();
    // the crew drafted it, the owner declined to act — reflect that in the report (no perpetual "awaiting ok")
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "drafted" });
    pushEvent(v, { kind: "approval", text: `Declined: ${clip(ap.summary, 66)}`, dept: ap.dept, agent_id: ap.agent_id });
    v.updated_at = nowISO();
    return { ok: true };
  }

  // approve → execute the deferred action
  if (ap.action === "echo_ship") {
    const build_id = ap.build_id ?? v.build_id;
    if (!build_id) return { error: "no_product" };
    if (Wallets.balances(v.treasury_id).grid < Echo.revisionCost()) return { error: "treasury_empty" };
    const r = await Echo.reviseBuild({ build_id, owner_id: v.owner_id, instruction: ap.detail ?? ap.summary, payer_id: v.treasury_id }).catch(() => null);
    if (!r?.build || r.error) return { error: r?.error ?? "ship_failed" };
    const rev = r.build.revisions?.[r.build.revisions.length - 1];
    const version = r.build.version ?? 1;
    const shipCost = r.cost ?? Echo.revisionCost();
    v.spent_grid = round2((v.spent_grid ?? 0) + shipCost);
    ap.status = "approved"; ap.resolved_at = nowISO(); ap.version = version;
    pushEvent(v, {
      kind: "delivered", text: `Head of engineering · Shipped v${version} (approved)`,
      detail: `Shipped v${version} of "${r.build.title}" — ${rev?.files_changed ?? 0} file(s) changed.\n\n${r.build.summary}${rev?.notes ? `\n\nChangelog: ${rev.notes}` : ""}\n\nThis is a new version in the build's history; it goes live when you deploy it.`,
      tool: `shipped v${version} · Echo`, dept: ap.dept, agent_id: ap.agent_id,
    });
    pushEvent(v, { kind: "spend", text: `Build shipped v${version} through Echo — paid ${shipCost} GRID for the build.`, amount_grid: shipCost });
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "shipped", link: productShape(v)?.url });
    v.updated_at = nowISO();
    return { ok: true, executed: "echo_ship", version };
  }

  if (ap.action === "wire_post") {
    const parts = (ap.detail ?? ap.summary).split("\n\n");
    const title = parts[0] || ap.summary;
    const body = parts.slice(1).join("\n\n") || title;
    const author = ap.agent_id ?? v.ceo_agent_id ?? v.seats[0]?.agent_id;
    if (!author) return { error: "no_author" };
    const r = Feed.create({ as_agent_id: author, user_id: v.owner_id, title: title.slice(0, 120), body: body.slice(0, 1200) });
    if (!r.post) return { error: "post_failed" };
    ap.status = "approved"; ap.resolved_at = nowISO(); ap.post_id = r.post.post_id;
    pushEvent(v, { kind: "delivered", text: `Head of content · Published to the wire (approved)`, detail: body, tool: "posted · wire", post_id: r.post.post_id, dept: ap.dept, agent_id: ap.agent_id });
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "posted", link: `/post/${r.post.post_id}` });
    v.updated_at = nowISO();
    return { ok: true, executed: "wire_post", post_id: r.post.post_id };
  }

  // recruit_job → post the REAL open job to the community board so real people/agents can help
  if (ap.action === "recruit_job") {
    const parts = (ap.detail ?? ap.summary).split("\n\n");
    const title = parts[0] || ap.summary;
    const body = parts.slice(1).join("\n\n") || title;
    const { job, bountyGrid, bountyUsdc } = createRecruitJob(v, `Help ${v.name}: ${title}`, recruitBody(v, productShape(v), body), recruitSkills(v, ap.agent_id), true);
    ap.status = "approved"; ap.resolved_at = nowISO(); ap.job_id = job.job_id;
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "recruited", link: "/jobs" });
    pushEvent(v, { kind: "recruited", text: bountyGrid ? `${ap.dept ?? "Crew"} · posted a PAID recruit job (~$${Math.round(bountyUsdc ?? 0)} bounty, approved)` : `${ap.dept ?? "Crew"} · posted an open job to recruit help (approved)`, detail: body, tool: bountyGrid ? "recruiting · paid" : "recruiting · board", job_id: job.job_id, dept: ap.dept, agent_id: ap.agent_id });
    if (bountyGrid) pushEvent(v, { kind: "spend", text: `Escrowed a ${bountyGrid} GRID bounty (~$${Math.round(bountyUsdc ?? 0)}) on the recruit job — pays the worker when you approve their delivery.`, amount_grid: bountyGrid });
    v.updated_at = nowISO();
    return { ok: true, executed: "recruit_job", job_id: job.job_id };
  }

  // outreach_dm → send the REAL direct message to the recipient (only ever runs on the owner's approval)
  if (ap.action === "outreach_dm") {
    if (!ap.to_id) return { error: "no_recipient" };
    const from = ap.agent_id ?? v.ceo_agent_id ?? v.seats[0]?.agent_id;
    if (!from) return { error: "no_sender" };
    const r = Messaging.sendTo(from, ap.to_id, { body: (ap.detail ?? ap.summary).slice(0, 2000) });
    if (r.error || !r.conversation) return { error: r.error ?? "send_failed" };
    ap.status = "approved"; ap.resolved_at = nowISO(); ap.conversation_id = r.conversation.conversation_id;
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "reached", link: "/messages" });
    pushEvent(v, { kind: "reached", text: `${ap.dept ?? "Crew"} · reached out to ${ap.to_name ?? "a user"} (approved)`, detail: ap.detail, tool: "outreach · sent", dept: ap.dept, agent_id: ap.agent_id });
    v.updated_at = nowISO();
    return { ok: true, executed: "outreach_dm", to_id: ap.to_id };
  }

  // open_raise → create the REAL GenesisX funding raise on the product (only on the owner's approval)
  if (ap.action === "open_raise") {
    if (!ap.raise) return { error: "no_draft" };
    const r = Genesis.createProposal({ author_id: v.owner_id, title: ap.raise.title, summary: ap.raise.summary, category: ap.raise.category, ask_amount: ap.raise.ask_amount, roadmap: ap.raise.roadmap, build_id: v.build_id });
    if (r.error || !r.proposal) return { error: r.error ?? "raise_failed" };
    ap.status = "approved"; ap.resolved_at = nowISO(); ap.proposal_id = r.proposal.proposal_id;
    completeReportItem(v, ap.report_id, ap.agent_id, { status: "done", action: "raised", link: `/genesis/${r.proposal.proposal_id}` });
    pushEvent(v, { kind: "raised", text: `${ap.dept ?? "Finance"} · opened a funding raise — ${clip(ap.raise.title, 40)} (approved)`, detail: ap.detail, tool: "raise · genesis", dept: ap.dept, agent_id: ap.agent_id });
    v.updated_at = nowISO();
    return { ok: true, executed: "open_raise", proposal_id: r.proposal.proposal_id };
  }

  // no executable action attached — just mark it approved
  ap.status = "approved"; ap.resolved_at = nowISO();
  v.updated_at = nowISO();
  return { ok: true };
}

/* --------------------------------- status --------------------------------- */

export function setStatus(venture_id: string, owner_id: string, status: Venture["status"]): { venture?: Venture; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  if (v.owner_id !== owner_id) return { error: "not_owner" };
  v.status = status;
  v.updated_at = nowISO();
  pushEvent(v, { kind: status === "paused" ? "paused" : "objective", text: `Company ${status}.` });
  return { venture: v };
}

/* ---------------------------------- views --------------------------------- */

function pushEvent(v: Venture, e: Omit<VentureEvent, "at">): void {
  v.log.unshift({ ...e, at: nowISO() });
  if (v.log.length > LOG_MAX) v.log = v.log.slice(0, LOG_MAX);
}

export function get(venture_id: string): Venture | undefined {
  return (db.ventures ?? []).find((v) => v.venture_id === venture_id);
}

export function listForOwner(owner_id: string): Venture[] {
  return (db.ventures ?? []).filter((v) => v.owner_id === owner_id);
}

export function list(): Venture[] {
  return db.ventures ?? [];
}

/** The cockpit view: the company enriched with live agent, treasury, and product state. */
export function view(venture_id: string, viewer?: string) {
  const v = get(venture_id);
  if (!v) return null;
  const seats = v.seats.map((s) => {
    const a = Agents.getAgent(s.agent_id);
    const domain = DOMAIN[s.dept];
    const mastery = (a?.skill_library ?? []).filter((sk) => sk.domain.toLowerCase() === domain.toLowerCase()).reduce((x, sk) => x + sk.uses, 0);
    return {
      ...s,
      name: a?.name ?? s.title,
      role: a?.persona?.role ?? s.title,
      rating: a?.rating ?? 0,
      status: a?.status ?? "idle",
      tasks: a ? a.task_history.length : 0,
      capabilities: (a?.capabilities ?? []).slice(0, 4),
      mastery,               // domain skill mastery — grows each cycle the specialist works
      tool: TOOL[s.dept] || null,
    };
  });
  const build = v.build_id ? db.builds.find((b) => b.build_id === v.build_id) : undefined;
  const treasury = Wallets.balances(v.treasury_id).grid;
  const productRevenue = productRevenueUsdc(v);
  const pendingRevenue = round2(Math.max(0, productRevenue - (v.revenue_synced_usdc ?? 0)));
  const isOwner = !!viewer && v.owner_id === viewer;
  // Non-owners must never see drafted, unpublished content: pending-approval detail
  // (ship instructions / unpublished post drafts) OR the full work-product in log[].detail.
  const publicLog = isOwner ? v.log : v.log.map((e) => ({ ...e, detail: undefined }));
  return {
    venture: isOwner ? v : { ...v, approvals: [], log: publicLog, reports: [] },
    is_owner: isOwner,
    seats,
    treasury_grid: treasury,
    revenue_grid: v.revenue_grid ?? 0,
    spent_grid: v.spent_grid ?? 0,
    cycle_cost: Params.get("venture_cycle_cost_grid"),
    product_revenue_usdc: productRevenue,       // all-time real USDC the product has earned
    pending_revenue_usdc: pendingRevenue,       // earned but not yet reinvested into the treasury
    revenue_share_bps: Params.get("venture_revenue_share_bps"),
    product: build ? {
      build_id: build.build_id, title: build.title, summary: build.summary,
      version: build.version ?? 1,
      deployed_version: build.deployment?.version ?? null,
      slug: build.deployment?.slug ?? null,
      revisions: (build.revisions ?? []).length,
      deployment: build.deployment ?? null,
    } : null,
    linkable_builds: isOwner ? linkableBuilds(viewer!) : [],
    objectives: v.objectives,
    approvals: isOwner ? (v.approvals ?? []).filter((a) => a.status === "pending") : [],
    require_approval: gatesApproval(v),
    log: publicLog,
    reports: isOwner ? (v.reports ?? []) : [],  // the complete per-cycle archive — owner-only (holds full work-product)
  };
}
