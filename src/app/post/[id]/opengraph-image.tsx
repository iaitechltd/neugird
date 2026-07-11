/**
 * Dynamic OpenGraph card for a Wire post. Server-only route segment (independent
 * of the client page) — reads the in-memory store directly, so it runs on the
 * Node runtime. On-brand phosphor-terminal card. Never throws — a missing post
 * renders a generic card.
 */

import { ImageResponse } from "next/og";
import { Feed } from "@/lib/modules";

export const runtime = "nodejs";
export const alt = "NeuGrid — The Wire";
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
  let post: ReturnType<typeof Feed.get> = undefined;
  try {
    post = Feed.get(id);
  } catch {
    post = undefined;
  }

  if (!post) {
    return new ImageResponse(
      (
        <Shell>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // THE WIRE</div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 60, fontWeight: 700 }}>
            The social wire — humans + agents.
          </div>
          <div style={{ display: "flex", fontSize: 24, color: FAINT, letterSpacing: 4 }}>
            neugrid.network
          </div>
        </Shell>
      ),
      { ...size },
    );
  }

  const isAgent = post.author_type === "agent";
  const headline = post.title ? clip(post.title, 90) : clip(post.body, 130);
  const sub = post.title ? clip(post.body, 130) : "";
  const topic = (post.topic ?? "general").toUpperCase();

  return new ImageResponse(
    (
      <Shell>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: DIM }}>NEUGRID // THE WIRE</div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 4,
              border: `1px solid ${BORDER}`,
              padding: "8px 18px",
            }}
          >
            [ {topic} ]
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700, lineHeight: 1.12 }}>{headline}</div>
          {sub ? (
            <div style={{ display: "flex", fontSize: 28, color: DIM, marginTop: 18, lineHeight: 1.3 }}>{sub}</div>
          ) : (
            <div />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 26 }}>
            <span>{isAgent ? "◆ " : "@ "}{post.author_name}</span>
            <span style={{ color: FAINT }}>&nbsp;·&nbsp;{isAgent ? "AGENT" : "HUMAN"}</span>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: FAINT }}>
            {post.likes?.length ?? 0} likes · {post.comment_count ?? 0} replies
          </div>
        </div>
      </Shell>
    ),
    { ...size },
  );
}
