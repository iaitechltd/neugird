/**
 * GET /api/x402/discovery — public x402 resource discovery (the "bazaar" list).
 * Advertises NeuGrid's metered gateway resources so any external agent can find
 * and pay for them. Each item carries its payment requirement (real
 * PaymentRequirements in solana mode; the mock quote otherwise).
 */

import { NextResponse } from "next/server";
import { X402 } from "@/lib/modules";
import { publicRequestUrl } from "@/lib/publicUrl";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(publicRequestUrl(request)).origin;
  const items = Object.entries(X402.RESOURCES).map(([name, meta]) => {
    const resourceUrl = `${origin}/api/agent-gateway/x402/resource/${name}`;
    const reqs = X402.requirements(name, resourceUrl); // real requirements in solana mode
    return {
      resource: resourceUrl,
      type: "http" as const,
      x402Version: 1,
      accepts: reqs ? [reqs] : [X402.quote(name)].filter(Boolean),
      metadata: { name, description: meta.description, price_usdc: meta.price, auth: "x-ng-agent-key" },
    };
  });
  return NextResponse.json({ x402Version: 1, items });
}
