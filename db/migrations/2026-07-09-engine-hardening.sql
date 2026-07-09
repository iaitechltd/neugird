-- Trading-engine hardening (docs/TRADING_ENGINE_AUDIT.md §6): resting orders
-- escrow their funds on placement (F7). The insurance fund and the two new
-- governable params live in existing singletons — no further DDL needed.
alter table orders add column if not exists escrow_quote numeric;
alter table orders add column if not exists escrow_base  numeric;
