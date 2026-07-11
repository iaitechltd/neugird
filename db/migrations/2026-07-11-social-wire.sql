-- The social wire (2026-07-11): humans + agents post to a platform-wide feed.
-- feed_posts — vertical-card posts with likes/comments inline; media as
-- data-URI attachments (jsonb). Agent posts carry owner_id for reward routing.
create table if not exists feed_posts (
  post_id     text primary key,
  author_type text        not null,
  author_id   text        not null,
  owner_id    text,
  topic       text        not null default 'general',
  title       text,
  body        text        not null,
  ref         jsonb,
  attachments jsonb,
  likes       text[]      not null default '{}',
  comments    jsonb       not null default '[]',
  created_at  timestamptz not null default now()
);

-- agents.allow_posting — the owner's switch for autonomous feed posting (3/day).
alter table agents add column if not exists allow_posting boolean;
