/**
 * The BUILDER TOOLBOX (Phase 6b+, founder-directed 2026-07-19).
 *
 * A person-level set of powers a builder configures ONCE on the Echo hub — their
 * MCP connections (GitHub, a database, any MCP URL) and installed build-skills —
 * that then flow into EVERY workshop they open. Set up your GitHub once; it's on
 * in every build. A workshop can still add project-only items or switch an
 * inherited one off (studio.ts owns that merge).
 *
 * Why per-user in OUR data (not the engine's shared global config): the engine is
 * one self-hosted binary serving everyone, so a "global" GitHub token would leak
 * across users. The toolbox lives here, keyed by user, and studio.ts injects each
 * user's toolbox into each of THEIR workshops at run time.
 *
 * Secrets (env/headers) live server-side and are MASKED in every view.
 */

import { db } from "../store";
import { nowISO } from "../id";
import type { BuilderToolbox } from "../types";
import { buildMcpEntry, maskMcp, catalogView, type McpInput } from "./mcpShared";
import * as SkillsMarket from "./skillsMarket";

const MAX_CONNECTIONS = 8;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "skill";

/** Get (or lazily create) a user's toolbox row. */
export function forUser(owner_id: string): BuilderToolbox {
  let tb = db.builderToolboxes.find((t) => t.owner_id === owner_id);
  if (!tb) { tb = { owner_id, mcp: [], skills: [] }; db.builderToolboxes.push(tb); }
  return tb;
}

/* -------------------------------- connections -------------------------------- */

export function addMcp(owner_id: string, input: McpInput): { ok?: boolean; error?: string } {
  const tb = forUser(owner_id);
  if ((tb.mcp ?? []).length >= MAX_CONNECTIONS) return { error: "too_many_connections" };
  const { entry, error } = buildMcpEntry(input);
  if (!entry) return { error };
  if ((tb.mcp ?? []).some((m) => m.name === entry.name)) return { error: "name_taken" };
  (tb.mcp ??= []).push(entry);
  tb.updated_at = nowISO();
  return { ok: true };
}

export function removeMcp(owner_id: string, name: string): { ok?: boolean; error?: string } {
  const tb = forUser(owner_id);
  const before = tb.mcp?.length ?? 0;
  tb.mcp = (tb.mcp ?? []).filter((m) => m.name !== name);
  if ((tb.mcp?.length ?? 0) === before) return { error: "not_connected" };
  tb.updated_at = nowISO();
  return { ok: true };
}

/* ---------------------------------- skills ---------------------------------- */

/** Install a build-skill into the toolbox — pays the creator (skills market), pins
 *  the body. It then mounts into every workshop the user runs. */
export function installSkill(owner_id: string, published_id: string): { ok?: boolean; paid?: number; error?: string } {
  const tb = forUser(owner_id);
  if ((tb.skills ?? []).some((s) => s.published_id === published_id)) return { error: "already_installed" };
  const r = SkillsMarket.installBuildSkill({ published_id, installer_id: owner_id });
  if (!r.body || !r.title) return { error: r.error ?? "install_failed" };
  (tb.skills ??= []).push({ published_id, name: slugify(r.title), title: r.title, body: r.body, at: nowISO() });
  tb.updated_at = nowISO();
  return { ok: true, paid: r.paid ?? 0 };
}

export function removeSkill(owner_id: string, published_id: string): { ok?: boolean; error?: string } {
  const tb = forUser(owner_id);
  const before = tb.skills?.length ?? 0;
  tb.skills = (tb.skills ?? []).filter((s) => s.published_id !== published_id);
  if ((tb.skills?.length ?? 0) === before) return { error: "not_installed" };
  tb.updated_at = nowISO();
  return { ok: true };
}

/* ---------------------------------- plugins ---------------------------------- */

/** Install a plugin bundle into the toolbox — pays the creator, pins the files.
 *  It then mounts into every workshop the user runs (inert components only). */
export function installPlugin(owner_id: string, published_id: string): { ok?: boolean; paid?: number; error?: string } {
  const tb = forUser(owner_id);
  if ((tb.plugins ?? []).some((p) => p.published_id === published_id)) return { error: "already_installed" };
  const r = SkillsMarket.installPlugin({ published_id, installer_id: owner_id });
  if (!r.files || !r.title) return { error: r.error ?? "install_failed" };
  (tb.plugins ??= []).push({ published_id, name: slugify(r.title), title: r.title, files: r.files, at: nowISO() });
  tb.updated_at = nowISO();
  return { ok: true, paid: r.paid ?? 0 };
}

export function removePlugin(owner_id: string, published_id: string): { ok?: boolean; error?: string } {
  const tb = forUser(owner_id);
  const before = tb.plugins?.length ?? 0;
  tb.plugins = (tb.plugins ?? []).filter((p) => p.published_id !== published_id);
  if ((tb.plugins?.length ?? 0) === before) return { error: "not_installed" };
  tb.updated_at = nowISO();
  return { ok: true };
}

/* ----------------------------------- view ----------------------------------- */

export function view(owner_id: string) {
  const tb = forUser(owner_id);
  return {
    connections: (tb.mcp ?? []).map((m) => maskMcp(m, null, "toolbox")),
    skills: (tb.skills ?? []).map((s) => ({ published_id: s.published_id, name: s.name, title: s.title, at: s.at })),
    plugins: (tb.plugins ?? []).map((p) => ({ published_id: p.published_id, name: p.name, title: p.title, files: p.files.length, at: p.at })),
    mcp_catalog: catalogView(),
    // the store to install FROM — build-skills the user hasn't got yet
    skill_store: SkillsMarket.listBuildSkills().slice(0, 20).map((p) => ({
      published_id: p.published_id, title: p.title, summary: p.summary, price_grid: p.price_grid, installs: p.installs,
      author: db.users.find((u) => u.id === p.author_id)?.username ?? "builder",
      installed: (tb.skills ?? []).some((s) => s.published_id === p.published_id),
      mine: p.author_id === owner_id,
    })),
    plugin_store: SkillsMarket.listPlugins().slice(0, 20).map((p) => ({
      published_id: p.published_id, title: p.title, summary: p.summary, price_grid: p.price_grid, installs: p.installs,
      files: SkillsMarket.pluginFiles(p).length,
      author: db.users.find((u) => u.id === p.author_id)?.username ?? "builder",
      installed: (tb.plugins ?? []).some((x) => x.published_id === p.published_id),
      mine: p.author_id === owner_id,
    })),
  };
}
