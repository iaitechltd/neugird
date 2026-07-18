"use client";

/**
 * Ventures "REACTOR" visual language — the company drawn as a living reactor, not
 * a dashboard. A CEO core with specialist satellites, data flowing through conduits,
 * an energy ring for treasury/runway, and vital-signs waveforms instead of bar
 * charts. Locked terminal aesthetic (#00ff00 / #48f5ff, flat, no glow); motion via
 * native SVG animation (light + React-stable) wrapped in Framer for entrance.
 */

import { motion, useReducedMotion } from "motion/react";
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
  const reduce = useReducedMotion(); // honour "reduce motion" — render a still reactor, no SMIL churn
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
      initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ display: "block" }}>
      {/* energy ring — treasury / runway charge */}
      <circle cx={C} cy={C} r={Rring} fill="none" stroke="rgba(0,255,0,0.10)" strokeWidth={1} />
      <circle cx={C} cy={C} r={Rring} fill="none" stroke="rgba(0,255,0,0.20)" strokeWidth={6} strokeDasharray="1 11" />
      <circle cx={C} cy={C} r={Rring} fill="none" stroke={active ? CYAN : NEON} strokeWidth={2} strokeDasharray={`${charged.toFixed(1)} ${(circ - charged).toFixed(1)}`} transform={`rotate(-90 ${C} ${C})`}>
        {!reduce && <animateTransform attributeName="transform" type="rotate" from={`-90 ${C} ${C}`} to={`270 ${C} ${C}`} dur="42s" repeatCount="indefinite" />}
      </circle>
      {!compact && !reduce && (
        <line x1={C} y1={C} x2={C} y2={C - Rring + 8} stroke="rgba(0,255,0,0.26)" strokeWidth={1}>
          <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="7s" repeatCount="indefinite" />
        </line>
      )}

      {/* conduits — data flowing core → crew */}
      {sats.map((s, i) => {
        const p1 = pos(i, Rcore + 6), p2 = pos(i, Rsat - (compact ? 12 : 20));
        return (
          <line key={`c${i}`} x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)} x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke={active ? CYAN : NEON} strokeWidth={1.5} strokeDasharray="2 6" opacity={0.75}>
            {!reduce && <animate attributeName="stroke-dashoffset" from="0" to="-8" dur={active ? "0.4s" : `${(0.8 + i * 0.15).toFixed(2)}s`} repeatCount="indefinite" />}
          </line>
        );
      })}

      {/* the CORE — the CEO / company brain */}
      <circle cx={C} cy={C} r={Rcore - 5} fill="none" stroke="rgba(0,255,0,0.5)" strokeWidth={1} strokeDasharray="2 5">
        {!reduce && <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="12s" repeatCount="indefinite" />}
      </circle>
      <circle cx={C} cy={C} r={Rcore - 12} fill="none" stroke="rgba(0,255,0,0.4)" strokeWidth={1} strokeDasharray="1 6">
        {!reduce && <animateTransform attributeName="transform" type="rotate" from={`360 ${C} ${C}`} to={`0 ${C} ${C}`} dur="9s" repeatCount="indefinite" />}
      </circle>
      <polygon points={hexPoints(C, C, Rcore)} fill="rgba(0,255,0,0.05)" stroke={NEON} strokeWidth={1.5} />
      <circle cx={C} cy={C} r={4} fill={active ? CYAN : NEON}>
        {!reduce && <animate attributeName="opacity" values="1;0.3;1" dur={active ? "0.8s" : "1.5s"} repeatCount="indefinite" />}
      </circle>
      {!reduce && (
        <circle cx={C} cy={C} r={4} fill="none" stroke={active ? CYAN : NEON}>
          <animate attributeName="r" values="4;18" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      {!compact && <text x={C} y={C + 2} textAnchor="middle" fill={DIM} fontSize={7} fontFamily="ui-monospace,monospace" letterSpacing={1.5}>{coreLabel}</text>}

      {/* CREW satellites — mastery = the ring filling around each */}
      {sats.map((s, i) => {
        const p = pos(i, Rsat);
        const sinA = Math.sin(p.a);
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
              {!reduce && <animate attributeName="opacity" values="0.9;0.35;0.9" dur={`${(1.6 + i * 0.2).toFixed(2)}s`} repeatCount="indefinite" />}
            </circle>
            {!compact && (
              // top/bottom labels sit just OUTSIDE the energy ring (no collision); side
              // labels sit below their satellite (avoids clipping the viewBox edges).
              <text x={p.x.toFixed(1)} y={(sinA < -0.5 ? C - Rring - 8 : sinA > 0.5 ? C + Rring + 14 : p.y + mR + 12).toFixed(1)} textAnchor="middle" fill={col} fontSize={9} fontFamily="ui-monospace,monospace" letterSpacing={0.5}>{LABEL[s.dept] ?? s.dept.toUpperCase()}</text>
            )}
          </g>
        );
      })}
    </motion.svg>
  );
}

