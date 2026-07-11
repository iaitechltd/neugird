/**
 * Dynamic OpenGraph card for a Genesis raise. Server-only route segment
 * (independent of the client page) — reads the in-memory store directly, so it
 * runs on the Node runtime. On-brand phosphor-terminal card. Never throws — a
 * missing raise renders a generic card.
 */

import { ImageResponse } from "next/og";
import { Genesis } from "@/lib/modules";

export const runtime = "nodejs";
export const alt = "NeuGrid — Fund";
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

function usd(n: number) {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}k`;
  return `$${v.toLocaleString("en-US")}`;
}

function clip(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let view: ReturnType<typeof Genesis.proposalView> = undefined;
  try {
    view = Genesis.proposalView(id);
  } catch {
    view = undefined;
  }

  if (!view) {
    return new ImageResponse(
      (
        <Shell>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // FUND</div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 64, fontWeight: 700 }}>
            Milestone-escrowed community funding.
          </div>
          <div style={{ display: "flex", fontSize: 24, color: FAINT, letterSpacing: 4 }}>neugrid.network</div>
        </Shell>
      ),
      { ...size },
    );
  }

  const ask = view.proposal.ask_amount ?? 0;
  const raised = view.raised ?? 0;
  const pct = ask > 0 ? Math.min(100, Math.round((raised / ask) * 100)) : 0;
  const title = clip(view.proposal.title ?? "Untitled raise", 80);

  return new ImageResponse(
    (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // FUND</div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              border: `1px solid ${BORDER}`,
              padding: "8px 18px",
            }}
          >
            [ RAISE ]
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 30, color: FAINT, letterSpacing: 3 }}>ASK {usd(ask)}</div>
          <div style={{ display: "flex", fontSize: 62, fontWeight: 700, marginTop: 14, lineHeight: 1.1 }}>{title}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ display: "flex", fontSize: 28 }}>
              <span>{usd(raised)} raised</span>
              <span style={{ color: FAINT }}>&nbsp;·&nbsp;{view.backers ?? 0} backers</span>
            </div>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{pct}%</div>
          </div>
          <div style={{ display: "flex", width: "100%", height: 22, border: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", width: `${pct}%`, height: "100%", background: GREEN }} />
          </div>
        </div>
      </Shell>
    ),
    { ...size },
  );
}
