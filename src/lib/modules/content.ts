/**
 * Content hub — a Grid's living feed: members post updates; admins pin
 * announcements. Posts are role-tagged (founder / member) like chat, so the
 * Grid reads as an active network rather than a static description. Pinned posts
 * surface first. Likes are social proof; authors + admins can delete.
 */

import { db } from "../store";
import { newId, nowISO } from "../id";
import type { GridPost } from "../types";

const MAX_BODY = 2000;
const MAX_TITLE = 120;

function store(): GridPost[] {
  return (db.gridPosts ??= []);
}

function gridOf(grid_id: string) {
  return db.grids.find((g) => g.grid_id === grid_id);
}

/** Owner or a GridFounder/Admin role-holder may pin / delete any post. */
function isGridAdmin(grid_id: string, user_id: string): boolean {
  if (gridOf(grid_id)?.owner_id === user_id) return true;
  const role = db.users.find((u) => u.id === user_id)?.roles_by_grid?.find((r) => r.grid_id === grid_id)?.role;
  return role === "GridFounder" || role === "Admin";
}

/** The author's standing in this Grid: founder / member / guest. */
function roleOf(grid_id: string, user_id: string): string {
  if (gridOf(grid_id)?.owner_id === user_id) return "founder";
  const u = db.users.find((x) => x.id === user_id);
  if (u?.roles_by_grid?.find((r) => r.grid_id === grid_id)?.role === "GridFounder") return "founder";
  if (u?.joined_grids?.includes(grid_id)) return "member";
  return "guest";
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function create(grid_id: string, author_id: string, input: { title?: string; body: string }): { post?: GridPost; error?: string } {
  const body = (input.body ?? "").trim();
  if (!body) return { error: "empty" };
  const grid = gridOf(grid_id);
  if (!grid) return { error: "no_grid" };
  const u = db.users.find((x) => x.id === author_id);
  if (grid.owner_id !== author_id && !u?.joined_grids?.includes(grid_id)) return { error: "not_member" };
  const post: GridPost = {
    post_id: newId("post"),
    grid_id,
    author_id,
    title: (input.title ?? "").trim().slice(0, MAX_TITLE) || undefined,
    body: body.slice(0, MAX_BODY),
    pinned: false,
    likes: [],
    created_at: nowISO(),
  };
  store().push(post);
  return { post };
}

/** Toggle a post's pinned state (admin/founder only). */
export function pin(post_id: string, user_id: string): { post?: GridPost; error?: string } {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return { error: "not_found" };
  if (!isGridAdmin(p.grid_id, user_id)) return { error: "not_admin" };
  p.pinned = !p.pinned;
  return { post: p };
}

export function like(post_id: string, user_id: string): { post?: GridPost; error?: string } {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return { error: "not_found" };
  p.likes ??= [];
  const i = p.likes.indexOf(user_id);
  if (i >= 0) p.likes.splice(i, 1);
  else p.likes.push(user_id);
  return { post: p };
}

/** Delete a post (its author, or a Grid admin/founder). */
export function remove(post_id: string, user_id: string): { ok?: boolean; error?: string } {
  const p = store().find((x) => x.post_id === post_id);
  if (!p) return { error: "not_found" };
  if (p.author_id !== user_id && !isGridAdmin(p.grid_id, user_id)) return { error: "not_allowed" };
  db.gridPosts = store().filter((x) => x.post_id !== post_id);
  return { ok: true };
}

/** A Grid's feed — pinned first, then newest, enriched with author + role + likes. */
export function listFor(grid_id: string, me?: string) {
  return store()
    .filter((p) => p.grid_id === grid_id)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((p) => {
      const u = db.users.find((x) => x.id === p.author_id);
      return {
        post_id: p.post_id,
        author_id: p.author_id,
        username: u?.username ?? p.author_id,
        role: roleOf(grid_id, p.author_id),
        title: p.title,
        body: p.body,
        pinned: !!p.pinned,
        likes: (p.likes ?? []).length,
        liked: !!me && (p.likes ?? []).includes(me),
        can_manage: !!me && (p.author_id === me || isGridAdmin(grid_id, me)),
        can_pin: !!me && isGridAdmin(grid_id, me),
        ago: ago(p.created_at),
        created_at: p.created_at,
      };
    });
}
