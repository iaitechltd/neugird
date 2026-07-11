/**
 * SiteFooter — the proper footer for NeuGrid's public surfaces (the landing +
 * the static pages). App pages keep the terminal keybar as their bottom
 * chrome; this lives where pages scroll. Every link is REAL — platform routes,
 * the public GitHub, and the static pages shipped alongside it. No invented
 * socials, no dead ends.
 */

import Link from "next/link";
import NeuGridMark from "@/components/NeuGridMark";

const REPO = "https://github.com/iaitechltd/neugird";

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
  return (
    <footer className="relative z-10 border-t border-neon/15 bg-black">
      <div className="mx-auto max-w-7xl px-6 py-12 sm:px-10">
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

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-neon/10 pt-5 font-mono text-[10.5px] text-ink-faint sm:flex-row sm:items-center">
          <span>© 2026 NeuGrid · running on Solana devnet</span>
          <span>Settled on Solana · logic on ICP · reputation soulbound</span>
        </div>
      </div>
    </footer>
  );
}
