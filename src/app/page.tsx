"use client";

/**
 * Landing (`/`) — a two-scene cinematic intro. Each scene is a full-viewport
 * image (the matrix renders) with the subject on the right and a dark negative
 * space on the left, where a kicker + title + subtitle TYPE IN on scroll-into-
 * view (typewriter effect). Scene 1 = the world of gatekeepers; scene 2 = the
 * door we built. Minimal chrome — the images carry the mood.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import NeuGridMark from "@/components/NeuGridMark";
import SiteFooter from "@/components/app/SiteFooter";
import { Cursor } from "@/components/app/typefx";
import WalletConnect from "@/components/app/WalletConnect";
import { IconArrowRight, IconChevronDown } from "@/components/app/ui";

const DECODE_GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノ01<>/=+*#$%&@";
const randGlyph = () => DECODE_GLYPHS[Math.floor(Math.random() * DECODE_GLYPHS.length)];

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* A single line that types itself in when `start` flips true. The full text is
   rendered invisibly to reserve its exact box (no layout shift), with the typed
   substring + cursor overlaid on top. */
function TypeLine({
  text, start, speed = 46, startDelay = 0, showCursor = true, decode = false, className = "",
}: {
  text: string; start: boolean; speed?: number; startDelay?: number; showCursor?: boolean; decode?: boolean; className?: string;
}) {
  const [n, setN] = useState(0);
  const [scramble, setScramble] = useState("");
  useEffect(() => {
    if (!start) return;
    if (prefersReduced()) { setN(text.length); return; }
    let i = 0;
    let t = 0 as unknown as number;
    const begin = window.setTimeout(function tick() {
      i += 1; setN(i);
      // matrix DECODE (headlines only): the next chars churn as glyphs until typed
      const ahead = decode ? Math.min(3, text.length - i) : 0;
      setScramble(ahead > 0 ? Array.from({ length: ahead }, randGlyph).join("") : "");
      if (i < text.length) t = window.setTimeout(tick, speed);
    }, startDelay);
    return () => { window.clearTimeout(begin); window.clearTimeout(t); };
  }, [start, text, speed, startDelay, decode]);

  const typing = start && n > 0 && n < text.length;
  return (
    <span className={`relative block ${className}`}>
      <span aria-hidden className="invisible">{text || " "}</span>
      <span className="absolute inset-0">
        {text.slice(0, n)}
        {typing && scramble && <span aria-hidden className="text-neon/50">{scramble}</span>}
        {showCursor && typing && <Cursor />}
      </span>
    </span>
  );
}

/* Seamless video loop: two stacked copies of the same clip. When the visible
   copy nears its end, the hidden one restarts from frame 0 and crossfades in —
   the hard cut of a native `loop` never reaches the screen. Reduced motion
   holds the poster still. */
const SEAM_WINDOW = 1.2; // s left on the clip when the swap begins
const XFADE = 1.0; // s of crossfade (must stay under SEAM_WINDOW)

function CrossfadeLoop({ src, poster }: { src?: string; poster: string }) {
  const vidA = useRef<HTMLVideoElement>(null);
  const vidB = useRef<HTMLVideoElement>(null);
  const vids = [vidA, vidB];
  const [front, setFront] = useState(0);

  // nudge playback once the src attaches; reduced motion keeps the poster
  useEffect(() => {
    const v = vids[front].current;
    if (!src || !v) return;
    if (prefersReduced()) { v.pause(); return; }
    if (v.paused) v.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, front]);

  const handleTime = (i: number) => {
    if (i !== front || prefersReduced()) return;
    const v = vids[i].current, next = vids[1 - i].current;
    if (!v || !next || !isFinite(v.duration) || v.duration <= SEAM_WINDOW) return;
    if (v.duration - v.currentTime <= SEAM_WINDOW) {
      // eslint-disable-next-line react-hooks/immutability -- seeking a DOM video element, not React state
      next.currentTime = 0;
      next.play().catch(() => {});
      setFront(1 - i);
    }
  };

  return (
    <>
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: front === i ? 1 : 0 }}
          transition={{ duration: XFADE, ease: "linear" }}
          onAnimationComplete={() => { const v = vids[i].current; if (front !== i && v) v.pause(); }}
        >
          <video
            ref={vids[i]}
            className="absolute inset-0 h-full w-full scale-[1.04] object-cover [object-position:76%_center] lg:[object-position:right_center]"
            src={src}
            poster={i === 0 ? poster : undefined}
            preload={src ? "auto" : "none"}
            autoPlay={i === 0}
            muted
            playsInline
            onTimeUpdate={() => handleTime(i)}
          />
        </motion.div>
      ))}
    </>
  );
}

