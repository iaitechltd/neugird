/**
 * Sign-In-With-Solana (SIWS).
 *
 * A wallet proves ownership by signing a short, server-issued nonce message.
 * We verify the ed25519 signature against the wallet's public key, then start a
 * session (the `ng_uid` cookie read by `session.ts`). Nonces live in-process
 * (like the store) and expire quickly so a captured challenge can't be replayed.
 */

import nacl from "tweetnacl";
import bs58 from "bs58";

type NonceEntry = { message: string; expires: number };

const globalForNonces = globalThis as unknown as { __ngNonces?: Map<string, NonceEntry> };
const nonces: Map<string, NonceEntry> =
  globalForNonces.__ngNonces ?? (globalForNonces.__ngNonces = new Map());

const NONCE_TTL_MS = 5 * 60 * 1000;

export function issueNonce(wallet: string): string {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const message = `NeuGrid wants you to sign in.\n\nWallet: ${wallet}\nNonce: ${nonce}`;
  nonces.set(wallet, { message, expires: Date.now() + NONCE_TTL_MS });
  return message;
}

/** Returns the pending message for a wallet, or null if absent/expired. */
export function consumeMessage(wallet: string): string | null {
  const entry = nonces.get(wallet);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    nonces.delete(wallet);
    return null;
  }
  return entry.message;
}

export function clearNonce(wallet: string): void {
  nonces.delete(wallet);
}

/** Verify a base64 ed25519 signature of `message` by base58 `wallet`. */
export function verifySignature(wallet: string, message: string, signatureB64: string): boolean {
  try {
    const msg = new TextEncoder().encode(message);
    const sig = Uint8Array.from(Buffer.from(signatureB64, "base64"));
    const pub = bs58.decode(wallet);
    if (pub.length !== 32 || sig.length !== 64) return false;
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

export function shortWallet(addr: string): string {
  return addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
