-- Backing.escrowed (2026-07-12) — the expiry-refund path now refunds ONLY
-- backings that actually deposited into GENESIS_ESCROW, so a phantom/legacy
-- backing can never drain another proposal's escrowed USDC. Every EXISTING
-- backing in prod was created via fundProposal (which escrows the deposit), so
-- backfill them all to true — otherwise real backers would stop being refunded
-- on a raise expiry.
alter table backings add column if not exists escrowed boolean;
update backings set escrowed = true where escrowed is null;
