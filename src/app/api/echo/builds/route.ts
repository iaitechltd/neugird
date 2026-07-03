/**
 * /api/echo/builds
 * GET  → the current user's builds (their proof-of-build track record).
 * POST → run an Echo build (REAL model codegen when the brain is active; stub otherwise).
 *
 * Building is permissionless — anyone can build to EARN builder reputation.
 * Listing (GridX) and funding (Fund) are what stay reputation-gated.
 */

import { NextResponse } from "next/server";
import { Echo, Attestations, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({ builds: Echo.buildsForUser(uid), me: { id: uid } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  const owner_id = await getCurrentUserId();
  const result = await Echo.runBuild({
    owner_id,
    prompt: body.prompt,
    title: typeof body.title === "string" ? body.title : undefined,
    subgrid_id: typeof body.subgrid_id === "string" ? body.subgrid_id : undefined,
  });
  if (result.error) {
    // 402 = not enough GRID for the metered compute · 503 = model synthesis failed (GRID refunded)
    const status = result.error === "insufficient_grid" ? 402 : result.error === "synthesis_failed" ? 503 : 400;
    return NextResponse.json({ error: result.error, cost: result.cost, balances: Wallets.balances(owner_id) }, { status });
  }
  const minted = Attestations.mintNew(owner_id, "user"); // live soulbound mint on the witnessed build
  return NextResponse.json({ build: result.build, minted, cost: result.cost, balances: Wallets.balances(owner_id) }, { status: 201 });
}
