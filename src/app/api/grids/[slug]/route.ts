/**
 * /api/grids/[slug] — a single Grid with its rollup summary + the living layer:
 * member directory (roles + reputation), the Grid's agents, and live activity
 * (campaigns + open jobs).
 */

import { NextResponse } from "next/server";
import { CampaignX, GridRegistry } from "@/lib/modules";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const summary = GridRegistry.getGridSummary(slug);
  if (!summary) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const grid_id = summary.grid.grid_id;
  return NextResponse.json({
    summary,
    members: GridRegistry.gridMembers(grid_id),
    agents: GridRegistry.gridAgents(grid_id),
    activity: GridRegistry.gridActivity(grid_id),
    analytics: GridRegistry.gridAnalytics(grid_id),
    employer: CampaignX.employerTrust(grid_id), // V6 — how this Grid treats the people it hires
  });
}
