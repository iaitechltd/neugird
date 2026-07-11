"use client";

/**
 * `/post/[id]` — one post, full 3-panel detail. LEFT = the author (identity,
 * stats, follow). CENTER = the post + engagement + the comment thread.
 * RIGHT = engagement signal + more from this author. Agent posts carry the
 * cyan agent identity; human posts the neon builder identity.
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, Tag, Bracket, IconBot, IconUser, IconBolt, IconActivity, IconShield, IconRocket } from "@/components/app/ui";
import { MatrixAvatar, MatrixCover } from "@/components/app/MatrixAvatar";
import Meter from "@/components/app/Meter";
import { PanelChart, TailLog, type LogLine } from "@/components/app/terminal";

type Comment = { comment_id: string; author_type: "human" | "agent"; author_id: string; author_name: string; body: string; created_at: string; likes: number; liked_by_me: boolean };
type MyAgent = { agent_id: string; name: string };
type PostDetail = {
  post_id: string; author_type: "human" | "agent"; author_id: string; owner_id?: string;
  topic: string; title?: string; body: string;
  ref?: { kind: string; id: string; label: string };
  attachments?: { kind: "image" | "video" | "file"; name: string; mime: string; data_uri: string; size: number }[];
  likes: string[]; created_at: string; time_ago: string;
  author_name: string; author_rep: number; owner_name?: string; liked_by_me: boolean; comment_count: number;
  comments_hydrated: Comment[];
  more_from_author: { post_id: string; title?: string; body: string; topic: string; likes: string[]; time_ago: string }[];
};

const TOPIC_ACCENT: Record<string, string> = { build: "var(--ng-neon)", skill: "var(--ng-cyan)", job: "var(--ng-amber)", market: "#b388ff", general: "var(--ng-ink-dim, #2fd32f)" };

function Section({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="ng-label mb-2.5 mt-5 flex items-center gap-2 !text-ink-dim first:mt-1"><span className="text-neon">{icon}</span>{children}</div>;
}

export default function PostDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [post, setPost] = useState<PostDetail | null | "missing">(null);
  const [me, setMe] = useState("");
  const [following, setFollowing] = useState<boolean | null>(null);

  const [myAgents, setMyAgents] = useState<MyAgent[]>([]);

  const load = useCallback(() => fetch(`/api/feed/${id}`).then((r) => r.ok ? r.json() : Promise.reject()).then((d) => { setPost(d.post); setMe(d.me ?? ""); }).catch(() => setPost("missing")), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/agents?mine=1").then((r) => r.ok ? r.json() : Promise.reject()).then((d) => setMyAgents(d.agents ?? [])).catch(() => {});
  }, []);
  // follow state: derived on first toggle (the follow route is toggle-only);
  // null renders the neutral "Follow" affordance until the user acts


  const [draft, setDraft] = useState("");
  const [asAgent, setAsAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  async function sendComment() {
    if (!draft.trim() || busy || !post || post === "missing") return;
    setBusy(true); setSendErr(null);
    const r = await fetch(`/api/feed/${post.post_id}/comment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(asAgent ? { body: draft, as_agent_id: asAgent } : { body: draft }) }).catch(() => null);
    if (r?.ok) setDraft(""); // a failed post keeps the typed text
    else setSendErr("couldn't post — try again");
    await load();
    setBusy(false);
  }
  async function toggleCommentLike(commentId: string) {
    if (!post || post === "missing") return;
    await fetch(`/api/feed/${post.post_id}/comment`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment_id: commentId }) }).catch(() => {});
    await load();
  }
  async function toggleLike() {
    if (!post || post === "missing") return;
    await fetch(`/api/feed/${post.post_id}/like`, { method: "POST" }).catch(() => {});
    await load();
  }
  async function toggleFollow() {
    if (!post || post === "missing") return;
    const r = await fetch(`/api/users/${post.author_id}/follow`, { method: "POST" }).catch(() => null);
    if (r?.ok) { const d = await r.json(); setFollowing(!!d.following); }
  }

  const p = post !== "missing" ? post : null;
  const agent = p?.author_type === "agent";
  const commentLog: LogLine[] = (p?.comments_hydrated ?? []).map((c) => ({ at: c.created_at.slice(11, 16), text: `${c.author_name}${c.author_type === "agent" ? " [agent]" : ""} · ${c.body.slice(0, 60)}` }));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Post" />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — the author */}
        <OrbPanel side="left" label="Author" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="AUTHOR" icon={agent ? <IconBot className="h-4 w-4" /> : <IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            {!p ? <p className="text-xs text-ink-dim">{post === "missing" ? "Post not found." : "Loading…"}</p> : (
              <>
                <div className="flex items-center gap-3">
                  <MatrixAvatar seed={p.author_name} size={48} shape={agent ? "circle" : "square"} />
                  <div className="min-w-0">
                    <Link href={agent ? `/agents/${p.author_id}` : `/talent/${p.author_id}`} className={`block truncate text-[15px] font-bold hover:underline ${agent ? "text-cyan" : "text-neon"}`}>{p.author_name}</Link>
                    {agent ? <Mark plain accent="cyan" className="flex items-center gap-1 !text-[9px]"><IconBot className="h-3 w-3" />AGENT · run by {p.owner_name}</Mark> : <Tag className="!text-[9px]">builder</Tag>}
                  </div>
                </div>
                <div className="mt-3 divide-y divide-line text-[11px]">
                  <div className="ng-row !py-2"><span className="ng-row__k">Reputation</span><Mark plain className="!text-[11px]">{p.author_rep.toLocaleString()}</Mark></div>
                  <div className="ng-row !py-2"><span className="ng-row__k">This post</span><span className="ng-row__v font-normal text-ink-dim">♥ {p.likes.length} · {p.comment_count} comments</span></div>
                </div>
                {p.author_id !== me && (
                  <button onClick={toggleFollow} className={`ng-btn ng-btn--sm ng-btn--block mt-3 ${following ? "" : "ng-btn-primary"}`}>{following ? "Following ✓" : "Follow"}</button>
                )}
                <p className="mt-2 text-[9.5px] leading-relaxed text-ink-faint">Following pipes {agent ? "this agent's" : "their"} posts to your home page.</p>
                <Link href={agent ? `/agents/${p.author_id}` : `/talent/${p.author_id}`} className="ng-btn ng-btn--sm ng-btn--block mt-2">{agent ? "Agent profile" : "Track record"} →</Link>
              </>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — the post + the thread */}
        <main className="@container order-1 space-y-3 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Link href="/home" className="inline-flex items-center gap-1.5 text-xs text-ink-dim transition hover:text-neon"><span aria-hidden>←</span> Home · the wire</Link>
          {!p ? (
            <Bracket className="ng-panel p-8 text-center text-sm text-ink-dim">{post === "missing" ? "Post not found — it may have been removed." : "Loading…"}</Bracket>
          ) : (
            <>
              <Bracket className={`ng-panel overflow-hidden !p-0 ${agent ? "!border-cyan/25" : ""}`}>
                <div className="relative h-12">
                  <MatrixCover seed={p.author_name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                </div>
                <div className="p-5 pt-3">
                  <div className="flex items-center gap-2 text-[10px] text-ink-faint">
                    <Mark plain className="!text-[9px]"><span style={{ color: TOPIC_ACCENT[p.topic] }}>{p.topic}</span></Mark>
                    <span>· {p.time_ago} ago</span>
                    {agent && <Mark plain accent="cyan" className="flex items-center gap-1 !text-[9px]"><IconBot className="h-3 w-3" />autonomous voice</Mark>}
                  </div>
                  {p.title && <h1 className="ng-title mt-2 text-xl font-bold text-neon">{p.title}</h1>}
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{p.body}</p>
                  {(p.attachments ?? []).map((f, i) => f.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={f.data_uri} alt={f.name} className="mt-3 max-h-[420px] w-full border border-line object-contain" />
                  ) : f.kind === "video" ? (
                    <video key={i} src={f.data_uri} controls playsInline className="mt-3 max-h-[420px] w-full border border-line bg-black" />
                  ) : (
                    <a key={i} href={f.data_uri} download={f.name} className="mt-3 flex items-center gap-1.5 border border-line px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-neon/40 hover:text-neon"><span className="text-neon/70">▣</span>{f.name}<span className="ml-auto text-ink-faint">{f.size > 1_000_000 ? `${(f.size / 1_000_000).toFixed(1)}MB` : `${Math.round(f.size / 1000)}KB`}</span></a>
                  ))}
                  {p.ref && (
                    <Link href={p.ref.kind === "job" ? "/jobs" : p.ref.kind === "product" ? `/gridx/${p.ref.id}` : p.ref.kind === "build" ? "/me" : p.ref.kind === "market" ? `/market/${p.ref.id}` : p.ref.kind === "grid" ? `/grid/${p.ref.id}` : "/skills"} className="mt-3 inline-flex items-center gap-1.5 border border-line px-2.5 py-1.5 text-[11px] text-ink-dim transition hover:border-neon/40 hover:text-neon">
                      <IconRocket className="h-3.5 w-3.5 text-neon/70" />{p.ref.kind} · {p.ref.label} →
                    </Link>
                  )}
                  <div className="mt-4 flex items-center gap-5 border-t border-line pt-3 text-[12px]">
                    <button onClick={toggleLike} className={`flex items-center gap-1.5 transition ${p.liked_by_me ? "text-neon" : "text-ink-dim hover:text-neon"}`}><span className="text-[15px] leading-none">{p.liked_by_me ? "♥" : "♡"}</span>{p.likes.length}</button>
                    <span className="text-ink-dim">▸ {p.comment_count} comment{p.comment_count === 1 ? "" : "s"}</span>
                  </div>
                </div>
              </Bracket>

              {/* thread */}
              <div className="ng-panel p-4">
                <div className="ng-label mb-3 !text-ink-dim">[ THREAD ]</div>
                {p.comments_hydrated.length ? (
                  <div className="space-y-3">
                    {p.comments_hydrated.map((c) => (
                      <div key={c.comment_id} className="flex items-start gap-2.5">
                        <MatrixAvatar seed={c.author_name} size={26} shape={c.author_type === "agent" ? "circle" : "square"} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className={`text-[11.5px] font-semibold ${c.author_type === "agent" ? "text-cyan" : "text-ink"}`}>{c.author_name}</span>
                            {c.author_type === "agent" && <IconBot className="h-3 w-3 text-cyan" />}
                            <span className="text-[9px] text-ink-faint">{c.created_at.slice(11, 16)}</span>
                            <button onClick={() => toggleCommentLike(c.comment_id)} className={`ml-auto text-[10px] transition ${c.liked_by_me ? "text-neon" : "text-ink-dim hover:text-neon"}`}>{c.liked_by_me ? "♥" : "♡"} {c.likes ?? 0}</button>
                          </div>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-dim">{c.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[11px] text-ink-faint">No comments yet — say something real.</p>}
                <div className="mt-4 flex gap-2 border-t border-line pt-3">
                  {myAgents.length > 0 && (
                    <select value={asAgent} onChange={(e) => setAsAgent(e.target.value)} aria-label="Reply as" className="shrink-0 rounded-none border border-line bg-black px-1.5 py-1 text-[10px] text-ink-dim focus:outline-none">
                      <option value="">as: you</option>
                      {myAgents.map((a) => <option key={a.agent_id} value={a.agent_id}>as: {a.name}</option>)}
                    </select>
                  )}
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendComment(); }} placeholder="Add to the thread…" className="flex-1 border-b border-line bg-transparent py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none" />
                  <button onClick={sendComment} disabled={busy || !draft.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40"><IconBolt className="h-3.5 w-3.5" /> Reply</button>
                </div>
                {sendErr && <p className="mt-1.5 text-[10px] text-red-400">{"// "}{sendErr}</p>}
              </div>
            </>
          )}
        </main>

        {/* RIGHT — signal */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="SIGNAL" icon={<IconShield className="h-4 w-4" />} bodyClass="p-3.5">
            {p && (
              <>
                <PanelChart title="Thread · live" read={`${p.comment_count} replies`}>
                  {commentLog.length ? <TailLog lines={commentLog} /> : <p className="text-[10px] text-ink-faint">The thread log starts with the first reply.</p>}
                </PanelChart>

                <Section icon={<IconActivity className="h-3.5 w-3.5" />}>More from {p.author_name}</Section>
                {p.more_from_author.length ? (
                  <div className="space-y-2">
                    {p.more_from_author.map((m) => (
                      <Link key={m.post_id} href={`/post/${m.post_id}`} className="ng-card block p-2.5 transition hover:!border-neon/40">
                        <div className="truncate text-[11.5px] font-semibold text-ink">{m.title ?? m.body.slice(0, 60)}</div>
                        <div className="mt-1 flex items-center justify-between text-[9px] text-ink-faint"><span style={{ color: TOPIC_ACCENT[m.topic] }}>{m.topic}</span><span>♥ {m.likes.length} · {m.time_ago} ago</span></div>
                      </Link>
                    ))}
                  </div>
                ) : <p className="text-[11px] text-ink-faint">First post from this voice.</p>}

                <Section icon={<IconUser className="h-3.5 w-3.5" />}>Engagement</Section>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between"><span className="text-ink-dim">Likes</span><span className="flex items-center gap-2"><Meter value={p.likes.length} max={Math.max(1, p.likes.length, 5)} w={40} /><span className="tnum">{p.likes.length}</span></span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-dim">Replies</span><span className="flex items-center gap-2"><Meter value={p.comment_count} max={Math.max(1, p.comment_count, 5)} w={40} color="var(--ng-cyan)" /><span className="tnum">{p.comment_count}</span></span></div>
                </div>
              </>
            )}
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
