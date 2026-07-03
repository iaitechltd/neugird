/* Revenue splitter — the split agreement, executable: atomic bps distribution,
 * remainder to the last member, reconfiguration, and recipient-table guards. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const U = (n: number) => new BN(Math.round(n * 1e6));

describe("revenue_splitter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.RevenueSplitter as Program;
  const conn = provider.connection;

  const authority = Keypair.generate();
  const m1 = Keypair.generate(), m2 = Keypair.generate(), m3 = Keypair.generate();
  let usdc: PublicKey, srcAta: PublicKey;
  const memberAta: Record<string, PublicKey> = {};

  const SUBGRID = new BN(4242);
  const splitterPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("split"), authority.publicKey.toBuffer(), SUBGRID.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const bal = async (ata: PublicKey) => Number((await getAccount(conn, ata)).amount);

  before(async () => {
    await conn.confirmTransaction(await conn.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL));
    usdc = await createMint(conn, authority, authority.publicKey, null, 6);
    srcAta = (await getOrCreateAssociatedTokenAccount(conn, authority, usdc, authority.publicKey)).address;
    await mintTo(conn, authority, usdc, srcAta, authority, 1_000_000_000);
    for (const [k, kp] of [["m1", m1], ["m2", m2], ["m3", m3]] as const) {
      memberAta[k] = (await getOrCreateAssociatedTokenAccount(conn, authority, usdc, kp.publicKey)).address;
    }
  });

  const configure = (members: { wallet: PublicKey; bps: number }[]) =>
    program.methods
      .configure(SUBGRID, members)
      .accounts({ authority: authority.publicKey, splitter: splitterPda(), mintToken: srcAta, systemProgram: SystemProgram.programId })
      .signers([authority])
      .rpc();

  const distribute = (amount: BN, recipients: PublicKey[]) =>
    program.methods
      .distribute(amount)
      .accounts({ authority: authority.publicKey, splitter: splitterPda(), source: srcAta, tokenProgram: TOKEN_PROGRAM_ID })
      .remainingAccounts(recipients.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })))
      .signers([authority])
      .rpc();

  it("splits atomically by bps, remainder to the last member", async () => {
    await configure([
      { wallet: m1.publicKey, bps: 5000 },
      { wallet: m2.publicKey, bps: 3000 },
      { wallet: m3.publicKey, bps: 2000 },
    ]);
    // $100.01 — the odd cent lands on the last member (remainder rule)
    await distribute(U(100.01), [memberAta.m1, memberAta.m2, memberAta.m3]);
    assert.equal(await bal(memberAta.m1), 50_005_000, "m1 50%");
    assert.equal(await bal(memberAta.m2), 30_003_000, "m2 30%");
    assert.equal(await bal(memberAta.m3), 20_002_000, "m3 20% + remainder");

    const s: any = await (program.account as any).splitter.fetch(splitterPda());
    assert.equal(s.distributed.toString(), U(100.01).toString(), "lifetime total recorded");
  });

  it("reconfigures + guards hold", async () => {
    // bps must sum to 10000
    let badSum = false;
    try { await configure([{ wallet: m1.publicKey, bps: 9000 }]); } catch { badSum = true; }
    assert.isTrue(badSum, "bad bps sum must fail");

    await configure([
      { wallet: m1.publicKey, bps: 6000 },
      { wallet: m2.publicKey, bps: 4000 },
    ]);

    // recipients out of order (wrong ATA for the member table) must fail
    let badOrder = false;
    try { await distribute(U(10), [memberAta.m2, memberAta.m1]); } catch { badOrder = true; }
    assert.isTrue(badOrder, "mismatched recipient table must fail");

    const b1 = await bal(memberAta.m1), b2 = await bal(memberAta.m2);
    await distribute(U(10), [memberAta.m1, memberAta.m2]);
    assert.equal((await bal(memberAta.m1)) - b1, 6_000_000, "m1 60% after reconfigure");
    assert.equal((await bal(memberAta.m2)) - b2, 4_000_000, "m2 40% after reconfigure");
  });
});
