-- Extend the shared, server-only game-session storage to the full catalogue.
alter table public.club_room_game_sessions
  drop constraint if exists club_room_game_sessions_game_id_check;
alter table public.club_room_game_sessions
  add constraint club_room_game_sessions_game_id_check
  check (game_id in (
    'dnd-5e','bunker','mafia','codenames','dixit','imaginarium','alias','spy',
    'secret-hitler','avalon','uno','monopoly','carcassonne','catan',
    'ticket-to-ride','munchkin','ekivoki','crocodile','chess','backgammon'
  ));

alter table private.club_room_game_secrets
  drop constraint if exists club_room_game_secrets_game_id_check;
alter table private.club_room_game_secrets
  add constraint club_room_game_secrets_game_id_check
  check (game_id in (
    'dnd-5e','bunker','mafia','codenames','dixit','imaginarium','alias','spy',
    'secret-hitler','avalon','uno','monopoly','carcassonne','catan',
    'ticket-to-ride','munchkin','ekivoki','crocodile','chess','backgammon'
  ));

create or replace function public.club_commit_game_session(
  p_room_id uuid, p_game_id text, p_expected_revision bigint,
  p_public_state jsonb, p_secret_state jsonb, p_updated_by uuid,
  p_room_status text default null
)
returns bigint language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_revision bigint;
begin
  if p_game_id not in (
    'dnd-5e','bunker','mafia','codenames','dixit','imaginarium','alias','spy',
    'secret-hitler','avalon','uno','monopoly','carcassonne','catan',
    'ticket-to-ride','munchkin','ekivoki','crocodile','chess','backgammon'
  ) then raise exception 'Unsupported game id.' using errcode = '22023'; end if;
  if p_expected_revision < -1 then raise exception 'Invalid expected revision.' using errcode = '22023'; end if;
  if p_public_state is null or p_secret_state is null or p_updated_by is null then
    raise exception 'Game state and actor are required.' using errcode = '22004';
  end if;
  if p_expected_revision = -1 then
    if exists (select 1 from public.club_room_game_sessions where room_id = p_room_id) then
      raise exception 'Revision conflict.' using errcode = '40001';
    end if;
    insert into public.club_room_game_sessions(room_id,game_id,public_state,revision,updated_by,updated_at)
    values(p_room_id,p_game_id,p_public_state,0,p_updated_by,now());
    insert into private.club_room_game_secrets(room_id,game_id,secret_state,revision,updated_at)
    values(p_room_id,p_game_id,p_secret_state,0,now());
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
    set public_state=p_public_state,revision=v_revision,updated_by=p_updated_by,updated_at=now()
    where room_id=p_room_id and revision=p_expected_revision;
    update private.club_room_game_secrets
    set secret_state=p_secret_state,revision=v_revision,updated_at=now()
    where room_id=p_room_id and revision=p_expected_revision;
    if not found then raise exception 'Private state is missing or out of sync.' using errcode = '40001'; end if;
  end if;
  if p_room_status is not null then
    if p_room_status <> 'playing' then raise exception 'Unsupported room status transition.' using errcode = '22023'; end if;
    update public.club_rooms set status='playing'
    where id=p_room_id and game_id=p_game_id and status='open';
    if not found then raise exception 'Room is not available to start.' using errcode = '40001'; end if;
  end if;
  return v_revision;
end;
$function$;

revoke all on function public.club_commit_game_session(uuid,text,bigint,jsonb,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.club_commit_game_session(uuid,text,bigint,jsonb,jsonb,uuid,text)
  to service_role;
