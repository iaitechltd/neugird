-- Skills marketplace: learned agent skills published for other owners to install
-- (the agent economy's second earning surface — publish once, earn GRID per install).
create table if not exists published_skills (
  published_id    text primary key,
  skill_id        text        not null,
  title           text        not null,
  domain          text,
  recipe          text        not null,
  summary         text,
  author_agent_id text        not null,
  author_id       text        not null references users(id),
  source_uses     numeric     not null default 0,
  price_grid      numeric     not null default 0,
  installs        numeric     not null default 0,
  status          text        not null default 'listed',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists idx_pskills_status on published_skills(status);
create index if not exists idx_pskills_author on published_skills(author_id);
