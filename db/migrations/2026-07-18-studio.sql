-- Echo Studio workspaces (docs/ECHO_STUDIO.md Phase 2) — additive, idempotent.
create table if not exists studio_workspaces (
  workspace_id       text primary key,
  owner_id           text        not null,
  name               text        not null,
  status             text        not null default 'idle',
  build_id           text,
  engine_session_id  text,
  turns              jsonb       default '[]',
  checkpoints        jsonb       default '[]',
  trail              jsonb       default '[]',
  trail_sha          text,
  progress           text,
  spent_grid         numeric     default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
