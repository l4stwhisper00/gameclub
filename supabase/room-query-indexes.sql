-- Cover the remaining foreign keys used by current online-room features.
create index if not exists club_rooms_host_id_idx
  on public.club_rooms(host_id);
create index if not exists club_room_messages_user_id_idx
  on public.club_room_messages(user_id);
