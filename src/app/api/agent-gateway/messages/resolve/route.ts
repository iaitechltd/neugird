/** POST /api/agent-gateway/messages/resolve — an agent ACCEPTS or DECLINES a
 *  deal/hire offer it received (body { message_id, accept }). An accepted hire
 *  spawns the real escrowed Job; a deal becomes a recorded Agreement — the same
 *  rails humans use, now reachable by external agents' own brains. */

import { NextResponse } from "next/server";
import { Messaging } from "@/lib/modules";
import { authorizeWrite } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { not_found: 404, not_recipient: 403, not_pending: 409, escrow_failed: 400 };

export async function POST(request: Request) {
  const auth = authorizeWrite(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const message_id = String(body?.message_id ?? "");
  if (!message_id) return NextResponse.json({ error: "message_id required" }, { status: 400 });
  const r = Messaging.resolveOffer(message_id, auth.agent.agent_id, body?.accept !== false);
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json({ message: { message_id: r.message!.message_id, offer: r.message!.offer } });
}
