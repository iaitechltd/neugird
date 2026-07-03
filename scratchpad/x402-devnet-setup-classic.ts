/* Devnet x402 prep — CLASSIC SPL variant. Same as x402-devnet-setup.ts but the
 * test mint uses the classic token program (Tokenkeg…), because Coinbase's CDP
 * facilitator derives destination ATAs with the classic program (real USDC is
 * classic SPL). The token-2022 client's instruction layouts are a superset, so
 * we reuse them with a programAddress override.
 *   NEUGRID_SAS_ISSUER_SECRET=... npx tsx scratchpad/x402-devnet-setup-classic.ts
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes,
  generateKeyPairSigner, pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners, getSignatureFromTransaction, sendAndConfirmTransactionFactory,
  lamports, address,
} from "@solana/kit";
import {
  getInitializeMintInstruction, getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction, findAssociatedTokenPda,
} from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";

const CLASSIC_TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const CLASSIC_MINT_SIZE = 82n; // classic Mint account layout (no extensions)
const RPC = "https://api.devnet.solana.com";
const client = { rpc: createSolanaRpc(RPC), rpcSubscriptions: createSolanaRpcSubscriptions(RPC.replace(/^http/, "ws")) };

async function send(payer: any, ixs: any[], label: string) {
  const { value: blockhash } = await client.rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (tx: any) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx: any) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx: any) => appendTransactionMessageInstructions(ixs, tx),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  await sendAndConfirmTransactionFactory(client)(signed, { commitment: "confirmed" });
  console.error("✓", label, String(getSignatureFromTransaction(signed)));
}

async function main() {
  const issuer = await createKeyPairSignerFromBytes(Uint8Array.from(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET!)));
  const payerKp = nacl.sign.keyPair();
  const payer = await createKeyPairSignerFromBytes(payerKp.secretKey);
  const mintSigner = await generateKeyPairSigner();

  const rent = await client.rpc.getMinimumBalanceForRentExemption(CLASSIC_MINT_SIZE).send();
  const [payerAta] = await findAssociatedTokenPda({ mint: mintSigner.address, owner: payer.address, tokenProgram: CLASSIC_TOKEN_PROGRAM });
  const [treasuryAta] = await findAssociatedTokenPda({ mint: mintSigner.address, owner: issuer.address, tokenProgram: CLASSIC_TOKEN_PROGRAM });

  await send(issuer, [
    getCreateAccountInstruction({ payer: issuer, newAccount: mintSigner, lamports: lamports(rent), space: CLASSIC_MINT_SIZE, programAddress: CLASSIC_TOKEN_PROGRAM }),
    getInitializeMintInstruction({ mint: mintSigner.address, decimals: 6, mintAuthority: issuer.address }, { programAddress: CLASSIC_TOKEN_PROGRAM }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: issuer, owner: payer.address, mint: mintSigner.address, ata: payerAta, tokenProgram: CLASSIC_TOKEN_PROGRAM }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: issuer, owner: issuer.address, mint: mintSigner.address, ata: treasuryAta, tokenProgram: CLASSIC_TOKEN_PROGRAM }),
    getMintToInstruction({ mint: mintSigner.address, token: payerAta, mintAuthority: issuer, amount: 100_000_000n }, { programAddress: CLASSIC_TOKEN_PROGRAM }), // 100 tUSDC
  ], "classic mint + ATAs + fund payer (100 tUSDC)");

  console.log(JSON.stringify({
    mint: mintSigner.address, payer: payer.address, payerSecret: bs58.encode(payerKp.secretKey),
    treasury: issuer.address, payerAta, treasuryAta,
  }));
}
main().catch((e) => { console.error("SETUP FAILED:", e?.message ?? e, e?.cause?.message ?? ""); process.exit(1); });
