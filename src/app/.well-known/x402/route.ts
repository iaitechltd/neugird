/**
 * GET /.well-known/x402 — the conventional discovery path for x402 resources.
 * Mirrors /api/x402/discovery so agent frameworks that probe the well-known
 * location find NeuGrid's paid gateway resources. Same payload, same shape.
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
