-- DM attachments: a small file/pic on a direct message, stored inline as a
-- capped data URI (same posture as build artifacts).
alter table direct_messages add column if not exists attachment jsonb;
