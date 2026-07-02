/**
 * GET /api/notifications — the current user's REAL actionable signals, for the
 * header bell: unread DMs, deliveries awaiting their review, applicants waiting on
 * their campaign postings, and open protocol votes. `badge` counts the actionable
 * ones (messages + reviews + applicant queues).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { Messaging, Governance } from "@/lib/modules";
import { getCurrentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Note = { kind: "message" | "review" | "applicants" | "governance"; text: string; sub?: string; href: string };

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

  // 4 · open protocol votes (informational)
  const openGov = Governance.listProposals().filter((p) => p.status === "open").length;
  if (openGov > 0) notes.push({ kind: "governance", text: `${openGov} protocol proposal${openGov === 1 ? "" : "s"} open for voting`, href: "/governance" });

  const badge = convos.reduce((n, c) => n + c.unread, 0) + reviews.length + notes.filter((n) => n.kind === "applicants").length;
  return NextResponse.json({ badge, notes: notes.slice(0, 10) });
}
