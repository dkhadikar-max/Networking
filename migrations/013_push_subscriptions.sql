-- Moved from supabase/migrations/007_push_subscriptions.sql -- that directory
-- was a second, unsynced migrations location; consolidating everything into
-- this one. Already applied to production (verified live 2026-07-31).

create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references users(id) on delete cascade,
  endpoint     text not null,
  subscription jsonb not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
