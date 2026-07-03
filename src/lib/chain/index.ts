/**
 * Chain adapters — the single seam between NeuGrid's in-platform rails and the
 * real Solana ones. Modules call `Sas` / `x402Facilitator` here; they never
 * import a chain SDK directly, so flipping NEUGRID_CHAIN_MODE swaps the backing
 * implementation with zero changes upstream.
 *
 * - mode "memory" (default): the SAS anchor is a no-op and the x402 facilitator
 *   is unconfigured. The in-platform Stage-1 mirror (attestations + settlements
 *   stores) is the whole truth. This is what the sandbox + tests run on.
 * - mode "solana": SAS anchors on-chain; the x402 facilitator speaks the real
 *   x402 protocol against a Coinbase-CDP-style facilitator. See ./solana.
 */

import type { Attestation, ContributorSplit, Proposal, Agreement as AgreementT } from "../types";
import { solanaSas, solanaX402, USDC_MINT_MAINNET } from "./solana";
import * as vaultSolana from "./vaultSolana";
import * as gridTokenImpl from "./gridToken";
import * as stakingSolana from "./stakingSolana";
import * as governanceSolana from "./governanceSolana";
import * as splitsSolana from "./splitsSolana";
import * as proofsSolana from "./proofsSolana";

/* -------------------------------- SAS seam ------------------------------------ */

/** Anchor soulbound attestations on-chain (Solana Attestation Service). */
export interface SasAnchor {
  /** Mint a tokenized attestation and fill `att.onchain`. No-op in memory mode. */
  anchor(att: Attestation): Promise<void>;
  /** Revoke / claw back an on-chain attestation. No-op in memory mode. */
  revoke(att: Attestation): Promise<void>;
}

/* ------------------------------- x402 seam ------------------------------------ */
// The real x402 protocol wire types (v1). A resource server answers 402 with
// `accepts: [X402PaymentRequirements]`; the payer signs a payment and retries
// with the base64 `X-PAYMENT` header (an X402PaymentPayload); the server
// verifies + settles it through a facilitator, which does the on-chain work.
// Field names mirror the canonical spec (coinbase/x402 x402Specs.ts).

/** A single payment requirement (one entry in a 402 `accepts` array). */
export interface X402PaymentRequirements {
  scheme: "exact";
  network: string;            // e.g. "solana" (v1) or a CAIP-2 id (CDP v2) — configurable
  maxAmountRequired: string;  // atomic units as a string (USDC = amount × 10^6)
  resource: string;           // the absolute resource URL being paid for
  description: string;
  mimeType: string;
  payTo: string;              // recipient (Solana: the treasury USDC owner address)
  maxTimeoutSeconds: number;
  asset: string;              // Solana: the USDC SPL mint
  extra?: Record<string, unknown>; // scheme-specific (SVM: the facilitator fee-payer)
}

/** The decoded `X-PAYMENT` header — a signed payment the payer presents on retry. */
export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown; // SVM: { transaction: base64 } · EVM: { signature, authorization }
}

export interface X402VerifyResult { isValid: boolean; invalidReason?: string; payer?: string }
export interface X402SettleResult { success: boolean; errorReason?: string; payer?: string; transaction?: string; network?: string }
export interface X402SupportedKind { x402Version: number; scheme: string; network: string; extra?: Record<string, unknown> }

/** The facilitator: verifies + settles payments on-chain on the server's behalf. */
export interface X402Facilitator {
  /** True when solana mode is on AND the facilitator URL + payee are configured. */
  configured(): boolean;
  /** Supported (scheme, network, extra) kinds — `extra` carries the SVM fee-payer. */
  supported(): Promise<X402SupportedKind[]>;
  /** Validate a presented payment against the requirement (no on-chain write). */
  verify(payload: X402PaymentPayload, req: X402PaymentRequirements): Promise<X402VerifyResult>;
  /** Submit the payment on-chain and return the settlement (with the tx signature). */
  settle(payload: X402PaymentPayload, req: X402PaymentRequirements): Promise<X402SettleResult>;
}

/* ------------------------------- Mode selection ------------------------------- */

export type ChainMode = "memory" | "solana";

export function chainMode(): ChainMode {
  return process.env.NEUGRID_CHAIN_MODE === "solana" ? "solana" : "memory";
}

/* ------------------------------- Memory adapters ------------------------------ */
// The default. SAS is a no-op; the x402 facilitator reports "unconfigured" so the
// module keeps its Stage-1 in-platform settlement path.

const memorySas: SasAnchor = {
  async anchor() {},
  async revoke() {},
};

const memoryX402: X402Facilitator = {
  configured: () => false,
  async supported() { return []; },
  async verify() { return { isValid: false, invalidReason: "facilitator_unconfigured" }; },
  async settle() { return { success: false, errorReason: "facilitator_unconfigured" }; },
};

/* --------------------------------- Dispatch ----------------------------------- */

const sasImpl: SasAnchor = chainMode() === "solana" ? solanaSas : memorySas;
const x402Impl: X402Facilitator = chainMode() === "solana" ? solanaX402 : memoryX402;

/** Run a SAS anchor step without ever rejecting into the (synchronous) caller. */
function guard(label: string, run: () => Promise<void>): Promise<void> {
  return run().catch((e: unknown) => {
    console.warn(`[chain] ${label} failed (Stage-1 record kept):`, e instanceof Error ? e.message : e);
  });
}

