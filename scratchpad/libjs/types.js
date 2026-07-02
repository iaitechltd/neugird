"use strict";
/**
 * NeuGrid core domain types.
 * Single source of truth shared by the frontend and the canister-shaped
 * backend modules. See `docs/NEUGRID_MASTER_SPEC.md` for the full system design.
 *
 * Design rule: these shapes are deliberately backend-agnostic so the same
 * types serialize cleanly whether state lives in the local store today or in
 * ICP canisters / Solana programs later.
 *
 * v2 extends the original spec with the full ecosystem: the universal Job
 * protocol, the shared trust service, lifecycle/graduation gates, milestone
 * escrow, the two-ledger Pulse, the two-layer token model, the open agent
 * economy (native + external via SDK/MCP), GridX products, markets, and fees.
 * New fields on pre-existing interfaces are OPTIONAL so the seeded in-memory
 * store keeps type-checking until it is migrated.
 */
Object.defineProperty(exports, "__esModule", { value: true });
