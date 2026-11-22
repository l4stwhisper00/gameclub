-- Persistent, member-readable game state for online chess.
-- Writes are performed only by the authenticated chess Edge Function.
create table if not exists public.club_room_game_states (
  room_id uuid primary key references public.club_rooms(id) on delete cascade,
  game_id text not null check (game_id = 'chess'),
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists club_room_game_states_updated_at_idx
  on public.club_room_game_states(updated_at desc);

alter table public.club_room_game_states enable row level security;

drop policy if exists "Room members read game state" on public.club_room_game_states;
create policy "Room members read game state"
on public.club_room_game_states
for select to authenticated
using (public.club_is_room_member(room_id));

revoke all on public.club_room_game_states from anon, authenticated;
grant select on public.club_room_game_states to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.club_room_game_states;
exception when duplicate_object then null;
end $$;
