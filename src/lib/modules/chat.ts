/**
 * Chat — a per-Grid community discussion thread, surfaced on the market terminal
 * (Trade | Chat) and the Grid page. Messages are tagged with the author's role +
 * reputation so credible voices (founder / backer / holder) stand out — the
 * social-proof layer of the thesis, alongside Provenance.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import type { Message } from "../types";

const MAX_LEN = 500;

function store(): Message[] {
  return (db.messages ??= []);
}

/** The author's standing in this project: founder / backer / holder / member / guest. */
export function roleOf(grid_id: string, user_id: string): string {
  const grid = db.grids.find((g) => g.grid_id === grid_id);
  if (grid?.owner_id === user_id) return "founder";
  const proposalId = grid?.spawned_from?.proposal_id;
  if (proposalId && db.backings.some((b) => b.round_id === proposalId && b.backer_id === user_id && !b.refunded)) return "backer";
  const market = db.markets.find((m) => m.grid_id === grid_id);
  if (market && db.holdings.some((h) => h.market_id === market.market_id && h.user_id === user_id && h.base > 1e-9)) return "holder";
  if (db.users.find((u) => u.id === user_id)?.joined_grids?.includes(grid_id)) return "member";
  return "guest";
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function post(grid_id: string, user_id: string, text: string): { message?: Message; error?: string } {
  const t = (text ?? "").trim();
  if (!t) return { error: "empty" };
  if (!db.grids.find((g) => g.grid_id === grid_id)) return { error: "no_grid" };
  const msg: Message = { message_id: newId("msg"), grid_id, user_id, text: t.slice(0, MAX_LEN), likes: [], created_at: nowISO() };
  store().push(msg);
  return { message: msg };
}

export function like(message_id: string, user_id: string): { message?: Message; error?: string } {
  const m = store().find((x) => x.message_id === message_id);
  if (!m) return { error: "not_found" };
  m.likes ??= [];
  const i = m.likes.indexOf(user_id);
  if (i >= 0) m.likes.splice(i, 1);
  else m.likes.push(user_id);
  return { message: m };
}

/** Recent messages for a Grid, enriched with author identity + reputation + role. */
export function listFor(grid_id: string, me?: string, limit = 80) {
  return store()
    .filter((m) => m.grid_id === grid_id)
    .slice(-limit)
    .map((m) => {
      const u = db.users.find((x) => x.id === m.user_id);
      return {
        message_id: m.message_id,
        user_id: m.user_id,
        username: u?.username ?? m.user_id,
        reputation: Math.max(u?.pulse_score ?? 0, u?.reputation?.total ?? 0),
        role: roleOf(grid_id, m.user_id),
        text: m.text,
        likes: (m.likes ?? []).length,
        liked: !!me && (m.likes ?? []).includes(me),
        ago: ago(m.created_at),
        created_at: m.created_at,
      };
    });
}
