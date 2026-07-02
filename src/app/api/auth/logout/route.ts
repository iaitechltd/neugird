/**
 * POST /api/auth/logout — clear the session cookie.
 * (With the dev identity seam, /api/me then falls back to the seeded user.)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
