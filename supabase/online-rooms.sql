-- Online rooms foundation for Настольный клуб.
-- Run once in Supabase SQL Editor. This migration uses club_* tables to avoid
-- colliding with the earlier prototype tables.

create extension if not exists pgcrypto;

create table if not exists public.club_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  invite_code text not null unique,
  game_id text not null,
  name text not null check (char_length(name) between 3 and 55),
  description text not null default '',
  max_players integer not null check (max_players between 2 and 30),
  visibility text not null default 'public' check (visibility in ('public','private')),
  scheduled_at timestamptz,
  rules jsonb not null default '{}'::jsonb,
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','playing','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.club_room_members (
  room_id uuid not null references public.club_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('host','player')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.club_room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.club_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  message_type text not null default 'user' check (message_type in ('user','system')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists club_rooms_created_at_idx on public.club_rooms(created_at desc);
create index if not exists club_room_members_user_idx on public.club_room_members(user_id);
create index if not exists club_room_messages_room_created_idx on public.club_room_messages(room_id, created_at);

alter table public.club_rooms enable row level security;
alter table public.club_room_members enable row level security;
alter table public.club_room_messages enable row level security;

-- SECURITY DEFINER helpers avoid recursive RLS evaluation on membership lookups.
create or replace function public.club_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $member_check$
  select exists (
    select 1 from public.club_room_members
    where room_id = p_room_id and user_id = auth.uid()
  );
$member_check$;

create or replace function public.club_can_view_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public

as $room_visibility$
  select exists (
    select 1 from public.club_rooms
    where id = p_room_id
      and (visibility = 'public' or public.club_is_room_member(id))
  );
$room_visibility$;

revoke all on function public.club_is_room_member(uuid) from public;
revoke all on function public.club_can_view_room(uuid) from public;
grant execute on function public.club_is_room_member(uuid) to authenticated;
grant execute on function public.club_can_view_room(uuid) to authenticated;

drop policy if exists "Read visible club rooms" on public.club_rooms;
create policy "Read visible club rooms" on public.club_rooms
for select to authenticated
using (visibility = 'public' or public.club_is_room_member(id));

drop policy if exists "Read members of visible rooms" on public.club_room_members;
create policy "Read members of visible rooms" on public.club_room_members
for select to authenticated
using (public.club_can_view_room(room_id));

drop policy if exists "Members read room messages" on public.club_room_messages;
create policy "Members read room messages" on public.club_room_messages
for select to authenticated
using (
  public.club_is_room_member(room_id)
);

drop policy if exists "Members send room messages" on public.club_room_messages;
create policy "Members send room messages" on public.club_room_messages
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and message_type = 'user'
  and public.club_is_room_member(room_id)
);

create or replace function public.club_create_room(
  p_game_id text,
  p_name text,
  p_description text,
  p_max_players integer,
  p_visibility text,
  p_scheduled_at timestamptz,
  p_rules jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 3 and 55 then raise exception 'Название комнаты должно содержать от 3 до 55 символов.'; end if;
  if p_max_players < 2 or p_max_players > 30 then raise exception 'Недопустимое число игроков.'; end if;
  if p_visibility not in ('public','private') then raise exception 'Недопустимый тип доступа.'; end if;

  insert into public.club_rooms(id, room_code, invite_code, game_id, name, description, max_players, visibility, scheduled_at, rules, host_id)
  values (
    v_room_id,
    upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,6)),
    upper(substr(encode(extensions.gen_random_bytes(12),'hex'),1,10)),
    p_game_id, trim(p_name), left(coalesce(p_description,''),280),
    p_max_players, p_visibility, p_scheduled_at, coalesce(p_rules,'{}'::jsonb), v_user
  );

  insert into public.club_room_members(room_id,user_id,role) values(v_room_id,v_user,'host');
  insert into public.club_room_messages(room_id,user_id,message_type,body)
  values(v_room_id,null,'system','Комната создана. Добро пожаловать за стол!');
  return v_room_id;
end;
$$;

