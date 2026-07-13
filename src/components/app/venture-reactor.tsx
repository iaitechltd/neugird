"use client";

/**
 * Ventures "REACTOR" visual language — the company drawn as a living reactor, not
 * a dashboard. A CEO core with specialist satellites, data flowing through conduits,
 * an energy ring for treasury/runway, and vital-signs waveforms instead of bar
 * charts. Locked terminal aesthetic (#00ff00 / #48f5ff, flat, no glow); motion via
 * native SVG animation (light + React-stable) wrapped in Framer for entrance.
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";

const NEON = "#00ff00";
const CYAN = "#48f5ff";
const DIM = "rgba(0,255,0,0.32)";

const LABEL: Record<string, string> = { marketing: "MARKET", content: "CONTENT", finance: "FINANCE", build: "BUILD", ceo: "CEO" };

export type ReactorSeat = { dept: string; tool?: string | null; mastery?: number; status?: string };

function hexPoints(cx: number, cy: number, r: number): string {
  return [0, 60, 120, 180, 240, 300].map((d) => { const a = (d * Math.PI) / 180; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
}

/** The company as a living reactor. `active` = a cycle is running (energy surges). */
export function VentureReactor({ seats, active = false, energyPct = 100, compact = false, coreLabel = "CEO", className = "" }: {
  seats: ReactorSeat[]; active?: boolean; energyPct?: number; compact?: boolean; coreLabel?: string; className?: string;
}) {
  const sats = seats.filter((s) => s.dept !== "ceo");
  const n = Math.max(1, sats.length);
  const C = 150;
  const Rsat = compact ? 80 : 94;
  const Rcore = compact ? 26 : 34;
  const Rring = compact ? 108 : 120;
  const maxMastery = Math.max(1, ...sats.map((s) => s.mastery ?? 0));
  const circ = 2 * Math.PI * Rring;
  const charged = Math.max(0.04, Math.min(1, energyPct / 100)) * circ;
  const pos = (i: number, r: number) => { const a = ((-90 + i * (360 / n)) * Math.PI) / 180; return { x: C + r * Math.cos(a), y: C + r * Math.sin(a), a }; };

  return (
    <motion.svg viewBox="0 0 300 300" width="100%" className={className} role="img" aria-label="Company reactor"
      initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ display: "block" }}>
      {/* energy ring — treasury / runway charge */}
      <circle cx={C} cy={C} r={Rring} fill="none" stroke="rgba(0,255,0,0.10)" strokeWidth={1} />
      <circle cx={C} cy={C} r={Rring} fill="none" stroke="rgba(0,255,0,0.20)" strokeWidth={6} strokeDasharray="1 11" />
      <circle cx={C} cy={C} r={Rring} fill="none" stroke={active ? CYAN : NEON} strokeWidth={2} strokeDasharray={`${charged.toFixed(1)} ${(circ - charged).toFixed(1)}`} transform={`rotate(-90 ${C} ${C})`}>
        <animateTransform attributeName="transform" type="rotate" from={`-90 ${C} ${C}`} to={`270 ${C} ${C}`} dur="42s" repeatCount="indefinite" />
      </circle>
      {!compact && (
        <line x1={C} y1={C} x2={C} y2={C - Rring + 8} stroke="rgba(0,255,0,0.26)" strokeWidth={1}>
          <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="7s" repeatCount="indefinite" />
        </line>
      )}

      {/* conduits — data flowing core → crew */}
      {sats.map((s, i) => {
        const p1 = pos(i, Rcore + 6), p2 = pos(i, Rsat - (compact ? 12 : 20));
        return (
          <line key={`c${i}`} x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)} x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke={active ? CYAN : NEON} strokeWidth={1.5} strokeDasharray="2 6" opacity={0.75}>
            <animate attributeName="stroke-dashoffset" from="0" to="-8" dur={active ? "0.4s" : `${(0.8 + i * 0.15).toFixed(2)}s`} repeatCount="indefinite" />
          </line>
        );
      })}

      {/* the CORE — the CEO / company brain */}
      <circle cx={C} cy={C} r={Rcore - 5} fill="none" stroke="rgba(0,255,0,0.5)" strokeWidth={1} strokeDasharray="2 5">
        <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="12s" repeatCount="indefinite" />
      </circle>
      <circle cx={C} cy={C} r={Rcore - 12} fill="none" stroke="rgba(0,255,0,0.4)" strokeWidth={1} strokeDasharray="1 6">
        <animateTransform attributeName="transform" type="rotate" from={`360 ${C} ${C}`} to={`0 ${C} ${C}`} dur="9s" repeatCount="indefinite" />
      </circle>
      <polygon points={hexPoints(C, C, Rcore)} fill="rgba(0,255,0,0.05)" stroke={NEON} strokeWidth={1.5} />
      <circle cx={C} cy={C} r={4} fill={active ? CYAN : NEON}>
        <animate attributeName="opacity" values="1;0.3;1" dur={active ? "0.8s" : "1.5s"} repeatCount="indefinite" />
      </circle>
      <circle cx={C} cy={C} r={4} fill="none" stroke={active ? CYAN : NEON}>
        <animate attributeName="r" values="4;18" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
      </circle>
      {!compact && <text x={C} y={C + 2} textAnchor="middle" fill={DIM} fontSize={7} fontFamily="ui-monospace,monospace" letterSpacing={1.5}>{coreLabel}</text>}

      {/* CREW satellites — mastery = the ring filling around each */}
      {sats.map((s, i) => {
        const p = pos(i, Rsat);
        const top = Math.sin(p.a) < -0.1;
        const dim = compact ? 13 : 20;
        const mR = dim / 2 + 5;
        const mCirc = 2 * Math.PI * mR;
        const mFrac = Math.min(1, (s.mastery ?? 0) / maxMastery);
        const col = active ? CYAN : NEON;
        return (
          <g key={`s${i}`}>
            {(s.mastery ?? 0) > 0 && (
              <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={mR} fill="none" stroke={NEON} strokeWidth={1.5} strokeDasharray={`${(mFrac * mCirc).toFixed(1)} ${mCirc.toFixed(1)}`} transform={`rotate(-90 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} opacity={0.55} />
            )}
            <rect x={(p.x - dim / 2).toFixed(1)} y={(p.y - dim / 2).toFixed(1)} width={dim} height={dim} fill={active ? "rgba(72,245,255,0.06)" : "rgba(0,255,0,0.06)"} stroke={col} strokeWidth={1.2} transform={`rotate(45 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`} />
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={compact ? 2 : 2.6} fill={col}>
              <animate attributeName="opacity" values="0.9;0.35;0.9" dur={`${(1.6 + i * 0.2).toFixed(2)}s`} repeatCount="indefinite" />
            </circle>
            {!compact && (
              <text x={p.x.toFixed(1)} y={top ? (p.y - mR - 7).toFixed(1) : (p.y + mR + 12).toFixed(1)} textAnchor="middle" fill={col} fontSize={9} fontFamily="ui-monospace,monospace" letterSpacing={0.5}>{LABEL[s.dept] ?? s.dept.toUpperCase()}</text>
            )}
          </g>
        );
      })}
    </motion.svg>
  );
}

/** A scrolling vital-signs trace — the "activity signal" (replaces bar charts). */
export function Waveform({ color = NEON, height = 40, speed = 1.6, kind = "ekg", opacity = 1, className = "" }: { color?: string; height?: number; speed?: number; kind?: "ekg" | "sine"; opacity?: number; className?: string }) {
  return (
    <svg viewBox="0 0 440 40" width="100%" height={height} preserveAspectRatio="none" className={className} style={{ display: "block" }} aria-hidden>
      <g opacity={opacity}>
        <animateTransform attributeName="transform" type="translate" from="0 0" to="-110 0" dur={`${speed}s`} repeatCount="indefinite" />
        <path d={kind === "ekg" ? EKG : SINE} fill="none" stroke={color} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

const EKG = (() => { let s = "M-110,20 "; for (let k = -1; k <= 5; k++) { const x = k * 110; s += `L${x},20 L${x + 34},20 L${x + 42},7 L${x + 50},33 L${x + 58},20 L${x + 110},20 `; } return s; })();
const SINE = (() => { let s = "M-110,20 "; for (let x = -110; x <= 560; x += 55) s += `Q${x + 14},9 ${x + 27},20 Q${x + 41},31 ${x + 55},20 `; return s; })();

/** Inline glanceable telemetry — a reading, not a boxed stat card. */
export function Telemetry({ label, value, unit, tone = "neon", big = false }: { label: string; value: ReactNode; unit?: string; tone?: "neon" | "cyan"; big?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[8px] uppercase tracking-[0.15em] text-ink-faint">{label}</span>
      <span className={`tnum leading-none ${big ? "text-[18px]" : "text-[15px]"} ${tone === "cyan" ? "text-cyan" : "text-neon"}`}>{value}</span>
      {unit && <span className="text-[8px] text-ink-faint">{unit}</span>}
    </span>
  );
}
