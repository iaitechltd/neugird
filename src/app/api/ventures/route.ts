/**
 * /api/ventures
 * GET  → the caller's agent companies + the team templates + their eligibility.
 * POST → form a new company from a template (builders only — ≥1 Echo build).
 */

import { NextResponse } from "next/server";
import { Ventures } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({
    ventures: Ventures.listForOwner(uid).map((v) => Ventures.view(v.venture_id, uid)),
    templates: Ventures.listTemplates(),
    eligible: Ventures.eligible(uid),
    builds: Ventures.linkableBuilds(uid),
  });
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const { venture, error } = Ventures.createVenture({
    owner_id: uid,
    name: String(body?.name ?? ""),
    mission: typeof body?.mission === "string" ? body.mission : undefined,
    template: typeof body?.template === "string" ? body.template : undefined,
    build_id: typeof body?.build_id === "string" ? body.build_id : undefined,
    fund_grid: typeof body?.fund_grid === "number" ? body.fund_grid : undefined,
  });
  if (error) return NextResponse.json({ error }, { status: error === "need_a_build" ? 403 : 400 });
  return NextResponse.json({ venture: Ventures.view(venture!.venture_id, uid) });
}
