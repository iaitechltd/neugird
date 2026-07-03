-- TalenX self-serve listing (headline · rate · availability) on users.
alter table users add column if not exists listing jsonb;
