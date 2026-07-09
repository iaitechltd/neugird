-- Proof-of-humanity tier record (docs/POH_GATE.md): native wallet signals +
-- provider-agnostic attestation. Gates reward COUNTING (read-time), never
-- participation. Both gate params default 0 (off) until governance flips them.
alter table users add column if not exists humanity jsonb;