create or replace function public.club_join_room(p_room_id uuid, p_invite_code text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.club_rooms%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  select * into v_room from public.club_rooms where id=p_room_id for update;
  if not found then raise exception 'Комната не найдена.'; end if;
  if exists(select 1 from public.club_room_members where room_id=p_room_id and user_id=v_user) then return; end if;
  if v_room.visibility='private' and (p_invite_code is null or p_invite_code <> v_room.invite_code) then
    raise exception 'Неверная ссылка-приглашение.';
  end if;
  if v_room.status <> 'open' then raise exception 'Комната больше не принимает игроков.'; end if;
  select count(*) into v_count from public.club_room_members where room_id=p_room_id;
  if v_count >= v_room.max_players then raise exception 'В комнате больше нет свободных мест.'; end if;
  insert into public.club_room_members(room_id,user_id,role) values(p_room_id,v_user,'player');
  insert into public.club_room_messages(room_id,user_id,message_type,body)
  values(p_room_id,null,'system','Новый игрок присоединился к комнате.');
end;
$$;

create or replace function public.club_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  if exists(select 1 from public.club_rooms where id=p_room_id and host_id=v_user) then
    raise exception 'Ведущий не может покинуть свою комнату. Передайте ведущего или завершите её.';
  end if;
  delete from public.club_room_members where room_id=p_room_id and user_id=v_user;
end;
$$;

create or replace function public.club_set_room_status(p_room_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  if p_status not in ('playing','closed') then raise exception 'Недопустимый статус комнаты.'; end if;
  update public.club_rooms set status=p_status
  where id=p_room_id and host_id=auth.uid();
  if not found then raise exception 'Только ведущий может изменить статус комнаты.'; end if;
end;
$$;

create or replace function public.club_remove_room_member(p_room_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  if not exists(select 1 from public.club_rooms where id=p_room_id and host_id=auth.uid()) then
    raise exception 'Только ведущий может удалять участников.';
  end if;
  if p_member_id=auth.uid() then raise exception 'Нельзя удалить самого себя.'; end if;
  delete from public.club_room_members where room_id=p_room_id and user_id=p_member_id;
end;
$$;

create or replace function public.club_delete_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Необходимо войти в аккаунт.'; end if;
  delete from public.club_rooms where id=p_room_id and host_id=auth.uid();
  if not found then raise exception 'Только ведущий может удалить комнату.'; end if;
end;
$$;

revoke all on function public.club_create_room(text,text,text,integer,text,timestamptz,jsonb) from public;
revoke all on function public.club_join_room(uuid,text) from public;
revoke all on function public.club_leave_room(uuid) from public;
revoke all on function public.club_set_room_status(uuid,text) from public;
revoke all on function public.club_remove_room_member(uuid,uuid) from public;
revoke all on function public.club_delete_room(uuid) from public;
grant execute on function public.club_create_room(text,text,text,integer,text,timestamptz,jsonb) to authenticated;
grant execute on function public.club_join_room(uuid,text) to authenticated;
grant execute on function public.club_leave_room(uuid) to authenticated;
grant execute on function public.club_set_room_status(uuid,text) to authenticated;
grant execute on function public.club_remove_room_member(uuid,uuid) to authenticated;
grant execute on function public.club_delete_room(uuid) to authenticated;

grant select on public.club_rooms, public.club_room_members, public.club_room_messages to authenticated;
grant insert on public.club_room_messages to authenticated;
grant usage, select on sequence public.club_room_messages_id_seq to authenticated;

-- Realtime is required for cross-device updates. Ignore duplicate publication entries.
do $$
begin
  alter publication supabase_realtime add table public.club_rooms;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.club_room_members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.club_room_messages;
exception when duplicate_object then null;
end $$;


-- Public player cards used by the shared rooms UI.
create table if not exists public.club_public_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 3 and 20),
  avatar text not null default '',
  status text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.club_public_profiles enable row level security;
drop policy if exists "Authenticated users read public player cards" on public.club_public_profiles;
create policy "Authenticated users read public player cards" on public.club_public_profiles
for select to authenticated using (true);
drop policy if exists "Users insert own player card" on public.club_public_profiles;
create policy "Users insert own player card" on public.club_public_profiles
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users update own player card" on public.club_public_profiles;
create policy "Users update own player card" on public.club_public_profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
grant select, insert, update on public.club_public_profiles to authenticated;
