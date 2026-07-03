/**
 * Solana chain adapters — the Stage-B implementations of the two on-chain rails.
 *
 * These sit behind the clean `SasAnchor` / `X402Facilitator` interfaces (see ./index).
 * They are INACTIVE until configured by env, so importing this file is harmless
 * in the sandbox; `index.ts` only dispatches here when NEUGRID_CHAIN_MODE=solana.
 *
 * Design: the modules (attestations, x402) always write the in-platform Stage-1
 * mirror synchronously, then fire `anchor()` here as a non-blocking async step.
 * On-chain confirmation fills the record's `onchain` field; the next read picks
 * it up (the modules already reconcile-on-read). Nothing blocks a request on a
 * Solana round-trip — which is also the correct production shape.
 *
 * Verified addresses below are a mid-2026 snapshot from the crypto-rails research
 * pass. RE-VERIFY against live docs before pointing at mainnet money.
 */

import type { Attestation } from "../types";
import type {
  SasAnchor, X402Facilitator, X402PaymentPayload, X402PaymentRequirements,
  X402VerifyResult, X402SettleResult, X402SupportedKind,
} from "./index";
import { mintTokenizedAttestation, closeTokenizedAttestation } from "./sasSolana";
import { sasSchemaFor } from "./sasSchemas";

/* ----------------------------- Verified constants ----------------------------- */

/** Native USDC SPL mint on Solana mainnet (x402 settlement asset). */
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Solana Attestation Service program id (mainnet). */
export const SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

/* -------------------------------- Config readers ------------------------------ */
// All Stage-B secrets come from env (Cloud Run / Secret Manager in the deploy
// env). Absent config => the adapter stays a no-op and the Stage-1 mirror stands.

interface SasConfig {
  rpcUrl: string;
  wssUrl?: string;      // RPC websocket (for send+confirm); defaults to rpcUrl http→ws
  issuerSecret: string; // base58 issuer keypair — the SAS authority (clawback/burn)
  cluster: string;
  sasProgramId: string;
}

interface X402Config {
  facilitatorUrl: string; // Coinbase CDP facilitator or a self-hosted Kora signer
  apiKey?: string;        // static bearer for a self-hosted/third-party facilitator
  cluster: string;
}

function cluster(): string {
  return process.env.NEUGRID_SOLANA_CLUSTER || "mainnet-beta";
}

function sasConfig(): SasConfig | null {
  const rpcUrl = process.env.NEUGRID_SOLANA_RPC;
  const issuerSecret = process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!rpcUrl || !issuerSecret) return null;
  return { rpcUrl, wssUrl: process.env.NEUGRID_SOLANA_WSS, issuerSecret, cluster: cluster(), sasProgramId: process.env.NEUGRID_SAS_PROGRAM_ID || SAS_PROGRAM_ID };
}

function x402Config(): X402Config | null {
  const facilitatorUrl = process.env.NEUGRID_X402_FACILITATOR_URL;
  const payTo = process.env.NEUGRID_X402_PAY_TO;
  if (!facilitatorUrl || !payTo) return null; // payTo is required to build requirements
  return { facilitatorUrl: facilitatorUrl.replace(/\/$/, ""), apiKey: process.env.NEUGRID_X402_API_KEY, cluster: cluster() };
}

/**
 * Facilitator auth headers, per endpoint. Two supported modes:
 *  - a static bearer (`NEUGRID_X402_API_KEY`) — self-hosted / third-party
 *    facilitators (e.g. PayAI, a Kora signer);
 *  - Coinbase CDP: if `@coinbase/x402` is installed it mints the per-request JWT.
 *    Loaded via a non-analyzable dynamic import so the sandbox build never needs it.
 */
async function authHeaders(cfg: X402Config, endpoint: "verify" | "settle" | "supported"): Promise<Record<string, string>> {
  if (cfg.apiKey) return { authorization: `Bearer ${cfg.apiKey}` };
  try {
    const cdpPkg = "@coinbase/x402"; // variable specifier ⇒ not type-resolved / not bundled
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ cdpPkg)) as { facilitator?: { createAuthHeaders?: () => Promise<Record<string, Record<string, string>>> } };
    const make = mod.facilitator?.createAuthHeaders;
    if (make) return (await make())?.[endpoint] ?? {};
  } catch { /* not installed → unauthenticated (fine for open/self-hosted facilitators) */ }
  return {};
}

