"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle Matrix digital-rain backdrop.
 * Fixed, behind all content, low opacity. Respects reduced-motion.
 * Spec page 11: "Dark grid, subtle Matrix rain, neural lines... scanning glows.
 * Avoid low-quality stock cyber backgrounds." — kept faint and purposeful.
 */
export default function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const glyphs = "01ﾊﾐﾋｰｳﾅﾐｱﾉｾｼﾈｿﾗｸﾘNEUGRID</>{}+=*".split("");
    const fontSize = 14;
    let columns = 0;
    let drops: number[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.floor(window.innerWidth / fontSize);
      drops = Array.from({ length: columns }, () =>
        Math.floor((Math.random() * -window.innerHeight) / fontSize)
      );
    }

    resize();

    let raf = 0;
    let last = 0;
    const interval = 70; // ms between frames — slow, calm rain

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      if (now - last < interval) return;
      last = now;
      if (!canvas || !ctx) return;

      // fade previous frame for trailing effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      ctx.font = `${fontSize}px var(--font-geist-mono), monospace`;
      for (let i = 0; i < drops.length; i++) {
        const char = glyphs[Math.floor(Math.random() * glyphs.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // occasional brighter "head" glyph
        if (Math.random() > 0.985) {
          ctx.fillStyle = "rgba(150, 255, 150, 0.6)";
        } else {
          ctx.fillStyle = "rgba(0, 255, 0, 0.18)";
        }
        ctx.fillText(char, x, y);

        if (y > window.innerHeight && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    if (!reduce) {
      raf = requestAnimationFrame(draw);
    }

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 opacity-40"
    />
  );
}
