"use client";

/**
 * MarketTicker — the scrolling live-price marquee, shared beyond the terminal.
 * Self-fetching (/api/markets, 20s refresh); same visual language as the
 * terminal's inline ticker. Mount under a page header:  <MarketTicker />
 */

import Link from "next/link";
import { useEffect, useState } from "react";

type TickerItem = { id: string; symbol: string; price: number; change: number };

export default function MarketTicker({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/markets")
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setItems((j.markets ?? []).map((x: { market_id: string; base_symbol: string; price?: number; change?: number }) => ({
            id: x.market_id, symbol: x.base_symbol, price: x.price ?? 0, change: x.change ?? 0,
          })));
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  if (!items.length) return null;
  const cells = (prefix: string) =>
    items.map((t, i) => (
      <Link key={prefix + i} href={`/market/${t.id}`} className="flex shrink-0 items-center gap-1.5 px-4 text-[11px] transition hover:text-neon">
        <span className="text-ink-faint">#{i + 1}</span>
        <span className="font-semibold text-ink">{t.symbol}</span>
        <span className="text-ink-dim">${t.price < 1 ? t.price.toFixed(4) : t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className={t.change >= 0 ? "text-neon" : "text-danger"}>{t.change >= 0 ? "▲" : "▼"}{Math.abs(t.change).toFixed(2)}%</span>
      </Link>
    ));
  return (
    <div className={`relative shrink-0 overflow-hidden border-b border-line bg-black/40 ${className}`}>
      <div className="ng-marquee flex w-max items-center py-1.5">{cells("a")}{cells("b")}</div>
    </div>
  );
}
