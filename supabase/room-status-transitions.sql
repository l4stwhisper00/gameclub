-- Allow the room host to return a finished or closed room to the lobby.
-- Existing authorization is preserved: only the authenticated host may change status.
create or replace function public.club_set_room_status(p_room_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Необходимо войти в аккаунт.';
  end if;

  if p_status not in ('open', 'playing', 'closed') then
    raise exception 'Недопустимый статус комнаты.';
  end if;

  update public.club_rooms
  set status = p_status
  where id = p_room_id
    and host_id = auth.uid();

  if not found then
    raise exception 'Только ведущий может изменить статус комнаты.';
  end if;
end;
$$;

revoke all on function public.club_set_room_status(uuid, text) from public;
grant execute on function public.club_set_room_status(uuid, text) to authenticated;
