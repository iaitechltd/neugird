/* Perp vault lifecycle — the REAL counterparty (audit F1):
 * LP seeds → opens bounded by LP depth → profitable close PAID BY the pool →
 * losing close INTO the pool → liquidation remainder → insurance → bad debt
 * absorbed → conservation exact across all vaults → guards. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const U = (n: number) => new BN(Math.round(n * 1e6));

describe("perp_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.PerpVault as Program;
  const conn = provider.connection;

  const authority = Keypair.generate();
  const mallory = Keypair.generate();
  let quote: PublicKey, myQuote: PublicKey;

  const enginePda = () =>
    PublicKey.findProgramAddressSync([Buffer.from("engine"), authority.publicKey.toBuffer()], program.programId)[0];
  const vaultPda = (tag: string, engine: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from(tag), engine.toBuffer()], program.programId)[0];
  const posPda = (engine: PublicKey, id: BN) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pos"), engine.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];

  const bal = async (ata: PublicKey) => BigInt((await getAccount(conn, ata)).amount.toString());

  let engine: PublicKey, lp: PublicKey, ins: PublicKey, col: PublicKey;

  before(async () => {
    for (const kp of [authority, mallory]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL));
    }
    quote = await createMint(conn, authority, authority.publicKey, null, 6);
    myQuote = (await getOrCreateAssociatedTokenAccount(conn, authority, quote, authority.publicKey)).address;
    await mintTo(conn, authority, quote, myQuote, authority, 100_000_000_000n); // 100,000 quote
    engine = enginePda();
    lp = vaultPda("lp", engine);
    ins = vaultPda("insurance", engine);
    col = vaultPda("collateral", engine);
  });

  const open = (id: BN, collateral: BN, notional: BN, signer = authority) =>
    program.methods
      .openPosition(id, 0, collateral, notional, U(0.5))
      .accounts({
        authority: signer.publicKey, engine, position: posPda(engine, id),
        authorityQuote: myQuote, lpVault: lp, collateralVault: col,
      })
      .signers([signer])
      .rpc();

  const close = (id: BN, toTrader: BN, toInsurance: BN, insuranceToLp: BN) =>
    program.methods
      .closePosition(toTrader, toInsurance, insuranceToLp)
      .accounts({
        authority: authority.publicKey, engine, position: posPda(engine, id),
        lpVault: lp, insuranceVault: ins, collateralVault: col, traderQuote: myQuote,
      })
      .signers([authority])
      .rpc();

  it("inits the engine (and rejects a zero/over-cap OI bps)", async () => {
    let bad = false;
    try {
      await program.methods.initEngine(0).accounts({ authority: authority.publicKey, quoteMint: quote }).signers([authority]).rpc();
    } catch { bad = true; }
    assert.isTrue(bad, "0 bps must reject");
    await program.methods.initEngine(2500).accounts({ authority: authority.publicKey, quoteMint: quote }).signers([authority]).rpc();
    const e: any = await (program.account as any).engine.fetch(engine);
    assert.equal(e.oiCapBps, 2500);
  });

  it("treasury seeds the counterparty pool", async () => {
    await program.methods.lpDeposit(U(10_000)).accounts({ authority: authority.publicKey, engine, authorityQuote: myQuote, lpVault: lp }).signers([authority]).rpc();
    assert.equal(await bal(lp), 10_000_000_000n);
  });

  it("open interest is bounded by REAL LP depth (25%)", async () => {
    await open(new BN(1), U(100), U(1000)); // OI 1000 ≤ 2500 cap
    assert.equal(await bal(col), 100_000_000n, "margin sits segregated");
    let capped = false;
    try { await open(new BN(99), U(100), U(2000)); } catch { capped = true; } // 3000 > 2500
    assert.isTrue(capped, "OI past 25% of LP depth must reject");
  });

  it("profitable close: the LP pool PAYS the profit (F1 fixed)", async () => {
    const preLp = await bal(lp), preMe = await bal(myQuote);
    await close(new BN(1), U(150), new BN(0), new BN(0)); // collateral 100 + 50 profit
    assert.equal(preLp - (await bal(lp)), 50_000_000n, "LP paid exactly the 50 profit");
    assert.equal((await bal(myQuote)) - preMe, 150_000_000n, "trader got collateral + profit");
    assert.equal(await bal(col), 0n, "collateral vault fully unwound");
  });

  it("losing close: the loss flows INTO the pool", async () => {
    await open(new BN(2), U(100), U(1000));
    const preLp = await bal(lp), preMe = await bal(myQuote);
    await close(new BN(2), U(40), new BN(0), new BN(0)); // trader keeps 40, loses 60
    assert.equal((await bal(lp)) - preLp, 60_000_000n, "LP received exactly the 60 loss");
    assert.equal((await bal(myQuote)) - preMe, 40_000_000n);
  });

  it("liquidation: the remainder lands in the insurance fund", async () => {
    await open(new BN(3), U(100), U(1000));
    const preLp = await bal(lp);
    await close(new BN(3), new BN(0), U(20), new BN(0)); // wiped; 20 remainder → insurance, 80 → LP
    assert.equal(await bal(ins), 20_000_000n, "insurance holds the remainder");
    assert.equal((await bal(lp)) - preLp, 80_000_000n);
  });

  it("bad debt: the insurance fund makes the pool whole", async () => {
    await open(new BN(4), U(100), U(1000));
    const preLp = await bal(lp);
    await close(new BN(4), new BN(0), new BN(0), U(15)); // gap loss: all collateral + 15 from insurance → LP
    assert.equal((await bal(lp)) - preLp, 115_000_000n, "LP got collateral + the absorbed gap");
    assert.equal(await bal(ins), 5_000_000n, "insurance drew down by 15");
    let overdraw = false;
    await open(new BN(5), U(10), U(100));
    try { await close(new BN(5), new BN(0), new BN(0), U(500)); } catch { overdraw = true; }
    assert.isTrue(overdraw, "insurance can never go negative on-chain");
    await close(new BN(5), U(10), new BN(0), new BN(0)); // flat unwind
  });

  it("conservation: every unit is accounted across vaults + trader", async () => {
    // deposits: 10,000 LP. Collaterals in: 100+100+100+100+10 = 410. Payouts to trader: 150+40+10 = 200.
    // LP: 10000 −50 +60 +80 +115 = 10205. Insurance: 5. Collateral vault: 0.
    assert.equal(await bal(lp), 10_205_000_000n);
    assert.equal(await bal(ins), 5_000_000n);
    assert.equal(await bal(col), 0n);
  });

  it("guards: double close, foreign authority, halt semantics", async () => {
    let dbl = false;
    try { await close(new BN(4), new BN(0), new BN(0), new BN(0)); } catch { dbl = true; }
    assert.isTrue(dbl, "closed position cannot close again");

    let foreign = false;
    try { await open(new BN(6), U(10), U(100), mallory); } catch { foreign = true; }
    assert.isTrue(foreign, "non-authority cannot open (v1 posture)");

    await program.methods.setHalt(true).accounts({ authority: authority.publicKey, engine }).signers([authority]).rpc();
    let haltedOpen = false;
    try { await open(new BN(7), U(10), U(100)); } catch { haltedOpen = true; }
    assert.isTrue(haltedOpen, "halt blocks opens");
    await program.methods.setHalt(false).accounts({ authority: authority.publicKey, engine }).signers([authority]).rpc();

    await open(new BN(8), U(10), U(100));
    await program.methods.setHalt(true).accounts({ authority: authority.publicKey, engine }).signers([authority]).rpc();
    await close(new BN(8), U(10), new BN(0), new BN(0)); // closes work while halted — exits are sacred
    await program.methods.setHalt(false).accounts({ authority: authority.publicKey, engine }).signers([authority]).rpc();
  });

  it("lp_withdraw returns treasury capital (loud escape hatch)", async () => {
    const pre = await bal(myQuote);
    await program.methods.lpWithdraw(U(205)).accounts({ authority: authority.publicKey, engine, authorityQuote: myQuote, lpVault: lp }).signers([authority]).rpc();
    assert.equal((await bal(myQuote)) - pre, 205_000_000n);
    assert.equal(await bal(lp), 10_000_000_000n, "back to the original seed");
  });
});
