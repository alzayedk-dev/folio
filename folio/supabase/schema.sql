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

-- ---------------------------------------------------------------
-- Public snapshots: percent-only copy of a published portfolio (no amounts, share counts or cash)
-- ---------------------------------------------------------------
create table public.public_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  bio text,
  avatar_url text,
  holdings jsonb not null default '[]'::jsonb,
  sectors jsonb not null default '[]'::jsonb,
  returns jsonb not null default '{}'::jsonb,
  performance jsonb not null default '[]'::jsonb,
  holdings_count int not null default 0,
  updated_at timestamptz not null default now()
);
create or replace function public.is_public_user(uid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.is_public from public.profiles p where p.id = uid), false); $$;
revoke execute on function public.is_public_user(uuid) from public, anon;
grant execute on function public.is_public_user(uuid) to authenticated;
alter table public.public_snapshots enable row level security;
create policy "snapshots: owner all" on public.public_snapshots
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "snapshots: read when public" on public.public_snapshots
  for select to authenticated using (public.is_public_user(user_id));

-- ---------------------------------------------------------------
-- Follows: only published portfolios can be followed; follower counts; alerts on buys/sells (no amounts)
-- ---------------------------------------------------------------
drop policy if exists "follows: follower adds" on public.follows;
create policy "follows: follower adds" on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id and public.is_public_user(followee_id));
create or replace function public.follower_count(uid uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select case when public.is_public_user(uid) then (select count(*)::int from public.follows f where f.followee_id = uid) else 0 end; $$;
revoke execute on function public.follower_count(uuid) from public, anon;
grant execute on function public.follower_count(uuid) to authenticated;
create or replace function public.notify_followers()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare owner_name text; owner_public boolean; asset text; verb text;
begin
  if new.type not in ('buy', 'sell') then return new; end if;
  select p.display_name, p.is_public into owner_name, owner_public from public.profiles p where p.id = new.user_id;
  if not coalesce(owner_public, false) then return new; end if;
  asset := case new.ticker when 'GC=F' then 'Gold' when 'SI=F' then 'Silver' else new.ticker end;
  verb := case new.type when 'buy' then 'bought' else 'sold' end;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select f.follower_id, 'follow', owner_name || ' ' || verb || ' ' || asset, 'A portfolio you follow made a change.',
         '/public/' || new.user_id::text, 'follow:' || new.id::text || ':' || f.follower_id::text
  from public.follows f where f.followee_id = new.user_id
  on conflict (dedupe_key) do nothing;
  return new;
end; $$;
revoke execute on function public.notify_followers() from public, anon, authenticated;
create trigger on_transaction_notify_followers after insert on public.transactions
  for each row execute function public.notify_followers();

-- ---------------------------------------------------------------
-- Daily job: private secret + pg_cron schedule calling the "daily" Edge Function at 06:00 UTC
-- ---------------------------------------------------------------
create table if not exists public.app_config (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table public.app_config enable row level security; -- no policies: service role / database only
revoke all on public.app_config from anon, authenticated;
insert into public.app_config (key, value) values ('cron_secret', encode(gen_random_bytes(32), 'hex')) on conflict (key) do nothing;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('folio-daily', '0 6 * * *', $job$
  select net.http_post(
    url := 'https://zwtqzejyjankgchxyizf.supabase.co/functions/v1/daily',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_config where key = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

-- ---------------------------------------------------------------
-- Earnings reminder timing per user (first N days before, default 7; second N days before, default 1, null = off)
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists reminder_first integer not null default 7 check (reminder_first between 1 and 30),
  add column if not exists reminder_second integer default 1 check (reminder_second is null or reminder_second between 0 and 30);

-- ---------------------------------------------------------------
-- Shariah screening (17 Nov): raw facts cached 7 days, rules run in lib/shariah.ts
-- ---------------------------------------------------------------
create table if not exists public.shariah_cache (
  ticker text primary key,
  quote_type text,
  industry text,
  yahoo_sector text,
  total_debt numeric,
  cash_investments numeric,
  market_cap numeric,
  currency text,
  data_date date,
  found boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.shariah_cache enable row level security;
create policy "shariah_cache: signed-in users read" on public.shariah_cache
  for select to authenticated using (true);

alter table public.profiles
  add column if not exists show_shariah boolean not null default true;

-- ===============================================================
-- Multiple portfolios (17 Nov): see migrations-multi-portfolio.sql (applied as migration multi_portfolios)
-- ===============================================================
-- ===============================================================
-- Multiple portfolios, Real and Paper (17 Nov). Applied as migration "multi_portfolios".
-- ===============================================================

-- 1. Portfolios
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'real' check (kind in ('real', 'paper')),
  is_public boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index portfolios_user_name_key on public.portfolios (user_id, lower(btrim(name)));
create index portfolios_user_idx on public.portfolios (user_id, position);

alter table public.portfolios enable row level security;
create policy "portfolios: owner all" on public.portfolios
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios: read when public" on public.portfolios
  for select to authenticated using (is_public);

-- At most 10 per user
create or replace function public.portfolio_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.portfolios p where p.user_id = new.user_id) >= 10 then
    raise exception 'portfolio_limit' using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke execute on function public.portfolio_limit() from public, anon, authenticated;
create trigger portfolios_limit before insert on public.portfolios
  for each row execute function public.portfolio_limit();

-- Helpers (security definer so policies on other tables can use them without recursion)
create or replace function public.owns_portfolio(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.portfolios p where p.id = pid and p.user_id = (select auth.uid())); $$;
create or replace function public.is_public_portfolio(pid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select p.is_public from public.portfolios p where p.id = pid), false); $$;
revoke execute on function public.owns_portfolio(uuid) from public, anon;
revoke execute on function public.is_public_portfolio(uuid) from public, anon;
grant execute on function public.owns_portfolio(uuid) to authenticated;
grant execute on function public.is_public_portfolio(uuid) to authenticated;

-- 2. One "My Portfolio" (real) per existing user, keeping their publish choice
insert into public.portfolios (user_id, name, kind, is_public)
select p.id, 'My Portfolio', 'real', p.is_public from public.profiles p;

-- 3. Trades and cash belong to a portfolio
alter table public.transactions add column portfolio_id uuid references public.portfolios (id) on delete cascade;
alter table public.cash_entries add column portfolio_id uuid references public.portfolios (id) on delete cascade;
update public.transactions t set portfolio_id = (select id from public.portfolios p where p.user_id = t.user_id order by position, created_at limit 1);
update public.cash_entries c set portfolio_id = (select id from public.portfolios p where p.user_id = c.user_id order by position, created_at limit 1);
alter table public.transactions alter column portfolio_id set not null;
alter table public.cash_entries alter column portfolio_id set not null;
create index transactions_portfolio_idx on public.transactions (portfolio_id, trade_date);
create index cash_entries_portfolio_idx on public.cash_entries (portfolio_id, entry_date);

-- Older code paths that don't send a portfolio get the user's first one
create or replace function public.default_portfolio()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.portfolio_id is null then
    select p.id into new.portfolio_id from public.portfolios p where p.user_id = new.user_id order by p.position, p.created_at limit 1;
  end if;
  return new;
end; $$;
revoke execute on function public.default_portfolio() from public, anon, authenticated;
create trigger transactions_default_portfolio before insert on public.transactions for each row execute function public.default_portfolio();
create trigger cash_default_portfolio before insert on public.cash_entries for each row execute function public.default_portfolio();

-- Writes must go to one of the user's own portfolios
drop policy "transactions: owner all" on public.transactions;
create policy "transactions: owner all" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_portfolio(portfolio_id));
drop policy "cash: owner all" on public.cash_entries;
create policy "cash: owner all" on public.cash_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and public.owns_portfolio(portfolio_id));

-- 4. Public snapshots: one per published portfolio
alter table public.public_snapshots add column portfolio_id uuid references public.portfolios (id) on delete cascade;
alter table public.public_snapshots add column portfolio_name text;
alter table public.public_snapshots add column portfolio_kind text not null default 'real' check (portfolio_kind in ('real', 'paper'));
update public.public_snapshots s set portfolio_id = (select id from public.portfolios p where p.user_id = s.user_id order by position, created_at limit 1), portfolio_name = 'My Portfolio';
alter table public.public_snapshots alter column portfolio_id set not null;
alter table public.public_snapshots drop constraint public_snapshots_pkey;
alter table public.public_snapshots add primary key (portfolio_id);
create index public_snapshots_user_idx on public.public_snapshots (user_id);
drop policy "snapshots: owner all" on public.public_snapshots;
create policy "snapshots: owner all" on public.public_snapshots
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and public.owns_portfolio(portfolio_id));
drop policy "snapshots: read when public" on public.public_snapshots;
create policy "snapshots: read when public" on public.public_snapshots
  for select to authenticated using (public.is_public_portfolio(portfolio_id));

