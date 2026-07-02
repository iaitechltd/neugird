/**
 * POST /api/echo/builds/[id]/proposal-draft — the founder journey. Echo drafts a
 * GenesisX funding proposal FROM the build: pitch, realistic ask, and 3-5 next-phase
 * milestone tranches grounded in the real generated files. Returns the DRAFT only —
 * the founder reviews (and can edit) before submitting via POST /api/proposals.
 * Drafting is free (no GRID charge); owner-only.
 */

import { NextResponse } from "next/server";
import { Echo } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_owner: 403, no_files: 400, brain_inactive: 503, synthesis_failed: 503 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owner_id = await getCurrentUserId();
  const result = await Echo.draftProposal(id, owner_id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json({ draft: result.draft });
}
