/**
 * Onboarding — the starter path (the Season-0 door).
 *
 * A brand-new account has 0 GRID and 0 reputation: without help it can't do the
 * platform's one single-player valuable thing (an Echo build, 500 GRID). The
 * starter grant closes that dead-end WITHOUT violating "earned, not sold":
 *
 *   connect a real wallet (SIWS) → one-time NON-TRANSFERABLE Echo compute
 *   credit (`starter_credit_grid`, default 500 = exactly one build) → the build
 *   earns their first real reputation + proof-of-build + GRID allocation.
 *
 * Sybil posture: the grant is keyed to the SIGNING WALLET ADDRESS (one grant per
 * account AND per wallet, recorded in the settlements ledger), and the credit
 * can ONLY burn on Echo compute (Wallets.debitCompute) — it never becomes
 * sellable GRID, so a wallet farm earns nothing but subsidized inference that
 * produces publicly-attributed builds. Mainnet hardening (proof-of-humanity /
 * wallet-age checks) slots into `claimStarterGrant` when real inference cost
 * demands it.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Params from "./params";
import * as Wallets from "./wallets";

export const STARTER_SINK = "neugrid:starter"; // audit-ledger payer for grants

function grantOf(user_id: string) {
  return db.settlements.find((s) => s.payer_id === STARTER_SINK && s.payee === user_id);
}
function walletUsed(wallet: string): boolean {
  return db.settlements.some((s) => s.payer_id === STARTER_SINK && s.resource === `starter_grant:${wallet}`);
}

/** One-time starter grant. Gates: a connected wallet (the sybil anchor), never
 *  claimed by this account, never claimed by this wallet address, grant > 0. */
export function claimStarterGrant(user_id: string): { granted?: number; error?: string } {
  const user = db.users.find((u) => u.id === user_id);
  if (!user) return { error: "no_user" };
  const wallet = user.wallet_addresses?.[0];
  if (!wallet) return { error: "connect_wallet_first" };
  if (grantOf(user_id)) return { error: "already_claimed" };
  if (walletUsed(wallet)) return { error: "wallet_already_used" };
  const amount = Params.get("starter_credit_grid");
  if (!(amount > 0)) return { error: "grant_disabled" }; // governance turned it off
  Wallets.grantStarterCredit(user_id, amount);
  db.settlements.push({
    settlement_id: newId("setl"), payer_id: STARTER_SINK, payee: user_id,
    resource: `starter_grant:${wallet}`, amount, asset: "GRID",
    network: "neugrid", scheme: "exact", proof: `starter:${user_id}`, status: "settled", created_at: nowISO(),
  });
  return { granted: amount };
}

/** Grant-on-connect (called from SIWS verify) — silent when ineligible. */
export function autoGrant(user_id: string): number {
  return claimStarterGrant(user_id).granted ?? 0;
}

export interface StarterState {
  wallet_connected: boolean;
  claimed: boolean;
  eligible: boolean; // can claim right now
  credit: number; // unspent starter credit
  amount: number; // current grant size (governable)
  builds: number; // owner's Echo builds — step 3 completes the path
  show: boolean; // the /home strip renders only while the path is live
}
/** The 3-step starter path state — drives the /home STARTER PATH strip. */
export function starterState(user_id: string): StarterState {
  const user = db.users.find((u) => u.id === user_id);
  const wallet = user?.wallet_addresses?.[0];
  const wallet_connected = !!wallet;
  const claimed = !!grantOf(user_id);
  const credit = Wallets.get(user_id).starter_credit ?? 0;
  const builds = db.builds.filter((b) => b.owner_id === user_id).length;
  const amount = Params.get("starter_credit_grid");
  const eligible = wallet_connected && !claimed && amount > 0 && !walletUsed(wallet as string);
  // live until the first build ships; after that the economy takes over
  const show = builds === 0 && (eligible || credit > 0 || !wallet_connected);
  return { wallet_connected, claimed, eligible, credit, amount, builds, show };
}
