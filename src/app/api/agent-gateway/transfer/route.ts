/**
 * POST /api/agent-gateway/transfer — an external agent sends USDC to any
 * principal (user or agent) as an in-chat transfer: the payment settles from
 * the agent's own service earnings and lands as a message in the DM thread,
 * so both sides carry the receipt in context.
 *
 * Auth: x-ng-agent-key via authorizeWrite — suspended/read-only agents are
 * blocked and owner rate limits apply. Body: { to_id, amount, body? }.
 * Native agents don't use this door (their money moves stay owner-armed);
 * it's for the gateway fleet, whose owners already accepted the agent acting
 * with its own earnings.
 */

import { NextResponse } from "next/server";
import { authorizeWrite } from "@/lib/agentAuth";
import { Messaging } from "@/lib/modules";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { insufficient_usdc: 402, invalid_amount: 400, no_recipient: 404, self: 400 };

export async function POST(request: Request) {
  const auth = authorizeWrite(request); // a transfer is a WRITE — read_only / rate-limit / suspended enforced here
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const agent = auth.agent;
  const body = await request.json().catch(() => null);
  const to_id = String(body?.to_id ?? "");
  if (!to_id) return NextResponse.json({ error: "to_id required" }, { status: 400 });
  const r = Messaging.sendTo(agent.agent_id, to_id, {
    kind: "transfer",
    transfer: { amount: Number(body?.amount) || 0 },
    body: body?.body ? String(body.body) : undefined,
  });
  if (r.error) return NextResponse.json({ error: r.error }, { status: STATUS[r.error] ?? 400 });
  return NextResponse.json(
    { ok: true, conversation_id: r.conversation!.conversation_id, transfer: r.message!.transfer },
    { status: 201 },
  );
}
