/**
 * One-time SAS setup for NeuGrid — creates the issuer CREDENTIAL and the five
 * tokenized SCHEMAS the live adapter (src/lib/chain/sasSolana.ts) mints against.
 * Run ONCE per cluster in the deploy env (idempotent — re-runs skip existing accts).
 *
 *   npm i sas-lib @solana/kit @solana-program/token-2022 @solana-program/compute-budget bs58
 *   NEUGRID_SOLANA_RPC=https://api.devnet.solana.com \
 *   NEUGRID_SOLANA_WSS=wss://api.devnet.solana.com \
 *   NEUGRID_SAS_ISSUER_SECRET=<base58 secret key> \
 *   node scripts/sas-setup.mjs
 *
 * The issuer keypair must be funded with SOL (it pays + signs). Ported from the
 * canonical flow (solana-foundation/solana-attestation-service, kit demo).
 */
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes,
  pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners, getSignatureFromTransaction, sendAndConfirmTransactionFactory,
} from "@solana/kit";
import {
  updateOrAppendSetComputeUnitLimitInstruction, updateOrAppendSetComputeUnitPriceInstruction,
  MAX_COMPUTE_UNIT_LIMIT,
} from "@solana-program/compute-budget";
import { getMintSize, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import {
  getCreateCredentialInstruction, getCreateSchemaInstruction, getTokenizeSchemaInstruction,
  deriveCredentialPda, deriveSchemaPda, deriveSchemaMintPda, deriveSasAuthorityAddress,
} from "sas-lib";
import bs58 from "bs58";

const CREDENTIAL_NAME = "NEUGRID";
const FIELD_NAMES = ["payload"];
const LAYOUT = Buffer.from([12]); // one UTF-8 string field
// Keep in sync with src/lib/chain/sasSchemas.ts
const SCHEMAS = [
  { name: "proof_of_build",    version: 1, description: "Witnessed Echo build — proof of build" },
  { name: "work_delivered",    version: 1, description: "Verified delivered + paid work" },
  { name: "milestone_shipped", version: 1, description: "Released GenesisX funding milestone" },
  { name: "project_launched",  version: 1, description: "Audited project launched on TradeX" },
  { name: "agent_trusted",     version: 1, description: "Agent promoted to the trusted tier" },
];

const RPC = process.env.NEUGRID_SOLANA_RPC;
const WSS = process.env.NEUGRID_SOLANA_WSS || (RPC && RPC.replace(/^http/, "ws"));
const SECRET = process.env.NEUGRID_SAS_ISSUER_SECRET;
if (!RPC || !SECRET) { console.error("set NEUGRID_SOLANA_RPC + NEUGRID_SAS_ISSUER_SECRET"); process.exit(1); }

const client = { rpc: createSolanaRpc(RPC), rpcSubscriptions: createSolanaRpcSubscriptions(WSS) };

async function send(payer, instructions, label) {
  try {
    const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(payer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
      (tx) => updateOrAppendSetComputeUnitPriceInstruction(BigInt(1), tx),
      (tx) => updateOrAppendSetComputeUnitLimitInstruction(MAX_COMPUTE_UNIT_LIMIT, tx),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
    );
    const signed = await signTransactionMessageWithSigners(message);
    const sig = getSignatureFromTransaction(signed);
    await sendAndConfirmTransactionFactory(client)(signed, { commitment: "confirmed" });
    console.log(`  ✓ ${label} — ${sig}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already in use|already exists/i.test(msg)) { console.log(`  • ${label} — already exists, skipping`); return; }
    throw new Error(`${label} failed: ${msg}`);
  }
}

async function main() {
  const issuer = await createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(SECRET)));
  console.log("Issuer:", issuer.address);

  // 1. Credential
  const [credentialPda] = await deriveCredentialPda({ authority: issuer.address, name: CREDENTIAL_NAME });
  await send(issuer, [getCreateCredentialInstruction({
    payer: issuer, credential: credentialPda, authority: issuer, name: CREDENTIAL_NAME, signers: [issuer.address],
  })], `Credential ${CREDENTIAL_NAME} (${credentialPda})`);

  // 2. Schemas + tokenize each
  const sasPda = await deriveSasAuthorityAddress();
  for (const s of SCHEMAS) {
    const [schemaPda] = await deriveSchemaPda({ credential: credentialPda, name: s.name, version: s.version });
    await send(issuer, [getCreateSchemaInstruction({
      authority: issuer, payer: issuer, name: s.name, credential: credentialPda,
      description: s.description, fieldNames: FIELD_NAMES, schema: schemaPda, layout: LAYOUT,
    })], `Schema ${s.name} (${schemaPda})`);

    const [schemaMint] = await deriveSchemaMintPda({ schema: schemaPda });
    const maxSize = getMintSize([{ __kind: "GroupPointer", authority: sasPda, groupAddress: schemaMint }]);
    await send(issuer, [getTokenizeSchemaInstruction({
      payer: issuer, authority: issuer, credential: credentialPda, schema: schemaPda,
      mint: schemaMint, sasPda, maxSize, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })], `Tokenize ${s.name} (mint ${schemaMint})`);
  }
  console.log("\nSAS setup complete. The live adapter can now mint credentials.");
}

main().catch((e) => { console.error("SAS setup failed:", e); process.exit(1); });
