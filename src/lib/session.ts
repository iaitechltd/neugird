/**
 * Session / identity seam.
 *
 * Resolves the "current user" for server-side code (route handlers, actions).
 * Today it reads an `ng_uid` cookie and falls back to the seeded founder so the
 * app is usable before wallet auth exists.
 *
 * Phase 1 swaps `connect()` for real Solana wallet authentication (verify a
 * signed message, then set the same cookie). Everything downstream that calls
 * `getCurrentUser()` stays unchanged — this is the seam.
 */

import { cookies } from "next/headers";
import { db } from "./store";
import type { UserProfile } from "./types";

export const SESSION_COOKIE = "ng_uid";
const DEFAULT_USER_ID = "usr_neo"; // seeded founder, demo mode only

/**
 * Demo mode (default ON): no-cookie visitors resolve to the seeded founder so
 * the app is explorable in dev. NEUGRID_DEMO=off = staging/launch posture —
 * anonymous visitors are GUESTS (empty id, no user), and src/proxy.ts blocks
 * unauthenticated writes at the network boundary.
 */
export function demoMode(): boolean {
  return process.env.NEUGRID_DEMO !== "off";
}

export async function getCurrentUserId(): Promise<string> {
  const c = await cookies();
  return c.get(SESSION_COOKIE)?.value ?? (demoMode() ? DEFAULT_USER_ID : "");
}

export async function getCurrentUser(): Promise<UserProfile | undefined> {
  const id = await getCurrentUserId();
  const found = db.users.find((u) => u.id === id);
  if (found) return found;
  return demoMode() ? db.users.find((u) => u.id === DEFAULT_USER_ID) : undefined;
}

export function userExists(id: string): boolean {
  return db.users.some((u) => u.id === id);
}
