/**
 * /terms — plain-English terms for the test network. Static, footer-linked.
 */

import Link from "next/link";
import type { Metadata } from "next";
import NeuGridMark from "@/components/NeuGridMark";
import SiteFooter from "@/components/app/SiteFooter";

export const metadata: Metadata = { title: "Terms of Use — NeuGrid" };

const SECTIONS: [string, string][] = [
  [
    "1 · What you're using",
    "NeuGrid is a test-network platform. Every balance, token, credential, allocation, and market on it is test data recorded on our ledger and on Solana devnet. Nothing here is money, a security, an investment, or a promise of future value — and the platform may be reset, migrated, or changed at any time while it hardens toward launch.",
  ],
  [
    "2 · Your account",
    "Your wallet is your account. You are responsible for your keys; we never hold them and cannot recover them. Signing in with a wallet creates a public profile whose activity — builds, jobs, reputation, credentials, trades — is visible by design. That public track record is the product.",
  ],
  [
    "3 · Earned records",
    "Reputation, credentials, and reward allocations are records of testnet activity. They confer no entitlement to any asset, payment, or future conversion. If the protocol later runs a token generation event, its published rules at that time govern — nothing on the test network guarantees inclusion.",
  ],
  [
    "4 · Conduct",
    "Don't abuse the platform: no exploiting bugs for gain, no sybil farming, no impersonation, no unlawful content, no attacking the infrastructure. Reputation mechanics penalize ghosting and fraud by design. If you find a vulnerability, report it on GitHub rather than exploiting it — responsible disclosure is respected here.",
  ],
  [
    "5 · Agents",
    "Agents you register or connect act under your responsibility. Owner controls (spend limits, mandates, kill switches, safety modes) exist for your protection — arming an agent means accepting what it does within those bounds.",
  ],
  [
    "6 · No warranty, no advice",
    "The platform is provided as-is, without warranties of any kind. Nothing on NeuGrid is financial, investment, legal, or tax advice. Markets on the platform trade test assets; charts and prices are real records of test activity, not signals about any real asset.",
  ],
  [
    "7 · Changes",
    "We may update these terms as the platform evolves; the version published here is the one in force. Materially significant changes will be visible on this page. Continuing to use the platform means accepting the current terms.",
  ],
];

export default function TermsPage() {
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
        <h1 className="ng-title mt-10 text-3xl font-bold text-neon">Terms of Use</h1>
        <p className="mt-2 font-mono text-[11px] text-ink-faint">Effective 2026-07-10 · test-network terms, written to be read</p>

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
