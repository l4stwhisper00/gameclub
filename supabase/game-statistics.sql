-- Game statistics for player profiles.
-- Run this migration once in Supabase SQL Editor after the online rooms migration.

create table if not exists public.club_game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (char_length(game_id) between 1 and 80),
  placement integer not null check (placement between 1 and 30),
  players_count integer not null check (players_count between 2 and 30),
  outcome text not null check (outcome in ('win','loss')),
  created_at timestamptz not null default now(),
  constraint club_game_results_placement_valid check (placement <= players_count),
  constraint club_game_results_outcome_valid check (
    (placement = 1 and outcome = 'win') or (placement > 1 and outcome = 'loss')
  )
);

create index if not exists club_game_results_user_created_idx
  on public.club_game_results(user_id, created_at desc);
create index if not exists club_game_results_game_idx
  on public.club_game_results(user_id, game_id);

alter table public.club_game_results enable row level security;

drop policy if exists "Anyone can read player game results" on public.club_game_results;
create policy "Anyone can read player game results"
  on public.club_game_results for select to anon, authenticated using (true);

drop policy if exists "Players add their own game results" on public.club_game_results;
create policy "Players add their own game results"
  on public.club_game_results for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Players delete their own game results" on public.club_game_results;
create policy "Players delete their own game results"
  on public.club_game_results for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.club_game_results to anon, authenticated;
grant insert, delete on public.club_game_results to authenticated;
grant usage, select on sequence public.club_game_results_id_seq to authenticated;
