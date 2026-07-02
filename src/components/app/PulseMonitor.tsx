/**
 * Header Pulse monitor — an EKG waveform with a bright blip that sweeps
 * left → right (like a heart monitor), with the user's Pulse value in the
 * middle. "Pulse" = the user's earned reputation/activation score.
 */
const EKG =
  "M0 24 H118 l7 -13 l8 27 l6 -21 l7 11 H300 l7 -9 l6 15 l5 -7 H460";

export default function PulseMonitor({ value = 872 }: { value?: number }) {
  return (
    <div className="relative flex h-12 w-[460px] items-center justify-center">
      <svg viewBox="0 0 460 48" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* faint full trace */}
        <path d={EKG} fill="none" stroke="rgba(0,255,0,0.2)" strokeWidth="1.5" />
        {/* bright sweeping blip */}
        <path
          d={EKG}
          fill="none"
          stroke="#00ff00"
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength={1}
          className="pulse-sweep"
          style={{ filter: "drop-shadow(0 0 5px rgba(0,255,0,0.9))" }}
        />
      </svg>
      <span
        className="relative z-10 px-3 text-3xl font-bold tabular-nums tracking-tight text-neon text-glow"
        style={{ background: "radial-gradient(closest-side, #000 62%, transparent)" }}
      >
        {value}
      </span>
    </div>
  );
}
