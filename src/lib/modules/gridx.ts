/**
 * GridXCanister — the on-chain app store. Builds witnessed by Echo are published
 * here as Products that show verifiable usage + revenue. A Product always belongs
 * to a Grid (its home/owner), so publishing a solo build lazily spawns a
 * `product`-type Grid for it. Listing credits the builder's `creator` reputation.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import * as Pulse from "./pulse";
import * as Echo from "./echo";
import * as GridRegistry from "./gridRegistry";
import * as Markets from "./markets";
import type { Grid, Product } from "../types";

/** Reputation a GridX listing is worth (creator dimension). Tunable. */
export const LIST_REPUTATION = 20;

export function listProducts(filter: { grid_id?: string } = {}): Product[] {
  return db.products.filter((p) => !filter.grid_id || p.grid_id === filter.grid_id);
}

export function getProduct(id: string): Product | undefined {
  return db.products.find((p) => p.product_id === id);
}

/** Products owned by a user — i.e. those whose home Grid they own. */
export function productsByOwner(user_id: string): Product[] {
  const owned = new Set(db.grids.filter((g) => g.owner_id === user_id).map((g) => g.grid_id));
  return db.products.filter((p) => owned.has(p.grid_id));
}

/** Read model: a product plus its home Grid, the build it came from, and its
 *  TradeX state (the market if tokenized, else launch eligibility — a shipped
 *  product can tokenize via the GridX path). */
export function productView(id: string) {
  const product = getProduct(id);
  if (!product) return undefined;
  const grid = db.grids.find((g) => g.grid_id === product.grid_id);
  const build = db.builds.find((b) => b.product_id === id);
  const market = Markets.marketForGrid(product.grid_id) ?? null;
  const launch = grid ? Markets.canLaunch(product.grid_id) : null;
  return { product, grid: grid ?? null, build: build ?? null, market, launch };
}

/**
 * Ensure a build has a home/project Grid (where a team coordinates and which a
 * Product can belong to). Lazily spawns a `project`-type Grid the first time it's
 * needed; both "Create Project Grid" and "List on GridX" converge on this one
 * Grid per build. Only the builder may do this.
 */
export function ensureHomeGrid(build_id: string, user_id: string): { grid?: Grid; created?: boolean; error?: string } {
  const build = Echo.getBuild(build_id);
  if (!build) return { error: "not_found" };
  if (build.owner_id !== user_id) return { error: "not_owner" };

  const existing = build.grid_id ? db.grids.find((g) => g.grid_id === build.grid_id) : undefined;
  if (existing) return { grid: existing, created: false };

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
export function createProductFromBuild(
  build_id: string,
  user_id: string,
): { product?: Product; grid?: Grid; error?: string } {
  const build = Echo.getBuild(build_id);
  if (!build) return { error: "not_found" };
  if (build.owner_id !== user_id) return { error: "not_owner" };
  if (build.product_id) {
    const existing = getProduct(build.product_id);
    if (existing) return { product: existing, grid: db.grids.find((g) => g.grid_id === existing.grid_id) };
  }

  const homed = ensureHomeGrid(build_id, user_id);
  if (!homed.grid) return { error: homed.error ?? "no_grid" };
  const grid = homed.grid;

  const product: Product = {
    product_id: newId("prod"),
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
    listed_at: nowISO(),
  };
  db.products.unshift(product);
  Echo.markListed(build_id, product.product_id, grid.grid_id);

  Pulse.recordEvent({
    target_type: "user",
    target_id: user_id,
    user_id,
    action_type: "product_listed",
    weight: LIST_REPUTATION,
    reason: `Listed "${build.title}" on GridX`,
    verification_source: "echo:witness",
    dimension: "creator",
  });

  return { product, grid };
}
