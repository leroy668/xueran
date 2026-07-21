create table if not exists public.xueran_day_private_threads (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  round integer not null check (round > 0),
  player_a_id uuid not null references public.xueran_players(id) on delete cascade,
  player_b_id uuid not null references public.xueran_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a_id <> player_b_id),
  unique (room_id, round, player_a_id, player_b_id)
);

create index if not exists xueran_day_private_threads_room_updated_idx
  on public.xueran_day_private_threads(room_id, updated_at desc);

create index if not exists xueran_day_private_threads_player_a_idx
  on public.xueran_day_private_threads(player_a_id, updated_at desc);

create index if not exists xueran_day_private_threads_player_b_idx
  on public.xueran_day_private_threads(player_b_id, updated_at desc);

drop trigger if exists xueran_day_private_threads_updated_at
  on public.xueran_day_private_threads;
create trigger xueran_day_private_threads_updated_at
before update on public.xueran_day_private_threads
for each row execute function public.xueran_set_updated_at();

create table if not exists public.xueran_day_private_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.xueran_day_private_threads(id) on delete cascade,
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  round integer not null check (round > 0),
  sender_player_id uuid not null references public.xueran_players(id) on delete cascade,
  recipient_player_id uuid not null references public.xueran_players(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  estimated_seconds integer not null check (estimated_seconds > 0),
  created_at timestamptz not null default now(),
  check (sender_player_id <> recipient_player_id)
);

create index if not exists xueran_day_private_messages_thread_created_idx
  on public.xueran_day_private_messages(thread_id, created_at);

create index if not exists xueran_day_private_messages_room_created_idx
  on public.xueran_day_private_messages(room_id, created_at desc);

alter table public.xueran_day_private_threads enable row level security;
alter table public.xueran_day_private_messages enable row level security;

drop policy if exists "xueran day private threads belong to participants"
  on public.xueran_day_private_threads;
create policy "xueran day private threads belong to participants"
on public.xueran_day_private_threads for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or exists (
    select 1
    from public.xueran_identities identity
    join public.xueran_rooms room on room.id = identity.room_id
    where identity.room_id = xueran_day_private_threads.room_id
      and identity.claimed_by = auth.uid()
      and identity.player_id in (
        xueran_day_private_threads.player_a_id,
        xueran_day_private_threads.player_b_id
      )
      and room.status = 'open'
  )
);

drop policy if exists "xueran day private messages belong to participants"
  on public.xueran_day_private_messages;
create policy "xueran day private messages belong to participants"
on public.xueran_day_private_messages for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or exists (
    select 1
    from public.xueran_identities identity
    join public.xueran_rooms room on room.id = identity.room_id
    where identity.room_id = xueran_day_private_messages.room_id
      and identity.claimed_by = auth.uid()
      and identity.player_id in (
        xueran_day_private_messages.sender_player_id,
        xueran_day_private_messages.recipient_player_id
      )
      and room.status = 'open'
  )
);

grant select on public.xueran_day_private_threads to authenticated;
grant select on public.xueran_day_private_messages to authenticated;
revoke all on public.xueran_day_private_threads from anon;
revoke all on public.xueran_day_private_messages from anon;

create or replace function public.xueran_send_day_private_message(
  p_room_id uuid,
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
  claimed_player_id uuid;
  current_round integer;
  current_phase text;
  player_a uuid;
  player_b uuid;
  target_thread_id uuid;
  speech_seconds integer;
  new_message public.xueran_day_private_messages;
begin
  select identity.player_id, room.round, room.phase
  into claimed_player_id, current_round, current_phase
  from public.xueran_identities identity
  join public.xueran_rooms room on room.id = identity.room_id
  join public.xueran_players player on player.id = identity.player_id
  where identity.room_id = p_room_id
    and identity.claimed_by = auth.uid()
    and player.room_id = p_room_id
    and player.is_claimed
    and room.status = 'open'
  limit 1;

  if claimed_player_id is null then
    raise exception 'claimed player access required';
  end if;
  if current_phase <> '白天' then
    raise exception 'private chat is only available during the day';
  end if;
  if p_recipient_player_id = claimed_player_id then
    raise exception 'cannot send a private message to yourself';
  end if;
  if not exists (
    select 1
    from public.xueran_players player
    where player.id = p_recipient_player_id
      and player.room_id = p_room_id
      and player.is_claimed
  ) then
    raise exception 'recipient player is not seated';
  end if;

  clean_body := trim(coalesce(p_body, ''));
  if clean_body = '' then
    raise exception 'message body required';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message body too long';
  end if;

  if claimed_player_id::text < p_recipient_player_id::text then
    player_a := claimed_player_id;
    player_b := p_recipient_player_id;
  else
    player_a := p_recipient_player_id;
    player_b := claimed_player_id;
  end if;

  insert into public.xueran_day_private_threads(
    room_id,
    round,
    player_a_id,
    player_b_id
  )
  values (
    p_room_id,
    greatest(coalesce(current_round, 1), 1),
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
    greatest(coalesce(current_round, 1), 1),
    claimed_player_id,
    p_recipient_player_id,
    clean_body,
    speech_seconds
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_send_day_private_message(uuid, uuid, text)
  from public;
grant execute on function public.xueran_send_day_private_message(uuid, uuid, text)
  to authenticated;

create or replace function public.xueran_get_day_private_chat_stats(
  p_room_id uuid
)
returns table (
  player_id uuid,
  conversation_count integer,
  message_count integer,
  estimated_seconds integer,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.xueran_is_room_player(p_room_id) then
    raise exception 'claimed player access required';
  end if;

  return query
  select
    player.id,
    count(distinct thread.id)::integer,
    count(message.id)::integer,
    coalesce(sum(message.estimated_seconds), 0)::integer,
    max(message.created_at)
  from public.xueran_players player
  left join public.xueran_day_private_threads thread
    on thread.room_id = player.room_id
   and (
     thread.player_a_id = player.id
     or thread.player_b_id = player.id
   )
  left join public.xueran_day_private_messages message
    on message.thread_id = thread.id
  where player.room_id = p_room_id
    and player.is_claimed
  group by player.id, player.seat
  order by player.seat;
end;
$$;

revoke all on function public.xueran_get_day_private_chat_stats(uuid)
  from public;
grant execute on function public.xueran_get_day_private_chat_stats(uuid)
  to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'xueran_day_private_threads',
    'xueran_day_private_messages'
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

  delete from public.xueran_day_private_messages where room_id = p_room_id;
  delete from public.xueran_day_private_threads where room_id = p_room_id;
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
