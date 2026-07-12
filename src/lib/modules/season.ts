/**
 * Seasons — the Hyperliquid/Blur growth loop made visible. A numbered window with
 * a snapshot deadline: a ticking clock + a leaderboard people race up. Points =
 * the reward allocation you EARN inside the window (Rewards.pointsSince), so the
 * season scoreboard is the same merit ledger, scoped to now. Pre-token, this is
 * how attention is manufactured — a clock and a scoreboard, not a token.
 *
 * Singleton `db.season` (out of seed()/normalize like gridPool/tge/params).
 */

import { db } from "../store";
import { nowISO } from "../id";
import * as Rewards from "./rewards";
import * as Params from "./params";

/** Lazily open Season 0 on first access. It opens MID-WINDOW (backdated ~40% of
 *  its length) so the genesis season already counts recent contribution — the
 *  board launches populated and early builders get a head start, with a real
 *  countdown to the snapshot. Later seasons start fresh at the prior snapshot. */
function state(): { number: number; started_at: string; ends_at: string } {
  if (!db.season) {
    const days = Params.get("season_days") || 45;
    const elapsed = Math.round(days * 0.4); // already ~40% in — captures recent merit
    const started = Date.now() - elapsed * 86_400_000;
    db.season = { number: 0, started_at: new Date(started).toISOString(), ends_at: new Date(started + days * 86_400_000).toISOString() };
  }
  return db.season;
}

export interface SeasonView {
  number: number;
  started_at: string;
  ends_at: string;
  days_left: number;
  hours_left: number;
  pct_elapsed: number; // 0..100
  ended: boolean;
}

/** The current season with a live countdown. */
export function current(): SeasonView {
  const s = state();
  const start = Date.parse(s.started_at);
  const end = Date.parse(s.ends_at);
  const now = Date.now();
  const total = Math.max(1, end - start);
  const left = Math.max(0, end - now);
  return {
    number: s.number,
    started_at: s.started_at,
    ends_at: s.ends_at,
    days_left: Math.floor(left / 86_400_000),
    hours_left: Math.floor(left / 3_600_000),
    pct_elapsed: Math.min(100, Math.round(((now - start) / total) * 100)),
    ended: now >= end,
  };
}

/** The season leaderboard — everyone ranked by points earned this window. */
export function leaderboard(limit = 25): { rank: number; id: string; username: string; points: number }[] {
  const s = state();
  return Rewards.leaderboardSince(s.started_at, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

/** One user's standing this season (rank out of everyone who's scored). */
export function standing(user_id: string): { points: number; rank: number | null; racers: number } {
  const s = state();
  const board = Rewards.leaderboardSince(s.started_at, 100_000);
  const idx = board.findIndex((x) => x.id === user_id);
  const points = idx >= 0 ? board[idx].points : Rewards.pointsSince(user_id, s.started_at);
  return { points, rank: idx >= 0 ? idx + 1 : null, racers: board.length };
}

/** Points-per-day over the window (for the season chart). */
export function cadence(days = 14): { day: string; points: number }[] {
  const out: { day: string; points: number }[] = [];
  const evs = (db.pulseEvents ?? []).filter((e) => e.weight > 0 && !e.reward_excluded);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const pts = evs.filter((e) => e.timestamp.slice(0, 10) === d).reduce((s, e) => s + Math.max(0, e.weight) * Rewards.GRID_PER_PULSE, 0);
    out.push({ day: d.slice(5), points: pts });
  }
  return out;
}
