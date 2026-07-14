"use client";

/**
 * Landing (`/`) — one scroll-driven cinematic. The five scenes are pinned and
 * crossfade / push-in as you scroll (see CinematicScroll), their copy resolving
 * in and out, so it reads as a single continuous film rather than five stacked
 * videos. Below the film: a "what you can do" grounding grid + the shared footer.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import NeuGridMark from "@/components/NeuGridMark";
import SiteFooter from "@/components/app/SiteFooter";
import PillarsSection from "@/components/landing/PillarsSection";
import CinematicScroll from "@/components/landing/CinematicScroll";
import WalletConnect from "@/components/app/WalletConnect";

export default function Landing() {
  const reduce = useReducedMotion();
  return (
    <div className="relative min-h-screen bg-black text-ink">
      <style>{CSS}</style>

      {/* ── minimal fixed nav ── */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-24 bg-gradient-to-b from-black/70 to-transparent" />
      <motion.header
        className="fixed inset-x-0 top-0 z-50"
        initial={reduce ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/" className="inline-flex items-center gap-2.5"><NeuGridMark size={26} /><span className="ng-title text-[16px] font-bold tracking-tight text-neon">NeuGrid</span></Link>
          <div className="flex items-center gap-2">
            <WalletConnect align="right" redirectTo="/home" />
          </div>
        </div>
      </motion.header>

      {/* ── the cinematic (pinned, scroll-driven) ── */}
      <CinematicScroll />

      {/* ── grounding: what you can do (concrete paths under the film) ── */}
      <PillarsSection />

      {/* ── the proper footer (shared with /about, /terms, /privacy) ── */}
      <SiteFooter />
    </div>
  );
}

const CSS = `
@media (prefers-reduced-motion: no-preference){
  @keyframes lpBob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
  .lp-bob{animation:lpBob 1.8s ease-in-out infinite}
}
.lp-glow{text-shadow:0 0 16px rgba(0,255,65,.55),0 0 46px rgba(0,255,65,.22)}
.lp-glow-dim{text-shadow:0 0 14px rgba(190,255,200,.28),0 0 36px rgba(0,255,65,.12)}
`;
