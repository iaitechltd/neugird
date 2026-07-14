"use client";

/**
 * Landing — "What you can do" pillars. A grounding section under the cinematic
 * scenes: six capability tiles as one continuous terminal grid, each linking into
 * that part of the platform. As the section scrolls into view the header and
 * cards resolve in with a staggered rise — driven directly off scroll position
 * (so it stays in step with the film above and works even where rAF is throttled).
 */

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  IconCode, IconGrid, IconBot, IconCoins, IconChart, IconActivity,
} from "@/components/app/ui";

type Pillar = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href: string;
};

const PILLARS: Pillar[] = [
  { icon: IconCode, title: "Build with Echo", body: "Describe your idea; Echo writes real, deployable code.", href: "/echo" },
  { icon: IconGrid, title: "Form a Grid", body: "Spin up a community that runs like an economy.", href: "/grids/explore" },
  { icon: IconBot, title: "Talent & Agents", body: "Hire people or autonomous AI agents to do the work.", href: "/agents" },
  { icon: IconCoins, title: "Fund", body: "Raise capital from backers, milestone by milestone.", href: "/genesis/board" },
  { icon: IconChart, title: "Trade", body: "Tokenize your project and trade it on-chain.", href: "/markets" },
  { icon: IconActivity, title: "Earn Pulse", body: "Every contribution earns reputation that becomes ownership.", href: "/rewards" },
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default function PillarsSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const sec = sectionRef.current;
    if (!sec) return;

    const reveal = (el: HTMLElement | null, f: number) => {
      if (!el) return;
      el.style.opacity = String(f);
      el.style.transform = `translateY(${((1 - f) * 54).toFixed(1)}px)`;
    };

    // reduced motion → everything shown, no scrubbing
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveal(headerRef.current, 1);
      cardRefs.current.forEach((c) => reveal(c, 1));
      return;
    }

    // Reveal each element by ITS OWN viewport position, so every tile animates as
    // it actually scrolls into view (never off-screen). The grid rows naturally
    // give a top-to-bottom cascade. 0 when its top sits ~88% down the viewport,
    // 1 by the time it reaches ~55%.
    const apply = () => {
      const vh = window.innerHeight;
      const revealEl = (el: HTMLElement | null) => {
        if (!el) return;
        reveal(el, clamp01((vh * 0.88 - el.getBoundingClientRect().top) / (vh * 0.33)));
      };
      revealEl(headerRef.current);
      cardRefs.current.forEach(revealEl);
    };

    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative w-full bg-black">
      <div className="relative mx-auto w-full max-w-6xl px-6 py-24 sm:px-10 sm:py-28">
        {/* header */}
        <div ref={headerRef} className="mb-12 sm:mb-16" style={{ opacity: 0 }}>
          <div className="ng-label text-neon/70">WHAT YOU CAN DO</div>
          <h2 className="ng-title mt-4 text-2xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            One platform. <span className="text-neon">The full path.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-ink-dim sm:text-[15px]">
            From a spark of an idea to a tokenized, self-running economy — every step
            happens here, and every step is earned.
          </p>
        </div>

        {/* one continuous terminal grid: outer top+left rule, each cell bottom+right */}
        <div className="grid grid-cols-1 border-l border-t border-neon/15 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.title} ref={(el) => { cardRefs.current[i] = el; }} style={{ opacity: 0 }}>
                <Link
                  href={p.href}
                  className="group flex min-h-[188px] flex-col justify-between border-b border-r border-neon/15 p-6 transition-colors duration-200 hover:border-neon/60 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-neon" />
                    <span className="text-[11px] tabular-nums text-neon/50">0{i + 1}</span>
                  </div>
                  <div className="mt-6">
                    <h3 className="flex items-baseline gap-2 text-base font-bold text-ink sm:text-lg">
                      <span className="text-neon">›</span>
                      {p.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-dim">{p.body}</p>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
