"use client";

/**
 * The landing cinematic — a single scroll-driven film. All five scenes are
 * stacked inside one PINNED (sticky) stage; scroll position drives each scene's
 * crossfade, a slow push-in, its headline TYPING itself in (scroll-scrubbed
 * typewriter), and a subtle right-edge scene stepper.
 *
 * Each scene loops SEAMLESSLY: two stacked copies of the clip: when the playing
 * one nears its end the other restarts from 0 and crossfades in (CSS opacity
 * transition), so the hard cut of a native `loop` never reaches the screen.
 *
 * Scroll → visuals are written straight to the DOM (element.style / textContent)
 * rather than through an animation-frame loop, so they stay correct even where
 * requestAnimationFrame is throttled. Reduced motion → plain stacked scenes.
 */

import { useEffect, useRef } from "react";
import type { SyntheticEvent } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { IconArrowRight, IconChevronDown } from "@/components/app/ui";

type TitleLine = { t: string; accent?: boolean };
type SceneDef = { img: string; video: string; titleLines: TitleLine[]; subtitle: string; cta?: boolean };

const SEAM = 1.0; // seconds before a clip's end that the crossfade to its fresh copy begins

const SCENES: SceneDef[] = [
  {
    img: "/landing/scene-1.jpg", video: "/landing/scene-1.mp4",
    titleLines: [{ t: "NeuGrid:", accent: true }, { t: "The Programmable Economy Layer" }, { t: "for Internet Communities" }],
    subtitle: "From idea to community, talent, campaigns, funding, agents, and tokenized launch, NeuGrid gives anyone the full path to build, grow, and scale their own digital economy.",
  },
  {
    img: "/landing/scene-2.jpg", video: "/landing/scene-2.mp4",
    titleLines: [{ t: "Where communities" }, { t: "become economies.", accent: true }],
    subtitle: "Powered by Solana and ICP, NeuGrid lets communities form, coordinate, earn Pulse, launch SubGrids, activate talent, and evolve into on-chain economies.",
  },
  {
    img: "/landing/scene-3.jpg", video: "/landing/scene-3.mp4",
    titleLines: [{ t: "Where work" }, { t: "becomes worth.", accent: true }],
    subtitle: "Every build, hire, and contribution earns Pulse — the on-chain reputation that turns proof-of-work into real ownership. Earned, never bought.",
  },
  {
    img: "/landing/scene-4.jpg", video: "/landing/scene-4.mp4",
    titleLines: [{ t: "From spark" }, { t: "to full scale.", accent: true }],
    subtitle: "A community forms a Grid, spins up SubGrids, and activates talent and agents — then evolves into a living, self-sustaining on-chain economy.",
  },
  {
    img: "/landing/scene-5.jpg", video: "/landing/scene-5.mp4",
    titleLines: [{ t: "Composable. Verifiable." }, { t: "Yours.", accent: true }],
    subtitle: "Grids, credentials, markets, and agents interlock as programmable building blocks — settled on Solana and ICP, owned by the people who build them.",
    cta: true,
  },
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function PlainCopy({ scene }: { scene: SceneDef }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-24 sm:px-10 sm:pb-28">
      <h1 className="ng-title text-[26px] font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-[46px]">
        {scene.titleLines.map((l, j) => (
          <span key={j} className={`block ${l.accent ? "text-neon lp-glow" : "text-ink lp-glow-dim"}`}>{l.t}</span>
        ))}
      </h1>
      <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-dim sm:text-[15px]">{scene.subtitle}</p>
      {scene.cta && (
        <div className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
          <Link href="/home" className="ng-btn ng-btn-primary">Start building <IconArrowRight className="h-4 w-4" /></Link>
          <Link href="/markets" className="ng-btn ng-btn-ghost">See the markets</Link>
        </div>
      )}
    </div>
  );
}

function StackedFallback() {
  return (
    <div className="relative">
      {SCENES.map((s, i) => (
        <section key={i} className="relative flex h-screen min-h-[620px] w-full items-end overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-no-repeat [background-position:76%_center] lg:[background-position:right_center]" style={{ backgroundImage: `url('${s.img}')` }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.9) 0%, rgba(0,0,0,.55) 42%, rgba(0,0,0,.12) 100%)" }} />
          <div className="relative z-10 w-full"><PlainCopy scene={s} /></div>
        </section>
      ))}
    </div>
  );
}

