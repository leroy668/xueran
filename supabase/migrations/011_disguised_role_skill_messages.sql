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
      and (
        identity.role_id = p_role_id
        or nullif(identity.drunk_role_id, '') = p_role_id
      )
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
