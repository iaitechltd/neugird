/**
 * Header Pulse monitor — the EKG trace with a bright blip sweeping left → right
 * (the original design), now DRIVEN by the user's actual Pulse: a high score
 * sweeps fast and green (racing heart), a low one crawls, and near-zero reads
 * as a slow amber/red hospital flatline. Value centered on the wave.
 */
const EKG =
  "M0 24 H118 l7 -13 l8 27 l6 -21 l7 11 H300 l7 -9 l6 15 l5 -7 H460";

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function PulseMonitor({ value = 0 }: { value?: number }) {
  const v = Math.max(0, value);
  // heart rate from Pulse: 0 → ~18bpm (dying crawl) · 100 → ~110 · 1000+ → racing
  const bpm = Math.round(Math.min(168, 18 + 46 * Math.log10(1 + v)));
  // sweep speed: calm and readable — a high pulse is energetic (~1.75s), the old
  // baseline feel sits mid-range (~2.9s at a few hundred), near-zero crawls (~7s)
  // (×1.1 = the founder's "10% slower" tune, 2026-07-09)
  const sweepSec = r2(1.1 * Math.max(1.5, 6.5 - 1.5 * Math.log10(1 + v)));
  // phosphor discipline: red = critical, amber = weak, green = alive
  const color = v < 40 ? "#ff4d5e" : v < 200 ? "#ffb020" : "#00ff00";

  return (
    <div className="relative flex h-11 w-[460px] items-center justify-center" title={`Pulse ${v} · ${bpm} bpm`}>
      <svg viewBox="0 0 460 48" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* faint full trace */}
        <path d={EKG} fill="none" stroke={color} strokeOpacity="0.2" strokeWidth="1.5" />
        {/* bright sweeping blip — speed = the user's heart rate */}
        <path
          d={EKG}
          fill="none"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength={1}
          className="pulse-sweep"
          style={{ "--sweep-dur": `${sweepSec}s`, filter: `drop-shadow(0 0 5px ${color})` } as React.CSSProperties}
        />
      </svg>
      <span
        className="relative z-10 px-3 text-2xl font-bold tabular-nums tracking-tight text-glow"
        style={{ color, background: "radial-gradient(closest-side, var(--ng-bg) 62%, transparent)" }}
      >
        {v}
      </span>
      <span className="absolute bottom-0 right-1.5 z-10 text-[8px] tabular-nums text-ink-faint">{bpm} bpm</span>
    </div>
  );
}
