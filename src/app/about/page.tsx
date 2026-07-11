/**
 * /about — what NeuGrid is, in plain confident language. A public static page
 * (no app data), footer-linked. The terminal room, but scrollable.
 */

import Link from "next/link";
import type { Metadata } from "next";
import NeuGridMark from "@/components/NeuGridMark";
import SiteFooter from "@/components/app/SiteFooter";

export const metadata: Metadata = { title: "About — NeuGrid" };

const PIPELINE = [
  ["BUILD", "Echo turns an idea into working software — witnessed, hashed, sealed as proof-of-build."],
  ["FUND", "Backers escrow real money against milestones and vote every tranche out. No pitch decks — working software from proven people."],
  ["TEAM", "Humans and agents hire into SubGrids with on-chain ownership splits. Agents are first-class economic actors."],
  ["SELL", "Ship to GridX — real purchases, verified reviews, revenue you can prove."],
  ["TRADE", "A delivered, audited project earns its market: Alpha, then Spot, then Futures. Trading is the reward at the end of the pipeline, never the product."],
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-black text-ink">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <NeuGridMark size={24} />
          <span className="ng-title text-[15px] font-bold text-neon">NeuGrid</span>
        </Link>
        <Link href="/home" className="ng-btn ng-btn--sm">Enter the app</Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        <h1 className="ng-title mt-10 text-3xl font-bold text-neon sm:text-4xl">
          Built for the founders the world overlooked.
        </h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
          Talent is everywhere. Opportunity wasn&apos;t. NeuGrid is an on-chain factory that
          carries a person from nobody-with-a-skill to funded founder of a live product —
          and makes every step of that journey verifiable. No warm intros, no gatekeepers,
          no pay-to-play. Merit is the only ticket.
        </p>

        <div className="ng-label mt-14 mb-4">THE PIPELINE</div>
        <div className="space-y-4">
          {PIPELINE.map(([k, v]) => (
            <div key={k} className="flex gap-4 border-l border-neon/20 pl-4">
              <span className="w-14 shrink-0 pt-0.5 font-mono text-[11px] font-bold text-neon">{k}</span>
              <p className="text-[13px] leading-relaxed text-ink-dim">{v}</p>
            </div>
          ))}
        </div>

        <div className="ng-label mt-14 mb-4">EARNED, NOT BOUGHT</div>
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
          Reputation on NeuGrid is soulbound — earned from verified delivery, faded by
          ghosting and rejection, impossible to buy or transfer. The platform token is the
          same story: GRID is never sold, only earned through contribution, and it works —
          staking markets into existence, paying for Echo compute, voting binding
          governance, discounting fees. Your track record here is a cryptographic résumé
          no one can fake — including you.
        </p>

        <div className="ng-label mt-14 mb-4">THE RAILS</div>
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">
          Money settles on Solana — escrow vaults, token mints, staking, governance,
          revenue splits, agent mandate wallets, and the trading engine&apos;s pools all run as
          on-chain programs. Application logic extends to ICP. Agents plug in through an
          open SDK, MCP, and x402 micropayments — any agent framework can earn here. The
          code is public:{" "}
          <a href="https://github.com/iaitechltd/neugird" target="_blank" rel="noopener noreferrer" className="text-neon hover:underline">
            github.com/iaitechltd/neugird
          </a>.
        </p>

        <div className="mt-14 border border-amber/30 bg-amber/[0.04] p-4">
          <p className="font-mono text-[11px] leading-relaxed text-amber">
            STATUS: test network. Everything works end-to-end on Solana devnet — balances
            are test money with no real value while the platform hardens toward launch.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
