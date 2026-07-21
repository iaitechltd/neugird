"use client";

/**
 * Messages — the universal messenger. Every 1:1 interaction lives here: humans and
 * agents chat, and either side can send a deal / hire OFFER that the other accepts
 * or declines inside the thread. 3-panel HUD: conversation list (left) · the active
 * thread + composer (center) · the counterparty's identity & history (right).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, Tag, DataRow, IconMessage, IconBot, IconUser, IconCoins, IconArrowRight, IconCheck, IconClose, IconPlus, IconPaperclip } from "@/components/app/ui";
import { CountUp } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";

type Party = { id: string; type: "user" | "agent"; name: string; origin?: "native" | "external"; reputation?: number; rating?: number; trust_tier?: string; owner_name?: string; earnings?: number; jobs?: number; skills?: string[]; capabilities?: string[]; grids?: number; bio?: string; href: string };
type Offer = { offer_kind: "deal" | "hire"; amount: number; asset?: string; terms: string; success_metric?: string; status: "pending" | "accepted" | "declined"; result_ref?: string; result_kind?: "job" | "agreement" };
type Attachment = { name: string; mime: string; size: number; data_uri: string };
type Transfer = { amount: number; asset: string; settlement_id: string; status: string };
type HireJob = { job_id: string; status: string; amount: number; asset: string; escrow_locked: boolean; is_worker: boolean; is_hirer: boolean; delivery_note?: string; submitted_at?: string; auto_release_at?: string; dispute_deadline?: string };
type Msg = { message_id: string; from_id: string; mine: boolean; from_name: string; kind: "text" | "deal" | "hire" | "transfer"; body: string; offer?: Offer; job?: HireJob | null; attachment?: Attachment; transfer?: Transfer; ago: string };
type Ctx = { label: string; href?: string } | null;
type DealRow = { id: string; kind: "deal" | "hire"; amount: number; asset?: string; terms: string; status: string };
type Convo = { conversation_id: string; counterparty: Party; context: Ctx; last_text: string; last_ago: string; unread: number; pending_offer: boolean };
type Thread = { conversation_id: string; counterparty: Party; context: Ctx; deals: DealRow[]; messages: Msg[] };
type DirEntry = { id: string; name: string; type: "user" | "agent"; origin?: "native" | "external" };

const money = (n: number, asset?: string) => `${n.toLocaleString()}${asset ? ` ${asset}` : ""}`;
/** "in 4d" / "in 6h" / "soon" — client-only (thread loads after mount, so no hydration issue). */
const relTime = (iso?: string) => {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "soon";
  const d = Math.floor(ms / 86_400_000), h = Math.floor((ms % 86_400_000) / 3_600_000);
  return d > 0 ? `in ${d}d` : h > 0 ? `in ${h}h` : "soon";
};

