/**
 * /api/ventures/[id]
 * GET  → the cockpit view (seats, treasury, objectives, product, activity log).
 * POST → an owner action: { action: "objective" | "fund" | "cycle" | "status" }.
 */

import { NextResponse } from "next/server";
import { Ventures, Echo } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const v = Ventures.view(id, uid);
  if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(v);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");

  const status = (r: { error?: string }) => (r.error === "not_owner" ? 403 : r.error === "not_found" ? 404 : 400);

  if (action === "objective") {
    const r = Ventures.addObjective(id, uid, String(body?.text ?? ""));
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ objective: r.objective, view: Ventures.view(id, uid) });
  }

  if (action === "fund") {
    const r = Ventures.fundTreasury(id, uid, Number(body?.amount ?? 0));
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ balance: r.balance, view: Ventures.view(id, uid) });
  }

  if (action === "link") {
    const build_id = body?.build_id === null ? null : typeof body?.build_id === "string" ? body.build_id : undefined;
    if (build_id === undefined) return NextResponse.json({ error: "bad_build_id" }, { status: 400 });
    const r = Ventures.linkProduct(id, uid, build_id);
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ view: Ventures.view(id, uid) });
  }

  if (action === "deploy") {
    const vv = Ventures.get(id);
    if (!vv) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (vv.owner_id !== uid) return NextResponse.json({ error: "not_owner" }, { status: 403 });
    if (!vv.build_id) return NextResponse.json({ error: "no_product" }, { status: 400 });
    const r = Echo.deployBuild(vv.build_id, uid); // the founder's go-live action, from their wallet
    if (r.error && r.error !== "already_live") return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ url: r.url, view: Ventures.view(id, uid) });
  }

  if (action === "cycle") {
    const v = Ventures.get(id);
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (v.owner_id !== uid) return NextResponse.json({ error: "not_owner" }, { status: 403 });
    const r = await Ventures.runCycle(id);
    return NextResponse.json({ result: r, view: Ventures.view(id, uid) });
  }

  if (action === "revenue") {
    const v = Ventures.get(id);
    if (!v) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (v.owner_id !== uid) return NextResponse.json({ error: "not_owner" }, { status: 403 });
    const r = Ventures.syncRevenue(id); // reinvest the product's new earnings into the treasury
    return NextResponse.json({ result: r, view: Ventures.view(id, uid) });
  }

  if (action === "approve") {
    const decision = body?.decision === "decline" ? "decline" : "approve";
    const r = await Ventures.resolveApproval(id, uid, String(body?.approval_id ?? ""), decision);
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ result: r, view: Ventures.view(id, uid) });
  }

  if (action === "autonomy") {
    const r = Ventures.setApprovalPolicy(id, uid, body?.require !== false);
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ view: Ventures.view(id, uid) });
  }

  if (action === "status") {
    const next = String(body?.status ?? "");
    if (!["active", "paused", "archived"].includes(next)) return NextResponse.json({ error: "bad_status" }, { status: 400 });
    const r = Ventures.setStatus(id, uid, next as "active" | "paused" | "archived");
    if (r.error) return NextResponse.json({ error: r.error }, { status: status(r) });
    return NextResponse.json({ view: Ventures.view(id, uid) });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
