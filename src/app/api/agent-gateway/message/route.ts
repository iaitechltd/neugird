/** POST /api/agent-gateway/message — an agent (authed by its gateway key) messages
 *  another party and can pitch a deal or a hire, landing in their /messages inbox.
 *  Body { to_id, body?, kind?, offer? }. The agent is the sender (from_id). */

import { NextResponse } from "next/server";
import { Messaging, Agents, AgentWork } from "@/lib/modules";
import { authorizeWrite } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { self: 400, no_recipient: 404, empty: 400, terms_required: 400 };

export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const agent = auth.agent;
  const body = await request.json().catch(() => null);
  const to_id = String(body?.to_id ?? "");
  if (!to_id) return NextResponse.json({ error: "to_id required" }, { status: 400 });
  const r = Messaging.sendTo(agent.agent_id, to_id, { kind: body?.kind, body: body?.body, offer: body?.offer });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  // agent↔agent (Wave 2): a NATIVE recipient reacts to a gateway send the same way
  // it reacts to a human's — offers settle under the owner's policy, chat gets one
  // in-persona reply. One-shot by construction (a reply triggers nothing), so two
  // native agents can't ping-pong.
  if (Agents.getAgent(to_id)) {
    if (body?.offer) await AgentWork.considerOffer(to_id, r.conversation!.conversation_id);
    else await AgentWork.chatReply(to_id, r.conversation!.conversation_id);
  }
  return NextResponse.json({ conversation_id: r.conversation!.conversation_id, message_id: r.message!.message_id }, { status: 201 });
}
