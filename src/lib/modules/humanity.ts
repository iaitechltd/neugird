/**
 * Humanity — the proof-of-humanity tier layer (docs/POH_GATE.md).
 *
 * Participation stays open; EXTRACTION is gated. The reward ledger is derived at
 * read time, so these gates are read-time predicates — verification is
 * RETROACTIVE (verify any time before the TGE and your whole earned history
 * counts; unverified shows as "pending", never "gone").
 *
 * Tiers: 0 = wallet (SIWS) · 1 = established wallet (native on-chain signals:
 * age + activity) · 2 = verified human (a provider attestation — civic /
 * worldid / … — bound to the account; provider-agnostic record, adapters are
 * config not architecture).
 *
 * Both gates are governable Params defaulting to 0 (OFF): flipping them for
 * Season 0 is itself a governance action.
 */

import { db } from "../store";
import { nowISO } from "../id";
import * as Params from "./params";
import type { HumanityRecord, UserProfile } from "../types";

export const TIER_NAMES = ["wallet", "established wallet", "verified human"] as const;

// Native T1 thresholds (conservative: raise the farm cost, not a wall).
// Move into Params if governance should own them (POH_GATE.md §7).
export const MIN_WALLET_AGE_DAYS = 30;
export const MIN_TX_COUNT = 25;

function userOf(user_id: string): UserProfile | undefined {
  return db.users.find((u) => u.id === user_id);
}

export function recordFor(user_id: string): HumanityRecord {
  return userOf(user_id)?.humanity ?? { tier: 0, updated_at: "" };
}

/** The user's current humanity tier. An attestation is tier 2 outright; native
 *  signals earn tier 1; a bare SIWS wallet is tier 0. */
export function tierFor(user_id: string): number {
  const r = recordFor(user_id);
  if (r.attestation) return 2;
  return r.tier ?? 0;
}

/** Record a tier-2 provider attestation (civic / worldid / founder / …).
 *  Provider adapters call this after verifying their own proof. */
export function attest(user_id: string, provider: string, ref?: string): { record?: HumanityRecord; error?: string } {
  const user = userOf(user_id);
  if (!user) return { error: "no_user" };
  const at = nowISO();
  user.humanity = { ...(user.humanity ?? { tier: 0 }), tier: 2, attestation: { provider, ref, at }, updated_at: at };
  return { record: user.humanity };
}

/** Revoke the attestation (provider clawback / fraud). Native signals survive. */
export function revoke(user_id: string): { record?: HumanityRecord; error?: string } {
  const user = userOf(user_id);
  if (!user?.humanity) return { error: "no_record" };
  delete user.humanity.attestation;
  user.humanity.tier = nativeTier(user.humanity);
  user.humanity.updated_at = nowISO();
  return { record: user.humanity };
}

function nativeTier(r: HumanityRecord): 0 | 1 {
  const s = r.signals;
  return s && (s.wallet_age_days ?? 0) >= MIN_WALLET_AGE_DAYS && (s.tx_count ?? 0) >= MIN_TX_COUNT ? 1 : 0;
}

/** Dependency-free Solana JSON-RPC (same posture as the chain adapters: guarded,
 *  fail-safe — a pseudo/dev wallet or a dead RPC just leaves the tier as-is). */
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const url = process.env.NEUGRID_SOLANA_RPC || "https://api.devnet.solana.com";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    const d = (await r.json()) as { result?: unknown; error?: unknown };
    if (d.error) throw new Error(JSON.stringify(d.error));
    return d.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Re-read the native on-chain signals for the user's primary SIWS wallet:
 *  transaction count (capped at 1000) + wallet age from the oldest signature.
 *  User-triggered (the /rewards refresh button) — never called on the hot path. */