type TitleLine = { t: string; accent?: boolean };

// The positioning title — shared across both scenes as the anchor; each scene
// pairs it with a different subtitle (scene 1 = the journey, scene 2 = the how).
const TITLE_LINES: TitleLine[] = [
  { t: "NeuGrid:", accent: true },
  { t: "The Programmable Economy Layer" },
  { t: "for Internet Communities" },
];

function Scene({
  img, video, id, kicker, titleLines, subtitle, cta, cue, eager,
}: {
  img: string; video?: string; id: string; kicker?: string; titleLines: TitleLine[]; subtitle: string;
  cta?: React.ReactNode; cue?: boolean; eager?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [started, setStarted] = useState(false);
  // parallax: the render drifts ±2% against the scroll (inside the 1.04 scale
  // headroom, so edges never show); off under reduced motion
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["-2%", "2%"]);
  // scene-to-scene dissolve: fade toward black while entering/leaving the
  // viewport (0.5 = center stage), so stacked scenes read as film cuts
  const seamFade = useTransform(scrollYProgress, [0.12, 0.38, 0.62, 0.88], [0.92, 0, 0, 0.92]);
  // lazy video: below-the-fold scenes only fetch their mp4 when scrolled within
  // one viewport (poster paints instantly regardless); scene-1 is eager
  const [near, setNear] = useState(false);
  const loadVideo = Boolean(video) && (eager || near);
  useEffect(() => {
    const el = ref.current;
    if (!el || !video || eager) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } },
      { rootMargin: "50% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [video, eager]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setStarted(true); io.disconnect(); } },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // cascade: each title line types after the previous, then the subtitle (snappy)
  const TS = 30, SS = 9, BASE = 220;
  const span = (l: TitleLine) => l.t.length * TS + 150;
  const delays = titleLines.map((_, i) => BASE + titleLines.slice(0, i).reduce((s, l) => s + span(l), 0));
  const subDelay = BASE + titleLines.reduce((s, l) => s + span(l), 0) + 140;

  return (
    <section ref={ref} id={id} className="relative flex h-screen min-h-[620px] w-full items-end overflow-hidden">
      {/* background render — video when provided (poster = the still, instant paint) */}
      <motion.div className="absolute inset-0" style={reduce ? undefined : { y: parallaxY }}>
        {video ? (
          <CrossfadeLoop src={loadVideo ? video : undefined} poster={img} />
        ) : (
          <div
            className="absolute inset-0 scale-[1.04] bg-cover bg-no-repeat [background-position:76%_center] lg:[background-position:right_center]"
            style={{ backgroundImage: `url('${img}')` }}
          />
        )}
      </motion.div>
      {/* legibility: dark on the left → clear on the right, plus a soft vignette.
          Video scenes are already graded — only a light touch, no double-darkening. */}
      <div className="absolute inset-0" style={{ background: video
        ? "linear-gradient(90deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.25) 35%, rgba(0,0,0,.05) 65%, rgba(0,0,0,0) 100%)"
        : "linear-gradient(90deg, rgba(0,0,0,.97) 0%, rgba(0,0,0,.88) 30%, rgba(0,0,0,.52) 58%, rgba(0,0,0,.12) 100%)" }} />
      <div className={`absolute inset-0 bg-gradient-to-t ${video ? "from-black/35 via-transparent to-black/20" : "from-black/75 via-transparent to-black/40"}`} />

      {/* seam feathering — every scene melts into black at its edges, so the
          stack reads as one continuous film instead of tiled videos */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 bg-gradient-to-b from-black via-black/45 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-32 bg-gradient-to-t from-black via-black/45 to-transparent" />
      {/* scroll-linked dissolve — fade to black while off center-stage */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-[15] bg-black" style={{ opacity: reduce ? 0 : seamFade }} />

      {/* content */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-20 sm:px-10 sm:pb-24 lg:pb-28">
        <div className="max-w-none">
          {kicker && <div className={`ng-label mb-5 text-neon/70 transition-opacity duration-700 ${started ? "opacity-100" : "opacity-0"}`}>{kicker}</div>}
          <h1 className="ng-title text-[26px] font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-[46px]">
            {titleLines.map((l, i) => (
              <TypeLine
                key={i}
                text={l.t}
                start={started}
                speed={TS}
                startDelay={delays[i]}
                decode
                className={l.accent ? "text-neon lp-glow" : "text-ink lp-glow-dim"}
              />
            ))}
          </h1>
          <p className="mt-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-dim sm:text-[15px]">
            <TypeLine text={subtitle} start={started} speed={SS} startDelay={subDelay} />
          </p>
          {cta && (
            <div
              className={`mt-9 flex flex-wrap items-center gap-3 transition-opacity duration-700 ${started ? "opacity-100" : "opacity-0"}`}
              style={{ transitionDelay: `${Math.round(subDelay)}ms` }}
            >
              {cta}
            </div>
          )}
        </div>
      </div>

      {cue && (
        <a href="#scene-two" className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5 text-ink-faint transition hover:text-neon">
          <span className="ng-label">Scroll</span>
          <IconChevronDown className="lp-bob h-4 w-4" />
        </a>
      )}
    </section>
  );
}

export default function Landing() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  return (
    <div className="relative min-h-screen bg-black text-ink">
      <style>{CSS}</style>

      {/* ── scroll progress — a neon hairline across the very top ── */}
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-neon"
        style={{ scaleX: scrollYProgress }}
      />

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

      {/* ── SCENE 1 — the full path ── */}
      <Scene
        img="/landing/scene-1.jpg"
        video="/landing/scene-1.mp4"
        eager
        id="scene-one"
        titleLines={TITLE_LINES}
        subtitle="From idea to community, talent, campaigns, funding, agents, and tokenized launch, NeuGrid gives anyone the full path to build, grow, and scale their own digital economy."
        cue
      />

      {/* ── SCENE 2 — the how ── */}
      <Scene
        img="/landing/scene-2.jpg"
        video="/landing/scene-2.mp4"
        id="scene-two"
        titleLines={[{ t: "Where communities" }, { t: "become economies.", accent: true }]}
        subtitle="Powered by Solana and ICP, NeuGrid lets communities form, coordinate, earn Pulse, launch SubGrids, activate talent, and evolve into on-chain economies."
        cta={
          <>
            <Link href="/home" className="ng-btn ng-btn-primary">Start building <IconArrowRight className="h-4 w-4" /></Link>
            <Link href="/markets" className="ng-btn ng-btn-ghost">See the markets</Link>
          </>
        }
      />

      {/* ── SCENE 3 — earn: proof-of-work becomes ownership ── */}
      <Scene
        img="/landing/scene-3.jpg"
        video="/landing/scene-3.mp4"
        id="scene-three"
        titleLines={[{ t: "Where work" }, { t: "becomes worth.", accent: true }]}
        subtitle="Every build, hire, and contribution earns Pulse — the on-chain reputation that turns proof-of-work into real ownership. Earned, never bought."
      />

      {/* ── SCENE 4 — transform: a community becomes an economy ── */}
      <Scene
        img="/landing/scene-4.jpg"
        video="/landing/scene-4.mp4"
        id="scene-four"
        titleLines={[{ t: "From spark" }, { t: "to full scale.", accent: true }]}
        subtitle="A community forms a Grid, spins up SubGrids, and activates talent and agents — then evolves into a living, self-sustaining on-chain economy."
      />

      {/* ── SCENE 5 — compose: programmable, verifiable, owned ── */}
      <Scene
        img="/landing/scene-5.jpg"
        video="/landing/scene-5.mp4"
        id="scene-five"
        titleLines={[{ t: "Composable. Verifiable." }, { t: "Yours.", accent: true }]}
        subtitle="Grids, credentials, markets, and agents interlock as programmable building blocks — settled on Solana and ICP, owned by the people who build them."
        cta={
          <>
            <Link href="/home" className="ng-btn ng-btn-primary">Start building <IconArrowRight className="h-4 w-4" /></Link>
            <Link href="/markets" className="ng-btn ng-btn-ghost">See the markets</Link>
          </>
        }
      />

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
