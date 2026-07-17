create table if not exists public.xueran_nominations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  round integer not null check (round > 0),
  nominator_player_id uuid not null references public.xueran_players(id) on delete cascade,
  nominee_player_id uuid not null references public.xueran_players(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed', 'executed')),
  vote_count integer not null default 0 check (vote_count >= 0),
  required_votes integer check (required_votes is null or required_votes > 0),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index if not exists xueran_nominations_nominator_day_idx
  on public.xueran_nominations(room_id, round, nominator_player_id);

create unique index if not exists xueran_nominations_nominee_day_idx
  on public.xueran_nominations(room_id, round, nominee_player_id);

create unique index if not exists xueran_nominations_one_open_idx
  on public.xueran_nominations(room_id, round)
  where status = 'open';

create index if not exists xueran_nominations_room_round_idx
  on public.xueran_nominations(room_id, round, created_at);

create table if not exists public.xueran_votes (
  id uuid primary key default gen_random_uuid(),
  nomination_id uuid not null references public.xueran_nominations(id) on delete cascade,
  voter_player_id uuid not null references public.xueran_players(id) on delete cascade,
  voter_was_alive boolean not null,
  created_at timestamptz not null default now(),
  unique (nomination_id, voter_player_id)
);

create unique index if not exists xueran_votes_one_dead_vote_idx
  on public.xueran_votes(voter_player_id)
  where not voter_was_alive;

create index if not exists xueran_votes_nomination_idx
  on public.xueran_votes(nomination_id, created_at);

create table if not exists public.xueran_day_resolutions (
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  round integer not null check (round > 0),
  executed_player_id uuid references public.xueran_players(id) on delete set null,
  resolved_at timestamptz not null default now(),
  primary key (room_id, round)
);

create or replace function public.xueran_is_room_player(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xueran_identities identity
    join public.xueran_players player on player.id = identity.player_id
    join public.xueran_rooms room on room.id = identity.room_id
    where identity.room_id = target_room_id
      and identity.claimed_by = auth.uid()
      and player.room_id = target_room_id
      and player.is_claimed
      and room.status = 'open'
  );
$$;

revoke all on function public.xueran_is_room_player(uuid) from public;
grant execute on function public.xueran_is_room_player(uuid) to authenticated;

alter table public.xueran_nominations enable row level security;
alter table public.xueran_votes enable row level security;
alter table public.xueran_day_resolutions enable row level security;

drop policy if exists "xueran room members see nominations" on public.xueran_nominations;
create policy "xueran room members see nominations"
on public.xueran_nominations for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or public.xueran_is_room_player(room_id)
);

drop policy if exists "xueran room members see votes" on public.xueran_votes;
create policy "xueran room members see votes"
on public.xueran_votes for select
to authenticated
using (
  exists (
    select 1
    from public.xueran_nominations nomination
    where nomination.id = nomination_id
      and (
        public.xueran_is_host(nomination.room_id)
        or public.xueran_is_room_player(nomination.room_id)
      )
  )
);

drop policy if exists "xueran room members see day resolutions" on public.xueran_day_resolutions;
create policy "xueran room members see day resolutions"
on public.xueran_day_resolutions for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or public.xueran_is_room_player(room_id)
);

grant select on public.xueran_nominations to authenticated;
grant select on public.xueran_votes to authenticated;
grant select on public.xueran_day_resolutions to authenticated;
revoke all on public.xueran_nominations from anon;
revoke all on public.xueran_votes from anon;
revoke all on public.xueran_day_resolutions from anon;

