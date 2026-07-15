create or replace function public.xueran_is_evil_role(target_role_id text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(target_role_id, '') = any (
    array[
      'poisoner',
      'scarlet-woman',
      'baron',
      'spy',
      'imp'
    ]::text[]
  );
$$;

revoke all on function public.xueran_is_evil_role(text) from public;
grant execute on function public.xueran_is_evil_role(text) to authenticated;

create table if not exists public.xueran_evil_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('host', 'player')),
  sender_player_id uuid references public.xueran_players(id) on delete cascade,
  round integer not null check (round > 0),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  check (
    (sender_kind = 'host' and sender_player_id is null)
    or (sender_kind = 'player' and sender_player_id is not null)
  )
);

create index if not exists xueran_evil_messages_room_created_idx
  on public.xueran_evil_messages(room_id, created_at desc);

alter table public.xueran_evil_messages enable row level security;

drop policy if exists "xueran evil messages are private" on public.xueran_evil_messages;
create policy "xueran evil messages are private"
on public.xueran_evil_messages for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or exists (
    select 1
    from public.xueran_identities identity
    join public.xueran_rooms room on room.id = identity.room_id
    join public.xueran_players player on player.id = identity.player_id
    where identity.room_id = xueran_evil_messages.room_id
      and identity.claimed_by = auth.uid()
      and public.xueran_is_evil_role(identity.role_id)
      and player.room_id = xueran_evil_messages.room_id
      and player.is_claimed
      and room.status = 'open'
      and room.phase <> '准备'
  )
);

grant select on public.xueran_evil_messages to authenticated;
revoke all on public.xueran_evil_messages from anon;

create or replace function public.xueran_send_evil_message(
  p_room_id uuid,
  p_body text
)
returns public.xueran_evil_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  current_round integer;
  current_phase text;
  current_status text;
  claimed_player_id uuid;
  message_sender_kind text;
  new_message public.xueran_evil_messages;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select room.round, room.phase, room.status
  into current_round, current_phase, current_status
  from public.xueran_rooms room
  where room.id = p_room_id;

  if current_status is null or current_status <> 'open' then
    raise exception 'room is not open';
  end if;

  if current_phase = '准备' then
    raise exception 'game has not started';
  end if;

  if public.xueran_is_host(p_room_id) then
    message_sender_kind := 'host';
  else
    select identity.player_id
    into claimed_player_id
    from public.xueran_identities identity
    join public.xueran_players player on player.id = identity.player_id
    where identity.room_id = p_room_id
      and identity.claimed_by = auth.uid()
      and public.xueran_is_evil_role(identity.role_id)
      and player.room_id = p_room_id
      and player.is_claimed
    limit 1;

    if claimed_player_id is null then
      raise exception 'evil player access required';
    end if;

    message_sender_kind := 'player';
  end if;

  clean_body := trim(coalesce(p_body, ''));
  if clean_body = '' then
    raise exception 'message body required';
  end if;
  if char_length(clean_body) > 500 then
    raise exception 'message body too long';
  end if;

  insert into public.xueran_evil_messages(
    room_id,
    sender_kind,
    sender_player_id,
    round,
    body
  )
  values (
    p_room_id,
    message_sender_kind,
    claimed_player_id,
    greatest(coalesce(current_round, 1), 1),
    clean_body
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_send_evil_message(uuid, text) from public;
grant execute on function public.xueran_send_evil_message(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'xueran_evil_messages'
  ) then
    alter publication supabase_realtime
      add table public.xueran_evil_messages;
  end if;
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

  delete from public.xueran_night_messages
  where room_id = p_room_id;

  delete from public.xueran_player_messages
  where room_id = p_room_id;

  delete from public.xueran_evil_messages
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
