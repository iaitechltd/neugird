"use client";

import { useState, type ReactNode } from "react";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
    </svg>
  );
}

// subtle, minimal edge handle — identical look for collapse + restore
const HANDLE =
  "z-30 hidden h-9 w-3.5 place-items-center rounded border border-neon/20 bg-black/40 text-ink-faint backdrop-blur transition hover:border-neon/50 hover:text-neon lg:grid";

/**
 * Wraps a side column so it can collapse to a subtle edge handle.
 * Controlled when `open` is passed (so the page can derive layout from how many
 * panels are open); otherwise self-manages. `onToggle(open)` fires on change.
 * The handle is pinned to a NON-scrolling wrapper, so it never gets clipped or
 * scrolls away — consistent on every page.
 */
export default function OrbPanel({
  children,
  label = "Panel",
  widthClass = "lg:w-[330px] xl:w-[348px]",
  className = "",
  order,
  side = "right",
  open: openProp,
  defaultOpen = true,
  onToggle,
}: {
  children: ReactNode;
  label?: string;
  widthClass?: string;
  className?: string;
  order?: string;
  side?: "left" | "right";
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = openProp ?? internal;
  const ord = order ?? (side === "left" ? "order-2 lg:order-1" : "order-3");

  function toggle(v: boolean) {
    if (openProp === undefined) setInternal(v);
    onToggle?.(v);
  }

  if (!open) {
    return (
      <button
        onClick={() => toggle(true)}
        title={`Open ${label}`}
        aria-label={`Open ${label}`}
        className={`fixed top-1/2 -translate-y-1/2 ${side === "left" ? "left-0 rounded-r-md" : "right-0 rounded-l-md"} ${HANDLE}`}
      >
        <Chevron dir={side === "left" ? "right" : "left"} />
      </button>
    );
  }

  return (
    <div className={`ng-rail relative ${ord} lg:h-full lg:min-h-0 lg:shrink-0 ${widthClass}`}>
      <button
        onClick={() => toggle(false)}
        title={`Collapse ${label}`}
        aria-label={`Collapse ${label}`}
        className={`absolute top-1/2 -translate-y-1/2 rounded-md ${side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"} ${HANDLE}`}
      >
        <Chevron dir={side === "left" ? "left" : "right"} />
      </button>
      <div className={`lg:h-full lg:min-h-0 ${className}`}>{children}</div>
    </div>
  );
}
