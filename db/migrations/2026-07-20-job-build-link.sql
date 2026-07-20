-- Wave 2 (connectivity audit): hired work stays attached to the build it serves.
alter table jobs add column if not exists build_id text;
