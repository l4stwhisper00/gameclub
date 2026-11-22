-- Cover remaining legacy foreign keys for efficient deletes and ownership lookups.
create index if not exists rooms_owner_id_idx
  on public.rooms(owner_id);
create index if not exists messages_user_id_idx
  on public.messages(user_id);
