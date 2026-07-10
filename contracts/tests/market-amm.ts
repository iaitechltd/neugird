/* Market AMM lifecycle — real-vault constant product:
 * create → seed → buy/sell EXACT vs x·y=k with the fee outside the curve →
 * slippage + halt + authority guards → fee sweep → withdraw → empty-pool. */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

const U = (n: number) => new BN(Math.round(n * 1e6));

describe("market_amm", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.MarketAmm as Program;
  const conn = provider.connection;

  const authority = Keypair.generate(); // platform operational key (v1 posture)
  const alice = Keypair.generate(); // a real-wallet recipient (destination-only in v1)
  let base: PublicKey, quote: PublicKey;
  const atas: Record<string, { base: PublicKey; quote: PublicKey }> = {};

  const MARKET = new BN(4242);
  const poolPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), authority.publicKey.toBuffer(), MARKET.toArrayLike(Buffer, "le", 8)],
      program.programId,
    )[0];
  const feeVaultPda = (pool: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("fees"), pool.toBuffer()], program.programId)[0];

  const bal = async (ata: PublicKey) => BigInt((await getAccount(conn, ata)).amount.toString());

  let pool: PublicKey, baseVault: PublicKey, quoteVault: PublicKey, feeVault: PublicKey;

  before(async () => {
    for (const kp of [authority, alice]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL));
    }
    base = await createMint(conn, authority, authority.publicKey, null, 6);
    quote = await createMint(conn, authority, authority.publicKey, null, 6);
    for (const [name, kp] of [["authority", authority], ["alice", alice]] as const) {
      atas[name] = {
        base: (await getOrCreateAssociatedTokenAccount(conn, kp, base, kp.publicKey)).address,
        quote: (await getOrCreateAssociatedTokenAccount(conn, kp, quote, kp.publicKey)).address,
      };
    }
    await mintTo(conn, authority, base, atas.authority.base, authority, 10_000_000_000);
    await mintTo(conn, authority, quote, atas.authority.quote, authority, 10_000_000_000);

    pool = poolPda();
    feeVault = feeVaultPda(pool);
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    baseVault = getAssociatedTokenAddressSync(base, pool, true);
    quoteVault = getAssociatedTokenAddressSync(quote, pool, true);
  });

  const swap = (direction: number, amountIn: BN, minOut: BN, userBase?: PublicKey, userQuote?: PublicKey, signer: Keypair = authority) =>
    program.methods
      .swap(direction, amountIn, minOut)
      .accounts({
        authority: signer.publicKey,
        pool,
        baseVault,
        quoteVault,
        feeVault,
        userBase: userBase ?? atas.authority.base,
        userQuote: userQuote ?? atas.authority.quote,
      })
      .signers([signer])
      .rpc();

  it("creates the pool (and rejects an over-cap fee)", async () => {
    let overCap = false;
    try {
      await program.methods
        .createPool(new BN(9999), 1001)
        .accounts({ authority: authority.publicKey, baseMint: base, quoteMint: quote })
        .signers([authority])
        .rpc();
    } catch { overCap = true; }
    assert.isTrue(overCap, "fee over 10% must be rejected");

    await program.methods
      .createPool(MARKET, 100) // 1% fee
      .accounts({ authority: authority.publicKey, baseMint: base, quoteMint: quote })
      .signers([authority])
      .rpc();
    const p: any = await (program.account as any).ammPool.fetch(pool);
    assert.equal(p.feeBps, 100);
    assert.equal(p.marketId.toString(), MARKET.toString());
    assert.isFalse(p.halted);
  });

  it("seeds real reserves", async () => {
    await program.methods
      .seed(U(1000), U(100)) // 1000 base + 100 quote → price 0.1
      .accounts({
        authority: authority.publicKey,
        pool,
        authorityBase: atas.authority.base,
        authorityQuote: atas.authority.quote,
        baseVault,
        quoteVault,
      })
      .signers([authority])
      .rpc();
    assert.equal(await bal(baseVault), 1_000_000_000n);
    assert.equal(await bal(quoteVault), 100_000_000n);
  });

  it("buy: exact constant-product with the fee outside the curve", async () => {
    const baseR = await bal(baseVault);
    const quoteR = await bal(quoteVault);
    const k = baseR * quoteR;
    const amountIn = 10_000_000n; // 10 quote
    const fee = (amountIn * 100n) / 10_000n; // 1%
    const netIn = amountIn - fee;
    const newQuote = quoteR + netIn;
    const newBase = (k + newQuote - 1n) / newQuote; // ceil
    const expectedOut = baseR - newBase;

    const preUserBase = await bal(atas.authority.base);
    const preFee = await bal(feeVault);
    await swap(0, new BN(amountIn.toString()), new BN(expectedOut.toString()));
    assert.equal(await bal(baseVault), newBase, "base vault at the exact curve point");
    assert.equal(await bal(quoteVault), newQuote, "quote vault holds the net");
    assert.equal((await bal(feeVault)) - preFee, fee, "fee vault holds exactly the fee");
    assert.equal((await bal(atas.authority.base)) - preUserBase, expectedOut, "trader got the exact out");
    const kAfter = (await bal(baseVault)) * (await bal(quoteVault));
    assert.isTrue(kAfter >= k, "k never decays");
  });

  it("buy can deliver base to a third-party wallet (recipient flexibility)", async () => {
    const preAlice = await bal(atas.alice.base);
    await swap(0, U(5), new BN(0), atas.alice.base, atas.authority.quote);
    assert.isTrue((await bal(atas.alice.base)) > preAlice, "alice received the base out");
  });

  it("slippage guard rejects when min_out is not met", async () => {
    let rejected = false;
    try { await swap(0, U(10), U(1000)); } catch { rejected = true; }
    assert.isTrue(rejected, "min_out above the curve output must reject");
  });

  it("sell: exact quote out with the fee off the gross proceeds", async () => {
    const baseR = await bal(baseVault);
    const quoteR = await bal(quoteVault);
    const k = baseR * quoteR;
    const amountIn = 50_000_000n; // 50 base
    const newBase = baseR + amountIn;
    const newQuoteMin = (k + newBase - 1n) / newBase;
    const gross = quoteR - newQuoteMin;
    const fee = (gross * 100n) / 10_000n;
    const net = gross - fee;

    const preUserQuote = await bal(atas.authority.quote);
    const preFee = await bal(feeVault);
    await swap(1, new BN(amountIn.toString()), new BN(net.toString()));
    assert.equal((await bal(atas.authority.quote)) - preUserQuote, net, "trader got the exact net quote");
    assert.equal((await bal(feeVault)) - preFee, fee, "sell fee accrued");
    const kAfter = (await bal(baseVault)) * (await bal(quoteVault));
    assert.isTrue(kAfter >= k, "k never decays on sells");
  });

  it("non-authority cannot swap (v1 posture)", async () => {
    let blocked = false;
    try { await swap(0, U(1), new BN(0), atas.alice.base, atas.alice.quote, alice); } catch { blocked = true; }
    assert.isTrue(blocked, "alice is not the pool authority");
  });

  it("halt blocks swaps, unhalt restores them", async () => {
    await program.methods.setHalt(true).accounts({ authority: authority.publicKey, pool }).signers([authority]).rpc();
    let halted = false;
    try { await swap(0, U(1), new BN(0)); } catch { halted = true; }
    assert.isTrue(halted, "swap must reject while halted");
    await program.methods.setHalt(false).accounts({ authority: authority.publicKey, pool }).signers([authority]).rpc();
    await swap(0, U(1), new BN(0)); // works again
  });

  it("sweeps all accrued fees to the authority", async () => {
    const feeBal = await bal(feeVault);
    assert.isTrue(feeBal > 0n, "fees accrued across the swaps");
    const pre = await bal(atas.authority.quote);
    await program.methods
      .sweepFees(new BN(0))
      .accounts({ authority: authority.publicKey, pool, feeVault, toQuote: atas.authority.quote })
      .signers([authority])
      .rpc();
    assert.equal(await bal(feeVault), 0n, "fee vault drained");
    assert.equal((await bal(atas.authority.quote)) - pre, feeBal, "authority received exactly the fees");
    const p: any = await (program.account as any).ammPool.fetch(pool);
    assert.isTrue(BigInt(p.feesAccrued.toString()) >= feeBal, "lifetime counter covers the sweep");
  });

  it("T3: the TWAP accumulator advances with held price × elapsed time", async () => {
    const twapPda = PublicKey.findProgramAddressSync([Buffer.from("twap"), pool.toBuffer()], program.programId)[0];
    const t1: any = await (program.account as any).twapState.fetch(twapPda);
    assert.isTrue(t1.lastPriceMicro.toNumber() > 0, "holding price recorded");
    await new Promise((r) => setTimeout(r, 2500));
    await swap(0, U(1), new BN(0)); // any touch accrues price × elapsed
    const t2: any = await (program.account as any).twapState.fetch(twapPda);
    const grew = BigInt(t2.priceCumulative.toString()) - BigInt(t1.priceCumulative.toString());
    const heldSecs = t2.lastTs.toNumber() - t1.lastTs.toNumber();
    assert.isTrue(heldSecs >= 2, "clock advanced between touches");
    const expectedMin = BigInt(t1.lastPriceMicro.toString()) * BigInt(heldSecs);
    assert.isTrue(grew >= expectedMin, `cumulative grew ${grew}, expected ≥ ${expectedMin}`);
  });

  it("withdraw drains the vaults (loud escape hatch), then swaps hit EmptyPool", async () => {
    const baseR = await bal(baseVault);
    const quoteR = await bal(quoteVault);
    const preB = await bal(atas.authority.base);
    const preQ = await bal(atas.authority.quote);
    await program.methods
      .withdraw(new BN(baseR.toString()), new BN(quoteR.toString()))
      .accounts({
        authority: authority.publicKey,
        pool,
        baseVault,
        quoteVault,
        toBase: atas.authority.base,
        toQuote: atas.authority.quote,
      })
      .signers([authority])
      .rpc();
    assert.equal((await bal(atas.authority.base)) - preB, baseR);
    assert.equal((await bal(atas.authority.quote)) - preQ, quoteR);
    let empty = false;
    try { await swap(0, U(1), new BN(0)); } catch { empty = true; }
    assert.isTrue(empty, "empty pool must reject swaps");
  });
});
