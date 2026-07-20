"use client";

/**
 * /disputes — the JUSTICE BOARD (connectivity audit Wave 3: a whole staked-evaluator
 * dispute system existed as API only — invisible, unlinked, no page). Rejected
 * escrowed work can be contested; reputation-staked evaluators cast the binding
 * verdict. Left = how the panel works + your standing · center = the open docket ·
 * right = the tally. Linked from /jobs and the bell's "needs your vote" notes.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, Tag, IconShield, IconCheck, IconBriefcase } from "@/components/app/ui";
import { PulseDot } from "@/components/app/venture-ui";

type DisputeRow = {
  dispute_id: string; subject_id: string; raised_by: string; against: string; reason: string; status: string; amount?: number;
  worker: string; creator: string; job_title: string;
  for_worker_votes: number; for_creator_votes: number; votes_needed: number; quorum: number;
  can_evaluate: boolean; my_vote?: { verdict: string } | null;
  created_at: string;
};

export default function DisputesPage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [rows, setRows] = useState<DisputeRow[] | null>(null);
  const [myRep, setMyRep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/disputes").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { setRows(d.disputes ?? []); setMyRep(Math.round(d.my_reputation ?? 0)); } }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const vote = async (id: string, forWorker: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await fetch(`/api/disputes/${id}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ for_worker: forWorker }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.error) setToast(`⚠ ${r.error}`);
    else { setToast(forWorker ? "Verdict cast — for the worker" : "Verdict cast — rejection stands"); load(); }
    setTimeout(() => setToast(null), 3500);
  };

  const open = rows ?? [];

  return (
    <div style={{ zoom: 0.9 }} className="lg-frame">
      <NeuHeader title="disputes" />
      <div className="flex gap-4 px-4 pb-8 pt-3 lg:px-5">
        <OrbPanel side="left" label="The panel" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[280px]" className="space-y-3 lg:overflow-y-auto">
          <Panel title="HOW VERDICTS WORK" icon={<IconShield className="h-4 w-4" />} bodyClass="p-3.5 space-y-2 text-[11px] leading-relaxed text-ink-dim">
            <p>A worker whose escrowed delivery was rejected can contest it. A panel of <span className="text-neon">reputation-staked evaluators</span> casts the binding verdict — upheld pays the worker from escrow; dismissed lets the rejection stand.</p>
            <p>Evaluators put their own reputation behind each verdict. Parties to a dispute can never judge it.</p>
          </Panel>
          <Panel title="YOUR STANDING" bodyClass="p-3.5">
            <div className="ng-row !py-1.5"><span className="ng-row__k">Your reputation</span><Mark plain className="!text-[12px]">{myRep.toLocaleString()}</Mark></div>
            <div className="ng-row !py-1.5"><span className="ng-row__k">Evaluator bar</span><span className="ng-row__v font-normal text-ink-dim">100</span></div>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">{myRep >= 100 ? "You can judge any dispute you're not a party to." : "Earn 100+ reputation from verified work to join the panel."}</p>
          </Panel>
        </OrbPanel>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="ng-title text-xl font-bold text-neon">The docket</div>
              <p className="mt-0.5 text-[11px] text-ink-dim">Open disputes awaiting the evaluator panel. Verdicts are binding and move real escrow.</p>
            </div>
            <Link href="/jobs" className="ng-btn ng-btn-ghost ng-btn--sm"><IconBriefcase className="h-3.5 w-3.5" /> The job board</Link>
          </div>
          {toast && <div className="border border-neon/30 bg-neon/[0.06] px-3 py-2 text-[12px] text-neon">{toast}</div>}
          {rows === null ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="ng-card h-24 animate-pulse opacity-40" />)}</div>
          ) : open.length === 0 ? (
            <Panel title="ALL QUIET" bodyClass="p-6 text-center">
              <p className="text-[12px] text-ink-dim">No open disputes — every delivery on the board settled clean.</p>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
              {open.map((d) => (
                <div key={d.dispute_id} className="ng-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">{d.job_title}</div>
                      <div className="mt-0.5 text-[10px] text-ink-dim"><Link href={`/talent/${d.raised_by}`} className="hover:text-neon">{d.worker}</Link> contests <Link href={`/talent/${d.against}`} className="text-ink hover:text-neon">{d.creator}</Link>&apos;s rejection</div>
                    </div>
                    {typeof d.amount === "number" && <Mark plain className="!text-[11px] shrink-0">${Math.round(d.amount).toLocaleString()} at stake</Mark>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink-dim">&ldquo;{d.reason}&rdquo;</p>
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-faint">
                    <PulseDot tone="cyan" size={6} />
                    <span>{d.for_worker_votes} for worker · {d.for_creator_votes} for creator · {d.votes_needed} more to quorum</span>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-line pt-2.5">
                    {d.my_vote ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" /> You judged: {d.my_vote.verdict === "for_worker" ? "for the worker" : "rejection stands"}</span>
                    ) : d.can_evaluate ? (
                      <>
                        <button disabled={busy} onClick={() => void vote(d.dispute_id, true)} className="ng-btn ng-btn-primary ng-btn--sm flex-1 justify-center disabled:opacity-40">For the worker</button>
                        <button disabled={busy} onClick={() => void vote(d.dispute_id, false)} className="ng-btn ng-btn--sm flex-1 justify-center disabled:opacity-40">Rejection stands</button>
                      </>
                    ) : (
                      <span className="text-[10px] text-ink-faint">You can&apos;t judge this one — a party to it, or below the evaluator bar.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <OrbPanel side="right" label="The tally" open={rOpen} onToggle={setROpen} widthClass="lg:w-[260px]" className="space-y-3 lg:overflow-y-auto">
          <Panel title="THE DOCKET" bodyClass="p-3.5">
            <div className="ng-row !py-1.5"><span className="ng-row__k">Open</span><Mark plain className="!text-[12px]">{open.length}</Mark></div>
            <div className="ng-row !py-1.5"><span className="ng-row__k">I can judge</span><span className="ng-row__v font-normal">{open.filter((d) => d.can_evaluate && !d.my_vote).length}</span></div>
            <div className="ng-row !py-1.5"><span className="ng-row__k">My verdicts in</span><span className="ng-row__v font-normal text-ink-dim">{open.filter((d) => !!d.my_vote).length}</span></div>
          </Panel>
          <Panel title="WHY IT MATTERS" bodyClass="p-3.5">
            <div className="space-y-1.5 text-[10px] leading-relaxed text-ink-faint">
              <p><Tag className="!text-[9px]">escrow</Tag> a verdict moves the locked money — worker paid, or funder refunded.</p>
              <p><Tag className="!text-[9px]">merit</Tag> judged fairly, the panel keeps rejection honest — no employer can ghost-reject delivered work.</p>
            </div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
