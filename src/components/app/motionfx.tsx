"use client";

/**
 * motionfx — shared Framer Motion primitives for the terminal UI.
 * Flat and fast: transform/opacity only, ~250ms ease-out, optional per-item
 * stagger via `delay`. Collapses to static under prefers-reduced-motion.
 */

import { motion, useReducedMotion } from "motion/react";

export function Rise({
  children, delay = 0, y = 10, className,
}: {
  children: React.ReactNode; delay?: number; y?: number; className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-32px 0px" }}
      transition={{ duration: 0.26, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
