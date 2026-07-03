/**
 * Users — identity records. Wallet-keyed upsert powers Sign-In-With-Solana:
 * the first time a wallet signs in we mint a fresh profile for it.
 */

import { db } from "../store";
import { nowISO } from "../id";
import type { UserProfile } from "../types";

export function getUser(id: string): UserProfile | undefined {
  return db.users.find((u) => u.id === id);
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export interface ListingInput { headline?: unknown; rate_usdc?: unknown; available?: unknown; skills?: unknown }

/** Self-serve Talent listing: headline · rate · availability (+ replaces skills when given). */
export function updateListing(user_id: string, input: ListingInput): { user?: UserProfile; error?: string } {
  const user = getUser(user_id);
  if (!user) return { error: "user_not_found" };
  if (Array.isArray(input.skills)) {
    user.skills = [...new Set(input.skills
      .filter((s): s is string => typeof s === "string" && !!s.trim())
      .map((s) => s.trim().toLowerCase().slice(0, 24)))].slice(0, 12);
  }
  const rate = Number(input.rate_usdc);
  user.listing = {
    headline: str(input.headline, 80) ?? user.listing?.headline,
    rate_usdc: Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : user.listing?.rate_usdc,
    available: typeof input.available === "boolean" ? input.available : (user.listing?.available ?? true),
    updated_at: nowISO(),
  };
  return { user };
}

export function listAll(): UserProfile[] {
  return db.users;
}

export function findByWallet(wallet: string): UserProfile | undefined {
  return db.users.find((u) => u.wallet_addresses.includes(wallet));
}

export function upsertByWallet(wallet: string, referred_by?: string): UserProfile {
  const existing = findByWallet(wallet);
  if (existing) return existing;
  const user: UserProfile = {
    id: `usr_${wallet.slice(0, 12).toLowerCase()}`,
    wallet_addresses: [wallet],
    username: wallet.length > 8 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet,
    skills: [],
    roles_by_grid: [],
    pulse_score: 0,
    reputation: { total: 0, by_dimension: {} },
    reward: { accrued: 0, sybil_adjusted: 0, claimed: 0 },
    joined_grids: [],
    created_at: nowISO(),
  };
  // referral binding — only a real, different user counts (paid later, on first verified work)
  if (referred_by) {
    const ref = db.users.find((u) => u.id === referred_by || u.username.toLowerCase() === referred_by.toLowerCase());
    if (ref && ref.id !== user.id) user.referred_by = ref.id;
  }
  db.users.push(user);
  return user;
}
