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
const DEFAULT_USER_ID = "usr_neo"; // seeded founder, used until wallet auth lands

export async function getCurrentUserId(): Promise<string> {
  const c = await cookies();
  return c.get(SESSION_COOKIE)?.value ?? DEFAULT_USER_ID;
}

export async function getCurrentUser(): Promise<UserProfile | undefined> {
  const id = await getCurrentUserId();
  return (
    db.users.find((u) => u.id === id) ??
    db.users.find((u) => u.id === DEFAULT_USER_ID)
  );
}

export function userExists(id: string): boolean {
  return db.users.some((u) => u.id === id);
}