export async function refreshSignals(user_id: string): Promise<{ record?: HumanityRecord; error?: string }> {
  const user = userOf(user_id);
  if (!user) return { error: "no_user" };
  const wallet = user.wallet_addresses?.[0];
  if (!wallet) return { error: "connect_wallet_first" };
  try {
    const sigs = (await rpc("getSignaturesForAddress", [wallet, { limit: 1000 }])) as { blockTime?: number }[];
    const tx_count = sigs?.length ?? 0;
    const oldest = sigs?.[sigs.length - 1]?.blockTime;
    const wallet_age_days = oldest ? Math.max(0, Math.floor((Date.now() / 1000 - oldest) / 86_400)) : 0;
    const prev = user.humanity ?? { tier: 0 as const, updated_at: "" };
    const signals = { wallet_age_days, tx_count, checked_at: nowISO() };
    user.humanity = { ...prev, signals, tier: prev.attestation ? 2 : nativeTier({ ...prev, signals }), updated_at: nowISO() };
    return { record: user.humanity };
  } catch {
    return { error: "rpc_unavailable" }; // fail-safe: existing record stands
  }
}

/* ---------------------- Civic adapter (Phase 2) --------------------------
 * Civic Uniqueness Pass = one video-selfie-verified human per wallet, issued as
 * an on-chain Gateway Token (program gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs).
 * We READ the pass on the user's SIWS wallet; a valid one ⇒ attest tier 2.
 * Passes live on MAINNET even while our chain rails run devnet, so this adapter
 * carries its own RPC env. Deps load via a tracer-invisible dynamic import
 * (same posture as sas-lib — prod needs the Dockerfile overlay). Constants
 * verified 2026-07-09 (docs/POH_GATE.md §4). */

const CIVIC_UNIQUENESS_NETWORK = "uniqobk8oGh4XBLMqM68K8M2zNu3CdYX7q5go7whQiv"; // mainnet Uniqueness Pass
export const CIVIC_PASS_URL = "https://getpass.civic.com/?pass=unique&chain=solana";

export async function checkCivicPass(user_id: string): Promise<{ record?: HumanityRecord; error?: string }> {
  const user = userOf(user_id);
  if (!user) return { error: "no_user" };
  const wallet = user.wallet_addresses?.[0];
  if (!wallet) return { error: "connect_wallet_first" };
  try {
    const gatewayLib = "@identity.com/solana-gateway-ts";
    const web3Lib = "@solana/web3.js";
    const [{ findGatewayToken }, { Connection, PublicKey }] = await Promise.all([
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ gatewayLib),
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ web3Lib),
    ]);
    const rpc = process.env.NEUGRID_CIVIC_RPC || "https://api.mainnet-beta.solana.com";
    const network = new PublicKey(process.env.NEUGRID_CIVIC_NETWORK || CIVIC_UNIQUENESS_NETWORK);
    const conn = new Connection(rpc, "confirmed");
    const token = await findGatewayToken(conn, new PublicKey(wallet), network);
    if (!token || !token.isValid()) return { error: "no_valid_pass" };
    return attest(user_id, "civic", token.publicKey.toBase58());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // a malformed (dev pseudo-)wallet is a user-state problem, not an RPC one
    if (msg.includes("Invalid public key") || msg.toLowerCase().includes("non-base58")) return { error: "invalid_wallet" };
    return { error: "civic_unavailable" };
  }
}

/** Gate checks (read-time predicates — see module header). */
export function starterGateOk(user_id: string): boolean {
  return tierFor(user_id) >= Params.get("starter_gate_tier");
}
export function rewardsGateOk(user_id: string): boolean {
  return tierFor(user_id) >= Params.get("rewards_gate_tier");
}

/** The full state for the UI (/rewards VERIFICATION panel + /api/humanity). */
export function view(user_id: string) {
  const r = recordFor(user_id);
  const tier = tierFor(user_id);
  const starterReq = Params.get("starter_gate_tier");
  const rewardsReq = Params.get("rewards_gate_tier");
  return {
    tier,
    tier_name: TIER_NAMES[tier] ?? TIER_NAMES[0],
    signals: r.signals ?? null,
    attestation: r.attestation ?? null,
    thresholds: { wallet_age_days: MIN_WALLET_AGE_DAYS, tx_count: MIN_TX_COUNT },
    gates: {
      starter: { required: starterReq, ok: tier >= starterReq },
      rewards: { required: rewardsReq, ok: tier >= rewardsReq },
    },
  };
}
