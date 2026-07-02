"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/* ------------------------------ icons ------------------------------ */
const I = "h-[18px] w-[18px]";
const svg = {
  className: I,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const IconHome = () => (
  <svg {...svg}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>
);
const IconGrid = () => (
  <svg {...svg}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
const IconCampaign = () => (
  <svg {...svg}><path d="M3 11v2l13 4V7L3 11Z" /><path d="M16 9a3 3 0 0 1 0 6" /><path d="M6 13v4l3 1v-4" /></svg>
);
const IconStore = () => (
  <svg {...svg}><path d="M4 9 5 4h14l1 5" /><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path d="M5 9.5V20h14V9.5" /><path d="M9 20v-5h4v5" /></svg>
);
const IconAgent = () => (
  <svg {...svg}><rect x="5" y="8" width="14" height="11" rx="2" /><path d="M12 8V5M9 5h6" /><circle cx="9.5" cy="13" r="1" /><circle cx="14.5" cy="13" r="1" /><path d="M10 16h4" /></svg>
);
const IconRocket = () => (
  <svg {...svg}><path d="M12 3c3 1.5 5 5 5 9l-3 3h-4l-3-3c0-4 2-7.5 5-9Z" /><circle cx="12" cy="9" r="1.5" /><path d="M9 18c-1 1-1.5 3-1.5 3s2-.5 3-1.5M15 18c1 1 1.5 3 1.5 3s-2-.5-3-1.5" /></svg>
);
const IconTerminal = () => (
  <svg {...svg}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3" /><path d="M13 15h4" /></svg>
);
const IconUser = () => (
  <svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>
);
const IconTrade = () => (
  <svg {...svg}><path d="M4 3v18h17" /><rect x="7.5" y="9" width="3" height="6" rx="0.5" /><path d="M9 5.5v3.5M9 15v2.5" /><rect x="14" y="6" width="3" height="5" rx="0.5" /><path d="M15.5 11v3M15.5 3.5v2.5" /></svg>
);
const IconTalent = () => (
  <svg {...svg}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.4-4.5 5.5-4.5s5.5 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.3" /><path d="M15.5 14.6c3 0 5 1.4 5 4.4" /></svg>
);
const IconGov = () => (
  <svg {...svg}><path d="M3 10l9-6 9 6" /><path d="M4 21h16" /><path d="M6 21V11M10 21V11M14 21V11M18 21V11" /></svg>
);
const IconMsg = () => (
  <svg {...svg}><path d="M4 5h16v11H8l-4 3.5V5Z" /><path d="M8 9.5h8M8 12.5h5" /></svg>
);

/* ------------------------------ nav --------------------------------- */
type NavItem = { label: string; href: string; ready: boolean; icon: ReactNode };

const NAV: (NavItem | "divider")[] = [
  { label: "Home", href: "/home", ready: true, icon: <IconHome /> },
  { label: "Grids", href: "/grids/explore", ready: true, icon: <IconGrid /> },
  { label: "CampaignX", href: "/campaignx/board", ready: true, icon: <IconCampaign /> },
  { label: "GridX", href: "/gridx", ready: true, icon: <IconStore /> },
  { label: "TradeX", href: "/markets", ready: true, icon: <IconTrade /> },
  "divider",
  { label: "Agents", href: "/agents", ready: true, icon: <IconAgent /> },
  { label: "TalenX", href: "/talent", ready: true, icon: <IconTalent /> },
  { label: "Messages", href: "/messages", ready: true, icon: <IconMsg /> },
  { label: "GenesisX", href: "/genesis/board", ready: true, icon: <IconRocket /> },
  { label: "Governance", href: "/governance", ready: true, icon: <IconGov /> },
  { label: "Echo", href: "/echo", ready: true, icon: <IconTerminal /> },
  { label: "Profile", href: "/me", ready: true, icon: <IconUser /> },
];

export default function NeuGridDock() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // surface unread DMs globally on the Messages icon
  useEffect(() => {
    const load = () => fetch("/api/messages/unread").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setUnread(d.count || 0); }).catch(() => {});
    load();
    const iv = window.setInterval(load, 20000);
    window.addEventListener("neugrid:refresh-me", load);
    return () => { window.clearInterval(iv); window.removeEventListener("neugrid:refresh-me", load); };
  }, [pathname]);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <div
        className="flex items-center gap-0.5 rounded-2xl border border-neon/25 bg-black/80 p-1 backdrop-blur"
        style={{ boxShadow: "0 0 24px -8px rgba(0,255,0,0.4), inset 0 0 0 1px rgba(0,255,0,0.05)" }}
      >
        {NAV.map((it, i) => {
          if (it === "divider") return <span key={`d${i}`} className="mx-0.5 h-6 w-px bg-neon/20" />;
          const active = it.ready && (pathname === it.href || pathname.startsWith(it.href + "/"));
          const inner = (
            <span
              className={`group relative grid h-10 w-10 place-items-center rounded-lg transition ${
                active
                  ? "bg-neon text-bg shadow-[0_0_14px_-2px_rgba(0,255,0,0.7)]"
                  : it.ready
                    ? "text-neon hover:bg-neon/15"
                    : "text-neon/45 hover:bg-neon/10 hover:text-neon"
              }`}
            >
              {it.icon}
              {it.href === "/messages" && unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[color:var(--ng-danger)] px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
              )}
              <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded border border-neon/30 bg-black/90 px-2 py-1 font-mono text-[11px] text-neon opacity-0 shadow-[0_0_12px_-4px_rgba(0,255,0,0.5)] transition group-hover:opacity-100">
                {it.label}
                {!it.ready && " · soon"}
              </span>
            </span>
          );
          return it.ready ? (
            <Link key={it.href} href={it.href} aria-label={it.label}>{inner}</Link>
          ) : (
            <button key={it.href} aria-label={it.label} className="cursor-default">{inner}</button>
          );
        })}
      </div>
    </div>
  );
}
