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
import * as Wallets from "./wallets";
import * as Params from "./params";
import type { Grid, Product, ProductEvent, ProductReview, Settlement } from "../types";

/** Reputation a GridX listing is worth (creator dimension). Tunable. */
export const LIST_REPUTATION = 20;
const TREASURY = "neugrid:treasury";
const DAY = 24 * 3600 * 1000;

export function listProducts(filter: { grid_id?: string } = {}): Product[] {
  return db.products.filter((p) => !filter.grid_id || p.grid_id === filter.grid_id);
}

/* ------------------------- the real marketplace loop ------------------------- */

function recordReceipt(payer: string, payee: string, resource: string, amount: number): void {
  (db.settlements ??= []).push({
    settlement_id: newId("setl"), payer_id: payer, payee, resource,
    amount, asset: "USDC", network: "solana", scheme: "exact",
    proof: newId("rcpt"), status: "settled", created_at: nowISO(),
  } as Settlement);
}

/** The product's economic principal: its home Grid's owner. */
export function ownerOf(product: Product): string | undefined {
  return db.grids.find((g) => g.grid_id === product.grid_id)?.owner_id;
}

/** Real revenue — the sum of settled purchase receipts (never a stored counter). */
export function revenueFor(product_id: string): number {
  return Math.round((db.settlements ?? [])
    .filter((s) => s.resource === `product_purchase:${product_id}` && s.status === "settled")
    .reduce((a, s) => a + s.amount, 0) * 100) / 100;
}

export function hasPurchased(product_id: string, user_id: string): boolean {
  return (db.productEvents ?? []).some((e) => e.product_id === product_id && e.user_id === user_id && e.kind === "purchase");
}

function pushEvent(product_id: string, user_id: string, kind: ProductEvent["kind"]): void {
  (db.productEvents ??= []).push({ event_id: newId("pev"), product_id, user_id, kind, at: nowISO() });
}

/** Real usage: one open per user per day counts (drives active-users + trending). */
export function recordOpen(product_id: string, user_id: string): { ok?: boolean; error?: string } {
  const product = getProduct(product_id);
  if (!product) return { error: "not_found" };
  const since = Date.now() - DAY;
  const dup = (db.productEvents ?? []).some(
    (e) => e.product_id === product_id && e.user_id === user_id && e.kind === "open" && Date.parse(e.at) > since,
  );
  if (!dup) pushEvent(product_id, user_id, "open");
  return { ok: true };
}

/** Usage rollup over a window: opens + distinct active users + purchases. */
export function usageFor(product_id: string, windowMs = 30 * DAY) {
  const cutoff = Date.now() - windowMs;
  const events = (db.productEvents ?? []).filter((e) => e.product_id === product_id && Date.parse(e.at) > cutoff);
  return {
    opens: events.filter((e) => e.kind === "open").length,
    active_users: new Set(events.map((e) => e.user_id)).size,
    purchases: events.filter((e) => e.kind === "purchase").length,
  };
}

/** Owner sets the asking price (0 = free). */
export function setPrice(product_id: string, user_id: string, price: number): { product?: Product; error?: string } {
  const product = getProduct(product_id);
  if (!product) return { error: "not_found" };
  if (ownerOf(product) !== user_id) return { error: "not_owner" };
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return { error: "bad_price" };
  product.price_usdc = Math.round(price * 100) / 100;
  return { product };
}

/**
 * Buy a product: real USDC moves buyer → owner (minus the governable protocol
 * fee → treasury), the receipt lands in the settlements ledger (so revenue and
 * the owner's profile income are DERIVED from it), and the purchase unlocks
 * review rights. Free products "get" without payment — usage still recorded.
 */
