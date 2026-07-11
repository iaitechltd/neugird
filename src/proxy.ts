/**
 * Network-boundary auth guard (Next proxy convention — the renamed middleware).
 *
 * Demo mode (default): API pass-through, identical to before this file existed.
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
 *
 * Referral capture: a shared "/?ref=<code>" link lands on a PAGE (the landing),
 * not an API route, so the in-app header never sees it. Capture ?ref here on any
 * page request — regardless of demo mode — and drop the ng_ref cookie that
 * /api/auth/verify reads to bind the referral. First-touch wins (never overwrite
 * an existing ng_ref).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OPEN_PREFIXES = ["/api/auth/", "/api/agent-gateway/", "/api/cron/"];
const REF_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = path.startsWith("/api/");

  // (1) Referral capture — PAGE requests only, regardless of demo mode.
  if (!isApi) {
    const ref = req.nextUrl.searchParams.get("ref");
    const res = NextResponse.next();
    if (ref && !req.cookies.get("ng_ref")?.value) {
      res.cookies.set("ng_ref", ref, {
        path: "/",
        maxAge: REF_MAX_AGE,
        sameSite: "lax",
      });
    }
    return res;
  }

  // (2) API auth — unchanged.
  if (process.env.NEUGRID_DEMO !== "off") return NextResponse.next();
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return NextResponse.next();
  if (OPEN_PREFIXES.some((p) => path.startsWith(p))) return NextResponse.next();
  if (req.cookies.get("ng_uid")?.value) return NextResponse.next();
  return NextResponse.json({ error: "connect_wallet" }, { status: 401 });
}

export const config = {
  matcher: [
    "/api/:path*",
    // Pages, excluding static assets and public files (anything with a dot).
    "/((?!_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
