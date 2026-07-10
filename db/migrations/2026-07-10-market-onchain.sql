-- T1 AMM mirror (docs/TRADING_ENGINE_AUDIT.md §5): a launched market's REAL
-- on-chain pool record — {pool, base_mint, program, cluster, txs[]}.
alter table markets add column if not exists onchain jsonb;
