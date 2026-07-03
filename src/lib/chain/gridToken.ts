/**
 * GRID token chain adapter — vested claims mirror to the REAL devnet GRID mint
 * (C2 on docs/ROADMAP.md): when a user claims vested GRID, the same amount
 * transfers on-chain from the TGE treasury to their bound Solana wallet.
 *
 * Same trust posture as the vault mirror: the operational keypair signs, so the
 * TOKEN and its distribution are publicly verifiable; the real TGE swaps this
 * for audited vesting tooling (Streamflow/Bonfida-class) + a governance-held
 * mint authority. Users without a bound wallet simply skip the mirror — their
 * platform balance is the record.
 *
 * Config: NEUGRID_CHAIN_MODE=solana · NEUGRID_GRID_MINT · NEUGRID_SOLANA_RPC ·
 * NEUGRID_GRID_AUTHORITY_SECRET (falls back to NEUGRID_SAS_ISSUER_SECRET).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeImport = (s: string): Promise<any> => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ s);

interface GridTokenConfig { mint: string; rpc: string; authoritySecret: string }

export function gridTokenConfig(): GridTokenConfig | null {
  if (process.env.NEUGRID_CHAIN_MODE !== "solana") return null;
  const mint = process.env.NEUGRID_GRID_MINT;
  const rpc = process.env.NEUGRID_SOLANA_RPC;
  const authoritySecret = process.env.NEUGRID_GRID_AUTHORITY_SECRET || process.env.NEUGRID_SAS_ISSUER_SECRET;
  if (!mint || !rpc || !authoritySecret) return null;
  return { mint, rpc, authoritySecret };
}

/** Transfer claimed GRID on-chain: treasury → the user's wallet (ATA created
 *  as needed). No-op without config or a valid recipient address. */
export async function mirrorClaim(recipientWallet: string | undefined, amountGrid: number): Promise<string | undefined> {
  const cfg = gridTokenConfig();
  if (!cfg || !recipientWallet || !(amountGrid > 0)) return undefined;

  const [web3, spl, bs58mod] = await Promise.all([
    nodeImport("@solana/web3.js"), nodeImport("@solana/spl-token"), nodeImport("bs58"),
  ]);
  const bs58 = bs58mod.default ?? bs58mod;

  let recipient;
  try { recipient = new web3.PublicKey(recipientWallet); } catch { return undefined; } // pseudo/legacy wallets skip

  const authority = web3.Keypair.fromSecretKey(bs58.decode(cfg.authoritySecret));
  const conn = new web3.Connection(cfg.rpc, "confirmed");
  const mint = new web3.PublicKey(cfg.mint);
  const from = await spl.getOrCreateAssociatedTokenAccount(conn, authority, mint, authority.publicKey);
  const to = await spl.getOrCreateAssociatedTokenAccount(conn, authority, mint, recipient);
  const atomic = BigInt(Math.round(amountGrid * 1e6)); // GRID mint = 6dp
  const sig = await spl.transfer(conn, authority, from.address, to.address, authority, atomic);
  return sig as string;
}
