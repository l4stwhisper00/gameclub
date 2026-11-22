-- Minimum privileges for the server-only chess Edge Function.
-- No browser role receives write access to these room tables.
grant select, update on table public.club_rooms to service_role;
grant select on table public.club_room_members to service_role;
grant select, insert, update on table public.club_room_game_states to service_role;
