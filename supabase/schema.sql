create table if not exists problems (
  id            text primary key,          -- "{contestId}{index}"
  handle        text not null,
  contest_id    integer not null,
  problem_index text not null,
  name          text not null,
  rating        integer,
  tags          text[] default '{}',
  solved_at     text not null,             -- YYYY-MM-DD
  solved_at_ts  bigint,                    -- ms timestamp for accurate sort
  attempts      integer not null default 1,
  note          jsonb,
  tag_overrides text[]
);

create table if not exists user_profiles (
  handle         text primary key,
  rating         integer,
  max_rating     integer,
  rank           text,
  max_rank       text,
  contribution   integer,
  friends        integer,
  registered     text,
  rating_history jsonb default '[]'
);

-- allow the service role key full access (no RLS needed for single-user)
alter table problems      disable row level security;
alter table user_profiles disable row level security;
