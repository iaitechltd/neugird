/**
 * x402 — HTTP-402 machine payments for the agent gateway.
 *
 * Agents pay micro-USDC to access metered resources or to pay each other; fees
 * accrue to the protocol treasury (a concrete platform-revenue primitive) or, for
 * agent-to-agent (a2a), to the recipient agent. All capped by the payer's per-Job
 * spend limit. GRID holders get a governable discount (closing the GRID demand loop).
 *
 * TWO settlement modes (NEUGRID_CHAIN_MODE):
 *  - "memory" (default / dev): a mock in-memory record + deterministic proof.
 *  - "solana": the REAL x402 protocol — spec-correct PaymentRequirements, a
 *    client-signed `X-PAYMENT`, verified + settled through a Coinbase-CDP-style
 *    facilitator (the on-chain fee-payer). See src/lib/chain/solana.ts.
 */

import { createHash } from "node:crypto";
import { db } from "../store";
import { newId, nowISO } from "../id";
import { x402Facilitator, x402PayConfig } from "../chain";
import type { X402PaymentPayload, X402PaymentRequirements, X402SupportedKind } from "../chain";
import * as Agents from "./agents";
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { Agent, Settlement } from "../types";

const ASSET = "USDC";
const NETWORK = "solana";
const PAYEE = "neugrid:treasury"; // protocol fee sink (memory mode)
const USDC_DECIMALS = 6;
const GRID_DISCOUNT_MIN = 1000; // owner must hold ≥ this GRID to get the holder discount

/** The catalogue of metered gateway resources (price in USDC + a description). */
export const RESOURCES: Record<string, { price: number; description: string }> = {
  signals:     { price: 2,  description: "Premium market + open-job signals" },
  boost:       { price: 10, description: "7-day priority placement in agent discovery" },
  market_data: { price: 3,  description: "Live Trade order books, 24h stats + prices across all markets" },
  provenance:  { price: 4,  description: "Founder credibility + on-chain project lineage (?market= or ?grid=)" },
  discovery:   { price: 3,  description: "Reputation-ranked builders + agents (deep talent/agent search)" },
};

export function isResource(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(RESOURCES, name);
}

/** Price for a resource, after the GRID-holder discount (if the payer's owner qualifies). */
export function priceFor(name: string, agent?: Agent): number {
  const base = RESOURCES[name]?.price;
  if (base == null) return NaN;
  if (agent?.owner_id && Wallets.balances(agent.owner_id).grid >= GRID_DISCOUNT_MIN) {
    const bps = Params.get("grid_fee_discount_bps"); // governable (default 2500 = 25% off)
    return Math.max(0, Math.round(base * (10000 - bps)) / 10000);
  }
  return base;
}

/** True when the REAL x402 rail is active (solana mode + facilitator configured). */
export function active(): boolean {
  return !!x402PayConfig() && x402Facilitator.configured();
}

function ledger(): Settlement[] {
  return (db.settlements ??= []);
}

/** Whether an agent paid for a `boost` in the last 7 days (used to rank discovery). */
export function isBoosted(agent_id: string): boolean {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  return ledger().some((s) => s.payer_id === agent_id && s.resource === "boost" && s.status === "settled" && new Date(s.created_at).getTime() >= cutoff);
}

/* ------------------------------- memory mode ------------------------------- */

export interface X402Quote {
  resource: string; amount: number; asset: string; network: string; scheme: "exact"; pay_to: string;
}

/** The (mock) payment requirement body for a 402, memory mode. */
export function quote(resource: string, agent?: Agent): X402Quote | undefined {
  const amount = priceFor(resource, agent);
  if (!Number.isFinite(amount)) return undefined;
  return { resource, amount, asset: ASSET, network: NETWORK, scheme: "exact", pay_to: PAYEE };
}

function proofToken(payer: string, resource: string, nonce: string): string {
  return "x402_" + createHash("sha256").update([payer, resource, nonce, PAYEE].join(":")).digest("hex").slice(0, 24);
}

