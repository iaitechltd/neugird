/**
 * SiteFooter — the proper footer for NeuGrid's public surfaces (the landing +
 * the static pages). App pages keep the terminal keybar as their bottom
 * chrome; this lives where pages scroll. Every link is REAL — platform routes,
 * the public GitHub, and the static pages shipped alongside it. No invented
 * socials, no dead ends.
 */

"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import NeuGridMark from "@/components/NeuGridMark";

const REPO = "https://github.com/iaitechltd/neugird";
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const COLS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "PLATFORM",
    links: [
      { label: "Enter the app", href: "/home" },
      { label: "Trade", href: "/markets" },
      { label: "Fund", href: "/genesis/board" },
      { label: "GridX", href: "/gridx" },
      { label: "Talent", href: "/talent" },
      { label: "Agents", href: "/agents" },
      { label: "Skills market", href: "/skills" },
      { label: "Echo", href: "/echo" },
    ],
  },
  {
    title: "PROTOCOL",
    links: [
      { label: "Governance", href: "/governance" },
      { label: "Rewards & referrals", href: "/rewards" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Grids", href: "/grids/explore" },
      { label: "x402 catalogue (JSON)", href: "/api/x402/discovery", external: true },
    ],
  },
  {
    title: "BUILDERS",
    links: [
      { label: "GitHub", href: REPO, external: true },
      { label: "Agent SDK", href: `${REPO}/tree/main/sdk`, external: true },
      { label: "MCP server", href: `${REPO}/tree/main/mcp-server`, external: true },
      { label: "Contracts (Anchor)", href: `${REPO}/tree/main/contracts`, external: true },
      { label: "Report an issue", href: `${REPO}/issues`, external: true },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", href: "/about" },
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export default function SiteFooter() {
  const innerRef = useRef<HTMLDivElement>(null);

  // fade + rise the footer in as it scrolls into view (driven off scroll position
  // so it stays in step with the rest of the page and needs no animation-frame loop)
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const set = (f: number) => { el.style.opacity = String(f); el.style.transform = `translateY(${((1 - f) * 34).toFixed(1)}px)`; };
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { set(1); return; }
    const apply = () => {
      const r = el.getBoundingClientRect();
      set(clamp01((window.innerHeight - r.top) / (window.innerHeight * 0.4)));
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => { window.removeEventListener("scroll", apply); window.removeEventListener("resize", apply); };
  }, []);

  return (
    <footer className="relative z-10 border-t border-neon/15 bg-black">
      <div ref={innerRef} className="mx-auto max-w-7xl px-6 py-12 sm:px-10" style={{ opacity: 0 }}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {/* brand — spans 2 on large */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <NeuGridMark size={26} />
              <span className="ng-title text-[16px] font-bold tracking-tight text-neon">NeuGrid</span>
            </Link>
            <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-ink-dim">
              The on-chain factory for entrepreneurs — from first skill to funded founder,
              every step verifiable. Merit is the only ticket. Earned, not bought.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 border border-amber/30 px-2 py-1 font-mono text-[10px] text-amber">
              TEST NETWORK · balances carry no real value
            </p>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <div className="ng-label mb-3 !text-[10px] !text-ink-dim">{col.title}</div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-ink-dim transition hover:text-neon">
                        {l.label} <span className="text-ink-faint">↗</span>
                      </a>
                    ) : (
                      <Link href={l.href} className="font-mono text-[12px] text-ink-dim transition hover:text-neon">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-5 border-t border-neon/10 pt-5 sm:flex-row sm:items-center">
          <div className="font-mono text-[10.5px] leading-relaxed text-ink-faint">
            <span>© 2026 NeuGrid · running on Solana devnet</span>
            <span className="mx-1.5 hidden opacity-50 sm:inline">·</span>
            <span className="block sm:inline">Settled on Solana · logic on ICP · reputation soulbound</span>
          </div>

          {/* Backed by iAI.tech — the company behind NeuGrid */}
          <a
            href="https://iai.tech"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Backed by iAI.tech"
            className="group inline-flex shrink-0 items-center gap-2.5"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">Backed by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iai-tech-logo.svg" alt="iAI.tech logo" className="h-7 w-7 shrink-0" />
            <span className="ng-title text-[14px] font-bold tracking-tight text-ink transition-colors group-hover:text-neon">
              iAI<span className="text-ink-dim transition-colors group-hover:text-neon">.tech</span>
            </span>
          </a>
        </div>
      </div>
    </footer>
  );
}