export default function CinematicScroll() {
  const reduce = useReducedMotion();
  const total = SCENES.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRefs = useRef<(HTMLDivElement | null)[]>([]);      // outer layer → opacity (scene crossfade)
  const scaleRefs = useRef<(HTMLDivElement | null)[]>([]);   // inner layer → transform (push-in)
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);    // copy block → opacity + translateY
  const lineRefs = useRef<(HTMLSpanElement | null)[][]>([]); // per scene → per headline line (reveal target)
  const videoRefs = useRef<(HTMLVideoElement | null)[][]>([]); // per scene → [copy A, copy B]
  const frontRef = useRef<number[]>([]);                     // per scene → which copy is showing (0|1)
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepperRef = useRef<HTMLDivElement | null>(null);
  const cueRef = useRef<HTMLDivElement | null>(null);

  // seamless loop: when the front copy nears its end, restart the other from 0 and
  // crossfade to it (the videos carry a CSS opacity transition).
  const handleTime = (i: number, which: number) => (e: SyntheticEvent<HTMLVideoElement>) => {
    if ((frontRef.current[i] ?? 0) !== which) return;
    const v = e.currentTarget;
    const dur = v.duration;
    if (!isFinite(dur) || dur <= SEAM) return;
    if (dur - v.currentTime <= SEAM) {
      const other = videoRefs.current[i]?.[1 - which];
      if (!other) return;
      other.currentTime = 0;
      other.play?.().catch(() => {});
      other.style.opacity = "1";
      v.style.opacity = "0";
      frontRef.current[i] = 1 - which;
    }
  };

  const renderHeadline = (i: number, frac: number) => {
    const lines = SCENES[i].titleLines.map((l) => l.t);
    const totalChars = lines.reduce((s, t) => s + t.length, 0);
    const revealed = Math.round(clamp01(frac) * totalChars);
    let acc = 0;
    for (let j = 0; j < lines.length; j++) {
      const el = lineRefs.current[i]?.[j];
      const len = lines[j].length;
      if (el) {
        el.textContent = lines[j].slice(0, Math.max(0, Math.min(len, revealed - acc)));
        if (frac < 1 && revealed >= acc && revealed < acc + len) {
          const cur = document.createElement("span");
          cur.className = "ng-tcursor";
          el.appendChild(cur);
        }
      }
      acc += len;
    }
  };

  // hero (scene 0) types in on load; rAF drives it live, a timeout guarantees full.
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const startTs = typeof performance !== "undefined" ? performance.now() : 0;
    const DUR = 1200;
    const tick = () => {
      const f = clamp01((performance.now() - startTs) / DUR);
      renderHeadline(0, f);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = window.setTimeout(() => { cancelAnimationFrame(raf); renderHeadline(0, 1); }, 1500);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(safety); };
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    const el = containerRef.current;
    if (!el) return;
    const seg = 1 / total;

    const apply = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const px = Math.max(1, el.offsetHeight - window.innerHeight);
      const p = clamp01((window.scrollY - top) / px);

      for (let i = 0; i < total; i++) {
        const start = i / total, end = (i + 1) / total, fade = seg * 0.34, mid = (start + end) / 2;
        const isFirst = i === 0, isLast = i === total - 1;

        let bo: number;
        if (isFirst) bo = 1 - clamp01((p - (end - fade)) / (2 * fade));
        else if (isLast) bo = clamp01((p - (start - fade)) / (2 * fade));
        else bo = Math.min(clamp01((p - (start - fade)) / (2 * fade)), 1 - clamp01((p - (end - fade)) / (2 * fade)));

        const s0 = Math.max(0, start - seg), s1 = Math.min(1, end + seg);
        const sc = lerp(1.05, 1.19, clamp01((p - s0) / (s1 - s0)));

        const inA = start + seg * 0.02, inB = start + seg * 0.09;
        const outA = end - seg * 0.30, outB = end - seg * 0.14;
        let to: number;
        if (isFirst) to = 1 - clamp01((p - outA) / (outB - outA));
        else if (isLast) to = clamp01((p - inA) / (inB - inA));
        else to = Math.min(clamp01((p - inA) / (inB - inA)), 1 - clamp01((p - outA) / (outB - outA)));

        let ty: number;
        if (isFirst) ty = lerp(0, -30, clamp01((p - mid) / (outB - mid)));
        else if (isLast) ty = lerp(30, 0, clamp01((p - inA) / (mid - inA)));
        else ty = p < mid ? lerp(30, 0, clamp01((p - inA) / (mid - inA))) : lerp(0, -30, clamp01((p - mid) / (outB - mid)));

        const bg = bgRefs.current[i]; if (bg) bg.style.opacity = String(bo);
        const scl = scaleRefs.current[i]; if (scl) scl.style.transform = `scale(${sc.toFixed(4)})`;
        const txt = textRefs.current[i]; if (txt) { txt.style.opacity = String(to); txt.style.transform = `translateY(${ty.toFixed(1)}px)`; }

        if (i >= 1) {
          const ts = start + seg * 0.09, te = start + seg * 0.42;
          renderHeadline(i, clamp01((p - ts) / (te - ts)));
        }
      }

      const active = Math.min(total - 1, Math.max(0, Math.floor(p * total + 0.0001)));
      tickRefs.current.forEach((t, i) => {
        if (!t) return;
        const on = i === active;
        t.style.opacity = on ? "1" : "0.28";
        t.style.width = on ? "26px" : "12px";
      });
      if (stepperRef.current) stepperRef.current.style.opacity = String(1 - clamp01((p - 0.93) / 0.07));
      if (cueRef.current) cueRef.current.style.opacity = String(1 - clamp01(p / 0.035));

      // play the active scene + neighbours (front copy), pause the rest; lazy-load src
      videoRefs.current.forEach((pair, i) => {
        if (!pair) return;
        const near = Math.abs(i - active) <= 1;
        const a = pair[0], b = pair[1];
        if (near) {
          if (a && !a.src) a.src = SCENES[i].video;
          if (b && !b.src) b.src = SCENES[i].video;
          const frontV = pair[frontRef.current[i] ?? 0];
          if (frontV && frontV.paused && frontV.src) frontV.play?.().catch(() => {});
        } else {
          a?.pause?.(); b?.pause?.();
        }
      });
    };

    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, [reduce, total]);

  if (reduce) return <StackedFallback />;

  return (
    <div ref={containerRef} style={{ height: `${total * 100 + 20}vh` }} className="relative">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        {/* frames (z-0) — two stacked video copies per scene for the seamless loop */}
        {SCENES.map((s, i) => (
          <div key={`bg${i}`} ref={(el) => { bgRefs.current[i] = el; }} className="absolute inset-0 z-0" style={{ opacity: i === 0 ? 1 : 0 }}>
            <div ref={(el) => { scaleRefs.current[i] = el; }} className="absolute inset-0">
              {[0, 1].map((which) => (
                <video
                  key={which}
                  ref={(el) => { (videoRefs.current[i] ??= [null, null])[which] = el; }}
                  className="absolute inset-0 h-full w-full object-cover [object-position:76%_center] [transition:opacity_0.9s_linear] lg:[object-position:right_center]"
                  style={{ opacity: which === 0 ? 1 : 0 }}
                  poster={which === 0 ? s.img : undefined}
                  preload="none"
                  muted loop playsInline
                  onTimeUpdate={handleTime(i, which)}
                />
              ))}
            </div>
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.3) 38%, rgba(0,0,0,.06) 68%, rgba(0,0,0,0) 100%)" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/20" />
          </div>
        ))}

        {/* copy (z-20) — headline lines are typewriter reveal targets */}
        {SCENES.map((s, i) => (
          <div key={`tx${i}`} ref={(el) => { textRefs.current[i] = el; }} className="pointer-events-none absolute inset-0 z-20 flex items-end" style={{ opacity: i === 0 ? 1 : 0 }}>
            <div className="mx-auto w-full max-w-7xl px-6 pb-24 sm:px-10 sm:pb-28">
              <h1 className="ng-title text-[26px] font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-[46px]">
                {s.titleLines.map((l, j) => (
                  <span key={j} className={`relative block ${l.accent ? "text-neon lp-glow" : "text-ink lp-glow-dim"}`}>
                    <span aria-hidden className="invisible">{l.t || " "}</span>
                    <span ref={(el) => { (lineRefs.current[i] ||= [])[j] = el; }} className="absolute inset-0 left-0 top-0" />
                  </span>
                ))}
              </h1>
              <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-dim sm:text-[15px]">{s.subtitle}</p>
              {s.cta && (
                <div className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
                  <Link href="/home" className="ng-btn ng-btn-primary">Start building <IconArrowRight className="h-4 w-4" /></Link>
                  <Link href="/markets" className="ng-btn ng-btn-ghost">See the markets</Link>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* right-edge scene stepper (subtle) */}
        <div ref={stepperRef} aria-hidden className="pointer-events-none fixed right-5 top-1/2 z-40 flex -translate-y-1/2 flex-col items-end gap-3 sm:right-7">
          {SCENES.map((_, i) => (
            <div key={i} ref={(el) => { tickRefs.current[i] = el; }} className="h-[2px] bg-neon transition-all duration-300" style={{ width: i === 0 ? 26 : 12, opacity: i === 0 ? 1 : 0.28 }} />
          ))}
        </div>

        <div ref={cueRef} aria-hidden className="pointer-events-none absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5 text-ink-faint">
          <span className="ng-label">Scroll</span>
          <IconChevronDown className="lp-bob h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
