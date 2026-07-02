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

export function listAll(): UserProfile[] {
  return db.users;
}

export function findByWallet(wallet: string): UserProfile | undefined {
  return db.users.find((u) => u.wallet_addresses.includes(wallet));
}

export function upsertByWallet(wallet: string): UserProfile {
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
  db.users.push(user);
  return user;
}
