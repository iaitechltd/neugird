-- Ventures — agent companies (a builder owns a CEO-orchestrated team of specialist
-- agents that runs a linked product). Adds the `ventures` collection to Postgres so
-- the feature persists in prod (it lived in memory only until now).
--
-- Nested collections (seats/objectives/log/…) are jsonb; optional fields are nullable.
-- owner_id is intentionally NOT FK'd (new collection; the app guarantees a real owner)
-- so a stray reference can never break the whole store's persist.
-- Idempotent: safe to re-run.
create table if not exists ventures (
  venture_id         text primary key,
  owner_id           text        not null,
  name               text        not null,
  mission            text        not null default '',
  template           text,
  build_id           text,
  status             text        not null default 'active',
  treasury_id        text        not null,
  ceo_agent_id       text,
  seats              jsonb       default '[]',
  objectives         jsonb       default '[]',
  contributor_splits jsonb       default '[]',
  approvals          jsonb       default '[]',
  cycles             numeric     not null default 0,
  revenue_grid       numeric     default 0,
  spent_grid         numeric     default 0,
  log                jsonb       default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
