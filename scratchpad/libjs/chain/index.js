"use strict";
/**
 * Chain adapters — the single seam between NeuGrid's in-platform rails and the
 * real Solana ones. Modules call `Sas` / `X402` here; they never import a chain
 * SDK directly, so flipping NEUGRID_CHAIN_MODE swaps the backing implementation
 * with zero changes upstream.
 *
 * - mode "memory" (default): anchors are no-ops. The in-platform Stage-1 mirror
 *   (the attestations + settlements stores) is the whole truth. This is what the
 *   sandbox + tests run on.
 * - mode "solana": anchors call the real adapters in ./solana, which fill each
 *   record's `onchain` field asynchronously. See ./solana for the Stage-B notes.
 *
 * Every dispatched call is guarded so an on-chain failure can never reject into a
 * caller or crash a request — it logs and leaves the Stage-1 record intact.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.X402 = exports.Sas = void 0;
exports.chainMode = chainMode;
const solana_1 = require("./solana");
function chainMode() {
    return process.env.NEUGRID_CHAIN_MODE === "solana" ? "solana" : "memory";
}
/* ------------------------------- Memory adapters ------------------------------ */
// The default. No-ops: the in-platform mirror already holds the full Stage-1 state.
const memorySas = {
    async anchor() { },
    async revoke() { },
};
const memoryX402 = {
    async anchor() { },
};
/* --------------------------------- Dispatch ----------------------------------- */
const sasImpl = chainMode() === "solana" ? solana_1.solanaSas : memorySas;
const x402Impl = chainMode() === "solana" ? solana_1.solanaX402 : memoryX402;
/** Run an anchor step without ever rejecting into the (synchronous) caller. */
function guard(label, run) {
    return run().catch((e) => {
        console.warn(`[chain] ${label} failed (Stage-1 record kept):`, e instanceof Error ? e.message : e);
    });
}
exports.Sas = {
    anchor: (att) => guard("sas.anchor", () => sasImpl.anchor(att)),
    revoke: (att) => guard("sas.revoke", () => sasImpl.revoke(att)),
};
exports.X402 = {
    anchor: (s) => guard("x402.anchor", () => x402Impl.anchor(s)),
};
