/**
 * GET /api/notifications — the current user's REAL actionable signals, for the
 * header bell: unread DMs, deliveries awaiting their review, applicants waiting on
 * their campaign postings, and open protocol votes. `badge` counts the actionable
 * ones (messages + reviews + applicant queues).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Messaging, Governance, Markets, Social, Disputes } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Note = { kind: "message" | "review" | "applicants" | "governance" | "fill" | "position" | "market" | "social" | "funded" | "sale" | "dispute" | "comment" | "claimed"; text: string; sub?: string; href: string };

const RECENT_MS = 48 * 3600 * 1000; // Trade event window — old fills/closes age out of the bell
const recent = (iso?: string) => !!iso && Date.now() - Date.parse(iso) <= RECENT_MS;
const sym = (market_id: string) => db.markets.find((m) => m.market_id === market_id)?.base_symbol ?? market_id;

export async function GET() {
  const uid = await getCurrentUserId();
  const notes: Note[] = [];

  // 1 · unread DMs (agents reply now, so these are alive)
  const convos = Messaging.listConversations(uid).filter((c) => c.unread > 0);
  for (const c of convos.slice(0, 4)) {
    notes.push({ kind: "message", text: `${c.counterparty.name} sent you a message`, sub: c.last_text.slice(0, 60), href: "/messages" });
  }

  // 2 · deliveries waiting on MY review (escrow releases when I approve)
  const reviews = db.jobs.filter((j) => j.created_by === uid && j.status === "submitted");
  for (const j of reviews.slice(0, 4)) {
    notes.push({ kind: "review", text: `Delivery awaiting your review`, sub: j.title.slice(0, 60), href: j.context === "campaign_task" ? "/campaignx/board" : "/jobs" });
  }

  // 3 · applicants waiting on my open campaign postings
  const myOpenCampaigns = db.jobs.filter((j) => j.created_by === uid && j.status === "open" && j.context === "campaign_task");
  for (const j of myOpenCampaigns) {
    const pending = db.applications.filter((a) => a.job_id === j.job_id && a.status === "pending").length;
    if (pending > 0) notes.push({ kind: "applicants", text: `${pending} applicant${pending === 1 ? "" : "s"} waiting`, sub: j.title.slice(0, 60), href: "/campaignx/board" });
  }

  // 4 · Trade — my limit orders that filled recently
  const fills = db.orders.filter((o) => o.user_id === uid && o.status === "filled" && recent(o.filled_at));
  for (const o of fills.slice(0, 3)) {
    notes.push({ kind: "fill", text: `Limit ${o.side} filled — ${sym(o.market_id)}`, sub: `${o.qty} @ $${o.price}`, href: `/market/${o.market_id}` });
  }

  // 5 · Trade — my positions closed by the engine (liquidation / TP / SL)
  const closes = db.positions.filter((p) => p.user_id === uid && recent(p.closed_at) && (p.close_reason === "liquidation" || p.close_reason === "take_profit" || p.close_reason === "stop_loss"));
  for (const p of closes.slice(0, 3)) {
    const label = p.close_reason === "liquidation" ? "Position liquidated" : p.close_reason === "take_profit" ? "Take-profit hit" : "Stop-loss hit";
    const pnl = p.pnl ?? 0;
    notes.push({ kind: "position", text: `${label} — ${sym(p.market_id)}`, sub: `${p.side} ${p.leverage}x · PnL ${pnl >= 0 ? "+" : ""}$${Math.round(pnl)}`, href: `/market/${p.market_id}` });
  }

  // 6 · Trade — a market I own is ready to graduate (actionable), or one I hold just did
  const myGridIds = new Set(db.grids.filter((g) => g.owner_id === uid).map((g) => g.grid_id));
  for (const m of db.markets) {
    if (myGridIds.has(m.grid_id) && m.stage !== "futures") {
      const g = Markets.canGraduate(m.market_id);
      if (g.ok && g.next) notes.push({ kind: "market", text: `${m.base_symbol} is ready to graduate to ${g.next}`, sub: "cap · liquidity · stake gates all met", href: `/market/${m.market_id}` });
    }
    if (recent(m.stage_changed_at) && db.holdings.some((h) => h.user_id === uid && h.market_id === m.market_id && h.base > 0)) {
      notes.push({ kind: "market", text: `${m.base_symbol} graduated to ${m.stage}`, sub: "a market you hold moved up a stage", href: `/market/${m.market_id}` });
    }
  }

  // 7 · social — new followers, and what the people YOU follow shipped
  const uname = (id: string) => db.users.find((u) => u.id === id)?.username ?? id;
  for (const f of Social.followersOf(uid).filter((f) => recent(f.created_at)).slice(0, 3)) {
    notes.push({ kind: "social", text: `${uname(f.follower_id)} followed you`, sub: "your verified activity now reaches their bell", href: `/talent/${f.follower_id}` });
  }
  const following = new Set(Social.followingOf(uid));
  if (following.size) {
    for (const b of db.builds.filter((b) => following.has(b.owner_id) && recent(b.created_at)).slice(0, 3)) {
      notes.push({ kind: "social", text: `${uname(b.owner_id)} shipped a build`, sub: b.title.slice(0, 60), href: `/talent/${b.owner_id}` });
    }
  }

  // 9 · MONEY MOMENTS (connectivity audit Wave 1) — the journey's payoffs were silent:
  // a founder was never told they got funded, sold, claimed, disputed, or answered.
  // a — someone backed my raise
  for (const b of db.backings.filter((b) => myGridIds.has(b.grid_id) && b.backer_id !== uid && !b.refunded && recent(b.created_at)).slice(0, 3)) {
    notes.push({ kind: "funded", text: `${uname(b.backer_id)} backed your raise — $${Math.round(b.amount).toLocaleString()}`, sub: "conviction, escrowed", href: "/genesis/board" });
  }
  // b — my milestone moved (founder) · a milestone awaits backer votes on a raise I backed
  const backedGrids = new Set(db.backings.filter((b) => b.backer_id === uid && !b.refunded).map((b) => b.grid_id));
  for (const ms of db.milestones) {
    if (!recent(ms.updated_at)) continue;
    if (myGridIds.has(ms.grid_id) && (ms.status === "approved" || ms.status === "released")) {
      notes.push({ kind: "funded", text: `Milestone ${ms.status} — $${Math.round(ms.amount).toLocaleString()} tranche`, sub: ms.title.slice(0, 60), href: "/genesis/board" });
    } else if (backedGrids.has(ms.grid_id) && (ms.status === "submitted" || ms.status === "approving")) {
      notes.push({ kind: "funded", text: "A milestone you backed needs your vote", sub: ms.title.slice(0, 60), href: "/genesis/board" });
    }
  }
  // c — my product / skill sold (real USDC landed)
  for (const s of db.settlements.filter((s) => s.payee === uid && s.status === "settled" && recent(s.created_at) && (s.resource.startsWith("product_purchase:") || s.resource.startsWith("skill"))).slice(0, 3)) {
    const product = s.resource.startsWith("product_purchase:") ? db.products.find((p) => p.product_id === s.resource.slice("product_purchase:".length)) : undefined;
    notes.push({ kind: "sale", text: `Sold — $${Math.round(s.amount).toLocaleString()} in`, sub: product ? product.name.slice(0, 60) : "a skill install", href: product ? `/gridx/${product.product_id}` : "/skills" });
  }
  // d — an open dispute awaits my evaluator vote (reputation-staked duty)
  for (const dp of db.disputes.filter((dp) => dp.status === "open" && dp.raised_by !== uid && dp.against !== uid && !dp.votes.some((v) => v.evaluator_id === uid)).slice(0, 2)) {
    const { ok } = Disputes.eligibleEvaluator(dp, uid);
    if (ok) notes.push({ kind: "dispute", text: "A dispute needs your evaluator vote", sub: dp.reason.slice(0, 60), href: "/disputes" });
  }
  // e — someone answered a post of mine
  const myPosts = db.feedPosts.filter((p) => p.author_type === "human" && p.author_id === uid);
  for (const p of myPosts) {
    for (const c of p.comments.filter((c) => c.author_id !== uid && recent(c.created_at)).slice(-2)) {
      notes.push({ kind: "comment", text: `${c.author_type === "agent" ? (db.agents.find((a) => a.agent_id === c.author_id)?.name ?? "an agent") : uname(c.author_id)} replied to your post`, sub: c.body.slice(0, 60), href: `/post/${p.post_id}` });
    }
  }
  // f — my job was claimed (work has started)
  for (const j of db.jobs.filter((j) => j.created_by === uid && (j.status === "assigned" || j.status === "in_progress") && recent(j.updated_at)).slice(0, 2)) {
    notes.push({ kind: "claimed", text: "Your job was claimed — work started", sub: j.title.slice(0, 60), href: "/jobs" });
  }

  // 8 · open protocol votes (informational)
  const openGov = Governance.listProposals().filter((p) => p.status === "open").length;
  if (openGov > 0) notes.push({ kind: "governance", text: `${openGov} protocol proposal${openGov === 1 ? "" : "s"} open for voting`, href: "/governance" });

  // badge = actionable only (fills/closes are informational and would pin forever)
  const readyToGrad = notes.filter((n) => n.kind === "market" && n.text.includes("ready to graduate")).length;
  const voteDuties = notes.filter((n) => n.kind === "dispute" || (n.kind === "funded" && n.text.includes("needs your vote"))).length;
  const badge = convos.reduce((n, c) => n + c.unread, 0) + reviews.length + notes.filter((n) => n.kind === "applicants").length + readyToGrad + voteDuties;
  return NextResponse.json({ badge, notes: notes.slice(0, 12) });
}
