-- Starter-build allocation exclusion: a Pulse event can earn reputation but NOT
-- GRID allocation (subsidized work, e.g. an Echo build paid with the starter
-- credit). The reward ledger (rewards.ts beneficiaryOf) skips reward_excluded
-- events; reputation (pulse.applyWeight) is unaffected.
alter table pulse_events add column if not exists reward_excluded boolean;
