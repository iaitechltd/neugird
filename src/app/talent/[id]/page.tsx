"use client";

/**
 * Talent profile — one person's verifiable track record.
 * 3-panel: left = identity + reputation + skills + hire, center = the track
 * record (proof-of-builds, delivered work, proposals, agents), right = the
 * reputation breakdown + standing. Reads /api/talent/[id]. The anti-VC weapon:
 * everything here is earned from verified work, not claimed on a résumé.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import NeuGridDock from "@/components/app/NeuGridDock";
import OrbPanel from "@/components/app/OrbPanel";
import {
  Mark, Tag, Bracket, ProgressBar, DataRow,
  IconUser, IconStar, IconShield, IconCode, IconBriefcase, IconCoins, IconBot, IconArrowRight, IconCheck, IconActivity, IconLayers, IconRocket, IconMessage,
} from "@/components/app/ui";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";

type Profile = { id: string; username: string; wallet: string; bio: string; skills: string[]; pulse: number; reputation: number; by_dimension: Record<string, number>; grids: number; created_at: string; earned_usdc?: number; follows?: { followers: number; following: number }; is_following?: boolean };
type JobRow = { job_id: string; title: string; reward: number; status: string; skills: string[] };
type BuildRow = { build_id: string; title: string; kind: string; proof?: string; stack: string[]; status: string };
type PropRow = { proposal_id: string; title: string; status: string; ask: number; category: string };
type AgentRow = { agent_id: string; name: string; rating: number; capabilities: string[] };
type Cred = { attestation_id: string; schema: string; title: string; fields: Record<string, string | number>; proof_ref?: string; status: string; subject_wallet?: string };
type RepEvent = { action: string; weight: number; reason: string; at: string };
type View = {
  profile: Profile;
  track_record: { jobs_done: number; jobs: JobRow[]; builds: BuildRow[]; proposals: PropRow[]; agents: AgentRow[] };
  credentials: Cred[];
  rep_events?: RepEvent[];
  is_me: boolean;
};

const titlecase = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const CRED_ICON: Record<string, (p: { className?: string }) => React.JSX.Element> = { proof_of_build: IconCode, work_delivered: IconBriefcase, milestone_shipped: IconLayers, project_launched: IconRocket, agent_trusted: IconBot };
const CRED_NAME: Record<string, string> = { proof_of_build: "Proof of Build", work_delivered: "Work Delivered", milestone_shipped: "Milestone Shipped", project_launched: "Project Launched", agent_trusted: "Agent Trusted" };
const J_ACCENT: Record<string, "neon" | "cyan" | "amber"> = { paid: "neon", verified: "neon", submitted: "cyan", claimed: "cyan", open: "amber" };

export default function TalentProfile() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  const [view, setView] = useState<View | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  async function toggleFollow() {
    if (followBusy || !view) return;
    setFollowBusy(true);
    try {
      const r = await fetch(`/api/users/${view.profile.id}/follow`, { method: "POST" });
      const j = await r.json();
      if (r.ok) { setFollowing(!!j.following); setFollowers(j.followers ?? null); }
    } catch { /* leave state as-is */ }
    setFollowBusy(false);
  }

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/talent/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) { setView(d?.profile ? d : null); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [id]);

  const backBar = (
    <div className="shrink-0 border-b border-neon/10 px-4 py-2 sm:px-6"><Link href="/talent" className="inline-flex items-center gap-2 text-xs text-ink-dim transition hover:text-neon"><IconArrowRight className="h-3.5 w-3.5 rotate-180" />Back to Talent</Link></div>
  );

  if (!loaded || !view) {
    return (
      <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
        <NeuHeader />
        {backBar}
        <div className="grid flex-1 place-items-center px-4 py-16 text-center">
          {!loaded ? (
            <div className="text-sm text-ink-dim"><IconUser className="mx-auto mb-3 h-9 w-9 animate-pulse text-neon/60" />Loading profile…</div>
          ) : (
            <div>
              <IconUser className="mx-auto h-10 w-10 text-neon/50" />
              <div className="mt-3 text-sm text-ink">Profile not found.</div>
              <Link href="/talent" className="ng-btn ng-btn-primary ng-btn--sm mt-4">Browse Talent</Link>
            </div>
          )}
        </div>
        <NeuGridDock />
      </div>
    );
  }

  const p = view.profile;
  const tr = view.track_record;
  const dims = Object.entries(p.by_dimension).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const dimMax = Math.max(1, ...dims.map(([, v]) => v));
  const shipped = tr.builds.length + tr.proposals.length + tr.agents.length + tr.jobs_done;

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="TalenX" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />
      {backBar}

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT */}
        <OrbPanel side="left" label="Profile" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-panel p-4">
            <div className="flex items-center gap-3">
              <MatrixAvatar seed={p.username} size={48} shape="square" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-neon">{p.username}{view.is_me && <span className="ml-1.5 text-[10px] text-ink-faint">(you)</span>}</div>
                <div className="truncate text-[10px] text-ink-faint">{p.wallet || `@${p.username}`}</div>
              </div>
            </div>
            {p.bio && <p className="mt-2.5 text-[11px] leading-relaxed text-ink-dim">{p.bio}</p>}
            <div className="mt-3 divide-y divide-line">
              <DataRow k="Reputation" v={<Mark plain>{p.reputation}</Mark>} accent="neon" />
              <DataRow k="Earned" v={<Mark plain accent="cyan">${Math.round(p.earned_usdc ?? 0).toLocaleString()}</Mark>} />
              <DataRow k="Jobs delivered" v={tr.jobs_done} />
              <DataRow k="Followers" v={<Mark plain>{followers ?? p.follows?.followers ?? 0}</Mark>} />
              <DataRow k="Grids" v={p.grids} />
            </div>
            {!view.is_me && (
              <button onClick={toggleFollow} disabled={followBusy} className={`ng-btn ng-btn--block ng-btn--sm mt-3 disabled:opacity-40 ${(following ?? p.is_following) ? "" : "ng-btn-primary"}`}>
                <IconUser className="h-3.5 w-3.5" /> {(following ?? p.is_following) ? "Following ✓" : "Follow"}
              </button>
            )}
          </div>

          {p.skills.length > 0 && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconCode className="h-4 w-4" /></span>Skills</div>
              <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <Tag key={s}>{s}</Tag>)}</div>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconBriefcase className="h-4 w-4" /></span>Hire</div>
            {view.is_me
              ? <p className="text-[11px] text-ink-dim">This is your public track record — everything here is earned from verified work.</p>
              : <p className="text-[11px] text-ink-dim">Message {p.username} to talk, pitch a deal, or hire — accepted hires become escrowed Jobs.</p>}
            {!view.is_me && <Link href={`/messages?to=${p.id}`} className="ng-btn ng-btn-primary ng-btn--block ng-btn--sm mt-3"><IconMessage className="h-3.5 w-3.5" /> Message {p.username}</Link>}
            <Link href="/jobs" className={`ng-btn ng-btn--block ng-btn--sm mt-2 ${view.is_me ? "ng-btn-primary" : ""}`}><IconBriefcase className="h-3.5 w-3.5" /> {view.is_me ? "Find work" : "Hire via Jobs"}</Link>
          </div>
        </OrbPanel>

        {/* CENTER */}
        <main className="@container order-1 space-y-6 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Bracket className="ng-panel p-5">
            <div className="flex items-start gap-4">
              <MatrixAvatar seed={p.username} size={56} shape="square" className="shrink-0" />
              <div className="min-w-0">
                <div className="ng-title text-3xl font-bold text-neon text-glow"><Decrypt text={p.username} /></div>
                <p className="mt-1 text-sm text-ink-dim">{p.bio || "Builder on NeuGrid."}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-dim">
              <span>Reputation: <span className="text-ink">{p.reputation}</span></span>
              <span>Wallet: <Mark plain>{p.wallet || "—"}</Mark></span>
              <span>Joined: <Mark plain>{new Date(p.created_at).toLocaleDateString()}</Mark></span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
              <Mark accent="neon"><IconShield className="h-3 w-3" />{shipped} verified contributions</Mark>
              {tr.builds.length > 0 && <Mark accent="cyan"><IconCode className="h-3 w-3" />{tr.builds.length} proof-of-build</Mark>}
            </div>
          </Bracket>

          {/* SOULBOUND CREDENTIALS — the on-chain-bound credential layer */}
          <section>
            <div className="ng-label mb-1 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconShield className="h-4 w-4" />Soulbound Credentials · {view.credentials.length}</div>
            <p className="mb-3 text-[11px] text-ink-faint">Earned achievements, ready to mint as Solana SAS attestations (Token-2022 soulbound) — non-transferable, cannot be faked or sold.</p>
            {view.credentials.length === 0 ? <p className="text-[11px] text-ink-faint">No credentials yet — ship a build, deliver a job, or raise on GenesisX.</p> : (
              <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
                {view.credentials.map((c) => {
                  const Ico = CRED_ICON[c.schema] ?? IconShield;
                  const meta = Object.values(c.fields).map((v) => String(v)).filter(Boolean).slice(0, 2).join(" · ");
                  return (
                    <div key={c.attestation_id} className="ng-card flex items-center gap-3 p-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-neon/10 text-neon"><Ico className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-ink">{c.title}</div>
                        <div className="truncate text-[10px] text-ink-faint">{CRED_NAME[c.schema] ?? c.schema}{meta ? ` · ${meta}` : ""}</div>
                      </div>
                      <Mark plain accent="neon" className="!text-[9px] shrink-0"><IconShield className="h-2.5 w-2.5" />soulbound</Mark>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[10px] text-ink-faint">Stage 1 — in-platform mirror. <Tag className="!text-[9px]">SAS mint pending</Tag></p>
          </section>

          {/* PROOF OF BUILD — the differentiator */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconShield className="h-4 w-4" />Proof of Build</div>
            {tr.builds.length === 0 ? <p className="text-[11px] text-ink-faint">No Echo builds witnessed yet.</p> : (
              <div className="grid grid-cols-1 gap-2.5 @2xl:grid-cols-2">
                {tr.builds.map((b) => (
                  <div key={b.build_id} className="ng-card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-ink">{b.title}</div><div className="text-[10px] text-ink-dim">{b.stack.join(" · ")}</div></div>
                      <Mark plain accent="cyan" className="!text-[9px] shrink-0">{b.kind}</Mark>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint"><span className="flex items-center gap-1 text-neon"><IconCheck className="h-3 w-3" />{b.proof}</span><span>{b.status}</span></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* DELIVERED WORK */}
          <section>
            <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconBriefcase className="h-4 w-4" />Delivered Work</div>
            {tr.jobs.length === 0 ? <p className="text-[11px] text-ink-faint">No jobs on record yet.</p> : (
              <div className="space-y-2">
                {tr.jobs.map((j) => (
                  <div key={j.job_id} className="ng-card flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-ink">{j.title}</div>
                      {j.skills.length > 0 && <div className="mt-0.5 truncate text-[10px] text-ink-dim">{j.skills.join(" · ")}</div>}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-bold text-neon tnum">{j.reward.toLocaleString()}</div>
                      <Mark plain accent={J_ACCENT[j.status] ?? "amber"} className="!text-[9px]">{j.status}</Mark>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* PROPOSALS + AGENTS */}
          <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconCoins className="h-4 w-4" />Raises</div>
              {tr.proposals.length === 0 ? <p className="text-[11px] text-ink-faint">No GenesisX proposals yet.</p> : (
                <div className="space-y-2">
                  {tr.proposals.map((pr) => (
                    <Link key={pr.proposal_id} href={`/genesis/${pr.proposal_id}`} className="ng-card flex items-center justify-between gap-3 p-3 transition hover:!border-neon/40">
                      <div className="min-w-0"><div className="truncate text-[12px] text-ink">{pr.title}</div><div className="text-[10px] text-ink-dim">{pr.category}</div></div>
                      <div className="shrink-0 text-right"><div className="text-[12px] text-neon tnum">{pr.ask.toLocaleString()}</div><Mark plain accent={pr.status === "funded" ? "neon" : "cyan"} className="!text-[9px]">{pr.status}</Mark></div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <section>
              <div className="ng-label mb-3 flex items-center gap-2 !text-base !tracking-normal !text-neon"><IconBot className="h-4 w-4" />Agents</div>
              {tr.agents.length === 0 ? <p className="text-[11px] text-ink-faint">No agents deployed yet.</p> : (
                <div className="space-y-2">
                  {tr.agents.map((a) => (
                    <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="ng-card flex items-center gap-2.5 p-3 transition hover:!border-neon/40">
                      <MatrixAvatar seed={a.name} size={24} />
                      <div className="min-w-0 flex-1"><div className="truncate text-[12px] text-ink">{a.name}</div><div className="truncate text-[10px] text-ink-dim">{a.capabilities.slice(0, 2).join(" · ") || "general"}</div></div>
                      <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neon"><IconStar className="h-3 w-3" />{a.rating.toFixed(1)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>

        {/* RIGHT */}
        <OrbPanel label="Signal" open={rOpen} onToggle={setROpen} widthClass="lg:w-[300px] xl:w-[320px]" className="space-y-3 lg:overflow-y-auto">
          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconActivity className="h-4 w-4" /></span>Reputation Breakdown</div>
            {dims.length === 0 ? <p className="text-[11px] text-ink-dim">No dimensional reputation yet.</p> : (
              <div className="space-y-2.5">
                {dims.map(([dim, val]) => (
                  <div key={dim}>
                    <div className="mb-1 flex items-center justify-between text-[11px]"><span className="text-ink-dim">{titlecase(dim)}</span><span className="text-neon tnum">{val}</span></div>
                    <ProgressBar percent={Math.round((val / dimMax) * 100)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* V6 — reputation is alive: recent gains AND fades, with reasons */}
          {(view.rep_events?.length ?? 0) > 0 && (
            <div className="ng-card p-3.5">
              <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconActivity className="h-4 w-4" /></span>Recent Movement</div>
              <div className="divide-y divide-line">
                {view.rep_events!.map((e, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] text-ink-dim">{e.reason}</div>
                      <div className="text-[9.5px] text-ink-faint">{new Date(e.at).toLocaleDateString()}</div>
                    </div>
                    <span className={`shrink-0 text-[11px] font-bold tnum ${e.weight < 0 ? "text-danger" : "text-neon"}`}>{e.weight < 0 ? "" : "+"}{e.weight}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Reputation grows on verified delivery and fades on rejection, ghosting, and inactivity.</p>
            </div>
          )}

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconLayers className="h-4 w-4" /></span>Standing</div>
            <div className="divide-y divide-line text-[12px]">
              {([["Total reputation", String(p.reputation)], ["Verified contributions", String(shipped)], ["Proof-of-builds", String(tr.builds.length)], ["Jobs delivered", String(tr.jobs_done)]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="ng-row !py-2"><span className="ng-row__k">{k}</span><span className="ng-row__v !text-neon">{v}</span></div>
              ))}
            </div>
          </div>

          <div className="ng-card p-3.5">
            <div className="ng-label mb-2 flex items-center gap-2 !text-ink-dim"><span className="text-neon"><IconShield className="h-4 w-4" /></span>Why this is trustworthy</div>
            <ul className="space-y-1.5 text-[11px] text-ink-dim">
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Earned from verified work, not claimed</li>
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Proof-of-build sealed by Echo</li>
              <li className="flex gap-2"><IconCheck className="mt-0.5 h-3 w-3 shrink-0 text-neon" />Cannot be faked or bought</li>
            </ul>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">Hire by track record, not résumé. <Tag className="!text-[9px]">anti-VC</Tag></p>
          </div>
        </OrbPanel>
      </div>

      <NeuGridDock />
    </div>
  );
}
