alter table public.xueran_identities
  add column if not exists drunk_role_id text not null default '';

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
    drunk_role_id,
    identity_message,
    host_notes
  )
  select
    (item->>'id')::uuid,
    p_room_id,
    coalesce(nullif(item->>'roleId', ''), 'washerwoman'),
    case
      when item->>'roleId' = 'drunk'
        then coalesce(item->>'drunkRoleId', '')
      else ''
    end,
    coalesce(item->>'identityMessage', ''),
    coalesce(item->>'notes', '')
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item
  on conflict (player_id) do update
  set
    room_id = excluded.room_id,
    role_id = excluded.role_id,
    drunk_role_id = excluded.drunk_role_id,
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
