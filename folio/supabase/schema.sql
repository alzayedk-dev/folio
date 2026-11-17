-- Folio database schema
-- Every table has row-level security (RLS) turned on.
-- Private tables: only the owner can read or change their rows.
-- Shared market-data tables: any signed-in user can read; only the server (service role) can write.

-- ---------------------------------------------------------------
-- Profiles (one per user, created automatically at sign-up)
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  full_name text check (char_length(full_name) <= 100),
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  is_public boolean not null default false,
  notify_inapp boolean not null default true,
  notify_email boolean not null default true,
  notify_push boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_display_name_key on public.profiles (lower(display_name));

alter table public.profiles enable row level security;
create policy "profiles: owner reads" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner updates" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------
-- Stock reference data (shared, written by the server)
-- ---------------------------------------------------------------
create table public.symbols (
  ticker text primary key,
  name text not null,
  exchange text,
  currency text not null default 'USD',
  industry text,
  sector text not null default 'Other',
  logo text,
  updated_at timestamptz not null default now()
);
alter table public.symbols enable row level security;
create policy "symbols: signed-in users read" on public.symbols
  for select to authenticated using (true);

-- ---------------------------------------------------------------
-- Transactions (private)
-- ---------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null references public.symbols (ticker),
  type text not null check (type in ('buy', 'sell', 'dividend')),
  shares numeric(20, 6) check (shares > 0),
  price numeric(20, 6) check (price >= 0),
  amount numeric(20, 6) check (amount >= 0),          -- dividends: total received
  fees numeric(20, 6) not null default 0 check (fees >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  trade_date date not null default current_date,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint transactions_shape check (
    (type in ('buy', 'sell') and shares is not null and price is not null)
    or (type = 'dividend' and amount is not null)
  )
);
create index transactions_user_date_idx on public.transactions (user_id, trade_date);

alter table public.transactions enable row level security;
create policy "transactions: owner all" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Cash entries (private): deposits, withdrawals, starting cash
-- ---------------------------------------------------------------
create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('starting', 'balance', 'deposit', 'withdrawal')), -- starting/balance = "cash in my account on this date"
  amount numeric(20, 6) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  entry_date date not null default current_date,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index cash_entries_user_idx on public.cash_entries (user_id, entry_date);

alter table public.cash_entries enable row level security;
create policy "cash: owner all" on public.cash_entries
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Market data caches (shared, written by the server)
-- ---------------------------------------------------------------
create table public.quote_cache (
  ticker text primary key,
  price numeric(20, 6) not null,
  change numeric(20, 6),
  change_pct numeric(12, 6),
  currency text not null default 'USD',
  source text,
  updated_at timestamptz not null default now()
);
alter table public.quote_cache enable row level security;
create policy "quotes: signed-in users read" on public.quote_cache
  for select to authenticated using (true);

create table public.price_history (
  ticker text not null,
  date date not null,
  close numeric(20, 6) not null,
  primary key (ticker, date)
);
alter table public.price_history enable row level security;
create policy "history: signed-in users read" on public.price_history
  for select to authenticated using (true);

create table public.fx_rates (
  base text not null,
  quote text not null,
  date date not null,
  rate numeric(20, 10) not null check (rate > 0),
  primary key (base, quote, date)
);
alter table public.fx_rates enable row level security;
create policy "fx: signed-in users read" on public.fx_rates
  for select to authenticated using (true);

-- ---------------------------------------------------------------
-- Follows (follower manages their own follows)
-- ---------------------------------------------------------------
create table public.follows (
  follower_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;
create policy "follows: follower reads" on public.follows
  for select to authenticated using ((select auth.uid()) = follower_id);
create policy "follows: follower adds" on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy "follows: follower removes" on public.follows
  for delete to authenticated using ((select auth.uid()) = follower_id);

-- ---------------------------------------------------------------
-- Notifications (private; created by the server or by triggers)
-- ---------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('earnings', 'follow', 'system')),
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  read_at timestamptz,
  emailed_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications: owner reads" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications: owner marks read" on public.notifications
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notifications: owner deletes" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Push subscriptions (private, one per device)
-- ---------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "push: owner all" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- AI chat history (private)
-- ---------------------------------------------------------------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index ai_messages_user_idx on public.ai_messages (user_id, created_at);

alter table public.ai_messages enable row level security;
create policy "ai: owner reads" on public.ai_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai: owner adds" on public.ai_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai: owner deletes" on public.ai_messages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Sign-up: create the profile and the starting cash entry
-- (values come from the sign-up form's metadata)
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_name text := nullif(trim(meta ->> 'display_name'), '');
  final_name text;
  start_cash numeric;
  start_ccy text := upper(coalesce(nullif(meta ->> 'starting_currency', ''), 'USD'));
begin
  final_name := coalesce(wanted_name, 'investor');
  -- keep display names unique by adding a short suffix when taken
  if exists (select 1 from public.profiles p where lower(p.display_name) = lower(final_name)) then
    final_name := left(final_name, 24) || '-' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;
  if start_ccy !~ '^[A-Z]{3}$' then
    start_ccy := 'USD';
  end if;

  -- base currency is USD unless the user changes it later in Settings
  insert into public.profiles (id, display_name, full_name)
  values (new.id, final_name, nullif(trim(meta ->> 'full_name'), ''));

  begin
    start_cash := (meta ->> 'starting_cash')::numeric;
  exception when others then
    start_cash := null;
  end;
  if start_cash is not null and start_cash > 0 then
    insert into public.cash_entries (user_id, kind, amount, currency, note)
    values (new.id, 'starting', start_cash, start_ccy, 'Starting cash');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Precious metals (tracked like stocks: quantity in troy ounces, price per ounce in USD).
-- updated_at far in the future so the 7-day profile refresh never overwrites these fixed rows.
-- ---------------------------------------------------------------
insert into public.symbols (ticker, name, exchange, currency, industry, sector, logo, updated_at)
values
  ('GC=F', 'Gold', 'COMEX', 'USD', 'Precious metal', 'Precious Metals', null, '2100-01-01'),
  ('SI=F', 'Silver', 'COMEX', 'USD', 'Precious metal', 'Precious Metals', null, '2100-01-01')
on conflict (ticker) do update set name = excluded.name, sector = excluded.sector, updated_at = excluded.updated_at;

-- ---------------------------------------------------------------
-- Avatars: public bucket (images only, max 2 MB); users may only add/remove files in avatars/<their id>/
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "avatars: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
