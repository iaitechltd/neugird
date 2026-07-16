-- Ventures: durable per-cycle report archive (the complete, uncapped record the owner
-- audits — the `log` column stays a short recent activity feed). Additive + nullable.
alter table ventures add column if not exists reports jsonb default '[]';
