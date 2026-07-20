-- Founder token allocation (connectivity audit 2026-07-20, Wave 1):
-- a governable vested share of a project token now belongs to its maker.
alter table markets add column if not exists founder_allocation jsonb;