/** A scrolling vital-signs trace — the "activity signal" (replaces bar charts). */
export function Waveform({ color = NEON, height = 40, speed = 1.6, kind = "ekg", opacity = 1, className = "" }: { color?: string; height?: number; speed?: number; kind?: "ekg" | "sine"; opacity?: number; className?: string }) {
  const reduce = useReducedMotion(); // a still trace when the viewer prefers reduced motion
  return (
    <svg viewBox="0 0 440 40" width="100%" height={height} preserveAspectRatio="none" className={className} style={{ display: "block" }} aria-hidden>
      <g opacity={opacity}>
        {!reduce && <animateTransform attributeName="transform" type="translate" from="0 0" to="-110 0" dur={`${speed}s`} repeatCount="indefinite" />}
        <path d={kind === "ekg" ? EKG : SINE} fill="none" stroke={color} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

const EKG = (() => { let s = "M-110,20 "; for (let k = -1; k <= 5; k++) { const x = k * 110; s += `L${x},20 L${x + 34},20 L${x + 42},7 L${x + 50},33 L${x + 58},20 L${x + 110},20 `; } return s; })();
const SINE = (() => { let s = "M-110,20 "; for (let x = -110; x <= 560; x += 55) s += `Q${x + 14},9 ${x + 27},20 Q${x + 41},31 ${x + 55},20 `; return s; })();

/**
 * A per-subject vital-signs reading. Unlike a generic looping waveform, the trace is
 * DERIVED from `seed` (so each subject has its own stable, distinct signature) and its
 * liveliness scales with `activity` (0 → a near-flat resting line, 1 → a busy trace).
 * That makes it read as real telemetry — an idle crew member is visibly quiet, a busy
 * one is visibly active — instead of identical decoration. Static + hydration-stable.
 */
// Pure path builder (module scope so the mutable PRNG never touches render state).
// FNV-1a hash of the seed → a small LCG PRNG → a distinct, stable trace per seed.
function vitalPath(seed: string, activity: number, W: number, height: number): string {
  const mid = height / 2;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const a = Math.max(0, Math.min(1, activity));
  const amp = height * 0.34 * (0.24 + 0.76 * a); // idle → a gentle resting wave · active → tall + spiky
  const clamp = (y: number) => Math.max(1.2, Math.min(height - 1.2, y));
  const N = 32;
  let d = `M0,${mid.toFixed(1)}`;
  for (let i = 1; i <= N; i++) {
    const x = (i / N) * W;
    const spike = rnd() < 0.08 + 0.34 * a;          // busy subjects spike more often
    const y = mid + (spike ? (rnd() - 0.5) * 2 * amp : (rnd() - 0.5) * amp * 0.55);
    d += ` L${x.toFixed(1)},${clamp(y).toFixed(1)}`;
  }
  return d;
}

export function VitalTrace({ seed, activity = 0, active = false, height = 16, className = "" }: {
  seed: string; activity?: number; active?: boolean; height?: number; className?: string;
}) {
  const W = 200;
  const mid = height / 2;
  const a = Math.max(0, Math.min(1, activity));
  const d = vitalPath(seed, activity, W, height);
  const col = active ? CYAN : a > 0.02 ? NEON : "rgba(0,255,0,0.45)";
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={className} style={{ display: "block" }} aria-hidden>
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(0,255,0,0.12)" strokeWidth={0.5} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * A real filled area/line of a data series — the fleet's activity/output trend (not
 * decoration: `series` is actual numbers). Terminal phosphor with a faint baseline
 * grid and a bright cursor dot at the current value. Static + hydration-stable.
 */
export function AreaPulse({ series, height = 56, color = NEON, className = "" }: { series: number[]; height?: number; color?: string; className?: string }) {
  const W = 300, pad = 3;
  const data = series.length ? series : [0, 0];
  const max = Math.max(1, ...data), min = Math.min(0, ...data), range = (max - min) || 1;
  const X = (i: number) => (data.length <= 1 ? W : (i / (data.length - 1)) * W);
  const Y = (v: number) => height - pad - ((v - min) / range) * (height - 2 * pad);
  const line = data.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W.toFixed(1)},${height} L0,${height} Z`;
  const lx = X(data.length - 1), ly = Y(data[data.length - 1]);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={className} style={{ display: "block" }} aria-hidden>
      {[0.33, 0.66].map((f) => <line key={f} x1={0} y1={(height * f).toFixed(1)} x2={W} y2={(height * f).toFixed(1)} stroke="rgba(0,255,0,0.08)" strokeWidth={0.5} />)}
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r={2.6} fill={color} />
    </svg>
  );
}

/**
 * Labeled proportional telemetry rows — a compact comparison readout (economy, crew
 * throughput). Direct numbers on thin phosphor tracks; reads as instrumentation, not a
 * boxed bar chart. The tone-per-row keeps money vs. output legible without color-only meaning.
 */
export function ReadoutRows({ rows, unit = "", labelW = 70 }: { rows: { label: string; value: number; tone?: "neon" | "cyan" | "dim" }[]; unit?: string; labelW?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : Math.round(v).toLocaleString());
  const bar: Record<string, string> = { neon: "bg-neon", cyan: "bg-cyan", dim: "bg-ink-faint/50" };
  const txt: Record<string, string> = { neon: "text-neon", cyan: "text-cyan", dim: "text-ink-dim" };
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const tone = r.tone ?? "neon";
        return (
          <div key={r.label} className="flex items-center gap-2.5 text-[10px]">
            <span className="shrink-0 uppercase tracking-[0.1em] text-ink-faint" style={{ width: labelW }}>{r.label}</span>
            <span className="relative h-[3px] flex-1 bg-line/50">
              <span className={`absolute inset-y-0 left-0 ${bar[tone]}`} style={{ width: `${Math.max(2, Math.round((r.value / max) * 100))}%` }} />
            </span>
            <span className={`shrink-0 tnum ${txt[tone]}`} style={{ minWidth: 44, textAlign: "right" }}>{fmt(r.value)}{unit}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---- polar helpers for the radial instruments ---- */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180; // deg measured clockwise from 12 o'clock
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
const TONE: Record<string, string> = { neon: NEON, cyan: CYAN, dim: "rgba(0,255,0,0.4)" };

/** A radar/spider polygon — the SHAPE of a set of values (e.g. crew mastery per department). */
export function CrewRadar({ axes, size = 150 }: { axes: { label: string; value: number }[]; size?: number }) {
  const C = size / 2, R = size * 0.31, n = Math.max(3, axes.length);
  const max = Math.max(1, ...axes.map((a) => a.value));
  const at = (i: number, r: number) => polar(C, C, r, i * (360 / n));
  const grid = [0.34, 0.67, 1].map((f) => axes.map((_, i) => at(i, R * f).map((v) => v.toFixed(1)).join(",")).join(" "));
  const shape = axes.map((a, i) => at(i, R * (0.05 + 0.95 * (a.value / max))).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} style={{ display: "block" }} aria-hidden>
      {grid.map((g, i) => <polygon key={i} points={g} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth={0.5} />)}
      {axes.map((_, i) => { const [x, y] = at(i, R); return <line key={i} x1={C} y1={C} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(0,255,0,0.1)" strokeWidth={0.5} />; })}
      <polygon points={shape} fill={NEON} fillOpacity={0.14} stroke={NEON} strokeWidth={1.3} strokeLinejoin="round" />
      {axes.map((a, i) => { const [x, y] = at(i, R * (0.05 + 0.95 * (a.value / max))); return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={1.9} fill={NEON} />; })}
      {axes.map((a, i) => { const [x, y] = at(i, R + 12); return <text key={i} x={x.toFixed(1)} y={(y + 2.5).toFixed(1)} textAnchor="middle" fontSize={7} letterSpacing={0.5} fontFamily="ui-monospace,monospace" fill="rgba(0,255,0,0.6)">{a.label}</text>; })}
    </svg>
  );
}

/** A segmented donut ring with a big center readout — composition of a whole. */
export function ActivityRing({ segments, size = 126, centerValue, centerLabel = "events" }: { segments: { label: string; value: number; tone?: "neon" | "cyan" | "dim" }[]; size?: number; centerValue?: number | string; centerLabel?: string }) {
  const C = size / 2, R = size * 0.36, sw = size * 0.1;
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  const circ = 2 * Math.PI * R, gap = 2;
  const shown = segments.filter((s) => s.value > 0);
  // cumulative start offset per segment, computed purely (no render-time mutation)
  const offset = (i: number) => shown.slice(0, i).reduce((a, s) => a + (s.value / sum) * circ, 0);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} style={{ display: "block" }} aria-hidden>
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(0,255,0,0.07)" strokeWidth={sw} />
      {shown.map((s, i) => {
        const dash = (s.value / sum) * circ;
        return <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={TONE[s.tone ?? "neon"]} strokeWidth={sw} strokeDasharray={`${Math.max(0.5, dash - gap).toFixed(1)} ${(circ - Math.max(0.5, dash - gap)).toFixed(1)}`} strokeDashoffset={(-offset(i)).toFixed(1)} transform={`rotate(-90 ${C} ${C})`} />;
      })}
      <text x={C} y={C} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.22} fontWeight="bold" fontFamily="ui-monospace,monospace" fill={NEON}>{centerValue ?? sum}</text>
      <text x={C} y={C + size * 0.17} textAnchor="middle" fontSize={7} letterSpacing={1.2} fontFamily="ui-monospace,monospace" fill="rgba(0,255,0,0.5)">{centerLabel.toUpperCase()}</text>
    </svg>
  );
}

/** A 270° radial gauge — a single metric vs a "full" reference (e.g. treasury runway). */
export function RunwayArc({ value, max, size = 130, unit = "cyc", caption = "runway" }: { value: number; max: number; size?: number; unit?: string; caption?: string }) {
  const C = size / 2, R = size * 0.37, sw = size * 0.085;
  const frac = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const A0 = 225, SWEEP = 270;
  const low = frac < 0.25;
  const col = low ? CYAN : NEON;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height={size} style={{ display: "block" }} aria-hidden>
      <path d={arcPath(C, C, R, A0, A0 + SWEEP)} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth={sw} strokeLinecap="round" />
      {frac > 0 && <path d={arcPath(C, C, R, A0, A0 + SWEEP * frac)} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />}
      <text x={C} y={C - 1} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="bold" fontFamily="ui-monospace,monospace" fill={col}>{value}</text>
      <text x={C} y={C + size * 0.15} textAnchor="middle" fontSize={7.5} letterSpacing={1.5} fontFamily="ui-monospace,monospace" fill="rgba(0,255,0,0.55)">{unit.toUpperCase()}</text>
      <text x={C} y={C + size * 0.31} textAnchor="middle" fontSize={7} letterSpacing={1} fontFamily="ui-monospace,monospace" fill="rgba(0,255,0,0.4)">{caption.toUpperCase()}</text>
    </svg>
  );
}

/** Two cumulative trend lines over a shared timeline — flow A (solid) vs flow B (dashed). */
export function MoneyFlow({ inSeries, outSeries, height = 66 }: { inSeries: number[]; outSeries: number[]; height?: number }) {
  const W = 300, pad = 4;
  const max = Math.max(1, ...inSeries, ...outSeries);
  const xy = (s: number[]) => { const n = Math.max(1, s.length); return s.map((v, i) => [n <= 1 ? W : (i / (n - 1)) * W, height - pad - (v / max) * (height - 2 * pad)] as [number, number]); };
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const ip = xy(inSeries), op = xy(outSeries);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
      <line x1={0} y1={(height / 2).toFixed(1)} x2={W} y2={(height / 2).toFixed(1)} stroke="rgba(0,255,0,0.08)" strokeWidth={0.5} />
      <path d={`${line(ip)} L${W},${height} L0,${height} Z`} fill={CYAN} opacity={0.1} />
      <path d={line(op)} fill="none" stroke={NEON} strokeWidth={1.3} strokeDasharray="3 2.5" vectorEffect="non-scaling-stroke" />
      <path d={line(ip)} fill="none" stroke={CYAN} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {ip.length > 0 && <circle cx={ip[ip.length - 1][0].toFixed(1)} cy={ip[ip.length - 1][1].toFixed(1)} r={2.4} fill={CYAN} />}
      {op.length > 0 && <circle cx={op[op.length - 1][0].toFixed(1)} cy={op[op.length - 1][1].toFixed(1)} r={2.4} fill={NEON} />}
    </svg>
  );
}

/** Money-flow waterfall — a reactor-native staircase: inflows build up, the outflow
 *  drops, and the final total settles at the treasury balance. Amounts sit beneath. */
export function FlowWaterfall({ steps, height = 74 }: { steps: { label: string; value: number; kind: "in" | "out" | "total" }[]; height?: number }) {
  const bars: { from: number; to: number; kind: string }[] = [];
  let run = 0;
  for (const s of steps) {
    if (s.kind === "total") { bars.push({ from: 0, to: s.value, kind: s.kind }); }
    else { const from = run; run += s.kind === "out" ? -Math.abs(s.value) : Math.abs(s.value); bars.push({ from, to: run, kind: s.kind }); }
  }
  const max = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
  const n = Math.max(1, bars.length);
  const W = 120, pad = 3;
  const col = (k: string) => (k === "total" ? NEON : k === "out" ? "#ff8b8b" : CYAN);
  const yAt = (v: number) => height - pad - (Math.max(0, v) / max) * (height - 2 * pad);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        {bars.map((b, i) => {
          const slot = W / n, bw = slot * 0.5, x = slot * i + (slot - bw) / 2;
          const yTop = Math.min(yAt(b.from), yAt(b.to)), h = Math.max(1.5, Math.abs(yAt(b.from) - yAt(b.to)));
          const c = col(b.kind);
          return (
            <g key={i}>
              <rect x={x.toFixed(1)} y={yTop.toFixed(1)} width={bw.toFixed(1)} height={h.toFixed(1)} fill={c} fillOpacity={0.55} stroke={c} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              {i < n - 1 && <line x1={(x + bw).toFixed(1)} x2={(slot * (i + 1) + (slot - bw) / 2).toFixed(1)} y1={yAt(b.to).toFixed(1)} y2={yAt(b.to).toFixed(1)} stroke="rgba(0,255,0,0.22)" strokeWidth={0.8} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex">
        {steps.map((s) => (
          <div key={s.label} className="min-w-0 flex-1 text-center">
            <div className="tnum text-[10.5px] font-bold leading-none" style={{ color: col(s.kind) }}>{Math.round(s.value).toLocaleString()}<span className="ml-0.5 text-[7px] text-ink-faint">g</span></div>
            <div className="mt-0.5 truncate text-[7.5px] uppercase tracking-[0.08em] text-ink-faint">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
