-- Grid-scoped wire: feed posts can belong to a community Grid's wire (null = global).
alter table feed_posts add column if not exists grid_id text;
