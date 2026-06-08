-- ============================================================================
-- cf-tracker schema (multi-user, Supabase Auth + RLS)
-- Run this in the Supabase SQL editor. Start-fresh: drops the old single-user
-- tables. All access is scoped to the authenticated user via row-level security.
-- ============================================================================

drop table if exists problems cascade;
drop table if exists user_profiles cascade;
drop table if exists profiles cascade;

-- One profile row per auth user. Holds the user's chosen Codeforces handle and
-- their synced CF stats / rating history / UI prefs.
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  handle         text,                      -- null until the user sets it
  rating         integer,
  max_rating     integer,
  rank           text,
  max_rank       text,
  contribution   integer,
  friends        integer,
  registered     text,
  rating_history jsonb default '[]',
  radar_filter   text
);

create table problems (
  user_id       uuid not null references auth.users(id) on delete cascade,
  id            text not null,              -- "{contestId}{index}"
  contest_id    integer not null,
  problem_index text not null,
  name          text not null,
  rating        integer,
  tags          text[] default '{}',
  solved_at     text not null,             -- YYYY-MM-DD
  solved_at_ts  bigint,                    -- ms timestamp for accurate sort
  attempts      integer not null default 1,
  note          jsonb,
  tag_overrides text[],
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Row-level security: each user can only see / touch their own rows.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table problems enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own problems" on problems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up, so a row always
-- exists after the first Google login.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