/* ------------------------------- SAS attestations ----------------------------- */

export const solanaSas: SasAnchor = {
  /**
   * Mint a tokenized soulbound attestation on Solana via SAS (Token-2022 with
   * NonTransferable + PermanentDelegate=issuer-clawback + MintCloseAuthority),
   * then fill `att.onchain = { mint, tx, cluster }`. The credential + schemas must
   * already exist on-chain (scripts/sas-setup.mjs). See ./sasSolana.
   */
  async anchor(att: Attestation): Promise<void> {
    const cfg = sasConfig();
    if (!cfg) return;                              // unconfigured → Stage-1 mirror stands
    if (!att.subject_wallet) return;               // no wallet bound → nothing to mint to
    if (!sasSchemaFor(att.schema)) return;         // unknown schema → skip (mirror stands)
    if (att.onchain?.mint) return;                 // already anchored (idempotent)
    const { mint, tx } = await mintTokenizedAttestation(cfg, {
      schemaKey: att.schema,
      recipientWallet: att.subject_wallet,
      fieldsJson: JSON.stringify(att.fields ?? {}),
      tokenName: att.title,
    });
    att.onchain = { mint, tx, cluster: cfg.cluster };
  },

  /**
   * Revoke an on-chain attestation: close the tokenized attestation via the issuer
   * authority (PermanentDelegate clawback + MintCloseAuthority). Clears `onchain`.
   */
  async revoke(att: Attestation): Promise<void> {
    const cfg = sasConfig();
    if (!cfg || !att.onchain?.mint) return;  // never minted on-chain → nothing to revoke
    if (!att.subject_wallet || !sasSchemaFor(att.schema)) return;
    await closeTokenizedAttestation(cfg, { schemaKey: att.schema, recipientWallet: att.subject_wallet });
    att.onchain = undefined; // burned/closed on-chain
  },
};

/* ---------------------------------- x402 rail --------------------------------- */

/**
 * The real x402 facilitator client (dependency-free — global `fetch`). Activates
 * when NEUGRID_X402_FACILITATOR_URL + NEUGRID_X402_PAY_TO are set. Speaks the
 * canonical x402 v1 contract: POST { paymentPayload, paymentRequirements } to
 * `/verify` and `/settle`; GET `/supported`. The facilitator does ALL on-chain
 * work (it is the fee-payer / gas sponsor on Solana), so the server never signs.
 *
 * ⚠️ UNTESTED against a live facilitator (the sandbox can't reach one). Verify a
 * devnet round-trip before pointing at mainnet money — see docs/DEPLOY.md.
 */
export const solanaX402: X402Facilitator = {
  configured(): boolean {
    return !!x402Config();
  },

  async supported(): Promise<X402SupportedKind[]> {
    const cfg = x402Config();
    if (!cfg) return [];
    const res = await fetch(`${cfg.facilitatorUrl}/supported`, { headers: await authHeaders(cfg, "supported") }).catch(() => null);
    if (!res || !res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as { kinds?: X402SupportedKind[] };
    return data.kinds ?? [];
  },

  async verify(payload: X402PaymentPayload, req: X402PaymentRequirements): Promise<X402VerifyResult> {
    const cfg = x402Config();
    if (!cfg) return { isValid: false, invalidReason: "facilitator_unconfigured" };
    const res = await fetch(`${cfg.facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders(cfg, "verify")) },
      // x402Version is optional for open facilitators but REQUIRED by Coinbase CDP
      body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: req }),
    });
    if (!res.ok) return { isValid: false, invalidReason: `facilitator_http_${res.status}` };
    return (await res.json().catch(() => ({ isValid: false, invalidReason: "bad_facilitator_response" }))) as X402VerifyResult;
  },

  async settle(payload: X402PaymentPayload, req: X402PaymentRequirements): Promise<X402SettleResult> {
    const cfg = x402Config();
    if (!cfg) return { success: false, errorReason: "facilitator_unconfigured" };
    const res = await fetch(`${cfg.facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders(cfg, "settle")) },
      body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: req }),
    });
    if (!res.ok) return { success: false, errorReason: `facilitator_http_${res.status}` };
    return (await res.json().catch(() => ({ success: false, errorReason: "bad_facilitator_response" }))) as X402SettleResult;
  },
};
