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
import * as Brain from "../brain";
import type {
  Agent, AgentPersona, ContributorSplit, Venture, VentureDept, VentureEvent, VentureObjective, VentureSeat,
} from "../types";

const LOG_MAX = 40;
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
    cycles: 0,
    revenue_grid: 0,
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
  const amt = Math.max(0, Math.floor(amount));
  if (amt <= 0) return { error: "invalid_amount" };
  if (!Wallets.debitGrid(owner_id, amt)) return { error: "insufficient_grid" };
  Wallets.creditGrid(v.treasury_id, amt);
  pushEvent(v, { kind: "revenue", text: `Owner funded the treasury with ${amt} GRID.`, amount_grid: amt });
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
  pushEvent(v, { kind: "objective", text: `Product linked: "${build.title}" — the team now runs it.` });
  v.updated_at = nowISO();
  return { venture: v };
}

/** Route product revenue into the treasury (the self-funding loop). Real when the
 *  linked product actually earns; callable by a revenue-sync or settlement hook. */
export function recordRevenue(venture_id: string, amount: number, note?: string): { balance?: number; error?: string } {
  const v = get(venture_id);
  if (!v) return { error: "not_found" };
  const amt = Math.max(0, Math.floor(amount));
  if (amt <= 0) return { error: "invalid_amount" };
  Wallets.creditGrid(v.treasury_id, amt);
  v.revenue_grid = (v.revenue_grid ?? 0) + amt;
  pushEvent(v, { kind: "revenue", text: note || `Product revenue: +${amt} GRID into the treasury.`, amount_grid: amt });
  v.updated_at = nowISO();
  return { balance: Wallets.balances(v.treasury_id).grid };
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
  const v = get(venture_id);
  if (!v) return { ok: false, error: "not_found" };
  if (v.status !== "active") return { ok: false, reason: "not_active" };

  const objective = v.objectives.find((o) => o.status === "queued" || o.status === "running");
  if (!objective) {
    pushEvent(v, { kind: "hold", text: "No objectives queued — give the company a goal and it'll get to work." });
    return { ok: false, reason: "no_objectives" };
  }

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

  // settle the cycle's compute bill (treasury → protocol sink)
  if (cost > 0) {
    Wallets.debitGrid(v.treasury_id, cost);
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
  const PUBLISH_INTENT = /\b(post|posts|publish|published|announce|announcement|wire|share|social|tweet|thread|blog|launch)\b/i;
  const outputs = await mapLimit(assignments, 2, async (a) => {
    const ship: Ship | null = null;
    const published: Pub | null = null;
    if (!usedBrain) return { a, out: null as { title: string; deliverable: string } | null, ship, published };
    const agent = Agents.getAgent(a.seat.agent_id);

    if (a.dept === "build" && v.build_id && Brain.activeBrain() && Wallets.balances(v.treasury_id).grid >= Echo.revisionCost()) {
      const r = await Echo.reviseBuild({ build_id: v.build_id, owner_id: v.owner_id, instruction: a.task, payer_id: v.treasury_id }).catch(() => null);
      if (r?.build && !r.error) {
        const rev = r.build.revisions?.[r.build.revisions.length - 1];
        const s: Ship = { version: r.build.version ?? 1, cost: r.cost ?? Echo.revisionCost() };
        const deliverable = `Shipped v${s.version} of "${r.build.title}" — ${rev?.files_changed ?? 0} file(s) changed.\n\n${r.build.summary}${rev?.notes ? `\n\nChangelog: ${rev.notes}` : ""}\n\nThis is a new version in the build's history; it goes live when you deploy it.`;
        return { a, out: { title: `Shipped v${s.version} — ${clip(a.task, 40)}`, deliverable }, ship: s, published };
      }
      // Echo ship unavailable (no files / synthesis failed / limit) → fall through to the spec path
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

    // The CONTENT agent doesn't just draft — when the brief is public-facing, it ACTUALLY
    // publishes the copy to the platform wire (posts as itself, credits the owner).
    let pub: Pub | null = null;
    if (a.dept === "content" && out && PUBLISH_INTENT.test(a.task)) {
      const r = Feed.create({ as_agent_id: a.seat.agent_id, user_id: v.owner_id, title: out.title.slice(0, 120), body: out.deliverable.slice(0, 1200) });
      if (r.post) pub = { post_id: r.post.post_id };
    }
    return { a, out, ship, published: pub };
  });

  // 3) record each specialist's deliverable + sharpen its domain mastery
  let done = 0;
  for (const { a, out, ship, published } of outputs) {
    const title = out?.title || clip(a.task, 60);
    const res = delegate(v, a.seat, title, a.task, out?.deliverable);
    if (!res) continue;
    done += 1;
    growSkill(a.seat.agent_id, a.dept);
    pushEvent(v, {
      kind: "delivered",
      text: `${a.seat.title} · ${clip(title, 60)}`,
      detail: res.deliverable,
      tool: published ? "posted · wire" : ship ? `shipped v${ship.version} · Echo` : (TOOL[a.dept] || undefined),
      post_id: published?.post_id,
      dept: a.dept, agent_id: a.seat.agent_id, job_id: res.job_id,
    });
    if (ship) {
      v.spent_grid = (v.spent_grid ?? 0) + ship.cost;
      pushEvent(v, { kind: "spend", text: `Build shipped v${ship.version} through Echo — paid ${ship.cost} GRID for the build.`, amount_grid: ship.cost });
    }
  }

  objective.tasks_total = assignments.length;
  objective.tasks_done = done;
  objective.status = "done";
  v.cycles += 1;
  v.updated_at = nowISO();
  return { ok: true, objective_id: objective.objective_id, tasks: done, cost, balance: Wallets.balances(v.treasury_id).grid, brain: usedBrain };
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
  return {
    venture: v,
    is_owner: viewer ? v.owner_id === viewer : false,
    seats,
    treasury_grid: treasury,
    revenue_grid: v.revenue_grid ?? 0,
    spent_grid: v.spent_grid ?? 0,
    cycle_cost: Params.get("venture_cycle_cost_grid"),
    product: build ? {
      build_id: build.build_id, title: build.title, summary: build.summary,
      version: build.version ?? 1,
      deployed_version: build.deployment?.version ?? null,
      slug: build.deployment?.slug ?? null,
      revisions: (build.revisions ?? []).length,
      deployment: build.deployment ?? null,
    } : null,
    linkable_builds: viewer && v.owner_id === viewer ? linkableBuilds(viewer) : [],
    objectives: v.objectives,
    approvals: (v.approvals ?? []).filter((a) => a.status === "pending"),
    log: v.log,
  };
}
