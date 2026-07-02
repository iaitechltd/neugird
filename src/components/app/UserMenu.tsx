"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconChart, IconUser, IconSettings, IconCheck, IconLock, IconConnect } from "./ui";

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
  [<IconChart key="d" className="h-4 w-4" />, "Dashboard", "/profile"],
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
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded border border-neon/25 py-1 pl-1 pr-2.5 transition hover:border-neon/50 hover:bg-neon/5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-neon text-xs font-bold text-bg">{initial}</span>
        <span className="hidden text-sm text-neon sm:inline">{name}</span>
        <IconCheck className="h-3.5 w-3.5 text-neon" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-md border border-neon/30 bg-black/95 p-1.5 shadow-[0_0_24px_-6px_rgba(0,255,0,0.55)] backdrop-blur">
            <div className="mb-1 flex items-center gap-2.5 border-b border-neon/15 px-2 py-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-neon text-sm font-bold text-bg">{initial}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-sm font-semibold text-neon">{name} <IconCheck className="h-3 w-3" /></div>
                <div className="truncate text-[10px] text-ink-dim">{handle} · {me?.pulse ?? 0} Pulse</div>
              </div>
            </div>
            {ITEMS.map(([g, label, href]) => (
              <Link key={label} href={href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] text-ink-dim transition hover:bg-neon/10 hover:text-neon">
                <span className="grid w-4 place-items-center text-neon">{g}</span>{label}
              </Link>
            ))}
            <div className="my-1 border-t border-neon/15" />
            <button onClick={connect} className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-[13px] text-ink-dim transition hover:bg-neon/10 hover:text-neon">
              <span className="grid w-4 place-items-center text-neon"><IconConnect className="h-4 w-4" /></span>Connect Wallet
            </button>
            <button onClick={logout} className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-[13px] text-ink-dim transition hover:bg-danger/10 hover:text-danger">
              <IconLock className="h-4 w-4" />Sign out
            </button>
            {msg && <div className="px-2.5 py-1.5 text-[10px] text-ink-dim">{msg}</div>}
          </div>
        </>
      )}
    </div>
  );
}
