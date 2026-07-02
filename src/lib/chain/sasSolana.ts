/**
 * SAS tokenized-attestation client (Solana). Mints / closes soulbound Token-2022
 * credentials to a subject wallet under NeuGrid's SAS credential + schemas.
 *
 * NeuGrid is the ISSUER — it signs the mint itself (there is no facilitator for
 * SAS). The four Solana packages are loaded via NON-ANALYZABLE dynamic imports so
 * the sandbox build never needs them; they're only required at runtime in the
 * deploy env, and only when NEUGRID_CHAIN_MODE=solana + the issuer is configured:
 *
 *   npm i sas-lib @solana/kit @solana-program/token-2022 @solana-program/compute-budget bs58
 *
 * Prereq: the credential + the 5 schemas must exist on-chain — run once with
 * `node scripts/sas-setup.mjs` (see docs/DEPLOY.md). Ported from the canonical
 * flow (solana-foundation/solana-attestation-service, kit tokenized demo).
 *
 * ⚠️ UNTESTED against live SAS (the sandbox can't reach Solana). Verify a devnet
 * mint before mainnet. Callers wrap this in a guard, so a failure is fail-safe:
 * the in-platform Stage-1 credential mirror stands.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { SAS_CREDENTIAL_NAME, SAS_SCHEMAS, SAS_TOKEN_URI, sasSchemaFor } from "./sasSchemas";

export interface SasSolanaConfig {
  rpcUrl: string;
  wssUrl?: string;      // defaults to rpcUrl with http→ws
  issuerSecret: string; // base58 issuer keypair (authority + authorized signer + fee-payer)
}

const PKG = {
  kit: "@solana/kit",
  sas: "sas-lib",
  t22: "@solana-program/token-2022",
  cb: "@solana-program/compute-budget",
  bs58: "bs58",
};

// Native, UNBUNDLED dynamic import — the ignore comments stop the bundler from
// trying to resolve these at build time (they exist only in the deploy env, at
// runtime, after `npm i sas-lib @solana/kit …`).
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

let _mods: any = null;
async function mods(): Promise<any> {
  if (_mods) return _mods;
  const [kit, sas, t22, cb, bs58] = await Promise.all([
    nodeImport(PKG.kit), nodeImport(PKG.sas), nodeImport(PKG.t22), nodeImport(PKG.cb), nodeImport(PKG.bs58),
  ]);
  _mods = { kit, sas, t22, cb, bs58: bs58.default ?? bs58 };
  return _mods;
}

function buildClient(cfg: SasSolanaConfig, kit: any) {
  const wss = cfg.wssUrl || cfg.rpcUrl.replace(/^http/, "ws");
  return { rpc: kit.createSolanaRpc(cfg.rpcUrl), rpcSubscriptions: kit.createSolanaRpcSubscriptions(wss) };
}

async function loadIssuer(cfg: SasSolanaConfig, kit: any, bs58: any) {
  return kit.createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(cfg.issuerSecret)));
}

/** Assemble (fee-payer + blockhash + compute budget), sign, send + confirm. */
async function sendIxs(client: any, payer: any, ixs: any[], kit: any, cb: any): Promise<string> {
  const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
  const message = kit.pipe(
    kit.createTransactionMessage({ version: 0 }),
    (tx: any) => kit.setTransactionMessageFeePayerSigner(payer, tx),
    (tx: any) => kit.setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx: any) => cb.updateOrAppendSetComputeUnitPriceInstruction(BigInt(1), tx),
    (tx: any) => cb.updateOrAppendSetComputeUnitLimitInstruction(cb.MAX_COMPUTE_UNIT_LIMIT, tx),
    (tx: any) => kit.appendTransactionMessageInstructions(ixs, tx),
  );
  const signed = await kit.signTransactionMessageWithSigners(message);
  const signature = kit.getSignatureFromTransaction(signed);
  await kit.sendAndConfirmTransactionFactory(client)(signed, { commitment: "confirmed" });
  return String(signature);
}

