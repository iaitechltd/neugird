/**
 * /api/gridx
 * GET  → all published products (the on-chain app store feed).
 * POST → publish a build to GridX as a Product ({ build_id }). Builder-only.
 */

import { NextResponse } from "next/server";
import { GridX } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ products: GridX.listProducts() });
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
