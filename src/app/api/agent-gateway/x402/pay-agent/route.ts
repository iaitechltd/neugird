/**
 * POST /api/agent-gateway/x402/pay-agent — an agent pays ANOTHER agent for a
 * service (the a2a rail). Body: { to, amount, memo? }.
 *  - solana mode: 402 with PaymentRequirements paying the recipient's wallet →
 *    verify + settle the X-PAYMENT on-chain (real USDC to the recipient).
 *  - memory mode: settled immediately and credited to the recipient's earnings.
 * Capped by the payer's per-Job spend limit.
 */

import { NextResponse } from "next/server";
import { X402, Agents } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const from = gatewayAgent(request);
  if (!from) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const to_id = typeof body?.to === "string" ? body.to : "";
  const amount = Number(body?.amount);
  const memo = typeof body?.memo === "string" ? body.memo.slice(0, 80) : undefined;
  if (!to_id || !(amount > 0)) return NextResponse.json({ error: "to + positive amount required" }, { status: 400 });

  const to = Agents.getAgent(to_id);
  if (!to) return NextResponse.json({ error: "recipient_not_found" }, { status: 404 });
  if (to_id === from.agent_id) return NextResponse.json({ error: "cannot_pay_self" }, { status: 400 });
  if (amount > Agents.effectiveCap(from)) return NextResponse.json({ error: "over_spend_limit" }, { status: 402 });

  // ── real x402 (Solana) — the payer signs USDC straight to the recipient ──
  if (X402.active()) {
    if (!to.wallet_address) return NextResponse.json({ error: "recipient_has_no_wallet" }, { status: 409 });
    const opts = { amount, resourceUrl: request.url, description: memo ? `Agent service: ${memo}` : "Agent service", payTo: to.wallet_address };
    const xPayment = request.headers.get("x-payment");
    if (!xPayment) {
      return NextResponse.json(await X402.challengeRaw(opts), { status: 402, headers: { "accept-payment": "x402" } });
    }
    const r = await X402.settleAgentViaFacilitator(xPayment, from.agent_id, to, amount, request.url, memo);
    if (r.error) return NextResponse.json(await X402.challengeRaw(opts, r.error), { status: 402 });
    return NextResponse.json({ paid: true, to: to_id, amount, settlement: r.settlement }, { headers: { "x-payment-response": r.paymentResponse ?? "" } });
  }

  // ── memory mode — settle immediately, credit the recipient ──
  const { settlement, proof, error } = X402.payAgent(from.agent_id, to_id, amount, memo);
  if (error) return NextResponse.json({ error }, { status: error === "over_spend_limit" ? 402 : 400 });
  return NextResponse.json({ paid: true, to: to_id, amount, proof, settlement });
}
