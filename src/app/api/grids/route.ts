/**
 * /api/grids — the Grid primitive.
 * GET  → list grids.
 * POST → create a grid as the current user; the founder earns creator Pulse.
 *
 * API-first by design (spec §) so the same endpoints serve the UI today and
 * agents / the MCP server later. Reads/writes go through the canister-shaped
 * GridRegistry module, never the store directly.
 */

import { NextResponse } from "next/server";
import { GridRegistry, Pulse } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const grids = GridRegistry.listGridsWithStats();
  return NextResponse.json({ grids });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.category !== "string") {
    return NextResponse.json(
      { error: "name and category are required" },
      { status: 400 }
    );
  }

  const owner_id = await getCurrentUserId();
  const grid = GridRegistry.createGrid({
    owner_id,
    name: body.name,
    category: body.category,
    description: typeof body.description === "string" ? body.description : "",
    visibility: body.visibility === "private" ? "private" : "public",
    accent: typeof body.accent === "string" ? body.accent : undefined,
    grid_type: "community",
  });

  // Every Pulse change carries a human-readable reason (spec §5.1).
  Pulse.recordEvent({
    target_type: "user",
    target_id: owner_id,
    user_id: owner_id,
    action_type: "grid_created",
    weight: 25,
    reason: `Created the Grid "${grid.name}"`,
    verification_source: "auto",
  });

  return NextResponse.json({ grid }, { status: 201 });
}
