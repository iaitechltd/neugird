"use strict";
/**
 * Canister-shaped backend modules. Each namespace maps 1:1 to a canister in
 * the Builder Spec (page 15). UI and API routes import only from here, so the
 * underlying store can later be replaced by real ICP canisters / Solana
 * programs without changing callers.
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
exports.Roles = exports.X402 = exports.Attestations = exports.Agents = exports.GridX = exports.Echo = exports.CampaignX = exports.Markets = exports.Genesis = exports.Jobs = exports.Pulse = exports.Campaign = exports.GridRegistry = exports.Users = void 0;
exports.Users = __importStar(require("./users")); // identity records (wallet-keyed)
exports.GridRegistry = __importStar(require("./gridRegistry")); // GridRegistryCanister
exports.Campaign = __importStar(require("./campaign")); // CampaignCanister
exports.Pulse = __importStar(require("./pulse")); // PulseCanister
exports.Jobs = __importStar(require("./jobs")); // universal Job protocol
exports.Genesis = __importStar(require("./genesis")); // GenesisX funding + milestone escrow
exports.Markets = __importStar(require("./markets")); // Axon/TradeX — gated token markets
exports.CampaignX = __importStar(require("./campaignx")); // distribution deals (project ↔ community)
exports.Echo = __importStar(require("./echo")); // EchoCanister — the integrated build engine
exports.GridX = __importStar(require("./gridx")); // GridX — on-chain app store (published products)
exports.Agents = __importStar(require("./agents")); // SentientX — agents as economic actors
exports.Attestations = __importStar(require("./attestations")); // soulbound credential layer (SAS-bound)
exports.X402 = __importStar(require("./x402")); // x402 agent-to-protocol payments (USDC, Solana later)
exports.Roles = __importStar(require("./roles")); // RolePermissionCanister
