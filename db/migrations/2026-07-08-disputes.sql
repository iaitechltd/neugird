-- Staked-evaluator dispute layer: a worker can contest a rejected escrowed job;
-- a reputation-staked evaluator panel adjudicates, binding on escrow + reputation.
alter table jobs add column if not exists dispute_deadline timestamptz;

create table if not exists disputes (
  dispute_id   text primary key,
  subject_type text        not null,
  subject_id   text        not null,
  raised_by    text        not null references users(id),
  against      text        not null references users(id),
  amount       numeric,
  reason       text        not null,
  status       text        not null default 'open',
  votes        jsonb       not null default '[]',
  quorum       integer     not null default 3,
  outcome      jsonb,
  resolution   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists idx_disputes_status  on disputes(status);
create index if not exists idx_disputes_subject on disputes(subject_id);
