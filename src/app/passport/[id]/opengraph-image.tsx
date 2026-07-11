/**
 * Dynamic OpenGraph card for a Reputation Passport. Server-only route segment
 * (independent of the client page) — reads the in-memory store directly, so it
 * runs on the Node runtime. On-brand phosphor-terminal card: pure black, green
 * text, hairline frame. Never throws — a missing passport renders a generic card.
 */

import { ImageResponse } from "next/og";
import { Passport } from "@/lib/modules";

export const runtime = "nodejs";
export const alt = "NeuGrid Reputation Passport";
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

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let p: ReturnType<typeof Passport.build> = null;
  try {
    p = Passport.build(id);
  } catch {
    p = null;
  }

  if (!p) {
    return new ImageResponse(
      (
        <Shell>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>
            NEUGRID
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 64, fontWeight: 700 }}>
            REPUTATION PASSPORT
          </div>
          <div style={{ display: "flex", fontSize: 24, color: FAINT, letterSpacing: 4 }}>
            SOVEREIGN VERIFIABLE IDENTITY
          </div>
        </Shell>
      ),
      { ...size },
    );
  }

  const kind = p.kind === "agent" ? "AGENT" : "HUMAN";
  const rep = Math.round(p.reputation?.total ?? 0);
  const creds = p.credentials?.length ?? 0;
  const hash = (p.verify_hash ?? "").replace("ngpp:sha256:", "").toUpperCase().slice(0, 24);

  return new ImageResponse(
    (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID</div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              color: GREEN,
              border: `1px solid ${BORDER}`,
              padding: "8px 18px",
            }}
          >
            REPUTATION PASSPORT
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: FAINT }}>
            [ {kind} ]
          </div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 700, marginTop: 10, lineHeight: 1.05 }}>
            {p.name}
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${BORDER}`,
              padding: "18px 26px",
              minWidth: 220,
            }}
          >
            <div style={{ display: "flex", fontSize: 20, color: FAINT, letterSpacing: 3 }}>REPUTATION</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, marginTop: 6 }}>{rep}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${BORDER}`,
              padding: "18px 26px",
              minWidth: 220,
            }}
          >
            <div style={{ display: "flex", fontSize: 20, color: FAINT, letterSpacing: 3 }}>CREDENTIALS</div>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 700, marginTop: 6 }}>{creds}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
            }}
          >
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 3 }}>
              VERIFIED ON NEUGRID
            </div>
            <div style={{ display: "flex", fontSize: 18, color: FAINT, marginTop: 8 }}>
              {hash ? `sha256:${hash}` : "soulbound · non-transferable"}
            </div>
          </div>
        </div>
      </Shell>
    ),
    { ...size },
  );
}
