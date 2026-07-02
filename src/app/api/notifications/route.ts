/**
 * GET /api/notifications — the current user's REAL actionable signals, for the
 * header bell: unread DMs, deliveries awaiting their review, applicants waiting on
 * their campaign postings, and open protocol votes. `badge` counts the actionable
 * ones (messages + reviews + applicant queues).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Messaging, Governance, Markets, Social } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Note = { kind: "message" | "review" | "applicants" | "governance" | "fill" | "position" | "market" | "social"; text: string; sub?: string; href: string };

const RECENT_MS = 48 * 3600 * 1000; // TradeX event window — old fills/closes age out of the bell
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

  // 4 · TradeX — my limit orders that filled recently
  const fills = db.orders.filter((o) => o.user_id === uid && o.status === "filled" && recent(o.filled_at));
  for (const o of fills.slice(0, 3)) {
    notes.push({ kind: "fill", text: `Limit ${o.side} filled — ${sym(o.market_id)}`, sub: `${o.qty} @ $${o.price}`, href: `/market/${o.market_id}` });
  }

  // 5 · TradeX — my positions closed by the engine (liquidation / TP / SL)
  const closes = db.positions.filter((p) => p.user_id === uid && recent(p.closed_at) && (p.close_reason === "liquidation" || p.close_reason === "take_profit" || p.close_reason === "stop_loss"));
  for (const p of closes.slice(0, 3)) {
    const label = p.close_reason === "liquidation" ? "Position liquidated" : p.close_reason === "take_profit" ? "Take-profit hit" : "Stop-loss hit";
    const pnl = p.pnl ?? 0;
    notes.push({ kind: "position", text: `${label} — ${sym(p.market_id)}`, sub: `${p.side} ${p.leverage}x · PnL ${pnl >= 0 ? "+" : ""}$${Math.round(pnl)}`, href: `/market/${p.market_id}` });
  }

  // 6 · TradeX — a market I own is ready to graduate (actionable), or one I hold just did
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

  // 8 · open protocol votes (informational)
  const openGov = Governance.listProposals().filter((p) => p.status === "open").length;
  if (openGov > 0) notes.push({ kind: "governance", text: `${openGov} protocol proposal${openGov === 1 ? "" : "s"} open for voting`, href: "/governance" });

  // badge = actionable only (fills/closes are informational and would pin forever)
  const readyToGrad = notes.filter((n) => n.kind === "market" && n.text.includes("ready to graduate")).length;
  const badge = convos.reduce((n, c) => n + c.unread, 0) + reviews.length + notes.filter((n) => n.kind === "applicants").length + readyToGrad;
  return NextResponse.json({ badge, notes: notes.slice(0, 12) });
}
