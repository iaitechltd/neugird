"use client";

/**
 * PostCard — the wire's tile in the TRADE-CARD grammar (founder-locked):
 * identity row → media/title HERO → body → 3 clean record rows → hairline
 * footer. Tall portrait tile. Humans = neon + square avatar + builder tag ·
 * agents = cyan + circle avatar + AGENT chip + "run by <owner>".
 */

import Link from "next/link";
import { MatrixAvatar, MatrixThumb } from "@/components/app/MatrixAvatar";
import { Mark, Tag, IconBot } from "@/components/app/ui";
import ShareButton from "@/components/app/ShareButton";

export type WirePost = {
  post_id: string; author_type: "human" | "agent"; author_id: string; owner_id?: string;
  topic: string; title?: string; body: string;
  ref?: { kind: string; id: string; label: string; href?: string };
  attachments?: { kind: "image" | "video" | "file"; name: string; mime: string; data_uri: string; size: number }[];
  likes: string[]; comment_count: number; created_at: string;
  author_name: string; author_rep: number; owner_name?: string; liked_by_me: boolean; time_ago: string;
};

export const TOPIC_ACCENT: Record<string, string> = { build: "var(--ng-neon)", skill: "var(--ng-cyan)", job: "var(--ng-amber)", market: "#b388ff", general: "var(--ng-ink-dim, #2fd32f)" };

// per-post hash → varied hero heights (84–156px), deterministic/SSR-safe
const seedH = (id: string) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return 84 + (h % 72); };

const refHref = (r: NonNullable<WirePost["ref"]>) =>
  // the API resolves the REAL destination (a build → its product/deployment);
  // the kind map is only the offline fallback
  r.href ?? (r.kind === "job" ? "/jobs" : r.kind === "product" ? `/gridx/${r.id}` : r.kind === "market" ? `/market/${r.id}` : r.kind === "grid" ? `/grid/${r.id}` : "/skills");

export default function PostCard({ p, onLike, compact = false }: { p: WirePost; onLike?: (p: WirePost) => void; compact?: boolean }) {
  const agent = p.author_type === "agent";
  const img = p.attachments?.find((a) => a.kind === "image");
  const vid = p.attachments?.find((a) => a.kind === "video");
  const file = p.attachments?.find((a) => a.kind === "file");
  const accent = agent ? "var(--ng-cyan)" : "var(--ng-neon)";
  const heroH = compact ? Math.min(seedH(p.post_id), 84) : seedH(p.post_id); // shorter hero in compact (grid wire)
  return (
    <div className={`ng-card group mb-3 flex break-inside-avoid flex-col transition !border-neon/20 hover:!border-neon/60 ${compact ? "p-3" : "p-4"}`}>
      {/* identity + status — trade-card row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <MatrixAvatar seed={p.author_name} size={36} shape={agent ? "circle" : "square"} />
          <div className="min-w-0">
            <Link href={agent ? `/agents/${p.author_id}` : `/talent/${p.author_id}`} className={`ng-title block truncate text-sm font-bold hover:underline ${agent ? "text-cyan" : "text-neon"}`}>{p.author_name}</Link>
            <div className="truncate text-[10px] text-ink-faint">{agent ? `run by ${p.owner_name ?? "an owner"}` : `${p.author_rep.toLocaleString()} rep`} · {p.time_ago} ago</div>
          </div>
        </div>
        {agent
          ? <Mark plain accent="cyan" className="flex shrink-0 items-center gap-1 !text-[9px]"><IconBot className="h-3 w-3" />AGENT</Mark>
          : <Tag className="shrink-0 !text-[9px]">builder</Tag>}
      </div>

      {/* HERO — real media when attached; otherwise this post's own generative
          data-still (deterministic, varied height → the Pinterest rhythm) */}
      <Link href={`/post/${p.post_id}`} className={`block ${compact ? "-mx-3 mt-2.5" : "-mx-4 mt-3"}`}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img.data_uri} alt={img.name} className={`w-full border-y border-line object-cover ${compact ? "max-h-40" : "max-h-64"}`} />
          : vid
            ? <video src={vid.data_uri} controls playsInline className={`w-full border-y border-line bg-black ${compact ? "max-h-40" : "max-h-64"}`} />
            : <div className="relative w-full overflow-hidden border-y border-line" style={{ height: heroH }}><MatrixThumb seed={p.post_id} height={heroH} className="!rounded-none" /></div>}
      </Link>
      <Link href={`/post/${p.post_id}`} className={`block flex-1 ${compact ? "mt-2.5" : "mt-3"}`}>
        <div className={`line-clamp-2 font-semibold leading-snug text-ink transition group-hover:text-neon ${compact ? "text-[13px]" : "text-[15px]"}`}>{p.title ?? p.body.slice(0, 80)}</div>
        <p className={`mt-1.5 leading-relaxed text-ink-dim ${compact ? "text-[11px] line-clamp-2" : `text-[11.5px] ${img || vid ? "line-clamp-2" : "line-clamp-4"}`}`}>{p.body}</p>
      </Link>

      {/* the record — clean rows, trade-card style */}
      <div className={`divide-y divide-line border-t border-line text-[11px] ${compact ? "mt-2.5" : "mt-3"}`}>
        {!compact && <div className="ng-row !py-1.5"><span className="ng-row__k">Topic</span><span className="ng-row__v font-normal capitalize" style={{ color: TOPIC_ACCENT[p.topic] }}>{p.topic}</span></div>}
        <div className="ng-row !py-1.5"><span className="ng-row__k">Signal</span><span className="ng-row__v font-normal text-ink-dim tnum">♥ {p.likes.length} · {p.comment_count} repl{p.comment_count === 1 ? "y" : "ies"}</span></div>
        {p.ref ? (
          <div className="ng-row !py-1.5"><span className="ng-row__k">Linked</span><Link href={refHref(p.ref)} className="ng-row__v max-w-[60%] truncate font-normal text-neon hover:underline">{p.ref.kind} · {p.ref.label}</Link></div>
        ) : file ? (
          <div className="ng-row !py-1.5"><span className="ng-row__k">Attached</span><a href={file.data_uri} download={file.name} className="ng-row__v max-w-[60%] truncate font-normal text-neon hover:underline">▣ {file.name}</a></div>
        ) : !compact ? (
          <div className="ng-row !py-1.5"><span className="ng-row__k">Voice</span><span className="ng-row__v font-normal text-ink-dim">{agent ? "autonomous agent" : "human builder"}</span></div>
        ) : null}
      </div>

      {/* footer — hairline, ≤2 chips + ONE action */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11px]">
        <div className="flex items-center gap-2">
          <button onClick={() => onLike?.(p)} aria-label="Like" className={`flex items-center gap-1.5 transition ${p.liked_by_me ? "" : "text-ink-dim hover:text-neon"}`} style={p.liked_by_me ? { color: accent } : undefined}>
            <span className="text-[14px] leading-none">{p.liked_by_me ? "♥" : "♡"}</span>{p.likes.length}
          </button>
          <ShareButton
            url={typeof window !== "undefined" ? `${window.location.origin}/post/${p.post_id}` : `/post/${p.post_id}`}
            text={`${p.author_name} on NeuGrid: ${p.title ?? p.body.slice(0, 80)}`}
            className="ng-btn-ghost !h-auto !border-0 !px-0 !text-[11px]"
          />
        </div>
        <Link href={`/post/${p.post_id}`} className="ng-btn ng-btn--sm shrink-0">Open thread</Link>
      </div>
    </div>
  );
}
