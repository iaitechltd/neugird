"use client";

/**
 * Governance — GRID-weighted protocol governance (GRID's 3rd utility).
 * Holders LOCK GRID to vote FOR/AGAINST protocol proposals (parameters, listings,
 * treasury use); weight = GRID locked, and the lock returns when the proposal
 * resolves. 3-panel HUD; proposal cards are vertical tiles in a masonry (BASE 2).
 */

import { useEffect, useMemo, useState } from "react";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Mark, DataRow, ProgressBar, IconShield, IconActivity, IconLock, IconWallet, IconBolt, IconCheck, IconCoins } from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import type { GovProposal, GovProposalKind } from "@/lib/types";

type GovView = GovProposal & { total_grid: number; for_pct: number; against_pct: number; quorum_pct: number; voters: number; my_vote: { support: boolean; grid: number } | null };
type Me = { grid: number; can_propose: boolean; propose_min: number };
type ParamView = { key: string; value: number; default: number; overridden: boolean; label: string; unit: "bps" | "grid" | "days" | "count" };

const KINDS: (GovProposalKind | "all")[] = ["all", "param", "listing", "treasury", "general"];
const KIND_LABEL: Record<GovProposalKind, string> = { param: "Parameter", listing: "Listing", treasury: "Treasury", general: "General" };
const KIND_ACCENT: Record<GovProposalKind, "cyan" | "neon" | "amber" | undefined> = { param: "cyan", listing: "neon", treasury: "amber", general: undefined };

const grid = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);
const fmtParam = (unit: "bps" | "grid" | "days" | "count", v: number) => (unit === "bps" ? `${(v / 100).toFixed(2)}%` : unit === "days" ? `${v.toLocaleString()} day${v === 1 ? "" : "s"}` : unit === "count" ? v.toLocaleString() : `${v.toLocaleString()} GRID`);

/* One-line description of what a proposal ENACTS on pass (uses live param meta). */
function actionText(action: GovProposal["action"], meta: Record<string, ParamView>): string | null {
  if (!action) return null;
  if (action.type === "set_param") {
    const m = meta[action.key];
    return `Enacts → ${m?.label ?? action.key} = ${fmtParam(m?.unit ?? "grid", action.value)}`;
  }
  return `Enacts → ${action.amount.toLocaleString()} ${action.asset.toUpperCase()} from treasury → ${action.to}`;
}

function KindPill({ kind }: { kind: GovProposalKind }) {
  const accent = KIND_ACCENT[kind];
  return <Mark plain={!accent} accent={accent} className="!text-[9px]">{KIND_LABEL[kind]}</Mark>;
}
function StatusPill({ status }: { status: GovProposal["status"] }) {
  if (status === "open") return <Mark plain accent="neon" className="!text-[9px]">● Open</Mark>;
  if (status === "passed") return <Mark accent="neon" className="!text-[9px]">Passed</Mark>;
  return <Mark accent="danger" className="!text-[9px]">Rejected</Mark>;
}

