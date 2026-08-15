alter table public.xueran_day_resolutions
  add column if not exists executed_player_died boolean;

update public.xueran_day_resolutions
set executed_player_died = executed_player_was_alive
where executed_player_id is not null
  and executed_player_died is null;

create or replace function public.xueran_finalize_execution(
  p_room_id uuid,
  p_round integer,
  p_prevent_death boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_round integer;
  current_phase text;
  winner public.xueran_nominations;
  top_vote_count integer;
  top_count integer;
  existing_execution uuid;
  existing_execution_was_alive boolean;
  existing_execution_died boolean;
  winner_was_alive boolean;
  winner_died boolean;
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  select room.round, room.phase
  into current_round, current_phase
  from public.xueran_rooms room
  where room.id = p_room_id
    and room.status = 'open'
  for update;

  if current_round is null then
    raise exception 'room is not open';
  end if;
  if current_phase <> '白天' or current_round <> p_round then
    raise exception 'day voting round mismatch';
  end if;
  if exists (
    select 1 from public.xueran_nominations
    where room_id = p_room_id
      and round = p_round
      and status = 'open'
  ) then
    raise exception 'close the active nomination first';
  end if;

  select executed_player_id, executed_player_was_alive, executed_player_died
  into existing_execution, existing_execution_was_alive, existing_execution_died
  from public.xueran_day_resolutions
  where room_id = p_room_id and round = p_round;

  if found then
    return jsonb_build_object(
      'room_id', p_room_id,
      'round', p_round,
      'executed_player_id', existing_execution,
      'executed_player_was_alive', existing_execution_was_alive,
      'executed_player_died', existing_execution_died,
      'already_resolved', true
    );
  end if;

  select max(vote_count) into top_vote_count
  from public.xueran_nominations
  where room_id = p_room_id
    and round = p_round
    and status = 'closed';

  if top_vote_count is not null then
    select count(*) into top_count
    from public.xueran_nominations
    where room_id = p_room_id
      and round = p_round
      and status = 'closed'
      and vote_count = top_vote_count;

    if top_count = 1 then
      select * into winner
      from public.xueran_nominations
      where room_id = p_room_id
        and round = p_round
        and status = 'closed'
        and vote_count = top_vote_count
        and vote_count >= required_votes
      limit 1;
    end if;
  end if;

  if winner.id is not null then
    select alive into winner_was_alive
    from public.xueran_players
    where id = winner.nominee_player_id
      and room_id = p_room_id;
  end if;
  winner_died := coalesce(winner_was_alive, false) and not p_prevent_death;

  insert into public.xueran_day_resolutions(
    room_id,
    round,
    executed_player_id,
    executed_player_was_alive,
    executed_player_died
  )
  values (
    p_room_id,
    p_round,
    winner.nominee_player_id,
    winner_was_alive,
    winner_died
  );

  if winner.id is not null then
    update public.xueran_nominations
    set status = 'executed'
    where id = winner.id;

    if winner_died then
      update public.xueran_players
      set alive = false
      where id = winner.nominee_player_id
        and room_id = p_room_id;
    end if;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'round', p_round,
    'executed_player_id', winner.nominee_player_id,
    'executed_player_was_alive', winner_was_alive,
    'executed_player_died', winner_died,
    'vote_count', winner.vote_count,
    'required_votes', winner.required_votes,
    'already_resolved', false
  );
end;
$$;

revoke all on function public.xueran_finalize_execution(uuid, integer, boolean) from public;
grant execute on function public.xueran_finalize_execution(uuid, integer, boolean) to authenticated;
