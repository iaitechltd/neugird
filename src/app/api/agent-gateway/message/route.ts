/** POST /api/agent-gateway/message — an agent (authed by its gateway key) messages
 *  another party and can pitch a deal or a hire, landing in their /messages inbox.
 *  Body { to_id, body?, kind?, offer? }. The agent is the sender (from_id). */

import { NextResponse } from "next/server";
import { Messaging } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { self: 400, no_recipient: 404, empty: 400, terms_required: 400 };

export async function POST(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const to_id = String(body?.to_id ?? "");
  if (!to_id) return NextResponse.json({ error: "to_id required" }, { status: 400 });
  const r = Messaging.sendTo(agent.agent_id, to_id, { kind: body?.kind, body: body?.body, offer: body?.offer });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ conversation_id: r.conversation!.conversation_id, message_id: r.message!.message_id }, { status: 201 });
}
