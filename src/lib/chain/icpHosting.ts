/**
 * ICP hosting adapter — mirrors NeuGrid-hosted Echo deployments (/d/<slug>) onto a
 * REAL Internet Computer asset canister (icp/dfx.json `neugrid_hosting`). Every
 * deployed build gets an UNSTOPPABLE second URL served from the chain itself:
 * `https://<canister>.icp0.io/d/<slug>/` — same path shape as platform hosting.
 * This is roadmap A3 (workstream A — the DFINITY partnership flagship).
 *
 * Platform hosting stays the primary; the canister is a guarded fire-and-forget
 * mirror (same posture as the Solana rails). Snapshots are the deploy-time HTML,
 * so the two URLs serve identical version-pinned bytes. Note the canister copy is
 * same-origin on its own domain — no CSP sandbox / storage shim needed there.
 *
 * Config (all required, else inactive — independent of NEUGRID_CHAIN_MODE):
 *   NEUGRID_ICP_HOSTING_CANISTER_ID · NEUGRID_ICP_UPLOADER_SECRET (bs58 32-byte
 *   Ed25519 seed; the principal needs Commit permission on the canister) ·
 *   NEUGRID_ICP_HOST (default https://icp0.io; a localhost host flips the adapter
 *   into local-replica mode: fetch the root key + *.localhost URLs) ·
 *   NEUGRID_ICP_HOSTING_PUBLIC_BASE (optional URL-base override).
 *
 * `@dfinity/*` load via NON-ANALYZABLE dynamic imports (tracer-invisible —
 * remember the Dockerfile overlay, same as the Solana packages).
 */

import type { Build } from "../types";

// Native, UNBUNDLED dynamic import — the ignore comments stop the bundler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface IcpHostingConfig {
  canisterId: string;
  host: string; // the replica/gateway the agent talks to
  uploaderSecret: string; // bs58 32-byte Ed25519 seed
  publicBase: string; // where the served assets are reachable (no trailing slash)
  local: boolean; // local replica → fetchRootKey
}

export function icpHostingConfig(): IcpHostingConfig | null {
  const canisterId = process.env.NEUGRID_ICP_HOSTING_CANISTER_ID;
  const uploaderSecret = process.env.NEUGRID_ICP_UPLOADER_SECRET;
  if (!canisterId || !uploaderSecret) return null;
  const host = process.env.NEUGRID_ICP_HOST || "https://icp0.io";
  const local = /localhost|127\.0\.0\.1/.test(host);
  const publicBase =
    process.env.NEUGRID_ICP_HOSTING_PUBLIC_BASE?.replace(/\/$/, "") ||
    (local
      ? `http://${canisterId}.localhost:${new URL(host).port || "4943"}`
      : `https://${canisterId}.icp0.io`);
  return { canisterId, host, uploaderSecret, publicBase, local };
}

/** Upload the deployment snapshot to the asset canister and fill `deployment.icp`.
 *  The canister `store` is an upsert, so redeploys overwrite the same key. */
export async function mirrorDeploy(build: Build): Promise<void> {
  const cfg = icpHostingConfig();
  const dep = build.deployment;
  if (!cfg || !dep) return;

  const [{ AssetManager }, { HttpAgent }, { Ed25519KeyIdentity }, bs58] = await Promise.all([
    nodeImport("@dfinity/assets"),
    nodeImport("@dfinity/agent"),
    nodeImport("@dfinity/identity"),
    nodeImport("bs58").then((m) => m.default),
  ]);

  const identity = Ed25519KeyIdentity.fromSecretKey(bs58.decode(cfg.uploaderSecret));
  const agent = await HttpAgent.create({ host: cfg.host, identity, shouldFetchRootKey: cfg.local });
  const manager = new AssetManager({ canisterId: cfg.canisterId, agent });

  const key: string = await manager.store(new TextEncoder().encode(dep.html), {
    fileName: "index.html",
    path: `/d/${dep.slug}`,
    contentType: "text/html",
  });

  dep.icp = {
    canister_id: cfg.canisterId,
    url: `${cfg.publicBase}${key.replace(/index\.html$/, "")}`,
    at: new Date().toISOString(),
  };
  console.log(`[chain] icpHosting.deploy — /d/${dep.slug} v${dep.version} → ${dep.icp.url}`);
}
