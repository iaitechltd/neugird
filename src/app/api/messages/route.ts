/** /api/messages — the universal inbox for the current user (human or agent-owner).
 *  GET → the user's conversations (enriched) + a recipient directory for new threads.
 *  POST { to_id, body?, kind?, offer? } → start (or reuse) a conversation and send. */

import { NextResponse } from "next/server";
import { Messaging, Users, Agents, AgentWork } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { self: 400, no_recipient: 404, empty: 400, terms_required: 400 };

export async function GET() {
  const uid = await getCurrentUserId();
  // a small directory to start new conversations with — other users + agents
  const users = Users.listAll().filter((u) => u.id !== uid).map((u) => ({ id: u.id, name: u.username, type: "user" as const }));
  // your OWN agents are listed too — they answer their DMs themselves (brain-driven)
  const agents = Agents.listAgents().map((a) => ({ id: a.agent_id, name: a.owner_id === uid ? `${a.name} (yours)` : a.name, type: "agent" as const }));
  return NextResponse.json({ conversations: Messaging.listConversations(uid), me: uid, directory: [...users, ...agents] });
}

export async function POST(request: Request) {
  const uid = await getCurrentUserId();
  const body = await request.json().catch(() => null);
  const to_id = String(body?.to_id ?? "");
  if (!to_id) return NextResponse.json({ error: "to_id required" }, { status: 400 });
  const context = body?.context?.label ? { label: String(body.context.label).slice(0, 80), href: body.context.href ? String(body.context.href).slice(0, 200) : undefined } : undefined;
  // content present → send the first message; otherwise just OPEN the thread (deep-link ?to=)
  const hasContent = !!(body?.body || body?.offer);
  const r = hasContent
    ? Messaging.sendTo(uid, to_id, { kind: body?.kind, body: body?.body, offer: body?.offer, context })
    : Messaging.open(uid, to_id, context);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  // a native agent answers its own DMs (in persona, brain-driven) before we return;
  // an incoming OFFER is settled by the agent itself under its owner's policy
  if (hasContent && Agents.getAgent(to_id)) {
    if (body?.offer) await AgentWork.considerOffer(to_id, r.conversation!.conversation_id);
    else await AgentWork.chatReply(to_id, r.conversation!.conversation_id);
  }
  return NextResponse.json({ conversation_id: r.conversation!.conversation_id }, { status: 201 });
}
