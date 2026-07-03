"use client";

/**
 * Per-Grid detail — the "living command center" for a Grid.
 * Real data from GET /api/grids/[slug] (summary + member directory + the Grid's
 * agents + live activity) plus its SubGrids and a per-Grid community CHAT.
 * 3-panel signature layout: info/launch (left) · overview + tabbed activity
 * (center) · community chat (right). Join/Leave, SubGrid create, token-launch flow.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import NeuHeader from "@/components/app/NeuHeader";
import OrbPanel from "@/components/app/OrbPanel";
import { Panel, Stat, DataRow, Mark, Tag, ProgressBar, IconActivity, IconNetwork, IconLayers, IconUser, IconBot, IconPlus, IconExternal, IconFlag, IconCheck, IconMessage, IconHeart, IconBriefcase, IconTarget, IconLock, IconCoins } from "@/components/app/ui";
import { Area } from "@/components/app/charts";
import { Decrypt } from "@/components/app/typefx";
import { MatrixAvatar } from "@/components/app/MatrixAvatar";
import type { GridSummary, SubGrid } from "@/lib/types";

type Me = { id: string; joined_grids: string[] } | null;
type Analytics = {
  kpis: { members: number; pulse: number; posts: number; messages: number; likes: number; campaigns: number; open_jobs: number; agents: number; subgrids: number };
  pulse_trend: number[]; member_trend: number[];
  pulse_by_source: { label: string; value: number }[];
  top_contributors: { id: string; username: string; pulse: number }[];
  agent_performance: { agent_id: string; name: string; earnings: number; rating: number; jobs: number }[];
  most_liked: { title: string; likes: number } | null;
};
type Member = { id: string; username: string; reputation: number; role: string; is_owner: boolean };
type GridAgent = { agent_id: string; name: string; trust_tier: string; earnings: number; rating: number; status: string };
type Activity = { campaigns: { campaign_id: string; title: string; status: string }[]; jobs: { job_id: string; title: string; status: string; reward_amount: number; required_skills: string[] }[] };
type ChatMsg = { message_id: string; user_id: string; username: string; reputation: number; role: string; text: string; likes: number; liked: boolean; ago: string };
type Tab = "feed" | "activity" | "members" | "subgrids" | "govern" | "analytics";
type Post = { post_id: string; author_id: string; username: string; role: string; title?: string; body: string; pinned: boolean; likes: number; liked: boolean; can_manage: boolean; can_pin: boolean; ago: string };
type Employer = { postings: number; paid: number; ghosted: number; rejected: number; in_flight: number; tier: "trusted_employer" | "reliable" | "ghost_risk" | "unrated"; recent: { title: string; outcome: string; reward: number; at?: string }[] };
type GProp = { proposal_id: string; kind: "feature_post" | "general"; title: string; summary: string; status: "open" | "passed" | "rejected"; for_weight: number; against_weight: number; voters: number; quorum_votes: number; for_pct: number; against_pct: number; total_weight: number; my_vote: { support: boolean; weight: number } | null; target_post_title?: string; executed?: boolean; execution_note?: string };

const ROLE_ACCENT: Record<string, "neon" | "amber" | "cyan" | undefined> = { founder: "neon", Founder: "neon", backer: "amber", holder: "cyan", Admin: "cyan" };

export default function GridDetailPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const router = useRouter();
  const [data, setData] = useState<GridSummary | null | "missing">(null);
  const [subgrids, setSubgrids] = useState<SubGrid[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [agents, setAgents] = useState<GridAgent[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);
  // grid-member governance
  const [gprops, setGprops] = useState<GProp[]>([]);
  const [govMember, setGovMember] = useState(false);
  const [govTick, setGovTick] = useState(0);
  const [govComposing, setGovComposing] = useState(false);
  const [govForm, setGovForm] = useState({ title: "", summary: "", kind: "general" as "general" | "feature_post", target_post_id: "" });
  const [govPosting, setGovPosting] = useState(false);
  const [launch, setLaunch] = useState<{ eligibility: { ok: boolean; reason?: string }; market: { market_id: string; stage: string } | null; audit: { audit_id: string; status: string; notes?: string } | null } | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sgPending, setSgPending] = useState(false);
  const [lOpen, setLOpen] = useState(true);
  const [rOpen, setROpen] = useState(true);
  // chat
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 2200); };

  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1); // handlers bump this → the effect reloads

  // Main loader — defined INSIDE the effect (React 19 purity). Re-runs on slug/refresh.
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    (async () => {
      const [s, m, sg, lc, po] = await Promise.allSettled([
        fetch(`/api/grids/${slug}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("404")))),
        fetch("/api/me").then((r) => r.json()),
        fetch(`/api/grids/${slug}/subgrids`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("404")))),
        fetch(`/api/grids/${slug}/launch`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("404")))),
        fetch(`/api/grids/${slug}/posts`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("404")))),
      ]);
      if (!alive) return;
      if (s.status === "fulfilled") {
        setData(s.value.summary as GridSummary);
        setMembers(s.value.members ?? []);
        setAgents(s.value.agents ?? []);
        setActivity(s.value.activity ?? null);
        setAnalytics(s.value.analytics ?? null);
        setEmployer(s.value.employer ?? null);
      } else setData("missing");
      if (m.status === "fulfilled" && m.value?.id) setMe({ id: m.value.id, joined_grids: m.value.joined_grids || [] });
      setSubgrids(sg.status === "fulfilled" ? (sg.value.subgrids ?? []) : []);
      setLaunch(lc.status === "fulfilled" ? { eligibility: lc.value.eligibility, market: lc.value.market, audit: lc.value.audit ?? null } : null);
      setPosts(po.status === "fulfilled" ? (po.value.posts ?? []) : []);
    })();
    return () => { alive = false; };
  }, [slug, tick]);

  // Chat — fetch on mount + poll every 4s (independent of the main loader).
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const loadChat = () => fetch(`/api/grids/${slug}/chat`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setChat(d.messages ?? []); }).catch(() => {});
    loadChat();
    const iv = window.setInterval(loadChat, 4000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [slug]);

  // Grid governance — fetch on slug change or a governance mutation (govTick bump).
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    fetch(`/api/grids/${slug}/proposals`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) { setGprops(d.proposals ?? []); setGovMember(!!d.me?.is_member); } }).catch(() => {});
    return () => { alive = false; };
  }, [slug, govTick]);
  const refreshGov = () => setGovTick((t) => t + 1);

  const summary = data && data !== "missing" ? data : null;
  const g = summary?.grid ?? null;
  const isOwner = !!(g && me && g.owner_id === me.id);
  const joined = !!(g && me && (isOwner || me.joined_grids.includes(g.grid_id)));

  async function setMembership(join: boolean) {
    if (!g || pending) return;
    setPending(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/join`, { method: join ? "POST" : "DELETE" });
      if (!r.ok) throw new Error();
      notify(join ? `Joined ${g.name}` : `Left ${g.name}`);
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      refresh();
    } catch { notify("Something went wrong"); }
    setPending(false);
  }

  async function doLaunch() {
    if (!g || pending) return;
    setPending(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      notify("Launched on Alpha");
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      if (j.market?.market_id) router.push(`/market/${j.market.market_id}`);
    } catch (e) { notify(e instanceof Error && e.message ? e.message : "Launch failed"); }
    setPending(false);
  }

  async function requestAudit() {
    if (!g || pending) return;
    setPending(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/audit`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      notify("Security audit requested");
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      refresh();
    } catch (e) { notify(e instanceof Error && e.message ? e.message : "Failed"); }
    setPending(false);
  }

  async function reviewAudit(pass: boolean) {
    if (!g || pending || !launch?.audit) return;
    setPending(true);
    try {
      const r = await fetch(`/api/audits/${launch.audit.audit_id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pass }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      notify(pass ? "Audit passed" : "Audit failed");
      window.dispatchEvent(new Event("neugrid:refresh-me"));
      refresh();
    } catch (e) { notify(e instanceof Error && e.message ? e.message : "Failed"); }
    setPending(false);
  }

  async function createSubGrid(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!g || sgPending) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("sg-name") ?? "").trim();
    const purpose = String(fd.get("sg-purpose") ?? "").trim();
    if (!name) { notify("SubGrid needs a name"); return; }
    setSgPending(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/subgrids`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, purpose }),
      });
      if (!r.ok) throw new Error();
      notify(`SubGrid "${name}" created`);
      setCreating(false);
      refresh();
    } catch { notify("Could not create SubGrid"); }
    setSgPending(false);
  }

  async function sendChat() {
    const text = draft.trim();
    if (!g || !text || chatBusy) return;
    setChatBusy(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error();
      setDraft("");
      const d = await fetch(`/api/grids/${g.slug}/chat`).then((x) => x.json()).catch(() => null);
      if (d) setChat(d.messages ?? []);
    } catch { notify("Could not send"); }
    setChatBusy(false);
  }
  async function likeChat(message_id: string) {
    if (!g) return;
    await fetch(`/api/grids/${g.slug}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", message_id }) }).catch(() => {});
    const d = await fetch(`/api/grids/${g.slug}/chat`).then((x) => x.json()).catch(() => null);
    if (d) setChat(d.messages ?? []);
  }

  async function publishPost() {
    const body = postBody.trim();
    if (!g || !body || posting) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/grids/${g.slug}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: postTitle.trim() || undefined, body }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setPosts(j.posts ?? []); setPostTitle(""); setPostBody("");
    } catch (e) { notify(e instanceof Error && e.message === "not_member" ? "Join the Grid to post" : "Could not post"); }
    setPosting(false);
  }
  async function postAction(post_id: string, action: "like" | "pin" | "delete") {
    if (!g) return;
    const r = await fetch(`/api/grids/${g.slug}/posts/${post_id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).then((x) => x.json()).catch(() => null);
    if (r?.posts) setPosts(r.posts);
    else if (r?.error) notify(r.error.replace(/_/g, " "));
  }

  async function createGovProposal() {
    if (!g || !govForm.title.trim() || govPosting) return;
    if (govForm.kind === "feature_post" && !govForm.target_post_id) { notify("Pick a post to feature"); return; }
    setGovPosting(true);
    const r = await fetch(`/api/grids/${g.slug}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govForm) }).then((x) => x.json()).catch(() => null);
    setGovPosting(false);
    if (r && !r.error) { setGovForm({ title: "", summary: "", kind: "general", target_post_id: "" }); setGovComposing(false); refreshGov(); }
    else notify(r?.error ? r.error.replace(/_/g, " ") : "Could not create proposal");
  }
  async function govAction(id: string, body: object) {
    if (!g) return;
    const r = await fetch(`/api/grids/${g.slug}/proposals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (r?.error) notify(r.error.replace(/_/g, " ")); else { refreshGov(); window.dispatchEvent(new Event("neugrid:refresh-me")); }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "feed", label: "Feed", count: posts.length },
    { key: "activity", label: "Activity", count: (activity?.campaigns.length ?? 0) + (activity?.jobs.length ?? 0) },
    { key: "members", label: "Members", count: members.length + agents.length },
    { key: "subgrids", label: "SubGrids", count: subgrids.length },
    { key: "govern", label: "Govern", count: gprops.filter((p) => p.status === "open").length },
    { key: "analytics", label: "Analytics" },
  ];

  return (
    <div className="lg-frame-h min-h-screen bg-transparent lg:flex lg:flex-col lg:overflow-hidden" style={{ zoom: 0.9 }}>
      <NeuHeader title="Grid" collapsed={!lOpen && !rOpen} onToggleCollapse={() => { const v = lOpen || rOpen; setLOpen(!v); setROpen(!v); }} />

      <div className="flex flex-col gap-3 px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* LEFT — grid info + join + launch */}
        <OrbPanel side="left" label="Grid Info" open={lOpen} onToggle={setLOpen} widthClass="lg:w-[300px] xl:w-[320px]">
          <Panel scroll title="GRID INFO" icon={<IconNetwork className="h-4 w-4" />} bodyClass="p-3.5">
            {!g ? (
              <p className="text-xs text-ink-dim">{data === "missing" ? "Grid not found." : "Loading…"}</p>
            ) : (
              <>
                <div className="divide-y divide-line">
                  <DataRow k="Owner" v={g.owner_id} />
                  <DataRow k="Type" v={g.grid_type ?? "community"} />
                  <DataRow k="Visibility" v={g.visibility} />
                  <DataRow k="Members" v={g.member_count} accent="neon" />
                  <DataRow k="Agents" v={agents.length} accent="cyan" />
                  <DataRow k="SubGrids" v={summary!.subgrids} />
                  <DataRow k="Created" v={g.created_at.slice(0, 10)} />
                </div>

                {isOwner ? (
                  <div className="mt-4 flex items-center justify-center gap-1.5 rounded border border-neon/25 bg-neon/[0.06] px-3 py-2 text-[11px] text-neon">
                    <IconCheck className="h-3.5 w-3.5" /> You founded this Grid
                  </div>
                ) : joined ? (
                  <button disabled={pending} onClick={() => setMembership(false)} className="ng-btn ng-btn--block mt-4 disabled:opacity-50">
                    {pending ? "…" : "Leave Grid"}
                  </button>
                ) : (
                  <button disabled={pending} onClick={() => setMembership(true)} className="ng-btn ng-btn-primary ng-btn--block mt-4 disabled:opacity-50">
                    <IconPlus className="h-4 w-4" /> {pending ? "Joining…" : "Join Grid"}
                  </button>
                )}

                {!isOwner && <Link href={`/messages?to=${g.owner_id}&ctx=${encodeURIComponent(g.name)}&ctxHref=${encodeURIComponent(`/grid/${g.slug}`)}`} className="ng-btn ng-btn--block ng-btn--sm mt-2"><IconMessage className="h-3.5 w-3.5" /> Contact admin</Link>}

                <div className="ng-label mb-2 mt-5 !text-ink-dim">Modules</div>
                <div className="flex flex-wrap gap-1.5">{g.modules_enabled.map((m) => <Tag key={m}>{m}</Tag>)}</div>

                {/* V6 — employer trust: how this Grid treats the people it hires on Campaign */}
                {employer && employer.postings > 0 && (
                  <>
                    <div className="ng-label mb-2 mt-5 !text-ink-dim">Employer trust</div>
                    <div className={`flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-[11px] ${
                      employer.tier === "trusted_employer" ? "border-neon/25 bg-neon/[0.06] text-neon"
                        : employer.tier === "reliable" ? "border-cyan/20 bg-cyan/[0.06] text-cyan"
                        : employer.tier === "ghost_risk" ? "border-danger/25 bg-danger/[0.06] text-danger"
                        : "border-line text-ink-dim"}`}>
                      <IconBriefcase className="h-3.5 w-3.5" />
                      {employer.tier === "trusted_employer" ? "Trusted employer" : employer.tier === "reliable" ? "Reliable employer" : employer.tier === "ghost_risk" ? "Ghost risk" : "Unrated employer"}
                    </div>
                    <div className="mt-2 divide-y divide-line">
                      <DataRow k="Promo jobs posted" v={employer.postings} />
                      <DataRow k="Paid on delivery" v={employer.paid} accent="neon" />
                      {employer.ghosted > 0 && <DataRow k="Ghosted deliveries" v={employer.ghosted} accent="danger" />}
                      {employer.rejected > 0 && <DataRow k="Rejected" v={employer.rejected} />}
                      {employer.in_flight > 0 && <DataRow k="Hiring now" v={employer.in_flight} accent="cyan" />}
                    </div>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">Earned by paying workers on delivery — fades if the Grid ghosts a delivery.</p>
                  </>
                )}

                {(g.grid_type === "project" || g.grid_type === "product") && launch && (
                  <>
                    <div className="ng-label mb-2 mt-5 !text-ink-dim">Token launch</div>
                    {launch.market ? (
                      <Link href={`/market/${launch.market.market_id}`} className="ng-btn ng-btn--block ng-btn--sm">Trading on {launch.market.stage} →</Link>
                    ) : !launch.audit ? (
                      isOwner && launch.eligibility.reason === "needs_audit" ? (
                        <button disabled={pending} onClick={requestAudit} className="ng-btn ng-btn-primary ng-btn--block disabled:opacity-50">{pending ? "…" : "Request security audit"}</button>
                      ) : (
                        <div className="rounded border border-neon/15 bg-neon/[0.04] px-3 py-2 text-[10px] text-ink-dim">{launch.eligibility.reason === "no_deliverable" ? "Ship a GridX product (or deliver milestones), then request a security audit." : "Deliver all milestones, then request a security audit."}</div>
                      )
                    ) : launch.audit.status === "requested" ? (
                      <div className="space-y-2">
                        <div className="rounded border border-neon/15 bg-neon/[0.04] px-3 py-2 text-[10px] text-ink-dim">Security audit pending review.</div>
                        {!isOwner && (
                          <div className="flex gap-2">
                            <button disabled={pending} onClick={() => reviewAudit(true)} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block disabled:opacity-50">Pass</button>
                            <button disabled={pending} onClick={() => reviewAudit(false)} className="ng-btn ng-btn-danger ng-btn--sm ng-btn--block disabled:opacity-50">Fail</button>
                          </div>
                        )}
                      </div>
                    ) : launch.audit.status === "failed" ? (
                      <div className="space-y-2">
                        <div className="rounded border border-danger/25 bg-danger/[0.06] px-3 py-2 text-[10px] text-danger">Audit failed — {launch.audit.notes}</div>
                        {isOwner && <button disabled={pending} onClick={requestAudit} className="ng-btn ng-btn--sm ng-btn--block disabled:opacity-50">Re-request audit</button>}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-1.5 rounded border border-neon/25 bg-neon/[0.06] px-3 py-2 text-[11px] text-neon"><IconCheck className="h-3.5 w-3.5" /> Security audit passed</div>
                        {isOwner && launch.eligibility.ok && <button disabled={pending} onClick={doLaunch} className="ng-btn ng-btn-primary ng-btn--block disabled:opacity-50">{pending ? "Launching…" : "Launch on Alpha"}</button>}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </Panel>
        </OrbPanel>

        {/* CENTER — overview + tabbed living layer */}
        <main className="@container order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <Link href="/grids/explore" className="inline-flex items-center gap-1.5 text-xs text-ink-dim transition hover:text-neon"><span aria-hidden>←</span> All Grids</Link>

          {data === null && <Panel><div className="p-8 text-center text-sm text-ink-dim">Loading grid…</div></Panel>}
          {data === "missing" && <Panel><div className="p-8 text-center text-sm text-ink-dim">Grid not found.</div></Panel>}

          {g && summary && (
            <>
              <div className="ng-panel p-5">
                <div className="flex items-start gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl" style={{ color: g.visual_theme?.accent ?? "var(--ng-neon)", background: "rgba(0,255,0,0.07)" }}>{g.visual_theme?.glyph ?? "▦"}</span>
                  <div className="min-w-0 flex-1">
                    <h1 className="ng-title text-2xl font-bold text-neon text-glow-soft"><Decrypt text={g.name} /></h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                      <span>{g.category}</span>
                      {g.grid_type && <Tag>{g.grid_type}</Tag>}
                      <span>· @{g.slug}</span>
                      {joined && !isOwner && <Mark plain accent="cyan" className="!text-[10px]">Member</Mark>}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => notify("Bookmarked")} aria-label="Bookmark" className="grid h-8 w-8 place-items-center rounded text-ink-dim transition hover:text-neon"><IconFlag className="h-4 w-4" /></button>
                    <button onClick={() => notify("Shared")} aria-label="Share" className="grid h-8 w-8 place-items-center rounded text-ink-dim transition hover:text-neon"><IconExternal className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ink-dim">{g.description}</p>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
                  <Stat label="Pulse" value={g.pulse_score} accent="neon" />
                  <Stat label="Members" value={g.member_count} />
                  <Stat label="SubGrids" value={summary.subgrids} />
                  <Stat label="Active Campaigns" value={summary.active_campaigns} />
                </div>
              </div>

              {/* tabs */}
              <div className="flex items-center gap-5 border-b border-line">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} className={`-mb-px border-b-2 pb-2 text-[13px] transition ${tab === t.key ? "border-neon text-neon text-glow-soft" : "border-transparent text-ink-dim hover:text-neon"}`}>
                    {t.label}{t.count != null && <span className="ml-1.5 text-[10px] text-ink-faint">{t.count}</span>}
                  </button>
                ))}
              </div>

              {/* FEED — the content hub: members post updates, admins pin announcements */}
              {tab === "feed" && (
                <div className="space-y-3">
                  {joined || isOwner ? (
                    <Panel bodyClass="p-3.5">
                      <input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Title (optional)" className="ng-input mb-2 w-full text-[13px]" />
                      <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} placeholder="Share an update with the Grid…" rows={3} className="ng-input mb-2 w-full resize-none text-[12px]" />
                      <button onClick={publishPost} disabled={posting || !postBody.trim()} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{posting ? "Posting…" : "Post update"}</button>
                    </Panel>
                  ) : (
                    <Panel><div className="p-4 text-center text-xs text-ink-dim">{me ? "Join the Grid to post updates." : "Sign in to post."}</div></Panel>
                  )}
                  {posts.length === 0 ? (
                    <Panel><div className="p-8 text-center text-sm text-ink-dim">No posts yet — {joined || isOwner ? "share the first update." : "the founder hasn't posted yet."}</div></Panel>
                  ) : (
                    posts.map((p) => (
                      <div key={p.post_id} className={`ng-card p-4 ${p.pinned ? "!border-neon/30" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {p.pinned && <Mark accent="neon" className="!text-[8px]">Pinned</Mark>}
                            <span className="font-semibold text-ink">{p.username}</span>
                            <Mark plain accent={ROLE_ACCENT[p.role]} className="!text-[8px]">{p.role}</Mark>
                            <span className="text-ink-faint">· {p.ago}</span>
                          </div>
                          {(p.can_pin || p.can_manage) && (
                            <div className="flex shrink-0 items-center gap-2 text-[10px]">
                              {p.can_pin && <button onClick={() => postAction(p.post_id, "pin")} className="text-ink-faint transition hover:text-neon">{p.pinned ? "Unpin" : "Pin"}</button>}
                              {p.can_manage && <button onClick={() => postAction(p.post_id, "delete")} className="text-ink-faint transition hover:text-[color:var(--ng-danger)]">Delete</button>}
                            </div>
                          )}
                        </div>
                        {p.title && <h3 className="ng-title mt-2 text-[15px] font-bold leading-snug text-ink">{p.title}</h3>}
                        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-dim">{p.body}</p>
                        <button onClick={() => postAction(p.post_id, "like")} className={`mt-2 flex items-center gap-1 text-[11px] transition ${p.liked ? "text-neon" : "text-ink-faint hover:text-neon"}`}><IconHeart className="h-3 w-3" />{p.likes > 0 ? p.likes : ""}</button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ACTIVITY — campaigns + open tasks + recent pulse */}
              {tab === "activity" && (
                <div className="space-y-4">
                  <Panel title="CAMPAIGNS" icon={<IconTarget className="h-4 w-4" />} action={<Link href="/campaignx/board" className="text-[11px] text-ink-dim transition hover:text-neon">Campaign →</Link>} bodyClass="p-3.5">
                    {activity && activity.campaigns.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {activity.campaigns.map((c) => (
                          <Link key={c.campaign_id} href="/campaignx/board" className="ng-card flex items-center justify-between gap-2 p-3">
                            <span className="truncate text-[13px] text-ink">{c.title}</span>
                            <Mark plain accent={c.status === "active" ? "neon" : "amber"} className="!text-[9px] shrink-0">{c.status}</Mark>
                          </Link>
                        ))}
                      </div>
                    ) : <p className="text-xs text-ink-dim">No campaigns yet — launch one on <Link href="/campaignx/board" className="text-neon">Campaign</Link> to grow this Grid.</p>}
                  </Panel>

                  <Panel title="OPEN TASKS" icon={<IconBriefcase className="h-4 w-4" />} action={<Link href="/jobs" className="text-[11px] text-ink-dim transition hover:text-neon">Job board →</Link>} bodyClass="p-3.5">
                    {activity && activity.jobs.filter((j) => j.status === "open").length > 0 ? (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {activity.jobs.filter((j) => j.status === "open").map((j) => (
                          <Link key={j.job_id} href="/jobs" className="ng-card p-3">
                            <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] text-ink">{j.title}</span><Mark plain className="!text-[11px] shrink-0">{j.reward_amount}</Mark></div>
                            {j.required_skills.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{j.required_skills.slice(0, 3).map((sk) => <Tag key={sk}>{sk}</Tag>)}</div>}
                          </Link>
                        ))}
                      </div>
                    ) : <p className="text-xs text-ink-dim">No open tasks — post work to this Grid from the <Link href="/jobs" className="text-neon">Job board</Link>.</p>}
                  </Panel>

                  <Panel title="RECENT PULSE" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
                    {summary.recent_pulse.length === 0 ? (
                      <p className="text-xs text-ink-dim">No Pulse activity in this Grid yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {summary.recent_pulse.map((e) => (
                          <div key={e.event_id} className="flex items-start justify-between gap-3">
                            <span className="text-xs text-ink-dim">{e.reason}</span>
                            <Mark plain accent="cyan" className="shrink-0 text-[11px]">+{e.weight}</Mark>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              )}

              {/* MEMBERS — human directory + the Grid's agents */}
              {tab === "members" && (
                <div className="space-y-4">
                  <Panel title={`MEMBERS · ${members.length}`} icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
                    {members.length === 0 ? (
                      <p className="text-xs text-ink-dim">No members yet — be the first to join.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {members.map((m) => (
                          <Link key={m.id} href={`/talent/${m.id}`} className="ng-card flex items-center gap-2.5 p-3">
                            <MatrixAvatar seed={m.username} size={34} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-ink">{m.username}</div>
                              <div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Mark plain accent={ROLE_ACCENT[m.role]} className="!text-[9px]">{m.role}</Mark><span>· {m.reputation.toLocaleString()} rep</span></div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title={`AGENTS · ${agents.length}`} icon={<IconBot className="h-4 w-4" />} action={<Link href="/agents" className="text-[11px] text-ink-dim transition hover:text-neon">Agents →</Link>} bodyClass="p-3.5">
                    {agents.length === 0 ? (
                      <p className="text-xs text-ink-dim">No agents call this Grid home yet — deploy one from <Link href="/agents" className="text-neon">Agents</Link>.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {agents.map((a) => (
                          <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="ng-card flex items-center gap-2.5 p-3">
                            <MatrixAvatar seed={a.agent_id} size={34} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-neon">{a.name}</div>
                              <div className="flex items-center gap-1.5 text-[10px] text-ink-dim"><Mark plain accent={a.trust_tier === "trusted" ? "neon" : a.trust_tier === "suspended" ? "danger" : "amber"} className="!text-[9px]">{a.trust_tier}</Mark><span>· {a.earnings.toLocaleString()} earned</span></div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              )}

              {/* SUBGRIDS — teams inside the Grid */}
              {tab === "subgrids" && (
                <Panel
                  title="SUBGRIDS"
                  icon={<IconLayers className="h-4 w-4" />}
                  action={joined ? <button onClick={() => setCreating((c) => !c)} className="ng-btn ng-btn--sm">{creating ? "Cancel" : "+ New SubGrid"}</button> : null}
                  bodyClass="p-3.5"
                >
                  {creating && (
                    <form onSubmit={createSubGrid} className="mb-3 space-y-2 border-b border-line pb-3">
                      <input name="sg-name" placeholder="SubGrid name" className="ng-input" />
                      <textarea name="sg-purpose" placeholder="What will this team build?" className="ng-input min-h-[60px] resize-y" />
                      <button type="submit" disabled={sgPending} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{sgPending ? "Creating…" : "Create SubGrid"}</button>
                    </form>
                  )}
                  {subgrids.length === 0 ? (
                    <p className="text-xs text-ink-dim">No SubGrids yet — {joined ? "form a team to build inside this Grid." : "members form teams here to build inside the Grid."}</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {subgrids.map((s) => (
                        <Link key={s.subgrid_id} href={`/subgrid/${s.subgrid_id}`} className="ng-card p-3 transition hover:!border-neon/40">
                          <div className="flex items-center gap-2"><span className="text-neon"><IconLayers className="h-4 w-4" /></span><span className="truncate text-sm font-semibold text-ink">{s.name}</span>{s.access && s.access !== "open" && <span className="shrink-0 text-amber" title={`${s.access}-gated`}><IconLock className="h-3 w-3" /></span>}</div>
                          {s.purpose && <p className="mt-1 line-clamp-2 text-[11px] text-ink-dim">{s.purpose}</p>}
                          <div className="mt-2 flex items-center justify-between text-[10px] text-ink-dim">
                            <span className="flex items-center gap-2"><span className="flex items-center gap-1"><IconUser className="h-3 w-3" />{s.members.length}</span><span className="flex items-center gap-1"><IconBot className="h-3 w-3" />{(s.agent_members ?? []).length}</span></span>
                            <Mark plain accent="cyan" className="!text-[10px]">{s.pulse_score} Pulse</Mark>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>
              )}

              {/* GOVERN — grid-member governance (reputation-weighted, member-scoped) */}
              {tab === "govern" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-relaxed text-ink-faint">Members steer the Grid — votes are weighted by reputation (earned, not bought). A passed &ldquo;feature a post&rdquo; proposal pins it to the feed.</p>
                    {govMember && <button onClick={() => setGovComposing((v) => !v)} className="ng-btn ng-btn-primary ng-btn--sm shrink-0">{govComposing ? "Cancel" : "+ Propose"}</button>}
                  </div>

                  {govComposing && (
                    <Panel bodyClass="p-3.5">
                      <input value={govForm.title} onChange={(e) => setGovForm((f) => ({ ...f, title: e.target.value }))} placeholder="Proposal title" className="ng-input mb-2 w-full text-[13px]" />
                      <textarea value={govForm.summary} onChange={(e) => setGovForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Rationale (optional)" rows={2} className="ng-input mb-2 w-full resize-none text-[12px]" />
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {(["general", "feature_post"] as const).map((k) => (
                          <button key={k} onClick={() => setGovForm((f) => ({ ...f, kind: k }))} className={`rounded px-2.5 py-1 text-[11px] transition ${govForm.kind === k ? "bg-neon/15 text-neon" : "bg-line/40 text-ink-dim hover:text-ink"}`}>{k === "general" ? "Advisory" : "Feature a post"}</button>
                        ))}
                      </div>
                      {govForm.kind === "feature_post" && (
                        <select value={govForm.target_post_id} onChange={(e) => setGovForm((f) => ({ ...f, target_post_id: e.target.value }))} className="ng-input mb-2 w-full text-[12px]">
                          <option value="">Pick a post to feature…</option>
                          {posts.map((p) => <option key={p.post_id} value={p.post_id}>{p.title ?? p.body.slice(0, 40)}</option>)}
                        </select>
                      )}
                      <button onClick={createGovProposal} disabled={govPosting || !govForm.title.trim()} className="ng-btn ng-btn-primary ng-btn--sm disabled:opacity-50">{govPosting ? "Opening…" : "Open proposal"}</button>
                    </Panel>
                  )}

                  {gprops.length === 0 ? (
                    <Panel><div className="p-8 text-center text-sm text-ink-dim">No proposals yet — {govMember ? "open the first one." : "members propose Grid-level decisions here."}</div></Panel>
                  ) : (
                    gprops.map((p) => {
                      const open = p.status === "open";
                      return (
                        <div key={p.proposal_id} className="ng-card p-4">
                          <div className="flex items-start justify-between gap-2">
                            <Mark plain={p.kind === "general"} accent={p.kind === "feature_post" ? "cyan" : undefined} className="!text-[9px]">{p.kind === "feature_post" ? "Feature post" : "Advisory"}</Mark>
                            {open ? <Mark plain accent="neon" className="!text-[9px]">● Open</Mark> : p.status === "passed" ? <Mark accent="neon" className="!text-[9px]">Passed</Mark> : <Mark accent="danger" className="!text-[9px]">Rejected</Mark>}
                          </div>
                          <h3 className="ng-title mt-2 text-[15px] font-bold leading-snug text-ink">{p.title}</h3>
                          {p.summary && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{p.summary}</p>}
                          {p.kind === "feature_post" && p.target_post_title && <div className="mt-2 flex items-center gap-1.5 rounded border border-cyan/20 bg-cyan/[0.06] px-2 py-1.5 text-[10.5px] text-cyan"><IconActivity className="h-3 w-3 shrink-0" />Features → &ldquo;{p.target_post_title}&rdquo;</div>}

                          <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-wide">
                            <span className="text-neon">For {p.for_weight.toLocaleString()}</span>
                            <span className="text-[color:var(--ng-danger)]">{p.against_weight.toLocaleString()} Against</span>
                          </div>
                          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-line">
                            <div className="h-full bg-neon transition-all" style={{ width: `${p.total_weight ? p.for_pct : 50}%`, opacity: p.total_weight ? 1 : 0.25 }} />
                            <div className="h-full bg-[color:var(--ng-danger)] transition-all" style={{ width: `${p.total_weight ? p.against_pct : 50}%`, opacity: p.total_weight ? 1 : 0.25 }} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-ink-faint">
                            <span>{p.voters} of {p.quorum_votes} needed{p.my_vote ? ` · you voted ${p.my_vote.support ? "For" : "Against"}` : ""}</span>
                            <span>reputation-weighted</span>
                          </div>

                          {open && govMember && !p.my_vote && (
                            <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                              <button onClick={() => govAction(p.proposal_id, { action: "vote", support: true })} className="ng-btn ng-btn-primary ng-btn--sm ng-btn--block">For</button>
                              <button onClick={() => govAction(p.proposal_id, { action: "vote", support: false })} className="ng-btn ng-btn--sm ng-btn--block">Against</button>
                            </div>
                          )}
                          {open && (
                            <button onClick={() => govAction(p.proposal_id, { action: "resolve" })} className="ng-btn ng-btn-ghost ng-btn--sm ng-btn--block mt-2">Resolve now</button>
                          )}
                          {!open && p.execution_note && (
                            <div className={`mt-3 flex items-start gap-1.5 border-t border-line pt-2 text-[10px] ${p.executed ? "text-neon" : "text-ink-dim"}`}>{p.executed && <IconCheck className="mt-px h-3 w-3 shrink-0" />}<span>{p.execution_note}</span></div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ANALYTICS — grid-level dashboard (KPIs, growth, contributors, agents) */}
              {tab === "analytics" && analytics && (
                <div className="space-y-4">
                  {/* KPI strip */}
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                    {([
                      ["Members", analytics.kpis.members], ["Pulse", analytics.kpis.pulse], ["Posts", analytics.kpis.posts],
                      ["Messages", analytics.kpis.messages], ["Likes", analytics.kpis.likes], ["Agents", analytics.kpis.agents],
                    ] as [string, number][]).map(([k, v]) => (
                      <div key={k} className="ng-card p-3 text-center"><div className="ng-stat__v tnum">{v.toLocaleString()}</div><div className="ng-stat__k">{k}</div></div>
                    ))}
                  </div>

                  {/* growth trends */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Panel title="PULSE GROWTH" icon={<IconActivity className="h-4 w-4" />} bodyClass="p-3.5">
                      <Area data={analytics.pulse_trend} gid={`pulse-${g.grid_id}`} h={90} />
                      <div className="mt-1 text-[10px] text-ink-faint">Cumulative Grid Pulse since {g.created_at.slice(0, 10)}</div>
                    </Panel>
                    <Panel title="MEMBER GROWTH" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
                      <Area data={analytics.member_trend} gid={`mem-${g.grid_id}`} color="#22d3ee" h={90} />
                      <div className="mt-1 text-[10px] text-ink-faint">Cumulative members over the Grid&apos;s lifetime</div>
                    </Panel>
                  </div>

                  {/* contributors + agents */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Panel title="TOP CONTRIBUTORS" icon={<IconUser className="h-4 w-4" />} bodyClass="p-3.5">
                      {analytics.top_contributors.length === 0 ? <p className="text-xs text-ink-dim">No Pulse contributions yet.</p> : (
                        <div className="space-y-2">
                          {analytics.top_contributors.map((c, i) => {
                            const max = analytics.top_contributors[0]?.pulse || 1;
                            return (
                              <Link key={c.id} href={`/talent/${c.id}`} className="block">
                                <div className="flex items-center justify-between text-[11px]"><span className="flex items-center gap-1.5 text-ink"><span className="text-ink-faint">{i + 1}</span><MatrixAvatar seed={c.username} size={20} />{c.username}</span><Mark plain accent="neon" className="!text-[11px]">+{c.pulse.toLocaleString()}</Mark></div>
                                <div className="mt-1"><ProgressBar percent={(c.pulse / max) * 100} /></div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </Panel>
                    <Panel title="AGENT PERFORMANCE" icon={<IconBot className="h-4 w-4" />} bodyClass="p-3.5">
                      {analytics.agent_performance.length === 0 ? <p className="text-xs text-ink-dim">No agents on this Grid yet.</p> : (
                        <div className="divide-y divide-line">
                          {analytics.agent_performance.map((a) => (
                            <Link key={a.agent_id} href={`/agents/${a.agent_id}`} className="flex items-center justify-between py-2 text-[11px]">
                              <span className="flex items-center gap-1.5 text-neon"><IconBot className="h-3 w-3" />{a.name}</span>
                              <span className="flex items-center gap-2 text-ink-dim"><span>★ {a.rating.toFixed(1)}</span><span>·</span><span>{a.jobs} jobs</span><Mark plain className="!text-[10px]">{a.earnings.toLocaleString()}</Mark></span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </Panel>
                  </div>

                  {/* pulse by source */}
                  <Panel title="PULSE BY SOURCE" icon={<IconCoins className="h-4 w-4" />} bodyClass="p-3.5">
                    {analytics.pulse_by_source.length === 0 ? <p className="text-xs text-ink-dim">No Pulse activity yet.</p> : (
                      <div className="space-y-2">
                        {analytics.pulse_by_source.map((sr) => {
                          const max = analytics.pulse_by_source[0]?.value || 1;
                          return (
                            <div key={sr.label}>
                              <div className="flex items-center justify-between text-[11px]"><span className="text-ink-dim">{sr.label.replace(/_/g, " ")}</span><Mark plain className="!text-[11px]">+{sr.value.toLocaleString()}</Mark></div>
                              <div className="mt-1"><ProgressBar percent={(sr.value / max) * 100} color="#22d3ee" /></div>
                            </div>
                          );
                        })}
                        {analytics.most_liked && <p className="border-t border-line pt-2 text-[10px] text-ink-faint">Most-liked post: &ldquo;{analytics.most_liked.title}&rdquo; · {analytics.most_liked.likes} likes</p>}
                      </div>
                    )}
                  </Panel>
                </div>
              )}
            </>
          )}
        </main>

        {/* RIGHT — community chat */}
        <OrbPanel side="right" label="Community" open={rOpen} onToggle={setROpen}>
          <Panel title="COMMUNITY" icon={<IconMessage className="h-4 w-4" />} bodyClass="flex flex-col p-0">
            <div className="max-h-[58vh] flex-1 space-y-3 overflow-y-auto p-3.5">
              {chat.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-ink-dim">No messages yet — start the conversation.</p>
              ) : (
                chat.map((m) => (
                  <div key={m.message_id} className="group">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-ink">{m.username}</span>
                      <Mark plain accent={ROLE_ACCENT[m.role]} className="!text-[8px]">{m.role}</Mark>
                      <span className="text-ink-faint">· {m.reputation.toLocaleString()} rep · {m.ago}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-dim">{m.text}</p>
                    <button onClick={() => likeChat(m.message_id)} className={`mt-0.5 flex items-center gap-1 text-[10px] transition ${m.liked ? "text-neon" : "text-ink-faint hover:text-neon"}`}>
                      <IconHeart className="h-3 w-3" />{m.likes > 0 ? m.likes : ""}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-line p-2.5">
              {joined || isOwner ? (
                <div className="flex items-center gap-1.5">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder="Message the Grid…" className="ng-input min-w-0 flex-1 !py-1.5 text-[12px]" />
                  <button onClick={sendChat} disabled={chatBusy || !draft.trim()} className="ng-btn ng-btn-primary ng-btn--sm shrink-0 disabled:opacity-50">Send</button>
                </div>
              ) : (
                <p className="text-center text-[11px] text-ink-faint">{me ? "Join the Grid to post." : "Sign in to post."}</p>
              )}
            </div>
          </Panel>
        </OrbPanel>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded border border-neon/40 bg-black/90 px-4 py-2.5 text-sm text-neon" style={{ boxShadow: "0 0 20px rgba(0,255,0,0.3)" }}>{toast}</div>
      )}
    </div>
  );
}
