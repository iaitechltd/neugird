"use client";

/**
 * Ventures "MISSION CONTROL" instrument kit — reusable sci-fi command-console
 * primitives, on the locked terminal aesthetic (pure #00ff00, #48f5ff accent,
 * radius 0, flat, no glow). Motion via Framer Motion (motion/react); everything
 * respects prefers-reduced-motion and animates transform/opacity only.
 */

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CountUp } from "./typefx";
import Meter from "./Meter";

const NEON = "#00ff00";
const CYAN = "#48f5ff";

/** A live status dot with an expanding ping ring. Amber/red = a caution/dead state
 *  (static, no ping — "a dead port doesn't breathe"). */
export function PulseDot({ tone = "neon", size = 6, className = "" }: { tone?: "neon" | "cyan" | "dim" | "amber" | "red"; size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ping = tone === "neon" || tone === "cyan"; // only healthy states breathe
  const c = tone === "cyan" ? CYAN : tone === "amber" ? "#ffb347" : tone === "red" ? "#ff6b6b" : NEON;
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      {ping && !reduce && (
        <motion.span className="absolute inset-0 rounded-full" style={{ background: c }}
          initial={{ opacity: 0.5, scale: 1 }} animate={{ opacity: 0, scale: 2.8 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} />
      )}
      <span className="relative block rounded-full" style={{ width: size, height: size, background: tone === "dim" ? "rgba(0,255,0,0.3)" : c }} />
    </span>
  );
}

/** A one-shot phosphor scan line that sweeps down a panel on mount (the boot feel). */
export function ScanSweep({ delay = 0, on = true }: { delay?: number; on?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce || !on) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-10 block h-px"
      style={{ background: "linear-gradient(90deg, transparent, rgba(0,255,0,0.55), transparent)" }}
      initial={{ y: "0%", opacity: 0 }}
      animate={{ y: ["0%", "9999%"], opacity: [0, 1, 0] }}
      transition={{ duration: 1.0, delay, ease: "easeInOut" }}
    />
  );
}

/** A labeled instrument readout — small caps label + big tabular count-up + optional LED meter. */
export function Readout({ label, value, unit, meter, tone = "neon", size = "md", suffix }: {
  label: string; value: number; unit?: string; meter?: { value: number; max: number }; tone?: "neon" | "cyan"; size?: "sm" | "md" | "lg"; suffix?: string;
}) {
  const vSize = size === "lg" ? "!text-3xl" : size === "sm" ? "!text-lg" : "!text-2xl";
  const col = tone === "cyan" ? "text-cyan" : "text-neon";
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.18em] text-ink-faint">{label}</div>
      <div className={`ng-stat__v ${vSize} leading-none ${col} tnum`}>
        <CountUp key={value} value={value} />
        {suffix}
        {unit && <span className="ml-0.5 text-[10px] text-ink-faint">{unit}</span>}
      </div>
      {meter && <div className="mt-1.5"><Meter value={meter.value} max={meter.max} w={72} color={tone === "cyan" ? CYAN : NEON} /></div>}
    </div>
  );
}

/** A framed block with a boot scan sweep + optional lit corner brackets. */
export function ConsoleFrame({ children, className = "", scanDelay = 0, scan = true, corners = false }: { children: ReactNode; className?: string; scanDelay?: number; scan?: boolean; corners?: boolean }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <ScanSweep delay={scanDelay} on={scan} />
      {corners && (
        <>
          <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-neon/60" />
          <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-neon/60" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-neon/60" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-neon/60" />
        </>
      )}
      {children}
    </div>
  );
}
