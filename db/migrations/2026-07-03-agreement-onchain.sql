-- Deal proofs (C7): the agreement's sha256 anchored via the Solana Memo program.
alter table agreements add column if not exists onchain jsonb;