/** Settle a payment for `resource` from an agent (memory mode), capped by spend limit. */
export function settle(payer_id: string, resource: string): { settlement?: Settlement; proof?: string; error?: string } {
  const agent = Agents.getAgent(payer_id);
  if (!agent) return { error: "agent_not_found" };
  const amount = priceFor(resource, agent);
  if (!Number.isFinite(amount)) return { error: "unknown_resource" };
  if (amount > Agents.effectiveCap(agent)) return { error: "over_spend_limit" };

  const proof = proofToken(payer_id, resource, newId("n"));
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id, payee: PAYEE, resource,
    amount, asset: ASSET, network: NETWORK, scheme: "exact", proof, status: "settled", created_at: nowISO(),
  };
  ledger().push(settlement);
  return { settlement, proof };
}

/** Verify a presented (mock) payment proof actually paid for this resource. */
export function verify(proof: string | null | undefined, resource: string): boolean {
  if (!proof) return false;
  return ledger().some((s) => s.proof === proof && s.resource === resource && s.status === "settled");
}

/** Charge an agent a DYNAMIC USDC amount to the treasury (memory mode) — for a
 *  metered ACTION whose price isn't a fixed catalogue entry (e.g. an Echo build,
 *  priced at the GRID cost × GRID/USDC rate). Capped by the spend limit. */
export function chargeAgent(payer_id: string, amount: number, resource: string): { settlement?: Settlement; proof?: string; error?: string } {
  const agent = Agents.getAgent(payer_id);
  if (!agent) return { error: "agent_not_found" };
  if (!(amount > 0)) return { error: "invalid_amount" };
  if (amount > Agents.effectiveCap(agent)) return { error: "over_spend_limit" };
  const proof = proofToken(payer_id, resource, newId("n"));
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id, payee: PAYEE, resource,
    amount, asset: ASSET, network: NETWORK, scheme: "exact", proof, status: "settled", created_at: nowISO(),
  };
  ledger().push(settlement);
  return { settlement, proof };
}

/** Agent-to-agent payment (memory mode): pay `to` for a service, credited to the recipient. */
export function payAgent(from_id: string, to_id: string, amount: number, memo?: string): { settlement?: Settlement; proof?: string; error?: string } {
  const from = Agents.getAgent(from_id);
  if (!from) return { error: "agent_not_found" };
  const to = Agents.getAgent(to_id);
  if (!to) return { error: "recipient_not_found" };
  if (to_id === from_id) return { error: "cannot_pay_self" };
  if (!(amount > 0)) return { error: "invalid_amount" };
  if (amount > Agents.effectiveCap(from)) return { error: "over_spend_limit" };

  const proof = proofToken(from_id, `a2a:${to_id}`, newId("n"));
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id: from_id, payee: to_id,
    resource: memo ? `agent_service:${memo}` : "agent_service",
    amount, asset: ASSET, network: NETWORK, scheme: "exact", proof, status: "settled", created_at: nowISO(),
  };
  ledger().push(settlement);
  creditRecipient(to, amount);
  return { settlement, proof };
}

/** Credit an agent-to-agent payment to the recipient agent (owner split, like Jobs). */
function creditRecipient(to: Agent, amount: number): void {
  const bps = to.owner_split_bps ?? 0;
  const ownerCut = Math.round((amount * bps) / 10000);
  to.earnings = (to.earnings ?? 0) + Math.max(0, amount - ownerCut);
  if (ownerCut > 0 && to.owner_id) Wallets.creditUsdc(to.owner_id, ownerCut);
}

/* ------------------------------- solana mode ------------------------------- */

let _supported: Promise<X402SupportedKind[]> | null = null;
function supportedCached(): Promise<X402SupportedKind[]> {
  if (!_supported) _supported = x402Facilitator.supported().catch(() => []);
  return _supported;
}

/** A spec-correct PaymentRequirements from an explicit amount/description/payTo. */
export function requirementsRaw(opts: { amount: number; resourceUrl: string; description: string; payTo?: string }): X402PaymentRequirements | undefined {
  const cfg = x402PayConfig();
  if (!cfg || !(opts.amount >= 0)) return undefined;
  return {
    scheme: "exact", network: cfg.network,
    maxAmountRequired: String(Math.round(opts.amount * 10 ** USDC_DECIMALS)),
    resource: opts.resourceUrl, description: opts.description, mimeType: "application/json",
    payTo: opts.payTo ?? cfg.payTo, maxTimeoutSeconds: 120, asset: cfg.asset,
  };
}

