/**
 * GRID-staking chain adapter — mirrors the platform's stake-to-list lifecycle
 * onto the REAL `grid_staking` program (contracts/, devnet-deployed): stakes
 * lock actual GRID in a per-market pool, the stakers' 40% fee share deposits as
 * real tUSDC, releases unstake, and fraud slashes sweep the pool on-chain.
 *
 * Same trust posture as the vault mirror (v1): the operational keypair plays
 * the aggregate staker — pool STATE (locked / fees / slashed) is publicly
 * verifiable; per-user custody arrives with wallet-adapter signing.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_STAKING_PROGRAM_ID ·
 * NEUGRID_GRID_MINT · NEUGRID_X402_ASSET (the fee/USDC mint) ·
 * NEUGRID_SOLANA_RPC · NEUGRID_VAULT_PAYER_SECRET (→ NEUGRID_SAS_ISSUER_SECRET).
 */

import { createHash } from "node:crypto";
import idlJson from "./staking-idl.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface StakingConfig { programId: string; rpc: string; gridMint: string; usdcMint: string; payerSecret: string }

export function stakingConfig(): StakingConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const programId = process.env.NEUGRID_STAKING_PROGRAM_ID;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const gridMint = process.env.NEUGRID_GRID_MINT;
  const usdcMint = process.env.NEUGRID_X402_ASSET;
  const payerSecret = process.env.NEUGRID_VAULT_PAYER_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!programId || !rpc || !gridMint || !usdcMint || !payerSecret) return null;
  return { programId, rpc, gridMint, usdcMint, payerSecret };
}

/** Stable u64 pool id from the platform market id. */
export function poolIdOf(market_id: string): bigint {
  return createHash("sha256").update(`stake:${market_id}`).digest().readBigUInt64LE(0);
}

const grid = (n: number) => Math.round(n * 1e6); // GRID mint = 6dp
const usdc = (n: number) => Math.round(n * 1e6);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function client(cfg: StakingConfig): Promise<any> {
  const [anchor, spl] = await Promise.all([nodeImport("@coral-xyz/anchor"), nodeImport("@solana/spl-token")]);
  const bs58 = (await nodeImport("bs58")).default;
  const { AnchorProvider, Program, Wallet, BN } = anchor;
  const web3 = anchor.web3;
  const payer = web3.Keypair.fromSecretKey(bs58.decode(cfg.payerSecret));
  const connection = new web3.Connection(cfg.rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program({ ...idlJson, address: cfg.programId }, provider);
  const gridMint = new web3.PublicKey(cfg.gridMint);
  const usdcMint = new web3.PublicKey(cfg.usdcMint);

  const poolPda = (id: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(id);
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), payer.publicKey.toBuffer(), buf],
      program.programId,
    )[0];
  };
  const stakePda = (pool: InstanceType<typeof web3.PublicKey>) =>
    web3.PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), pool.toBuffer(), payer.publicKey.toBuffer()],
      program.programId,
    )[0];

  const ata = (mint: InstanceType<typeof web3.PublicKey>, owner: InstanceType<typeof web3.PublicKey>, off = false) =>
    spl.getAssociatedTokenAddressSync(mint, owner, off);

  return { spl, web3, BN, payer, connection, program, gridMint, usdcMint, poolPda, stakePda, ata };
}

/** Idempotently open the pool for a market (2yr lock, matching the platform). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensurePool(c: any, id: bigint, lockSeconds: number): Promise<any> {
  const pool = c.poolPda(id);
  const info = await c.connection.getAccountInfo(pool);
  if (info) return pool;
  await c.program.methods
    .initPool(new c.BN(id.toString()), new c.BN(lockSeconds))
    .accounts({
      authority: c.payer.publicKey, pool, gridMint: c.gridMint, usdcMint: c.usdcMint,
      stakeVault: c.ata(c.gridMint, pool, true), rewardVault: c.ata(c.usdcMint, pool, true),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID, associatedTokenProgram: c.spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
  return pool;
}

/** Mirror a listing stake: real GRID from the treasury locks in the market's pool. */
export async function mirrorStake(market_id: string, amount: number, lockSeconds: number): Promise<void> {
  const cfg = stakingConfig();
  if (!cfg || !(amount > 0)) return;
  const c = await client(cfg);
  const pool = await ensurePool(c, poolIdOf(market_id), lockSeconds);
  const myGrid = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.gridMint, c.payer.publicKey)).address;
  const myUsdc = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.usdcMint, c.payer.publicKey)).address;
  await c.program.methods
    .stake(new c.BN(grid(amount)))
    .accounts({
      staker: c.payer.publicKey, pool, stakeAccount: c.stakePda(pool),
      stakerGrid: myGrid, stakerUsdc: myUsdc,
      stakeVault: c.ata(c.gridMint, pool, true), rewardVault: c.ata(c.usdcMint, pool, true),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID, systemProgram: c.web3.SystemProgram.programId,
    })
    .rpc();
}

/** Mirror the stakers' fee share: real tUSDC deposits into the pool's reward vault. */
export async function mirrorFees(market_id: string, amount: number): Promise<void> {
  const cfg = stakingConfig();
  if (!cfg || !(amount > 0)) return;
  const c = await client(cfg);
  const pool = c.poolPda(poolIdOf(market_id));
  if (!(await c.connection.getAccountInfo(pool))) return; // nothing staked on-chain yet
  const myUsdc = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.usdcMint, c.payer.publicKey)).address;
  await c.program.methods
    .depositFees(new c.BN(usdc(amount)))
    .accounts({
      authority: c.payer.publicKey, pool, authorityUsdc: myUsdc,
      rewardVault: c.ata(c.usdcMint, pool, true), tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Mirror a matured release: principal unstakes back to the treasury. */
export async function mirrorRelease(market_id: string, amount: number): Promise<void> {
  const cfg = stakingConfig();
  if (!cfg || !(amount > 0)) return;
  const c = await client(cfg);
  const pool = c.poolPda(poolIdOf(market_id));
  if (!(await c.connection.getAccountInfo(pool))) return;
  const myGrid = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.gridMint, c.payer.publicKey)).address;
  const myUsdc = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.usdcMint, c.payer.publicKey)).address;
  await c.program.methods
    .unstake(new c.BN(grid(amount)))
    .accounts({
      staker: c.payer.publicKey, pool, stakeAccount: c.stakePda(pool),
      stakerGrid: myGrid, stakerUsdc: myUsdc,
      stakeVault: c.ata(c.gridMint, pool, true), rewardVault: c.ata(c.usdcMint, pool, true),
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Mirror a fraud slash: the pool's locked GRID sweeps to the treasury on-chain. */
export async function mirrorSlash(market_id: string): Promise<void> {
  const cfg = stakingConfig();
  if (!cfg) return;
  const c = await client(cfg);
  const pool = c.poolPda(poolIdOf(market_id));
  if (!(await c.connection.getAccountInfo(pool))) return;
  const treasuryGrid = (await c.spl.getOrCreateAssociatedTokenAccount(c.connection, c.payer, c.gridMint, c.payer.publicKey)).address;
  await c.program.methods
    .slash()
    .accounts({
      authority: c.payer.publicKey, pool,
      stakeVault: c.ata(c.gridMint, pool, true), treasuryGrid,
      tokenProgram: c.spl.TOKEN_PROGRAM_ID,
    })
    .rpc();
}
