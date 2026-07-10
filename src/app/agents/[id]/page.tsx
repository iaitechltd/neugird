"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Mark, Tag, Bracket, ProgressBar,
  IconCheck, IconArrowRight, IconBolt, IconBot, IconUser, IconActivity,
  IconNetwork, IconCoins, IconShield, IconStar, IconCode, IconMessage,
  IconPlay, IconLayers, IconTarget, IconRefresh, IconClose,
} from "@/components/app/ui";
import { Decrypt, CountUp } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import { PanelChart } from "@/components/app/terminal";
import { Gauge, Spark, StackBars, Stream, SERIES } from "@/components/app/charts";
import type { Agent, AgentPersona, AgentWorkSession, Job, LearnedSkill } from "@/lib/types";

type WorkView = { persona: AgentPersona | null; work: AgentWorkSession | null; skills: LearnedSkill[]; earnings: number; cap: number; offer_policy?: { auto_resolve: boolean; min_amount: number; skills?: string[] } | null };

type Cred = { attestation_id: string; schema: string; title: string; fields: Record<string, string | number>; status: string };
type View = { agent: Agent; owner: { id: string; username: string } | null; jobs: Job[]; credentials: Cred[]; x402_spend: number };
const tierAccent = (t?: string): "neon" | "amber" | "danger" => (t === "trusted" ? "neon" : t === "suspended" ? "danger" : "amber");
const INP = "w-full rounded border border-neon/20 bg-black/40 px-2 py-1.5 text-[12px] text-ink outline-none transition placeholder:text-ink-faint focus:border-neon/50";
const CRED_ICON: Record<string, (p: { className?: string }) => React.JSX.Element> = { agent_trusted: IconShield, work_delivered: IconCheck };
const CRED_NAME: Record<string, string> = { agent_trusted: "Agent Trusted", work_delivered: "Work Delivered" };

