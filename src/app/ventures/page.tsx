"use client";

/**
 * /ventures — VENTURE COMMAND. Deploy and monitor a fleet of agent companies,
 * each drawn as a living reactor. A builder (≥1 Echo build) picks a crew template,
 * owns the company, fuels a treasury, and issues objectives. Terminal aesthetic;
 * reactor + vital-trace visual language, plus a real fleet dashboard (KPI deck, an
 * activity pulse, GRID economy, and crew-throughput readouts) derived from live state.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, IconRocket, IconTarget, IconCoins, IconChevronDown, IconArrowRight, IconLayers, IconBolt, IconLock, IconBot, IconWallet, IconBriefcase } from "@/components/app/ui";
import { Rise } from "@/components/app/motionfx";
import { CountUp } from "@/components/app/typefx";
import { PulseDot, ScanSweep, ConsoleFrame } from "@/components/app/venture-ui";
import { VentureReactor, VitalTrace, Telemetry, AreaPulse, ReadoutRows, CrewRadar, ActivityRing, RunwayArc, MoneyFlow } from "@/components/app/venture-reactor";

const NEON = "#00ff00";
const CYAN = "#48f5ff";
const DIM = "rgba(0,255,0,0.4)";

type Tpl = { id: string; name: string; tagline: string; seats: { dept: string; title: string }[] };
type Ev = { at: string; kind: string; dept?: string; amount_grid?: number };
type VItem = {
  venture: { venture_id: string; name: string; mission: string; status: string; cycles: number };
  seats: { agent_id: string; dept: string; title: string; tasks: number; mastery: number }[];
  treasury_grid: number; revenue_grid: number; spent_grid: number; cycle_cost: number;
  product: { title: string; version: number } | null;
  objectives: { status: string }[];
  approvals: { approval_id: string }[];
  log: Ev[];
};
type Build = { build_id: string; title: string; summary: string; deployed: boolean; slug: string | null };
type Data = { ventures: VItem[]; templates: Tpl[]; eligible: { ok: boolean; builds: number }; builds: Build[] };

const OPS = [
  { n: "01", i: IconBriefcase, t: "Assemble the crew", d: "Pick a template — a CEO-agent plus the specialists you need." },
  { n: "02", i: IconWallet, t: "Fuel the reactor", d: "Deposit GRID. Every work cycle burns a little compute." },
  { n: "03", i: IconTarget, t: "Issue an objective", d: "In plain English. The CEO breaks it into department briefs." },
  { n: "04", i: IconBolt, t: "The crew executes", d: "Each specialist delivers real, attested work — and ships it." },
];

export default function VenturesPage() {
  const router = useRouter();
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [d, setD] = useState<Data | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("solo-saas");
  const [prod, setProd] = useState("");
  const [fund, setFund] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/ventures").then((r) => r.json()).then((x) => { if (!x.error) { setD(x); if (x.templates?.[0]) setTpl((t) => t || x.templates[0].id); } }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = useCallback(async () => {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/ventures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, template: tpl, build_id: prod || undefined, fund_grid: fund ? Number(fund) : undefined }) }).then((x) => x.json());
      if (r.error) { setErr(r.error === "need_a_build" ? "Ship a build with Echo first — that's the key to the door." : r.error.replace(/_/g, " ")); return; }
      const id = r.venture?.venture?.venture_id;
      if (id) router.push(`/venture/${id}`);
    } finally { setBusy(false); }
  }, [name, tpl, prod, fund, router]);

  const eligible = d?.eligible.ok ?? false;
  const ventures = d?.ventures ?? [];
  const templates = d?.templates ?? [];
  const builds = d?.builds ?? [];
  const fleet = {
    companies: ventures.length,
    agents: ventures.reduce((a, v) => a + v.seats.length, 0),
    cycles: ventures.reduce((a, v) => a + v.venture.cycles, 0),
    treasury: Math.round(ventures.reduce((a, v) => a + v.treasury_grid, 0)),
    revenue: Math.round(ventures.reduce((a, v) => a + (v.revenue_grid || 0), 0)),
    spent: Math.round(ventures.reduce((a, v) => a + (v.spent_grid || 0), 0)),
    shipped: ventures.reduce((a, v) => a + v.objectives.filter((o) => o.status === "done").length, 0),
    pending: ventures.reduce((a, v) => a + (v.approvals?.length || 0), 0),
    deliveries: ventures.reduce((a, v) => a + (v.log || []).filter((e) => e.kind === "delivered").length, 0),
  };
  const funded = Math.round(ventures.reduce((a, v) => a + Math.max(0, v.treasury_grid + (v.spent_grid || 0) - (v.revenue_grid || 0)), 0));

  // OUTPUT PULSE — real activity binned over time from the fleet's event logs (work happens
  // in cycle bursts, so the trace spikes at each cycle instead of being flat decoration).
  const activity: number[] = (() => {
    const evs = ventures.flatMap((v) => v.log || []).filter((e) => ["delivered", "revenue", "spend"].includes(e.kind));
    if (evs.length < 2) return [0, evs.length, 0];
    const ts = evs.map((e) => Date.parse(e.at)).sort((a, b) => a - b);
    const t0 = ts[0], span = Math.max(1, ts[ts.length - 1] - t0);
    const B = 22, buckets = new Array(B).fill(0);
    for (const t of ts) buckets[Math.min(B - 1, Math.floor(((t - t0) / span) * B))]++;
    return buckets;
  })();

  // GRID economy (in → out → balance) and crew throughput by department (real runs).
  const economy = [
    { label: "Funded", value: funded, tone: "neon" as const },
    { label: "Revenue", value: fleet.revenue, tone: "cyan" as const },
    { label: "Spent", value: fleet.spent, tone: "dim" as const },
    { label: "Treasury", value: fleet.treasury, tone: "neon" as const },
  ];
  const DEPTS: { key: string; label: string }[] = [
    { key: "build", label: "Build" }, { key: "marketing", label: "Market" }, { key: "content", label: "Content" }, { key: "finance", label: "Finance" },
  ];
  const throughput = DEPTS.map((dp) => ({
    label: dp.label,
    value: ventures.reduce((a, v) => a + v.seats.filter((s) => s.dept === dp.key).reduce((x, s) => x + s.tasks, 0), 0),
    tone: "neon" as const,
  }));

  // LEFT ① crew skill radar — the SHAPE of the team's expertise (mastery per department)
  const radar = DEPTS.map((dp) => ({
    label: dp.label.slice(0, 3).toUpperCase(),
    value: ventures.reduce((a, v) => a + v.seats.filter((s) => s.dept === dp.key).reduce((x, s) => x + s.mastery, 0), 0),
  }));

  // LEFT ② activity mix ring — what the crew spends its cycles on (from the event logs)
  const allLog = ventures.flatMap((v) => v.log || []);
  const kc = (ks: string[]) => allLog.filter((e) => ks.includes(e.kind)).length;
  const activityMix = [
    { label: "Delivered", value: kc(["delivered"]), tone: "neon" as const },
    { label: "Directives", value: kc(["objective", "delegated", "approval"]), tone: "cyan" as const },
    { label: "Ledger", value: kc(["spend", "revenue"]), tone: "dim" as const },
  ];

  // RIGHT ① runway gauge — cycles of fuel the treasury holds (12 = a "full charge")
  const cycleCost = ventures[0]?.cycle_cost || 20;
  // treasuries are NOT pooled — the honest fleet signal is the soonest-to-stall company,
  // not the summed treasury over one company's cost (which would read "full" while others stall).
  const runway = ventures.length
    ? Math.min(...ventures.map((v) => Math.floor(v.treasury_grid / Math.max(1, v.cycle_cost || cycleCost))))
    : 0;

  // RIGHT ② money flow — cumulative revenue-in vs spent-out; the log is capped so we
  // baseline the series to END at the true fleet totals (older activity precedes the window)
  const { flowIn, flowOut } = (() => {
    const evs = allLog.filter((e) => (e.kind === "revenue" || e.kind === "spend") && typeof e.amount_grid === "number")
      .slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    let ci = 0, co = 0; const ri = [0], ro = [0];
    for (const e of evs) { if (e.kind === "revenue") ci += e.amount_grid!; else co += e.amount_grid!; ri.push(ci); ro.push(co); }
    const bi = Math.max(0, fleet.revenue - ci), bo = Math.max(0, fleet.spent - co);
    if (ri.length < 2) return { flowIn: [0, fleet.revenue], flowOut: [0, fleet.spent] };
    return { flowIn: ri.map((v) => Math.round(bi + v)), flowOut: ro.map((v) => Math.round(bo + v)) };
  })();

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const s = lOpen || rOpen; setLOpen(!s); setROpen(!s); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-3">
        {/* LEFT — operator + clearance */}
        <OrbPanel side="left" label="Operator" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="OPERATOR" icon={<IconLock className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <ConsoleFrame className={`relative border p-4 ${eligible ? "border-neon/50 bg-neon/[0.05]" : "border-line bg-black/20"}`} corners>
              <div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[0.2em] text-ink-faint"><PulseDot tone={eligible ? "neon" : "dim"} /> clearance</div>
              <div className={`mt-2 text-[16px] font-bold tracking-[0.05em] ${eligible ? "text-neon" : "text-ink-dim"}`}>{eligible ? "CLEARANCE GRANTED" : "LOCKED"}</div>
              <div className="mt-1.5"><Telemetry label="builds on record" value={d?.eligible.builds ?? 0} tone="cyan" big /></div>
              <div className="mt-2 h-5 opacity-80"><VitalTrace seed="clearance" activity={eligible ? Math.min(1, (d?.eligible.builds ?? 1) / 6) : 0} height={20} /></div>
              <div className="mt-1 text-[10px] leading-snug text-ink-faint">{eligible ? "Merit opens the gate — you may take command of a crew." : "Ship a build with Echo to unlock command."}</div>
              {!eligible && <Link href="/echo" className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-3"><IconRocket className="h-3.5 w-3.5" /> Build with Echo</Link>}
            </ConsoleFrame>

            {ventures.length > 0 && (
              <>
                {/* LEFT ① — crew skill radar */}
                <div className="ng-label mb-1.5 mt-5 !text-ink-dim">◤ crew skill radar</div>
                <div className="relative overflow-hidden border border-line bg-black/20 p-2">
                  <ScanSweep />
                  <CrewRadar axes={radar} />
                  <div className="mt-0.5 text-center text-[8px] uppercase tracking-[0.14em] text-ink-faint">mastery by department</div>
                </div>

                {/* LEFT ② — activity mix ring */}
                <div className="ng-label mb-1.5 mt-5 !text-ink-dim">◤ activity mix</div>
                <div className="relative overflow-hidden border border-line bg-black/20 p-2">
                  <ActivityRing segments={activityMix} centerValue={allLog.length} centerLabel="events" />
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5">
                    {activityMix.map((s) => (
                      <span key={s.label} className="flex items-center gap-1 text-[8px] uppercase tracking-wide text-ink-faint">
                        <span className="inline-block h-1.5 w-1.5" style={{ background: s.tone === "cyan" ? CYAN : s.tone === "dim" ? DIM : NEON }} />{s.label} {s.value}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="ng-label mb-2 mt-5 !text-ink-dim">◤ briefing</div>
            <div className="border-l border-neon/30 pl-3 text-[11px] leading-relaxed text-ink-dim">
              <p><span className="text-neon">A company you own.</span> A CEO-agent runs it; specialists — marketing, content, finance, engineering — do the work. Not roleplay: they ship code, publish, and settle on-chain.</p>
              <p className="mt-2"><span className="text-neon">You&#39;re the founder.</span> Set the goals, fuel the reactor. The crew executes and the product pays its own way.</p>
            </div>

            {fleet.companies > 0 && (
              <>
                <div className="ng-label mb-2 mt-5 !text-ink-dim">◤ your fleet</div>
                <div className="space-y-2 border-l border-line/50 pl-3 text-[11px]">
                  <div className="flex items-center justify-between"><span className="text-ink-faint">companies</span><span className="tnum text-neon">{fleet.companies}</span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-faint">agents live</span><span className="tnum text-cyan">{fleet.agents}</span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-faint">cycles run</span><span className="tnum text-neon">{fleet.cycles}</span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-faint">shipped</span><span className="tnum text-neon">{fleet.shipped}</span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-faint">revenue</span><span className="tnum text-cyan">{fleet.revenue}<span className="ml-0.5 text-[8px] text-ink-faint">g</span></span></div>
                  <div className="flex items-center justify-between"><span className="text-ink-faint">treasury</span><span className="tnum text-cyan">{fleet.treasury}<span className="ml-0.5 text-[8px] text-ink-faint">g</span></span></div>
                  {fleet.pending > 0 && <div className="flex items-center justify-between"><span className="text-cyan">pending approvals</span><span className="tnum text-cyan">{fleet.pending}</span></div>}
                </div>
              </>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — command hero + fleet + deploy console */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Rise>
            <div className="relative overflow-hidden border border-neon/30 bg-black/20 p-5">
              <ScanSweep />
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-neon/80"><PulseDot /> system online <span className="text-ink-faint">· neugrid ventures command</span></div>
              <h1 className="ng-title mt-2 text-3xl font-bold text-neon">VENTURE COMMAND</h1>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-dim">Deploy a company of AI agents that runs your product. You command; a CEO-agent orchestrates the crew; the specialists execute real work — build, publish, budget, research — and settle on-chain.</p>
            </div>
          </Rise>

          {/* KPI DECK — the whole fleet at a glance (real, derived from live company state) */}
          {ventures.length > 0 && (
            <Rise>
              <div className="grid grid-cols-3 gap-px overflow-hidden border border-line bg-line @lg:grid-cols-6">
                {[
                  { k: "companies", v: fleet.companies, c: false },
                  { k: "agents", v: fleet.agents, c: true },
                  { k: "cycles", v: fleet.cycles, c: false },
                  { k: "shipped", v: fleet.shipped, c: false },
                  { k: "revenue", v: fleet.revenue, c: true, u: "grid" },
                  { k: "treasury", v: fleet.treasury, c: true, u: "grid" },
                ].map((m) => (
                  <div key={m.k} className="bg-black/40 p-3">
                    <div className="text-[8px] uppercase tracking-[0.16em] text-ink-faint">{m.k}</div>
                    <div className={`mt-1 tnum text-2xl font-bold leading-none ${m.c ? "text-cyan" : "text-neon"}`}><CountUp key={m.v} value={m.v} /></div>
                    <div className="mt-0.5 h-2.5 text-[7.5px] uppercase tracking-wide text-ink-faint">{m.u ?? ""}</div>
                  </div>
                ))}
              </div>
            </Rise>
          )}

          {/* FLEET TELEMETRY — the visual dashboard: an activity pulse + the money + who's carrying the work */}
          {ventures.length > 0 && (
            <Rise>
              <div className="relative overflow-hidden border border-line bg-black/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-ink-faint"><span className="text-neon">◤</span> fleet telemetry</div>
                <div className="grid gap-x-5 gap-y-4 @lg:grid-cols-[1.25fr_1fr]">
                  {/* output pulse — real work binned over time (spikes = cycle bursts) */}
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-[9px] uppercase tracking-[0.14em] text-ink-faint">◦ output pulse</span>
                      <span className="tnum text-[13px] font-bold text-neon">{fleet.deliveries}<span className="ml-1 text-[8px] uppercase tracking-wide text-ink-faint">deliveries</span></span>
                    </div>
                    <div className="border border-line/60 bg-black/30 p-2"><AreaPulse series={activity} height={66} /></div>
                    <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wide text-ink-faint"><span>{fleet.cycles} cycles run</span><span>now →</span></div>
                  </div>
                  {/* the money + who's shipping */}
                  <div className="space-y-3.5">
                    <div>
                      <div className="mb-1.5 text-[9px] uppercase tracking-[0.14em] text-ink-faint">◦ grid economy</div>
                      <ReadoutRows rows={economy} />
                    </div>
                    <div>
                      <div className="mb-1.5 text-[9px] uppercase tracking-[0.14em] text-ink-faint">◦ crew throughput · runs</div>
                      <ReadoutRows rows={throughput} />
                    </div>
                  </div>
                </div>
              </div>
            </Rise>
          )}

          {/* the fleet — companies as reactors */}
          {ventures.length > 0 && (
            <div>
              <div className="ng-label mb-1.5 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBriefcase className="h-3.5 w-3.5" /></span>◤ the fleet · {ventures.length} active</div>
              <div className="grid gap-2.5 @lg:grid-cols-2">
                {ventures.map((it, i) => {
                  const done = it.objectives.filter((o) => o.status === "done").length;
                  const live = it.venture.status === "active";
                  return (
                    <motion.div key={it.venture.venture_id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06 }}>
                      <Link href={`/venture/${it.venture.venture_id}`} className="group relative block overflow-hidden border border-line bg-black/20 p-3 transition hover:!border-neon/60 hover:bg-neon/[0.03]">
                        <ScanSweep delay={0.15 + i * 0.05} />
                        <div className="flex items-center gap-2">
                          <PulseDot tone={live ? "neon" : "dim"} />
                          <span className="truncate text-[14px] font-bold text-ink transition group-hover:text-neon">{it.venture.name}</span>
                          {(it.approvals?.length ?? 0) > 0 && <span className="ml-auto shrink-0 border border-cyan/40 px-1 text-[8px] uppercase tracking-wide text-cyan">{it.approvals.length} to approve</span>}
                          <span className={`${(it.approvals?.length ?? 0) > 0 ? "" : "ml-auto"} shrink-0 text-[8px] uppercase tracking-[0.15em] text-cyan`}>{it.venture.status}</span>
                        </div>
                        {it.venture.mission && <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-faint">{it.venture.mission}</p>}
                        <div className="mx-auto my-1 w-[140px]"><VentureReactor seats={it.seats.map((s) => ({ dept: s.dept, mastery: s.tasks }))} compact energyPct={Math.min(100, Math.max(20, it.treasury_grid))} /></div>
                        <div className="flex items-center justify-between border-t border-line pt-2 text-[10px]">
                          <Telemetry label="cycles" value={it.venture.cycles} />
                          <Telemetry label="shipped" value={done} />
                          <Telemetry label="rev" value={Math.round(it.revenue_grid || 0)} tone="cyan" />
                          <Telemetry label="treasury" value={Math.round(it.treasury_grid)} tone="cyan" />
                        </div>
                        <IconArrowRight className="absolute right-3 top-3 h-4 w-4 text-ink-faint opacity-0 transition group-hover:translate-x-0.5 group-hover:text-neon group-hover:opacity-100" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* deploy console */}
          <Rise>
            <div className="relative overflow-hidden border border-line bg-black/20 p-5">
              <ScanSweep />
              <div className="mb-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-ink-faint"><span className="text-neon">◤</span> deploy new venture</div>
              {!eligible ? (
                <div className="border border-line bg-black/20 p-4 text-[12px] leading-relaxed text-ink-dim">Ship at least one build with <Link href="/echo" className="text-neon underline-offset-2 hover:underline">Echo</Link> and the deploy console unlocks — a company runs a <span className="text-ink">product</span>, so you bring one to the table.</div>
              ) : (
                <>
                  <div className="text-[8px] uppercase tracking-[0.18em] text-ink-faint">Callsign</div>
                  <div className="mt-1 flex items-center gap-2 border border-line bg-black/40 px-3 focus-within:border-neon/50">
                    <span className="select-none text-[14px] font-bold text-neon">&gt;</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name — e.g. Acme Labs" className="w-full bg-transparent py-2.5 text-[14px] font-bold text-neon placeholder:font-normal placeholder:text-ink-faint outline-none" />
                  </div>

                  <div className="ng-label mb-2 mt-4 !text-ink-dim">◤ crew loadout</div>
                  <div className="grid gap-2 @md:grid-cols-3">
                    {templates.map((t) => {
                      const sel = tpl === t.id;
                      return (
                        <motion.button key={t.id} onClick={() => setTpl(t.id)} whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} className={`relative overflow-hidden border p-3 text-left transition ${sel ? "border-neon bg-neon/[0.06]" : "border-line bg-black/20 hover:border-neon/40"}`}>
                          {sel && <ScanSweep />}
                          <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink"><IconLayers className={`h-3.5 w-3.5 ${sel ? "text-neon" : "text-neon/70"}`} />{t.name}{sel && <span className="ml-auto"><PulseDot size={5} /></span>}</div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-faint">{t.tagline}</p>
                          <div className={`mx-auto mt-1 w-[120px] transition ${sel ? "opacity-100" : "opacity-55"}`}><VentureReactor seats={t.seats.map((s) => ({ dept: s.dept }))} compact energyPct={72} /></div>
                          <div className="mt-0.5 text-center text-[8.5px] uppercase tracking-[0.14em] text-ink-faint">CEO + {t.seats.length - 1} specialist{t.seats.length - 1 === 1 ? "" : "s"}</div>
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-3 @md:grid-cols-2">
                    {builds.length > 0 && (
                      <div>
                        <div className="text-[8px] uppercase tracking-[0.18em] text-ink-faint">Link a product <span className="normal-case tracking-normal">(optional)</span></div>
                        <select value={prod} onChange={(e) => setProd(e.target.value)} className="mt-1 w-full border border-line bg-black/40 px-2.5 py-2 text-[12px] text-ink outline-none focus:border-neon/50">
                          <option value="">— no product yet —</option>
                          {builds.map((b) => <option key={b.build_id} value={b.build_id}>{b.title}{b.deployed ? "  (live)" : ""}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <div className="text-[8px] uppercase tracking-[0.18em] text-ink-faint">Fuel the reactor <span className="normal-case tracking-normal">(optional)</span></div>
                      <div className="mt-1 flex items-center gap-2 border border-line bg-black/40 px-2.5 focus-within:border-neon/50">
                        <IconCoins className="h-3.5 w-3.5 text-neon/70" />
                        <input value={fund} onChange={(e) => setFund(e.target.value.replace(/[^0-9]/g, ""))} placeholder="GRID" className="w-full bg-transparent py-2 text-[13px] text-neon tnum placeholder:font-normal placeholder:text-ink-faint outline-none" />
                        <span className="text-[9px] uppercase tracking-wide text-ink-faint">grid</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    {err && <p className="text-[11px] text-cyan">⚠ {err.replace(/^\w/, (c) => c.toUpperCase())}</p>}
                    <motion.button disabled={!name.trim() || busy} onClick={create} animate={name.trim() && !busy ? { opacity: [1, 0.7, 1] } : { opacity: 1 }} transition={{ duration: 1.6, repeat: Infinity }} className="ng-btn ng-btn-primary ng-btn--sm ml-auto disabled:opacity-40"><IconRocket className="h-3.5 w-3.5" /> {busy ? "Deploying…" : "Deploy the company"}</motion.button>
                  </div>
                </>
              )}
            </div>
          </Rise>

          {!loaded && <p className="text-[12px] text-ink-dim">— booting —</p>}
        </main>

        {/* RIGHT — ops protocol */}
        <OrbPanel label="Protocol" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="OPS PROTOCOL" icon={<IconBot className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            {ventures.length > 0 && (
              <>
                {/* RIGHT ① — treasury runway gauge */}
                <div className="ng-label mb-1.5 !text-ink-dim">◤ treasury runway</div>
                <div className="relative overflow-hidden border border-line bg-black/20 p-2">
                  <ScanSweep />
                  <RunwayArc value={runway} max={12} unit="cycles" caption={ventures.length > 1 ? "weakest company" : "of fuel left"} />
                  <div className="mt-0.5 text-center text-[8px] uppercase tracking-[0.14em] text-ink-faint">{ventures.length > 1 ? `soonest to stall · ${cycleCost}g / cycle` : `${fleet.treasury}g ÷ ${cycleCost}g per cycle`}</div>
                </div>

                {/* RIGHT ② — money flow */}
                <div className="ng-label mb-1.5 mt-5 !text-ink-dim">◤ money flow</div>
                <div className="relative overflow-hidden border border-line bg-black/20 p-2.5">
                  <MoneyFlow inSeries={flowIn} outSeries={flowOut} />
                  <div className="mt-1.5 flex items-center justify-center gap-4 text-[8px] uppercase tracking-wide text-ink-faint">
                    <span className="flex items-center gap-1"><span className="inline-block h-[2px] w-3" style={{ background: CYAN }} />revenue in {fleet.revenue}g</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-0 w-3 border-t border-dashed" style={{ borderColor: NEON }} />spent out {fleet.spent}g</span>
                  </div>
                </div>

                <div className="my-4 border-t border-line/60" />
              </>
            )}
            <div className="relative space-y-3 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-px before:bg-line">
              {OPS.map((s, i) => (
                <motion.div key={s.n} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }} className="relative flex items-start gap-3">
                  <div className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center border border-neon/40 bg-black text-neon"><s.i className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink"><span className="text-[9px] tnum text-neon/60">{s.n}</span>{s.t}</div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{s.d}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 border-l border-neon/30 pl-3 text-[11px] leading-relaxed text-ink-dim">
              <p><span className="text-neon">Real, not roleplay.</span> Every agent runs its own brain, its own tools, and settles on NeuGrid&#39;s rails — a company that actually operates, with reputation on the line.</p>
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[8px] uppercase tracking-[0.2em] text-ink-faint"><PulseDot tone="cyan" size={5} /> rails online</div>
          </Panel>
        </OrbPanel>
      </div>
    </div>
  );
}
