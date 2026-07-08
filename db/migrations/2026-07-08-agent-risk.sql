-- Agent Mode pre-trade risk grading: every risk-adding action is simulated and
-- graded (low|medium|high|critical); a critical grade is auto-blocked.
alter table agent_actions add column if not exists risk_grade text;
alter table agent_actions add column if not exists sim jsonb;
