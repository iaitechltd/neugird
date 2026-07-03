-- GridX marketplace loop: product pricing + verified reviews + real usage events.
alter table products add column if not exists price_usdc numeric;

create table if not exists product_reviews (
  review_id  text primary key,
  product_id text        not null references products(product_id) on delete cascade,
  user_id    text        not null,
  rating     integer     not null,
  text       text,
  created_at timestamptz not null default now()
);
create index if not exists product_reviews_product_idx on product_reviews(product_id);

create table if not exists product_events (
  event_id   text primary key,
  product_id text        not null references products(product_id) on delete cascade,
  user_id    text        not null,
  kind       text        not null,
  at         timestamptz not null default now()
);
create index if not exists product_events_product_idx on product_events(product_id);
