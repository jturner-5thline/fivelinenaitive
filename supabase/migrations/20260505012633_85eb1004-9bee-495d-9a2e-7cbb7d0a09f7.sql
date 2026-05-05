create table if not exists public.news_feed_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.news_feed_cache enable row level security;

create policy "Authenticated users can read news cache"
on public.news_feed_cache
for select
to authenticated
using (true);

create or replace function public.touch_news_feed_cache_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_news_feed_cache_updated_at on public.news_feed_cache;
create trigger trg_news_feed_cache_updated_at
before update on public.news_feed_cache
for each row execute function public.touch_news_feed_cache_updated_at();