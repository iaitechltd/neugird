"use client";

/**
 * Meter — a segmented phosphor LED bar (EQ style), the terminal's answer to a
 * progress bar. value/max lights n of N segments; lit segments stagger-ignite
 * when they enter view, brightness ramps toward the head segment (which burns
 * full). Off segments stay as a faint track. Flat, radius 0.
 */

import { motion, useReducedMotion } from "motion/react";

export default function Meter({
  value, max, w = 44, color = "#00ff00", className = "",
}: {
  value: number; max: number; w?: number; color?: string; className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const N = Math.max(6, Math.round(w / 6)); // ~6px per LED
  const lit = pct > 0 ? Math.max(1, Math.round(pct * N)) : 0;
  const segW = 4, gap = 2, h = 9;
  const width = N * (segW + gap) - gap;
  return (
    <svg
      width={w}
      height={8}
      viewBox={`0 0 ${width} ${h}`}
      preserveAspectRatio="none"
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-hidden
    >
      {Array.from({ length: N }, (_, i) => {
        const on = i < lit;
        const head = on && i === lit - 1;
        const target = on ? (head ? 1 : 0.4 + (i / N) * 0.45) : 0.12;
        return (
          <motion.rect
            key={i}
            x={i * (segW + gap)}
            y={on ? 0 : 2}
            width={segW}
            height={on ? h : h - 4}
            fill={color}
            initial={reduce ? false : { opacity: 0.12 }}
            whileInView={{ opacity: target }}
            viewport={{ once: true }}
            transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.035, ease: "easeOut" }}
          />
        );
      })}
    </svg>
  );
}
