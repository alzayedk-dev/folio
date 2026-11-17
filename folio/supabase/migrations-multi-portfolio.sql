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
