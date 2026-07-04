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

export function LineMulti({ series, gid, w = 320, h = 120, colors }: { series: number[][]; gid: string; w?: number; h?: number; colors?: string[] }) {
  const pad = 6;
  const all = series.flat();
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;
  const X = (i: number, len: number) => pad + (i / (len - 1)) * (w - pad * 2);
  const Y = (d: number) => pad + (1 - (d - min) / range) * (h - pad * 2);
  return (
    <svg key={gid} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0, 0.5, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="rgba(0,255,0,0.07)" strokeWidth="1" />
      ))}
      {series.map((s, si) => {
        const color = colors?.[si] ?? SERIES[si % SERIES.length];
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

/* --------------------------------- Pie --------------------------------- */

export function Pie({ data, size = 96, colors, gap = 1.5 }: { data: { value: number; label?: string }[]; size?: number; colors?: string[]; gap?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  // cumulative start/end fractions precomputed (no mutation during render)
  const segs = data.map((d, i) => {
    const before = data.slice(0, i).reduce((s, x) => s + x.value, 0);
    return { value: d.value, start: before / total, end: (before + d.value) / total };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segs.map((seg, i) => {
        if (seg.value <= 0) return null;
        const color = colors?.[i] ?? SERIES[i % SERIES.length];
        if (seg.end - seg.start >= 0.999) return <circle key={i} cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.85} />;
        const a0 = seg.start * Math.PI * 2 - Math.PI / 2, a1 = seg.end * Math.PI * 2 - Math.PI / 2;
        const large = seg.end - seg.start > 0.5 ? 1 : 0;
        const x0 = r2(cx + r * Math.cos(a0)), y0 = r2(cy + r * Math.sin(a0));
        const x1 = r2(cx + r * Math.cos(a1)), y1 = r2(cy + r * Math.sin(a1));
        return <path key={i} d={`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`} fill={color} fillOpacity={0.85} stroke="#050a05" strokeWidth={gap} />;
      })}
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

export function StackBars({ data, h = 96, colors }: { data: { values: number[] }[]; h?: number; colors?: string[] }) {
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(...totals) || 1;
  return (
    <div className="flex h-full items-end justify-between gap-1.5" style={{ height: h }}>
      {data.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
          {d.values.map((v, j) => (
            <div key={j} style={{ height: `${(v / max) * 100}%`, background: colors?.[j] ?? SERIES[j % SERIES.length], opacity: 0.85 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* --------------------- RadialBars (polar bar burst) -------------------- */

export function RadialBars({ data, size = 150, color = NEON, labels }: { data: number[]; size?: number; color?: string; labels?: string[] }) {
  const cx = size / 2, cy = size / 2;
  const inner = size * 0.17, outer = size * 0.45;
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length);
  const sw = Math.max(2.5, ((2 * Math.PI * inner) / n) * 0.5);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[inner, (inner + outer) / 2, outer].map((rr, k) => (
        <circle key={k} cx={cx} cy={cy} r={r2(rr)} fill="none" stroke="rgba(0,255,0,0.08)" strokeWidth="1" />
      ))}
      {data.map((v, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const len = inner + (v / max) * (outer - inner);
        return <line key={i} x1={r2(cx + Math.cos(a) * inner)} y1={r2(cy + Math.sin(a) * inner)} x2={r2(cx + Math.cos(a) * len)} y2={r2(cy + Math.sin(a) * len)} stroke={color} strokeWidth={r2(sw)} strokeLinecap="round" opacity={0.5 + (v / max) * 0.5} />;
      })}
      {labels?.map((l, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        return <text key={l + i} x={r2(cx + Math.cos(a) * (outer + 9))} y={r2(cy + Math.sin(a) * (outer + 9))} textAnchor="middle" dominantBaseline="middle" fill="rgba(0,255,0,0.5)" style={{ fontSize: 6.5, fontFamily: "monospace" }}>{l}</text>;
      })}
    </svg>
  );
}

/* ------------------ ConcentricRings (nested activity) ------------------ */

export function ConcentricRings({ rings, size = 150 }: { rings: { pct: number; color?: string }[]; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const stroke = Math.max(5, size * 0.075);
  const gap = stroke * 0.5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((rg, i) => {
        const r = size / 2 - 3 - i * (stroke + gap);
        if (r < stroke) return null;
        const c = 2 * Math.PI * r;
        const p = Math.max(0, Math.min(100, rg.pct || 0));
        const col = rg.color ?? SERIES[i % SERIES.length];
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r2(r)} fill="none" stroke="rgba(0,255,0,0.08)" strokeWidth={r2(stroke)} />
            <circle cx={cx} cy={cy} r={r2(r)} fill="none" stroke={col} strokeWidth={r2(stroke)} strokeLinecap="round" strokeDasharray={r2(c)} strokeDashoffset={r2(c * (1 - p / 100))} transform={`rotate(-90 ${cx} ${cy})`} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------- Bubble (cloud) --------------------------- */

export function Bubble({ data, w = 300, h = 140 }: { data: { value: number; label?: string; color?: string }[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const r = 7 + Math.sqrt(d.value / max) * (Math.min(w, h) * 0.17);
        const x = r2(((i + 0.5) / n) * (w - 20) + 10);
        const y = r2(h / 2 + Math.sin(i * 1.7 + 0.5) * (h * 0.24));
        const col = d.color ?? SERIES[i % SERIES.length];
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r2(r)} fill={col} fillOpacity={0.16} stroke={col} strokeWidth="1.3" />
            {d.label && r > 11 && <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={col} style={{ fontSize: 7, fontFamily: "monospace" }}>{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/* --------------------- DivergingBars (movers ±) ------------------------ */

export function DivergingBars({ data, w = 280, h = 66 }: { data: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d)));
  const mid = h / 2;
  const n = Math.max(1, data.length);
  const bw = w / n;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="rgba(0,255,0,0.18)" strokeWidth="1" />
      {data.map((d, i) => {
        const up = d >= 0;
        const bh = Math.max(1.5, (Math.abs(d) / max) * (mid - 3));
        return <rect key={i} x={r2(i * bw + bw * 0.2)} y={r2(up ? mid - bh : mid)} width={r2(bw * 0.6)} height={r2(bh)} rx="1" fill={up ? NEON : RED} opacity={0.85} />;
      })}
    </svg>
  );
}

/* -------------------------- Depth (order book) ------------------------- */

export function Depth({ bids, asks, w = 300, h = 96, gid = "dpt" }: { bids: number[]; asks: number[]; w?: number; h?: number; gid?: string }) {
  // bids/asks = REAL cumulative base depth from the mid price outward (index 0 = at mid)
  const max = Math.max(1, ...bids, ...asks);
  const mid = w / 2;
  const nB = Math.max(1, bids.length - 1), nA = Math.max(1, asks.length - 1);
  const yAt = (v: number) => r2(h - (v / max) * (h - 6));
  const bid = bids.map((v, i) => `${r2(mid - (i / nB) * (mid - 3))} ${yAt(v)}`);
  const ask = asks.map((v, i) => `${r2(mid + (i / nA) * (mid - 3))} ${yAt(v)}`);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`dpt-b-${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NEON} stopOpacity="0.32" /><stop offset="1" stopColor={NEON} stopOpacity="0.02" /></linearGradient>
        <linearGradient id={`dpt-a-${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={RED} stopOpacity="0.32" /><stop offset="1" stopColor={RED} stopOpacity="0.02" /></linearGradient>
      </defs>
      <path d={`M ${mid} ${h} L ${bid.join(" L ")} L ${r2(mid - (mid - 3))} ${h} Z`} fill={`url(#dpt-b-${gid})`} stroke={NEON} strokeWidth="1.3" />
      <path d={`M ${mid} ${h} L ${ask.join(" L ")} L ${r2(mid + (mid - 3))} ${h} Z`} fill={`url(#dpt-a-${gid})`} stroke={RED} strokeWidth="1.3" />
      <line x1={mid} y1="0" x2={mid} y2={h} stroke="rgba(0,255,0,0.22)" strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  );
}

/* ---------------------------- Beeswarm (dots) -------------------------- */

export function Beeswarm({ data, w = 300, h = 92, color = NEON }: { data: { value: number; size?: number; color?: string }[]; w?: number; h?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sizeMax = Math.max(1, ...data.map((d) => d.size ?? 1));
  const pad = 10;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <line x1={pad} x2={w - pad} y1={r2(h - 7)} y2={r2(h - 7)} stroke="rgba(0,255,0,0.15)" strokeWidth="1" />
      {data.map((d, i) => {
        const x = r2(pad + (d.value / max) * (w - pad * 2));
        const y = r2(h / 2 - 3 + Math.sin(i * 2.399963) * (h * 0.32));
        const r = r2(2.5 + Math.sqrt((d.size ?? 1) / sizeMax) * 5);
        const col = d.color ?? color;
        return <circle key={i} cx={x} cy={y} r={r} fill={col} fillOpacity={0.5} stroke={col} strokeWidth="0.8" />;
      })}
    </svg>
  );
}

/* ------------------------- PolarArea (rose) ---------------------------- */

export function PolarArea({ data, size = 150, colors, labels }: { data: number[]; size?: number; colors?: string[]; labels?: string[] }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 14;
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length);
  const seg = (Math.PI * 2) / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[0.5, 1].map((g, k) => <circle key={k} cx={cx} cy={cy} r={r2(R * g)} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth="1" />)}
      {data.map((v, i) => {
        const r = R * Math.sqrt(Math.max(0, v) / max);
        const a0 = i * seg - Math.PI / 2, a1 = (i + 1) * seg - Math.PI / 2 - 0.04;
        const col = colors?.[i] ?? SERIES[i % SERIES.length];
        const large = seg > Math.PI ? 1 : 0;
        return <path key={i} d={`M ${cx} ${cy} L ${r2(cx + Math.cos(a0) * r)} ${r2(cy + Math.sin(a0) * r)} A ${r2(r)} ${r2(r)} 0 ${large} 1 ${r2(cx + Math.cos(a1) * r)} ${r2(cy + Math.sin(a1) * r)} Z`} fill={col} fillOpacity={0.55} stroke={col} strokeWidth="1" />;
      })}
      {labels?.map((l, i) => { const a = (i + 0.5) * seg - Math.PI / 2; return <text key={l + i} x={r2(cx + Math.cos(a) * (R + 8))} y={r2(cy + Math.sin(a) * (R + 8))} textAnchor="middle" dominantBaseline="middle" fill="rgba(0,255,0,0.5)" style={{ fontSize: 6.5, fontFamily: "monospace" }}>{l}</text>; })}
    </svg>
  );
}

/* --------------------------- Honeycomb (hex) --------------------------- */

export function Honeycomb({ data, cols = 6, hex = 13, gap = 2, color = NEON }: { data: { v: number; color?: string }[]; cols?: number; hex?: number; gap?: number; color?: string }) {
  const s = hex, dx = s * 1.5 + gap, dy = s * Math.sqrt(3) + gap;
  const rows = Math.max(1, Math.ceil(data.length / cols));
  const w = cols * dx + s, h = rows * dy + dy / 2 + s;
  const hexPath = (cx: number, cy: number) => {
    const pts = Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k; return `${r2(cx + s * Math.cos(a))} ${r2(cy + s * Math.sin(a))}`; });
    return `M ${pts.join(" L ")} Z`;
  };
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const cx = s + c * dx, cy = s + r * dy + (c % 2 ? dy / 2 : 0);
        const col = d.color ?? color;
        return <path key={i} d={hexPath(cx, cy)} fill={col} fillOpacity={0.1 + Math.max(0, Math.min(1, d.v)) * 0.8} stroke={col} strokeOpacity="0.4" strokeWidth="1" />;
      })}
    </svg>
  );
}

/* ---------------------------- Waterfall -------------------------------- */

export function Waterfall({ steps, w = 300, h = 96 }: { steps: { value: number; kind?: "total" | "delta" }[]; w?: number; h?: number }) {
  const bars = steps.reduce<{ from: number; to: number; pos: boolean; total: boolean }[]>((acc, s) => {
    const base = s.kind === "total" ? 0 : (acc.length ? acc[acc.length - 1].to : 0);
    const to = base + s.value;
    return [...acc, { from: Math.min(base, to), to: Math.max(base, to), pos: s.value >= 0, total: s.kind === "total" }];
  }, []);
  const max = Math.max(1, ...bars.map((b) => b.to));
  const n = Math.max(1, bars.length);
  const bw = (w / n) * 0.6;
  const yAt = (v: number) => r2(h - (v / max) * (h - 4));
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {bars.map((b, i) => {
        const x = (w / n) * i + (w / n - bw) / 2;
        const col = b.total ? NEON : b.pos ? "#7cf57c" : RED;
        return (
          <g key={i}>
            <rect x={r2(x)} y={yAt(b.to)} width={r2(bw)} height={r2(Math.max(1.5, yAt(b.from) - yAt(b.to)))} fill={col} fillOpacity={0.65} stroke={col} strokeWidth="1" />
            {i < bars.length - 1 && <line x1={r2(x + bw)} x2={r2(x + w / n)} y1={yAt(b.to)} y2={yAt(b.to)} stroke="rgba(0,255,0,0.25)" strokeWidth="1" strokeDasharray="2 2" />}
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------ Bullet --------------------------------- */

export function Bullet({ data, w = 300, rowH = 15, gap = 5, color = CYAN }: { data: { value: number; target: number; label?: string }[]; w?: number; rowH?: number; gap?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target)));
  const h = Math.max(1, data.length) * (rowH + gap);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const y = i * (rowH + gap);
        const done = d.value >= d.target;
        return (
          <g key={i}>
            <rect x="0" y={r2(y)} width={w} height={rowH} fill="rgba(0,255,0,0.06)" />
            <rect x="0" y={r2(y)} width={r2((d.value / max) * w)} height={rowH} fill={done ? NEON : color} fillOpacity={0.7} />
            <line x1={r2((d.target / max) * w)} x2={r2((d.target / max) * w)} y1={r2(y - 1)} y2={r2(y + rowH + 1)} stroke={AMBER} strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------ Funnel --------------------------------- */

export function Funnel({ data, w = 300, h = 100, gap = 4 }: { data: { value: number; label?: string; color?: string }[]; w?: number; h?: number; gap?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const rowH = (h - gap * (n - 1)) / n;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const bw = Math.max(2, (d.value / max) * w);
        const col = d.color ?? SERIES[i % SERIES.length];
        return <rect key={i} x={r2((w - bw) / 2)} y={r2(i * (rowH + gap))} width={r2(bw)} height={r2(rowH)} fill={col} fillOpacity={0.55} stroke={col} strokeWidth="1" />;
      })}
    </svg>
  );
}

/* ---------------------------- Marimekko -------------------------------- */

export function Marimekko({ data, w = 300, h = 100, gap = 2 }: { data: { weight: number; fill: number; color?: string }[]; w?: number; h?: number; gap?: number }) {
  const totalW = data.reduce((s, d) => s + Math.max(0, d.weight), 0) || 1;
  const avail = w - gap * Math.max(0, data.length - 1);
  const cols = data.reduce<{ x: number; bw: number; fill: number; color?: string }[]>((acc, d) => {
    const prev = acc.length ? acc[acc.length - 1] : null;
    const x = prev ? prev.x + prev.bw + gap : 0;
    return [...acc, { x, bw: (Math.max(0, d.weight) / totalW) * avail, fill: d.fill, color: d.color }];
  }, []);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {cols.map((c, i) => {
        const fh = Math.max(0, Math.min(1, c.fill)) * h;
        const col = c.color ?? SERIES[i % SERIES.length];
        return (
          <g key={i}>
            <rect x={r2(c.x)} y="0" width={r2(c.bw)} height={h} fill={col} fillOpacity={0.08} />
            <rect x={r2(c.x)} y={r2(h - fh)} width={r2(c.bw)} height={r2(fh)} fill={col} fillOpacity={0.6} stroke={col} strokeWidth="0.8" />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------- Tornado (± split) ------------------------ */

export function Tornado({ data, w = 300, rowH = 13, gap = 5 }: { data: { left: number; right: number; label?: string }[]; w?: number; rowH?: number; gap?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.left, d.right]));
  const mid = w / 2;
  const h = Math.max(1, data.length) * (rowH + gap);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1={mid} x2={mid} y1="0" y2={h} stroke="rgba(0,255,0,0.2)" strokeWidth="1" />
      {data.map((d, i) => {
        const y = i * (rowH + gap);
        const lw = (d.left / max) * (mid - 2);
        const rw = (d.right / max) * (mid - 2);
        return (
          <g key={i}>
            <rect x={r2(mid - lw)} y={r2(y)} width={r2(lw)} height={rowH} fill={RED} fillOpacity={0.7} />
            <rect x={mid} y={r2(y)} width={r2(rw)} height={rowH} fill={NEON} fillOpacity={0.7} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------- Lollipop --------------------------------- */

export function Lollipop({ data, w = 300, rowH = 14, gap = 6, color = CYAN, target }: { data: { value: number; label?: string }[]; w?: number; rowH?: number; gap?: number; color?: string; target?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value), target ?? 0);
  const h = Math.max(1, data.length) * (rowH + gap);
  const pad = 4;
  const X = (v: number) => r2(pad + (v / max) * (w - pad * 2));
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {target != null && <line x1={X(target)} x2={X(target)} y1="0" y2={h} stroke={AMBER} strokeWidth="1" strokeDasharray="3 2" />}
      {data.map((d, i) => {
        const y = r2(i * (rowH + gap) + rowH / 2);
        return (
          <g key={i}>
            <line x1={r2(pad)} x2={X(d.value)} y1={y} y2={y} stroke={color} strokeWidth="1.5" opacity="0.5" />
            <circle cx={X(d.value)} cy={y} r="3.5" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------ Waffle --------------------------------- */

export function Waffle({ data, side = 10, cell = 11, gap = 3 }: { data: { value: number; color?: string }[]; side?: number; cell?: number; gap?: number }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const N = side * side;
  const counts = data.map((d) => Math.round((Math.max(0, d.value) / total) * N));
  const bounds = counts.reduce<number[]>((acc, c) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + c], []);
  const size = side * (cell + gap);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {Array.from({ length: N }, (_, idx) => {
        const ci = bounds.findIndex((b) => idx < b);
        const col = ci >= 0 ? (data[ci].color ?? SERIES[ci % SERIES.length]) : "rgba(0,255,0,0.08)";
        const c = idx % side, r = Math.floor(idx / side);
        return <rect key={idx} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} rx="1.5" fill={col} fillOpacity={ci >= 0 ? 0.8 : 1} />;
      })}
    </svg>
  );
}

/* ---------------------------- Dumbbell --------------------------------- */

export function Dumbbell({ data, w = 300, rowH = 14, gap = 6 }: { data: { a: number; b: number; label?: string }[]; w?: number; rowH?: number; gap?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const pad = 5;
  const h = Math.max(1, data.length) * (rowH + gap);
  const X = (v: number) => r2(pad + (v / max) * (w - pad * 2));
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const y = r2(i * (rowH + gap) + rowH / 2);
        return (
          <g key={i}>
            <line x1={X(d.a)} x2={X(d.b)} y1={y} y2={y} stroke="rgba(0,255,0,0.3)" strokeWidth="1.5" />
            <circle cx={X(d.a)} cy={y} r="3.5" fill={AMBER} />
            <circle cx={X(d.b)} cy={y} r="3.5" fill={d.b >= d.a ? NEON : CYAN} />
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------- Histogram -------------------------------- */

export function Histogram({ data, bins = 6, w = 280, h = 60, color = NEON }: { data: number[]; bins?: number; w?: number; h?: number; color?: string }) {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const counts = Array.from({ length: bins }, (_, b) => data.filter((v) => Math.min(bins - 1, Math.floor(((v - min) / span) * bins)) === b).length);
  const cMax = Math.max(1, ...counts);
  const bw = w / bins;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {counts.map((c, i) => {
        const bh = c > 0 ? Math.max(2, (c / cMax) * (h - 3)) : 0;
        return <rect key={i} x={r2(i * bw + 1)} y={r2(h - bh)} width={r2(bw - 2)} height={r2(bh)} rx="1" fill={color} opacity={0.45 + (c / cMax) * 0.55} />;
      })}
    </svg>
  );
}

/* ------------------------------ SegBar --------------------------------- */

export function SegBar({ percent, segments = 20, w = 280, h = 26, color = NEON }: { percent: number; segments?: number; w?: number; h?: number; color?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const on = Math.round((p / 100) * segments);
  const gap = 2;
  const sw = (w - gap * (segments - 1)) / segments;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {Array.from({ length: segments }, (_, i) => (
        <rect key={i} x={r2(i * (sw + gap))} y="0" width={r2(sw)} height={h} rx="1" fill={color} fillOpacity={i < on ? 0.85 : 0.12} />
      ))}
    </svg>
  );
}

/* ------------------------------ Donut ---------------------------------- */

export function Donut({ data, size = 132, thickness = 16, colors, center }: { data: number[]; size?: number; thickness?: number; colors?: string[]; center?: string }) {
  const total = data.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const segs = data.reduce<{ start: number; len: number; v: number }[]>((acc, v) => {
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].len : 0;
    return [...acc, { start, len: Math.max(0, v) / total, v }];
  }, []);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,255,0,0.08)" strokeWidth={thickness} />
      {segs.map((s, i) => {
        if (s.v <= 0) return null;
        const col = colors?.[i] ?? SERIES[i % SERIES.length];
        const seg = Math.max(0, s.len - 0.012);
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={thickness} strokeOpacity={0.78}
          strokeDasharray={`${r2(C * seg)} ${r2(C * (1 - seg))}`} strokeDashoffset={r2(-C * s.start)} transform={`rotate(-90 ${cx} ${cy})`} />;
      })}
      {center && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={NEON} style={{ fontSize: size * 0.17, fontWeight: 700 }}>{center}</text>}
    </svg>
  );
}

/* ------------------------------ Scatter -------------------------------- */

export function Scatter({ data, w = 300, h = 100, color = NEON }: { data: { x: number; y: number; size?: number; color?: string }[]; w?: number; h?: number; color?: string }) {
  const maxX = Math.max(1, ...data.map((d) => d.x));
  const maxY = Math.max(1, ...data.map((d) => d.y));
  const sizeMax = Math.max(1, ...data.map((d) => d.size ?? 1));
  const pad = 8;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad} x2={w - pad} y1={r2(pad + g * (h - pad * 2))} y2={r2(pad + g * (h - pad * 2))} stroke="rgba(0,255,0,0.06)" strokeWidth="1" />)}
      {data.map((d, i) => {
        const x = r2(pad + (d.x / maxX) * (w - pad * 2));
        const y = r2(h - pad - (d.y / maxY) * (h - pad * 2));
        const rr = r2(2.5 + Math.sqrt((d.size ?? 1) / sizeMax) * 5);
        const col = d.color ?? color;
        return <circle key={i} cx={x} cy={y} r={rr} fill={col} fillOpacity={0.5} stroke={col} strokeWidth="0.8" />;
      })}
    </svg>
  );
}

/* ----------------------------- StepArea -------------------------------- */

export function StepArea({ data, gid, color = NEON, w = 300, h = 60 }: { data: number[]; gid: string; color?: string; w?: number; h?: number }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const n = Math.max(1, data.length);
  const X = (i: number) => r2((i / Math.max(1, n - 1)) * w);
  const Y = (v: number) => r2(4 + (1 - (v - min) / range) * (h - 8));
  const seg = data.map((v, i) => (i === 0 ? `M ${X(0)} ${Y(v)}` : `L ${X(i)} ${Y(data[i - 1])} L ${X(i)} ${Y(v)}`)).join(" ");
  const area = `${seg} L ${X(n - 1)} ${h} L ${X(0)} ${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs><linearGradient id={`step-${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.3" /><stop offset="1" stopColor={color} stopOpacity="0.02" /></linearGradient></defs>
      <path d={area} fill={`url(#step-${gid})`} />
      <path d={seg} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ------------------------------ Stream --------------------------------- */

export function Stream({ data, color = NEON, w = 300, h = 60 }: { data: number[]; gid?: string; color?: string; w?: number; h?: number }) {
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length);
  const X = (i: number) => r2((i / Math.max(1, n - 1)) * w);
  const half = (v: number) => (v / max) * (h / 2 - 3);
  const mid = h / 2;
  const top = data.map((v, i) => `${X(i)} ${r2(mid - half(v))}`);
  const bot = data.map((_, i) => `${X(n - 1 - i)} ${r2(mid + half(data[n - 1 - i]))}`);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={`M ${top.join(" L ")} L ${bot.join(" L ")} Z`} fill={color} fillOpacity={0.25} stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

/* -------------------------- RadialProgress ----------------------------- */

export function RadialProgress({ percent, size = 104, thickness = 12, color = NEON, value }: { percent: number; size?: number; thickness?: number; color?: string; value?: string }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const arcLen = C * 0.75; // 270° dial
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,255,0,0.1)" strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${r2(arcLen)} ${r2(C)}`} transform={`rotate(135 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${r2(arcLen * (p / 100))} ${r2(C)}`} transform={`rotate(135 ${cx} ${cy})`} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill={color} style={{ fontSize: size * 0.22, fontWeight: 700 }}>{value ?? `${p}%`}</text>
    </svg>
  );
}

/* --------------------------- LabeledBars ------------------------------- */

export function LabeledBars({ data, w = 300, rowH = 15, gap = 6, color = NEON }: { data: { label: string; value: number; color?: string }[]; w?: number; rowH?: number; gap?: number; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const h = Math.max(1, data.length) * (rowH + gap);
  const labelW = 70;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const y = i * (rowH + gap);
        const bw = Math.max(1, (d.value / max) * (w - labelW - 34));
        const col = d.color ?? color;
        const lbl = d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label;
        const val = d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : `${Math.round(d.value)}`;
        return (
          <g key={i}>
            <text x="0" y={r2(y + rowH * 0.74)} fill="rgba(0,255,0,0.6)" style={{ fontSize: 9, fontFamily: "monospace" }}>{lbl}</text>
            <rect x={labelW} y={r2(y)} width={r2(bw)} height={rowH} rx="1" fill={col} fillOpacity={0.7} />
            <text x={r2(labelW + bw + 4)} y={r2(y + rowH * 0.74)} fill="rgba(0,255,0,0.7)" style={{ fontSize: 8.5, fontFamily: "monospace" }}>{val}</text>
          </g>
        );
      })}
    </svg>
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
