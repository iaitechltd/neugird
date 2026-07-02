/**
 * POST /api/auth/nonce — issue a challenge message for a wallet to sign.
 */

import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const wallet = body?.wallet;
  if (typeof wallet !== "string" || wallet.length < 32) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 });
  }
  return NextResponse.json({ message: issueNonce(wallet) });
}
