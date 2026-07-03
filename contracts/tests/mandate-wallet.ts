/* Mandate wallet — the owner's guardrails, chain-enforced: the vault IS the
 * budget, per-tx cap binds, only the agent's key spends, the kill-switch is
 * absolute, and the owner reclaims at will. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, transfer,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const U = (n: number) => new BN(Math.round(n * 1e6));

describe("mandate_wallet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MandateWallet as Program;
  const conn = provider.connection;

  const owner = Keypair.generate();
  const agent = Keypair.generate();   // the agent's OWN key
  const stranger = Keypair.generate();
  let usdc: PublicKey, ownerAta: PublicKey, venueAta: PublicKey;

  const mandatePda = (id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("mandate"), owner.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  before(async () => {
    for (const kp of [owner, agent, stranger]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL));
    }
    usdc = await createMint(conn, owner, owner.publicKey, null, 6);
    ownerAta = (await getOrCreateAssociatedTokenAccount(conn, owner, usdc, owner.publicKey)).address;
    venueAta = (await getOrCreateAssociatedTokenAccount(conn, owner, usdc, stranger.publicKey)).address;
    await mintTo(conn, owner, usdc, ownerAta, owner, 1_000_000_000);
  });

  const create = async (id: BN, cap: BN, seconds: number) => {
    const mandate = mandatePda(id);
    await program.methods
      .createMandate(id, agent.publicKey, cap, new BN(Math.floor(Date.now() / 1000) + seconds))
      .accounts({
        owner: owner.publicKey, mandate, mint: usdc,
        vault: getAssociatedTokenAddressSync(usdc, mandate, true),
        tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([owner])
      .rpc();
    return mandate;
  };
  const spend = (mandate: PublicKey, who: Keypair, amount: BN) =>
    program.methods
      .agentSpend(amount)
      .accounts({
        agent: who.publicKey, mandate,
        vault: getAssociatedTokenAddressSync(usdc, mandate, true),
        destination: venueAta, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  it("vault = budget · per-tx cap · agent-key-only · kill · owner reclaim", async () => {
    const mandate = await create(new BN(1), U(50), 3600);
    const vault = getAssociatedTokenAddressSync(usdc, mandate, true);
    await transfer(conn, owner, ownerAta, vault, owner, 120_000_000); // fund $120

    // agent spends within the cap
    await spend(mandate, agent, U(50));
    assert.equal(await bal(venueAta), 50e6, "agent spent $50");

    // over the per-tx cap must fail
    let overCap = false;
    try { await spend(mandate, agent, U(51)); } catch { overCap = true; }
    assert.isTrue(overCap, "over-cap spend must fail");

    // a stranger's key must fail
    let wrongKey = false;
    try { await spend(mandate, stranger, U(10)); } catch { wrongKey = true; }
    assert.isTrue(wrongKey, "non-agent key must fail");

    // budget = vault: spending more than remains fails even under the cap
    await spend(mandate, agent, U(50)); // 100 spent, 20 left
    let overBudget = false;
    try { await spend(mandate, agent, U(30)); } catch { overBudget = true; }
    assert.isTrue(overBudget, "overspending the vault must fail");

    // owner reclaims part, then KILLS
    const o0 = await bal(ownerAta);
    await program.methods
      .ownerWithdraw(U(10))
      .accounts({
        owner: owner.publicKey, mandate, vault,
        ownerToken: ownerAta, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();
    assert.equal((await bal(ownerAta)) - o0, 10e6, "owner reclaimed $10");

    await program.methods.kill().accounts({ owner: owner.publicKey, mandate }).signers([owner]).rpc();
    let killed = false;
    try { await spend(mandate, agent, U(5)); } catch { killed = true; }
    assert.isTrue(killed, "post-kill spend must fail");

    // owner still reclaims the remainder after the kill
    await program.methods
      .ownerWithdraw(U(10))
      .accounts({ owner: owner.publicKey, mandate, vault, ownerToken: ownerAta, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([owner])
      .rpc();
    assert.equal(await bal(vault), 0, "vault drained back to the owner");

    const m: any = await (program.account as any).mandateAccount.fetch(mandate);
    assert.equal(m.spent.toString(), U(100).toString(), "lifetime spend recorded");
    assert.isTrue(m.killed);
  });

  it("expiry ends the mandate on its own", async () => {
    const mandate = await create(new BN(2), U(10), 5);
    const vault = getAssociatedTokenAddressSync(usdc, mandate, true);
    await transfer(conn, owner, ownerAta, vault, owner, 20_000_000);
    await spend(mandate, agent, U(10)); // alive
    await sleep(6500);
    let expired = false;
    try { await spend(mandate, agent, U(5)); } catch { expired = true; }
    assert.isTrue(expired, "post-expiry spend must fail");
  });
});
