drop function if exists public.xueran_admin_list_rooms(text);

create or replace function public.xueran_admin_list_rooms(p_token text)
returns table (
  room_id uuid,
  code text,
  title text,
  script_id text,
  phase text,
  round integer,
  status text,
  simulation_enabled boolean,
  player_count bigint,
  claimed_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.xueran_has_admin_token(p_token) then
    raise exception 'invalid admin token';
  end if;

  return query
  select
    room.id,
    room.code,
    room.title,
    room.script_id,
    room.phase,
    room.round,
    room.status,
    room.simulation_enabled,
    count(player.id) as player_count,
    count(player.id) filter (where player.is_claimed) as claimed_count,
    room.created_at,
    room.updated_at
  from public.xueran_rooms room
  left join public.xueran_players player on player.room_id = room.id
  group by room.id
  order by
    case when room.status = 'open' then 0 else 1 end,
    room.updated_at desc;
end;
$$;

create or replace function public.xueran_admin_delete_room(
  p_token text,
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed_rows integer;
begin
  if not public.xueran_has_admin_token(p_token) then
    raise exception 'invalid admin token';
  end if;

  delete from public.xueran_rooms
  where id = p_room_id;

  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;

revoke all on function public.xueran_admin_list_rooms(text) from public;
revoke all on function public.xueran_admin_delete_room(text, uuid) from public;
grant execute on function public.xueran_admin_list_rooms(text) to authenticated;
grant execute on function public.xueran_admin_delete_room(text, uuid) to authenticated;
