/* Chain Fusion PoC — an ICP canister signs a REAL Solana devnet USDC transfer.
 *
 * Flow: ask the local `neugrid_signer` canister for its threshold-Ed25519
 * Solana address → fund that address's token account with test-USDC (issuer =
 * mint authority) → build an SPL transfer FROM the canister's account → the
 * canister signs the message (its key exists only as shares across the ICP
 * subnet) → submit to Solana devnet → confirmed transaction.
 *
 *   NEUGRID_SAS_ISSUER_SECRET=... CANISTER_ID=... node scripts/poc-devnet-transfer.mjs
 */
import { HttpAgent, Actor } from "@dfinity/agent";
import {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount, mintTo, createTransferInstruction, getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

const RPC = "https://api.devnet.solana.com";
const MINT = new PublicKey("3Sksad8nc4Ytzx5JDQkbLzr8CuDE2oZp85Vo8sSwaE7q"); // classic-SPL test USDC
const ICP_HOST = process.env.ICP_HOST || "http://127.0.0.1:4943";
const CANISTER_ID = process.env.CANISTER_ID;
if (!CANISTER_ID) throw new Error("set CANISTER_ID (from `dfx canister id neugrid_signer`)");

const idl = ({ IDL }) =>
  IDL.Service({
    solana_address: IDL.Func([], [IDL.Text], []),
    sign_solana_message: IDL.Func([IDL.Vec(IDL.Nat8)], [IDL.Vec(IDL.Nat8)], []),
  });

const agent = await HttpAgent.create({ host: ICP_HOST, shouldFetchRootKey: ICP_HOST.includes("127.0.0.1") });
const signer = Actor.createActor(idl, { agent, canisterId: CANISTER_ID });

// 1. the canister's Solana identity
const canisterAddr = new PublicKey(await signer.solana_address());
console.log("canister's Solana address:", canisterAddr.toBase58());

// 2. fund it: issuer creates + fills the canister's token account (5 tUSDC)
const issuer = Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET));
const conn = new Connection(RPC, "confirmed");
const canisterAta = await getOrCreateAssociatedTokenAccount(conn, issuer, MINT, canisterAddr);
const treasuryAta = await getOrCreateAssociatedTokenAccount(conn, issuer, MINT, issuer.publicKey);
await mintTo(conn, issuer, MINT, canisterAta.address, issuer, 5_000_000);
console.log("canister token account funded: 5 tUSDC at", canisterAta.address.toBase58());

// 3. the transfer: canister's account → treasury, owner = the CANISTER's key
const tx = new Transaction().add(
  createTransferInstruction(canisterAta.address, treasuryAta.address, canisterAddr, 1_250_000), // 1.25 tUSDC
);
tx.feePayer = issuer.publicKey;
tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash; // PoC: prod uses durable nonces
tx.partialSign(issuer);

// 4. the ICP canister signs the Solana message via threshold Ed25519
const message = tx.serializeMessage();
const sig = Buffer.from(await signer.sign_solana_message([...message]));
tx.addSignature(canisterAddr, sig);
console.log("canister signature attached:", bs58.encode(sig).slice(0, 20) + "…");
if (!tx.verifySignatures()) throw new Error("signature verification failed — threshold key mismatch?");

// 5. land it on devnet
const txid = await sendAndConfirmRawTransaction(conn, tx.serialize(), { commitment: "confirmed" });
console.log("✓ CHAIN FUSION PoC SETTLED — devnet tx:", txid);
console.log("explorer: https://explorer.solana.com/tx/" + txid + "?cluster=devnet");
const after = await getAccount(conn, treasuryAta.address);
console.log("treasury balance now:", Number(after.amount) / 1e6, "tUSDC");
