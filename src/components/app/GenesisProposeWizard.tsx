"use client";

/**
 * GenesisProposeWizard — the real multi-step "open a raise" flow for Fund.
 *
 * Compact 4-step modal (Basics › MVP › Milestones › Review) that collects
 * everything the funding backend supports and POSTs one proposal:
 *   - basics: title, category, summary
 *   - MVP: optionally attach an Echo build as proof-of-build (`build_id`)
 *   - milestones: the escrow release schedule; their sum IS the raise target
 *   - review: confirm + submit → POST /api/proposals (reputation-gated)
 *
 * Reputation gating is enforced server-side and by the caller (only opened when
 * `me.can_propose`); the review step restates eligibility. See genesis.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Mark,
  IconRocket,
  IconCheck,
  IconArrowRight,
  IconPlus,
  IconCode,
  IconShield,
} from "@/components/app/ui";
import type { Build } from "@/lib/types";

type Me = { id: string; reputation: number; can_propose: boolean; min: number };
type DraftMs = { title: string; description: string; amount: string; days: string };

const CATEGORIES = ["Protocol", "DeFi", "Consumer App", "Infrastructure", "AI / Agent", "NFT / Collectible", "DAO / Community", "Other"];
const STEPS = ["Basics", "MVP", "Milestones", "Review"] as const;
const blankMs = (): DraftMs => ({ title: "", description: "", amount: "", days: "" });
const onlyDigits = (s: string) => s.replace(/[^0-9]/g, "");

export default function GenesisProposeWizard({ me, onClose, onDone }: { me: Me; onClose: () => void; onDone: (title: string) => void }) {
  const [step, setStep] = useState(0);
  // basics
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [summary, setSummary] = useState("");
  // mvp
  const [builds, setBuilds] = useState<Build[] | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);
  // milestones
  const [ms, setMs] = useState<DraftMs[]>([blankMs()]);
  // submit
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // the user's proof-of-build track record, to attach an MVP
  useEffect(() => {
    let live = true;
    fetch("/api/echo/builds").then((r) => r.json()).then((d) => { if (live) setBuilds(d.builds ?? []); }).catch(() => { if (live) setBuilds([]); });
    return () => { live = false; };
  }, []);

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validMs = useMemo(() => ms.filter((m) => m.title.trim() && Number(m.amount) > 0), [ms]);
  const total = useMemo(() => validMs.reduce((s, m) => s + Number(m.amount), 0), [validMs]);
  const selectedBuild = builds?.find((b) => b.build_id === buildId) ?? null;

  const canNext = step === 0 ? !!title.trim() && !!summary.trim() : step === 2 ? validMs.length > 0 : true;

  const setMsField = (i: number, k: keyof DraftMs, v: string) => setMs((arr) => arr.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const addMs = () => setMs((arr) => [...arr, blankMs()]);
  const removeMs = (i: number) => setMs((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : arr));

  async function submit() {
    if (busy || !validMs.length) return;
    setBusy(true); setErr(null);
    const roadmap = validMs.map((m) => ({
      title: m.title.trim(),
      description: m.description.trim(),
      amount: Number(m.amount),
      ...(Number(m.days) > 0 ? { est_duration_days: Number(m.days) } : {}),
    }));
    try {
      const r = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), summary: summary.trim(), category, ask_amount: total, roadmap, build_id: buildId ?? undefined }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErr(d?.error === "insufficient_reputation" ? `You need ${me.min}+ reputation to propose.` : "Could not open the raise — try again."); setBusy(false); return; }
      onDone(title.trim());
    } catch { setErr("Network error — try again."); setBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neon/15 bg-[#050f09]/95 backdrop-blur" style={{ boxShadow: "0 0 60px -16px rgba(0,255,0,0.5)" }}>
        {/* header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-lg text-neon" style={{ background: "rgba(0,255,0,0.08)", boxShadow: "0 0 14px -4px rgba(0,255,0,0.6)" }}><IconRocket className="h-5 w-5" /></span>
            <div>
              <div className="text-lg font-bold text-neon text-glow-soft">Open a Raise</div>
              <div className="text-xs text-ink-dim">Reputation earns the right. Funds release as milestones land.</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="ng-btn ng-btn--sm ng-btn-ghost !px-2">✕</button>
        </div>

        {/* step pills */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y border-neon/10 px-5 py-3 text-[10px] uppercase tracking-wider">
          {STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-3">
              <span className={`flex items-center gap-1.5 ${i === step ? "text-neon text-glow-soft" : i < step ? "text-ink-dim" : "text-ink-faint"}`}>
                <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${i < step ? "bg-neon/20 text-neon" : i === step ? "bg-neon/15 text-neon" : "bg-white/[0.04] text-ink-faint"}`}>{i < step ? "✓" : i + 1}</span>
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="text-neon/25">›</span>}
            </span>
          ))}
        </div>

        {/* body */}
        <div className="min-h-[300px] flex-1 overflow-y-auto p-5">
          {/* STEP 0 — BASICS */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Project title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Helios — solar yield protocol" className="ng-input" autoFocus />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Category</label>
                <div className="flex flex-wrap gap-x-4 gap-y-2.5">
                  {CATEGORIES.map((c) => (
                    <button key={c} type="button" onClick={() => setCategory(c)} className={`text-xs transition ${category === c ? "text-neon text-glow-soft" : "text-ink-dim hover:text-neon"}`}>
                      <span className="mr-1.5 text-neon/70">{category === c ? "▸" : "·"}</span>{c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">Summary</label>
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What are you building, and why back it? Reference your MVP and on-chain track record." className="ng-input min-h-[96px] resize-y" />
              </div>
            </div>
          )}

          {/* STEP 1 — MVP */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-ink-dim">Attach an Echo build as your <span className="text-neon">proof-of-build</span> MVP. Optional — but funded raises ship working software, not decks.</p>
              {builds === null && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="ng-card h-14 animate-pulse opacity-40" />)}</div>}
              {builds && builds.length === 0 && (
                <div className="ng-card p-6 text-center">
                  <div className="text-sm text-ink-dim">No Echo builds yet.</div>
                  <Link href="/echo" className="mt-2 inline-flex items-center gap-1 text-[12px] text-neon transition hover:text-glow">Build an MVP in Echo <IconArrowRight className="h-3 w-3" /></Link>
                  <div className="mt-1 text-[10px] text-ink-faint">You can still raise on track record alone — continue.</div>
                </div>
              )}
              {builds && builds.length > 0 && (
                <div className="space-y-1.5">
                  <button type="button" onClick={() => setBuildId(null)} className={`ng-card flex w-full items-center gap-3 p-3 text-left transition ${buildId === null ? "!border-neon/50 bg-neon/[0.06]" : ""}`}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-faint">—</span>
                    <span className="flex-1 text-sm text-ink-dim">No MVP — raise on track record alone</span>
                    {buildId === null && <IconCheck className="h-4 w-4 shrink-0 text-neon" />}
                  </button>
                  {builds.map((b) => {
                    const on = b.build_id === buildId;
                    return (
                      <button key={b.build_id} type="button" onClick={() => setBuildId(b.build_id)} className={`ng-card flex w-full items-center gap-3 p-3 text-left transition ${on ? "!border-neon/50 bg-neon/[0.06]" : ""}`}>
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neon/10 text-neon"><IconCode className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{b.title}</span>
                          <span className="block truncate text-[10px] text-ink-faint">{b.stack.join(" · ")} · {b.artifact.proof_of_build}</span>
                        </span>
                        {on ? <IconCheck className="h-4 w-4 shrink-0 text-neon" /> : <span className="shrink-0 text-ink-faint">›</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — MILESTONES */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-ink-dim">Break the raise into milestones. Each releases from escrow only when backers approve it. Their <span className="text-neon">total is your raise target</span>.</p>
              <div className="space-y-2.5">
                {ms.map((m, i) => (
                  <div key={i} className="ng-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neon/15 text-[10px] text-neon">{i + 1}</span>
                      <input value={m.title} onChange={(e) => setMsField(i, "title", e.target.value)} placeholder="Milestone title" className="ng-input flex-1 !py-1.5 text-sm" />
                      {ms.length > 1 && <button type="button" onClick={() => removeMs(i)} aria-label="Remove milestone" className="ng-btn ng-btn--sm ng-btn-ghost !px-2 hover:!text-danger">✕</button>}
                    </div>
                    <textarea value={m.description} onChange={(e) => setMsField(i, "description", e.target.value)} placeholder="What ships in this milestone?" className="ng-input mt-2 min-h-[40px] resize-y text-xs" />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Amount</span>
                        <input value={m.amount} onChange={(e) => setMsField(i, "amount", onlyDigits(e.target.value))} inputMode="numeric" placeholder="0" className="ng-input flex-1 !py-1.5 text-sm" />
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-ink-faint">Days</span>
                        <input value={m.days} onChange={(e) => setMsField(i, "days", onlyDigits(e.target.value))} inputMode="numeric" placeholder="—" className="ng-input flex-1 !py-1.5 text-sm" />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={addMs} className="ng-btn ng-btn--sm"><IconPlus className="h-3.5 w-3.5" /> Add milestone</button>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-ink-faint">Raise target</div>
                  <div className="ng-stat__v !text-lg text-neon">{total.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — REVIEW */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="ng-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-neon">{title.trim() || "Untitled"}</div>
                    <div className="mt-0.5 text-[10px] text-ink-faint">{category} · by you</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase tracking-wider text-ink-faint">Raise</div>
                    <div className="ng-stat__v !text-lg text-neon">{total.toLocaleString()}</div>
                  </div>
                </div>
                {summary.trim() && <p className="mt-2 text-[12px] leading-relaxed text-ink-dim">{summary.trim()}</p>}
              </div>

              <div>
                <div className="ng-label mb-1.5 !text-ink-dim">Proof-of-build MVP</div>
                {selectedBuild ? (
                  <div className="ng-card flex items-center gap-3 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-neon/10 text-neon"><IconShield className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{selectedBuild.title}</span>
                      <span className="block truncate text-[10px] text-ink-faint">{selectedBuild.artifact.proof_of_build}</span>
                    </span>
                    <Mark plain accent="neon" className="!text-[9px] shrink-0">attested</Mark>
                  </div>
                ) : <div className="text-[11px] text-ink-faint">No MVP attached — raising on track record alone.</div>}
              </div>

              <div>
                <div className="ng-label mb-1.5 !text-ink-dim">Milestones · {validMs.length}</div>
                <div className="space-y-1.5">
                  {validMs.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-ink-dim"><span className="text-ink">{i + 1}. {m.title.trim()}</span>{Number(m.days) > 0 ? ` · ${m.days}d` : ""}</span>
                      <span className="shrink-0 text-neon">{Number(m.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-neon/10 pt-3 text-[11px]">
                <span className="text-ink-faint">Your reputation</span>
                <span className="text-neon">{me.reputation} · ✓ eligible (≥{me.min})</span>
              </div>

              {err && <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">{err}</div>}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-3 border-t border-neon/10 p-5 pt-4">
          <span className="text-[11px] text-ink-faint">Step {step + 1} of {STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className="ng-btn ng-btn-ghost">Back</button>}
            {step < STEPS.length - 1
              ? <button type="button" onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext} className="ng-btn ng-btn-primary disabled:opacity-40">Next</button>
              : <button type="button" onClick={submit} disabled={busy || !validMs.length} className="ng-btn ng-btn-primary disabled:opacity-40">{busy ? "Opening…" : "Open the raise"}</button>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
