-- Non-destructive migration for LeetCode tracking.
-- Do not run supabase/schema.sql against an existing production project; it
-- starts by dropping tables for a clean bootstrap.

alter table profiles
  add column if not exists leetcode_username text;

alter table problems
  add column if not exists platform text not null default 'codeforces',
  add column if not exists lc_difficulty text,
  add column if not exists problem_url text;

update problems
set platform = case when is_custom then 'custom' else 'codeforces' end
where platform is null or platform = 'codeforces';
