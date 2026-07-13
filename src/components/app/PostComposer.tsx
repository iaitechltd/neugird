"use client";

/**
 * PostComposer — the HUMAN publisher, compact X-style: avatar rail, borderless
 * canvas, 2-col media grid, icon toolbar (image · video · file), topic pill,
 * live counter, one Post action. Agents never post from here — their owners
 * arm "Auto-post" on the agent's page (3/day, from its skills + vision).
 */

import { useEffect, useRef, useState } from "react";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import { Bracket, IconClose } from "@/components/app/ui";
import { Typewriter } from "@/components/app/typefx";

type Attachment = { kind: "image" | "video" | "file"; name: string; mime: string; data_uri: string; size: number };
const MAX_FILES = 4;
const MAX_BYTES = 2_500_000;
const MAX_CHARS = 1200;
const TOPICS = ["build", "skill", "job", "market", "general"] as const;

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const IImage = () => <svg {...S}><rect x="3" y="4" width="18" height="16" /><circle cx="8.6" cy="9.6" r="1.6" /><path d="M3 17.5 9 12l4 4 3.5-3.5L21 17" /></svg>;
const IVideo = () => <svg {...S}><rect x="3" y="5.5" width="13.5" height="13" /><path d="M16.5 10.5 21 7.5v9l-4.5-3" /></svg>;
const IFile = () => <svg {...S}><path d="M13.5 3H6v18h12V7.5L13.5 3Z" /><path d="M13.5 3v4.5H18" /></svg>;

export default function PostComposer({ onPosted, notify, grid_id, placeholder }: { onPosted?: () => void; notify?: (m: string) => void; grid_id?: string; placeholder?: string }) {
  const [me, setMe] = useState<{ username?: string }>({});
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {}); }, []);

  const [body, setBody] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("build");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const left = MAX_CHARS - body.length;

  function pick(accept: string) {
    if (!fileInput.current) return;
    fileInput.current.accept = accept;
    fileInput.current.click();
  }
  function addFiles(list: FileList | null) {
    if (!list) return;
    [...list].slice(0, MAX_FILES - files.length).forEach((f) => {
      if (f.size > MAX_BYTES) { notify?.(`${f.name} is over 2.5MB — skipped`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const kind: Attachment["kind"] = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "file";
        setFiles((cur) => cur.length < MAX_FILES ? [...cur, { kind, name: f.name, mime: f.type || "application/octet-stream", data_uri: String(reader.result), size: f.size }] : cur);
      };
      reader.readAsDataURL(f);
    });
  }
  function autoGrow() {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(180, Math.max(44, el.scrollHeight))}px`;
  }

  async function publish() {
    if (!body.trim() || busy || left < 0) return;
    setBusy(true);
    try {
      const firstLine = body.trim().split("\n")[0];
      const rest = body.trim().split("\n").slice(1).join("\n").trim();
      const r = await fetch("/api/feed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: rest || firstLine, title: rest ? firstLine.slice(0, 120) : undefined, topic, attachments: files.length ? files : undefined, grid_id }) });
      if (r.ok) {
        setBody(""); setFiles([]);
        if (bodyRef.current) bodyRef.current.style.height = "44px";
        notify?.(grid_id ? "Posted to the community · +2 Pulse (first 3/day)" : "Posted to the wire · +2 Pulse (first 3/day)");
        onPosted?.();
      } else notify?.("Post failed");
    } catch { notify?.("Post failed"); }
    setBusy(false);
  }

  return (
    <Bracket className="bg-neon/[0.015] p-3.5">
      <div className="flex gap-2.5">
        <MatrixAvatar seed={me.username ?? "you"} size={32} shape="square" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="relative">
            {body === "" && (
              <span aria-hidden className="pointer-events-none absolute left-0 top-1 text-[14px] text-ink-faint">
                <Typewriter text={placeholder ?? "What are you building? First line becomes the headline…"} speed={30} loop pause={2600} />
              </span>
            )}
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => { setBody(e.target.value.slice(0, MAX_CHARS + 100)); autoGrow(); }}
              aria-label="Write a post"
              className="h-[44px] w-full resize-none bg-transparent pt-1 text-[14px] leading-relaxed text-ink focus:outline-none"
            />
          </div>

          {files.length > 0 && (
            <div className={`mt-1.5 grid gap-1.5 ${files.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative overflow-hidden border border-line">
                  {f.kind === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={f.data_uri} alt={f.name} className={`w-full object-cover ${files.length === 1 ? "max-h-48" : "h-24"}`} />
                    : f.kind === "video"
                      ? <video src={f.data_uri} controls playsInline className={`w-full bg-black object-cover ${files.length === 1 ? "max-h-48" : "h-24"}`} />
                      : <div className="flex h-24 flex-col items-center justify-center gap-1 px-2 text-center text-[10px] text-ink-dim"><IFile /><span className="max-w-full truncate">{f.name}</span></div>}
                  <button onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center border border-line bg-black/80 text-ink-dim transition hover:text-danger"><IconClose className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center gap-0.5 border-t border-line pt-1.5">
            <input ref={fileInput} type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} className="hidden" />
            <button onClick={() => pick("image/*")} disabled={files.length >= MAX_FILES} title="Add image" aria-label="Add image" className="grid h-7 w-7 place-items-center text-neon transition hover:bg-neon/10 disabled:opacity-30"><IImage /></button>
            <button onClick={() => pick("video/*")} disabled={files.length >= MAX_FILES} title="Add video" aria-label="Add video" className="grid h-7 w-7 place-items-center text-neon transition hover:bg-neon/10 disabled:opacity-30"><IVideo /></button>
            <button onClick={() => pick("*/*")} disabled={files.length >= MAX_FILES} title="Attach file" aria-label="Attach file" className="grid h-7 w-7 place-items-center text-neon transition hover:bg-neon/10 disabled:opacity-30"><IFile /></button>
            <span className="mx-1 h-4 w-px bg-line" />
            <div className="relative inline-flex items-center border border-line px-1.5 py-0.5 text-[10px] text-ink-dim transition hover:border-neon/40 hover:text-neon">
              <select value={topic} onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])} aria-label="Topic" className="cursor-pointer appearance-none bg-transparent pr-3 capitalize focus:outline-none">
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="pointer-events-none absolute right-1 text-[8px]">▾</span>
            </div>
            <span className={`ml-auto text-[10px] tnum ${left < 0 ? "text-danger" : left < 120 ? "text-amber" : "text-ink-faint"}`}>{left}</span>
            <button onClick={publish} disabled={busy || !body.trim() || left < 0} className="ng-btn ng-btn-primary !px-4 !py-1 !text-[11.5px] font-bold disabled:opacity-40">{busy ? "…" : "Post"}</button>
          </div>
        </div>
      </div>
    </Bracket>
  );
}
