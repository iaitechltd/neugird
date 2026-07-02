/**
 * EKG-style pulse waveform used either side of the header Pulse score.
 * Flat baseline with a heartbeat spike; neon green with a soft glow.
 */
export default function PulseWave({
  className = "",
  flip = false,
  width = 220,
}: {
  className?: string;
  flip?: boolean;
  width?: number;
}) {
  return (
    <svg
      className={className}
      width={width}
      height={28}
      viewBox="0 0 220 28"
      fill="none"
      aria-hidden
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M0 14 H120 l6 -10 l6 20 l5 -16 l6 10 H220"
        stroke="var(--ng-neon)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 4px rgba(0,255,136,0.7))" }}
      />
    </svg>
  );
}