/* A single proposal tile — for/against split, quorum progress, and the vote form. */
function ProposalCard({ p, me, meta, onChange }: { p: GovView; me: Me | null; meta: Record<string, ParamView>; onChange: () => void }) {
  const [support, setSupport] = useState(true);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = p.status === "open";
  const voted = !!p.my_vote;

  async function cast() {
    const n = Number(amount);
    if (!(n > 0)) { setErr("Enter a GRID amount"); return; }
    setBusy(true); setErr(null);
    const r = await fetch(`/api/governance/${p.proposal_id}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ support, grid: n }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r || r.error) { setErr(r?.error === "insufficient_grid" ? "Not enough GRID" : r?.error ?? "Failed"); return; }
    setAmount(""); window.dispatchEvent(new Event("neugrid:refresh-me")); onChange();
  }
  async function resolve() {
    setBusy(true); setErr(null);
    const r = await fetch(`/api/governance/${p.proposal_id}/resolve`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r || r.error) { setErr(r?.error ?? "Failed"); return; }
    window.dispatchEvent(new Event("neugrid:refresh-me")); onChange();
  }

  return (
    <div className="ng-card mb-3 flex break-inside-avoid flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <KindPill kind={p.kind} />
        <StatusPill status={p.status} />
      </div>
      <h3 className="ng-title mt-2 text-[15px] font-bold leading-snug text-ink">{p.title}</h3>
      {p.summary && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{p.summary}</p>}

      {/* What it ENACTS on pass (binding action) */}
      {actionText(p.action, meta) && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded border border-cyan/20 bg-cyan/[0.06] px-2 py-1.5 text-[10.5px] text-cyan">
          <IconBolt className="h-3 w-3 shrink-0" />
          <span className="leading-tight">{actionText(p.action, meta)}</span>
        </div>
      )}

      {/* FOR / AGAINST split */}
      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wide">
        <span className="text-neon">For {grid(p.for_grid)}</span>
        <span className="text-[color:var(--ng-danger)]">{grid(p.against_grid)} Against</span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-neon transition-all" style={{ width: `${p.total_grid ? p.for_pct : 50}%`, opacity: p.total_grid ? 1 : 0.25 }} />
        <div className="h-full bg-[color:var(--ng-danger)] transition-all" style={{ width: `${p.total_grid ? p.against_pct : 50}%`, opacity: p.total_grid ? 1 : 0.25 }} />
      </div>

      {/* Quorum progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-ink-faint"><span>Quorum</span><span className="tnum">{grid(p.for_grid)} / {grid(p.quorum_grid)} GRID</span></div>
        <ProgressBar percent={p.quorum_pct} />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint">
        <span>{p.voters} voter{p.voters === 1 ? "" : "s"} · {grid(p.total_grid)} GRID locked</span>
        {voted && <span className="text-neon">You: {p.my_vote!.support ? "For" : "Against"} · {grid(p.my_vote!.grid)}</span>}
      </div>

      {/* Vote form */}
      {open && !voted && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex gap-1.5">
            <button onClick={() => setSupport(true)} className={`flex-1 rounded px-2 py-1.5 text-[11px] font-semibold transition ${support ? "bg-neon/15 text-neon" : "bg-line/40 text-ink-dim hover:text-ink"}`}>For</button>
            <button onClick={() => setSupport(false)} className={`flex-1 rounded px-2 py-1.5 text-[11px] font-semibold transition ${!support ? "bg-[color:var(--ng-danger)]/15 text-[color:var(--ng-danger)]" : "bg-line/40 text-ink-dim hover:text-ink"}`}>Against</button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="GRID to lock" className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]" />
          </div>
          <div className="mt-1.5 flex gap-1">
            {[1000, 5000, 10000].map((q) => <button key={q} onClick={() => setAmount(String(q))} className="flex-1 rounded bg-line/40 px-1 py-1 text-[10px] text-ink-dim transition hover:text-neon">{grid(q)}</button>)}
          </div>
          <button onClick={cast} disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-2 disabled:opacity-50">{busy ? "Locking…" : "Lock & Vote"}</button>
          {me && <div className="mt-1 text-center text-[10px] text-ink-faint">Balance {grid(me.grid)} GRID · returned on resolve</div>}
        </div>
      )}
      {open && voted && (
        <button onClick={resolve} disabled={busy} className="ng-btn ng-btn--sm ng-btn--block mt-3 disabled:opacity-50">{busy ? "…" : "Resolve now"}</button>
      )}
      {!open && p.resolved_at && (
        <div className="mt-3 border-t border-line pt-2">
          {p.status === "passed" && p.execution_note ? (
            <div className={`flex items-start gap-1.5 text-[10px] ${p.executed ? "text-neon" : "text-ink-dim"}`}>
              {p.executed && <IconCheck className="mt-px h-3 w-3 shrink-0" />}
              <span className="leading-tight">{p.execution_note}</span>
            </div>
          ) : (
            <div className="text-center text-[10px] text-ink-faint">{p.status === "passed" ? "Passed (advisory)" : "Rejected"} · locks returned to voters</div>
          )}
        </div>
      )}
      {err && <div className="mt-2 text-center text-[10px] text-[color:var(--ng-danger)]">{err}</div>}
    </div>
  );
}

export default function GovernancePage() {
  const [proposals, setProposals] = useState<GovView[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [params, setParams] = useState<ParamView[]>([]);
  const [kind, setKind] = useState<GovProposalKind | "all">("all");
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ title: "", summary: "", kind: "param" as GovProposalKind, paramKey: "tradex_fee_bps", paramValue: "" });
  const [posting, setPosting] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);

  function load() {
    fetch("/api/governance").then((r) => r.json()).then((d) => { setProposals(d.proposals ?? []); setMe(d.me ?? null); setParams(d.params ?? []); }).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const meta = useMemo(() => Object.fromEntries(params.map((p) => [p.key, p])) as Record<string, ParamView>, [params]);

  async function submit() {
    if (!form.title.trim()) return;
    // a Parameter proposal with a value attaches a binding set_param action (user types
    // % for bps params, raw GRID for grid params → convert to the stored unit).
    let action: GovProposal["action"] | undefined;
    if (form.kind === "param" && form.paramValue.trim()) {
      const pm = meta[form.paramKey];
      const raw = Number(form.paramValue);
      if (pm && Number.isFinite(raw)) action = { type: "set_param", key: form.paramKey, value: pm.unit === "bps" ? Math.round(raw * 100) : raw };
    }
    setPosting(true);
    const r = await fetch("/api/governance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title, summary: form.summary, kind: form.kind, action }) }).then((x) => x.json()).catch(() => null);
    setPosting(false);
    if (r && !r.error) { setForm({ title: "", summary: "", kind: "param", paramKey: "tradex_fee_bps", paramValue: "" }); setComposing(false); load(); }
  }

  const list = useMemo(() => proposals ?? [], [proposals]);
  const filtered = kind === "all" ? list : list.filter((p) => p.kind === kind);
  const stats = useMemo(() => ({
    open: list.filter((p) => p.status === "open").length,
    passed: list.filter((p) => p.status === "passed").length,
    locked: list.reduce((s, p) => s + (p.status === "open" ? p.total_grid : 0), 0),
  }), [list]);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Governance" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Protocol" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="GOVERNANCE" icon={<IconShield className="h-4 w-4" />} bodyClass="p-3.5">
            <div className="divide-y divide-line">
              <DataRow k="Open Proposals" v={stats.open} accent="neon" />
              <DataRow k="Passed" v={stats.passed} />
              <DataRow k="GRID Locked (open)" v={grid(stats.locked)} />
              <DataRow k="Your GRID" v={me ? grid(me.grid) : "—"} accent="cyan" />
            </div>
            <div className="ng-label mb-2 mt-4 !text-ink-dim">Type</div>
            <div className="space-y-1">
              {KINDS.map((k) => (
                <button key={k} onClick={() => setKind(k)} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-[13px] capitalize transition ${kind === k ? "bg-neon/10 text-neon" : "text-ink-dim hover:bg-neon/[0.06] hover:text-neon"}`}>
                  <span>{k === "all" ? "All" : KIND_LABEL[k]}</span>
                  <Mark plain className="!text-[10px]">{k === "all" ? list.length : list.filter((p) => p.kind === k).length}</Mark>
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">Lock GRID to vote. Weight = GRID locked; your lock returns when the proposal resolves, win or lose.</p>

            {/* Live protocol parameters — the knobs a passed proposal turns. */}
            <div className="ng-label mb-2 mt-5 flex items-center gap-2 !text-ink-dim"><IconBolt className="h-3.5 w-3.5 text-neon" />Live Parameters</div>
            <div className="divide-y divide-line">
              {params.map((pm) => (
                <div key={pm.key} className="flex items-center justify-between py-1.5 text-[11px]">
                  <span className="text-ink-dim">{pm.label}</span>
                  <span className="flex items-center gap-1.5">
                    <Mark plain accent={pm.overridden ? "amber" : "neon"} className="!text-[10px] tnum">{fmtParam(pm.unit, pm.value)}</Mark>
                    {pm.overridden && <span className="text-[8px] uppercase tracking-wide text-amber" title={`default ${fmtParam(pm.unit, pm.default)}`}>gov</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-ink-faint">A passed proposal turns these live — the next trade / build uses the new value.</p>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text="Governance" /></h1>
              <p className="mt-1 text-sm text-ink-dim">GRID holders steer the protocol — lock GRID to vote on parameters, listings, and the treasury.</p>
            </div>
            <button onClick={() => setComposing((v) => !v)} disabled={!!me && !me.can_propose} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50" title={me && !me.can_propose ? `Hold ≥ ${grid(me.propose_min)} GRID to propose` : undefined}>{composing ? "Cancel" : "+ New Proposal"}</button>
          </div>

          {/* Composer */}
          {composing && (
            <Panel bodyClass="p-4">
              <div className="ng-label mb-2 !text-ink-dim">New Proposal</div>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Proposal title — what should change?" className="ng-input mb-2 w-full text-[13px]" />
              <textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Rationale — why, and the expected effect." rows={3} className="ng-input mb-2 w-full resize-none text-[12px]" />
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(["param", "listing", "treasury", "general"] as GovProposalKind[]).map((k) => (
                  <button key={k} onClick={() => setForm((f) => ({ ...f, kind: k }))} className={`rounded px-2.5 py-1 text-[11px] transition ${form.kind === k ? "bg-neon/15 text-neon" : "bg-line/40 text-ink-dim hover:text-ink"}`}>{KIND_LABEL[k]}</button>
                ))}
              </div>

              {/* Binding action — a Parameter proposal can set a real knob (enacted on pass). */}
              {form.kind === "param" && (
                <div className="mb-3 rounded border border-cyan/20 bg-cyan/[0.05] p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] text-cyan"><IconBolt className="h-3 w-3" />Binding action — set a protocol parameter</div>
                  <div className="flex items-center gap-1.5">
                    <select value={form.paramKey} onChange={(e) => setForm((f) => ({ ...f, paramKey: e.target.value }))} className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]">
                      {params.map((pm) => <option key={pm.key} value={pm.key}>{pm.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <input value={form.paramValue} onChange={(e) => setForm((f) => ({ ...f, paramValue: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" placeholder="new" className="ng-input w-20 !py-1.5 text-[12px]" />
                      <span className="text-[11px] text-ink-faint">{meta[form.paramKey]?.unit === "bps" ? "%" : meta[form.paramKey]?.unit === "days" ? "days" : meta[form.paramKey]?.unit === "count" ? "×" : "GRID"}</span>
                    </div>
                  </div>
                  <div className="mt-1 text-[10px] text-ink-faint">Current: {meta[form.paramKey] ? fmtParam(meta[form.paramKey].unit, meta[form.paramKey].value) : "—"} · leave blank for an advisory proposal</div>
                </div>
              )}

              <button onClick={submit} disabled={posting || !form.title.trim()} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{posting ? "Opening…" : "Open Proposal"}</button>
              <span className="ml-2 text-[10px] text-ink-faint">Quorum {params.find((p) => p.key === "gov_quorum_grid")?.value.toLocaleString() ?? grid(50000)} GRID · 5-day window</span>
            </Panel>
          )}

          {proposals === null && <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>{[0, 1, 2].map((i) => <div key={i} className="ng-card mb-3 h-64 animate-pulse opacity-40" />)}</div>}
          {proposals && filtered.length === 0 && <Panel><div className="p-8 text-center text-sm text-ink-dim">No proposals yet — open the first one.</div></Panel>}
          {filtered.length > 0 && (
            <div className="columns-1 gap-3 lg:[column-count:var(--cols)]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {filtered.map((p) => <ProposalCard key={p.proposal_id} p={p} me={me} meta={meta} onChange={load} />)}
            </div>
          )}
        </main>

        {/* RIGHT */}
        <OrbPanel side="right" label="GRID Utility" open={rOpen} onToggle={setROpen}>
          <Panel scroll title="GRID UTILITY" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
            <p className="text-[11px] leading-relaxed text-ink-dim">GRID is earned, not sold. Its jobs make it useful — not a security:</p>
            <ul className="mt-3 space-y-2.5 text-[11px] text-ink-dim">
              <li className="flex gap-2"><IconLock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" /><span><b className="text-ink">Stake-to-list</b> — lock GRID to graduate a market on TradeX.</span></li>
              <li className="flex gap-2"><IconWallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" /><span><b className="text-ink">Echo compute</b> — GRID meters every AI build.</span></li>
              <li className="flex gap-2"><IconShield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" /><span><b className="text-ink">Govern</b> — lock GRID to vote on the protocol itself.</span></li>
              <li className="flex gap-2"><IconCoins className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" /><span><b className="text-ink">Fee discounts</b> — pay TradeX fees in GRID at a discount.</span></li>
            </ul>
            <div className="ng-label mb-2 mt-5 !text-ink-dim">Lock-to-vote</div>
            <ol className="space-y-1.5 text-[10px] leading-relaxed text-ink-faint">
              <li>1 · Lock GRID FOR or AGAINST a proposal.</li>
              <li>2 · Vote weight = GRID locked (conviction).</li>
              <li>3 · Passes at quorum &amp; a FOR majority.</li>
              <li>4 · Your lock returns on resolve — win or lose.</li>
            </ol>
          </Panel>
        </OrbPanel>
      </div>
      <NeuGridDock />
    </div>
  );
}
