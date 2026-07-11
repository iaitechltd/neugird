/**
 * Universal messaging — 1:1 conversations between ANY two parties: human↔human,
 * human↔agent, agent↔agent. A message can carry a deal/hire OFFER, so deals are
 * struck inside the chat (the recipient accepts/declines). Agents are first-class
 * senders (via the gateway), so an agent can pitch a deal or a hire just like a
 * human. Powers the standalone /messages page.
 */

import { db } from "../store";
import { Proofs as ChainProofs } from "../chain";
import { newId, nowISO } from "../id";
import * as Jobs from "./jobs";
import * as Wallets from "./wallets";
import type { Agreement, Conversation, DirectMessage, DMAttachment, DMKind, DMOffer, DMTransfer, Settlement } from "../types";

const pairKey = (a: string, b: string) => [a, b].sort().join("|");
type Context = { label: string; href?: string };

function convos(): Conversation[] {
  return (db.conversations ??= []);
}
function msgs(): DirectMessage[] {
  return (db.directMessages ??= []);
}
function agreements(): Agreement[] {
  return (db.agreements ??= []);
}
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function partyExists(id: string): boolean {
  return db.users.some((u) => u.id === id) || db.agents.some((a) => a.agent_id === id);
}

/** Resolve a participant (user OR agent) into an identity + history card for the
 *  side panels — reputation/track-record for a user, rating/owner/jobs for an agent. */
export function resolveParty(id: string) {
  const agent = db.agents.find((a) => a.agent_id === id);
  if (agent) {
    const owner = db.users.find((u) => u.id === agent.owner_id);
    return {
      id, type: "agent" as const, name: agent.name,
      trust_tier: agent.trust_tier ?? "trusted",
      rating: agent.rating ?? agent.trading_rating ?? 0,
      earnings: agent.earnings ?? 0,
      jobs: (agent.task_history ?? []).length,
      owner_id: agent.owner_id, owner_name: owner?.username ?? agent.owner_id,
      capabilities: agent.capabilities ?? [],
      href: `/agents/${id}`,
    };
  }
  const u = db.users.find((x) => x.id === id);
  return {
    id, type: "user" as const, name: u?.username ?? id,
    bio: u?.bio ?? "",
    reputation: Math.round(Math.max(u?.pulse_score ?? 0, u?.reputation?.total ?? 0)),
    skills: u?.skills ?? [],
    grids: (u?.joined_grids ?? []).length,
    href: `/talent/${id}`,
  };
}

export function getOrCreate(a_id: string, b_id: string, context?: Context): Conversation {
  const existing = convos().find((c) => pairKey(c.participant_ids[0], c.participant_ids[1]) === pairKey(a_id, b_id));
  if (existing) {
    if (context?.label && !existing.context) existing.context = context; // backfill context if unset
    return existing;
  }
  const c: Conversation = { conversation_id: newId("conv"), participant_ids: [a_id, b_id], context: context?.label ? context : undefined, created_at: nowISO(), last_at: nowISO() };
  convos().push(c);
  return c;
}

export interface SendInput { kind?: DMKind; body?: string; offer?: Partial<DMOffer>; attachment?: { name?: string; mime?: string; data_uri?: string }; transfer?: { amount?: number }; }

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Move real USDC between any two principals (user or agent) and record the
 *  settlement. Conservation is strict: the sender is debited before the
 *  recipient is credited — agents pay FROM their service earnings and receive
 *  WITH their owner split (the same rule as every service payment). P2P
 *  transfers are deliberately excluded from "Earned" income (Social.incomeFor)
 *  — gifts are money, not merit. */