/** PaymentRequirements for a catalogue resource (with the GRID-holder discount applied). */
export function requirements(name: string, resourceUrl: string, agent?: Agent, payTo?: string): X402PaymentRequirements | undefined {
  const amount = priceFor(name, agent);
  if (!Number.isFinite(amount)) return undefined;
  return requirementsRaw({ amount, resourceUrl, description: RESOURCES[name].description, payTo });
}

async function enrich(reqs: X402PaymentRequirements): Promise<X402PaymentRequirements> {
  const kind = (await supportedCached()).find((k) => k.scheme === "exact" && k.network === reqs.network);
  return kind?.extra ? { ...reqs, extra: { ...reqs.extra, ...kind.extra } } : reqs;
}

/** The 402 body for a catalogue resource, or null if unconfigured. */
export async function challenge(
  name: string, resourceUrl: string, agent?: Agent, error?: string, payTo?: string,
): Promise<{ x402Version: number; accepts: X402PaymentRequirements[]; error?: string } | null> {
  const reqs = requirements(name, resourceUrl, agent, payTo);
  if (!reqs) return null;
  return { x402Version: 1, accepts: [await enrich(reqs)], ...(error ? { error } : {}) };
}

/** The 402 body for a raw (a2a) requirement. */
export async function challengeRaw(
  opts: { amount: number; resourceUrl: string; description: string; payTo?: string }, error?: string,
): Promise<{ x402Version: number; accepts: X402PaymentRequirements[]; error?: string } | null> {
  const reqs = requirementsRaw(opts);
  if (!reqs) return null;
  return { x402Version: 1, accepts: [await enrich(reqs)], ...(error ? { error } : {}) };
}

function decodePayload(xPaymentB64: string): X402PaymentPayload | null {
  try { return JSON.parse(Buffer.from(xPaymentB64, "base64").toString("utf8")) as X402PaymentPayload; } catch { return null; }
}

async function settleReqs(payload: X402PaymentPayload, reqs: X402PaymentRequirements): Promise<{ transaction?: string; paymentResponse?: string; error?: string }> {
  const v = await x402Facilitator.verify(payload, reqs);
  if (!v.isValid) return { error: v.invalidReason || "verify_failed" };
  const s = await x402Facilitator.settle(payload, reqs);
  if (!s.success || !s.transaction) return { error: s.errorReason || "settle_failed" };
  const paymentResponse = Buffer.from(JSON.stringify({ success: true, transaction: s.transaction, network: s.network || reqs.network, payer: s.payer ?? v.payer })).toString("base64");
  return { transaction: s.transaction, paymentResponse };
}

/** Verify + settle a client-signed `X-PAYMENT` for a catalogue resource; record it. */
export async function settleViaFacilitator(
  xPaymentB64: string, resource: string, resourceUrl: string, payer_id: string,
): Promise<{ settlement?: Settlement; paymentResponse?: string; error?: string }> {
  const agent = Agents.getAgent(payer_id);
  if (!agent) return { error: "agent_not_found" };
  const amount = priceFor(resource, agent);
  if (!Number.isFinite(amount)) return { error: "unknown_resource" };
  if (amount > Agents.effectiveCap(agent)) return { error: "over_spend_limit" };

  const base = requirements(resource, resourceUrl, agent);
  if (!base) return { error: "facilitator_unconfigured" };
  const reqs = await enrich(base);
  const payload = decodePayload(xPaymentB64);
  if (!payload) return { error: "invalid_payment_header" };

  const r = await settleReqs(payload, reqs);
  if (r.error || !r.transaction) return { error: r.error || "settle_failed" };
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id, payee: reqs.payTo, resource,
    amount, asset: ASSET, network: reqs.network, scheme: "exact",
    proof: r.transaction, status: "settled", created_at: nowISO(),
    onchain: { tx: r.transaction, cluster: process.env.NEUGRID_SOLANA_CLUSTER || "mainnet-beta" },
  };
  ledger().push(settlement);
  return { settlement, paymentResponse: r.paymentResponse };
}

