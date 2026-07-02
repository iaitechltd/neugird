/**
 * Matrix-style generative identity art — replaces all photographic avatars/media
 * so every human + agent reads as neon/hacky and on-platform.
 * Fully deterministic from a seed string (no Math.random / Date) → SSR-safe,
 * and the same person looks identical across pages.
 */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ACCENTS = ["#00ff00", "#00ff00", "#00ff00", "#48f5ff", "#a78bfa"]; // mostly green

/** Circular (or rounded) neon identicon avatar. */
export function MatrixAvatar({
  seed,
  size = 40,
  shape = "circle",
  className = "",
  ring = true,
}: {
  seed: string;
  size?: number;
  shape?: "circle" | "square";
  className?: string;
  ring?: boolean;
}) {
  const h = hash(seed || "node");
  const color = ACCENTS[h % ACCENTS.length];
  // 5x5 symmetric grid (mirror left 3 cols)
  const lit: [number, number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const bit = (h >> (y * 3 + x)) & 1;
      if (bit) {
        const op = 0.55 + ((h >> (x + y)) & 3) * 0.15;
        lit.push([x, y, op]);
        if (x < 2) lit.push([4 - x, y, op]);
      }
    }
  }
  const radius = shape === "circle" ? "9999px" : "26%";
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        boxShadow: ring ? `0 0 0 1px ${color}55, 0 0 12px -4px ${color}` : undefined,
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="#041109" />
        <rect width="100" height="100" fill={color} opacity="0.05" />
        {lit.map(([x, y, op], i) => (
          <rect key={i} x={10 + x * 16} y={10 + y * 16} width="13" height="13" rx="2" fill={color} opacity={op} />
        ))}
        {/* faint scan rows for a hacky read */}
        <rect x="0" y="33" width="100" height="1" fill={color} opacity="0.12" />
        <rect x="0" y="66" width="100" height="1" fill={color} opacity="0.12" />
      </svg>
    </span>
  );
}

/** Full-bleed neon "cover" — a deterministic identity image that FILLS its
 *  container (any aspect ratio) edge-to-edge. For portrait masonry tiles. */
export function MatrixCover({ seed, className = "" }: { seed: string; className?: string }) {
  const h = hash(seed || "node");
  const color = ACCENTS[h % ACCENTS.length];
  const cols = 12, rows = 16;
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const on = ((h >> (i % 31)) ^ (i * 2654435761)) & 1;
    const bright = (i * 97 + h) % 23 === 0;
    if (on || bright) {
      cells.push(
        <rect
          key={i}
          x={(i % cols) * (100 / cols)}
          y={Math.floor(i / cols) * (100 / rows)}
          width={100 / cols - 0.5}
          height={100 / rows - 0.5}
          fill={bright ? "#b6ffce" : color}
          opacity={bright ? 0.85 : 0.14 + ((i + h) % 5) * 0.09}
        />,
      );
    }
  }
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <rect width="100" height="100" fill="#04120a" />
        {cells}
      </svg>
    </div>
  );
}

/** Wide neon "data still" — replaces photographic post/media images. */
export function MatrixThumb({ seed, className = "", height }: { seed: string; className?: string; height?: number }) {
  const h = hash(seed || "media");
  const color = ACCENTS[h % ACCENTS.length];
  const cols = 22, rows = 10;
  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const on = ((h >> (i % 31)) ^ (i * 2654435761)) & 1;
    const bright = (i * 97 + h) % 17 === 0;
    if (on || bright) {
      cells.push(
        <rect
          key={i}
          x={(i % cols) * (100 / cols)}
          y={Math.floor(i / cols) * (100 / rows)}
          width={100 / cols - 0.6}
          height={100 / rows - 0.6}
          fill={bright ? "#b6ffce" : color}
          opacity={bright ? 0.9 : 0.18 + ((i + h) % 5) * 0.1}
        />
      );
    }
  }
  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg ${className}`}
      style={{ height: height ?? undefined, aspectRatio: height ? undefined : "16 / 9", boxShadow: "inset 0 0 0 1px rgba(0,255,0,0.08)" }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 56" preserveAspectRatio="none">
        <rect width="100" height="56" fill="#04120a" />
        <g transform="scale(1,0.56)">{cells}</g>
        <rect x="0" y="0" width="100" height="56" fill="url(#mt-fade)" />
        <defs>
          <linearGradient id="mt-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#04120a" stopOpacity="0" />
            <stop offset="1" stopColor="#04120a" stopOpacity="0.5" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
