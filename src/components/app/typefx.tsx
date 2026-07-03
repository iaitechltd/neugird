"use client";

/**
 * Type / terminal motion primitives for the NeuGrid HUD.
 *  - Decrypt:   scrambles glyphs then resolves to the target string (great for headers + IDs)
 *  - Typewriter: types text char-by-char, optional blinking cursor
 *  - CountUp:    animates a number from 0 -> value with formatting
 *  - Cursor:     standalone blinking block cursor
 * All respect prefers-reduced-motion (resolve instantly).
 */

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!<>-_\\/[]{}=+*#%&";

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------- Decrypt ------------------------------- */

export function Decrypt({
  text,
  className,
  speed = 28,
  delay = 0,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const [out, setOut] = useState(text);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (prefersReduced()) { setOut(text); return; }
    let frame = 0;
    const start = -Math.round(delay / speed);
    frame = start;
    let timer = 0 as unknown as number;
    const tick = () => {
      const revealed = Math.max(0, frame);
      const next = text
        .split("")
        .map((ch, i) => {
          if (ch === " ") return " ";
          if (i < revealed) return ch;
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join("");
      setOut(next);
      if (frame >= text.length) return;
      frame += 0.5;
      timer = window.setTimeout(tick, speed);
    };
    tick();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const TagName = Tag as React.ElementType;
  return <TagName className={className}>{out}</TagName>;
}

/* ------------------------------ Typewriter ----------------------------- */

export function Typewriter({
  text,
  className,
  speed = 38,
  delay = 0,
  cursor = true,
  loop = false,
  pause = 1800,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  cursor?: boolean;
  loop?: boolean;
  pause?: number;
}) {
  const [out, setOut] = useState("");

  useEffect(() => {
    if (prefersReduced()) { setOut(text); return; }
    let i = 0;
    let dir = 1;
    let timer = 0 as unknown as number;
    const run = () => {
      i += dir;
      setOut(text.slice(0, Math.max(0, i)));
      if (dir > 0 && i >= text.length) {
        if (!loop) return;
        timer = window.setTimeout(() => { dir = -1; run(); }, pause);
        return;
      }
      if (dir < 0 && i <= 0) { dir = 1; }
      timer = window.setTimeout(run, dir > 0 ? speed : speed / 2);
    };
    const startTimer = window.setTimeout(run, delay);
    return () => { window.clearTimeout(timer); window.clearTimeout(startTimer); };
  }, [text, speed, delay, loop, pause]);

  return (
    <span className={className}>
      {out}
      {cursor && <Cursor />}
    </span>
  );
}

/* -------------------------------- Cursor ------------------------------- */

export function Cursor({ className = "" }: { className?: string }) {
  // thin flat terminal caret (2026-07-03: thinner + no glow per founder)
  return (
    <span
      aria-hidden
      className={`ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] bg-neon align-baseline animate-blink ${className}`}
    />
  );
}

/* -------------------------------- CountUp ------------------------------ */

export function CountUp({
  value,
  className,
  duration = 1100,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ",",
}: {
  value: number;
  className?: string;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
}) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (prefersReduced()) { setN(value); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !done.current) {
        done.current = true;
        const t0 = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(value * eased);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const fixed = n.toFixed(decimals);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {grouped}
      {dec ? `.${dec}` : ""}
      {suffix}
    </span>
  );
}
