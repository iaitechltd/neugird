-- Persistence hardening (2026-07-11) — audit fixes for silent Postgres-snapshot
-- failures and field-drops. Prod runs Postgres, so these ALTERs bring the live
-- DB in line with schema.sql + the store-postgres SPECs.
--
-- NOTE: two related NOT-NULL land-mines are CODE-only fixes (no schema change):
--   gov_votes.released      — governance.vote() now sets released:false
--   listing_stakes.fees_earned — staking.stakeForListing() now sets fees_earned:0
-- Their columns already carry a default; the bug was the setter emitting an
-- explicit NULL, which bypasses the default and fails the whole snapshot txn.

-- 1) Binding governance survives a restart: a passed proposal's ENACTED action
--    was written by the module but stored nowhere → governance silently became
--    advisory after any Postgres reload.
alter table gov_proposals add column if not exists action jsonb;
alter table gov_proposals add column if not exists executed boolean;
alter table gov_proposals add column if not exists execution_note text;

-- 2) Access-gated SubGrids: the gate (private / min-reputation / min-GRID) was
--    dropped on round-trip → gated teams reverted to open-join after a restart.
alter table subgrids add column if not exists access text;
alter table subgrids add column if not exists min_reputation numeric;
alter table subgrids add column if not exists min_grid numeric;

-- 3) Fraud-slash record: slashStakes() writes these but they weren't persisted →
--    the fraud record + slashed rollup vanished on a round-trip.
alter table listing_stakes add column if not exists slashed boolean;
alter table listing_stakes add column if not exists slashed_at timestamptz;
alter table listing_stakes add column if not exists slash_reason text;

-- 4) Following an AGENT (agents are first-class followable) violated the
--    followee_id → users(id) foreign key, which failed the ENTIRE snapshot
--    transaction: one agent-follow broke ALL persistence until a restart.
--    Followees can be users OR agents, so drop the FK (agents aren't in users).
alter table follows drop constraint if exists follows_followee_id_fkey;
