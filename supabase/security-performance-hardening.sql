-- Tighten legacy helper RPC visibility and avoid per-row auth.uid() calls in legacy RLS.
revoke execute on function public.handle_new_user() from public, anon;
grant execute on function public.handle_new_user() to supabase_auth_admin;

revoke execute on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

revoke execute on function public.is_room_owner(uuid) from public, anon;
grant execute on function public.is_room_owner(uuid) to authenticated;

alter policy "Users update own profile" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Create own rooms" on public.rooms
  with check (owner_id = (select auth.uid()));

alter policy "Delete own rooms" on public.rooms
  using (owner_id = (select auth.uid()));

alter policy "Read available rooms" on public.rooms
  using (is_public or owner_id = (select auth.uid()) or is_room_member(id));

alter policy "Update own rooms" on public.rooms
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter policy "Join public rooms" on public.room_members
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.rooms r
      where r.id = room_members.room_id
        and (r.is_public = true or r.owner_id = (select auth.uid()))
    )
  );

alter policy "Leave room" on public.room_members
  using (user_id = (select auth.uid()) or is_room_owner(room_id));

alter policy "Read room members" on public.room_members
  using (
    user_id = (select auth.uid())
    or is_room_member(room_id)
    or is_room_owner(room_id)
  );

alter policy "Send room messages" on public.messages
  with check (user_id = (select auth.uid()) and is_room_member(room_id));
