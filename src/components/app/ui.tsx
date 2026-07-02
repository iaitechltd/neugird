import type { ReactNode } from "react";
import { CountUp } from "./typefx";

/* ---------------------------- Avatar ---------------------------- */

type Status = "online" | "away" | "busy";

export function Avatar({
  name,
  size = 36,
  ring = false,
  status,
  verified,
}: {
  name: string;
  size?: number;
  ring?: boolean;
  status?: Status;
  verified?: boolean;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const ledClass =
    status === "away" ? "ng-led--amber" : status === "busy" ? "ng-led--danger" : "";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className={`grid place-items-center rounded-full font-mono font-semibold text-bg ${
          ring ? "ring-2 ring-neon/40 ring-offset-2 ring-offset-bg" : ""
        }`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.34,
          background: "linear-gradient(135deg, #19ffa0, #0a7d4f)",
        }}
      >
        {initials}
      </span>
      {status && (
        <span
          className={`ng-led ${ledClass} absolute bottom-0 right-0 ring-2 ring-bg`}
          aria-label={status}
        />
      )}
      {verified && (
        <span className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-bg text-neon">
          <IconCheck className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

/* -------------------------- Section header ----------------------- */

export function SectionHeader({
  glyph,
  children,
  action,
}: {
  glyph: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between first:mt-0">
      <div className="ng-label flex items-center gap-2">
        <span className="text-neon">{glyph}</span>
        {children}
      </div>
      {action}
    </div>
  );
}

/* --------------------------- Progress bar ------------------------ */

export function ProgressBar({ percent, color = "var(--ng-neon)" }: { percent: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-2">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </div>
  );
}

/* ---------------------------- IconButton ------------------------- */

export function IconButton({
  children,
  badge,
  label,
}: {
  children: ReactNode;
  badge?: number;
  label?: string;
}) {
  return (
    <button
      aria-label={label}
      className="relative grid h-9 w-9 place-items-center rounded border border-line text-ink-dim transition hover:border-neon/50 hover:text-neon"
    >
      {children}
      {badge ? (
        <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 font-mono text-[10px] font-bold text-bg">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------ Icons ---------------------------- */
// Minimal line icons; stroke uses currentColor so they inherit text color.

type IconProps = { className?: string };
const base = (className = "h-4 w-4") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
export function IconBell({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
export function IconConnect({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7 8 3 12l4 4" />
      <path d="m17 8 4 4-4 4" />
      <path d="M3 12h18" />
    </svg>
  );
}
export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function IconChevronUp({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}
export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconChevronDown({ className }: IconProps) {
  return <svg {...base(className)}><path d="m6 9 6 6 6-6" /></svg>;
}
export function IconArrowRight({ className }: IconProps) {
  return <svg {...base(className)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function IconArrowUp({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
}
export function IconArrowDown({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
}
export function IconHome({ className }: IconProps) {
  return <svg {...base(className)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
export function IconGrid({ className }: IconProps) {
  return <svg {...base(className)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
export function IconActivity({ className }: IconProps) {
  return <svg {...base(className)}><path d="M3 12h4l2-6 4 14 2-8h6" /></svg>;
}
export function IconChart({ className }: IconProps) {
  return <svg {...base(className)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
}
export function IconWallet({ className }: IconProps) {
  return <svg {...base(className)}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></svg>;
}
export function IconShield({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
}
export function IconEye({ className }: IconProps) {
  return <svg {...base(className)}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export function IconBolt({ className }: IconProps) {
  return <svg {...base(className)}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
}
export function IconNetwork({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="19" r="2.4" /><circle cx="19" cy="19" r="2.4" /><path d="M12 7.4 6.5 16.8M12 7.4l5.5 9.4M7.4 19h9.2" /></svg>;
}
export function IconCube({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 2 3 7v10l9 5 9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>;
}
export function IconLayers({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 2 2 7l10 5 10-5z" /><path d="m2 12 10 5 10-5M2 17l10 5 10-5" /></svg>;
}
export function IconTarget({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>;
}
export function IconFlask({ className }: IconProps) {
  return <svg {...base(className)}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 15h9" /></svg>;
}
export function IconClock({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
export function IconLock({ className }: IconProps) {
  return <svg {...base(className)}><rect x="4" y="10.5" width="16" height="10.5" rx="3" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15" r="1.3" /><path d="M12 16.3v1.8" /></svg>;
}
export function IconClose({ className }: IconProps) {
  return <svg {...base(className)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
export function IconStar({ className }: IconProps) {
  return <svg {...base(className)}><path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17.8 6.4 20.2l1.2-6.2L3 9.5l6.3-.8z" /></svg>;
}
export function IconRocket({ className }: IconProps) {
  return <svg {...base(className)}><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 12c0-5 3-9 9-9 0 6-4 9-9 9z" /><path d="M9 12l3 3" /><circle cx="15" cy="9" r="1.2" /></svg>;
}
export function IconTerminal({ className }: IconProps) {
  return <svg {...base(className)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></svg>;
}
export function IconUser({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></svg>;
}
export function IconBot({ className }: IconProps) {
  return <svg {...base(className)}><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M12 4v4M9 13h.01M15 13h.01" /><path d="M2 13h2M20 13h2" /></svg>;
}
export function IconBriefcase({ className }: IconProps) {
  return <svg {...base(className)}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></svg>;
}
export function IconStore({ className }: IconProps) {
  return <svg {...base(className)}><path d="M4 9V20h16V9M3 4h18l-1 5H4z" /><path d="M9 20v-6h6v6" /></svg>;
}
export function IconCode({ className }: IconProps) {
  return <svg {...base(className)}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 6l-4 12" /></svg>;
}
export function IconDatabase({ className }: IconProps) {
  return <svg {...base(className)}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
}
export function IconGlobe({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>;
}
export function IconCoins({ className }: IconProps) {
  return <svg {...base(className)}><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3M15 9.2c2 .5 3 1.4 3 2.8 0 1.7-2.7 3-6 3s-6-1.3-6-3" /><path d="M9 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>;
}
export function IconFilter({ className }: IconProps) {
  return <svg {...base(className)}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
}
export function IconSettings({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>;
}
export function IconMessage({ className }: IconProps) {
  return <svg {...base(className)}><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z" /></svg>;
}
export function IconHeart({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 20s-7-4.5-9.2-9C1.3 8 3 4.5 6.5 4.5c2 0 3.5 1.5 5.5 4 2-2.5 3.5-4 5.5-4C21 4.5 22.7 8 21.2 11 19 15.5 12 20 12 20z" /></svg>;
}
export function IconShare({ className }: IconProps) {
  return <svg {...base(className)}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8 11 8-4M8 13l8 4" /></svg>;
}
export function IconSparkle({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /><path d="M12 9a3 3 0 0 0 3 3 3 3 0 0 0-3 3 3 3 0 0 0-3-3 3 3 0 0 0 3-3z" /></svg>;
}
export function IconFlag({ className }: IconProps) {
  return <svg {...base(className)}><path d="M5 21V4M5 4h12l-2 4 2 4H5" /></svg>;
}
export function IconRefresh({ className }: IconProps) {
  return <svg {...base(className)}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4" /></svg>;
}
export function IconExternal({ className }: IconProps) {
  return <svg {...base(className)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
}
export function IconAlert({ className }: IconProps) {
  return <svg {...base(className)}><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></svg>;
}
export function IconPlay({ className }: IconProps) {
  return <svg {...base(className)}><path d="M7 4v16l13-8z" /></svg>;
}

/* ------------------------- Box-free primitives -------------------------- */

type Accent = "neon" | "cyan" | "amber" | "danger";

/** Highlighted text — replaces bordered chips. */
export function Mark({ children, accent = "neon", plain = false, className = "" }: { children: ReactNode; accent?: Accent; plain?: boolean; className?: string }) {
  const a = accent === "neon" ? "" : `ng-mark--${accent}`;
  return <span className={`ng-mark ${a} ${plain ? "ng-mark--plain" : ""} ${className}`}>{children}</span>;
}

/** Mono micro-label with a leading neon tick (no box). */
export function Tag({ children, accent = "neon", className = "" }: { children: ReactNode; accent?: Accent; className?: string }) {
  return <span className={`ng-tag ng-tag--${accent} ${className}`}>{children}</span>;
}

/** Hairline data row. */
export function DataRow({ k, v, accent }: { k: ReactNode; v: ReactNode; accent?: Accent }) {
  const color = accent ? { color: `var(--ng-${accent === "neon" ? "neon" : accent})` } : undefined;
  return (
    <div className="ng-row">
      <span className="ng-row__k">{k}</span>
      <span className="ng-row__v" style={color}>{v}</span>
    </div>
  );
}

/** Stat — big number (animated when numeric) + small label, no box. */
export function Stat({ label, value, prefix = "", suffix = "", decimals = 0, accent = "neon", align = "left" }: { label: string; value: number | string; prefix?: string; suffix?: string; decimals?: number; accent?: Accent; align?: "left" | "center" }) {
  const color = `var(--ng-${accent === "neon" ? "neon" : accent})`;
  return (
    <div className={align === "center" ? "text-center" : ""}>
      <div className="ng-stat__v" style={{ color }}>
        {typeof value === "number" ? <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} /> : <>{prefix}{value}{suffix}</>}
      </div>
      <div className="ng-stat__k">{label}</div>
    </div>
  );
}

/** Underline tab bar — no boxes. */
export function Tabs({ tabs, value, onChange, className = "" }: { tabs: string[]; value: number; onChange: (i: number) => void; className?: string }) {
  return (
    <div className={`ng-tabs ${className}`} role="tablist">
      {tabs.map((t, i) => (
        <button key={t} role="tab" data-active={value === i} aria-selected={value === i} className="ng-tab" onClick={() => onChange(i)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Corner-bracket frame around featured content. */
export function Bracket({ children, className = "", accent = "neon" }: { children: ReactNode; className?: string; accent?: Accent }) {
  const c = `var(--ng-${accent === "neon" ? "neon" : accent})`;
  const corner = (pos: string) => <span className={`pointer-events-none absolute h-3 w-3 ${pos}`} style={{ borderColor: c }} />;
  return (
    <div className={`relative ${className}`}>
      {corner("left-0 top-0 border-l-2 border-t-2")}
      {corner("right-0 top-0 border-r-2 border-t-2")}
      {corner("left-0 bottom-0 border-l-2 border-b-2")}
      {corner("right-0 bottom-0 border-r-2 border-b-2")}
      {children}
    </div>
  );
}

/** Frameless panel — glowing mono label + hairline, scrolls its body. */
export function Panel({ title, icon, action, children, scroll = false, className = "", bodyClass = "" }: { title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; scroll?: boolean; className?: string; bodyClass?: string }) {
  return (
    <section className={`ng-panel flex flex-col ${scroll ? "lg:h-full lg:overflow-hidden" : ""} ${className}`}>
      {title && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
          <div className="ng-label flex items-center gap-2 !text-ink">
            {icon && <span className="text-neon">{icon}</span>}
            {title}
          </div>
          {action}
        </div>
      )}
      <div className={`${scroll ? "lg:min-h-0 lg:flex-1 lg:overflow-y-auto" : ""} ${bodyClass || "p-3.5"}`}>{children}</div>
    </section>
  );
}
