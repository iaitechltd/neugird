/**
 * GET /api/search?q= — global search across the real platform: grids, people,
 * agents, jobs, markets, builds, raises, products. Powers the header search (⌘K).
 * Returns typed rows with hrefs; prefix matches rank above substring matches.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export const dynamic = "force-dynamic";

type Hit = { kind: string; title: string; sub: string; href: string; rank: number };

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const hits: Hit[] = [];
  const match = (text?: string) => {
    const t = (text ?? "").toLowerCase();
    return t.startsWith(q) ? 2 : t.includes(q) ? 1 : 0;
  };
  const push = (kind: string, title: string, sub: string, href: string, ...texts: (string | undefined)[]) => {
    const rank = Math.max(...texts.map(match), match(title));
    if (rank > 0) hits.push({ kind, title, sub, href, rank });
  };

  for (const g of db.grids) push("grid", g.name, `${g.grid_type ?? "community"} · ${g.member_count} members`, `/grid/${g.slug}`, g.name, g.slug, g.category);
  for (const u of db.users) push("person", u.username, (u.skills ?? []).slice(0, 3).join(" · ") || "builder", `/talent/${u.id}`, u.username, ...(u.skills ?? []));
  for (const a of db.agents) push("agent", a.name, `${a.trust_tier ?? "trusted"} · ${(a.capabilities ?? []).slice(0, 2).join(", ") || "general"}`, `/agents/${a.agent_id}`, a.name, ...(a.capabilities ?? []));
  for (const j of db.jobs) if (j.status === "open") push("job", j.title, `${j.reward_amount.toLocaleString()} ${j.reward_token ?? "Pulse"} · ${j.context === "campaign_task" ? "Campaign" : "Jobs"}`, j.context === "campaign_task" ? "/campaignx/board" : "/jobs", j.title, ...(j.required_skills ?? []));
  for (const m of db.markets) push("market", m.base_symbol, `${m.stage} · $${Math.round(m.liquidity_usd ?? 0).toLocaleString()} liq`, `/market/${m.market_id}`, m.base_symbol);
  for (const b of db.builds) push("build", b.title, `v${b.version ?? 1} · ${b.stack.slice(0, 3).join(" · ")}`, b.deployment ? `/d/${b.deployment.slug}` : "/echo", b.title, ...(b.stack ?? []));
  for (const p of db.proposals) if (p.status === "open") push("raise", p.title, `asking ${p.ask_amount.toLocaleString()} · ${p.category}`, `/genesis/${p.proposal_id}`, p.title, p.category);
  for (const pr of db.products) push("product", pr.name, pr.category ?? "GridX product", `/gridx/${pr.product_id}`, pr.name, pr.category);
  // audit Wave 3 — half the platform was invisible to ⌘K (ventures & skills are DOCK keys)
  for (const v of db.ventures ?? []) push("venture", v.name, `agent company · ${v.seats.length} crew`, `/venture/${v.venture_id}`, v.name);
  for (const s of db.publishedSkills ?? []) push("skill", s.title, `${s.price_grid > 0 ? `${s.price_grid} GRID` : "free"} · ⇧ ${s.installs}`, "/skills", s.title);
  for (const sg of db.subgrids ?? []) push("team", sg.name, `team · ${sg.members.length + (sg.agent_members?.length ?? 0)} on it`, `/subgrid/${sg.subgrid_id}`, sg.name, sg.purpose);
  for (const p of db.feedPosts ?? []) push("post", p.title || p.body.slice(0, 48), "the wire", `/post/${p.post_id}`, p.title ?? "", p.body.slice(0, 120));
  for (const dsp of (db.disputes ?? []).filter((x) => x.status === "open")) push("dispute", db.jobs.find((j) => j.job_id === dsp.subject_id)?.title ?? "escrow dispute", "awaiting the evaluator panel", "/disputes", "dispute", dsp.reason.slice(0, 60));
  if (db.season) push("season", `Season ${db.season.number}`, `ends ${new Date(db.season.ends_at).toLocaleDateString()}`, "/season", "season", "leaderboard race");
  // passports match on the WORD "passport" (+name), so name searches don't double-hit
  for (const u of db.users) push("passport", `${u.username} — passport`, "machine-readable identity", `/passport/${u.id}`, "passport", u.username);

  hits.sort((a, b) => b.rank - a.rank);
  return NextResponse.json({ hits: hits.slice(0, 12).map((h) => ({ kind: h.kind, title: h.title, sub: h.sub, href: h.href })) });
}
