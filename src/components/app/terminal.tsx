/**
 * Terminal primitives — the character-drawn data language (Phase B, 2026-07-03).
 * These render data the way a TUI does: bars/sparklines drawn in block glyphs,
 * ps-aux-style rows, and a tail-f event log. Shared so every page speaks the
 * same terminal vocabulary. Pure-phosphor by default; colors are opt-in.
 *
 * Prototype reference: src/app/labs/terminal/page.tsx.
 */

import type { ReactNode } from "react";

const SPARK_CH = "▁▂▃▄▅▆▇█";

/** A sparkline drawn in block characters — e.g. ▁▂▃▅▇█. Flat when data is thin. */
export function sparkStr(series: number[] | undefined, width = 24): string {
  if (!series || series.length < 2) return "▁".repeat(width);
  const pts = series.length > width ? series.slice(-width) : series;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  return pts.map((v) => SPARK_CH[Math.min(7, Math.floor(((v - min) / span) * 8))]).join("");
}

/** A meter drawn in block characters — e.g. ▮▮▮▮▯▯▯▯ for 50%. */
export function barStr(pct: number, w = 12): string {
  const f = Math.max(0, Math.min(w, Math.round((Math.max(0, Math.min(100, pct)) / 100) * w)));
  return "▮".repeat(f) + "▯".repeat(w - f);
}

/** Inline sparkline element (monospace, inherits color unless one is given). */
export function TSpark({ data, width = 24, color, className = "" }: { data?: number[]; width?: number; color?: string; className?: string }) {
  return <span className={`font-mono tracking-tight ${className}`} style={color ? { color } : undefined}>{sparkStr(data, width)}</span>;
}

/** A labelled character-bar meter row: `label  ▮▮▮▯▯ 42`. */
export function TMeter({ label, pct, value, w = 12, color, className = "" }: { label: ReactNode; pct: number; value?: ReactNode; w?: number; color?: string; className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 py-0.5 text-[12px] ${className}`}>
      <span className="w-20 shrink-0 truncate text-ink-dim">{label}</span>
      <span className="font-mono tracking-tighter" style={{ color: color ?? "var(--ng-neon)" }}>{barStr(pct, w)}</span>
      {value != null && <span className="ml-auto tnum text-ink-dim">{value}</span>}
    </div>
  );
}

/** A ps-aux-style process row: `● name        [tier]  ★3.3`. Inverts on hover. */
export function TProc({ live, name, tag, tagColor, meta, className = "" }: { live?: boolean; name: ReactNode; tag?: string; tagColor?: string; meta?: ReactNode; className?: string }) {
  return (
    <div className={`thl flex items-baseline gap-2 py-[3px] text-[12px] ${className}`}>
      <span style={{ color: live ? "var(--ng-neon)" : "var(--ng-ink-faint)" }}>{live ? "●" : "○"}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{name}</span>
      {tag && <span className="text-[10.5px]" style={{ color: tagColor ?? "var(--ng-amber)" }}>[{tag}]</span>}
      {meta != null && <span className="tnum text-ink-dim">{meta}</span>}
    </div>
  );
}

/** A titled mini-chart block for side rails — `[ TITLE ]` label + a right-aligned
 *  readout + the chart. The de-boxed frame groups it without a hard box. Two of
 *  these per rail is the platform pattern (2026-07-03 founder call). */
export function PanelChart({ title, read, children, className = "" }: { title: string; read?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`mt-3 ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="ng-label !text-[9px]">{title}</div>
        {read != null && <div className="tnum text-[9.5px] text-ink-dim">{read}</div>}
      </div>
      <div className="ng-card px-2 py-2">{children}</div>
    </div>
  );
}

export type LogLine = { at?: string; delta?: number; text: ReactNode; ok?: boolean };

/** A `tail -f` event log: timestamp · [±delta] · text, newest last, with a cursor. */
export function TailLog({ lines, height, className = "" }: { lines: LogLine[]; height?: number; className?: string }) {
  return (
    <div className={`font-mono text-[11.5px] ${className}`} style={height ? { height, overflowY: "auto" } : undefined}>
      {lines.map((l, i) => (
        <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis">
          {l.at && <span className="text-ink-faint">{l.at} </span>}
          {l.delta != null && (
            <span style={{ color: l.delta >= 0 ? "var(--ng-neon)" : "var(--ng-danger)" }}>[{l.delta >= 0 ? "+" : ""}{l.delta}] </span>
          )}
          <span className="text-ink-dim">{l.text}</span>
        </div>
      ))}
      <span className="ng-tcursor">█</span>
    </div>
  );
}
