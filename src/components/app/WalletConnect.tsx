"use client";

/**
 * WalletConnect — real Solana wallet connection via the Wallet Standard.
 * A dropdown widget (usable in the header or a settings rail) that reflects the
 * LIVE browser-wallet connection (not the demo session), so Connect/Disconnect
 * visibly toggle. Connecting runs Sign-In-With-Solana against the existing
 * backend: connect → GET nonce → wallet.signMessage(nonce) → POST /verify
 * (base58 wallet + base64 ed25519 sig — exactly what /lib/auth expects).
 * Disconnect drops the wallet connection only; the demo identity is untouched.
 */

import { useCallback, useEffect, useState } from "react";
import { IconConnect } from "./ui";

// Minimal Wallet-Standard shapes (hand-typed to avoid extra deps).
type StdAccount = { address: string; publicKey: Uint8Array };
type ConnectFeature = { connect: () => Promise<{ accounts: readonly StdAccount[] }> };
type SignMessageFeature = { signMessage: (i: { account: StdAccount; message: Uint8Array }) => Promise<readonly { signature: Uint8Array }[]> };
type DisconnectFeature = { disconnect?: () => Promise<void> };
type StdWallet = { name: string; icon?: string; chains: readonly string[]; accounts: readonly StdAccount[]; features: Record<string, unknown> };

const isSolana = (w: StdWallet) =>
  w.chains?.some((c) => c.startsWith("solana:")) && !!w.features?.["standard:connect"] && !!w.features?.["solana:signMessage"];
const short = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export default function WalletConnect({ onChange, align = "right", className = "" }: { onChange?: () => void; align?: "left" | "right"; className?: string }) {
  const [wallets, setWallets] = useState<StdWallet[]>([]);
  const [active, setActive] = useState<{ name: string; address: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const offs: Array<() => void> = [];
    import("@wallet-standard/app").then(({ getWallets }) => {
      if (!alive) return;
      const api = getWallets();
      const sync = () => {
        const list = (api.get() as unknown as StdWallet[]).filter(isSolana);
        setWallets(list);
        const conn = list.find((w) => w.accounts.length > 0);
        setActive((cur) => (conn ? { name: conn.name, address: conn.accounts[0].address } : cur && list.some((w) => w.name === cur.name && w.accounts.length > 0) ? cur : conn ? cur : null));
      };
      sync();
      offs.push(api.on("register", sync), api.on("unregister", sync));
    }).catch(() => {});
    return () => { alive = false; offs.forEach((o) => o()); };
  }, []);

  const connect = useCallback(async (w: StdWallet) => {
    setBusy(w.name); setMsg(null);
    try {
      const { accounts } = await (w.features["standard:connect"] as ConnectFeature).connect();
      const account = accounts[0];
      if (!account) throw new Error("wallet returned no account");
      const wallet = account.address;
      const nonce = await fetch("/api/auth/nonce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) }).then((r) => r.json());
      if (!nonce?.message) throw new Error("could not get a challenge");
      const [out] = await (w.features["solana:signMessage"] as SignMessageFeature).signMessage({ account, message: new TextEncoder().encode(nonce.message) });
      const signature = btoa(String.fromCharCode(...out.signature));
      const vr = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, signature }) });
      if (!vr.ok) { const e = await vr.json().catch(() => ({})); throw new Error(e?.error ?? "verification failed"); }
      setActive({ name: w.name, address: wallet }); setOpen(false);
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      onChange?.();
    } catch (e) {
      const m = (e as Error)?.message ?? "error";
      setMsg(/reject|declin|cancel/i.test(m) ? "Signature declined." : `Couldn't connect — ${m}`);
    }
    setBusy(null);
  }, [onChange]);

  const disconnect = useCallback(async () => {
    const w = wallets.find((x) => x.name === active?.name) ?? wallets.find((x) => x.accounts.length > 0);
    try { await (w?.features["standard:disconnect"] as DisconnectFeature | undefined)?.disconnect?.(); } catch { /* ignore */ }
    // full sign-out: drop the wallet connection AND clear the session
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setActive(null); setOpen(false); setMsg(null);
    window.dispatchEvent(new Event("neugrid:refresh-me"));
    onChange?.();
  }, [wallets, active, onChange]);

  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen((o) => !o)} className={`${active ? "ng-btn" : "ng-btn ng-btn-primary"} ng-btn--sm`}>
        {active ? <><span className="ng-led" /> {short(active.address)}</> : <><IconConnect className="h-3.5 w-3.5" /> Connect wallet</>}
        <span className="ml-0.5 text-[9px] text-ink-faint">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute top-full z-50 mt-2 w-64 border border-neon/25 bg-black p-2 ${align === "right" ? "right-0" : "left-0"}`}>
            {active ? (
              <div>
                <div className="ng-label mb-1 !text-ink-dim">Connected · {active.name}</div>
                <div className="break-all rounded border border-line bg-black/40 p-2 text-[10.5px] text-ink-dim">{active.address}</div>
                <button onClick={disconnect} className="ng-btn ng-btn-danger ng-btn--sm ng-btn--block mt-2"><IconConnect className="h-3.5 w-3.5" /> Disconnect</button>
              </div>
            ) : wallets.length > 0 ? (
              <div className="space-y-0.5">
                <div className="ng-label mb-1 !text-ink-dim">Choose a wallet</div>
                {wallets.map((w) => (
                  <button key={w.name} onClick={() => connect(w)} disabled={!!busy} className="thl flex w-full items-center gap-2.5 px-2 py-2 text-[12px] text-ink disabled:opacity-40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {w.icon ? <img src={w.icon} alt="" className="h-5 w-5 shrink-0" /> : <span className="grid h-5 w-5 place-items-center bg-neon/20 text-[10px] text-neon">{w.name[0]}</span>}
                    <span className="flex-1 text-left">{w.name}</span>
                    <span className="text-[10px]">{busy === w.name ? <span className="text-amber">signing…</span> : <span className="text-ink-faint">→</span>}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-1 py-1.5 text-[11px] leading-relaxed text-ink-dim">
                No Solana wallet detected. Install{" "}
                <a href="https://phantom.app" target="_blank" rel="noreferrer" className="text-neon hover:underline">Phantom</a>,{" "}
                <a href="https://solflare.com" target="_blank" rel="noreferrer" className="text-neon hover:underline">Solflare</a>, or{" "}
                <a href="https://backpack.app" target="_blank" rel="noreferrer" className="text-neon hover:underline">Backpack</a>, then reload.
              </div>
            )}
            {msg && <p className="mt-1.5 px-1 text-[10px] text-ink-dim">{"// "}{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}
