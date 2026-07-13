"use client";

/**
 * NeuGridDock — the TERMINAL STATUS BAR (redesigned 2026-07-03, founder call:
 * "smaller, more terminal, icons instead of the key box, centered").
 * A compact centered row of icon + label entries; single-letter keyboard nav
 * still works silently (the key is shown as a faint hint on each item). Rendered
 * ONCE in layout.tsx — OUTSIDE every page's `zoom: 0.9` frame, or fixed-element
 * click hit-testing breaks in Chrome. Self-hides on "/" and "/d/*".
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/* compact line icons (currentColor) */
const S = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-[13px] w-[13px]" };
const IHome = () => <svg {...S}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
const IGrid = () => <svg {...S}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;
const ICampaign = () => <svg {...S}><path d="M3 11v2l13 4V7L3 11Z" /><path d="M16 9a3 3 0 0 1 0 6" /></svg>;
const IStore = () => <svg {...S}><path d="M4 9 5 4h14l1 5" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M5 9.5V20h14V9.5" /></svg>;
const ITrade = () => <svg {...S}><path d="M4 3v18h17" /><rect x="7.5" y="9" width="3" height="6" /><rect x="14" y="6" width="3" height="5" /></svg>;
const IAgent = () => <svg {...S}><rect x="5" y="8" width="14" height="11" rx="1.5" /><path d="M12 8V5M9 5h6" /><circle cx="9.5" cy="13" r="1" /><circle cx="14.5" cy="13" r="1" /></svg>;
const IVenture = () => <svg {...S}><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M8 7V5h8v2" /><path d="M3 12h18" /></svg>;
const ITalent = () => <svg {...S}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.4-4.5 5.5-4.5s5.5 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.3" /></svg>;
const IMsg = () => <svg {...S}><path d="M4 5h16v11H8l-4 3.5V5Z" /><path d="M8 9.5h8M8 12.5h5" /></svg>;
const IRocket = () => <svg {...S}><path d="M12 3c3 1.5 5 5 5 9l-3 3h-4l-3-3c0-4 2-7.5 5-9Z" /><circle cx="12" cy="9" r="1.4" /></svg>;
const IGov = () => <svg {...S}><path d="M3 10l9-6 9 6" /><path d="M4 21h16" /><path d="M6 21V11M10 21V11M14 21V11M18 21V11" /></svg>;
const IEcho = () => <svg {...S}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></svg>;
const IUser = () => <svg {...S}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>;
const ISkills = () => <svg {...S}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" /></svg>;

type NavItem = { key: string; label: string; href: string; Icon: () => ReactNode };

const NAV: NavItem[] = [
  { key: "h", label: "home", href: "/home", Icon: IHome },
  { key: "g", label: "grids", href: "/grids/explore", Icon: IGrid },
  { key: "c", label: "campaign", href: "/campaignx/board", Icon: ICampaign },
  { key: "x", label: "gridx", href: "/gridx", Icon: IStore },
  { key: "t", label: "trade", href: "/markets", Icon: ITrade },
  { key: "a", label: "agents", href: "/agents", Icon: IAgent },
  { key: "o", label: "ventures", href: "/ventures", Icon: IVenture },
  { key: "s", label: "skills", href: "/skills", Icon: ISkills },
  { key: "l", label: "talent", href: "/talent", Icon: ITalent },
  { key: "m", label: "messages", href: "/messages", Icon: IMsg },
  { key: "n", label: "fund", href: "/genesis/board", Icon: IRocket },
  { key: "v", label: "governance", href: "/governance", Icon: IGov },
  { key: "e", label: "echo", href: "/echo", Icon: IEcho },
  { key: "p", label: "profile", href: "/me", Icon: IUser },
];

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

export default function NeuGridDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () => fetch("/api/messages/unread").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setUnread(d.count || 0); }).catch(() => {});
    load();
    const iv = window.setInterval(load, 20000);
    window.addEventListener("neugrid:refresh-me", load);
    return () => { window.clearInterval(iv); window.removeEventListener("neugrid:refresh-me", load); };
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const hit = NAV.find((n) => n.key === e.key.toLowerCase());
      if (hit) router.push(hit.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // hidden on the public surfaces: the landing, hosted /d/ apps, and the
  // footer-linked static pages (they scroll and carry the SiteFooter instead)
  if (pathname === "/" || pathname.startsWith("/d/") || pathname === "/about" || pathname === "/terms" || pathname === "/privacy") return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-neon/20 bg-black">
      <div className="flex flex-nowrap items-center justify-start gap-x-3.5 overflow-x-auto px-3 py-1.5 font-mono text-[10px] [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:justify-center lg:gap-y-0.5 lg:py-1 [&::-webkit-scrollbar]:hidden">
        {NAV.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-label={it.label}
              title={`${it.label}  ·  press ${it.key}`}
              className={`group flex items-center gap-1 whitespace-nowrap py-0.5 transition ${active ? "text-neon" : "text-ink-faint hover:text-neon"}`}
            >
              <it.Icon />
              <span className="tracking-tight">{it.label}</span>
              <span className={`text-[8px] ${active ? "text-neon/70" : "text-ink-faint/60 group-hover:text-neon/70"}`}>{it.key}</span>
              {it.href === "/messages" && unread > 0 && <span className="text-[8px] text-danger">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
