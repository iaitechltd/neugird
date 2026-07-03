/* Governance chain-adapter test — drives chain/governanceSolana.ts against the
 * DEPLOYED devnet program with real GRID: propose (30s window) → lock votes on
 * both sides → wait → resolve + reclaim → read the on-chain outcome.
 *   env: NEUGRID_CHAIN_MODE=solana NEUGRID_GOVERNANCE_PROGRAM_ID=...
 *        NEUGRID_GRID_MINT=... NEUGRID_SOLANA_RPC=... NEUGRID_SAS_ISSUER_SECRET=...
 *   npx tsx scratchpad/gov-adapter-test.ts
 */
import { mirrorPropose, mirrorVote, mirrorResolve, govIdOf } from "../src/lib/chain/governanceSolana";
import * as anchorNs from "@coral-xyz/anchor";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anchor: any = (anchorNs as any).default ?? anchorNs;
import bs58 from "bs58";
import idl from "../src/lib/chain/governance-idl.json";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pid = `gov_adapter_${Date.now()}`;
  const closes = new Date(Date.now() + 30_000).toISOString();

  await mirrorPropose(pid, "Lower the TradeX fee to 0.8%", 50_000, closes);
  console.log("✓ proposed on-chain (quorum 50K GRID, 30s window)");
  await mirrorVote(pid, true, 60_000);
  await mirrorVote(pid, false, 20_000);
  console.log("✓ locked 60K FOR / 20K AGAINST (real GRID)");

  console.log("waiting out the window…");
  await sleep(33_000);
  await mirrorResolve(pid);
  console.log("✓ resolved + locks reclaimed");

  // independent read-back
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(process.env.NEUGRID_SAS_ISSUER_SECRET!));
  const conn = new web3.Connection(process.env.NEUGRID_SOLANA_RPC!, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program({ ...(idl as any), address: process.env.NEUGRID_GOVERNANCE_PROGRAM_ID! }, provider);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(govIdOf(pid));
  const [proposal] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("gov"), payer.publicKey.toBuffer(), buf],
    program.programId,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = await (program.account as any).govProposal.fetch(proposal);
  console.log("on-chain:", { status: p.status, for: p.forLocked.toString(), against: p.againstLocked.toString() });
  if (p.status !== 1) throw new Error("expected PASSED");
  console.log("✓ GOV ADAPTER TEST PASSED —", `https://explorer.solana.com/address/${proposal.toBase58()}?cluster=devnet`);
}
main().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
