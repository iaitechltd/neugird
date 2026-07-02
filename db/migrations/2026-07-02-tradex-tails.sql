-- TradeX tails (2026-07-02): apply to the LIVE prod DB (the base schema.sql only
-- creates-if-missing, so existing tables need these ALTERs).
--   gcloud storage cp db/migrations/2026-07-02-tradex-tails.sql gs://neugrid-io-sql/mig.sql
--   gcloud sql import sql neugrid-db gs://neugrid-io-sql/mig.sql --database=neugrid

-- graduation moment (holder notifications)
alter table markets   add column if not exists stage_changed_at  timestamptz;
alter table markets   add column if not exists fraud_flags       jsonb;

-- position trigger/funding state that predated the schema (was silently dropped
-- on round-trip) + the new trailing stop
alter table positions add column if not exists funding_paid      numeric;
alter table positions add column if not exists last_funding_at   timestamptz;
alter table positions add column if not exists take_profit       numeric;
alter table positions add column if not exists stop_loss         numeric;
alter table positions add column if not exists trailing_stop_pct numeric;
alter table positions add column if not exists trail_anchor      numeric;
alter table positions add column if not exists close_reason      text;

-- perp limit entries resting in the order book
alter table orders    add column if not exists kind       text;
alter table orders    add column if not exists pside      text;
alter table orders    add column if not exists collateral numeric;
alter table orders    add column if not exists leverage   numeric;

-- entry-time triggers carried on resting perp entries
alter table orders    add column if not exists take_profit       numeric;
alter table orders    add column if not exists stop_loss         numeric;
alter table orders    add column if not exists trailing_stop_pct numeric;
