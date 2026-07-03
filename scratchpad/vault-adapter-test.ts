/* Vault chain-adapter test — drives src/lib/chain/vaultSolana.ts against the
 * DEPLOYED devnet program with a synthetic proposal (no store mutation).
 * Verifies the platform-shaped mirror: create → back-to-fill → release tranche 0,
 * then reads the on-chain vault account to confirm raised/released state.
 *   env: NEUGRID_CHAIN_MODE=solana NEUGRID_VAULT_PROGRAM_ID=... NEUGRID_SOLANA_RPC=...
 *        NEUGRID_X402_ASSET=... NEUGRID_VAULT_PAYER_SECRET=...
 *   npx tsx scratchpad/vault-adapter-test.ts
 */
import { mirrorCreate, mirrorBack, mirrorRelease, vaultIdOf } from "../src/lib/chain/vaultSolana";
import type { Proposal } from "../src/lib/types";

const p: Proposal = {
  proposal_id: `prop_adapter_${Date.now()}`,
  author_id: "usr_test",
  title: "Adapter test raise",
  summary: "synthetic",
  category: "test",
  roadmap: [
    { title: "t1", description: "", amount: 2 },   // $2
    { title: "t2", description: "", amount: 1.5 }, // $1.50
  ],
  ask_amount: 3.5,
  status: "open",
  endorsements: [],
  closes_at: new Date(Date.now() + 3600_000).toISOString(),
  created_at: new Date().toISOString(),
};

async function main() {
  console.log("vault_id:", vaultIdOf(p.proposal_id).toString());

  await mirrorCreate(p);
  if (!p.onchain?.vault) throw new Error("mirrorCreate did not fill onchain");
  console.log("✓ vault created:", p.onchain.vault);

  await mirrorBack(p, 3.5); // fills the ask → FUNDED on-chain
  console.log("✓ backed $3.50 — txs:", p.onchain.txs?.length);

  await mirrorRelease(p, 0); // tranche 0 ($2) releases to the founder ATA
  console.log("✓ released tranche 0 — txs:", p.onchain.txs?.length);

  // independent read-back of the on-chain state
  const anchor = await import("@coral-xyz/anchor");
  const bs58 = (await import("bs58")).default;
  const idl = { ...(await import("../src/lib/chain/vault-idl.json")).default, address: process.env.NEUGRID_VAULT_PROGRAM_ID! };
  const payer = anchor.web3.Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_VAULT_PAYER_SECRET!));
  const conn = new anchor.web3.Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program(idl as any, provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v: any = await (program.account as any).vault.fetch(new anchor.web3.PublicKey(p.onchain.vault));
  console.log("on-chain state:", {
    status: v.status, raised: v.raised.toString(), released: v.released.toString(),
    m0: v.milestones[0].status, m1: v.milestones[1].status,
  });
  if (v.raised.toString() !== "3500000" || v.released.toString() !== "2000000" || v.milestones[0].status !== 2 || v.milestones[1].status !== 1) {
    throw new Error("on-chain state mismatch");
  }
  console.log("✓ ADAPTER TEST PASSED — raised 3.5, released 2.0, m1 voting");
  console.log("explorer:", `https://explorer.solana.com/address/${p.onchain.vault}?cluster=devnet`);
}
main().catch((e) => { console.error("ADAPTER TEST FAILED:", e?.message ?? e); process.exit(1); });
