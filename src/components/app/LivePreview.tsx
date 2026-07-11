"use client";

/**
 * LivePreview — a real, scaled-down window of a hosted build (/d/<slug>),
 * for cards. App-store feel with zero fakery: it IS the product, rendered
 * small. Lazy: the iframe only mounts once the card scrolls near the
 * viewport, and it's sandboxed + non-interactive (the card's link handles
 * clicks).
 */

import { useEffect, useRef, useState } from "react";

export default function LivePreview({
  src, height = 120, scale = 0.35, className = "",
}: {
  src: string; height?: number; scale?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const pct = 100 / scale;
  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden border border-neon/15 bg-black ${className}`}
      style={{ height }}
      aria-hidden
    >
      {near && ok ? (
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
          onError={() => setOk(false)}
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: `${pct}%`, height: `${pct}%`, transform: `scale(${scale})`, border: 0 }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-[10px] text-ink-faint">░░ preview ░░</div>
      )}
      {/* scanline wash so tiny previews still read as terminal surfaces */}
      <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.08) 50%)", backgroundSize: "100% 3px" }} />
    </div>
  );
}
