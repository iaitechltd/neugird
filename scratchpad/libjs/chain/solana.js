"use strict";
/**
 * Solana chain adapters — the Stage-B implementations of the two on-chain rails.
 *
 * These sit behind the clean `SasAnchor` / `X402Anchor` interfaces (see ./index).
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.solanaX402 = exports.solanaSas = exports.SAS_PROGRAM_ID = exports.USDC_MINT_MAINNET = void 0;
/* ----------------------------- Verified constants ----------------------------- */
/** Native USDC SPL mint on Solana mainnet (x402 settlement asset). */
exports.USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/** Solana Attestation Service program id (mainnet). */
exports.SAS_PROGRAM_ID = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";
function cluster() {
    return process.env.NEUGRID_SOLANA_CLUSTER || "mainnet-beta";
}
function sasConfig() {
    const rpcUrl = process.env.NEUGRID_SOLANA_RPC;
    const issuerSecret = process.env.NEUGRID_SAS_ISSUER_SECRET;
    if (!rpcUrl || !issuerSecret)
        return null;
    return { rpcUrl, issuerSecret, cluster: cluster(), sasProgramId: process.env.NEUGRID_SAS_PROGRAM_ID || exports.SAS_PROGRAM_ID };
}
function x402Config() {
    const facilitatorUrl = process.env.NEUGRID_X402_FACILITATOR_URL;
    const payTo = process.env.NEUGRID_X402_PAY_TO;
    if (!facilitatorUrl || !payTo)
        return null;
    return { facilitatorUrl: facilitatorUrl.replace(/\/$/, ""), payTo, apiKey: process.env.NEUGRID_X402_API_KEY, cluster: cluster() };
}
/* ------------------------------- SAS attestations ----------------------------- */
exports.solanaSas = {
    /**
     * Mint a tokenized soulbound attestation on Solana via SAS, then fill
     * `att.onchain = { mint, tx, cluster }`.
     *
     * NOT YET WIRED — needs `@solana/web3.js` + `@solana/spl-token` (Token-2022) +
     * the SAS client (`sas-lib` / the program IDL) added to package.json. The exact
     * call sequence (verified shape):
     *   const conn = new Connection(cfg.rpcUrl, "confirmed");
     *   const issuer = Keypair.fromSecretKey(bs58.decode(cfg.issuerSecret));
     *   // 1. ensure the credential + schema PDAs exist (one-time setup per schema)
     *   // 2. createTokenizedAttestation({ schema: att.schema, data: att.fields,
     *   //      recipient: att.subject_wallet, expiry: 0 })  → Token-2022 mint with
     *   //      NonTransferable + PermanentDelegate(issuer)=clawback + MintCloseAuthority
     *   // 3. send + confirm → { mint, signature }
     *   att.onchain = { mint, tx: signature, cluster: cfg.cluster };
     */
    async anchor(att) {
        const cfg = sasConfig();
        if (!cfg)
            return; // unconfigured → Stage-1 mirror stands, nothing to do
        if (!att.subject_wallet)
            return; // no wallet bound → can't mint to a recipient
        throw new Error("[chain/solana] SAS mint not implemented — add @solana/web3.js + spl-token (Token-2022) + the SAS client, then implement solanaSas.anchor (see the documented call sequence).");
    },
    /**
     * Revoke an on-chain attestation. With SAS this is an issuer clawback/burn via
     * the PermanentDelegate authority, then close the mint (MintCloseAuthority).
     * Same dependency requirement as anchor().
     */
    async revoke(att) {
        const cfg = sasConfig();
        if (!cfg || !att.onchain?.mint)
            return; // never minted on-chain → nothing to revoke
        throw new Error("[chain/solana] SAS revoke not implemented — burn/close the Token-2022 mint via the PermanentDelegate authority (see solanaSas.revoke).");
    },
};
/* ---------------------------------- x402 rail --------------------------------- */
exports.solanaX402 = {
    /**
     * Settle a recorded x402 payment on-chain through the facilitator, then fill
     * `s.onchain = { tx, cluster }` and upgrade `s.proof` to the on-chain signature.
     *
     * This is a REAL, dependency-free client (uses global fetch) — it activates the
     * moment NEUGRID_X402_FACILITATOR_URL + NEUGRID_X402_PAY_TO are set. The request
     * body matches the x402 `exact` scheme; confirm field names against the live
     * facilitator API (Coinbase CDP) before mainnet — see crypto-rails.
     */
    async anchor(s) {
        const cfg = x402Config();
        if (!cfg)
            return; // unconfigured → Stage-1 accounting record stands
        const res = await fetch(`${cfg.facilitatorUrl}/settle`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
            body: JSON.stringify({
                scheme: "exact",
                network: "solana",
                asset: exports.USDC_MINT_MAINNET,
                payTo: cfg.payTo,
                amount: String(s.amount), // facilitators expect base-unit / string amounts
                resource: s.resource,
                nonce: s.settlement_id,
            }),
        });
        if (!res.ok)
            throw new Error(`[chain/solana] x402 facilitator ${res.status}: ${await res.text().catch(() => "")}`);
        const data = (await res.json().catch(() => ({})));
        const tx = data.transaction || data.txHash || data.signature;
        if (tx) {
            s.onchain = { tx, cluster: cfg.cluster };
            s.proof = tx; // the on-chain signature becomes the canonical payment proof
        }
    },
};
