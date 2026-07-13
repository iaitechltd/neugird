"use client";

/**
 * /venture/[id] — MISSION CONTROL. The company drawn as a living reactor: a CEO
 * core orchestrating specialist satellites, data flowing through conduits, vital-
 * signs telemetry instead of charts. The owner issues objectives; the CEO delegates;
 * each specialist ships. Treasury burns per cycle; product revenue flows back.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, IconTarget, IconPlay, IconRocket, IconActivity, IconChevronDown, IconWallet, IconCoins, IconBriefcase } from "@/components/app/ui";
import { CountUp } from "@/components/app/typefx";
import { PulseDot, ScanSweep } from "@/components/app/venture-ui";
import { VentureReactor, Waveform, Telemetry } from "@/components/app/venture-reactor";

const NEON = "#00ff00";
const CYAN = "#48f5ff";

type Dept = "ceo" | "marketing" | "content" | "finance" | "build";
type Seat = { agent_id: string; dept: Dept; title: string; name: string; role: string; rating: number; status: string; tasks: number; capabilities: string[]; mastery: number; tool: string | null };
const CALLSIGN: Record<Dept, string> = { ceo: "CEO", marketing: "MARKET", content: "CONTENT", finance: "FINANCE", build: "BUILD" };

type Objective = { objective_id: string; text: string; status: "queued" | "running" | "done"; tasks_total?: number; tasks_done?: number };
type Ev = { at: string; kind: string; text: string; detail?: string; tool?: string; dept?: Dept; agent_id?: string; job_id?: string; post_id?: string; amount_grid?: number };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type View = {
  venture: { venture_id: string; name: string; mission: string; status: string; cycles: number; template?: string; ceo_agent_id?: string };
  is_owner: boolean;
  seats: Seat[];
  treasury_grid: number; revenue_grid: number; spent_grid: number; cycle_cost: number;
  product: { build_id: string; title: string; summary: string; version: number; deployed_version: number | null; slug: string | null; revisions: number; deployment: { slug?: string } | null } | null;
  linkable_builds: { build_id: string; title: string; summary: string; deployed: boolean; slug: string | null }[];
  objectives: Objective[];
  log: Ev[];
};

const GLYPH: Record<string, { g: string; c: string }> = {
  delivered: { g: "✓", c: "text-neon" },
  delegated: { g: "◇", c: "text-cyan" },
  revenue: { g: "▲", c: "text-neon" },
  spend: { g: "▼", c: "text-ink-faint" },
  hold: { g: "!", c: "text-cyan" },
  objective: { g: "▸", c: "text-ink-dim" },
  created: { g: "◆", c: "text-neon/70" },
};

export default function VentureCockpit() {
  const { id } = useParams<{ id: string }>();
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [v, setV] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState("");
  const [fund, setFund] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [linkSel, setLinkSel] = useState("");

  const load = useCallback(() => {
    fetch(`/api/ventures/${id}`).then((r) => r.json()).then((x) => { if (!x.error) setV(x); }).catch(() => {}).finally(() => setLoaded(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}, tag = action) => {
    setBusy(tag); setFlash(null);
    try {
      const r = await fetch(`/api/ventures/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) }).then((x) => x.json());
      if (r.error) { setFlash(`⚠ ${r.error.replace(/_/g, " ")}`); return; }
      if (r.view) setV(r.view);
      if (action === "cycle" && r.result && !r.result.ok) setFlash(r.result.reason === "treasury_empty" ? "⚠ treasury empty — fund it to run a cycle" : r.result.reason === "no_objectives" ? "issue an objective first" : null);
    } finally { setBusy(null); }
  }, [id]);

  const working = busy === "cycle";
  const queued = v?.objectives.filter((o) => o.status !== "done").length ?? 0;
  const ceo = v?.seats.find((s) => s.dept === "ceo");
  const depts = v?.seats.filter((s) => s.dept !== "ceo") ?? [];
  const shipped = v?.objectives.filter((o) => o.status === "done").length ?? 0;
  const runwayCycles = v && v.cycle_cost > 0 ? Math.floor(v.treasury_grid / v.cycle_cost) : Infinity;
  const energyPct = runwayCycles === Infinity ? 100 : Math.min(100, runwayCycles * 10);
  const funded = Math.max(0, (v?.treasury_grid ?? 0) + (v?.spent_grid ?? 0) - (v?.revenue_grid ?? 0));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const s = lOpen || rOpen; setLOpen(!s); setROpen(!s); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-3">
        {/* LEFT — the crew manifest */}
        <OrbPanel side="left" label="Crew" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]">
          <Panel scroll title="CREW MANIFEST" icon={<IconBriefcase className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            {ceo && (
              <Link href={`/agents/${ceo.agent_id}`} className="group relative block overflow-hidden border border-neon/40 bg-neon/[0.04] p-2.5 transition hover:!border-neon/60">
                <ScanSweep />
                <div className="flex items-center gap-2">
                  <PulseDot tone={working ? "cyan" : "neon"} />
                  <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-neon">{ceo.role}</span>
                  <span className="ml-auto text-[8px] uppercase tracking-[0.14em] text-cyan">CORE</span>
                </div>
                <div className="mt-0.5 pl-4 text-[9px] text-ink-faint">{working ? "orchestrating the crew…" : `orchestrator · ${ceo.tasks} runs`}</div>
              </Link>
            )}

            <div className="ng-label mb-1.5 mt-4 !text-ink-dim">Specialists · {depts.length}</div>
            <div className="border-t border-line/50">
              {depts.map((s) => (
                <Link key={s.agent_id} href={`/agents/${s.agent_id}`} className="group block border-b border-line/50 py-2 transition hover:bg-neon/[0.03]">
                  <div className="flex items-center gap-2">
                    <PulseDot tone={working ? "cyan" : "neon"} size={5} />
                    <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink transition group-hover:text-neon">{CALLSIGN[s.dept] ?? s.dept}</span>
                    <span className="ml-auto text-[8px] uppercase tracking-[0.12em] text-neon/60">{working ? "· working ·" : s.tool}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 pl-3.5">
                    <span className="flex-1 truncate text-[9px] text-ink-faint">{s.role}</span>
                    <span className="text-[9px] tnum text-ink-faint">mastery {s.mastery}</span>
                    <span className="text-[9px] tnum text-ink-faint">· {s.tasks} runs</span>
                  </div>
                  <div className="mt-1 h-3.5 pl-3.5 opacity-70"><Waveform height={14} speed={working ? 1.0 : 2.6} color={working ? CYAN : NEON} kind="ekg" /></div>
                </Link>
              ))}
            </div>

            {/* treasury readout + fund */}
            <div className="ng-label mb-1.5 mt-5 !text-ink-dim">Reactor fuel</div>
            <div className="relative overflow-hidden border border-line bg-black/20 p-3">
              <ScanSweep />
              <div className="flex items-baseline justify-between">
                <Telemetry label="treasury" value={<CountUp key={v?.treasury_grid ?? 0} value={v?.treasury_grid ?? 0} />} unit="grid" tone="cyan" big />
                <span className="text-[9px] uppercase tracking-wide text-ink-faint">{runwayCycles === Infinity ? "∞ runway" : `${runwayCycles} cyc runway`}</span>
              </div>
              <div className="mt-2 h-4 opacity-80"><Waveform height={16} speed={2.2} color={NEON} kind="sine" opacity={0.7} /></div>
            </div>
            {v?.is_owner && (
              <div className="mt-2 flex gap-2">
                <input value={fund} onChange={(e) => setFund(e.target.value.replace(/[^0-9]/g, ""))} placeholder="add GRID" className="min-w-0 flex-1 border border-line bg-black/40 px-2.5 py-2 text-[12px] text-neon tnum placeholder:font-normal placeholder:text-ink-faint outline-none focus:border-neon/50" />
                <button disabled={!fund || busy === "fund"} onClick={() => { act("fund", { amount: Number(fund) }); setFund(""); }} className="ng-btn ng-btn-ghost ng-btn--sm shrink-0"><IconWallet className="h-3.5 w-3.5" /> Fuel</button>
              </div>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — the reactor + command + mission log */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {/* hero */}
          <div className="relative overflow-hidden border border-neon/25 bg-black/20 p-4">
            <ScanSweep />
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-neon/80"><PulseDot tone={v?.venture.status === "active" ? "neon" : "dim"} /> {v?.venture.status ?? "—"} <span className="text-ink-faint">· mission control</span></div>
            <h1 className="ng-title mt-1.5 text-2xl font-bold text-neon">{v?.venture.name ?? "—"}</h1>
            {v?.venture.mission && <p className="mt-1 text-[12px] text-ink-dim">{v.venture.mission}</p>}
            <div className="mt-3 flex flex-wrap gap-x-7 gap-y-2 border-t border-line pt-3">
              <Telemetry label="cycles" value={<CountUp key={v?.venture.cycles ?? 0} value={v?.venture.cycles ?? 0} />} />
              <Telemetry label="crew" value={<CountUp key={v?.seats.length ?? 0} value={v?.seats.length ?? 0} />} />
              <Telemetry label="shipped" value={<CountUp key={shipped} value={shipped} />} />
              <Telemetry label="revenue" value={<CountUp key={v?.revenue_grid ?? 0} value={v?.revenue_grid ?? 0} />} unit="grid" tone="cyan" />
            </div>
          </div>

          {/* THE REACTOR */}
          {v && v.seats.length > 0 && (
            <div className="relative overflow-hidden border border-line bg-black/20 px-3 pb-2 pt-2.5">
              <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-ink-faint">
                <span className="text-neon/70">◤ reactor core</span>
                <span className={working ? "text-cyan" : ""}>{working ? "◇ delegating · energy surge" : `${v.venture.cycles} cycles run`}</span>
              </div>
              <div className="mx-auto max-w-[440px]"><VentureReactor seats={v.seats} active={working} energyPct={energyPct} coreLabel={ceo ? CALLSIGN.ceo : "CEO"} /></div>
            </div>
          )}

          {/* command line */}
          {v?.is_owner && (
            <div className="relative overflow-hidden border border-line bg-black/20 p-3.5">
              <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-ink-faint">◤ command line · issue an objective</div>
              <div className="flex items-start gap-2 border border-line bg-black/40 px-3 py-2 focus-within:border-neon/50">
                <span className="mt-0.5 select-none text-[13px] font-bold text-neon">&gt;</span>
                <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="e.g. Ship dark mode and announce it, then run a growth push" className="w-full resize-none bg-transparent text-[12.5px] text-neon placeholder:font-normal placeholder:text-ink-faint outline-none" />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button disabled={!goal.trim() || busy === "objective"} onClick={() => { act("objective", { text: goal }); setGoal(""); }} className="ng-btn ng-btn-ghost ng-btn--sm"><IconTarget className="h-3.5 w-3.5" /> Queue objective</button>
                <button disabled={working || v.venture.status !== "active"} onClick={() => act("cycle")} className={`ng-btn ng-btn--sm ${queued && !working ? "ng-btn-primary animate-pulse" : "ng-btn-ghost"}`}><IconPlay className="h-3.5 w-3.5" /> {working ? "Reactor running…" : "Execute cycle"}</button>
                {working ? <span className="text-[10px] text-cyan"><span className="animate-pulse">CEO planning · crew drafting real work (~15s)…</span></span> : queued > 0 && <span className="text-[10px] text-cyan">{queued} queued</span>}
                {flash && !working && <span className="text-[10px] text-cyan">{flash}</span>}
              </div>
            </div>
          )}

          {/* objectives */}
          {(v?.objectives.length ?? 0) > 0 && (
            <div>
              <div className="ng-label mb-1 !text-ink-dim">◤ objectives</div>
              <div className="border-t border-line/50">
                {v!.objectives.slice(0, 6).map((o) => {
                  const total = o.tasks_total ?? 0, doneN = o.tasks_done ?? 0;
                  const pct = o.status === "done" ? 100 : total > 0 ? Math.round((doneN / total) * 100) : 4;
                  const done = o.status === "done";
                  return (
                    <div key={o.objective_id} className="border-b border-line/50 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[12px] ${done ? "text-neon" : "text-cyan"}`}>{done ? "✓" : "▸"}</span>
                        <div className="min-w-0 flex-1 truncate text-[12px] text-ink">{o.text}</div>
                        <span className="text-[8.5px] uppercase tracking-wide text-ink-faint">{done && total ? `${doneN}/${total}` : o.status}</span>
                      </div>
                      <div className="mt-1.5 ml-5 h-px bg-line"><div className="h-px bg-neon transition-all duration-700 ease-out" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* mission log */}
          <div>
            <div className="ng-label mb-1 mt-1 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconActivity className="h-3.5 w-3.5" /></span>◤ mission log</div>
            {(v?.log.length ?? 0) > 0 ? (
              <div className="font-mono">
                {v!.log.map((e, i) => {
                  const gl = GLYPH[e.kind] ?? { g: "·", c: "text-ink-dim" };
                  return (
                    <div key={i} className="group border-l border-line/40 py-1 pl-2.5 transition hover:border-neon/50 hover:bg-neon/[0.02]">
                      <div className="flex items-start gap-2 text-[11px]">
                        <span className={`mt-px shrink-0 ${gl.c}`}>{gl.g}</span>
                        <span className={`min-w-0 flex-1 leading-snug ${e.kind === "delivered" ? "font-bold text-ink" : "text-ink-dim"}`}>{e.text}</span>
                        {e.tool && <span className="mt-px shrink-0 border border-neon/30 px-1 text-[8px] uppercase tracking-wide text-neon/75">{e.tool}</span>}
                        {typeof e.amount_grid === "number" && <span className={`shrink-0 text-[11px] tnum ${e.kind === "revenue" ? "text-neon" : "text-ink-faint"}`}>{e.kind === "revenue" ? "+" : "−"}{e.amount_grid}</span>}
                      </div>
                      {e.detail && (
                        <details className="mt-1 pl-5">
                          <summary className="cursor-pointer list-none text-[10.5px] leading-snug text-ink-faint transition hover:text-ink-dim [&::-webkit-details-marker]:hidden"><span className="text-neon/60">▸ </span>{clip(e.detail, 112)}</summary>
                          <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-neon/25 pl-3 text-[10.5px] leading-relaxed text-ink-dim">{e.detail}</div>
                        </details>
                      )}
                      {e.post_id && <Link href={`/post/${e.post_id}`} className="ml-5 mt-1 inline-flex text-[10px] font-bold text-neon/85 transition hover:text-neon">→ view the live post on the wire</Link>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-ink-dim">{loaded ? "No transmissions yet — issue an objective and execute a cycle to watch the crew work." : "— booting —"}</p>
            )}
          </div>
        </main>

        {/* RIGHT — telemetry + the self-funding loop */}
        <OrbPanel label="Telemetry" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="TELEMETRY" icon={<IconCoins className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            {/* energy / burn */}
            <div className="relative overflow-hidden border border-line bg-black/20 p-3">
              <ScanSweep />
              <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-[0.18em] text-ink-faint">◤ power</span>
                <span className="text-[8px] uppercase tracking-wide text-ink-faint">{v?.cycle_cost ?? 0} grid / cycle</span>
              </div>
              <div className="mt-1.5"><Telemetry label="treasury" value={<CountUp key={v?.treasury_grid ?? 0} value={v?.treasury_grid ?? 0} />} unit="grid" tone="cyan" big /></div>
              <div className="mt-2 h-6 opacity-80"><Waveform height={24} speed={working ? 1.1 : 2.4} color={working ? CYAN : NEON} kind="ekg" /></div>
              <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wide text-ink-faint"><span>burn rate</span><span className={working ? "text-cyan" : "text-neon/70"}>{working ? "▲ active" : "idle"}</span></div>
            </div>

            {/* money flow — inline, no bars */}
            <div className="ng-label mb-1.5 mt-4 !text-ink-dim">◤ money flow</div>
            <div className="space-y-1.5 border-l border-line/50 pl-3 text-[11px]">
              <div className="flex items-center justify-between"><span className="text-ink-faint">◆ funded by you</span><span className="tnum text-neon">{funded}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-faint">▲ product revenue</span><span className="tnum text-neon">{v?.revenue_grid ?? 0}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-faint">▼ compute spent</span><span className="tnum text-cyan">{v?.spent_grid ?? 0}</span></div>
            </div>

            {/* product payload */}
            <div className="ng-label mb-1.5 mt-5 flex items-center justify-between !text-ink-dim">
              <span>◤ payload · product</span>
              {v?.is_owner && v.product && (v.linkable_builds?.length ?? 0) > 0 && <button onClick={() => { setShowPicker((s) => !s); setLinkSel(""); }} className="text-[8px] uppercase tracking-wide text-ink-faint transition hover:text-neon">{showPicker ? "cancel" : "change"}</button>}
            </div>
            {v?.product && !showPicker ? (
              <div className="border border-line bg-black/20 p-3">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
                  <IconRocket className="h-4 w-4 text-neon/70" />
                  <Link href={v.product.slug ? `/d/${v.product.slug}` : "/gridx"} className="truncate transition hover:text-neon">{v.product.title}</Link>
                  <span className="ml-auto shrink-0 tnum text-[9px] text-neon/70">v{v.product.version}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10.5px] text-ink-faint">{v.product.summary}</p>
                <div className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[9px] text-ink-faint">
                  <span>{v.product.slug ? `live: v${v.product.deployed_version ?? "—"}` : "not deployed"}</span>
                  {v.is_owner && v.product.version > (v.product.deployed_version ?? 0) && (
                    <button disabled={busy === "deploy"} onClick={() => act("deploy")} className="ng-btn ng-btn-primary ng-btn--sm ml-auto !py-0.5 !text-[9px]"><IconRocket className="h-3 w-3" /> {busy === "deploy" ? "Deploying…" : `Deploy v${v.product.version}`}</button>
                  )}
                </div>
              </div>
            ) : v?.is_owner && (v.linkable_builds?.length ?? 0) > 0 ? (
              <div className="border border-line bg-black/20 p-3">
                <p className="mb-2 text-[10px] leading-snug text-ink-faint">Point the crew at one of your builds — the CEO grounds every cycle in it.</p>
                <select value={linkSel} onChange={(e) => setLinkSel(e.target.value)} className="w-full border border-line bg-black/40 px-2.5 py-2 text-[11.5px] text-ink outline-none focus:border-neon/50">
                  <option value="">{v.product ? "— keep current —" : "— choose a build —"}</option>
                  {v.product && <option value="__none__">— unlink (no product) —</option>}
                  {v.linkable_builds.map((b) => <option key={b.build_id} value={b.build_id}>{b.title}{b.deployed ? "  (live)" : ""}</option>)}
                </select>
                <button disabled={!linkSel || busy === "link"} onClick={() => { act("link", { build_id: linkSel === "__none__" ? null : linkSel }); setShowPicker(false); setLinkSel(""); }} className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-2"><IconRocket className="h-3.5 w-3.5" /> {busy === "link" ? "Linking…" : "Link it"}</button>
              </div>
            ) : (
              <Link href="/echo" className="flex items-center gap-2.5 border border-line bg-black/20 p-2.5 transition hover:!border-neon/40"><IconRocket className="h-4 w-4 text-neon/70" /><span className="text-[11px] text-ink">Build a product with Echo to link</span></Link>
            )}

            <div className="mt-4 border-l border-neon/30 pl-3 text-[11px] leading-relaxed text-ink-dim">
              <p><span className="text-neon">Self-funding.</span> Each cycle the reactor burns a little GRID. When the product earns, that revenue flows back — the company pays its own way.</p>
              <p className="mt-2"><span className="text-neon">You&#39;re the board.</span> Issue the goals and fuel the reactor; the CEO runs operations and the crew executes.</p>
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[8px] uppercase tracking-[0.2em] text-ink-faint"><PulseDot tone="cyan" size={5} /> rails online</div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
