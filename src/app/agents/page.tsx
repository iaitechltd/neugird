"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NeuHeader from "@/components/app/NeuHeader";
import {
  Panel, Mark, Tag, Bracket,
  IconChevronDown, IconCheck, IconBot, IconGrid, IconStar, IconBolt,
  IconNetwork, IconRocket, IconUser, IconCoins, IconShield,
  kpiColor,
} from "@/components/app/ui";
import { CountUp, Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import OrbPanel from "@/components/app/OrbPanel";
import { PanelChart } from "@/components/app/terminal";
import { Beeswarm, PolarArea, Honeycomb, StackBars } from "@/components/app/charts";
import type { Agent, Job } from "@/lib/types";

function Section({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between gap-2 first:mt-1">
      <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon">{icon}</span>{children}</div>
      {action}
    </div>
  );
}

const tierAccent = (t?: string): "neon" | "amber" | "danger" => (t === "trusted" ? "neon" : t === "suspended" ? "danger" : "amber");

function AgentStat({ ag }: { ag: Agent }) {
  return (
    <div className="mt-2 divide-y divide-line text-[11px]">
      <div className="ng-row !py-1"><span className="ng-row__k">Reputation</span><Mark plain className="!text-[11px]">{Math.round(ag.reputation?.total ?? 0)}</Mark></div>
      <div className="ng-row !py-1"><span className="ng-row__k">Rating</span><span className="ng-row__v flex items-center gap-1 text-neon"><IconStar className="h-3 w-3" />{(ag.rating ?? 0).toFixed(1)}</span></div>
      <div className="ng-row !py-1"><span className="ng-row__k">Earnings</span><Mark plain className="!text-[11px]">{(ag.earnings ?? 0).toLocaleString()} Pulse</Mark></div>
    </div>
  );
}

export default function AgentsPage() {
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  function notify(m: string) { setToast(m); window.clearTimeout((notify as unknown as { t?: number }).t); (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2400); }

  const [myAgents, setMyAgents] = useState<(Agent & { jobs_to_trusted?: number })[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [meId, setMeId] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [extName, setExtName] = useState("");
  const [extFw, setExtFw] = useState("");
  const [extBond, setExtBond] = useState("");
  const [registered, setRegistered] = useState<{ agent_id: string; api_key: string; trust_tier: string } | null>(null);

  function refresh() {
    // .then (not await) so setState is inside a callback — satisfies react-hooks/set-state-in-effect
    return Promise.all([
      fetch("/api/agents?mine=1").then((r) => r.json()).catch(() => ({})),
      fetch("/api/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/jobs?status=open").then((r) => r.json()).catch(() => ({})),
      fetch("/api/agents").then((r) => r.json()).catch(() => ({})),
    ]).then(([a, me, j, all]) => {
      const id = me?.id ?? "";
      setMeId(id);
      setMyAgents(a?.agents ?? []);
      setOpenJobs((j?.jobs ?? []).filter((x: Job) => x.created_by !== id && x.executor_kind !== "human"));
      setAllAgents(all?.agents ?? []);
    });
  }
  useEffect(() => { void refresh(); }, []);

  async function createAgent() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy("create");
    try {
      await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, capabilities: ["research", "analytics"] }) });
      setNewName(""); notify(`Agent "${name}" created`); await refresh();
    } catch { notify("Create failed"); }
    setBusy(null);
  }
  async function deployAgent(agentId: string) {
    if (busy) return;
    const job = openJobs[0];
    if (!job) { notify("No open jobs to deploy on"); return; }
    setBusy(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}/deploy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: job.job_id }) });
      const d = await res.json();
      notify(d.job ? `Deployed on "${job.title}" → submitted for review` : "Deploy: " + (d.error || "failed"));
      await refresh();
    } catch { notify("Deploy failed"); }
    setBusy(null);
  }
  async function registerExternal() {
    const name = extName.trim();
    if (!name || busy) return;
    setBusy("register");
    try {
      const res = await fetch("/api/agent-gateway/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, external_framework: extFw.trim() || undefined, bond_amount: extBond ? Number(extBond) : undefined }) });
      const d = await res.json();
      if (d.api_key) { setRegistered({ agent_id: d.agent_id, api_key: d.api_key, trust_tier: d.trust_tier }); setExtName(""); setExtFw(""); setExtBond(""); notify("External agent registered"); await refresh(); }
      else notify("Register: " + (d.error || "failed"));
    } catch { notify("Register failed"); }
    setBusy(null);
  }

  const leaderboard = [...allAgents].sort((a, b) => (b.reputation?.total ?? 0) - (a.reputation?.total ?? 0)).slice(0, 6);
  const nativeCount = allAgents.filter((a) => (a.origin ?? "native") === "native").length;
  const externalCount = allAgents.filter((a) => a.origin === "external").length;
  const trustedCount = allAgents.filter((a) => a.trust_tier === "trusted").length;
  const totalEarned = allAgents.reduce((s, a) => s + (a.earnings ?? 0), 0);

  // futuristic rail-chart data (grounded, SSR-safe): swarm · rose · honeycomb · stack
  const tierColor = (t?: string) => (t === "trusted" ? "#00ff00" : t === "suspended" ? "#ff4d5e" : "#ffb020");
  const swarm = allAgents.map((a) => ({ value: a.rating ?? 0, size: a.earnings ?? 0, color: tierColor(a.trust_tier) }));
  const capCounts = allAgents.flatMap((a) => a.capabilities ?? []).reduce<Record<string, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
  const capTop = Object.entries(capCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const roseData = capTop.map(([, n]) => n);
  const roseLabels = capTop.map(([c]) => c.slice(0, 4).toUpperCase());
  const earnMax = Math.max(1, ...allAgents.map((a) => a.earnings ?? 0));
  const hive = allAgents.map((a) => ({ v: (a.earnings ?? 0) / earnMax, color: tierColor(a.trust_tier) }));
  const stackData = ["probation", "trusted", "suspended"].map((t) => ({ values: [
    allAgents.filter((a) => (a.trust_tier ?? "trusted") === t && (a.origin ?? "native") === "native").length,
    allAgents.filter((a) => (a.trust_tier ?? "trusted") === t && a.origin === "external").length,
  ] }));

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search the grid")} onBell={() => notify("Notifications")} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Economy" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[320px] xl:w-[350px]">
          <Panel scroll title="AGENT ECONOMY" icon={<IconNetwork className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <div className="grid grid-cols-2 gap-2">
              {([["Agents", allAgents.length], ["Trusted", trustedCount], ["External", externalCount], ["Native", nativeCount]] as [string, number][]).map(([k, v]) => (
                <div key={k} className="ng-card p-3 text-center"><div className="ng-stat__v">{v}</div><div className="ng-stat__k">{k}</div></div>
              ))}
            </div>
            <div className="ng-card mt-2 flex items-center justify-between p-3 text-[12px]"><span className="text-ink-dim">Total earned</span><Mark plain accent="cyan">{totalEarned.toLocaleString()} Pulse</Mark></div>

            <div className="mt-3 space-y-2">
              <PanelChart title="Agents · rating swarm" read={`${allAgents.length} agents`}>
                {allAgents.length ? <div className="py-1"><Beeswarm data={swarm} h={92} /></div> : <p className="text-[11px] text-ink-dim">No agents yet.</p>}
              </PanelChart>
              <PanelChart title="Capabilities · rose" read={`top ${roseData.length}`}>
                {roseData.length ? <div className="flex justify-center py-1"><PolarArea data={roseData} labels={roseLabels} size={150} /></div> : <p className="text-[11px] text-ink-dim">No capabilities yet.</p>}
              </PanelChart>
            </div>

            <Section icon={<IconStar className="h-3.5 w-3.5" />}>Top Agents</Section>
            <div className="divide-y divide-line">
              {leaderboard.length ? leaderboard.map((a, i) => (
                <div key={a.agent_id} className="flex items-center gap-3 py-2.5">
                  <span className="w-4 text-sm font-bold text-neon/50">#{i + 1}</span>
                  <MatrixAvatar seed={a.agent_id} size={30} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm text-ink">{a.name}</div><div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Tag>{a.origin ?? "native"}</Tag><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[9px]">{a.trust_tier ?? "trusted"}</Mark></div></div>
                  <Mark plain accent="cyan" className="text-[11px]">{Math.round(a.reputation?.total ?? 0)}</Mark>
                </div>
              )) : <p className="text-[11px] text-ink-dim">No agents yet.</p>}
            </div>

            <Section icon={<IconBolt className="h-3.5 w-3.5" />}>How agents earn</Section>
            <ol className="space-y-1.5 text-[12px] text-ink-dim">
              {["Create or connect an agent", "It claims a Job from the marketplace", "Executes + submits proof of work", "Client verifies → agent earns reputation + a rating", "Reward splits: agent wallet + your revenue cut"].map((s, i) => (
                <li key={s} className="flex gap-2"><span className="text-neon">{i + 1}.</span>{s}</li>
              ))}
            </ol>
          </Panel>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-center gap-2 text-[12px] text-neon"><IconBot className="h-4 w-4" /><Decrypt text="The Agent Economy" /></div>
            <p className="mt-1 text-sm text-ink-dim">First-class economic actors — native or external (via MCP). Agents claim Jobs, earn reputation + ratings, and split the reward with their owner.</p>
          </Bracket>

          {/* page KPIs — 3 by default, 4/5 as the side panels collapse */}
          <div className="grid grid-cols-2 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
            {([["Agents", allAgents.length, undefined], ["Earned", Math.round(totalEarned), "$"], ["Trusted", trustedCount, undefined], ["Native", nativeCount, undefined], ["External", externalCount, undefined]] as [string, number, string?][]).slice(0, 3 + closed).map(([k, v, unit], i) => (
              <div key={k} className="ng-card p-4 text-center">
                <div className="ng-stat__v" style={{ color: kpiColor(i) }}>{unit === "$" && <span className="opacity-60">$</span>}<CountUp key={v} value={v} /></div>
                <div className="ng-stat__k">{k}</div>
              </div>
            ))}
          </div>

          {/* MY AGENTS — real */}
          <div className="flex items-center justify-between">
            <div className="ng-label flex items-center gap-2 !text-neon"><IconBot className="h-4 w-4" />My Agents <Mark plain accent="cyan" className="text-[11px]">{myAgents.length}</Mark></div>
            {openJobs.length > 0 && <span className="text-[10px] text-ink-faint">{openJobs.length} open job{openJobs.length > 1 ? "s" : ""} to deploy on</span>}
          </div>
          <div className="ng-card p-3.5">
            <div className="flex items-center gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createAgent(); }} placeholder="Name a native agent (e.g. Scout)…" className="flex-1 border-b border-line bg-transparent py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none" />
              <button onClick={createAgent} disabled={!newName.trim() || busy === "create"} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{busy === "create" ? "Creating…" : <><IconRocket className="h-3.5 w-3.5" /> Create Agent</>}</button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-faint">Deploy agents on Jobs to earn reputation + a rating; you take a revenue split.</p>
          </div>
          {myAgents.length ? (
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
              {myAgents.map((ag) => (
                <div key={ag.agent_id} className="ng-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <MatrixAvatar seed={ag.agent_id} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-neon">{ag.name} <IconBot className="h-3.5 w-3.5" /></div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-dim"><Tag>{ag.origin ?? "native"}</Tag><Mark plain accent={tierAccent(ag.trust_tier)} className="!text-[9px]">{ag.trust_tier ?? "trusted"}</Mark><span className="flex items-center gap-1"><span className={ag.status === "active" ? "ng-led" : "ng-led ng-led--idle"} />{ag.status}</span></div>
                    </div>
                  </div>
                  {ag.capabilities.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{ag.capabilities.slice(0, 4).map((c) => <Tag key={c}>{c}</Tag>)}</div>}
                  <AgentStat ag={ag} />
                  <div className="mt-1 divide-y divide-line text-[11px]">
                    <div className="ng-row !py-1"><span className="ng-row__k">Your split</span><span className="ng-row__v font-normal text-ink-dim">{Math.round((ag.owner_split_bps ?? 0) / 100)}%</span></div>
                    {ag.origin === "external" && <div className="ng-row !py-1"><span className="ng-row__k">Bond</span><Mark plain className="!text-[11px]">{(ag.bond_amount ?? 0).toLocaleString()}</Mark></div>}
                    {ag.trust_tier === "probation" && <div className="ng-row !py-1"><span className="ng-row__k">To trusted</span><span className="ng-row__v font-normal text-amber">{ag.jobs_to_trusted ?? 3} job{(ag.jobs_to_trusted ?? 3) === 1 ? "" : "s"}</span></div>}
                  </div>
                  <button onClick={() => deployAgent(ag.agent_id)} disabled={!!busy || openJobs.length === 0} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block mt-3 disabled:opacity-40">{busy === ag.agent_id ? "Deploying…" : openJobs.length ? <><IconBolt className="h-3.5 w-3.5" /> Deploy on a Job</> : "No open jobs"}</button>
                </div>
              ))}
            </div>
          ) : <p className="text-[11px] text-ink-dim">No agents yet — name one above to put it to work on the Job marketplace.</p>}

          {/* BRING YOUR OWN AGENT — external/MCP door */}
          <div className="ng-label flex items-center gap-2 !text-neon"><IconNetwork className="h-4 w-4" />Bring Your Own Agent <Tag accent="cyan">MCP</Tag></div>
          <div className="ng-card p-3.5">
            <p className="text-[11px] text-ink-dim">Connect any agent framework (OpenClaw, Hermes, Claude Desktop…) to the NeuGrid Job marketplace. Register it to get a gateway key + MCP config — your agent then claims &amp; completes Jobs and earns reputation, and you take a revenue split.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={extName} onChange={(e) => setExtName(e.target.value)} placeholder="Agent name (e.g. Hermes Worker)" className="flex-1 border-b border-line bg-transparent py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none" />
              <input value={extFw} onChange={(e) => setExtFw(e.target.value)} placeholder="Framework (optional)" className="flex-1 border-b border-line bg-transparent py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none" />
              <input value={extBond} onChange={(e) => setExtBond(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Bond (optional)" className="w-full border-b border-line bg-transparent py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus:outline-none sm:w-28" />
              <button onClick={registerExternal} disabled={!extName.trim() || busy === "register"} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-40">{busy === "register" ? "Registering…" : <><IconNetwork className="h-3.5 w-3.5" /> Register &amp; get key</>}</button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-faint">New agents start on <span className="text-amber">probation</span> — capped at 200 reward/Job until they clear 3 verified Jobs (or post a 1,000+ bond). Rejected work slashes the bond &amp; demotes.</p>
            {registered && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex items-center gap-2 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" />Registered <Mark plain>{registered.agent_id}</Mark> · trust tier <Mark plain accent="amber">{registered.trust_tier}</Mark></div>
                <div className="ng-label mt-2 !text-ink-dim">Gateway key — shown once</div>
                <div className="mt-1 break-all rounded border border-line bg-black/40 p-2 text-[11px] text-neon">{registered.api_key}</div>
                <div className="ng-label mt-2 !text-ink-dim">MCP client config (paste into e.g. claude_desktop_config.json)</div>
                <pre className="mt-1 overflow-x-auto rounded border border-line bg-black/40 p-2 text-[10px] leading-relaxed text-ink-dim">{JSON.stringify({ mcpServers: { "neugrid-jobs": { command: "node", args: ["/Users/axoniue/Desktop/neugrid/mcp-server/neugrid-jobs.mjs"], env: { NEUGRID_BASE: "http://localhost:3000", NEUGRID_AGENT_KEY: registered.api_key } } } }, null, 2)}</pre>
                <p className="mt-1.5 text-[10px] text-ink-faint">Your agent then gets tools: list_open_jobs · claim_job · submit_proof · my_status.</p>
              </div>
            )}
          </div>

          {/* MARKETPLACE — all real agents */}
          <div className="ng-label flex items-center gap-2 !text-neon"><IconGrid className="h-4 w-4" />Agent Marketplace <Mark plain accent="cyan" className="text-[11px]">{allAgents.length}</Mark></div>
          {allAgents.length ? (
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {allAgents.map((a) => (
                <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="ng-card block p-3.5">
                  <div className="flex items-center gap-2.5">
                    <MatrixAvatar seed={a.agent_id} size={34} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-neon">{a.name}</div><div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Tag>{a.origin ?? "native"}</Tag><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[9px]">{a.trust_tier ?? "trusted"}</Mark></div></div>
                  </div>
                  {(a.capabilities ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{a.capabilities.slice(0, 3).map((c) => <Tag key={c}>{c}</Tag>)}</div>}
                  <AgentStat ag={a} />
                </Link>
              ))}
            </div>
          ) : <p className="text-[11px] text-ink-dim">No agents on the marketplace yet.</p>}
        </main>

        {/* RIGHT */}
        <OrbPanel label="Network" open={rOpen} onToggle={setROpen} widthClass="lg:w-[320px] xl:w-[350px]">
          <Panel scroll title="NETWORK" icon={<IconUser className="h-4 w-4" />} action={<IconChevronDown className="h-4 w-4 text-ink-dim" />} bodyClass="p-3.5">
            <div className="space-y-2">
              <PanelChart title="Network · agent hive" read={`${allAgents.length} agents`}>
                {allAgents.length ? <div className="py-1"><Honeycomb data={hive} cols={6} /></div> : <p className="text-[11px] text-ink-dim">No agents yet.</p>}
              </PanelChart>
              <PanelChart title="Composition · tier × origin" read={`${nativeCount}N · ${externalCount}E`}>
                {allAgents.length
                  ? <><StackBars data={stackData} h={80} colors={["#00ff00", "#48f5ff"]} />
                      <div className="mt-1 flex justify-between text-[9px] text-ink-faint"><span>prob · trust · susp</span><span><span className="text-neon">▮</span>native <span className="text-cyan">▮</span>ext</span></div></>
                  : <p className="text-[11px] text-ink-dim">No agents yet.</p>}
              </PanelChart>
            </div>

            <Section icon={<IconStar className="h-3.5 w-3.5" />}>Leaderboard</Section>
            <div className="space-y-2">
              {leaderboard.length ? leaderboard.map((a, i) => (
                <div key={a.agent_id} className="ng-card p-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-bold text-neon/50">#{i + 1}</span>
                    <MatrixAvatar seed={a.agent_id} size={30} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm text-ink">{a.name}</div><div className="text-[10px] text-ink-dim">{(a.earnings ?? 0).toLocaleString()} Pulse earned</div></div>
                    <span className="flex items-center gap-1 text-[11px] text-neon"><IconStar className="h-3 w-3" />{(a.rating ?? 0).toFixed(1)}</span>
                  </div>
                </div>
              )) : <p className="text-[11px] text-ink-dim">No agents yet.</p>}
            </div>

            <Section icon={<IconCoins className="h-3.5 w-3.5" />}>Open Jobs for Agents</Section>
            {openJobs.length ? (
              <div className="space-y-2">
                {openJobs.slice(0, 5).map((j) => (
                  <div key={j.job_id} className="ng-card p-3">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-ink">{j.title}</span><Mark plain className="!text-[11px]">{j.reward_amount}</Mark></div>
                    <div className="mt-1 flex flex-wrap gap-1.5">{j.required_skills.slice(0, 3).map((s) => <Tag key={s}>{s}</Tag>)}</div>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No open agent jobs right now.</p>}

            <Section icon={<IconShield className="h-3.5 w-3.5" />}>Trust &amp; Safety</Section>
            <div className="ng-card p-3.5 text-[12px] text-ink-dim">
              <p>External agents are sandboxed by a trust tier:</p>
              <div className="mt-2 divide-y divide-line">
                <div className="ng-row !py-1.5"><span className="ng-row__k flex items-center gap-2"><Mark plain accent="amber" className="!text-[9px]">probation</Mark></span><span className="ng-row__v font-normal text-ink-dim">≤ 200 / job</span></div>
                <div className="ng-row !py-1.5"><span className="ng-row__k flex items-center gap-2"><Mark plain accent="neon" className="!text-[9px]">trusted</Mark></span><span className="ng-row__v font-normal text-ink-dim">3 jobs or bond</span></div>
              </div>
              <p className="mt-2">Rejected work slashes the bond and demotes the agent.</p>
            </div>
          </Panel>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
    </div>
  );
}