function executeTransfer(from_id: string, to_id: string, rawAmount: number): { transfer?: DMTransfer; error?: string } {
  const amount = round2(Number(rawAmount) || 0);
  if (!(amount > 0)) return { error: "invalid_amount" };
  const fromAgent = db.agents.find((a) => a.agent_id === from_id);
  const toAgent = db.agents.find((a) => a.agent_id === to_id);
  // Money always moves through OWNER wallets (the economic principal). An agent's
  // `earnings` is a display STAT that shadows the owner's wallet — spending it must
  // ALSO debit real wallet USDC, else the recipient credit below mints money.
  const fromWallet = fromAgent ? fromAgent.owner_id : from_id;
  if (!fromWallet) return { error: "invalid_sender" };
  // an agent may only send what it has EARNED (the intended cap), and the real
  // USDC comes out of its owner's wallet.
  if (fromAgent && (fromAgent.earnings ?? 0) < amount) return { error: "insufficient_usdc" };
  if (!Wallets.debitUsdc(fromWallet, amount)) return { error: "insufficient_usdc" };
  if (fromAgent) fromAgent.earnings = Math.max(0, round2((fromAgent.earnings ?? 0) - amount));
  if (toAgent) {
    const bps = Math.min(10000, Math.max(0, toAgent.owner_split_bps ?? 0));
    const ownerCut = round2((amount * bps) / 10000);
    toAgent.earnings = round2((toAgent.earnings ?? 0) + (amount - ownerCut));
    if (toAgent.owner_id) Wallets.creditUsdc(toAgent.owner_id, amount); // full amount to the principal's wallet
  } else {
    Wallets.creditUsdc(to_id, amount);
  }
  const settlement: Settlement = {
    settlement_id: newId("setl"), payer_id: from_id, payee: to_id,
    resource: "dm_transfer", amount, asset: "USDC", network: "neugrid-ledger",
    scheme: "exact", proof: `dmx:${newId("n")}`, status: "settled", created_at: nowISO(),
  };
  (db.settlements ??= []).push(settlement);
  return { transfer: { amount, asset: "USDC", settlement_id: settlement.settlement_id, status: "settled" } };
}

/** Attachment guard: mime allowlist + ~512KB decoded cap. Rejecting here keeps
 *  every door (UI, gateway) behind the same rule. */
const ATTACH_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "application/pdf", "text/plain", "text/csv", "application/json", "application/zip"]);
const ATTACH_MAX_B64 = 700_000; // ≈512KB decoded
function cleanAttachment(a?: { name?: string; mime?: string; data_uri?: string }): { attachment?: DMAttachment; error?: string } {
  if (!a?.data_uri) return {};
  const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(a.data_uri);
  if (!m) return { error: "bad_attachment" };
  const mime = m[1].toLowerCase();
  if (!ATTACH_MIMES.has(mime)) return { error: "attachment_type" };
  if (m[2].length > ATTACH_MAX_B64) return { error: "attachment_too_big" };
  const name = (a.name ?? "file").replace(/[^\w. ()\[\]-]/g, "").slice(0, 80) || "file";
  return { attachment: { name, mime, size: Math.floor((m[2].length * 3) / 4), data_uri: a.data_uri } };
}

export function send(conversation_id: string, from_id: string, input: SendInput): { message?: DirectMessage; error?: string } {
  const c = convos().find((x) => x.conversation_id === conversation_id);
  if (!c) return { error: "not_found" };
  if (!c.participant_ids.includes(from_id)) return { error: "not_participant" };
  const kind: DMKind = input.kind === "deal" || input.kind === "hire" || input.kind === "transfer" ? input.kind : "text";

  // in-chat USDC transfer — settles NOW, to the other participant, then the
  // message records it (a failed transfer sends nothing)
  if (kind === "transfer") {
    const to_id = c.participant_ids.find((p) => p !== from_id);
    if (!to_id) return { error: "no_recipient" };
    const t = executeTransfer(from_id, to_id, input.transfer?.amount ?? 0);
    if (t.error) return { error: t.error };
    const m: DirectMessage = {
      message_id: newId("dm"), conversation_id, from_id, kind,
      body: (input.body ?? "").trim().slice(0, 500), transfer: t.transfer,
      read_by: [from_id], created_at: nowISO(),
    };
    msgs().push(m);
    c.last_at = m.created_at;
    return { message: m };
  }

  let offer: DMOffer | undefined;
  if (kind !== "text") {
    const o = input.offer ?? {};
    if (!(o.terms ?? "").trim()) return { error: "terms_required" };
    offer = {
      offer_kind: kind === "hire" ? "hire" : "deal",
      amount: Math.max(0, Number(o.amount) || 0),
      asset: (o.asset || "USDC").slice(0, 12),
      terms: (o.terms ?? "").trim().slice(0, 500),
      success_metric: o.success_metric ? o.success_metric.trim().slice(0, 200) : undefined,
      status: "pending",
    };
  }
  const att = kind === "text" ? cleanAttachment(input.attachment) : {};
  if (att.error) return { error: att.error };
  const body = (input.body ?? "").trim().slice(0, 2000);
  if (kind === "text" && !body && !att.attachment) return { error: "empty" };
  const m: DirectMessage = { message_id: newId("dm"), conversation_id, from_id, kind, body, offer, attachment: att.attachment, read_by: [from_id], created_at: nowISO() };
  msgs().push(m);
  c.last_at = m.created_at;
  return { message: m };
}

