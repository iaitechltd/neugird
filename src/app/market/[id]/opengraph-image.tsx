/**
 * Dynamic OpenGraph card for a token Market. Server-only route segment
 * (independent of the client page) — reads the in-memory store directly, so it
 * runs on the Node runtime. On-brand phosphor-terminal card. Never throws — a
 * missing market renders a generic card.
 */

import { ImageResponse } from "next/og";
import { Markets } from "@/lib/modules";

export const runtime = "nodejs";
export const alt = "NeuGrid — Trade";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#00ff00";
const DIM = "#41ff41";
const FAINT = "#1f5a1f";
const BORDER = "#1a3d1a";
const MONO =
  "ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        background: "#000000",
        color: GREEN,
        fontFamily: MONO,
        padding: "64px",
        border: `2px solid ${BORDER}`,
      }}
    >
      {children}
    </div>
  );
}

function fmtPrice(n: number) {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toPrecision(3);
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let m: ReturnType<typeof Markets.getMarket> = undefined;
  let progress: ReturnType<typeof Markets.stageProgress> | null = null;
  let price = 0;
  try {
    m = Markets.getMarket(id);
    if (m) {
      progress = Markets.stageProgress(m);
      price = Markets.priceOf(m);
    }
  } catch {
    m = undefined;
  }

  if (!m) {
    return new ImageResponse(
      (
        <Shell>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // TRADE</div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 64, fontWeight: 700 }}>
            Earned markets — proof, not promises.
          </div>
          <div style={{ display: "flex", fontSize: 24, color: FAINT, letterSpacing: 4 }}>neugrid.network</div>
        </Shell>
      ),
      { ...size },
    );
  }

  const pair = `${m.base_symbol}/${m.quote_symbol}`;
  const stage = (m.stage ?? "alpha").toUpperCase();
  const capPct = progress ? progress.capPct : 0;

  return new ImageResponse(
    (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // TRADE</div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              border: `1px solid ${BORDER}`,
              padding: "8px 18px",
            }}
          >
            [ {stage} ]
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>{pair}</div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 14 }}>
            <span style={{ fontSize: 30, color: FAINT, letterSpacing: 3 }}>PRICE&nbsp;&nbsp;</span>
            <span style={{ fontSize: 52, fontWeight: 700 }}>
              {fmtPrice(price)} {m.quote_symbol}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 24, color: DIM }}>
            {m.holders ?? 0} holders
          </div>
          <div style={{ display: "flex", fontSize: 24, color: FAINT }}>
            {progress?.next ? `${capPct}% → ${progress.next.toUpperCase()}` : "TOP STAGE"}
          </div>
        </div>
      </Shell>
    ),
    { ...size },
  );
}
