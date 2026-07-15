alter table public.xueran_rooms
  add column if not exists simulation_enabled boolean not null default false;

alter table public.xueran_players
  add column if not exists is_simulated boolean not null default false;

create or replace function public.xueran_set_simulated_players(
  p_room_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  if not exists (
    select 1
    from public.xueran_rooms
    where id = p_room_id
      and status = 'open'
  ) then
    raise exception 'room is not open';
  end if;

  update public.xueran_rooms
  set simulation_enabled = coalesce(p_enabled, false)
  where id = p_room_id;

  if coalesce(p_enabled, false) then
    update public.xueran_players
    set
      name = '测试玩家 ' || lpad(seat::text, 2, '0'),
      is_claimed = true,
      is_simulated = true
    where room_id = p_room_id
      and not is_claimed;
  else
    update public.xueran_players
    set
      name = '',
      is_claimed = false,
      is_simulated = false
    where room_id = p_room_id
      and is_simulated;
  end if;
end;
$$;

revoke all on function public.xueran_set_simulated_players(uuid, boolean) from public;
grant execute on function public.xueran_set_simulated_players(uuid, boolean) to authenticated;

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
  set
    is_claimed = false,
    is_simulated = false,
    name = ''
  where id = p_player_id;

  update public.xueran_claim_requests
  set status = 'revoked'
  where player_id = p_player_id
    and status = 'approved';
end;
$$;

revoke all on function public.xueran_revoke_claim(uuid) from public;
grant execute on function public.xueran_revoke_claim(uuid) to authenticated;

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
  simulation_is_enabled boolean;
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

  select simulation_enabled
  into simulation_is_enabled
  from public.xueran_rooms
  where id = p_room_id;

  if simulation_is_enabled then
    update public.xueran_players
    set
      name = '测试玩家 ' || lpad(seat::text, 2, '0'),
      is_claimed = true,
      is_simulated = true
    where room_id = p_room_id
      and not is_claimed;
  end if;
end;
$$;

revoke all on function public.xueran_sync_room(uuid, jsonb) from public;
grant execute on function public.xueran_sync_room(uuid, jsonb) to authenticated;

create or replace function public.xueran_send_night_message(
  p_room_id uuid,
  p_player_id uuid,
  p_role_id text,
  p_round integer,
  p_body text
)
returns public.xueran_night_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  new_message public.xueran_night_messages;
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  if not exists (
    select 1
    from public.xueran_rooms
    where id = p_room_id
      and status = 'open'
  ) then
    raise exception 'room is not open';
  end if;

  clean_body := trim(coalesce(p_body, ''));
  if clean_body = '' then
    raise exception 'message body required';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message body too long';
  end if;

  if not exists (
    select 1
    from public.xueran_players player
    join public.xueran_identities identity on identity.player_id = player.id
    where player.id = p_player_id
      and player.room_id = p_room_id
      and player.is_claimed
      and identity.room_id = p_room_id
      and identity.role_id = p_role_id
      and (identity.claimed_by is not null or player.is_simulated)
  ) then
    raise exception 'claimed player with matching role not found';
  end if;

  insert into public.xueran_night_messages(
    room_id,
    player_id,
    role_id,
    round,
    body
  )
  values (
    p_room_id,
    p_player_id,
    p_role_id,
    greatest(coalesce(p_round, 1), 1),
    clean_body
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_send_night_message(uuid, uuid, text, integer, text) from public;
grant execute on function public.xueran_send_night_message(uuid, uuid, text, integer, text) to authenticated;
