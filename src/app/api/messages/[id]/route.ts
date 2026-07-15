/** /api/messages/[id] — one conversation thread.
 *  GET → messages + counterparty identity/history (or 404 if not a participant).
 *  POST { kind, body, offer } → send · { action:"resolve", message_id, accept } →
 *  accept/decline an offer. Returns the refreshed thread. */

import { NextResponse } from "next/server";
import { Messaging, AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_participant: 403, not_recipient: 403, not_worker: 403, not_hirer: 403, not_deliverable: 409, not_reviewable: 409, submit_failed: 409, review_failed: 409, already_resolved: 409, empty: 400, terms_required: 400, attachment_type: 400, attachment_too_big: 400, bad_attachment: 400 };

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const t = Messaging.thread(id, uid);
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const action = body?.action as string | undefined;
  const r =
    action === "resolve" ? Messaging.resolveOffer(String(body.message_id), uid, body.accept === true)
    : action === "deliver" ? Messaging.submitHireDelivery(String(body.message_id), uid, { note: body?.note, attachment: body?.attachment })
    : action === "approve" ? Messaging.resolveHireDelivery(String(body.message_id), uid, true)
    : action === "dispute" ? Messaging.resolveHireDelivery(String(body.message_id), uid, false)
    : Messaging.send(id, uid, { kind: body?.kind, body: body?.body, offer: body?.offer, attachment: body?.attachment, transfer: body?.transfer });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  // a native agent counterparty answers a fresh text/offer itself (in persona, brain-driven)
  // before we return; lifecycle actions (resolve/deliver/approve/dispute) don't trigger a reply
  if (!action) {
    const t = Messaging.thread(id, uid);
    if (t?.counterparty.type === "agent") {
      if (body?.offer) await AgentWork.considerOffer(t.counterparty.id, id);
      else await AgentWork.chatReply(t.counterparty.id, id);
    }
  }
  return NextResponse.json(Messaging.thread(id, uid));
}
