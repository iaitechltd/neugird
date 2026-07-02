"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuGridDock from "@/components/app/NeuGridDock";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import {
  Mark, Tag, Bracket, ProgressBar,
  IconArrowRight, IconNetwork, IconUser, IconBot, IconShield, IconBolt,
  IconActivity, IconStar, IconGrid, IconCoins, IconLock, IconPlus,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import type { Agent, ContributorSplit, Grid, Job, SubGrid, SubGridAccess, UserProfile } from "@/lib/types";

type SplitRow = ContributorSplit & { pct: number; name: string; beneficiary_name?: string };
type View = {
  subgrid: SubGrid; grid: Grid | null; members: UserProfile[]; agents: Agent[]; jobs: Job[];
  splits: SplitRow[];
  access: { access: SubGridAccess; min_reputation: number; min_grid: number };
  invite_candidates: { id: string; username: string }[];
  viewer: { id: string; is_member: boolean; is_admin: boolean; can_join: { ok: boolean; reason?: string } } | null;
};

const tierAccent = (t?: string): "neon" | "amber" | "danger" => (t === "trusted" ? "neon" : t === "suspended" ? "danger" : "amber");
const ACCESS_META: Record<SubGridAccess, { label: string; icon: boolean }> = { open: { label: "Open", icon: false }, invite: { label: "Invite only", icon: true }, reputation: { label: "Reputation-gated", icon: true }, token: { label: "GRID-gated", icon: true } };
function accessLabel(a: View["access"]): string {
  if (a.access === "reputation") return `≥ ${a.min_reputation.toLocaleString()} rep`;
  if (a.access === "token") return `Hold ≥ ${a.min_grid.toLocaleString()} GRID`;
  return ACCESS_META[a.access].label;
}
function joinBlockText(reason: string | undefined, a: View["access"]): string {
  switch (reason) {
    case "invite_only": return "Invite only";
    case "need_reputation": return `Need ${a.min_reputation.toLocaleString()} rep`;
    case "need_grid": return `Hold ${a.min_grid.toLocaleString()} GRID`;
    case "join_grid_first": return "Join the Grid first";
    default: return "Can't join";
  }
}