create or replace function public.xueran_nominate(
  p_room_id uuid,
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
  nominator_id uuid;
  nominator_alive boolean;
  new_nomination public.xueran_nominations;
begin
  select room.round, room.phase
  into current_round, current_phase
  from public.xueran_rooms room
  where room.id = p_room_id
    and room.status = 'open'
  for update;

  if current_round is null then
    raise exception 'room is not open';
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

  select identity.player_id, player.alive
  into nominator_id, nominator_alive
  from public.xueran_identities identity
  join public.xueran_players player on player.id = identity.player_id
  where identity.room_id = p_room_id
    and identity.claimed_by = auth.uid()
    and player.room_id = p_room_id
    and player.is_claimed
  limit 1;

  if nominator_id is null then
    raise exception 'claimed player access required';
  end if;
  if not nominator_alive then
    raise exception 'only alive players may nominate';
  end if;
  if not exists (
    select 1 from public.xueran_players
    where id = p_nominee_player_id and room_id = p_room_id
  ) then
    raise exception 'nominee not found';
  end if;
  if exists (
    select 1 from public.xueran_nominations
    where room_id = p_room_id
      and round = current_round
      and status = 'open'
  ) then
    raise exception 'another nomination is currently open';
  end if;
  if exists (
    select 1 from public.xueran_nominations
    where room_id = p_room_id
      and round = current_round
      and nominator_player_id = nominator_id
  ) then
    raise exception 'player has already nominated today';
  end if;
  if exists (
    select 1 from public.xueran_nominations
    where room_id = p_room_id
      and round = current_round
      and nominee_player_id = p_nominee_player_id
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
    nominator_id,
    p_nominee_player_id
  )
  returning * into new_nomination;

  return new_nomination;
end;
$$;

revoke all on function public.xueran_nominate(uuid, uuid) from public;
grant execute on function public.xueran_nominate(uuid, uuid) to authenticated;

create or replace function public.xueran_cast_vote(p_nomination_id uuid)
returns public.xueran_votes
language plpgsql
security definer
set search_path = public
as $$
declare
  target_nomination public.xueran_nominations;
  voter_id uuid;
  voter_alive boolean;
  new_vote public.xueran_votes;
begin
  select * into target_nomination
  from public.xueran_nominations
  where id = p_nomination_id
  for update;

  if target_nomination.id is null or target_nomination.status <> 'open' then
    raise exception 'nomination is not open';
  end if;
  if not exists (
    select 1 from public.xueran_rooms
    where id = target_nomination.room_id
      and status = 'open'
      and phase = '白天'
      and round = target_nomination.round
  ) then
    raise exception 'voting is not available';
  end if;

  select identity.player_id, player.alive
  into voter_id, voter_alive
  from public.xueran_identities identity
  join public.xueran_players player on player.id = identity.player_id
  where identity.room_id = target_nomination.room_id
    and identity.claimed_by = auth.uid()
    and player.room_id = target_nomination.room_id
    and player.is_claimed
  limit 1;

  if voter_id is null then
    raise exception 'claimed player access required';
  end if;
  if exists (
    select 1 from public.xueran_votes
    where nomination_id = p_nomination_id
      and voter_player_id = voter_id
  ) then
    raise exception 'player has already voted on this nomination';
  end if;
  if not voter_alive and exists (
    select 1 from public.xueran_votes
    where voter_player_id = voter_id
      and not voter_was_alive
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
    voter_id,
    voter_alive
  )
  returning * into new_vote;

  return new_vote;
end;
$$;

revoke all on function public.xueran_cast_vote(uuid) from public;
grant execute on function public.xueran_cast_vote(uuid) to authenticated;

create or replace function public.xueran_close_nomination(p_nomination_id uuid)
returns public.xueran_nominations
language plpgsql
security definer
set search_path = public
as $$
declare
  target_nomination public.xueran_nominations;
  tally integer;
  alive_count integer;
begin
  select * into target_nomination
  from public.xueran_nominations
  where id = p_nomination_id
  for update;

  if target_nomination.id is null or target_nomination.status <> 'open' then
    raise exception 'nomination is not open';
  end if;
  if not public.xueran_is_host(target_nomination.room_id) then
    raise exception 'host access required';
  end if;
  if not exists (
    select 1 from public.xueran_rooms
    where id = target_nomination.room_id
      and status = 'open'
      and phase = '白天'
      and round = target_nomination.round
  ) then
    raise exception 'voting is not available';
  end if;

  select count(*) into tally
  from public.xueran_votes
  where nomination_id = p_nomination_id;

  select count(*) into alive_count
  from public.xueran_players
  where room_id = target_nomination.room_id
    and alive;

  update public.xueran_nominations
  set
    status = 'closed',
    vote_count = tally,
    required_votes = greatest(1, (alive_count + 1) / 2),
    closed_at = now()
  where id = p_nomination_id
  returning * into target_nomination;

  return target_nomination;
end;
$$;

revoke all on function public.xueran_close_nomination(uuid) from public;
grant execute on function public.xueran_close_nomination(uuid) to authenticated;

create or replace function public.xueran_finalize_execution(
  p_room_id uuid,
  p_round integer
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

  select executed_player_id into existing_execution
  from public.xueran_day_resolutions
  where room_id = p_room_id and round = p_round;

  if found then
    return jsonb_build_object(
      'room_id', p_room_id,
      'round', p_round,
      'executed_player_id', existing_execution,
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

  insert into public.xueran_day_resolutions(
    room_id,
    round,
    executed_player_id
  )
  values (
    p_room_id,
    p_round,
    winner.nominee_player_id
  );

  if winner.id is not null then
    update public.xueran_nominations
    set status = 'executed'
    where id = winner.id;

    update public.xueran_players
    set alive = false
    where id = winner.nominee_player_id
      and room_id = p_room_id;
  end if;

  return jsonb_build_object(
    'room_id', p_room_id,
    'round', p_round,
    'executed_player_id', winner.nominee_player_id,
    'vote_count', winner.vote_count,
    'required_votes', winner.required_votes,
    'already_resolved', false
  );
end;
$$;

revoke all on function public.xueran_finalize_execution(uuid, integer) from public;
grant execute on function public.xueran_finalize_execution(uuid, integer) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'xueran_nominations',
    'xueran_votes',
    'xueran_day_resolutions'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;

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

  delete from public.xueran_day_resolutions where room_id = p_room_id;
  delete from public.xueran_nominations where room_id = p_room_id;
  delete from public.xueran_night_messages where room_id = p_room_id;
  delete from public.xueran_player_messages where room_id = p_room_id;
  delete from public.xueran_evil_messages where room_id = p_room_id;

  update public.xueran_rooms
  set phase = '夜晚', round = 1
  where id = p_room_id;

  insert into public.xueran_host_state(room_id, storyteller_notes, night_index)
  values (p_room_id, '', 0)
  on conflict (room_id) do update
  set storyteller_notes = '', night_index = 0;

  update public.xueran_players
  set alive = true
  where room_id = p_room_id;

  update public.xueran_identities
  set identity_message = '', host_notes = ''
  where room_id = p_room_id;
end;
$$;

revoke all on function public.xueran_reset_room(uuid) from public;
grant execute on function public.xueran_reset_room(uuid) to authenticated;
