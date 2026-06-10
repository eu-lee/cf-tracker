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
  rating_history    jsonb default '[]',
  radar_filter      jsonb,                  -- null = solved topics, "all" = all, [..] = custom
  radar_show_rating boolean default false
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
  is_custom     boolean not null default false,  -- true for manually-added problems
  description   jsonb,                           -- custom problem statement / notes as TipTap JSON
  images        text[] not null default '{}',   -- storage paths in the problem-images bucket
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

-- ---------------------------------------------------------------------------
-- Custom problems migration (idempotent — safe to run on an existing DB that
-- already has data, in addition to the create table above).
-- ---------------------------------------------------------------------------
alter table problems
  add column if not exists is_custom   boolean not null default false,
  add column if not exists description jsonb,
  add column if not exists images      text[] not null default '{}';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'problems'
      and column_name = 'description'
      and data_type <> 'jsonb'
  ) then
    alter table problems
      alter column description type jsonb
      using case
        when description is null then null
        when btrim(description) = '' then null
        else jsonb_build_object(
          'type', 'tiptap',
          'doc', jsonb_build_object(
            'type', 'doc',
            'content', jsonb_build_array(
              jsonb_build_object(
                'type', 'paragraph',
                'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', description))
              )
            )
          ),
          'text', description
        )
      end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for custom-problem screenshots. Files live under a
-- "{user_id}/..." prefix so RLS can scope each user to their own folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('problem-images', 'problem-images', false)
  on conflict (id) do nothing;

drop policy if exists "own problem images read"   on storage.objects;
drop policy if exists "own problem images insert" on storage.objects;
drop policy if exists "own problem images delete" on storage.objects;

create policy "own problem images read" on storage.objects
  for select using (
    bucket_id = 'problem-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own problem images insert" on storage.objects
  for insert with check (
    bucket_id = 'problem-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own problem images delete" on storage.objects
  for delete using (
    bucket_id = 'problem-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
