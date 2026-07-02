"use strict";
/**
 * GridXCanister — the on-chain app store. Builds witnessed by Echo are published
 * here as Products that show verifiable usage + revenue. A Product always belongs
 * to a Grid (its home/owner), so publishing a solo build lazily spawns a
 * `product`-type Grid for it. Listing credits the builder's `creator` reputation.
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
exports.LIST_REPUTATION = void 0;
exports.listProducts = listProducts;
exports.getProduct = getProduct;
exports.productsByOwner = productsByOwner;
exports.productView = productView;
exports.ensureHomeGrid = ensureHomeGrid;
exports.createProductFromBuild = createProductFromBuild;
const store_1 = require("../store");
const id_1 = require("../id");
const Pulse = __importStar(require("./pulse"));
const Echo = __importStar(require("./echo"));
const GridRegistry = __importStar(require("./gridRegistry"));
/** Reputation a GridX listing is worth (creator dimension). Tunable. */
exports.LIST_REPUTATION = 20;
function listProducts(filter = {}) {
    return store_1.db.products.filter((p) => !filter.grid_id || p.grid_id === filter.grid_id);
}
function getProduct(id) {
    return store_1.db.products.find((p) => p.product_id === id);
}
/** Products owned by a user — i.e. those whose home Grid they own. */
function productsByOwner(user_id) {
    const owned = new Set(store_1.db.grids.filter((g) => g.owner_id === user_id).map((g) => g.grid_id));
    return store_1.db.products.filter((p) => owned.has(p.grid_id));
}
/** Read model: a product plus its home Grid and the build it came from. */
function productView(id) {
    const product = getProduct(id);
    if (!product)
        return undefined;
    const grid = store_1.db.grids.find((g) => g.grid_id === product.grid_id);
    const build = store_1.db.builds.find((b) => b.product_id === id);
    return { product, grid: grid ?? null, build: build ?? null };
}
/**
 * Ensure a build has a home/project Grid (where a team coordinates and which a
 * Product can belong to). Lazily spawns a `project`-type Grid the first time it's
 * needed; both "Create Project Grid" and "List on GridX" converge on this one
 * Grid per build. Only the builder may do this.
 */
function ensureHomeGrid(build_id, user_id) {
    const build = Echo.getBuild(build_id);
    if (!build)
        return { error: "not_found" };
    if (build.owner_id !== user_id)
        return { error: "not_owner" };
    const existing = build.grid_id ? store_1.db.grids.find((g) => g.grid_id === build.grid_id) : undefined;
    if (existing)
        return { grid: existing, created: false };
    const grid = GridRegistry.createGrid({
        owner_id: user_id,
        name: build.title,
        category: build.stack[0] ?? "App",
        description: build.summary,
        modules_enabled: ["Grid", "SubGrid", "GridX", "Pulse"],
        grid_type: "project",
    });
    grid.lifecycle_stage = "building";
    build.grid_id = grid.grid_id;
    return { grid, created: true };
}
/**
 * Publish an Echo build to GridX. Only the builder may list their own build.
 * Idempotent: a build that's already listed returns its existing product.
 */
function createProductFromBuild(build_id, user_id) {
    const build = Echo.getBuild(build_id);
    if (!build)
        return { error: "not_found" };
    if (build.owner_id !== user_id)
        return { error: "not_owner" };
    if (build.product_id) {
        const existing = getProduct(build.product_id);
        if (existing)
            return { product: existing, grid: store_1.db.grids.find((g) => g.grid_id === existing.grid_id) };
    }
    const homed = ensureHomeGrid(build_id, user_id);
    if (!homed.grid)
        return { error: homed.error ?? "no_grid" };
    const grid = homed.grid;
    const product = {
        product_id: (0, id_1.newId)("prod"),
        grid_id: grid.grid_id,
        subgrid_id: build.subgrid_id,
        name: build.title,
        description: build.summary,
        artifact_ref: build.artifact,
        category: build.stack[0] ?? "App",
        onchain_revenue: 0,
        active_users: 0,
        followers: 0,
        rating: 0,
        review_count: 0,
        listed_at: (0, id_1.nowISO)(),
    };
    store_1.db.products.unshift(product);
    Echo.markListed(build_id, product.product_id, grid.grid_id);
    Pulse.recordEvent({
        target_type: "user",
        target_id: user_id,
        user_id,
        action_type: "product_listed",
        weight: exports.LIST_REPUTATION,
        reason: `Listed "${build.title}" on GridX`,
        verification_source: "echo:witness",
        dimension: "creator",
    });
    return { product, grid };
}