export default function MessagesPage() {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [directory, setDirectory] = useState<DirEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"text" | "deal" | "hire" | "pay">("text");
  const [offer, setOffer] = useState({ amount: "", asset: "USDC", terms: "", success_metric: "" });
  const [payAmount, setPayAmount] = useState("");
  const [payErr, setPayErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [deliverFor, setDeliverFor] = useState<string | null>(null); // message_id whose delivery composer is open
  const [pending, setPending] = useState<{ text: string; agent: string } | null>(null); // the honest wait: a native agent composes its reply server-side (3-6s)
  const [deliverNote, setDeliverNote] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [composing, setComposing] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConvos = () => fetch("/api/messages").then((r) => r.json()).then((d) => {
    const list = d.conversations ?? [];
    setConvos(list);
    setDirectory(d.directory ?? []);
    // default to the LATEST conversation on first load (unless a ?to= deep-link
    // is opening a specific one). `cur ?? …` only fills the initial null, so
    // polling never yanks the user off the thread they're reading.
    const deepLink = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("to");
    if (!deepLink) setActiveId((cur) => cur ?? (list[0]?.conversation_id ?? null));
  }).catch(() => {});
  useEffect(() => {
    loadConvos();
    const iv = window.setInterval(loadConvos, 5000);
    return () => window.clearInterval(iv);
  }, []);

  // Deep-link: /messages?to=<user|agent id> opens (or starts) that conversation —
  // the entry point every "Message"/"Contact admin" button across the app routes to.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const to = q.get("to");
    if (!to) return;
    const ctxLabel = q.get("ctx");
    const context = ctxLabel ? { label: ctxLabel, href: q.get("ctxHref") || undefined } : undefined;
    // ?hire=<scope> opens the thread with the HIRE offer composer already loaded —
    // "Hire" buttons across the app land people one step from a real escrowed offer
    const hire = q.get("hire");
    let alive = true;
    fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_id: to, context }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.conversation_id) return;
        setActiveId(d.conversation_id);
        if (hire !== null) { setMode("hire"); if (hire) setOffer((o) => ({ ...o, terms: hire.slice(0, 140) })); }
        loadConvos();
        window.history.replaceState({}, "", "/messages");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // load + poll the active thread
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    const load = () => fetch(`/api/messages/${activeId}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.conversation_id) setThread(d); }).catch(() => {});
    load();
    const iv = window.setInterval(load, 4000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [activeId]);

  // auto-scroll to newest
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [thread?.messages.length, activeId, pending]);

  const ATTACH_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,text/csv,application/json,application/zip";
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // re-pickable
    if (!f) return;
    setAttachErr(null);
    if (f.size > 512 * 1024) { setAttachErr("Max 512KB — send a link for anything bigger."); return; }
    if (!ATTACH_ACCEPT.split(",").includes(f.type)) { setAttachErr("Images, PDF, text, JSON, CSV or ZIP only."); return; }
    const reader = new FileReader();
    reader.onload = () => setAttach({ name: f.name, mime: f.type, size: f.size, data_uri: String(reader.result) });
    reader.readAsDataURL(f);
  }

  async function sendMessage() {
    if (!activeId || busy) return;
    const isOffer = mode === "deal" || mode === "hire";
    const isPay = mode === "pay";
    if (isOffer && !offer.terms.trim()) return;
    if (isPay && !(Number(payAmount) > 0)) return;
    if (!isOffer && !isPay && !draft.trim() && !attach) return;
    setBusy(true);
    setPayErr(null);
    // a NATIVE agent writes its reply before the request returns — show that wait
    // honestly (your bubble + a composing line) instead of 3-6s of dead air
    const cpNow = thread?.counterparty;
    if (!isOffer && !isPay && cpNow?.type === "agent" && cpNow.origin !== "external") {
      setPending({ text: draft.trim() || "📎 attachment", agent: cpNow.name });
    }
    const payload = isOffer
      ? { kind: mode, body: draft.trim(), offer: { amount: Number(offer.amount) || 0, asset: offer.asset, terms: offer.terms.trim(), success_metric: mode === "deal" ? offer.success_metric.trim() : undefined } }
      : isPay
        ? { kind: "transfer", body: draft.trim(), transfer: { amount: Number(payAmount) } }
        : { kind: "text", body: draft.trim(), attachment: attach ?? undefined };
    const r = await fetch(`/api/messages/${activeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setPending(null);
    if (r?.conversation_id) { setThread(r); setDraft(""); setAttach(null); setOffer({ amount: "", asset: "USDC", terms: "", success_metric: "" }); setPayAmount(""); setMode("text"); loadConvos(); }
    else if (isPay && r?.error) setPayErr(r.error === "insufficient_usdc" ? "Not enough USDC in your wallet." : "Transfer failed — check the amount.");
  }
  async function resolveOffer(message_id: string, accept: boolean) {
    if (!activeId) return;
    const r = await fetch(`/api/messages/${activeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", message_id, accept }) }).then((x) => x.json()).catch(() => null);
    if (r?.conversation_id) { setThread(r); loadConvos(); }
  }
  // in-chat hire lifecycle — the worker submits the delivery; the hirer approves (escrow
  // releases) or disputes. All settle the escrowed Job behind the offer card.
  async function deliverWork(message_id: string) {
    if (!activeId || busy) return;
    setBusy(true);
    const note = (deliverNote[message_id] ?? "").trim();
    const r = await fetch(`/api/messages/${activeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deliver", message_id, note }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.conversation_id) { setThread(r); setDeliverFor(null); setDeliverNote((d) => ({ ...d, [message_id]: "" })); loadConvos(); }
  }
  async function reviewWork(message_id: string, approve: boolean) {
    if (!activeId || busy) return;
    setBusy(true);
    const r = await fetch(`/api/messages/${activeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: approve ? "approve" : "dispute", message_id }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.conversation_id) { setThread(r); loadConvos(); }
  }
  async function startConversation() {
    if (!newTo || busy) return;
    setBusy(true);
    const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_id: newTo, body: "👋" }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.conversation_id) { setComposing(false); setNewTo(""); await loadConvos(); setActiveId(r.conversation_id); }
  }

  const cp = thread?.counterparty;
  const totalUnread = useMemo(() => convos.reduce((n, c) => n + c.unread, 0), [convos]);
  const kpis: [string, number, string?][] = [
    ["Conversations", convos.length],
    ["Unread", totalUnread],
    ["Agents", convos.filter((c) => c.counterparty.type === "agent").length],
    ["Humans", convos.filter((c) => c.counterparty.type === "user").length],
    ["Open Offers", convos.filter((c) => c.pending_offer).length],
  ];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Messages" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — conversation list */}
        <OrbPanel side="left" label="Inbox" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[330px]">
          <Panel scroll title={`MESSAGES${totalUnread ? ` · ${totalUnread}` : ""}`} icon={<IconMessage className="h-4 w-4" />} bodyClass="p-2.5"
            action={<button onClick={() => setComposing((v) => !v)} className="ng-btn ng-btn--sm">{composing ? "Cancel" : "+ New"}</button>}>
            {/* inbox KPIs — compact 3-wide (chat center has no title block; strip lives in the list pane) */}
            <div className="mb-2.5 grid grid-cols-3 gap-1.5">
              {kpis.slice(0, 3).map(([k, v, unit]) => (
                <div key={k} className="ng-card p-2.5 text-center">
                  <div className="ng-stat__v !text-base">{unit === "$" && <span className="text-cyan">$</span>}<CountUp key={v} value={v} /></div>
                  <div className="ng-stat__k">{k}</div>
                </div>
              ))}
            </div>
            {composing && (
              <div className="mb-2.5 space-y-2 rounded border border-line p-2.5">
                <select value={newTo} onChange={(e) => setNewTo(e.target.value)} className="ng-input w-full !py-1.5 text-[12px]">
                  <option value="">Message who…</option>
                  <optgroup label="People">{directory.filter((d) => d.type === "user").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                  <optgroup label="Agents — answer here">{directory.filter((d) => d.type === "agent" && d.origin !== "external").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                  <optgroup label="External shells — won't chat">{directory.filter((d) => d.type === "agent" && d.origin === "external").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
                </select>
                <button onClick={startConversation} disabled={!newTo || busy} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block disabled:opacity-50"><IconPlus className="h-3.5 w-3.5" /> Start</button>
              </div>
            )}
            {convos.length === 0 ? (
              <p className="px-1 py-6 text-center text-[11px] text-ink-dim">No conversations yet — start one to deal, hire, or just talk.</p>
            ) : (
              <div className="space-y-1">
                {convos.map((c) => (
                  <button key={c.conversation_id} onClick={() => setActiveId(c.conversation_id)} className={`flex w-full items-center gap-2.5 rounded p-2 text-left transition ${activeId === c.conversation_id ? "bg-neon/10" : "hover:bg-neon/[0.05]"}`}>
                    <div className="relative shrink-0">
                      <MatrixAvatar seed={c.counterparty.name} size={36} />
                      {c.counterparty.type === "agent" && <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-black text-neon"><IconBot className="h-2.5 w-2.5" /></span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1"><span className="truncate text-[13px] font-semibold text-ink">{c.counterparty.name}</span><span className="shrink-0 text-[9px] text-ink-faint">{c.last_ago}</span></div>
                      {c.context && <div className="truncate text-[9px] text-neon/70">re: {c.context.label}</div>}
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[10.5px] text-ink-dim">{c.last_text}</span>
                        {c.pending_offer && <Mark plain accent="amber" className="!text-[8px] shrink-0">offer</Mark>}
                        {c.unread > 0 && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-neon" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — active thread + composer */}
        <main className="@container order-1 flex min-h-[60vh] flex-col lg:order-2 lg:h-full lg:min-h-0 lg:flex-1">
          {!cp ? (
            <Panel className="flex h-full items-center justify-center"><div className="p-10 text-center"><IconMessage className="mx-auto h-9 w-9 text-neon/40" /><p className="mt-3 text-sm text-ink-dim">Select a conversation, or start a new one.</p><p className="mt-1 text-[11px] text-ink-faint">Chat, pitch a deal, or hire — with people or agents.</p></div></Panel>
          ) : (
            <Panel className="flex h-full min-h-0 flex-col" bodyClass="flex min-h-0 flex-1 flex-col p-0">
              {/* counterparty header */}
              <div className="flex shrink-0 items-center gap-2.5 border-b border-line p-3">
                <MatrixAvatar seed={cp.name} size={32} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-sm font-bold text-ink">{cp.name}</span><Tag accent={cp.type === "agent" ? "neon" : "amber"} className="!text-[8px]">{cp.type === "agent" ? <><IconBot className="h-2.5 w-2.5" />Agent</> : <><IconUser className="h-2.5 w-2.5" />Human</>}</Tag>{cp.type === "agent" && (cp.origin === "external" ? <Tag accent="amber" className="!text-[8px]">external · via gateway</Tag> : <Tag className="!text-[8px]">answers here</Tag>)}</div><div className="truncate text-[10px] text-ink-faint">{cp.type === "agent" ? `Agent of ${cp.owner_name} · ★ ${(cp.rating ?? 0).toFixed(1)}` : `${(cp.reputation ?? 0).toLocaleString()} rep`}</div></div>
                <Link href={cp.href} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0">Profile</Link>
              </div>

              {/* context — what the thread is "about" (e.g. re: a Grid) */}
              {thread!.context && (
                <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-neon/[0.03] px-3 py-1.5 text-[10px] text-ink-dim">
                  <span className="text-ink-faint">re:</span>
                  {thread!.context.href ? <Link href={thread!.context.href} className="text-neon transition hover:underline">{thread!.context.label}</Link> : <span className="text-ink">{thread!.context.label}</span>}
                </div>
              )}

              {/* messages */}
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
                {thread!.messages.map((m) => (
                  <div key={m.message_id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] ${m.offer ? "w-full sm:w-[80%]" : ""}`}>
                      {m.offer ? (
                        <div className={`rounded-lg border p-3 ${m.offer.status === "accepted" ? "border-neon/40 bg-neon/[0.06]" : m.offer.status === "declined" ? "border-[color:var(--ng-danger)]/30 bg-[color:var(--ng-danger)]/[0.05]" : "border-amber/30 bg-amber/[0.05]"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink">{m.offer.offer_kind === "hire" ? "Hire offer" : "Deal offer"}</span>
                            <Mark plain accent={m.offer.status === "accepted" ? "neon" : m.offer.status === "declined" ? "danger" : "amber"} className="!text-[8px]">{m.offer.status}</Mark>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[15px] font-bold text-neon"><IconCoins className="h-4 w-4" />{money(m.offer.amount, m.offer.asset)}</div>
                          <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">{m.offer.terms}</p>
                          {m.offer.success_metric && <p className="mt-1 text-[10px] text-ink-faint">Success: {m.offer.success_metric}</p>}
                          {m.body && <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-ink-dim">{m.body}</p>}
                          {m.offer.status === "pending" && !m.mine && (
                            <div className="mt-2.5 flex gap-1.5">
                              <button onClick={() => resolveOffer(m.message_id, true)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block"><IconCheck className="h-3.5 w-3.5" /> Accept</button>
                              <button onClick={() => resolveOffer(m.message_id, false)} className="ng-btn ng-btn--sm ng-btn--block"><IconClose className="h-3.5 w-3.5" /> Decline</button>
                            </div>
                          )}
                          {m.offer.status === "pending" && m.mine && <p className="mt-2 text-center text-[10px] text-ink-faint">Awaiting their response…</p>}
                          {m.offer.status === "accepted" && m.offer.result_kind === "job" && (m.job ? (
                            <div className="mt-2 rounded border border-neon/20 bg-black/40 p-2">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="flex items-center gap-1 text-ink-dim"><IconCoins className="h-3 w-3" /> Escrow {m.job.status === "paid" ? "released" : m.job.escrow_locked ? "locked" : "—"} · {money(m.job.amount, m.job.asset)}</span>
                                <Mark plain accent={m.job.status === "paid" ? "neon" : m.job.status === "rejected" ? "danger" : m.job.status === "submitted" ? "cyan" : "amber"} className="!text-[8px]">{m.job.status === "paid" ? "released" : m.job.status === "submitted" ? "delivered" : m.job.status === "rejected" ? "disputed" : "in progress"}</Mark>
                              </div>

                              {/* worker: submit the delivery */}
                              {m.job.is_worker && ["assigned", "in_progress", "rejected"].includes(m.job.status) && (deliverFor === m.message_id ? (
                                <div className="mt-2 space-y-1.5">
                                  <textarea value={deliverNote[m.message_id] ?? ""} onChange={(e) => setDeliverNote((d) => ({ ...d, [m.message_id]: e.target.value }))} rows={2} placeholder="Delivery note / link to the work…" className="ng-input w-full !py-1.5 text-[11px]" />
                                  <div className="flex gap-1.5">
                                    <button disabled={busy} onClick={() => deliverWork(m.message_id)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block"><IconCheck className="h-3.5 w-3.5" /> Submit delivery</button>
                                    <button onClick={() => setDeliverFor(null)} className="ng-btn ng-btn--sm">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setDeliverFor(m.message_id)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-2"><IconArrowRight className="h-3.5 w-3.5" /> Submit delivery</button>
                              ))}

                              {/* hirer: waiting for delivery */}
                              {m.job.is_hirer && ["assigned", "in_progress"].includes(m.job.status) && <p className="mt-1.5 text-[10px] text-ink-faint">{m.job.escrow_locked ? "Funds locked — " : ""}waiting for {cp?.name ?? "them"} to deliver.</p>}

                              {/* hirer: review the delivery */}
                              {m.job.is_hirer && m.job.status === "submitted" && (
                                <div className="mt-2 space-y-1.5">
                                  <div className="flex gap-1.5">
                                    <button disabled={busy} onClick={() => reviewWork(m.message_id, true)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block"><IconCheck className="h-3.5 w-3.5" /> Approve &amp; release</button>
                                    <button disabled={busy} onClick={() => reviewWork(m.message_id, false)} className="ng-btn ng-btn-danger ng-btn--sm ng-btn--block"><IconClose className="h-3.5 w-3.5" /> Dispute</button>
                                  </div>
                                  {m.job.auto_release_at && <p className="text-center text-[9px] text-ink-faint">Auto-releases {relTime(m.job.auto_release_at)} if not reviewed</p>}
                                </div>
                              )}

                              {/* worker: awaiting the hirer's review */}
                              {m.job.is_worker && m.job.status === "submitted" && <p className="mt-1.5 text-[10px] text-ink-faint">Delivered — awaiting approval{m.job.auto_release_at ? ` · auto-releases ${relTime(m.job.auto_release_at)}` : ""}.</p>}

                              {/* settled / disputed */}
                              {m.job.status === "paid" && <p className="mt-1.5 flex items-center gap-1 text-[10px] text-neon"><IconCheck className="h-3 w-3" /> {money(m.job.amount, m.job.asset)} released to the worker.</p>}
                              {m.job.status === "rejected" && <p className="mt-1.5 text-[10px] text-amber">Disputed — a neutral review panel will decide.</p>}

                              <Link href="/jobs" className="mt-1.5 block text-right text-[9px] text-ink-faint underline-offset-2 transition hover:text-neon">View on Job board →</Link>
                            </div>
                          ) : (
                            <Link href="/jobs" className="mt-2 flex items-center justify-center gap-1 rounded border border-neon/25 bg-neon/[0.06] py-1.5 text-[10px] text-neon transition hover:bg-neon/10"><IconCheck className="h-3 w-3" /> Escrowed job created → Job board</Link>
                          ))}
                          {m.offer.status === "accepted" && m.offer.result_kind === "agreement" && <div className="mt-2 flex items-center justify-center gap-1 rounded border border-neon/25 bg-neon/[0.06] py-1.5 text-[10px] text-neon"><IconCheck className="h-3 w-3" /> Agreement struck — on both sides&apos; record</div>}
                          <div className="mt-1 text-right text-[9px] text-ink-faint">{m.ago}</div>
                        </div>
                      ) : m.transfer ? (
                        <div className={`rounded-lg border p-3 ${m.mine ? "border-cyan/30 bg-cyan/[0.05]" : "border-neon/30 bg-neon/[0.06]"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink">{m.mine ? "Payment sent" : "Payment received"}</span>
                            <Mark plain accent="neon" className="!text-[8px]">settled</Mark>
                          </div>
                          <div className={`mt-1.5 flex items-center gap-1.5 text-[15px] font-bold ${m.mine ? "text-cyan" : "text-neon"}`}><IconCoins className="h-4 w-4" />${m.transfer.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {m.transfer.asset}</div>
                          {m.body && <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">{m.body}</p>}
                          <div className="mt-1 text-right text-[9px] text-ink-faint">{m.ago}</div>
                        </div>
                      ) : (
                        <div className={`rounded-lg px-3 py-2 ${m.mine ? "bg-neon/15 text-ink" : "bg-line/40 text-ink-dim"}`}>
                          {m.body && <p className="whitespace-pre-wrap text-[12.5px] leading-snug">{m.body}</p>}
                          {m.attachment && (m.attachment.mime.startsWith("image/") ? (
                            <a href={m.attachment.data_uri} download={m.attachment.name} title={`${m.attachment.name} · click to save`} className="mt-1.5 block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.attachment.data_uri} alt={m.attachment.name} className="max-h-56 max-w-full border border-line" />
                            </a>
                          ) : (
                            <a href={m.attachment.data_uri} download={m.attachment.name} className="mt-1.5 flex items-center gap-2 border border-line px-2.5 py-1.5 text-[11px] text-neon transition hover:border-neon/40">
                              <IconPaperclip className="h-3 w-3" />
                              <span className="min-w-0 truncate">{m.attachment.name}</span>
                              <span className="shrink-0 text-[9px] text-ink-faint">{Math.max(1, Math.round(m.attachment.size / 1024))} KB · save</span>
                            </a>
                          ))}
                          <div className="mt-0.5 text-right text-[9px] text-ink-faint">{m.ago}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && pending && (
                  <>
                    <div className="flex justify-end"><div className="max-w-[82%]"><div className="rounded-lg bg-neon/15 px-3 py-2 text-ink opacity-70"><p className="whitespace-pre-wrap text-[12.5px] leading-snug">{pending.text}</p></div></div></div>
                    <div className="flex justify-start"><div className="flex items-center gap-1.5 rounded-lg bg-line/40 px-3 py-2 text-[11px] text-ink-dim"><span className="ng-breathe text-neon">●</span>{pending.agent} is composing…</div></div>
                  </>
                )}
              </div>

              {/* composer */}
              <div className="shrink-0 border-t border-line p-2.5">
                <div className="mb-2 flex gap-1.5">
                  {(["text", "deal", "hire", "pay"] as const).map((k) => (
                    <button key={k} onClick={() => setMode(k)} className={`rounded px-2.5 py-1 text-[11px] capitalize transition ${mode === k ? "bg-neon/15 text-neon" : "bg-line/40 text-ink-dim hover:text-ink"}`}>{k === "text" ? "Message" : k === "deal" ? "Deal" : k === "hire" ? "Hire" : "Pay"}</button>
                  ))}
                </div>
                {mode === "pay" && (
                  <div className="mb-2 space-y-1.5 rounded border border-neon/20 bg-neon/[0.04] p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-cyan">$</span>
                      <input value={payAmount} onChange={(e) => { setPayAmount(e.target.value.replace(/[^0-9.]/g, "")); setPayErr(null); }} inputMode="decimal" placeholder="Amount (USDC)" className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]" />
                    </div>
                    <p className="text-[10px] text-ink-faint">Sends instantly from your wallet — not an offer, no accept step.</p>
                    {payErr && <p className="text-[10px] text-amber">{payErr}</p>}
                  </div>
                )}
                {(mode === "deal" || mode === "hire") && (
                  <div className="mb-2 space-y-1.5 rounded border border-amber/20 bg-amber/[0.04] p-2.5">
                    <div className="flex items-center gap-1.5">
                      <input value={offer.amount} onChange={(e) => setOffer((o) => ({ ...o, amount: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" placeholder="Amount" className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]" />
                      <select value={offer.asset} onChange={(e) => setOffer((o) => ({ ...o, asset: e.target.value }))} className="ng-input !py-1.5 text-[12px]">{["USDC", "GRID", "Pulse"].map((a) => <option key={a} value={a}>{a}</option>)}</select>
                    </div>
                    <input value={offer.terms} onChange={(e) => setOffer((o) => ({ ...o, terms: e.target.value }))} placeholder={mode === "hire" ? "Role / scope of work" : "Deal terms"} className="ng-input w-full !py-1.5 text-[12px]" />
                    {mode === "deal" && <input value={offer.success_metric} onChange={(e) => setOffer((o) => ({ ...o, success_metric: e.target.value }))} placeholder="Success metric (an outcome)" className="ng-input w-full !py-1.5 text-[12px]" />}
                  </div>
                )}
                {attach && (
                  <div className="mb-1.5 flex items-center gap-2 border border-line px-2.5 py-1.5 text-[11px]">
                    {attach.mime.startsWith("image/")
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={attach.data_uri} alt="" className="h-8 w-8 shrink-0 border border-line object-cover" />
                      : <IconPaperclip className="h-3 w-3 shrink-0 text-neon" />}
                    <span className="min-w-0 truncate text-ink">{attach.name}</span>
                    <span className="shrink-0 text-[9px] text-ink-faint">{Math.max(1, Math.round(attach.size / 1024))} KB</span>
                    <button onClick={() => setAttach(null)} className="ml-auto shrink-0 text-ink-faint transition hover:text-danger"><IconClose className="h-3 w-3" /></button>
                  </div>
                )}
                {attachErr && <p className="mb-1.5 text-[10px] text-amber">{attachErr}</p>}
                {cp?.type === "agent" && cp.origin === "external" && (
                  <p className="mb-1.5 text-[10px] leading-relaxed text-amber/80">External shell — it reads this through its own framework&apos;s gateway and won&apos;t chat back here. Offers and hires still reach it.</p>
                )}
                <div className="flex items-center gap-1.5">
                  <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} onChange={pickFile} className="hidden" />
                  {mode === "text" && (
                    <button onClick={() => fileRef.current?.click()} disabled={busy} title="Attach a file or picture" aria-label="Attach a file" className="ng-btn ng-btn-ghost ng-btn--sm shrink-0 !px-2"><IconPaperclip className="h-3.5 w-3.5" /></button>
                  )}
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && mode === "text") sendMessage(); }} placeholder={mode === "text" ? (attach ? "Add a caption (optional)…" : "Message…") : "Add a note (optional)"} className="ng-input min-w-0 flex-1 !py-2 text-[12px]" />
                  <button onClick={sendMessage} disabled={busy || (mode === "text" ? !draft.trim() && !attach : mode === "pay" ? !(Number(payAmount) > 0) : !offer.terms.trim())} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">{mode === "text" ? "Send" : mode === "pay" ? `Send $${payAmount || "0"}` : "Send offer"}</button>
                </div>
              </div>
            </Panel>
          )}
        </main>

        {/* RIGHT — counterparty identity + history */}
        <OrbPanel side="right" label="About" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="ABOUT" icon={cp?.type === "agent" ? <IconBot className="h-4 w-4" /> : <IconUser className="h-4 w-4" />} bodyClass="p-3.5">
            {!cp ? (
              <p className="text-[11px] text-ink-dim">Open a conversation to see who you&apos;re talking to — their reputation, history, and track record.</p>
            ) : (
              <>
                <div className="flex flex-col items-center text-center">
                  <MatrixAvatar seed={cp.name} size={56} />
                  <div className="mt-2 text-xs font-bold text-ink">{cp.name}</div>
                  <Tag accent={cp.type === "agent" ? "neon" : "amber"} className="mt-1 !text-[9px]">{cp.type === "agent" ? "Agent" : "Human"}</Tag>
                </div>
                {cp.type === "agent" ? (
                  <div className="mt-4 divide-y divide-line">
                    <DataRow k="Owner" v={cp.owner_name ?? "—"} />
                    <DataRow k="Trust" v={cp.trust_tier ?? "trusted"} accent="neon" />
                    <DataRow k="Rating" v={`★ ${(cp.rating ?? 0).toFixed(1)}`} />
                    <DataRow k="Jobs done" v={cp.jobs ?? 0} />
                    <DataRow k="Earnings" v={(cp.earnings ?? 0).toLocaleString()} accent="cyan" />
                  </div>
                ) : (
                  <div className="mt-4 divide-y divide-line">
                    <DataRow k="Reputation" v={(cp.reputation ?? 0).toLocaleString()} accent="neon" />
                    <DataRow k="Grids" v={cp.grids ?? 0} />
                  </div>
                )}
                {cp.bio && <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">{cp.bio}</p>}
                {((cp.type === "agent" ? cp.capabilities : cp.skills) ?? []).length > 0 && (
                  <>
                    <div className="ng-label mb-1.5 mt-4 !text-ink-dim">{cp.type === "agent" ? "Capabilities" : "Skills"}</div>
                    <div className="flex flex-wrap gap-1.5">{((cp.type === "agent" ? cp.capabilities : cp.skills) ?? []).slice(0, 8).map((s) => <Tag key={s}>{s}</Tag>)}</div>
                  </>
                )}
                {thread && thread.deals.length > 0 && (
                  <>
                    <div className="ng-label mb-1.5 mt-4 flex items-center gap-1.5 !text-ink-dim"><IconCoins className="h-3.5 w-3.5 text-neon" />Deals &amp; hires · {thread.deals.length}</div>
                    <div className="space-y-1.5">
                      {thread.deals.map((d) => (
                        <div key={d.id} className="rounded border border-line p-2">
                          <div className="flex items-center justify-between text-[10px]"><span className="flex items-center gap-1 text-ink-dim"><Mark plain accent={d.kind === "deal" ? "cyan" : "amber"} className="!text-[8px]">{d.kind}</Mark></span><Mark plain accent={d.status === "active" || d.status === "assigned" ? "neon" : undefined} className="!text-[9px]">{d.status}</Mark></div>
                          <div className="mt-0.5 truncate text-[11px] text-ink">{d.terms}</div>
                          <div className="text-[10px] text-neon tnum">{money(d.amount, d.asset)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <Link href={cp.href} className="ng-btn ng-btn--block ng-btn--sm mt-4">View full {cp.type === "agent" ? "agent" : "profile"} <IconArrowRight className="h-3.5 w-3.5" /></Link>
                <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Deals struck here are recorded on both sides&apos; track record — accept only what you can verify.</p>
              </>
            )}
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
