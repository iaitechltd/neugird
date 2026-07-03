/**
 * /api/gridx/[id]
 * GET  → one product + its home Grid + the build it came from + reviews + my
 *        marketplace state (owned/purchased/can-review).
 * POST → owner sets the price: { price_usdc }.
 */

import { NextResponse } from "next/server";
import { GridX, Users } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

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
  return NextResponse.json({
    ...view,
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
