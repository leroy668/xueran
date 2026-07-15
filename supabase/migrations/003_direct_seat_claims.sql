create or replace function public.xueran_sync_room(
  p_room_id uuid,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_ids uuid[];
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  update public.xueran_rooms
  set
    script_id = coalesce(nullif(p_state->>'scriptId', ''), script_id),
    phase = coalesce(nullif(p_state->>'phase', ''), phase),
    round = greatest(coalesce((p_state->>'round')::integer, round), 1)
  where id = p_room_id;

  insert into public.xueran_host_state(room_id, storyteller_notes, night_index)
  values (
    p_room_id,
    coalesce(p_state->>'storytellerNotes', ''),
    greatest(coalesce((p_state->>'nightIndex')::integer, 0), 0)
  )
  on conflict (room_id) do update
  set
    storyteller_notes = excluded.storyteller_notes,
    night_index = excluded.night_index;

  select coalesce(array_agg((item->>'id')::uuid), '{}'::uuid[])
  into player_ids
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item;

  delete from public.xueran_players
  where room_id = p_room_id
    and not (id = any(player_ids));

  insert into public.xueran_players(id, room_id, seat, name, alive)
  select
    (item->>'id')::uuid,
    p_room_id,
    greatest((item->>'seat')::integer, 1),
    coalesce(item->>'name', ''),
    coalesce((item->>'alive')::boolean, true)
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item
  on conflict (id) do update
  set
    room_id = excluded.room_id,
    seat = excluded.seat,
    name = case
      when public.xueran_players.is_claimed then public.xueran_players.name
      else excluded.name
    end,
    alive = excluded.alive;

  insert into public.xueran_identities(
    player_id,
    room_id,
    role_id,
    identity_message,
    host_notes
  )
  select
    (item->>'id')::uuid,
    p_room_id,
    coalesce(nullif(item->>'roleId', ''), 'washerwoman'),
    coalesce(item->>'identityMessage', ''),
    coalesce(item->>'notes', '')
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item
  on conflict (player_id) do update
  set
    room_id = excluded.room_id,
    role_id = excluded.role_id,
    identity_message = excluded.identity_message,
    host_notes = excluded.host_notes;
end;
$$;

revoke all on function public.xueran_sync_room(uuid, jsonb) from public;
grant execute on function public.xueran_sync_room(uuid, jsonb) to authenticated;

create or replace function public.xueran_claim_seat(
  p_room_id uuid,
  p_player_id uuid,
  p_player_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_player public.xueran_players;
  existing_owner uuid;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  clean_name := left(trim(coalesce(p_player_name, '')), 24);
  if clean_name = '' then
    raise exception 'player name required';
  end if;

  if not exists (
    select 1
    from public.xueran_rooms
    where id = p_room_id
      and status = 'open'
  ) then
    raise exception 'room is not open';
  end if;

  select *
  into target_player
  from public.xueran_players
  where id = p_player_id
    and room_id = p_room_id
  for update;

  if target_player.id is null then
    raise exception 'seat not found';
  end if;

  select claimed_by
  into existing_owner
  from public.xueran_identities
  where player_id = p_player_id;

  if target_player.is_claimed then
    if existing_owner = auth.uid() then
      return;
    end if;
    raise exception 'seat is already claimed';
  end if;

  if exists (
    select 1
    from public.xueran_identities
    where room_id = p_room_id
      and claimed_by = auth.uid()
  ) then
    raise exception 'device already claimed a seat';
  end if;

  update public.xueran_identities
  set
    claimed_by = auth.uid(),
    claimed_at = now()
  where player_id = p_player_id
    and room_id = p_room_id;

  if not found then
    raise exception 'seat identity not found';
  end if;

  update public.xueran_players
  set
    name = clean_name,
    is_claimed = true
  where id = p_player_id;

  insert into public.xueran_claim_requests(
    room_id,
    player_id,
    applicant_user_id,
    applicant_name,
    status
  )
  values (
    p_room_id,
    p_player_id,
    auth.uid(),
    clean_name,
    'approved'
  );
end;
$$;

revoke all on function public.xueran_claim_seat(uuid, uuid, text) from public;
grant execute on function public.xueran_claim_seat(uuid, uuid, text) to authenticated;

create or replace function public.xueran_revoke_claim(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  select room_id into target_room_id
  from public.xueran_players
  where id = p_player_id;

  if target_room_id is null or not public.xueran_is_host(target_room_id) then
    raise exception 'host access required';
  end if;

  update public.xueran_identities
  set claimed_by = null, claimed_at = null
  where player_id = p_player_id;

  update public.xueran_players
  set is_claimed = false, name = ''
  where id = p_player_id;

  update public.xueran_claim_requests
  set status = 'revoked'
  where player_id = p_player_id
    and status = 'approved';
end;
$$;

revoke all on function public.xueran_revoke_claim(uuid) from public;
grant execute on function public.xueran_revoke_claim(uuid) to authenticated;