function Sec({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="ng-card p-3.5">
      <div className="ng-label mb-2.5 flex items-center justify-between gap-2 !text-ink-dim">
        <span className="flex items-center gap-2"><span className="text-neon">{icon}</span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AgentDetail() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const loadView = useCallback(() => {
    if (!id) return;
    fetch(`/api/agents/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setView(d?.agent ? d : null); setLoaded(true); }).catch(() => setLoaded(true));
  }, [id]);
  useEffect(() => { loadView(); }, [loadView]);
  useEffect(() => { fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.id) setMeId(d.id); }).catch(() => {}); }, []);

  async function saveGateway(patch: { gateway_mode?: "live" | "read_only"; rate_limit_per_hour?: number | null }) {
    const r = await fetch(`/api/agents/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    if (r?.ok) { notify("Gateway safety updated"); loadView(); } else notify("Update failed");
  }

  // native-agent framework — the owner-only work runtime (the /work fetch is owner-gated).
  const [work, setWork] = useState<WorkView | null>(null);
  const [editPersona, setEditPersona] = useState(false);
  const [pForm, setPForm] = useState({ role: "", bio: "", personality: "", goals: "", style: "", knowledge: "" });
  const [armForm, setArmForm] = useState({ skills: "", max_jobs: 5, max_reward: 0 });
  const [policyForm, setPolicyForm] = useState({ auto_resolve: false, min_amount: "", skills: "" });
  const [busy, setBusy] = useState(false);
  // skills marketplace — this owner's published listings (by source skill_id)
  const [listings, setListings] = useState<{ published_id: string; skill_id: string; installs: number; price_grid: number }[]>([]);
  const [pubFor, setPubFor] = useState<string | null>(null); // skill_id whose publish form is open
  const refreshMarket = useCallback(() => {
    fetch("/api/skills").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.listings) setListings((d.listings as { published_id: string; skill_id: string; installs: number; price_grid: number; mine: boolean }[]).filter((p) => p.mine));
    }).catch(() => {});
  }, []);

  const refreshWork = useCallback(() => {
    if (!id) return;
    fetch(`/api/agents/${id}/work`).then((r) => (r.ok ? r.json() : null)).then((d: WorkView | null) => {
      if (!d) return;
      setWork(d);
      const p = d.persona ?? {};
      setPForm({ role: p.role ?? "", bio: p.bio ?? "", personality: p.personality ?? "", goals: p.goals ?? "", style: p.style ?? "", knowledge: (p.knowledge ?? []).join(", ") });
      setArmForm((f) => ({ ...f, max_reward: f.max_reward || Math.round(d.cap) }));
      if (d.offer_policy) setPolicyForm({ auto_resolve: d.offer_policy.auto_resolve, min_amount: String(d.offer_policy.min_amount || ""), skills: (d.offer_policy.skills ?? []).join(", ") });
    }).catch(() => {});
  }, [id]);
  useEffect(() => { if (view && view.agent.origin !== "external") { refreshWork(); refreshMarket(); } }, [view, refreshWork, refreshMarket]);

  async function publishSkill(skill_id: string, price: number) {
    setBusy(true);
    try {
      const r = await fetch("/api/skills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent_id: id, skill_id, price_grid: price }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify((d as { error?: string }).error === "already_listed" ? "Already listed" : "Publish failed"); return; }
      notify(price > 0 ? `Published to the skills market · ${price} GRID` : "Published (free) to the skills market");
      setPubFor(null); refreshMarket();
    } finally { setBusy(false); }
  }
  async function delistSkill(published_id: string) {
    setBusy(true);
    try {
      await fetch(`/api/skills/${published_id}`, { method: "DELETE" });
      notify("Delisted"); refreshMarket();
    } finally { setBusy(false); }
  }

  async function workPost(path: string, body?: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const r = await fetch(`/api/agents/${id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify((d as { error?: string }).error || "Failed"); return null; }
      return d as Record<string, unknown>;
    } finally { setBusy(false); }
  }
  async function savePolicy(next?: Partial<typeof policyForm>) {
    const f = { ...policyForm, ...next };
    setPolicyForm(f);
    const d = await workPost("persona", { offer_policy: { auto_resolve: f.auto_resolve, min_amount: Number(f.min_amount) || 0, skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean) } });
    if (d) { notify(f.auto_resolve ? "Offer auto-resolve armed" : "Offer policy saved (off)"); refreshWork(); }
  }
  async function savePersona() {
    const d = await workPost("persona", { ...pForm, knowledge: pForm.knowledge.split(",").map((s) => s.trim()).filter(Boolean) });
    if (d) { setEditPersona(false); notify("Persona saved"); refreshWork(); }
  }
  async function armWork() {
    const d = await workPost("work", { skills: armForm.skills.split(",").map((s) => s.trim()).filter(Boolean), max_jobs: armForm.max_jobs, max_reward: armForm.max_reward || undefined });
    if (d) { notify("Autonomous work armed"); refreshWork(); }
  }
  async function tickWork() {
    const d = await workPost("work/tick");
    if (d) { const act = (d as { action?: { kind?: string; job_title?: string; rationale?: string } }).action; notify(act ? `${act.kind}: ${act.job_title || act.rationale || ""}` : "step"); refreshWork(); }
  }
  async function stopWork() { const d = await workPost("work/stop"); if (d) { notify("Autonomous work stopped"); refreshWork(); } }

  if (!loaded || !view) {
    return (
      <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
        <NeuHeader />
        <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/agents" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to Agents</Link></div>
        <div className="grid flex-1 place-items-center px-4 py-16 text-center">
          {!loaded ? <div className="text-sm text-ink-dim"><IconBot className="mx-auto mb-3 h-9 w-9 animate-pulse text-neon/60" />Loading agent…</div> : (
            <div><IconBot className="mx-auto h-10 w-10 text-neon/50" /><div className="mt-3 text-sm text-ink">Agent not found.</div><Link href="/agents" className="ng-btn ng-btn-primary ng-btn--sm mt-4">Browse agents</Link></div>
          )}
        </div>
      </div>
    );
  }

  const { agent: a, owner, jobs } = view;
  const verified = jobs.filter((j) => j.status === "paid").length;
  const repTotal = Math.round(a.reputation?.total ?? 0);
  const isExternal = a.origin === "external";
  const rating = a.rating ?? 0;

  // rail-chart data — all real, derived from this page's own payload
  const monthKey = (d: Date) => d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  const OUTCOME_COLORS = [SERIES[0], SERIES[3], SERIES[4]]; // paid · in-flight · rejected
  // jobs bucketed by month (since the agent joined), split by outcome today
  const jobMonths: { key: string; values: [number, number, number] }[] = (() => {
    if (!jobs.length) return [];
    const grp = (s: string) => (s === "paid" ? 0 : s === "rejected" || s === "cancelled" ? 2 : 1);
    const first = new Date(Math.min(+new Date(a.created_at), ...jobs.map((j) => +new Date(j.created_at))));
    const now = new Date();
    if (Number.isNaN(+first) || +first > +now) return [];
    const buckets = new Map<string, [number, number, number]>();
    const cur = new Date(first.getFullYear(), first.getMonth(), 1);
    while (buckets.size < 12 && +cur <= +now) {
      buckets.set(monthKey(cur), [0, 0, 0]);
      cur.setMonth(cur.getMonth() + 1);
    }
    for (const j of jobs) {
      const b = buckets.get(monthKey(new Date(j.created_at)));
      if (b) b[grp(j.status)] += 1;
    }
    return [...buckets.entries()].slice(-8).map(([key, values]) => ({ key, values }));
  })();
  const outcomeTotals = jobMonths.reduce<[number, number, number]>((t, m) => [t[0] + m.values[0], t[1] + m.values[1], t[2] + m.values[2]], [0, 0, 0]);
  // work-runtime activity: log entries on a continuous day axis, one stream per kind
  const runtimeLog = (a.work?.log ?? []).filter((e) => e.at);
  const streamData: { axis: string[]; series: { kind: string; n: number; data: number[] }[] } | null = (() => {
    if (!runtimeLog.length) return null;
    const days = [...new Set(runtimeLog.map((e) => e.at.slice(0, 10)))].sort();
    const kindCounts = [...runtimeLog.reduce((m, e) => m.set(e.kind, (m.get(e.kind) ?? 0) + 1), new Map<string, number>()).entries()]
      .sort((x, y) => y[1] - x[1]).slice(0, 3);
    if (kindCounts.length < 2 || days.length < 3) return null; // too thin for a multi-series stream
    const DAY = 86400000;
    const last = +new Date(`${days[days.length - 1]}T00:00:00Z`);
    const span = Math.min(14, Math.round((last - +new Date(`${days[0]}T00:00:00Z`)) / DAY) + 1);
    const axis = Array.from({ length: span }, (_, i) => new Date(last - (span - 1 - i) * DAY).toISOString().slice(0, 10));
    const series = kindCounts.map(([kind, n]) => ({ kind, n, data: axis.map((d) => runtimeLog.filter((e) => e.kind === kind && e.at.slice(0, 10) === d).length) }));
    return { axis, series };
  })();
  // paid deliveries, oldest → newest — the earnings-per-delivery series
  const paidJobs = [...jobs].filter((j) => j.status === "paid").sort((x, y) => +new Date(x.updated_at ?? x.created_at) - +new Date(y.updated_at ?? y.created_at));
  const paySeries = paidJobs.map((j) => j.reward_amount);
  const lifetime = paySeries.reduce((s, v) => s + v, 0);
  // center visual — reward earned per month from paid deliveries (real timestamps)
  const earnMonths: { key: string; sum: number; n: number }[] = (() => {
    if (!paidJobs.length) return [];
    const m = new Map<string, { sum: number; n: number }>();
    for (const j of paidJobs) {
      const key = monthKey(new Date(j.updated_at ?? j.created_at));
      const cur = m.get(key) ?? { sum: 0, n: 0 };
      m.set(key, { sum: cur.sum + j.reward_amount, n: cur.n + 1 });
    }
    return [...m.entries()].slice(-12).map(([key, v]) => ({ key, ...v }));
  })();
  const earnMax = Math.max(1, ...earnMonths.map((b) => b.sum));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search")} onBell={() => notify("Notifications")} />
      <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/agents" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to Agents</Link></div>

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — identity */}
        <OrbPanel side="left" label="Agent" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[340px]" className="space-y-3 lg:overflow-y-auto">
          <Bracket className="ng-panel p-4">
            <div className="flex items-center gap-3">
              <MatrixAvatar seed={a.agent_id} size={56} />
              <div className="min-w-0">
                <div className="ng-title text-base font-bold text-neon text-glow"><Decrypt text={a.name} /></div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]"><Tag>{a.origin ?? "native"}</Tag><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[9px]">{a.trust_tier ?? "trusted"}</Mark></div>
              </div>
            </div>
            <div className="mt-3 divide-y divide-line text-[11px]">
              <div className="ng-row !py-2"><span className="ng-row__k">Status</span><span className="ng-row__v flex items-center gap-1.5"><span className={a.status === "active" ? "ng-led" : "ng-led ng-led--idle"} /><span className={a.status === "active" ? "text-neon" : "text-ink-dim"}>{a.status}</span></span></div>
              {isExternal && a.external_framework && <div className="ng-row !py-2"><span className="ng-row__k">Framework</span><span className="ng-row__v">{a.external_framework}</span></div>}
              <div className="ng-row !py-2"><span className="ng-row__k">Owner</span><span className="ng-row__v">{owner?.username ?? a.owner_id}</span></div>
            </div>
            <Link href={`/messages?to=${a.agent_id}`} className="ng-btn ng-btn-primary ng-btn--block ng-btn--sm mt-3"><IconMessage className="h-3.5 w-3.5" /> Message · deal · hire</Link>
          </Bracket>

          <PanelChart title="RATING · VERIFIED WORK" read={`${rating.toFixed(1)} / 5 · ${verified} verified`}>
            {rating > 0
              ? <div className="flex justify-center py-1"><Gauge percent={Math.round((rating / 5) * 100)} value={rating.toFixed(1)} w={116} /></div>
              : <p className="text-[10px] text-ink-faint">Unrated — the dial fills as verified deliveries land.</p>}
          </PanelChart>

          <PanelChart title="JOBS · MONTHLY × OUTCOME" read={`${jobs.length} all-time`}>
            {jobMonths.length > 0 ? (
              <div>
                <StackBars data={jobMonths.map((m) => ({ values: m.values }))} h={48} colors={OUTCOME_COLORS} />
                <div className="mt-1 flex justify-between text-[8.5px] text-ink-faint">
                  {(jobMonths.length <= 6 ? jobMonths : [jobMonths[0], jobMonths[jobMonths.length - 1]]).map((m) => <span key={m.key}>{m.key}</span>)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px] text-ink-dim">
                  {(["paid", "in-flight", "rejected"] as const).map((lbl, gi) => (
                    <span key={lbl} className="flex items-center gap-1"><span className="inline-block h-2 w-2" style={{ background: OUTCOME_COLORS[gi] }} />{lbl} {outcomeTotals[gi]}</span>
                  ))}
                </div>
              </div>
            ) : <p className="text-[10px] text-ink-faint">No jobs on record — the monthly mix draws as work lands.</p>}
          </PanelChart>

          <Sec icon={<IconBolt className="h-3.5 w-3.5" />} title="Capabilities">
            {a.capabilities.length ? <div className="flex flex-wrap gap-2">{a.capabilities.map((c) => <Tag key={c}>{c}</Tag>)}</div> : <p className="text-[11px] text-ink-dim">None declared.</p>}
          </Sec>

          <Sec icon={<IconCoins className="h-3.5 w-3.5" />} title="Economics">
            <div className="divide-y divide-line text-[11px]">
              <div className="ng-row !py-2"><span className="ng-row__k">Owner revenue split</span><Mark plain className="!text-[11px]">{Math.round((a.owner_split_bps ?? 0) / 100)}%</Mark></div>
              <div className="ng-row !py-2"><span className="ng-row__k">Agent wallet</span><Mark plain className="!text-[11px]">{(a.earnings ?? 0).toLocaleString()} Pulse</Mark></div>
              {isExternal && <div className="ng-row !py-2"><span className="ng-row__k">Bond</span><Mark plain className="!text-[11px]">{(a.bond_amount ?? 0).toLocaleString()}</Mark></div>}
            </div>
          </Sec>
        </OrbPanel>

        {/* CENTER — overview + job history */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-[12px] text-neon"><IconBot className="h-4 w-4" /><Decrypt text={isExternal ? "External agent · via MCP" : "Native agent"} /></div>
                <div className="ng-title mt-1 text-2xl font-bold text-neon text-glow">{a.name}</div>
                <p className="text-sm text-ink-dim">A first-class economic actor — claims Jobs, earns reputation + a rating, and splits the reward with {owner?.username ?? "its owner"}.</p>
              </div>
              <Link href={`/passport/${a.agent_id}`} className="ng-btn ng-btn--sm shrink-0"><IconShield className="h-3.5 w-3.5" />Passport ↗</Link>
            </div>
          </Bracket>

          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 4 + closed } as React.CSSProperties}>
            {([["Reputation", repTotal], ["Rating", a.rating ?? 0], ["Earnings", a.earnings ?? 0], ["Verified jobs", verified]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="ng-card p-4 text-center"><div className="ng-stat__v"><CountUp key={v} value={v} decimals={k === "Rating" ? 1 : 0} /></div><div className="ng-stat__k">{k}</div></div>
            ))}
          </div>

          {/* NATIVE AGENT FRAMEWORK (owner-only) — persona · autonomous work · skill library */}
          {work && (
            <>
              <Sec icon={<IconTarget className="h-3.5 w-3.5" />} title="Persona" action={<button onClick={() => setEditPersona((v) => !v)} className="text-[11px] text-neon/80 transition hover:text-neon">{editPersona ? "Cancel" : work.persona?.role || work.persona?.personality ? "Edit" : "Set persona"}</button>}>
                {!editPersona ? (
                  work.persona?.role || work.persona?.personality || work.persona?.goals ? (
                    <div className="space-y-1 text-[11px]">
                      {work.persona.role && <div className="ng-row !py-1.5"><span className="ng-row__k">Role</span><span className="ng-row__v text-ink">{work.persona.role}</span></div>}
                      {work.persona.personality && <div className="ng-row !py-1.5"><span className="ng-row__k">Personality</span><span className="ng-row__v text-ink">{work.persona.personality}</span></div>}
                      {work.persona.goals && <div className="ng-row !py-1.5"><span className="ng-row__k">Goals</span><span className="ng-row__v text-ink">{work.persona.goals}</span></div>}
                      {work.persona.knowledge?.length ? <div className="flex flex-wrap gap-1.5 pt-1.5">{work.persona.knowledge.map((k) => <Tag key={k}>{k}</Tag>)}</div> : null}
                    </div>
                  ) : <p className="text-[11px] text-ink-dim">No persona yet — give this agent a character (role · personality · goals) so it works like an agent, not an LLM wrapper.</p>
                ) : (
                  <div className="space-y-2">
                    {([["role", "Role — e.g. Research analyst"], ["personality", "Personality — e.g. rigorous, concise, skeptical"], ["goals", "Goals — what it optimizes for"], ["style", "Output style"], ["knowledge", "Knowledge domains (comma-separated)"]] as [keyof typeof pForm, string][]).map(([k, ph]) => (
                      <input key={k} value={pForm[k]} onChange={(e) => setPForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={ph} className={INP} />
                    ))}
                    <button disabled={busy} onClick={savePersona} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block">Save persona</button>
                  </div>
                )}
              </Sec>

              <Sec icon={<IconTarget className="h-3.5 w-3.5" />} title="Offer Policy" action={
                <button onClick={() => savePolicy({ auto_resolve: !policyForm.auto_resolve })} role="switch" aria-checked={policyForm.auto_resolve} className={`relative h-5 w-9 shrink-0 rounded-full transition ${policyForm.auto_resolve ? "bg-neon" : "bg-line"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-all ${policyForm.auto_resolve ? "left-[18px]" : "left-0.5"}`} />
                </button>
              }>
                <p className="mb-2 text-[10px] leading-relaxed text-ink-faint">Armed, the agent settles incoming hire/deal offers itself: accepts at or above the floor (within the allowed domains), declines the rest in persona. Accepted hires escrow the hirer&rsquo;s USDC instantly.</p>
                <div className="flex gap-2">
                  <input value={policyForm.min_amount} onChange={(e) => setPolicyForm((f) => ({ ...f, min_amount: e.target.value.replace(/[^0-9.]/g, "") }))} inputMode="decimal" placeholder="Floor $" className="ng-input w-24 !py-1.5 text-[11px]" />
                  <input value={policyForm.skills} onChange={(e) => setPolicyForm((f) => ({ ...f, skills: e.target.value }))} placeholder="Allowed domains (comma) — blank = any" className="ng-input !py-1.5 text-[11px]" />
                  <button disabled={busy} onClick={() => savePolicy()} className="ng-btn ng-btn--sm shrink-0 !py-1.5 text-[10px] disabled:opacity-40">Save</button>
                </div>
              </Sec>

              <Sec icon={<IconBolt className="h-3.5 w-3.5" />} title="Autonomous Work" action={<span className="flex items-center gap-2">{work.work?.active ? <span className="flex items-center gap-1.5 text-[10px] text-neon"><span className="ng-led" />running</span> : <span className="text-[10px] text-ink-faint">idle</span>}<button onClick={refreshWork} title="refresh" className="text-ink-faint transition hover:text-neon"><IconRefresh className="h-3 w-3" /></button></span>}>
                {work.work?.active ? (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-ink-dim">Jobs delivered</span><Mark plain className="!text-[11px]">{work.work.jobs_done} / {work.work.max_jobs}</Mark></div>
                      <ProgressBar percent={Math.min(100, (work.work.jobs_done / Math.max(1, work.work.max_jobs)) * 100)} />
                    </div>
                    <div className="flex gap-2">
                      <button disabled={busy} onClick={tickWork} className="ng-btn ng-btn-primary ng-btn--sm flex-1"><IconPlay className="h-3.5 w-3.5" /> Run step</button>
                      <button disabled={busy} onClick={stopWork} className="ng-btn ng-btn-danger ng-btn--sm"><IconClose className="h-3.5 w-3.5" /> Stop</button>
                    </div>
                    <div className="border-t border-line pt-2.5">
                      <div className="ng-label mb-2 !text-[9px] !text-ink-faint">Activity feed</div>
                      {work.work.log.length ? (
                        <div className="space-y-2">
                          {work.work.log.map((e, i) => (
                            <div key={i} className="flex items-start gap-2 text-[10.5px]">
                              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded ${e.ok ? "bg-neon/10 text-neon" : "bg-neon/5 text-ink-faint"}`}>{e.kind === "delivered" ? <IconCheck className="h-2.5 w-2.5" /> : <IconActivity className="h-2.5 w-2.5" />}</span>
                              <div className="min-w-0"><span className="text-ink">{e.kind}{e.job_title ? ` · ${e.job_title}` : ""}</span><span className="block truncate text-ink-faint">{e.rationale}{e.skills_applied ? ` · ${e.skills_applied} skill(s) applied` : ""}</span></div>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-[10px] text-ink-faint">No steps yet — run one.</p>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-ink-dim">Arm the agent to autonomously find, claim, deliver, and get paid for matching Jobs — within your guardrails.</p>
                    <input value={armForm.skills} onChange={(e) => setArmForm((f) => ({ ...f, skills: e.target.value }))} placeholder={`Skills filter — default: ${a.capabilities.join(", ") || "any"}`} className={INP} />
                    <div className="flex gap-2">
                      <label className="flex-1 text-[10px] text-ink-dim">Max jobs<input type="number" min={1} max={50} value={armForm.max_jobs} onChange={(e) => setArmForm((f) => ({ ...f, max_jobs: Number(e.target.value) }))} className={`${INP} mt-1`} /></label>
                      <label className="flex-1 text-[10px] text-ink-dim">Max reward / job<input type="number" min={1} value={armForm.max_reward} onChange={(e) => setArmForm((f) => ({ ...f, max_reward: Number(e.target.value) }))} className={`${INP} mt-1`} /></label>
                    </div>
                    <button disabled={busy} onClick={armWork} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block"><IconBolt className="h-3.5 w-3.5" /> Arm autonomous work</button>
                  </div>
                )}
              </Sec>

              <Sec icon={<IconLayers className="h-3.5 w-3.5" />} title="Skill Library" action={<Mark plain className="!text-[10px]">{work.skills.length}</Mark>}>
                {work.skills.length ? (
                  <div className="space-y-1.5">
                    {work.skills.map((s) => {
                      const listed = listings.find((p) => p.skill_id === s.skill_id);
                      return (
                        <div key={s.skill_id} className="border-b border-neon/10 pb-1.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex min-w-0 items-center gap-1.5"><span className="truncate text-ink">{s.title}</span><Tag className="!text-[9px] shrink-0">{s.domain}</Tag>{s.from_published && <Mark plain accent="cyan" className="!text-[8px] shrink-0">installed</Mark>}</div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="text-[10px] text-neon" title="mastery (reuses)">×{s.uses}</span>
                              {listed ? (
                                <span className="flex items-center gap-1 text-[9px] text-cyan">listed · {listed.installs}↓ <button onClick={() => delistSkill(listed.published_id)} disabled={busy} className="text-ink-faint hover:text-danger">delist</button></span>
                              ) : s.from_published ? null : (
                                <button onClick={() => setPubFor(pubFor === s.skill_id ? null : s.skill_id)} disabled={busy} className="text-[9px] text-ink-faint transition hover:text-neon">publish →</button>
                              )}
                            </div>
                          </div>
                          {pubFor === s.skill_id && !listed && (
                            <form onSubmit={(e) => { e.preventDefault(); const price = Number(new FormData(e.currentTarget).get("price")) || 0; publishSkill(s.skill_id, price); }} className="mt-1.5 flex items-center gap-1.5">
                              <input name="price" type="number" min={0} defaultValue={50} className="ng-input !w-24 !py-1 text-[10px]" placeholder="GRID" />
                              <button type="submit" disabled={busy} className="ng-btn ng-btn-primary ng-btn--sm !py-1 !text-[10px] disabled:opacity-50">List it</button>
                              <span className="text-[9px] text-ink-faint">price to install (0 = free)</span>
                            </form>
                          )}
                        </div>
                      );
                    })}
                    <p className="pt-1 text-[10px] text-ink-faint">Skills the agent wrote from delivered Jobs. <span className="text-ink-dim">Publish one to the <Link href="/skills" className="text-neon hover:underline">skills market</Link> and earn GRID each time another builder installs it.</span></p>
                  </div>
                ) : <p className="text-[11px] text-ink-dim">No skills yet — the agent writes a reusable skill each time it delivers a Job, getting better over time.</p>}
              </Sec>
            </>
          )}

          {earnMonths.length >= 2 && (
            <div className="ng-card p-3.5">
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span className="ng-label !text-ink-dim">REWARDS OVER TIME</span>
                <span className="text-ink-faint">{paidJobs.length} paid deliveries · ${lifetime.toLocaleString()} lifetime · split {Math.round((a.owner_split_bps ?? 0) / 100)}% to owner</span>
              </div>
              <div className="flex items-end gap-4">
                {earnMonths.map((b) => (
                  <div key={b.key} className="flex w-14 flex-col items-center gap-1" title={`${b.key}: ${b.n} paid job(s) · $${b.sum.toLocaleString()}`}>
                    <span className="text-[10px] font-bold text-neon tnum">${b.sum.toLocaleString()}</span>
                    <div className="w-5 bg-neon/80" style={{ height: `${Math.max(4, Math.round((b.sum / earnMax) * 46))}px` }} />
                    <span className="text-[9px] text-ink-faint">{b.key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Sec icon={<IconActivity className="h-3.5 w-3.5" />} title={`Job History · ${jobs.length}`} action={<Link href="/jobs" className="text-[11px] text-ink-dim transition hover:text-neon">Job board</Link>}>
            {jobs.length ? (
              <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
                {jobs.map((j) => (
                  <div key={j.job_id} className="ng-card flex flex-col p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Tag className="!text-[9px]">{(j.context ?? "job").replace(/_/g, " ")}</Tag>
                      <Mark plain accent={j.status === "paid" ? "neon" : j.status === "rejected" ? "danger" : "amber"} className="!text-[9px] shrink-0">{j.status}</Mark>
                    </div>
                    <div className="mt-2 truncate text-[13px] font-semibold text-ink" title={j.title}>{j.title}</div>
                    <p className="truncate pb-2 text-[10.5px] text-ink-dim" title={j.description}>{j.description}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-1.5 text-[9px] text-ink-faint">
                      <span className="truncate" title={j.required_skills.join(" · ")}>{j.required_skills.slice(0, 3).join(" · ") || "any skills"}</span>
                      <span className="shrink-0 text-[11px] font-bold text-neon tnum">{j.reward_amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No jobs yet — deploy this agent from the <Link href="/agents" className="text-neon">Agents</Link> page.</p>}
          </Sec>
        </main>

        {/* RIGHT — signal */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[340px]" className="space-y-3 lg:overflow-y-auto">
          <Sec icon={<IconStar className="h-3.5 w-3.5" />} title="Standing">
            <div className="flex items-baseline justify-between"><span className="ng-stat__v !text-xl">{repTotal}</span><span className="flex items-center gap-1 text-[12px] text-neon"><IconStar className="h-3.5 w-3.5" />{(a.rating ?? 0).toFixed(1)}</span></div>
            <div className="text-[11px] text-ink-dim">reputation · rating</div>
            {view.x402_spend > 0 && <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11px]"><span className="text-ink-dim">x402 spend</span><Mark plain className="!text-[11px]">{view.x402_spend} USDC</Mark></div>}
          </Sec>

          <PanelChart title="WORK RUNTIME · BY KIND" read={runtimeLog.length ? `${runtimeLog.length} actions` : "idle"}>
            {streamData ? (
              <div className="space-y-1">
                {streamData.series.map((s, i) => (
                  <div key={s.kind}>
                    <div className="flex items-center justify-between text-[8.5px] text-ink-faint"><span>{s.kind}</span><span className="tnum">{s.n}</span></div>
                    <Stream data={s.data} gid={`agstream-${a.agent_id}-${i}`} h={22} color={[SERIES[0], SERIES[3], SERIES[1]][i]} />
                  </div>
                ))}
                <div className="flex justify-between text-[8.5px] text-ink-faint"><span>{streamData.axis[0].slice(5)}</span><span>{streamData.axis[streamData.axis.length - 1].slice(5)}</span></div>
              </div>
            ) : (
              <p className="text-[10px] text-ink-faint">
                {runtimeLog.length
                  ? "Single-kind activity so far — the stream splits once the runtime logs 2+ action kinds across 3+ days."
                  : "No runtime activity yet — arm autonomous work to start the stream."}
              </p>
            )}
          </PanelChart>

          <PanelChart title="REWARDS · PER PAID DELIVERY" read={`$${lifetime.toLocaleString()} lifetime`}>
            {paySeries.length >= 2
              ? <Spark data={paySeries.slice(-12)} gid={`agpay-${a.agent_id}`} w={260} h={44} />
              : <p className="text-[10px] text-ink-faint">{paySeries.length === 1 ? "One paid delivery so far — the trend needs a second point." : "No paid deliveries yet."}</p>}
          </PanelChart>

          <Sec icon={<IconShield className="h-3.5 w-3.5" />} title="Trust Tier">
            <div className="flex items-center gap-2 text-[12px]"><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[10px]">{a.trust_tier ?? "trusted"}</Mark></div>
            {a.trust_tier === "trusted" ? (
              <p className="mt-2 text-[11px] text-ink-dim">Uncapped — earned a track record of verified work.</p>
            ) : (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-ink-dim">Verified jobs</span><Mark plain className="!text-[11px]">{verified} / 3</Mark></div>
                <ProgressBar percent={Math.min(100, (verified / 3) * 100)} />
                <p className="mt-2 text-[10px] text-ink-dim">Probation: capped at 200 reward/Job until 3 verified jobs (or a 1,000+ bond).</p>
              </div>
            )}
          </Sec>

          <Sec icon={<IconShield className="h-3.5 w-3.5" />} title="Soulbound Credentials" action={<Mark plain className="!text-[10px]">{view.credentials.length}</Mark>}>
            {view.credentials.length === 0 ? (
              <p className="text-[11px] text-ink-faint">No credentials yet — deliver verified jobs to earn them.</p>
            ) : (
              <div className="space-y-1.5">
                {view.credentials.map((c) => {
                  const Ico = CRED_ICON[c.schema] ?? IconShield;
                  return (
                    <div key={c.attestation_id} className="flex items-center gap-2.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-neon/10 text-neon"><Ico className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0 flex-1"><div className="truncate text-[11px] text-ink">{CRED_NAME[c.schema] ?? c.schema}</div><div className="truncate text-[10px] text-ink-faint">{c.title}</div></div>
                      <Mark plain accent="neon" className="!text-[9px] shrink-0">soulbound</Mark>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[10px] text-ink-faint">Ready to mint as Solana SAS attestations. <Tag className="!text-[9px]">pending</Tag></p>
          </Sec>

          <Sec icon={<IconUser className="h-3.5 w-3.5" />} title="Owner">
            <div className="flex items-center gap-2.5">
              <MatrixAvatar seed={owner?.username ?? a.owner_id} size={36} />
              <div className="min-w-0"><div className="truncate text-xs text-ink">{owner?.username ?? a.owner_id}</div><div className="text-[10px] text-ink-dim">earns {Math.round((a.owner_split_bps ?? 0) / 100)}% of this agent&#39;s rewards</div></div>
            </div>
          </Sec>

          <Sec icon={<IconNetwork className="h-3.5 w-3.5" />} title="Integration">
            <div className="flex items-center gap-1.5 text-[11px]"><IconCheck className="h-3.5 w-3.5 text-neon" /><Mark plain accent={isExternal ? "cyan" : "neon"}>{isExternal ? "External · connected via MCP" : "Native · built in-platform"}</Mark></div>
            {isExternal && <p className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-dim"><IconCode className="h-3 w-3" />Operates over the agent-gateway (list/claim/submit).</p>}
          </Sec>

          {/* GATEWAY SAFETY (owner-only, external agents) — read-only mode + write rate limit */}
          {isExternal && meId === a.owner_id && (
            <Sec icon={<IconShield className="h-3.5 w-3.5" />} title="Gateway safety">
              <div className="flex items-center justify-between text-[11px]">
                <div><div className="text-ink">Read-only mode</div><div className="text-[10px] text-ink-faint">query only — blocks claim/submit/trade/pay</div></div>
                <button onClick={() => saveGateway({ gateway_mode: a.gateway_mode === "read_only" ? "live" : "read_only" })} className={`rounded-full border px-2 py-0.5 text-[10px] transition ${a.gateway_mode === "read_only" ? "border-amber/50 bg-amber/15 text-amber" : "border-neon/40 text-neon"}`}>{a.gateway_mode === "read_only" ? "ON" : "off"}</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("rl")); saveGateway({ rate_limit_per_hour: v > 0 ? v : null }); }} className="mt-2.5 border-t border-neon/10 pt-2.5">
                <div className="text-[11px] text-ink">Write rate limit</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <input name="rl" type="number" min={0} defaultValue={a.rate_limit_per_hour ?? ""} placeholder="0 = unlimited" className="ng-input !py-1 text-[10px]" />
                  <span className="text-[10px] text-ink-faint">/hr</span>
                  <button type="submit" className="ng-btn ng-btn--sm !py-1 !text-[10px]">Set</button>
                </div>
                <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-faint">Enforced on every gateway write. A read-only or throttled agent can still read market data + its mandate.</p>
              </form>
            </Sec>
          )}
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
    </div>
  );
}
