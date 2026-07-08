-- Starter path (onboarding): non-transferable Echo compute credit on wallets.
-- Also closes a pre-existing round-trip gap: pay_fees_in_grid was never
-- persisted (TS-optional field with no column — the fee-pref toggle silently
-- reset on a Postgres reload).
alter table wallets add column if not exists pay_fees_in_grid boolean;
alter table wallets add column if not exists starter_credit numeric;
