-- Referral system: signup binding + verify-on-first-work timestamp.
alter table users add column if not exists referred_by text;
alter table users add column if not exists referral_verified_at timestamptz;