export const Sas: SasAnchor = {
  anchor: (att) => guard("sas.anchor", () => sasImpl.anchor(att)),
  revoke: (att) => guard("sas.revoke", () => sasImpl.revoke(att)),
};

/** The x402 facilitator (real in solana mode; unconfigured in memory mode). The
 *  module drives verify/settle and handles their typed results, so — unlike the
 *  SAS anchor — these are NOT guard-swallowed; callers see success/failure. */
export const x402Facilitator: X402Facilitator = x402Impl;

/** Solana settlement config the x402 module needs to BUILD a payment requirement
 *  (payTo / asset / network). Null unless solana mode + a payee are configured. */
export function x402PayConfig(): { payTo: string; asset: string; network: string } | null {
  const payTo = process.env.NEUGRID_X402_PAY_TO;
  if (chainMode() !== "solana" || !payTo) return null;
  return {
    payTo,
    asset: process.env.NEUGRID_X402_ASSET || USDC_MINT_MAINNET, // Solana USDC SPL mint
    network: process.env.NEUGRID_X402_NETWORK || "solana",      // v1 "solana" | CAIP-2 for CDP v2
  };
}

/* ------------------------------ Milestone vault ------------------------------- */
// GenesisX escrow mirrored onto the real milestone_vault program (contracts/).
// Fire-and-forget from genesis.ts: every call is guarded — a chain failure logs
// and the Stage-1 ledger stands. Inactive unless NEUGRID_VAULT_PROGRAM_ID (+ the
// solana chain mode + RPC + mint + payer secret) is configured.

export const Vault = {
  configured: (): boolean => !!vaultSolana.vaultConfig(),
  create: (p: Proposal) => guard("vault.create", () => vaultSolana.mirrorCreate(p)),
  back: (p: Proposal, amount: number) => guard("vault.back", () => vaultSolana.mirrorBack(p, amount)),
  release: (p: Proposal, order: number) => guard("vault.release", () => vaultSolana.mirrorRelease(p, order)),
  expire: (p: Proposal) => guard("vault.expire", () => vaultSolana.mirrorExpire(p)),
  kill: (p: Proposal) => guard("vault.kill", () => vaultSolana.mirrorKill(p)),
};

/* -------------------------------- GRID token ---------------------------------- */
// Vested-claim mirror onto the real GRID mint (C2). Guarded fire-and-forget from
// Rewards.claim — a chain failure logs and the platform balance stands.

export const GridToken = {
  configured: (): boolean => !!gridTokenImpl.gridTokenConfig(),
  claim: (recipientWallet: string | undefined, amountGrid: number): Promise<void> =>
    guard("gridToken.claim", async () => { await gridTokenImpl.mirrorClaim(recipientWallet, amountGrid); }),
};

/* -------------------------------- GRID staking -------------------------------- */
// Stake-to-list mirrored onto the real grid_staking program (C3). Guarded
// fire-and-forget from staking.ts / markets.ts.

export const Staking = {
  configured: (): boolean => !!stakingSolana.stakingConfig(),
  stake: (market_id: string, amount: number, lockSeconds: number) =>
    guard("staking.stake", () => stakingSolana.mirrorStake(market_id, amount, lockSeconds)),
  fees: (market_id: string, amount: number) =>
    guard("staking.fees", () => stakingSolana.mirrorFees(market_id, amount)),
  release: (market_id: string, amount: number) =>
    guard("staking.release", () => stakingSolana.mirrorRelease(market_id, amount)),
  slash: (market_id: string) => guard("staking.slash", () => stakingSolana.mirrorSlash(market_id)),
};

/* ------------------------------- GRID governance ------------------------------ */
// Lock-to-vote mirrored onto the real grid_governance program (C4). Guarded
// fire-and-forget from governance.ts. Realms/SPL-Governance = the TGE path.

export const Gov = {
  configured: (): boolean => !!governanceSolana.govConfig(),
  propose: (proposal_id: string, title: string, quorumGrid: number, closesAtISO: string) =>
    guard("gov.propose", () => governanceSolana.mirrorPropose(proposal_id, title, quorumGrid, closesAtISO)),
  vote: (proposal_id: string, support: boolean, amountGrid: number) =>
    guard("gov.vote", () => governanceSolana.mirrorVote(proposal_id, support, amountGrid)),
  resolve: (proposal_id: string) => guard("gov.resolve", () => governanceSolana.mirrorResolve(proposal_id)),
};

/* ------------------------------ Revenue splitter ------------------------------ */
// SubGrid ownership splits, executable on-chain (C5). Guarded fire-and-forget.

export const Splits = {
  configured: (): boolean => !!splitsSolana.splitsConfig(),
  configure: (subgrid_id: string, splits: ContributorSplit[]) =>
    guard("splits.configure", () => splitsSolana.mirrorConfigure(subgrid_id, splits)),
  distribute: (subgrid_id: string, amount: number) =>
    guard("splits.distribute", () => splitsSolana.mirrorDistribute(subgrid_id, amount)),
};

/* --------------------------------- Deal proofs --------------------------------- */
// C7 — no custom program: a struck agreement's sha256 anchors via the audited
// Solana Memo program. Guarded fire-and-forget from messaging.ts.

export const Proofs = {
  configured: (): boolean => !!proofsSolana.proofsConfig(),
  anchor: (ag: AgreementT) => guard("proofs.anchor", () => proofsSolana.anchorAgreement(ag)),
};
