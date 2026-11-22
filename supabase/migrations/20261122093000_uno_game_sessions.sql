-- Server-authoritative UNO sessions.
-- Public state is room-member readable; hands and draw pile stay in a private schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.club_room_game_sessions (
  room_id uuid primary key references public.club_rooms(id) on delete cascade,
  game_id text not null check (game_id = 'uno'),
  public_state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists club_room_game_sessions_updated_at_idx
  on public.club_room_game_sessions(updated_at desc);

alter table public.club_room_game_sessions enable row level security;
revoke all on public.club_room_game_sessions from anon, authenticated;
grant select on public.club_room_game_sessions to authenticated;
grant select, insert, update, delete on public.club_room_game_sessions to service_role;

drop policy if exists "Room members read public game sessions" on public.club_room_game_sessions;
create policy "Room members read public game sessions"
on public.club_room_game_sessions
for select to authenticated
using (public.club_is_room_member(room_id));

create table if not exists private.club_room_game_secrets (
  room_id uuid primary key references public.club_rooms(id) on delete cascade,
  game_id text not null check (game_id = 'uno'),
  secret_state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table private.club_room_game_secrets enable row level security;
revoke all on private.club_room_game_secrets from public, anon, authenticated;
grant all on private.club_room_game_secrets to service_role;

create or replace function public.club_load_game_session(p_room_id uuid)
returns table (
  game_id text,
  public_state jsonb,
  secret_state jsonb,
  revision bigint
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select s.game_id, s.public_state, secret.secret_state, s.revision
  from public.club_room_game_sessions as s
  join private.club_room_game_secrets as secret
    on secret.room_id = s.room_id
   and secret.game_id = s.game_id
   and secret.revision = s.revision
  where s.room_id = p_room_id;
$function$;

revoke all on function public.club_load_game_session(uuid) from public, anon, authenticated;
grant execute on function public.club_load_game_session(uuid) to service_role;

create or replace function public.club_commit_game_session(
  p_room_id uuid,
  p_game_id text,
  p_expected_revision bigint,
  p_public_state jsonb,
  p_secret_state jsonb,
  p_updated_by uuid,
  p_room_status text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_revision bigint;
begin
  if p_game_id <> 'uno' then
    raise exception 'Unsupported game id.' using errcode = '22023';
  end if;
  if p_expected_revision < -1 then
    raise exception 'Invalid expected revision.' using errcode = '22023';
  end if;
  if p_public_state is null or p_secret_state is null or p_updated_by is null then
    raise exception 'Game state and actor are required.' using errcode = '22004';
  end if;

  if p_expected_revision = -1 then
    if exists (
      select 1 from public.club_room_game_sessions
      where room_id = p_room_id
    ) then
      raise exception 'Revision conflict.' using errcode = '40001';
    end if;

    insert into public.club_room_game_sessions (
      room_id, game_id, public_state, revision, updated_by, updated_at
    ) values (
      p_room_id, p_game_id, p_public_state, 0, p_updated_by, now()
    );
    insert into private.club_room_game_secrets (
      room_id, game_id, secret_state, revision, updated_at
    ) values (
      p_room_id, p_game_id, p_secret_state, 0, now()
    );
    v_revision := 0;
  else
    select s.revision into v_revision
    from public.club_room_game_sessions as s
    where s.room_id = p_room_id
    for update;

    if not found or v_revision <> p_expected_revision then
      raise exception 'Revision conflict.' using errcode = '40001';
    end if;

    v_revision := v_revision + 1;
    update public.club_room_game_sessions
    set public_state = p_public_state,
        revision = v_revision,
        updated_by = p_updated_by,
        updated_at = now()
    where room_id = p_room_id
      and revision = p_expected_revision;

    update private.club_room_game_secrets
    set secret_state = p_secret_state,
        revision = v_revision,
        updated_at = now()
    where room_id = p_room_id
      and revision = p_expected_revision;

    if not found then
      raise exception 'Private state is missing or out of sync.' using errcode = '40001';
    end if;
  end if;

  if p_room_status is not null then
    if p_room_status <> 'playing' then
      raise exception 'Unsupported room status transition.' using errcode = '22023';
    end if;
    update public.club_rooms
    set status = 'playing'
    where id = p_room_id
      and game_id = 'uno'
      and status = 'open';
    if not found then
      raise exception 'Room is not available to start.' using errcode = '40001';
    end if;
  end if;

  return v_revision;
end;
$function$;

revoke all on function public.club_commit_game_session(uuid, text, bigint, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.club_commit_game_session(uuid, text, bigint, jsonb, jsonb, uuid, text)
  to service_role;

do $publication$
begin
  alter publication supabase_realtime add table public.club_room_game_sessions;
exception when duplicate_object then null;
end
$publication$;
