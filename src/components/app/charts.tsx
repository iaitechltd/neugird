/** Neon SVG chart primitives for the NeuGrid HUD.
 *  Full accent palette (2026-07-03 founder call: "too green") — green stays the
 *  brand anchor, but series/charts rotate cyan/violet/amber/magenta so data
 *  surfaces read colorful. Candles keep the green/red trading convention.
 *  All scale to their container (width 100%) unless a fixed w is given.
 */

const NEON = "#00ff00";
const CYAN = "#48f5ff";
const AMBER = "#ffb020";
const RED = "#ff4d5e";
export const VIOLET = "#b388ff";
export const MAGENTA = "#ff5ecf";
export const SERIES = [NEON, "#7cf57c", CYAN, AMBER, RED]; // phosphor discipline — violet/magenta retired from rotation

// Round trig-derived coords to avoid SSR/CSR hydration mismatches:
// Math.sin/cos can differ in the last digit between Node's and Chrome's V8.
const r2 = (n: number) => Math.round(n * 100) / 100;

/* -------------------------------- Spark -------------------------------- */

export function Spark({ data, up = true, gid, w = 120, h = 38 }: { data: number[]; up?: boolean; gid: string; w?: number; h?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - ((d - min) / range) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const color = up ? NEON : RED;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={`spk-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spk-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ---------------------------- Area (line + grid) ----------------------- */

export function Area({ data, gid, color = NEON, w = 320, h = 120, labels }: { data: number[]; gid: string; color?: string; w?: number; h?: number; labels?: string[] }) {
  const pad = 6;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const X = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const Y = (d: number) => pad + (1 - (d - min) / range) * (h - pad * 2 - 12);
  const pts = data.map((d, i) => [X(i), Y(d)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${X(data.length - 1)} ${h - pad - 12} L${X(0)} ${h - pad - 12} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ar-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2 - 12)} y2={pad + g * (h - pad * 2 - 12)} stroke="rgba(0,255,0,0.08)" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#ar-${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
      {pts.map((p, i) => (i === pts.length - 1 ? <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={color} /> : null))}
      {labels && labels.map((l, i) => (
        <text key={l} x={X(Math.round((i / (labels.length - 1)) * (data.length - 1)))} y={h - 2} textAnchor="middle" fill="rgba(0,255,0,0.4)" style={{ fontSize: 8, fontFamily: "monospace" }}>{l}</text>
      ))}
    </svg>
  );
}

/* ------------------------- LineMulti (compare series) ------------------- */

export function LineMulti({ series, gid, w = 320, h = 120 }: { series: number[][]; gid: string; w?: number; h?: number }) {
  const pad = 6;
  const all = series.flat();
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;
  const X = (i: number, len: number) => pad + (i / (len - 1)) * (w - pad * 2);
  const Y = (d: number) => pad + (1 - (d - min) / range) * (h - pad * 2);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="rgba(0,255,0,0.07)" strokeWidth="1" />
      ))}
      {series.map((s, si) => {
        const color = SERIES[si % SERIES.length];
        const line = s.map((d, i) => `${i ? "L" : "M"}${X(i, s.length).toFixed(1)} ${Y(d).toFixed(1)}`).join(" ");
        return <path key={si} d={line} fill="none" stroke={color} strokeWidth="1.5" />;
      })}
    </svg>
  );
}

/* -------------------------------- Gauge -------------------------------- */

export function Gauge({ percent, value, w = 134, color = NEON }: { percent: number; value?: string; w?: number; color?: string }) {
  const r = 52;
  const cx = 65;
  const cy = 58;
  const sw = 5;
  const p = Math.max(0, Math.min(100, percent));
  const ang = Math.PI - (p / 100) * Math.PI;
  const ex = cx + r * Math.cos(ang);
  const ey = cy - r * Math.sin(ang);
  return (
    <svg width={w} height={w * 0.56} viewBox="0 0 130 72">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(0,255,0,0.12)" strokeWidth={sw} strokeLinecap="round" />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
       
      />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color} style={{ fontSize: 19, fontWeight: 700 }}>
        {value ?? `${p}%`}
      </text>
    </svg>
  );
}

/* ------------------------------ Ring (donut) --------------------------- */

export function Ring({ percent, label, value, size = 96, stroke = 8, color = NEON }: { percent: number; label?: string; value?: string; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent || 0)); // guard NaN/undefined → 0
  const off = c * (1 - p / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
       
      />
      <text x="50%" y={label ? "46%" : "52%"} textAnchor="middle" fill={color} style={{ fontSize: size * 0.2, fontWeight: 700 }}>{value ?? `${p}%`}</text>
      {label && <text x="50%" y="62%" textAnchor="middle" fill="rgba(0,255,0,0.45)" style={{ fontSize: size * 0.1, letterSpacing: 1, textTransform: "uppercase" }}>{label}</text>}
    </svg>
  );
}

/* -------------------------------- Bars --------------------------------- */

export function Bars({ data, w = 280, h = 70, color = NEON }: { data: number[]; w?: number; h?: number; color?: string }) {
  const max = Math.max(...data) || 1;
  const bw = w / data.length;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        // non-zero values keep a small floor so skewed data still reads as bars,
        // not one solid block; true zeros stay invisible.
        const bh = d > 0 ? Math.max(2.5, (d / max) * (h - 4)) : 0;
        return <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx="1" fill={color} opacity={0.45 + (d / max) * 0.55} />;
      })}
    </svg>
  );
}

/* ------------------------------- Radar --------------------------------- */

export function Radar({ axes, values, size = 150, color = NEON }: { axes: string[]; values: number[]; size?: number; color?: string }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const n = axes.length;
  const pt = (i: number, mag: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [r2(cx + Math.cos(a) * r * mag), r2(cy + Math.sin(a) * r * mag)];
  };
  const poly = values.map((v, i) => pt(i, Math.max(0, Math.min(1, v / 100)))).map((p) => p.join(",")).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon key={g} points={axes.map((_, i) => pt(i, g).join(",")).join(" ")} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,255,0,0.1)" strokeWidth="1" />; })}
      <polygon points={poly} fill={`${color}22`} stroke={color} strokeWidth="1.5" />
      {values.map((v, i) => { const [x, y] = pt(i, Math.max(0, Math.min(1, v / 100))); return <circle key={i} cx={x} cy={y} r="2" fill={color} />; })}
      {axes.map((a, i) => { const [x, y] = pt(i, 1.18); return <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="rgba(0,255,0,0.5)" style={{ fontSize: 7.5, fontFamily: "monospace", textTransform: "uppercase" }}>{a}</text>; })}
    </svg>
  );
}

/* ------------------------------ Heatmap -------------------------------- */

export function Heatmap({ rows = 7, cols = 16, data, cell = 11, gap = 3 }: { rows?: number; cols?: number; data?: number[]; cell?: number; gap?: number }) {
  const grid = data ?? Array.from({ length: rows * cols }, (_, i) => ((i * 37) % 100) / 100);
  const w = cols * (cell + gap);
  const h = rows * (cell + gap);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {grid.map((v, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return <rect key={i} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} rx="1.5" fill={NEON} opacity={0.08 + v * 0.85} />;
      })}
    </svg>
  );
}

/* ------------------------- NodeGraph (network) ------------------------- */

export function NodeGraph({ nodes = 9, gid, w = 300, h = 150 }: { nodes?: number; gid?: string; w?: number; h?: number }) {
  // deterministic pseudo-layout (no Math.random so SSR/CSR match)
  const pts = Array.from({ length: nodes }, (_, i) => {
    const a = (Math.PI * 2 * i) / nodes;
    const rad = 0.32 + ((i * 17) % 13) / 40;
    return [r2(w / 2 + Math.cos(a) * (w * 0.34) * rad * 1.6), r2(h / 2 + Math.sin(a) * (h * 0.34) * rad * 1.8)];
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < nodes; i++) {
    edges.push([i, (i + 1) % nodes]);
    if (i % 2 === 0) edges.push([i, (i + 3) % nodes]);
  }
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} key={gid}>
      {edges.map(([a, b], i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="rgba(0,255,0,0.18)" strokeWidth="1" />
      ))}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={i === 0 ? 5 : 3} fill={i === 0 ? CYAN : NEON} />
          {i === 0 && <circle cx={p[0]} cy={p[1]} r="8" fill="none" stroke={CYAN} strokeWidth="1" opacity="0.4" className="animate-ping" />}
        </g>
      ))}
    </svg>
  );
}

/* ----------------------- StackBars (stacked column) -------------------- */

export function StackBars({ data, h = 96 }: { data: { values: number[] }[]; h?: number }) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals) || 1;
  return (
    <div className="flex h-full items-end justify-between gap-1.5" style={{ height: h }}>
      {data.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
          {d.values.map((v, j) => (
            <div key={j} style={{ height: `${(v / max) * 100}%`, background: SERIES[j % SERIES.length], opacity: 0.85 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Candles (OHLC) -------------------------- */

export interface Candle { o: number; h: number; l: number; c: number; }
/** Neon candlestick chart. Green body when close ≥ open, red otherwise. */
export function Candles({ data, w = 640, h = 260 }: { data: Candle[]; w?: number; h?: number }) {
  if (!data.length) return null;
  const pad = 8;
  const max = Math.max(...data.map((d) => d.h));
  const min = Math.min(...data.map((d) => d.l));
  const range = max - min || 1;
  const Y = (v: number) => r2(pad + (1 - (v - min) / range) * (h - pad * 2));
  const cw = (w - pad * 2) / data.length;
  const bodyW = Math.max(1, cw * 0.5);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={r2(pad + g * (h - pad * 2))} y2={r2(pad + g * (h - pad * 2))} stroke="rgba(0,255,0,0.06)" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const x = r2(pad + i * cw + cw / 2);
        const up = d.c >= d.o;
        const color = up ? NEON : RED;
        const yO = Y(d.o), yC = Y(d.c);
        const top = Math.min(yO, yC);
        const bh = Math.max(1, Math.abs(yC - yO));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={Y(d.h)} y2={Y(d.l)} stroke={color} strokeWidth="1" opacity="0.75" />
            <rect x={r2(x - bodyW / 2)} y={top} width={r2(bodyW)} height={r2(bh)} fill={color} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}
