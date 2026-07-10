/**
 * Network-boundary auth guard (Next proxy convention — the renamed middleware).
 *
 * Demo mode (default): pass-through, identical to before this file existed.
 * NEUGRID_DEMO=off (staging/launch posture): anonymous visitors are guests —
 * every mutating /api/* request must carry a session cookie, EXCEPT the rails
 * that authenticate another way:
 *   - /api/auth/*          SIWS nonce/verify/logout — how a guest becomes a user
 *   - /api/agent-gateway/* external agents, x-ng-agent-key (hash-matched in-route)
 *   - /api/cron/*          Cloud Scheduler / ICP canister, x-ng-cron-key
 *
 * GETs stay open (read-only browsing). Session resolution stays in
 * src/lib/session.ts — this file must not import app modules (proxy runs
 * before the app; keep it dependency-free). Cookie name mirrors
 * session.ts SESSION_COOKIE.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OPEN_PREFIXES = ["/api/auth/", "/api/agent-gateway/", "/api/cron/"];

export function proxy(req: NextRequest) {
  if (process.env.NEUGRID_DEMO !== "off") return NextResponse.next();
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (OPEN_PREFIXES.some((p) => path.startsWith(p))) return NextResponse.next();
  if (req.cookies.get("ng_uid")?.value) return NextResponse.next();
  return NextResponse.json({ error: "connect_wallet" }, { status: 401 });
}

export const config = { matcher: "/api/:path*" };