/** Start (or reuse) a conversation with `to_id` and send the first message. */
export function sendTo(from_id: string, to_id: string, input: SendInput & { context?: Context }): { conversation?: Conversation; message?: DirectMessage; error?: string } {
  if (from_id === to_id) return { error: "self" };
  if (!partyExists(to_id)) return { error: "no_recipient" };
  const c = getOrCreate(from_id, to_id, input.context);
  const r = send(c.conversation_id, from_id, input);
  if (r.error) return { error: r.error };
  return { conversation: c, message: r.message };
}

/** Open (get-or-create) a conversation without sending — for deep-links (?to=). */
export function open(a_id: string, b_id: string, context?: Context): { conversation?: Conversation; error?: string } {
  if (a_id === b_id) return { error: "self" };
  if (!partyExists(b_id)) return { error: "no_recipient" };
  return { conversation: getOrCreate(a_id, b_id, context) };
}

/** The recipient of an offer accepts / declines it (the sender cannot). */
export function resolveOffer(message_id: string, by_id: string, accept: boolean): { message?: DirectMessage; error?: string } {
  const m = msgs().find((x) => x.message_id === message_id);
  if (!m || !m.offer) return { error: "not_found" };
  const c = convos().find((x) => x.conversation_id === m.conversation_id);
  if (!c || !c.participant_ids.includes(by_id)) return { error: "not_participant" };
  if (m.from_id === by_id) return { error: "not_recipient" };
  if (m.offer.status !== "pending") return { error: "already_resolved" };
  // "Deploy from here": an accepted HIRE becomes a real ESCROWED Job — the hirer's
  // money locks before the accept stands (no unfunded hires), the accepter is
  // assigned. Deals stay in-chat agreements (a P2P deal is the accepted offer).
  if (accept && m.offer.offer_kind === "hire") {
    const job = Jobs.createJob({
      created_by: m.from_id,
      title: m.offer.terms.slice(0, 80),
      description: `Hired via Messages.${m.offer.success_metric ? ` Success: ${m.offer.success_metric}.` : ""}`,
      reward_amount: m.offer.amount,
      reward_token: m.offer.asset,
      context: "talent_contract",
    });
    const esc = Jobs.fundJobEscrow(job.job_id, m.from_id);
    if (esc.error) {
      db.jobs.splice(db.jobs.findIndex((j) => j.job_id === job.job_id), 1); // unwind the shell job
      return { error: esc.error }; // offer stays pending — the hirer can top up, the acceptor retry
    }
    job.assignee_id = by_id;
    // an agent acceptor routes its payout to its OWNER at review time
    job.assignee_type = db.agents.some((a) => a.agent_id === by_id) ? "agent" : "user";
    job.status = "assigned";
    m.offer.status = "accepted";
    m.offer.resolved_at = nowISO();
    m.offer.result_ref = job.job_id;
    m.offer.result_kind = "job";
    return { message: m };
  }
  m.offer.status = accept ? "accepted" : "declined";
  m.offer.resolved_at = nowISO();
  if (accept && m.offer.offer_kind === "deal") {
    // a struck deal → a recorded, disclosed agreement (both parties, on the record)
    const ag: Agreement = {
      agreement_id: newId("agr"), from_id: m.from_id, to_id: by_id,
      amount: m.offer.amount, asset: m.offer.asset, terms: m.offer.terms,
      success_metric: m.offer.success_metric, status: "active",
      source_message_id: m.message_id, created_at: nowISO(),
    };
    agreements().push(ag);
    void ChainProofs.anchor(ag); // chain mirror — the deal's sha256, timestamped on-chain
    m.offer.result_ref = ag.agreement_id;
    m.offer.result_kind = "agreement";
  }
  return { message: m };
}

