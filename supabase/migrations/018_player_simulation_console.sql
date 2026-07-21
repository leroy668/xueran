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
    and player.is_claimed;

  if current_round is null then
    raise exception 'simulation player access required';
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

create or replace function public.xueran_simulate_day_private_message(
  p_room_id uuid,
  p_sender_player_id uuid,
  p_recipient_player_id uuid,
  p_body text
)
returns public.xueran_day_private_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  current_round integer;
  current_phase text;
  player_a uuid;
  player_b uuid;
  target_thread_id uuid;
  speech_seconds integer;
  new_message public.xueran_day_private_messages;
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  select room.round, room.phase
  into current_round, current_phase
  from public.xueran_rooms room
  where room.id = p_room_id
    and room.status = 'open'
    and room.simulation_enabled;

  if current_round is null then
    raise exception 'simulation mode required';
  end if;
  if current_phase <> '白天' then
    raise exception 'private chat is only available during the day';
  end if;
  if p_sender_player_id = p_recipient_player_id then
    raise exception 'cannot send a private message to yourself';
  end if;
  if (
    select count(*)
    from public.xueran_players player
    where player.room_id = p_room_id
      and player.is_claimed
      and player.id in (p_sender_player_id, p_recipient_player_id)
  ) <> 2 then
    raise exception 'both players must be seated';
  end if;

  clean_body := trim(coalesce(p_body, ''));
  if clean_body = '' then
    raise exception 'message body required';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message body too long';
  end if;

  if p_sender_player_id::text < p_recipient_player_id::text then
    player_a := p_sender_player_id;
    player_b := p_recipient_player_id;
  else
    player_a := p_recipient_player_id;
    player_b := p_sender_player_id;
  end if;

  insert into public.xueran_day_private_threads(
    room_id,
    round,
    player_a_id,
    player_b_id
  )
  values (
    p_room_id,
    greatest(current_round, 1),
    player_a,
    player_b
  )
  on conflict (room_id, round, player_a_id, player_b_id)
  do update set updated_at = now()
  returning id into target_thread_id;

  speech_seconds := greatest(
    1,
    ceil(
      char_length(regexp_replace(clean_body, '[[:space:]]', '', 'g')) / 4.0
    )::integer
  );

  insert into public.xueran_day_private_messages(
    thread_id,
    room_id,
    round,
    sender_player_id,
    recipient_player_id,
    body,
    estimated_seconds
  )
  values (
    target_thread_id,
    p_room_id,
    greatest(current_round, 1),
    p_sender_player_id,
    p_recipient_player_id,
    clean_body,
    speech_seconds
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_simulate_day_private_message(
  uuid,
  uuid,
  uuid,
  text
) from public;
grant execute on function public.xueran_simulate_day_private_message(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;

create or replace function public.xueran_simulate_nominate(
  p_room_id uuid,
  p_nominator_player_id uuid,
  p_nominee_player_id uuid
)
returns public.xueran_nominations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_round integer;
  current_phase text;
  nominator_alive boolean;
  new_nomination public.xueran_nominations;
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  select room.round, room.phase
  into current_round, current_phase
  from public.xueran_rooms room
  where room.id = p_room_id
    and room.status = 'open'
    and room.simulation_enabled
  for update;

  if current_round is null then
    raise exception 'simulation mode required';
  end if;
  if current_phase <> '白天' then
    raise exception 'nominations are only available during the day';
  end if;
  if exists (
    select 1 from public.xueran_day_resolutions resolution
    where resolution.room_id = p_room_id
      and resolution.round = current_round
  ) then
    raise exception 'day voting is already resolved';
  end if;

  select player.alive
  into nominator_alive
  from public.xueran_players player
  where player.id = p_nominator_player_id
    and player.room_id = p_room_id
    and player.is_claimed;

  if nominator_alive is null then
    raise exception 'simulation player access required';
  end if;
  if not nominator_alive then
    raise exception 'only alive players may nominate';
  end if;
  if not exists (
    select 1 from public.xueran_players player
    where player.id = p_nominee_player_id
      and player.room_id = p_room_id
      and player.is_claimed
  ) then
    raise exception 'nominee not found';
  end if;
  if exists (
    select 1 from public.xueran_nominations nomination
    where nomination.room_id = p_room_id
      and nomination.round = current_round
      and nomination.status = 'open'
  ) then
    raise exception 'another nomination is currently open';
  end if;
  if exists (
    select 1 from public.xueran_nominations nomination
    where nomination.room_id = p_room_id
      and nomination.round = current_round
      and nomination.nominator_player_id = p_nominator_player_id
  ) then
    raise exception 'player has already nominated today';
  end if;
  if exists (
    select 1 from public.xueran_nominations nomination
    where nomination.room_id = p_room_id
      and nomination.round = current_round
      and nomination.nominee_player_id = p_nominee_player_id
  ) then
    raise exception 'player has already been nominated today';
  end if;

  insert into public.xueran_nominations(
    room_id,
    round,
    nominator_player_id,
    nominee_player_id
  )
  values (
    p_room_id,
    current_round,
    p_nominator_player_id,
    p_nominee_player_id
  )
  returning * into new_nomination;

  return new_nomination;
end;
$$;

revoke all on function public.xueran_simulate_nominate(uuid, uuid, uuid)
  from public;
grant execute on function public.xueran_simulate_nominate(uuid, uuid, uuid)
  to authenticated;

create or replace function public.xueran_simulate_cast_vote(
  p_nomination_id uuid,
  p_voter_player_id uuid
)
returns public.xueran_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  target_nomination public.xueran_nominations;
  voter_alive boolean;
  new_vote public.xueran_votes;
begin
  select nomination.* into target_nomination
  from public.xueran_nominations nomination
  where nomination.id = p_nomination_id
  for update;

  if target_nomination.id is null or target_nomination.status <> 'open' then
    raise exception 'nomination is not open';
  end if;
  if not public.xueran_is_host(target_nomination.room_id) then
    raise exception 'host access required';
  end if;
  if not exists (
    select 1 from public.xueran_rooms room
    where room.id = target_nomination.room_id
      and room.status = 'open'
      and room.simulation_enabled
      and room.phase = '白天'
      and room.round = target_nomination.round
  ) then
    raise exception 'voting is not available';
  end if;

  select player.alive
  into voter_alive
  from public.xueran_players player
  where player.id = p_voter_player_id
    and player.room_id = target_nomination.room_id
    and player.is_claimed;

  if voter_alive is null then
    raise exception 'simulation player access required';
  end if;
  if exists (
    select 1 from public.xueran_votes vote
    where vote.nomination_id = p_nomination_id
      and vote.voter_player_id = p_voter_player_id
  ) then
    raise exception 'player has already voted on this nomination';
  end if;
  if not voter_alive and exists (
    select 1
    from public.xueran_votes vote
    join public.xueran_nominations nomination
      on nomination.id = vote.nomination_id
    where vote.voter_player_id = p_voter_player_id
      and not vote.voter_was_alive
      and nomination.room_id = target_nomination.room_id
  ) then
    raise exception 'dead vote has already been used';
  end if;

  insert into public.xueran_votes(
    nomination_id,
    voter_player_id,
    voter_was_alive
  )
  values (
    p_nomination_id,
    p_voter_player_id,
    voter_alive
  )
  returning * into new_vote;

  return new_vote;
end;
$$;

revoke all on function public.xueran_simulate_cast_vote(uuid, uuid)
  from public;
grant execute on function public.xueran_simulate_cast_vote(uuid, uuid)
  to authenticated;
