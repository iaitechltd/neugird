-- GenesisX raises mirror to the real milestone_vault program: the on-chain ref.
alter table proposals add column if not exists onchain jsonb;
