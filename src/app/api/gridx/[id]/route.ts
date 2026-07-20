/**
 * /api/gridx/[id]
 * GET  → one product + its home Grid + the build it came from + reviews + my
 *        marketplace state (owned/purchased/can-review).
 * POST → owner sets the price: { price_usdc }.
 */

import { NextResponse } from "next/server";
import { GridX, Users } from "@/lib/modules";
import { db } from "@/lib/store";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;

/** Real chart series for the detail page, derived from existing store data
 *  (productEvents + settled purchase receipts) and bucketed server-side so the
 *  client renders SSR-safe with no time math. Oldest → newest everywhere. */
function activityFor(id: string) {
  const now = Date.now();
  const events = (db.productEvents ?? []).filter((e) => e.product_id === id);
  const receipts = (db.settlements ?? []).filter(
    (s) => s.resource === `product_purchase:${id}` && s.status === "settled",
  );

  // last 14 days: opens + sales per day
  const opens_daily = Array<number>(14).fill(0);
  const sales_daily = Array<number>(14).fill(0);
  for (const e of events) {
    const idx = 13 - Math.floor((now - Date.parse(e.at)) / DAY);
    if (idx < 0 || idx > 13) continue;
    if (e.kind === "open") opens_daily[idx] += 1;
    else sales_daily[idx] += 1;
  }

  // last 8 weeks: sales count + settled USDC, each labeled by the week's end day
  const weeks = Array.from({ length: 8 }, (_, i) => ({
    key: new Date(now - (7 - i) * WEEK).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    sales: 0,
    usdc: 0,
  }));
  for (const e of events) {
    if (e.kind !== "purchase") continue;
    const idx = 7 - Math.floor((now - Date.parse(e.at)) / WEEK);
    if (idx >= 0 && idx <= 7) weeks[idx].sales += 1;
  }
  for (const s of receipts) {
    const idx = 7 - Math.floor((now - Date.parse(s.created_at)) / WEEK);
    if (idx >= 0 && idx <= 7) weeks[idx].usdc += s.amount;
  }
  for (const w of weeks) w.usdc = Math.round(w.usdc * 100) / 100;
  const first = weeks.findIndex((w) => w.sales > 0 || w.usdc > 0);

  return {
    opens_daily,
    sales_daily,
    sales_total: events.filter((e) => e.kind === "purchase").length, // all-time
    sales_weeks: first === -1 ? [] : weeks.slice(first),
  };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const view = GridX.productView(id);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const uid = await getCurrentUserId();
  const gate = GridX.canReview(id, uid);
  const reviews = GridX.reviewsFor(id).map((r) => ({
    ...r,
    username: Users.getUser(r.user_id)?.username ?? r.user_id,
  }));
  const owner_id = GridX.ownerOf(view.product);
  const owner = owner_id ? Users.getUser(owner_id) : undefined;
  // the outside work that shipped it (audit polish) — jobs hired FOR this
  // product's build, with their proof, shown on the public page
  const buildId = db.builds.find((b) => b.product_id === id)?.build_id;
  const shipped_work = buildId
    ? db.jobs.filter((j) => j.build_id === buildId && (j.status === "paid" || j.status === "approved" || j.status === "submitted"))
        .slice(0, 6)
        .map((j) => ({
          job_id: j.job_id, title: j.title, status: j.status, reward: j.reward_amount,
          worker: j.assignee_type === "agent" ? (db.agents.find((a) => a.agent_id === j.assignee_id)?.name ?? "an agent") : (Users.getUser(j.assignee_id ?? "")?.username ?? "—"),
          proof: j.proof?.payload && /^https?:\/\//.test(j.proof.payload) ? j.proof.payload : null,
        }))
    : [];
  return NextResponse.json({
    ...view,
    activity: activityFor(id),
    shipped_work,
    reviews,
    owner: owner ? { id: owner.id, username: owner.username, reputation: Math.round(owner.reputation?.total ?? 0) } : null,
    me: {
      id: uid,
      owned: owner_id === uid,
      purchased: GridX.hasPurchased(id, uid),
      can_review: gate.ok,
      review_block: gate.ok ? undefined : gate.reason,
    },
  });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const uid = await getCurrentUserId();
  const { product, error } = GridX.setPrice(id, uid, Number(body?.price_usdc));
  if (error) return NextResponse.json({ error }, { status: error === "not_found" ? 404 : error === "not_owner" ? 403 : 400 });
  return NextResponse.json({ price_usdc: product?.price_usdc });
}