/** Struck deals + hire-jobs between two parties — the "what we've transacted" recap. */
export function dealsBetween(a_id: string, b_id: string) {
  const ags = agreements()
    .filter((g) => (g.from_id === a_id && g.to_id === b_id) || (g.from_id === b_id && g.to_id === a_id))
    .map((g) => ({ id: g.agreement_id, kind: "deal" as const, amount: g.amount, asset: g.asset, terms: g.terms, status: g.status }));
  const jobs = db.jobs
    .filter((j) => j.context === "talent_contract" && ((j.created_by === a_id && j.assignee_id === b_id) || (j.created_by === b_id && j.assignee_id === a_id)))
    .map((j) => ({ id: j.job_id, kind: "hire" as const, amount: j.reward_amount, asset: j.reward_token, terms: j.title, status: j.status }));
  return [...ags, ...jobs];
}

/** Full thread for a participant (marks their messages read). Returns undefined
 *  if the viewer isn't a participant (privacy). */
export function thread(conversation_id: string, viewer_id: string) {
  const c = convos().find((x) => x.conversation_id === conversation_id);
  if (!c || !c.participant_ids.includes(viewer_id)) return undefined;
  const ms = msgs().filter((m) => m.conversation_id === conversation_id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  for (const m of ms) { m.read_by ??= []; if (!m.read_by.includes(viewer_id)) m.read_by.push(viewer_id); }
  const otherId = c.participant_ids.find((id) => id !== viewer_id) ?? viewer_id;
  return {
    conversation_id,
    counterparty: resolveParty(otherId),
    context: c.context ?? null,
    deals: dealsBetween(viewer_id, otherId),
    messages: ms.map((m) => ({
      message_id: m.message_id, from_id: m.from_id, mine: m.from_id === viewer_id,
      from_name: resolveParty(m.from_id).name, kind: m.kind, body: m.body, offer: m.offer,
      attachment: m.attachment, transfer: m.transfer,
      ago: ago(m.created_at), created_at: m.created_at,
    })),
  };
}

/** A party's conversation list (newest first), enriched with counterparty + last msg. */
export function listConversations(user_id: string) {
  return convos()
    .filter((c) => c.participant_ids.includes(user_id))
    .map((c) => {
      const otherId = c.participant_ids.find((id) => id !== user_id) ?? user_id;
      const ms = msgs().filter((m) => m.conversation_id === c.conversation_id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      const last = ms[0];
      return {
        conversation_id: c.conversation_id,
        counterparty: resolveParty(otherId),
        context: c.context ?? null,
        last_text: last ? (last.kind === "text" ? last.body : last.kind === "hire" ? "Hire offer" : "Deal offer") : "",
        last_ago: last ? ago(last.created_at) : "",
        unread: ms.filter((m) => m.from_id !== user_id && !(m.read_by ?? []).includes(user_id)).length,
        pending_offer: ms.some((m) => m.offer && m.offer.status === "pending" && m.from_id !== user_id),
        last_at: c.last_at,
      };
    })
    .sort((a, b) => Date.parse(b.last_at) - Date.parse(a.last_at));
}

export function unreadCount(user_id: string): number {
  const myConvos = new Set(convos().filter((c) => c.participant_ids.includes(user_id)).map((c) => c.conversation_id));
  return msgs().filter((m) => myConvos.has(m.conversation_id) && m.from_id !== user_id && !(m.read_by ?? []).includes(user_id)).length;
}
