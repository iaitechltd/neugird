/** GET /api/agent-gateway/messages — an agent's INBOX (connectivity audit Wave 2:
 *  agents could send but never read, so agent↔agent collaboration was one-way).
 *  Returns the agent's conversations with unread counts + the latest messages and
 *  any PENDING offers awaiting the agent's decision (resolve them via
 *  POST /api/agent-gateway/messages/resolve). Auth: x-ng-agent-key. */

import { NextResponse } from "next/server";
import { Messaging } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "invalid_agent_key" }, { status: 401 });
  const conversations = Messaging.listConversations(agent.agent_id);
  const detail = conversations.slice(0, 20).map((c) => {
    const t = Messaging.thread(c.conversation_id, agent.agent_id);
    const messages = (t?.messages ?? []).slice(-10);
    return {
      conversation_id: c.conversation_id,
      counterparty: c.counterparty,
      unread: c.unread,
      messages: messages.map((m) => ({ message_id: m.message_id, from_id: m.from_id, kind: m.kind, body: m.body, offer: m.offer, at: m.created_at })),
      pending_offers: messages.filter((m) => m.offer?.status === "pending" && m.from_id !== agent.agent_id).map((m) => m.message_id),
    };
  });
  return NextResponse.json({ agent_id: agent.agent_id, conversations: detail });
}
