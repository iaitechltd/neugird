/**
 * Deal-proof chain adapter (C7 on docs/ROADMAP.md) — borrow-don't-build at its
 * purest: NO custom program. A struck agreement's sha256 anchors on Solana via
 * the audited Memo program (`Memo…fcHr`), giving every deal an immutable,
 * timestamped, publicly-queryable proof that its exact terms existed — for the
 * cost of one transaction fee, zero rent, zero audit surface.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_SOLANA_RPC ·
 * NEUGRID_VAULT_PAYER_SECRET (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import type { Agreement } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

interface ProofsConfig { rpc: string; payerSecret: string; cluster: string }

export function proofsConfig(): ProofsConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!rpc || !payerSecret) return null;
  return { rpc, payerSecret, cluster: process.env.NEUGRID_SOLANA_CLUSTER || "devnet" };
}

/** Canonical, order-stable hash of the agreement's terms. */
export function hashAgreement(ag: Agreement): string {
  const canon = JSON.stringify({
    id: ag.agreement_id, from: ag.from_id, to: ag.to_id,
    amount: ag.amount, asset: ag.asset ?? "USDC",
    terms: ag.terms, metric: ag.success_metric ?? "",
    at: ag.created_at,
  });
  return createHash("sha256").update(canon).digest("hex");
}

/** Anchor the agreement's hash on-chain; fills `ag.onchain` on success. */
export async function anchorAgreement(ag: Agreement): Promise<void> {
  const cfg = proofsConfig();
  if (!cfg || ag.onchain?.tx) return;
  const web3 = await nodeImport("@solana/web3.js");
  const bs58 = (await nodeImport("bs58")).default;

  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const conn = new web3.Connection(cfg.rpc, "confirmed");
  const hash = hashAgreement(ag);
  const memo = `neugrid:agreement:${ag.agreement_id}:sha256:${hash}`;

  const ix = new web3.TransactionInstruction({
    programId: new web3.PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
  const tx = new web3.Transaction().add(ix);
  const sig = await web3.sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
  ag.onchain = { tx: sig, hash, cluster: cfg.cluster };
}