-- 5. Follows: follow a specific portfolio (followee_id = its owner, filled in automatically)
alter table public.follows add column portfolio_id uuid references public.portfolios (id) on delete cascade;
update public.follows f set portfolio_id = (select id from public.portfolios p where p.user_id = f.followee_id order by position, created_at limit 1);
alter table public.follows alter column portfolio_id set not null;
alter table public.follows drop constraint follows_pkey;
alter table public.follows add primary key (follower_id, portfolio_id);
create index follows_portfolio_idx on public.follows (portfolio_id);
alter table public.follows alter column followee_id drop not null;

create or replace function public.follow_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select p.user_id into new.followee_id from public.portfolios p where p.id = new.portfolio_id;
  if new.followee_id is null or new.followee_id = new.follower_id then
    raise exception 'cannot_follow' using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke execute on function public.follow_owner() from public, anon, authenticated;
create trigger follows_owner before insert on public.follows for each row execute function public.follow_owner();

drop policy "follows: follower adds" on public.follows;
create policy "follows: follower adds" on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id and public.is_public_portfolio(portfolio_id));

create or replace function public.portfolio_follower_count(pid uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select case when public.is_public_portfolio(pid) then (select count(*)::int from public.follows f where f.portfolio_id = pid) else 0 end; $$;
revoke execute on function public.portfolio_follower_count(uuid) from public, anon;
grant execute on function public.portfolio_follower_count(uuid) to authenticated;

-- Follow alerts: only that portfolio's followers; never amounts
create or replace function public.notify_followers()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare owner_name text; pf record; asset text; verb text;
begin
  if new.type not in ('buy', 'sell') then return new; end if;
  select p.name, p.kind, p.is_public into pf from public.portfolios p where p.id = new.portfolio_id;
  if not coalesce(pf.is_public, false) then return new; end if;
  select pr.display_name into owner_name from public.profiles pr where pr.id = new.user_id;
  asset := case new.ticker when 'GC=F' then 'Gold' when 'SI=F' then 'Silver' else new.ticker end;
  verb := case new.type when 'buy' then 'bought' else 'sold' end;
  insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
  select f.follower_id, 'follow',
         owner_name || case when pf.kind = 'paper' then ' (Paper: ' else ' (' end || pf.name || ') ' || verb || ' ' || asset,
         'A portfolio you follow made a change.',
         '/public/p/' || new.portfolio_id::text, 'follow:' || new.id::text || ':' || f.follower_id::text
  from public.follows f where f.portfolio_id = new.portfolio_id
  on conflict (dedupe_key) do nothing;
  return new;
end; $$;
revoke execute on function public.notify_followers() from public, anon, authenticated;

-- 6. New sign-ups get "My Portfolio" with their starting cash
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_name text := nullif(trim(meta ->> 'display_name'), '');
  final_name text;
  start_cash numeric;
  start_ccy text := upper(coalesce(nullif(meta ->> 'starting_currency', ''), 'USD'));
  pid uuid;
begin
  final_name := coalesce(wanted_name, 'investor');
  if exists (select 1 from public.profiles p where lower(p.display_name) = lower(final_name)) then
    final_name := left(final_name, 24) || '-' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;
  if start_ccy !~ '^[A-Z]{3}$' then start_ccy := 'USD'; end if;

  insert into public.profiles (id, display_name, full_name)
  values (new.id, final_name, nullif(trim(meta ->> 'full_name'), ''));
  insert into public.portfolios (user_id, name, kind) values (new.id, 'My Portfolio', 'real') returning id into pid;

  begin
    start_cash := (meta ->> 'starting_cash')::numeric;
  exception when others then
    start_cash := null;
  end;
  if start_cash is not null and start_cash > 0 then
    insert into public.cash_entries (user_id, portfolio_id, kind, amount, currency, note)
    values (new.id, pid, 'starting', start_cash, start_ccy, 'Starting cash');
  end if;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