/** Verify + settle a client-signed `X-PAYMENT` for an agent-to-agent payment; credit the recipient. */
export async function settleAgentViaFacilitator(
  xPaymentB64: string, from_id: string, to: Agent, amount: number, resourceUrl: string, memo?: string,
): Promise<{ settlement?: Settlement; paymentResponse?: string; error?: string }> {
  if (!to.wallet_address) return { error: "recipient_has_no_wallet" };
  const base = requirementsRaw({ amount, resourceUrl, description: memo ? `Agent service: ${memo}` : "Agent service", payTo: to.wallet_address });
  if (!base) return { error: "facilitator_unconfigured" };
  const reqs = await enrich(base);
  const payload = decodePayload(xPaymentB64);
  if (!payload) return { error: "invalid_payment_header" };

  const r = await settleReqs(payload, reqs);
  if (r.error || !r.transaction) return { error: r.error || "settle_failed" };
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id: from_id, payee: to.agent_id,
    resource: memo ? `agent_service:${memo}` : "agent_service",
    amount, asset: ASSET, network: reqs.network, scheme: "exact",
    proof: r.transaction, status: "settled", created_at: nowISO(),
    onchain: { tx: r.transaction, cluster: process.env.NEUGRID_SOLANA_CLUSTER || "mainnet-beta" },
  };
  ledger().push(settlement);
  creditRecipient(to, amount); // track internal earnings (USDC arrives on-chain at the wallet)
  return { settlement, paymentResponse: r.paymentResponse };
}

/** Verify + settle a client-signed X-PAYMENT for a DYNAMIC-priced treasury charge
 *  (e.g. an Echo build); record it. payTo defaults to the protocol treasury. */
export async function settleTreasuryRaw(
  xPaymentB64: string, amount: number, resourceUrl: string, payer_id: string, description: string, resource = "charge",
): Promise<{ settlement?: Settlement; paymentResponse?: string; error?: string }> {
  const agent = Agents.getAgent(payer_id);
  if (!agent) return { error: "agent_not_found" };
  if (amount > Agents.effectiveCap(agent)) return { error: "over_spend_limit" };
  const base = requirementsRaw({ amount, resourceUrl, description });
  if (!base) return { error: "facilitator_unconfigured" };
  const reqs = await enrich(base);
  const payload = decodePayload(xPaymentB64);
  if (!payload) return { error: "invalid_payment_header" };
  const r = await settleReqs(payload, reqs);
  if (r.error || !r.transaction) return { error: r.error || "settle_failed" };
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id, payee: reqs.payTo, resource,
    amount, asset: ASSET, network: reqs.network, scheme: "exact",
    proof: r.transaction, status: "settled", created_at: nowISO(),
    onchain: { tx: r.transaction, cluster: process.env.NEUGRID_SOLANA_CLUSTER || "mainnet-beta" },
  };
  ledger().push(settlement);
  return { settlement, paymentResponse: r.paymentResponse };
}

/* --------------------------------- shared ---------------------------------- */

export function listForPayer(payer_id: string): Settlement[] {
  return ledger().filter((s) => s.payer_id === payer_id);
}

export function spendByPayer(payer_id: string): number {
  return listForPayer(payer_id).filter((s) => s.status === "settled").reduce((a, s) => a + s.amount, 0);
}

/** Whether a settlement's payee is the protocol treasury — the memory-mode
 *  PAYEE constant, or (solana mode) the on-chain treasury owner address that
 *  settleViaFacilitator records as `payee: reqs.payTo`. */
function isTreasuryPayee(payee: string): boolean {
  return payee === PAYEE || payee === x402PayConfig()?.payTo;
}

/** Protocol revenue from x402 fees to the treasury (excludes agent-to-agent payments). */
export function revenue(): { total: number; count: number } {
  const settled = ledger().filter((s) => s.status === "settled" && isTreasuryPayee(s.payee));
  return { total: settled.reduce((a, s) => a + s.amount, 0), count: settled.length };
}

/** Per-resource usage (paid count + revenue to treasury) across the catalogue. */
export function resourceStats(): { name: string; price: number; description: string; count: number; revenue: number }[] {
  const led = ledger().filter((s) => s.status === "settled" && isTreasuryPayee(s.payee));
  return Object.entries(RESOURCES).map(([name, meta]) => {
    const rows = led.filter((s) => s.resource === name);
    return { name, price: meta.price, description: meta.description, count: rows.length, revenue: rows.reduce((a, s) => a + s.amount, 0) };
  });
}

/** Agent-to-agent payment volume (settlements whose payee is another agent, not the treasury). */
export function a2aStats(): { count: number; volume: number } {
  const rows = ledger().filter((s) => s.status === "settled" && !isTreasuryPayee(s.payee));
  return { count: rows.length, volume: rows.reduce((a, s) => a + s.amount, 0) };
}
