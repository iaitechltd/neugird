"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCoins, IconUser, IconSettings, IconLock, IconConnect } from "./ui";

type Me = { id: string; username: string; wallet: string | null; pulse: number } | null;

type SolanaProvider = {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (m: Uint8Array, enc?: string) => Promise<{ signature: Uint8Array }>;
};
function getProvider(): SolanaProvider | undefined {
  const w = window as unknown as { solana?: SolanaProvider; phantom?: { solana?: SolanaProvider } };
  return w.solana ?? w.phantom?.solana;
}

const ITEMS: [React.ReactNode, string, string][] = [
  [<IconCoins key="r" className="h-4 w-4" />, "Rewards & Referrals", "/rewards"],
  [<IconUser key="p" className="h-4 w-4" />, "Profile", "/me"],
  [<IconSettings key="s" className="h-4 w-4" />, "Settings", "/profile"],
];

const short = (a: string) => (a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/me").then((r) => r.json()).then((d) => { if (alive && d?.id) setMe(d); }).catch(() => {});
    load();
    window.addEventListener("neugrid:refresh-me", load);
    return () => { alive = false; window.removeEventListener("neugrid:refresh-me", load); };
  }, []);

  const name = me?.username ?? "Guest";
  const initial = name.charAt(0).toUpperCase() || "?";
  const handle = me?.wallet ? short(me.wallet) : `@${name}`;

  async function connect() {
    setMsg(null);
    const provider = getProvider();
    if (!provider) { setMsg("No Solana wallet detected — install Phantom"); return; }
    try {
      const { publicKey } = await provider.connect();
      const wallet = publicKey.toString();
      const nr = await fetch("/api/auth/nonce", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }),
      });
      const { message } = await nr.json();
      const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
      const signature = btoa(String.fromCharCode(...signed.signature));
      const vr = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, signature }),
      });
      if (!vr.ok) { setMsg("Sign-in failed"); return; }
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      setOpen(false);
    } catch { setMsg("Connection cancelled"); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.dispatchEvent(new Event("neugrid:refresh-me"));
    setOpen(false);
  }

  return (
    <div className="relative font-mono">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 border border-neon/20 py-1 pl-1 pr-2 transition hover:border-neon/40">
        <span className="grid h-6 w-6 place-items-center bg-neon text-[11px] font-bold text-black">{initial}</span>
        <span className="hidden text-[12px] text-neon sm:inline">{name}</span>
        <span className="text-[9px] text-ink-faint">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-60 border border-neon/16 bg-black">
            <div className="flex items-center gap-2.5 border-b border-neon/10 px-3 py-2.5">
              <span className="grid h-8 w-8 place-items-center bg-neon text-[13px] font-bold text-black">{initial}</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-neon">{name}</div>
                <div className="truncate text-[10px] text-ink-dim">{handle} · {me?.pulse ?? 0} pulse</div>
              </div>
            </div>
            <div className="py-1">
              {ITEMS.map(([g, label, href]) => (
                <Link key={label} href={href} onClick={() => setOpen(false)} className="thl flex items-center gap-2.5 px-3 py-1.5 text-[12px] text-ink">
                  <span className="grid w-4 place-items-center text-neon">{g}</span>{label}
                </Link>
              ))}
              <div className="my-1 border-t border-neon/[0.07]" />
              <button onClick={connect} className="thl flex w-full items-center gap-2.5 px-3 py-1.5 text-[12px] text-ink">
                <span className="grid w-4 place-items-center text-neon"><IconConnect className="h-4 w-4" /></span>connect wallet
              </button>
              <button onClick={logout} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[12px] text-danger transition hover:bg-danger hover:text-black">
                <span className="grid w-4 place-items-center"><IconLock className="h-4 w-4" /></span>sign out
              </button>
              {msg && <div className="px-3 py-1.5 text-[10px] text-ink-dim">{"// "}{msg}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
