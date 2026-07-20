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
    titleLines: [{ t: "NeuGrid:", accent: true }, { t: "Where Anyone Builds" }, { t: "a Real Company" }],
    subtitle: "An AI crew does the heavy lifting. Humans and agents work side by side. Backers fund delivery, not promises — and the builder owns the upside.",
  },
  {
    img: "/landing/scene-2.jpg", video: "/landing/scene-2.mp4",
    titleLines: [{ t: "Where builders" }, { t: "become owners.", accent: true }],
    subtitle: "Form a team of people and AI agents, ship a real product, and share in what it earns — ownership written down, split by contribution.",
  },
  {
    img: "/landing/scene-3.jpg", video: "/landing/scene-3.mp4",
    titleLines: [{ t: "Where work" }, { t: "becomes worth.", accent: true }],
    subtitle: "Every build, hire, and delivery earns Pulse — a track record that turns proven work into real ownership. Earned, never bought.",
  },
  {
    img: "/landing/scene-4.jpg", video: "/landing/scene-4.mp4",
    titleLines: [{ t: "From an idea" }, { t: "to income.", accent: true }],
    subtitle: "Describe it, and your crew builds it. Hire help, get funded milestone by milestone, ship it, sell it — a business that pays you, not a pitch deck.",
  },
  {
    img: "/landing/scene-5.jpg", video: "/landing/scene-5.mp4",
    titleLines: [{ t: "Proof. Not promises." }, { t: "Yours.", accent: true }],
    subtitle: "Every step is on the record — the code, the deliveries, the sales. Buyers and backers see receipts, not claims. And the record belongs to you.",
  },
  {
    img: "/landing/what-you-can-do.jpg", video: "/landing/what-you-can-do.mp4",
    titleLines: [{ t: "One platform." }, { t: "The full path.", accent: true }],
    subtitle: "Idea → build → team → funding → customers → income you can share. Every step happens here, and every step is earned.",
  },
  {
    img: "/landing/why-neugrid-exists.jpg", video: "/landing/why-neugrid-exists.mp4",
    titleLines: [{ t: "For the ones" }, { t: "the room overlooked.", accent: true }],
    subtitle: "Talent is everywhere. Opportunity wasn't. NeuGrid trades who-you-know for what-you've-built — a track record no gatekeeper controls and no one can take from you.",
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
  const subRefs = useRef<(HTMLSpanElement | null)[]>([]);    // per scene → subtitle reveal target (types in)
  const ctaRef = useRef<HTMLDivElement | null>(null);        // finale CTA (a third, latest beat)
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

  // the subtitle types in exactly like the headline — chars revealed by scroll with
  // a thin cursor on the frontier. It's one wrapped paragraph, so the revealed text
  // sits over an invisible full-text copy: the layout is reserved up front and the
  // words just fill in, no reflow.
  const renderSubtitle = (i: number, frac: number) => {
    const el = subRefs.current[i];
    if (!el) return;
    const text = SCENES[i].subtitle;
    const revealed = Math.round(clamp01(frac) * text.length);
    el.textContent = text.slice(0, revealed);
    if (frac > 0 && frac < 1) {
      const cur = document.createElement("span");
      cur.className = "ng-tcursor";
      el.appendChild(cur);
    }
  };

  // hero (scene 0) reveals on load in two beats: the title types itself in, then
  // the subtitle types a moment later — the same title-then-subtitle staging the
  // scrolled scenes use. rAF drives it live; a timeout guarantees the final state
  // (the preview tab throttles rAF, so that safety write is what shows there).
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const TITLE = 1100, SUB_DELAY = 850, SUB = 1600;
    const tick = () => {
      const now = performance.now();
      renderHeadline(0, clamp01((now - t0) / TITLE));
      renderSubtitle(0, clamp01((now - t0 - SUB_DELAY) / SUB));
      if (now - t0 < SUB_DELAY + SUB) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = window.setTimeout(() => { cancelAnimationFrame(raf); renderHeadline(0, 1); renderSubtitle(0, 1); }, SUB_DELAY + SUB + 500);
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
        const start = i / total, end = (i + 1) / total, fade = seg * 0.34;
        const isFirst = i === 0, isLast = i === total - 1;
        const u = clamp01((p - start) / seg); // local progress within this scene (0→1)

        let bo: number;
        if (isFirst) bo = 1 - clamp01((p - (end - fade)) / (2 * fade));
        else if (isLast) bo = clamp01((p - (start - fade)) / (2 * fade));
        else bo = Math.min(clamp01((p - (start - fade)) / (2 * fade)), 1 - clamp01((p - (end - fade)) / (2 * fade)));

        const s0 = Math.max(0, start - seg), s1 = Math.min(1, end + seg);
        const sc = lerp(1.05, 1.19, clamp01((p - s0) / (s1 - s0)));

        // container envelope: the whole copy block fades in as the scene arrives
        // and out as it leaves, with a WIDE hold in between so it stays readable.
        let to: number;
        if (isFirst) to = 1 - clamp01((u - 0.74) / 0.20);        // hero: only fades out on the way past
        else if (isLast) to = clamp01((u - 0.04) / 0.11);        // finale: fades in, then stays
        else to = Math.min(clamp01((u - 0.04) / 0.11), 1 - clamp01((u - 0.86) / 0.12));
        const ty = lerp(20, -14, u);                             // gentle parallax rise across the scene

        const bg = bgRefs.current[i]; if (bg) bg.style.opacity = String(bo);
        const scl = scaleRefs.current[i]; if (scl) scl.style.transform = `scale(${sc.toFixed(4)})`;
        const txt = textRefs.current[i]; if (txt) { txt.style.opacity = String(to); txt.style.transform = `translateY(${ty.toFixed(1)}px)`; }

        // BEAT 1 — the title types itself in first, early in the scene, spread over
        // a good stretch of scroll so you watch it appear (the hero types on load).
        if (i >= 1) renderHeadline(i, clamp01((u - 0.06) / 0.30));

        // BEAT 2 — the subtitle TYPES itself in the same way, a beat after the title
        // finishes: scroll → watch the title type → scroll a little more → the subtitle
        // types in too, over a good stretch of scroll (not a sudden block of text). The
        // hero types on load.
        if (i >= 1) {
          const ss = isLast ? 0.28 : 0.40, se = isLast ? 0.62 : 0.76;
          renderSubtitle(i, clamp01((u - ss) / (se - ss)));
        }

        // BEAT 3 — the finale CTA settles in last, after the subtitle.
        if (isLast && ctaRef.current) {
          const c = clamp01((u - 0.52) / 0.16);
          ctaRef.current.style.opacity = String(c);
          ctaRef.current.style.transform = `translateY(${lerp(12, 0, c).toFixed(1)}px)`;
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
    <div ref={containerRef} style={{ height: `${total * 140 + 20}vh` }} className="relative">
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
              <p className="relative mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-dim sm:text-[15px]">
                <span aria-hidden className="invisible">{s.subtitle}</span>
                <span ref={(el) => { subRefs.current[i] = el; }} className="absolute inset-0 left-0 top-0" />
              </p>
              {s.cta && (
                <div ref={ctaRef} style={{ opacity: 0 }} className="pointer-events-auto mt-9 flex flex-wrap items-center gap-3">
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
