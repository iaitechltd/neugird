/**
 * /api/gridx
 * GET  → all published products (the on-chain app store feed).
 * POST → publish a build to GridX as a Product ({ build_id }). Builder-only.
 */

import { NextResponse } from "next/server";
import { GridX, Markets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  const products = GridX.listProducts().map((p) => {
    const market = Markets.marketForGrid(p.grid_id);
    return {
      ...GridX.enrich(p),
      owner_id: GridX.ownerOf(p),
      owned_by_me: GridX.ownerOf(p) === uid,
      purchased_by_me: GridX.hasPurchased(p.product_id, uid),
      market: market ? { market_id: market.market_id, stage: market.stage, symbol: market.base_symbol } : null,
    };
  });
  return NextResponse.json({ products, me: { id: uid } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.build_id !== "string") {
    return NextResponse.json({ error: "build_id required" }, { status: 400 });
  }
  const uid = await getCurrentUserId();
  const { product, grid, error } = GridX.createProductFromBuild(body.build_id, uid);
  if (error) return NextResponse.json({ error }, { status: error === "not_found" ? 404 : error === "not_owner" ? 403 : 400 });
  return NextResponse.json({ product, grid }, { status: 201 });
}
