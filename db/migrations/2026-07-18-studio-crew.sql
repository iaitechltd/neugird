-- Echo Studio Phases 3-5: the crew's owner-gated surfaces + workspace skills.
-- pending_fix   — the chief's corrective brief awaiting the owner's approval
-- pending_post  — the content seat's drafted launch post awaiting the owner
-- skills        — build-skills installed into this workspace (version-pinned)
-- hired         — escrowed Jobs opened from the room (HIRE HELP)
alter table studio_workspaces add column if not exists pending_fix  jsonb;
alter table studio_workspaces add column if not exists pending_post jsonb;
alter table studio_workspaces add column if not exists skills       jsonb;
alter table studio_workspaces add column if not exists hired        jsonb;
-- Phase 6a — full engine power:
-- rules          — the workshop's AGENTS.md (the engine obeys it every run)
-- memory_enabled — cross-session engine memory toggle
-- spent_usd      — cumulative REAL dollar cost (the engine's own per-run reports)
alter table studio_workspaces add column if not exists rules          text;
alter table studio_workspaces add column if not exists memory_enabled boolean;
alter table studio_workspaces add column if not exists spent_usd      numeric;
-- Phase 6b — MCP connections per workshop
alter table studio_workspaces add column if not exists mcp jsonb;
-- Phase 6b+ — the per-user builder toolbox (hub-level MCP + skills)
create table if not exists builder_toolboxes (
  owner_id   text primary key,
  mcp        jsonb,
  skills     jsonb,
  updated_at timestamptz
);
-- workshops can opt an inherited toolbox item OUT for one project
alter table studio_workspaces add column if not exists toolbox_off jsonb;
-- Phase 6c — plugin bundles (inert components) on workshops + the toolbox
alter table studio_workspaces add column if not exists plugins jsonb;
alter table builder_toolboxes add column if not exists plugins jsonb;
alter table studio_workspaces add column if not exists toolset_sig text;
