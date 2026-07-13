-- Ventures Phase 2 — the approval gate.
--
-- When require_approval is on (the safe default), a company's big/irreversible actions
-- (shipping code via Echo, publishing to the wire) don't fire during a cycle — the crew
-- drafts the work and files a pending VentureApproval instead, which the owner approves or
-- declines on Mission Control. The approval payload rides in the existing `approvals` jsonb;
-- this column persists the per-company autonomy toggle.
--
-- Idempotent: safe to re-run.
alter table ventures add column if not exists require_approval boolean default true;
