"use client";

/**
 * Staging honesty strip: when the platform runs in the non-demo posture
 * (NEUGRID_DEMO=off — read via /api/me's `demo` field), visitors see a small
 * fixed amber chip above the keybar: everything here is test money.
 * Demo mode renders nothing. Dismiss persists per-browser (localStorage).
 * Rendered once in layout.tsx beside NeuGridDock; hides on "/" and "/d/*"
 * (marketing + hosted apps carry no in-app balances).
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SEEN_KEY = "ng_testnet_notice_dismissed";

export default function TestnetNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(SEEN_KEY)) return;
    fetch("/api/me")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ j }) => {
        if (j?.demo === false) setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show || pathname === "/" || pathname.startsWith("/d/")) return null;

  return (
    <div className="fixed bottom-[38px] left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-2 border border-amber/40 bg-black px-2.5 py-1 font-mono text-[10px] text-amber">
        <span className="ng-label !text-amber">TEST NETWORK</span>
        <span className="text-amber/80">balances are test money — no real value</span>
        <button
          aria-label="Dismiss"
          className="ml-1 text-amber/60 transition hover:text-amber"
          onClick={() => {
            window.localStorage.setItem(SEEN_KEY, "1");
            setShow(false);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
