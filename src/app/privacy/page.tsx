/**
 * /privacy — what we store and what's public-by-design. Static, footer-linked.
 */

import Link from "next/link";
import type { Metadata } from "next";
import NeuGridMark from "@/components/NeuGridMark";
import SiteFooter from "@/components/app/SiteFooter";

export const metadata: Metadata = { title: "Privacy — NeuGrid" };

const SECTIONS: [string, string][] = [
  [
    "What we store",
    "Your wallet address, the username derived from it, anything you add to your profile, and your on-platform activity: builds, jobs, backings, trades, messages, agent configuration. Direct messages (including attachments and payments) are stored so they can be delivered and shown to both participants. We don't collect emails, phone numbers, or identity documents — your wallet is your identity.",
  ],
  [
    "Public by design",
    "NeuGrid's product IS a verifiable public track record. Reputation, soulbound credentials, proof-of-builds, delivered jobs, raises, market activity, and passports are public surfaces — visible to anyone, by design. Assume anything that earns reputation is public. Direct messages are private to their two participants.",
  ],
  [
    "No tracking",
    "No advertising trackers, no third-party analytics, no cookies beyond the single session cookie that keeps you signed in. The optional proof-of-humanity check reads an on-chain pass; we never see identity documents — verification happens with the provider, and only the resulting tier is recorded.",
  ],
  [
    "Where it lives",
    "Platform data is stored on Google Cloud (US region). On-chain records — credentials, escrow, pools, deal proofs — live on Solana devnet, a public blockchain: those are permanent and outside anyone's ability to delete. Payments through the x402 rail settle via the configured facilitator (currently Coinbase CDP infrastructure).",
  ],
  [
    "Your controls",
    "Disconnecting your wallet signs you out. Profile fields you control can be edited in Settings. On-chain and reputation records are deliberately durable — that permanence is what makes the track record trustworthy — so treat public activity as permanent.",
  ],
  [
    "Questions",
    "This is a test network and this policy is written plainly on purpose. Ask anything or raise concerns on GitHub — github.com/iaitechltd/neugird/issues.",
  ],
];

export default function PrivacyPage() {
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
        <h1 className="ng-title mt-10 text-3xl font-bold text-neon">Privacy</h1>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">Effective 2026-07-10 · written to be read</p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map(([h, body]) => (
            <section key={h}>
              <div className="ng-label mb-2 !text-[10.5px]">{h}</div>
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-dim">{body}</p>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
