/**
 * Generate a fresh Solana (ed25519) keypair for a NeuGrid on-chain role — the SAS
 * issuer and/or the x402 treasury payTo. Dependency-free (tweetnacl + bs58, both
 * already in package.json), so it runs with no extra install.
 *
 *   node scripts/keygen.mjs
 *
 * Output: the base58 ADDRESS (public key) and the base58 SECRET KEY (64 bytes, the
 * format @solana/kit's createKeyPairSignerFromBytes + `solana` CLI expect).
 *
 *  - SAS issuer:  NEUGRID_SAS_ISSUER_SECRET = <secret>   (keep in Secret Manager)
 *  - x402 payee:  NEUGRID_X402_PAY_TO       = <address>  (USDC owner address)
 *
 * Fund it on devnet:  solana airdrop 2 <address> --url devnet
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

const kp = nacl.sign.keyPair();
const address = bs58.encode(kp.publicKey);
const secret = bs58.encode(kp.secretKey);

console.log("Solana keypair (devnet/mainnet):\n");
console.log("  address (public key):", address);
console.log("  secret key (base58) :", secret);
console.log("\nEnv:");
console.log("  NEUGRID_SAS_ISSUER_SECRET=" + secret);
console.log("  NEUGRID_X402_PAY_TO=" + address);
console.log("\nFund on devnet:");
console.log("  solana airdrop 2 " + address + " --url devnet");
console.log("\n⚠️  The secret controls this account (SAS clawback + fee payment). Store it in Secret Manager, never commit it.");
