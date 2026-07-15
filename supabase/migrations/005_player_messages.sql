create table if not exists public.xueran_player_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  player_id uuid not null references public.xueran_players(id) on delete cascade,
  round integer not null check (round > 0),
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists xueran_player_messages_player_created_idx
  on public.xueran_player_messages(player_id, created_at desc);

create index if not exists xueran_player_messages_room_created_idx
  on public.xueran_player_messages(room_id, created_at desc);

alter table public.xueran_player_messages enable row level security;

drop policy if exists "xueran player messages are private" on public.xueran_player_messages;
create policy "xueran player messages are private"
on public.xueran_player_messages for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or exists (
    select 1
    from public.xueran_identities identity
    join public.xueran_rooms room on room.id = identity.room_id
    where identity.player_id = xueran_player_messages.player_id
      and identity.room_id = xueran_player_messages.room_id
      and identity.claimed_by = auth.uid()
      and room.status = 'open'
  )
);

grant select on public.xueran_player_messages to authenticated;
revoke all on public.xueran_player_messages from anon;

create or replace function public.xueran_send_player_message(
  p_room_id uuid,
  p_body text
)
returns public.xueran_player_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_body text;
  claimed_player_id uuid;
  current_round integer;
  new_message public.xueran_player_messages;
begin
  select identity.player_id, room.round
  into claimed_player_id, current_round
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
    claimed_player_id,
    greatest(coalesce(current_round, 1), 1),
    clean_body
  )
  returning * into new_message;

  return new_message;
end;
$$;

revoke all on function public.xueran_send_player_message(uuid, text) from public;
grant execute on function public.xueran_send_player_message(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'xueran_player_messages'
  ) then
    alter publication supabase_realtime
      add table public.xueran_player_messages;
  end if;
end;
$$;