function Sec({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="ng-label flex items-center gap-2 !text-neon"><span className="text-neon">{icon}</span>{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function SubgridDetail() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const closed = (lOpen ? 0 : 1) + (rOpen ? 0 : 1);
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2400); };

  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // admin editors
  const [editAccess, setEditAccess] = useState(false);
  const [accessForm, setAccessForm] = useState<{ access: SubGridAccess; min_reputation: number; min_grid: number }>({ access: "open", min_reputation: 0, min_grid: 0 });
  const [editSplits, setEditSplits] = useState(false);
  const [draftSplits, setDraftSplits] = useState<Record<string, number>>({});
  const [inviteId, setInviteId] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/subgrids/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { setView(d?.subgrid ? d : null); setLoaded(true); }).catch(() => setLoaded(true));
  }, [id]);

  function applyView(r: View | null) { if (r?.subgrid) setView(r); }
  async function call(path: string, opts: RequestInit, okMsg?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/subgrids/${id}${path}`, opts);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "failed");
      applyView(j);
      if (okMsg) notify(okMsg);
      return j;
    } catch (e) { notify(e instanceof Error ? e.message.replace(/_/g, " ") : "Something went wrong"); }
    finally { setBusy(false); }
  }

  const join = () => call("/join", { method: "POST" }, "Joined the team");
  const leave = () => call("/join", { method: "DELETE" }, "Left the team");
  const addMember = (uid: string) => call("/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: uid }) }, "Member added").then(() => setInviteId(""));
  const saveAccess = () => call("/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(accessForm) }, "Access policy saved").then(() => setEditAccess(false));

  function openSplitsEditor() {
    if (!view) return;
    const init: Record<string, number> = {};
    [...view.members.map((m) => m.id), ...view.agents.map((a) => a.agent_id)].forEach((pid) => { init[pid] = view.splits.find((s) => s.party_id === pid)?.pct ?? 0; });
    setDraftSplits(init); setEditSplits(true);
  }
  async function saveSplits() {
    if (!view) return;
    const total = Object.values(draftSplits).reduce((n, p) => n + (Number(p) || 0), 0);
    if (Math.round(total) !== 100) { notify("Shares must total 100%"); return; }
    const splits: ContributorSplit[] = Object.entries(draftSplits)
      .filter(([, p]) => Number(p) > 0)
      .map(([pid, p]) => {
        const agent = view.agents.find((a) => a.agent_id === pid);
        return { party_id: pid, party_type: agent ? "agent" : "user", beneficiary_id: agent?.owner_id, basis_points: Math.round(Number(p) * 100), role: undefined } as ContributorSplit;
      });
    await call("/splits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ splits }) }, "Ownership split saved");
    setEditSplits(false);
  }

  if (!loaded || !view) {
    return (
      <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
        <NeuHeader />
        <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/grids/explore" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3 w-3 rotate-180" /> Back to Grids</Link></div>
        <div className="grid flex-1 place-items-center px-4 py-16 text-center">
          {!loaded ? <div className="text-sm text-ink-dim"><IconNetwork className="mx-auto mb-3 h-9 w-9 animate-pulse text-neon/60" />Loading SubGrid…</div> : (
            <div><IconNetwork className="mx-auto h-10 w-10 text-neon/50" /><div className="mt-3 text-sm text-ink">SubGrid not found.</div><Link href="/grids/explore" className="ng-btn ng-btn-primary ng-btn--sm mt-4">Browse Grids</Link></div>
          )}
        </div>
        <NeuGridDock />
      </div>
    );
  }

  const { subgrid: s, grid, members, agents, jobs, splits, access, invite_candidates, viewer } = view;
  const admins = new Set(s.admins);
  const isMember = !!viewer?.is_member;
  const isAdmin = !!viewer?.is_admin;
  const canJoin = viewer?.can_join;
  const stats: [string, number][] = [["Members", members.length], ["Agents", agents.length], ["Jobs", jobs.length], ["Pulse", s.pulse_score]];
  const splitTotal = Object.values(draftSplits).reduce((n, p) => n + (Number(p) || 0), 0);

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} onSearch={() => notify("Search")} onBell={() => notify("Notifications")} />
      <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href={grid ? `/grid/${grid.slug}` : "/grids/explore"} className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3 w-3 rotate-180" /> Back to {grid?.name ?? "Grids"}</Link></div>

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="SubGrid" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-panel p-4">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded text-neon" style={{ background: "radial-gradient(circle, rgba(0,255,0,0.18), #021202)" }}><IconNetwork className="h-5 w-5" /></span><div className="min-w-0"><div className="truncate text-sm font-bold text-ink">{s.name}</div><Tag className="mt-0.5">Team</Tag></div></div>
            {s.purpose && <p className="mt-2 text-[11px] italic text-ink-dim">&ldquo;{s.purpose}&rdquo;</p>}
            {grid && <div className="mt-2 text-[10px] text-ink-dim">Parent Grid: <Link href={`/grid/${grid.slug}`} className="text-neon transition hover:text-glow">{grid.name}</Link></div>}

            {/* access + join/leave */}
            <div className="mt-3 flex items-center justify-between rounded border border-line bg-black/20 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 text-[10px] text-ink-dim">{ACCESS_META[access.access].icon ? <IconLock className="h-3 w-3 text-amber" /> : <IconNetwork className="h-3 w-3 text-neon" />}{accessLabel(access)}</span>
            </div>
            {isMember ? (
              isAdmin && s.admins.length <= 1 ? (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded border border-neon/25 bg-neon/[0.06] px-3 py-2 text-[11px] text-neon"><IconShield className="h-3.5 w-3.5" /> You lead this team</div>
              ) : (
                <button disabled={busy} onClick={leave} className="ng-btn ng-btn--block ng-btn--sm mt-2 disabled:opacity-50">{busy ? "…" : "Leave Team"}</button>
              )
            ) : canJoin?.ok ? (
              <button disabled={busy} onClick={join} className="ng-btn ng-btn-primary ng-btn--block ng-btn--sm mt-2 disabled:opacity-50"><IconPlus className="h-3.5 w-3.5" />{busy ? "Joining…" : "Join Team"}</button>
            ) : (
              <div className="mt-2 flex items-center justify-center gap-1.5 rounded border border-line px-3 py-2 text-[10px] text-ink-faint"><IconLock className="h-3 w-3" />{joinBlockText(canJoin?.reason, access)}</div>
            )}
          </div>

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 !text-ink-dim">Overview</div>
            <div className="grid grid-cols-2 gap-2">{stats.map(([k, v]) => <div key={k} className="ng-card p-3 text-center"><div className="ng-stat__v">{v.toLocaleString()}</div><div className="ng-stat__k">{k}</div></div>)}</div>
          </div>

          {/* admin: manage access + invite */}
          {isAdmin && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconShield className="h-3.5 w-3.5" /></span>Manage Team</div>
              {!editAccess ? (
                <button onClick={() => { setAccessForm(access); setEditAccess(true); }} className="ng-btn ng-btn--sm ng-btn--block">Access policy · {ACCESS_META[access.access].label}</button>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(["open", "invite", "reputation", "token"] as SubGridAccess[]).map((a) => (
                      <button key={a} onClick={() => setAccessForm((f) => ({ ...f, access: a }))} className={`rounded px-2 py-1 text-[10px] transition ${accessForm.access === a ? "bg-neon/15 text-neon" : "bg-line/40 text-ink-dim hover:text-ink"}`}>{ACCESS_META[a].label}</button>
                    ))}
                  </div>
                  {accessForm.access === "reputation" && <input value={accessForm.min_reputation || ""} onChange={(e) => setAccessForm((f) => ({ ...f, min_reputation: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} inputMode="numeric" placeholder="Min reputation" className="ng-input !py-1.5 text-[12px]" />}
                  {accessForm.access === "token" && <input value={accessForm.min_grid || ""} onChange={(e) => setAccessForm((f) => ({ ...f, min_grid: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} inputMode="numeric" placeholder="Min GRID to hold" className="ng-input !py-1.5 text-[12px]" />}
                  <div className="flex gap-1.5"><button disabled={busy} onClick={saveAccess} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block disabled:opacity-50">Save</button><button onClick={() => setEditAccess(false)} className="ng-btn ng-btn--sm ng-btn--block">Cancel</button></div>
                </div>
              )}
              {invite_candidates.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <select value={inviteId} onChange={(e) => setInviteId(e.target.value)} className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]">
                    <option value="">Add a member…</option>
                    {invite_candidates.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
                  </select>
                  <button disabled={busy || !inviteId} onClick={() => inviteId && addMember(inviteId)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Add</button>
                </div>
              )}
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconShield className="h-3.5 w-3.5" /></span>Admins</div>
            {members.filter((m) => admins.has(m.id)).map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 py-1.5"><MatrixAvatar seed={m.username} size={28} /><span className="text-sm text-ink">{m.username}</span></div>
            ))}
          </div>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-5 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="ng-title text-3xl font-bold text-neon text-glow"><Decrypt text={s.name} /></div>
            <p className="text-sm text-ink-dim">{s.purpose || "A team inside the Grid."}</p>
            {grid && <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-dim"><span>Parent: <Link href={`/grid/${grid.slug}`} className="text-ink transition hover:text-neon">{grid.name}</Link></span><span>Members: <span className="text-ink">{members.length}</span></span><span>Access: <Mark plain accent={access.access === "open" ? "neon" : "amber"} className="!text-[10px]">{accessLabel(access)}</Mark></span><span>Pulse: <Mark plain>{s.pulse_score.toLocaleString()}</Mark></span></div>}
          </Bracket>

          <Sec icon={<IconUser className="h-3.5 w-3.5" />} title={`Team · ${members.length + agents.length}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 3 + closed } as React.CSSProperties}>
              {members.map((m) => (
                <div key={m.id} className="ng-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <MatrixAvatar seed={m.username} size={36} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-ink">{m.username}{viewer?.id === m.id && <span className="ml-1 text-[9px] text-neon">you</span>}</div><div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Tag accent="amber"><IconShield className="h-3 w-3" />Human</Tag>{admins.has(m.id) && <Mark plain className="!text-[9px]">Admin</Mark>}</div></div>
                  </div>
                  {m.skills && m.skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{m.skills.slice(0, 3).map((sk) => <Tag key={sk}>{sk}</Tag>)}</div>}
                  <div className="mt-2 ng-row !py-1 text-[11px]"><span className="ng-row__k">Reputation</span><Mark plain className="!text-[11px]">{Math.round(m.reputation?.total ?? m.pulse_score ?? 0)}</Mark></div>
                </div>
              ))}
              {agents.map((a) => (
                <div key={a.agent_id} className="ng-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <MatrixAvatar seed={a.agent_id} size={36} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-neon">{a.name}</div><div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Tag><IconBot className="h-3 w-3" />Agent</Tag><Mark plain accent={tierAccent(a.trust_tier)} className="!text-[9px]">{a.trust_tier ?? "trusted"}</Mark></div></div>
                  </div>
                  <div className="mt-2 ng-row !py-1 text-[11px]"><span className="ng-row__k">Earnings</span><Mark plain className="!text-[11px]">{(a.earnings ?? 0).toLocaleString()} Pulse</Mark></div>
                </div>
              ))}
            </div>
          </Sec>

          <Sec icon={<IconActivity className="h-3.5 w-3.5" />} title={`Tasks · ${jobs.length}`} action={<Link href="/jobs" className="text-[11px] text-ink-dim transition hover:text-neon">Job board</Link>}>
            {jobs.length ? (
              <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": 2 + closed } as React.CSSProperties}>
                {jobs.map((j) => (
                  <Link key={j.job_id} href="/jobs" className="ng-card p-3.5">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-ink">{j.title}</span><Mark plain accent={j.status === "paid" ? "neon" : "amber"} className="!text-[9px]">{j.status}</Mark></div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-ink-dim">{j.description}</p>
                    <div className="mt-2 flex items-center justify-between text-[10px]"><div className="flex flex-wrap gap-1.5">{j.required_skills.slice(0, 3).map((sk) => <Tag key={sk}>{sk}</Tag>)}</div><Mark plain className="!text-[11px]">{j.reward_amount}</Mark></div>
                  </Link>
                ))}
              </div>
            ) : <p className="text-[11px] text-ink-dim">No tasks yet — post one to the team from the <Link href="/jobs" className="text-neon">Job board</Link>.</p>}
          </Sec>
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          {/* ownership splits — the on-chain agreement of who owns the output */}
          <div className="ng-card p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="ng-label flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconCoins className="h-3.5 w-3.5" /></span>Ownership</div>
              {isAdmin && !editSplits && <button onClick={openSplitsEditor} className="text-[10px] text-ink-dim transition hover:text-neon">{splits.length ? "Edit" : "Set"}</button>}
            </div>

            {editSplits ? (
              <div className="space-y-2">
                <p className="text-[10px] text-ink-faint">Assign each contributor a share — must total 100%.</p>
                {[...members.map((m) => ({ id: m.id, name: m.username, agent: false })), ...agents.map((a) => ({ id: a.agent_id, name: a.name, agent: true }))].map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{p.agent ? <IconBot className="mr-1 inline h-3 w-3 text-neon" /> : null}{p.name}</span>
                    <input value={draftSplits[p.id] || ""} onChange={(e) => setDraftSplits((d) => ({ ...d, [p.id]: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 }))} inputMode="numeric" placeholder="0" className="ng-input w-14 !py-1 text-right text-[12px]" />
                    <span className="text-[10px] text-ink-faint">%</span>
                  </div>
                ))}
                <div className={`flex items-center justify-between text-[11px] ${Math.round(splitTotal) === 100 ? "text-neon" : "text-amber"}`}><span>Total</span><span className="tnum">{splitTotal}%</span></div>
                <div className="flex gap-1.5"><button disabled={busy || Math.round(splitTotal) !== 100} onClick={saveSplits} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block disabled:opacity-50">Save split</button><button onClick={() => setEditSplits(false)} className="ng-btn ng-btn--sm ng-btn--block">Cancel</button></div>
              </div>
            ) : splits.length === 0 ? (
              <p className="text-[11px] text-ink-dim">No ownership agreement yet{isAdmin ? " — set who owns what % of the team's output." : "."}</p>
            ) : (
              <div className="space-y-2.5">
                {splits.map((sp) => (
                  <div key={sp.party_id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-ink">{sp.party_type === "agent" ? <IconBot className="h-3 w-3 text-neon" /> : <IconUser className="h-3 w-3 text-ink-dim" />}{sp.name}{viewer?.id === sp.party_id && <span className="text-[9px] text-neon">you</span>}</span>
                      <Mark plain accent="neon" className="!text-[11px] tnum">{sp.pct}%</Mark>
                    </div>
                    <div className="mt-1"><ProgressBar percent={sp.pct} /></div>
                    {sp.party_type === "agent" && sp.beneficiary_name && <div className="mt-0.5 text-[9px] text-ink-faint">→ paid to {sp.beneficiary_name}</div>}
                  </div>
                ))}
                <p className="border-t border-line pt-2 text-[9px] leading-relaxed text-ink-faint">On-chain agreement — revenue / tokens from this team&apos;s output split by these shares.</p>
              </div>
            )}
          </div>

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBolt className="h-3.5 w-3.5" /></span>Dashboard</div>
            <div className="divide-y divide-line text-[12px]">
              {stats.map(([k, v]) => <div key={k} className="ng-row !py-2"><span className="ng-row__k">{k}</span><span className="ng-row__v !text-neon">{v.toLocaleString()}</span></div>)}
            </div>
          </div>

          {grid && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconGrid className="h-3.5 w-3.5" /></span>Parent Grid</div>
              <Link href={`/grid/${grid.slug}`} className="block transition hover:text-neon"><div className="text-sm text-ink">{grid.name}</div><div className="text-[10px] text-ink-dim">{grid.category} · {grid.member_count} members</div></Link>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconStar className="h-3.5 w-3.5" /></span>Composition</div>
            <div className="divide-y divide-line text-[12px]">
              <div className="ng-row !py-2"><span className="ng-row__k">Humans</span><Mark plain>{members.length}</Mark></div>
              <div className="ng-row !py-2"><span className="ng-row__k">Agents</span><Mark plain>{agents.length}</Mark></div>
              <div className="ng-row !py-2"><span className="ng-row__k">Admins</span><Mark plain>{s.admins.length}</Mark></div>
            </div>
          </div>
        </OrbPanel>
      </div>

      {toast && <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon shadow-[0_0_20px_rgba(0,255,0,0.3)]">{toast}</div>}
      <NeuGridDock />
    </div>
  );
}
