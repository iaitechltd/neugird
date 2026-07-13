"use client";

/**
 * /ventures — VENTURE COMMAND. Deploy and monitor a fleet of agent companies,
 * each drawn as a living reactor. A builder (≥1 Echo build) picks a crew template,
 * owns the company, fuels a treasury, and issues objectives. Terminal aesthetic;
 * reactor visual language (no charts, no boxes, no org trees).
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
import { VentureReactor, Waveform, Telemetry } from "@/components/app/venture-reactor";

const NEON = "#00ff00";

type Tpl = { id: string; name: string; tagline: string; seats: { dept: string; title: string }[] };
type VItem = {
  venture: { venture_id: string; name: string; mission: string; status: string; cycles: number };
  seats: { agent_id: string; dept: string; title: string; tasks: number }[]; treasury_grid: number; objectives: { status: string }[];
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
    grid: ventures.reduce((a, v) => a + v.treasury_grid, 0),
    shipped: ventures.reduce((a, v) => a + v.objectives.filter((o) => o.status === "done").length, 0),
  };

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
              <div className="mt-2 h-5 opacity-70"><Waveform height={20} speed={2.6} color={eligible ? NEON : "#48f5ff"} kind="ekg" /></div>
              <div className="mt-1 text-[10px] leading-snug text-ink-faint">{eligible ? "Merit opens the gate — you may take command of a crew." : "Ship a build with Echo to unlock command."}</div>
              {!eligible && <Link href="/echo" className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-3"><IconRocket className="h-3.5 w-3.5" /> Build with Echo</Link>}
            </ConsoleFrame>

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
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-3.5">
                <Telemetry label="fleet" value={<CountUp key={fleet.companies} value={fleet.companies} />} big />
                <Telemetry label="agents deployed" value={<CountUp key={fleet.agents} value={fleet.agents} />} tone="cyan" big />
                <Telemetry label="cycles run" value={<CountUp key={fleet.cycles} value={fleet.cycles} />} big />
                <Telemetry label="shipped" value={<CountUp key={fleet.shipped} value={fleet.shipped} />} big />
                <Telemetry label="grid deployed" value={<CountUp key={fleet.grid} value={fleet.grid} />} tone="cyan" big />
              </div>
            </div>
          </Rise>

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
                          <span className="ml-auto text-[8px] uppercase tracking-[0.15em] text-cyan">{it.venture.status}</span>
                        </div>
                        {it.venture.mission && <p className="mt-0.5 line-clamp-1 text-[10px] text-ink-faint">{it.venture.mission}</p>}
                        <div className="mx-auto my-1 w-[140px]"><VentureReactor seats={it.seats.map((s) => ({ dept: s.dept, mastery: s.tasks }))} compact energyPct={Math.min(100, Math.max(20, it.treasury_grid))} /></div>
                        <div className="flex items-center justify-between border-t border-line pt-2 text-[10px]">
                          <Telemetry label="crew" value={it.seats.length} />
                          <Telemetry label="cycles" value={it.venture.cycles} />
                          <Telemetry label="shipped" value={done} />
                          <Telemetry label="grid" value={it.treasury_grid} tone="cyan" />
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
