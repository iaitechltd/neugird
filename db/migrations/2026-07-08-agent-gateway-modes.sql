-- Agent gateway safety modes: read-only mode + write rate limit, enforced on
-- every external gateway write (agentAuth.authorizeWrite).
alter table agents add column if not exists gateway_mode text;
alter table agents add column if not exists rate_limit_per_hour numeric;
