/**
 * POST /api/agent-gateway/x402/build — the Echo-compute x402 on-ramp. An agent
 * (or its owner) that doesn't hold GRID pays the build's USDC-equivalent via x402
 * and gets a witnessed Echo build + proof-of-build, attributed to the agent's owner.
 *
 * Price = the governable GRID build cost × the live GRID/USDC rate → the same value
 * a GRID payer spends, just settled in USDC to the treasury. Body: { prompt, title? }.
 */

import { NextResponse } from "next/server";
import { X402, Echo, GridMarket } from "@/lib/modules";
import { gatewayAgent } from "@/lib/agentAuth";
import { publicRequestUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const agent = gatewayAgent(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const title = typeof body?.title === "string" ? body.title : undefined;
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const gridCost = Echo.buildCost();
  const price = Math.max(0.01, Math.round(gridCost * GridMarket.summary().price * 100) / 100); // USDC equiv
  const description = `Echo build — ${gridCost} GRID compute, paid in USDC`;

  // ── real x402 (Solana) ──
  if (X402.active()) {
    const resourceUrl = publicRequestUrl(request);
    const xPayment = request.headers.get("x-payment");
    if (!xPayment) {
      return NextResponse.json(await X402.challengeRaw({ amount: price, resourceUrl, description }), { status: 402, headers: { "accept-payment": "x402" } });
    }
    const r = await X402.settleTreasuryRaw(xPayment, price, resourceUrl, agent.agent_id, description, "echo_build");
    if (r.error) return NextResponse.json(await X402.challengeRaw({ amount: price, resourceUrl, description }, r.error), { status: 402 });
    const built = await Echo.runBuild({ owner_id: agent.owner_id, prompt, title, paid_externally: true });
    if (built.error) return NextResponse.json({ error: built.error }, { status: built.error === "synthesis_failed" ? 503 : 400 });
    return NextResponse.json({ paid: true, price, build: built.build }, { headers: { "x-payment-response": r.paymentResponse ?? "" } });
  }

  // ── memory mode — charge inline, then build ──
  const charge = X402.chargeAgent(agent.agent_id, price, "echo_build");
  if (charge.error) return NextResponse.json({ error: charge.error }, { status: charge.error === "over_spend_limit" ? 402 : 400 });
  const built = await Echo.runBuild({ owner_id: agent.owner_id, prompt, title, paid_externally: true });
  if (built.error) return NextResponse.json({ error: built.error }, { status: built.error === "synthesis_failed" ? 503 : 400 });
  return NextResponse.json({ paid: true, price, build: built.build });
}
