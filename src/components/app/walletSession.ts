/**
 * signOutWallet — shared client-side full sign-out.
 *
 * Drops EVERY connected Solana wallet's dapp connection (best-effort, via the
 * Wallet Standard `standard:disconnect` feature) AND clears the NeuGrid session
 * cookie, then tells every mounted widget to re-read `/api/me`. Used by both the
 * header WalletConnect widget (guest state) and the signed-in UserMenu, so
 * "Disconnect" behaves identically wherever it lives.
 */

type DisconnectFeature = { disconnect?: () => Promise<void> };
type StdWallet = { name: string; accounts: readonly unknown[]; features: Record<string, unknown> };

export async function signOutWallet(): Promise<void> {
  // 1) revoke the browser wallet's connection to this site (best-effort — a
  //    missing extension or a wallet without the feature must never block sign-out)
  try {
    const { getWallets } = await import("@wallet-standard/app");
    const all = getWallets().get() as unknown as StdWallet[];
    await Promise.all(
      all
        .filter((w) => w.accounts.length > 0 && !!w.features?.["standard:disconnect"])
        .map((w) => (w.features["standard:disconnect"] as DisconnectFeature).disconnect?.().catch(() => {})),
    );
  } catch {
    /* @wallet-standard/app unavailable — ignore, still clear the session */
  }
  // 2) clear the server session cookie
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // 3) let every mounted widget (header, UserMenu, rails) re-read identity
  if (typeof window !== "undefined") window.dispatchEvent(new Event("neugrid:refresh-me"));
}
