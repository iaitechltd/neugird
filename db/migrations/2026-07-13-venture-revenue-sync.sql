-- Ventures self-funding loop — persist the revenue high-water mark.
--
-- A venture's linked product earns real USDC; a governable share of the NEW revenue
-- since the last sync is reinvested into the treasury as GRID (via the GRID/USDC AMM).
-- `revenue_synced_usdc` is the high-water mark of product USDC already recognized, so
-- the loop never double-counts across restarts. Without this column the mark would
-- reset to 0 on every prod reload and re-pull the product's entire revenue history.
--
-- Idempotent: safe to re-run.
alter table ventures add column if not exists revenue_synced_usdc numeric default 0;
