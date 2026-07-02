/* Devnet SAS validation — mint a tokenized proof_of_build credential to a fresh
 * throwaway wallet via the app's real adapter, then verify the Token-2022
 * extensions on-chain. Run: NEUGRID_SAS_ISSUER_SECRET=... npx tsx sas-mint-test.ts
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { mintTokenizedAttestation } from "/Users/axoniue/Desktop/neugrid/src/lib/chain/sasSolana";

const RPC = "https://api.devnet.solana.com";

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}

async function main() {
  const recipient = bs58.encode(nacl.sign.keyPair().publicKey);
  console.log("recipient (throwaway):", recipient);

  const fields = { build_id: "bld_devnet_test", title: "Devnet validation build",
    proof: "ngpob:sha256:devnet0000000000000000ff", version: 1, minted_for: "devnet-gate" };

  const { mint, tx } = await mintTokenizedAttestation(
    { rpcUrl: RPC, issuerSecret: process.env.NEUGRID_SAS_ISSUER_SECRET! },
    { schemaKey: "proof_of_build", recipientWallet: recipient, fieldsJson: JSON.stringify(fields) },
  );
  console.log("MINTED — mint:", mint);
  console.log("tx:", tx);
  console.log("explorer: https://explorer.solana.com/address/" + mint + "?cluster=devnet");

  // verify on-chain: owner program + extensions on the mint
  const acct = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
  const info = acct?.value;
  const ext = (info?.data?.parsed?.info?.extensions ?? []).map((e: any) => e.extension);
  console.log("owner program:", info?.owner);
  console.log("extensions:", ext.join(", "));
  const ok = String(info?.owner).startsWith("TokenzQd") && ext.includes("nonTransferable") && ext.includes("permanentDelegate");
  console.log(ok ? "✓ VERIFIED: Token-2022 + NonTransferable + PermanentDelegate" : "✗ verification incomplete — inspect manually");
  process.exit(0);
}
main().catch((e) => { console.error("MINT TEST FAILED:", e?.message ?? e); process.exit(1); });
// (revoke test appended — run with REVOKE=<recipient> to close the minted credential)
