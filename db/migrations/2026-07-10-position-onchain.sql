-- T2 perp-vault mirror (docs/TRADING_ENGINE_AUDIT.md §5): a position's REAL
-- on-chain margin/settlement record — {position, program, cluster, txs[]}.
alter table positions add column if not exists onchain jsonb;
