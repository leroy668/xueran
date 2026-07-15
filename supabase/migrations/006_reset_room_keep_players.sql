create or replace function public.xueran_reset_room(p_room_id uuid)
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

  delete from public.xueran_night_messages
  where room_id = p_room_id;

  delete from public.xueran_player_messages
  where room_id = p_room_id;

  update public.xueran_rooms
  set
    phase = '准备',
    round = 1
  where id = p_room_id;

  insert into public.xueran_host_state(
    room_id,
    storyteller_notes,
    night_index
  )
  values (
    p_room_id,
    '',
    0
  )
  on conflict (room_id) do update
  set
    storyteller_notes = '',
    night_index = 0;

  update public.xueran_players
  set alive = true
  where room_id = p_room_id;

  update public.xueran_identities
  set
    identity_message = '',
    host_notes = ''
  where room_id = p_room_id;
end;
$$;

revoke all on function public.xueran_reset_room(uuid) from public;
grant execute on function public.xueran_reset_room(uuid) to authenticated;
