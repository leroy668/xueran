create or replace function public.xueran_simulate_player_message(
  p_room_id uuid,
  p_player_id uuid,
  p_body text
)
returns public.xueran_player_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  current_round integer;
  new_message public.xueran_player_messages;
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  select room.round
  into current_round
  from public.xueran_rooms room
  join public.xueran_players player on player.room_id = room.id
  where room.id = p_room_id
    and room.status = 'open'
    and room.simulation_enabled
    and player.id = p_player_id
    and player.is_claimed
    and player.is_simulated;

  if current_round is null then
    raise exception 'simulated player access required';
  end if;

  clean_body := trim(coalesce(p_body, ''));
  if clean_body = '' then
    raise exception 'message body required';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message body too long';
  end if;

  insert into public.xueran_player_messages(
    room_id,
    player_id,
    round,
    body
  )
  values (
    p_room_id,
    p_player_id,
    greatest(coalesce(current_round, 1), 1),
    clean_body
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_simulate_player_message(uuid, uuid, text)
  from public;
grant execute on function public.xueran_simulate_player_message(uuid, uuid, text)
  to authenticated;
