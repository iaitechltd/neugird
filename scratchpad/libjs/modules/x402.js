"use strict";
/**
 * x402 — HTTP-402 machine payments for the agent gateway.
 *
 * An agent pays micro-USDC to access a metered resource: the server answers 402
 * with a payment requirement, the agent settles, then retries with a payment
 * proof. The fee accrues to the protocol (this is a concrete platform-revenue
 * primitive). Payments are capped by the agent's per-Job spend limit, reusing
 * the cold-start guardrail from agent hardening.
 *
 * Stage 1 (here): settlement is an in-memory accounting record + a deterministic
 * proof. Stage 2: swap `settle` for a real x402 facilitator call settling Solana
 * USDC (Coinbase CDP or a self-hosted Kora signer) — same shape, `onchain` filled.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRICES = void 0;
exports.quote = quote;
exports.settle = settle;
exports.verify = verify;
exports.listForPayer = listForPayer;
exports.spendByPayer = spendByPayer;
exports.revenue = revenue;
const node_crypto_1 = require("node:crypto");
const store_1 = require("../store");
const id_1 = require("../id");
const chain_1 = require("../chain");
const Agents = __importStar(require("./agents"));
const ASSET = "USDC";
const NETWORK = "solana";
const PAYEE = "neugrid:treasury"; // protocol fee sink (Stage 2: a real Solana treasury ATA)
/** Price book for metered gateway resources (USDC). */
exports.PRICES = {
    signals: 2, // premium market + open-job signals
    boost: 10, // priority placement in agent discovery
};
/** The x402 payment requirement for a resource (the body of a 402 response). */
function quote(resource) {
    const amount = exports.PRICES[resource];
    if (amount == null)
        return undefined;
    return { resource, amount, asset: ASSET, network: NETWORK, scheme: "exact", pay_to: PAYEE };
}
function ledger() {
    return (store_1.db.settlements ?? (store_1.db.settlements = []));
}
function proofToken(payer, resource, nonce) {
    return "x402_" + (0, node_crypto_1.createHash)("sha256").update([payer, resource, nonce, PAYEE].join(":")).digest("hex").slice(0, 24);
}
/** Settle a payment for `resource` from an agent, capped by its spend limit. */
function settle(payer_id, resource) {
    const q = quote(resource);
    if (!q)
        return { error: "unknown_resource" };
    const agent = Agents.getAgent(payer_id);
    if (!agent)
        return { error: "agent_not_found" };
    if (q.amount > Agents.effectiveCap(agent))
        return { error: "over_spend_limit" };
    const proof = proofToken(payer_id, resource, (0, id_1.newId)("n"));
    const settlement = {
        settlement_id: (0, id_1.newId)("setl"), payer_id, payee: PAYEE, resource,
        amount: q.amount, asset: ASSET, network: NETWORK, scheme: "exact", proof, status: "settled", created_at: (0, id_1.nowISO)(),
    };
    ledger().push(settlement);
    void chain_1.X402.anchor(settlement); // record now; on-chain settlement fills settlement.onchain async (no-op in memory mode)
    return { settlement, proof };
}
/** Verify a presented payment proof actually paid for this resource. */
function verify(proof, resource) {
    if (!proof)
        return false;
    return ledger().some((s) => s.proof === proof && s.resource === resource && s.status === "settled");
}
function listForPayer(payer_id) {
    return ledger().filter((s) => s.payer_id === payer_id);
}
function spendByPayer(payer_id) {
    return listForPayer(payer_id).filter((s) => s.status === "settled").reduce((a, s) => a + s.amount, 0);
}
/** Protocol revenue from x402 fees (the platform's cut). */
function revenue() {
    const settled = ledger().filter((s) => s.status === "settled");
    return { total: settled.reduce((a, s) => a + s.amount, 0), count: settled.length };
}
