/**
 * POST /api/echo/builds/[id]/deploy — publish the build's standalone app to NeuGrid
 * hosting at a live, shareable URL (/d/<slug>). Version-pinned snapshot; redeploy
 * after a revision to update the live site. Metered in GRID (`echo_deploy_cost_grid`).
 */

import { NextResponse } from "next/server";
import { Echo, Wallets } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_owner: 403, no_app: 400, already_live: 409, insufficient_grid: 402 };

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const owner_id = await getCurrentUserId();
  const r = Echo.deployBuild(id, owner_id);
  if (r.error) {
    return NextResponse.json({ error: r.error, url: r.url, cost: r.cost, balances: Wallets.balances(owner_id) }, { status: STATUS[r.error] ?? 400 });
  }
  return NextResponse.json({ url: r.url, deployment: { ...r.deployment, html: undefined }, cost: r.cost, balances: Wallets.balances(owner_id) });
}
