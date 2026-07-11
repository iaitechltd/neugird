"use client";

/**
 * ShareButton — one-click share that doubles as a referral. Opens the native
 * share sheet where available (mobile), otherwise an X/Twitter intent in a new
 * tab, falling back to copy-to-clipboard if a popup is blocked. When `refCode`
 * is passed, it's appended as `?ref=…` so every share is also an invite.
 */

import { useState } from "react";
import { IconShare } from "@/components/app/ui";

function withRef(u: string, ref?: string) {
  if (!ref) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}ref=${encodeURIComponent(ref)}`;
}

export default function ShareButton({
  url, text, refCode, className = "",
}: { url: string; text: string; refCode?: string; className?: string }) {
  const [flash, setFlash] = useState<"" | "shared" | "copied">("");
  const show = (s: "shared" | "copied") => { setFlash(s); window.setTimeout(() => setFlash(""), 1600); };

  function share() {
    const shareUrl = withRef(url, refCode);
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      nav.share({ text, url: shareUrl }).then(() => show("shared")).catch(() => {});
      return;
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
    const w = window.open(intent, "_blank", "noopener,noreferrer");
    if (w) { show("shared"); return; }
    nav?.clipboard?.writeText(shareUrl).then(() => show("copied")).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); share(); }}
      aria-label="Share"
      className={`ng-btn ng-btn--sm ${className}`}
    >
      <IconShare className="h-3.5 w-3.5" />
      {flash === "copied" ? "Copied ✓" : flash === "shared" ? "Shared ✓" : "Share"}
    </button>
  );
}