export function purchase(product_id: string, buyer_id: string): { product?: Product; paid?: number; error?: string } {
  const product = getProduct(product_id);
  if (!product) return { error: "not_found" };
  const owner = ownerOf(product);
  if (!owner) return { error: "no_owner" };
  if (owner === buyer_id) return { error: "own_product" };
  if (hasPurchased(product_id, buyer_id)) return { error: "already_owned" };

  const price = product.price_usdc ?? 0;
  if (price > 0) {
    if (!Wallets.debitUsdc(buyer_id, price)) return { error: "insufficient_usdc" };
    const fee = Math.round(price * Params.get("gridx_fee_bps")) / 10_000;
    Wallets.creditUsdc(owner, price - fee);
    if (fee > 0) Wallets.creditUsdc(TREASURY, fee);
    recordReceipt(buyer_id, owner, `product_purchase:${product_id}`, price - fee);
    if (fee > 0) recordReceipt(buyer_id, TREASURY, `product_fee:${product_id}`, fee);
  }
  pushEvent(product_id, buyer_id, "purchase");
  return { product, paid: price };
}

/* ------------------------------ verified reviews ----------------------------- */

export function reviewsFor(product_id: string): ProductReview[] {
  return (db.productReviews ?? []).filter((r) => r.product_id === product_id);
}

export function ratingFor(product_id: string): { rating: number; count: number } {
  const rs = reviewsFor(product_id);
  if (!rs.length) return { rating: 0, count: 0 };
  return { rating: Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10, count: rs.length };
}

/** Review rights are EARNED: paid products need a purchase; free ones real usage. */
export function canReview(product_id: string, user_id: string): { ok: boolean; reason?: string } {
  const product = getProduct(product_id);
  if (!product) return { ok: false, reason: "not_found" };
  if (ownerOf(product) === user_id) return { ok: false, reason: "own_product" };
  if (reviewsFor(product_id).some((r) => r.user_id === user_id)) return { ok: false, reason: "already_reviewed" };
  const paid = (product.price_usdc ?? 0) > 0;
  const used = (db.productEvents ?? []).some(
    (e) => e.product_id === product_id && e.user_id === user_id && (paid ? e.kind === "purchase" : true),
  );
  if (!used) return { ok: false, reason: paid ? "not_purchased" : "not_used" };
  return { ok: true };
}

/** Add a verified review; the owner's creator reputation moves with the verdict. */
export function addReview(product_id: string, user_id: string, rating: number, text?: string): { review?: ProductReview; error?: string } {
  const gate = canReview(product_id, user_id);
  if (!gate.ok) return { error: gate.reason };
  const r = Math.round(Number(rating));
  if (!Number.isFinite(r) || r < 1 || r > 5) return { error: "bad_rating" };
  const product = getProduct(product_id)!;
  const review: ProductReview = {
    review_id: newId("rev"), product_id, user_id, rating: r,
    text: typeof text === "string" && text.trim() ? text.trim().slice(0, 500) : undefined,
    created_at: nowISO(),
  };
  (db.productReviews ??= []).unshift(review);

  const owner = ownerOf(product);
  if (owner && r !== 3) {
    Pulse.recordEvent({
      target_type: "user", target_id: owner, user_id,
      action_type: "product_reviewed",
      weight: r >= 4 ? 3 : -2,
      reason: `"${product.name}" rated ${r}★ by a verified ${((product.price_usdc ?? 0) > 0) ? "buyer" : "user"}`,
      verification_source: `gridx:${product_id}`,
      dimension: "creator",
    });
  }
  return { review };
}

export function getProduct(id: string): Product | undefined {
  return db.products.find((p) => p.product_id === id);
}

/** Products owned by a user — i.e. those whose home Grid they own. */
export function productsByOwner(user_id: string): Product[] {
  const owned = new Set(db.grids.filter((g) => g.owner_id === user_id).map((g) => g.grid_id));
  return db.products.filter((p) => owned.has(p.grid_id));
}

/** A product with its DERIVED marketplace numbers (revenue/usage/rating are
 *  computed from real settlements, events, and reviews — never stored counters). */
export function enrich(product: Product) {
  const usage = usageFor(product.product_id);
  const { rating, count } = ratingFor(product.product_id);
  return {
    ...product,
    onchain_revenue: revenueFor(product.product_id),
    active_users: usage.active_users,
    opens_30d: usage.opens,
    purchases: usage.purchases,
    rating,
    review_count: count,
  };
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
  return { product: enrich(product), grid: grid ?? null, build: build ?? null, market, launch };
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
