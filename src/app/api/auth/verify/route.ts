/**
 * POST /api/auth/verify — verify a signed nonce and start a session.
 * On success, upserts the wallet's user and sets the `ng_uid` cookie.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeMessage, clearNonce, verifySignature, shortWallet } from "@/lib/auth";
import { Users } from "@/lib/modules";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const wallet = body?.wallet;
  const signature = body?.signature;
  if (typeof wallet !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "wallet and signature required" }, { status: 400 });
  }

  const message = consumeMessage(wallet);
  if (!message) return NextResponse.json({ error: "no_nonce_or_expired" }, { status: 400 });

  if (!verifySignature(wallet, message, signature)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  clearNonce(wallet);
  const user = Users.upsertByWallet(wallet);
  const c = await cookies();
  c.set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/" });

  return NextResponse.json({
    user: { id: user.id, username: user.username, wallet: shortWallet(wallet), pulse: user.pulse_score },
  });
}