/** Mint a tokenized (soulbound) attestation to `recipientWallet`. Returns the mint + tx. */
export async function mintTokenizedAttestation(
  cfg: SasSolanaConfig,
  args: { schemaKey: string; recipientWallet: string; fieldsJson: string; tokenName?: string; tokenSymbol?: string },
): Promise<{ mint: string; tx: string }> {
  const schema = sasSchemaFor(args.schemaKey);
  if (!schema) throw new Error(`[sas] unknown schema: ${args.schemaKey}`);
  const { kit, sas, t22, cb, bs58 } = await mods();
  const client = buildClient(cfg, kit);
  const issuer = await loadIssuer(cfg, kit, bs58);
  const recipient = args.recipientWallet;

  const [credentialPda] = await sas.deriveCredentialPda({ authority: issuer.address, name: SAS_CREDENTIAL_NAME });
  const [schemaPda] = await sas.deriveSchemaPda({ credential: credentialPda, name: schema.name, version: schema.version });
  const [schemaMint] = await sas.deriveSchemaMintPda({ schema: schemaPda });
  const sasPda = await sas.deriveSasAuthorityAddress();
  const [attestationPda] = await sas.deriveAttestationPda({ credential: credentialPda, schema: schemaPda, nonce: recipient });
  const [attestationMint] = await sas.deriveAttestationMintPda({ attestation: attestationPda });

  const onchainSchema = await sas.fetchSchema(client.rpc, schemaPda);
  const [recipientTokenAccount] = await t22.findAssociatedTokenPda({
    mint: attestationMint, owner: recipient, tokenProgram: t22.TOKEN_2022_PROGRAM_ADDRESS,
  });
  const expiry = Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 3600; // ~permanent (soulbound)
  const name = args.tokenName ?? schema.token.name;
  const symbol = args.tokenSymbol ?? schema.token.symbol;

  const mintAccountSpace = t22.getMintSize([
    { __kind: "GroupMemberPointer", authority: sasPda, memberAddress: attestationMint },
    { __kind: "NonTransferable" },
    { __kind: "MetadataPointer", authority: sasPda, metadataAddress: attestationMint },
    { __kind: "PermanentDelegate", delegate: sasPda },
    { __kind: "MintCloseAuthority", closeAuthority: sasPda },
    { __kind: "TokenMetadata", updateAuthority: sasPda, mint: attestationMint, name, symbol, uri: SAS_TOKEN_URI,
      additionalMetadata: new Map([["attestation", attestationPda], ["schema", schemaPda]]) },
    { __kind: "TokenGroupMember", group: schemaMint, mint: attestationMint, memberNumber: 1 },
  ]);

  const ix = await sas.getCreateTokenizedAttestationInstruction({
    payer: issuer, authority: issuer, credential: credentialPda, schema: schemaPda,
    attestation: attestationPda, schemaMint, attestationMint, sasPda,
    recipient, nonce: recipient, expiry,
    data: sas.serializeAttestationData(onchainSchema.data, { payload: args.fieldsJson }),
    name, uri: SAS_TOKEN_URI, symbol,
    mintAccountSpace, recipientTokenAccount,
    associatedTokenProgram: t22.ASSOCIATED_TOKEN_PROGRAM_ADDRESS, tokenProgram: t22.TOKEN_2022_PROGRAM_ADDRESS,
  });

  const tx = await sendIxs(client, issuer, [ix], kit, cb);
  return { mint: String(attestationMint), tx };
}

/** Close (revoke) a tokenized attestation via the issuer authority. Returns the tx. */
export async function closeTokenizedAttestation(
  cfg: SasSolanaConfig,
  args: { schemaKey: string; recipientWallet: string },
): Promise<{ tx: string }> {
  const schema = sasSchemaFor(args.schemaKey);
  if (!schema) throw new Error(`[sas] unknown schema: ${args.schemaKey}`);
  const { kit, sas, t22, cb, bs58 } = await mods();
  const client = buildClient(cfg, kit);
  const issuer = await loadIssuer(cfg, kit, bs58);
  const recipient = args.recipientWallet;

  const [credentialPda] = await sas.deriveCredentialPda({ authority: issuer.address, name: SAS_CREDENTIAL_NAME });
  const [schemaPda] = await sas.deriveSchemaPda({ credential: credentialPda, name: schema.name, version: schema.version });
  const sasPda = await sas.deriveSasAuthorityAddress();
  const [attestationPda] = await sas.deriveAttestationPda({ credential: credentialPda, schema: schemaPda, nonce: recipient });
  const [attestationMint] = await sas.deriveAttestationMintPda({ attestation: attestationPda });
  const [attestationTokenAccount] = await t22.findAssociatedTokenPda({
    mint: attestationMint, owner: recipient, tokenProgram: t22.TOKEN_2022_PROGRAM_ADDRESS,
  });
  const eventAuthority = await sas.deriveEventAuthorityAddress();

  const ix = sas.getCloseTokenizedAttestationInstruction({
    payer: issuer, authority: issuer, credential: credentialPda, attestation: attestationPda,
    eventAuthority, attestationProgram: sas.SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
    attestationMint, sasPda, attestationTokenAccount, tokenProgram: t22.TOKEN_2022_PROGRAM_ADDRESS,
  });

  const tx = await sendIxs(client, issuer, [ix], kit, cb);
  return { tx };
}

/** Keep the barrel importable even when the schemas map is all that's needed. */
export { SAS_SCHEMAS };
