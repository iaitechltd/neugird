/* Devnet x402 prep — create a payer keypair + a 6-decimal test-USDC mint
 * (Token-2022), fund the payer's ATA, and pre-create the treasury (payTo) ATA.
 * The ISSUER keypair pays all fees/rent. Prints JSON {payerSecret, mint, ...}.
 *   NEUGRID_SAS_ISSUER_SECRET=... npx tsx scratchpad/x402-devnet-setup.ts
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  createSolanaRpc, createSolanaRpcSubscriptions, createKeyPairSignerFromBytes,
  generateKeyPairSigner, pipe, createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners, getSignatureFromTransaction, sendAndConfirmTransactionFactory,
  lamports,
} from "@solana/kit";
import {
  TOKEN_2022_PROGRAM_ADDRESS, getMintSize, getInitializeMintInstruction,
  getCreateAssociatedTokenIdempotentInstruction, getMintToInstruction, findAssociatedTokenPda,
} from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";

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
  // payer: nacl so we can print the base58 secret (kit signers are non-extractable)
  const payerKp = nacl.sign.keyPair();
  const payer = await createKeyPairSignerFromBytes(payerKp.secretKey);
  const mintSigner = await generateKeyPairSigner();

  const space = BigInt(getMintSize());
  const rent = await client.rpc.getMinimumBalanceForRentExemption(space).send();
  const [payerAta] = await findAssociatedTokenPda({ mint: mintSigner.address, owner: payer.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  const [treasuryAta] = await findAssociatedTokenPda({ mint: mintSigner.address, owner: issuer.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });

  await send(issuer, [
    getCreateAccountInstruction({ payer: issuer, newAccount: mintSigner, lamports: lamports(rent), space, programAddress: TOKEN_2022_PROGRAM_ADDRESS }),
    getInitializeMintInstruction({ mint: mintSigner.address, decimals: 6, mintAuthority: issuer.address }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: issuer, owner: payer.address, mint: mintSigner.address, ata: payerAta, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
    getCreateAssociatedTokenIdempotentInstruction({ payer: issuer, owner: issuer.address, mint: mintSigner.address, ata: treasuryAta, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }),
    getMintToInstruction({ mint: mintSigner.address, token: payerAta, mintAuthority: issuer, amount: 100_000_000n }, { programAddress: TOKEN_2022_PROGRAM_ADDRESS }), // 100 tUSDC
  ], "mint + ATAs + fund payer (100 tUSDC)");

  console.log(JSON.stringify({
    mint: mintSigner.address, payer: payer.address, payerSecret: bs58.encode(payerKp.secretKey),
    treasury: issuer.address, payerAta, treasuryAta,
  }));
}
main().catch((e) => { console.error("SETUP FAILED:", e?.message ?? e, e?.cause?.message ?? ""); process.exit(1); });
