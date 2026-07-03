/**
 * Referrals + affiliate — growth that pays only for REAL contributors.
 *
 * Referral: every user's code is their username (`/?ref=<username>`). A signup
 * through the link binds `referred_by`; nothing pays until the referred user
 * completes their FIRST verified economic action (paid job delivered, raise
 * backed, product bought, build shipped) — then the referrer earns +15 Pulse
 * (→150 GRID) and the referred user +5 (→50). Dead invites earn zero.
 *
 * Affiliate: referrers additionally earn `affiliate_fee_share_bps` (governable,
 * default 10%) of the PROTOCOL FEES their verified referrals generate in their
 * first 12 months — derived on read from treasury fee receipts, credited as
 * GRID allocation at 10 GRID per $1 of share. Shown on /rewards; TGE-merge is
 * a follow-up (the Pulse-derived ledger stays the TGE source of truth for now).
 */

import { db } from "../store";
import { nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Params from "./params";

export const REFERRER_PULSE = 15;
export const REFERRED_PULSE = 5;
export const AFFILIATE_GRID_PER_USD = 10;
const AFFILIATE_WINDOW_MS = 365 * 24 * 3600 * 1000;
const TREASURY = "neugrid:treasury";

/** A user's referral code IS their username (pretty links, no extra state). */
export function codeFor(user_id: string): string | undefined {
  return db.users.find((u) => u.id === user_id)?.username;
}
export function resolveCode(code: string) {
  const c = code.trim().toLowerCase();
  return db.users.find((u) => u.username.toLowerCase() === c || u.id === code);
}

/** Bind a new user to their referrer (signup-time; idempotent, never self). */
export function bind(user_id: string, refCode: string): boolean {
  const user = db.users.find((u) => u.id === user_id);
  const referrer = resolveCode(refCode);
  if (!user || !referrer || user.referred_by || referrer.id === user_id) return false;
  // only NEW users can be claimed — someone active for a while isn't a referral
  if (Date.now() - Date.parse(user.created_at) > 24 * 3600 * 1000) return false;
  user.referred_by = referrer.id;
  return true;
}

/**
 * The verification trigger — called from the four first-economic-action sites
 * (job payout, raise backing, product purchase, Echo build). Pays ONCE.
 */
export function checkVerify(user_id: string): void {
  const user = db.users.find((u) => u.id === user_id);
  if (!user?.referred_by || user.referral_verified_at) return;
  const referrer = db.users.find((u) => u.id === user.referred_by);
  if (!referrer) return;
  user.referral_verified_at = nowISO();
  Pulse.recordEvent({
    target_type: "user", target_id: referrer.id, user_id: user.id,
    action_type: "referral_verified", weight: REFERRER_PULSE,
    reason: `Referral verified — ${user.username} completed their first verified work`,
    verification_source: `referral:${user.id}`, dimension: "creator",
  });
  Pulse.recordEvent({
    target_type: "user", target_id: user.id, user_id: user.id,
    action_type: "referral_verified", weight: REFERRED_PULSE,
    reason: `Welcome bonus — first verified work (referred by ${referrer.username})`,
    verification_source: `referral:${referrer.id}`, dimension: "creator",
  });
}

/** Protocol-fee receipts a referred user generated inside the affiliate window. */
function feesFrom(user_id: string, sinceISO: string): number {
  const since = Date.parse(sinceISO);
  const until = since + AFFILIATE_WINDOW_MS;
  return (db.settlements ?? [])
    .filter((s) => s.payer_id === user_id && s.payee === TREASURY && s.status === "settled")
    .filter((s) => { const t = Date.parse(s.created_at); return t >= since && t <= until; })
    .reduce((a, s) => a + s.amount, 0);
}

export interface ReferralRow { id: string; username: string; joined: string; verified_at?: string; fees_usd: number }

/** The full referral + affiliate view for the dashboard. */
export function viewFor(user_id: string) {
  const rows: ReferralRow[] = db.users
    .filter((u) => u.referred_by === user_id)
    .map((u) => ({
      id: u.id, username: u.username, joined: u.created_at,
      verified_at: u.referral_verified_at,
      fees_usd: u.referral_verified_at ? Math.round(feesFrom(u.id, u.referral_verified_at) * 100) / 100 : 0,
    }));
  const shareBps = Params.get("affiliate_fee_share_bps");
  const fees = rows.reduce((a, r) => a + r.fees_usd, 0);
  const share_usd = Math.round(fees * shareBps) / 10_000;
  return {
    code: codeFor(user_id),
    referrals: rows,
    verified: rows.filter((r) => r.verified_at).length,
    pending: rows.filter((r) => !r.verified_at).length,
    affiliate: {
      share_bps: shareBps,
      fees_usd: Math.round(fees * 100) / 100,
      share_usd,
      grid: Math.round(share_usd * AFFILIATE_GRID_PER_USD),
    },
  };
}
