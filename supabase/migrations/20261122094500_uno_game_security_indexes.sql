-- Explicitly document server-only access to private game secrets.
create policy "Service role manages private game secrets"
on private.club_room_game_secrets
for all to service_role
using (true)
with check (true);

-- Cover the updated_by foreign key for efficient cleanup/joins.
create index if not exists club_room_game_sessions_updated_by_idx
  on public.club_room_game_sessions(updated_by);
