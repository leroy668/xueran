create extension if not exists pgcrypto;

create table if not exists public.xueran_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '今晚的钟楼',
  script_id text not null default 'trouble-brewing',
  phase text not null default '准备' check (phase in ('准备', '白天', '夜晚')),
  round integer not null default 1 check (round > 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xueran_host_state (
  room_id uuid primary key references public.xueran_rooms(id) on delete cascade,
  storyteller_notes text not null default '',
  night_index integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.xueran_players (
  id uuid primary key,
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  seat integer not null check (seat > 0),
  name text not null default '',
  alive boolean not null default true,
  is_claimed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists xueran_players_room_seat_idx
  on public.xueran_players(room_id, seat);

create table if not exists public.xueran_identities (
  player_id uuid primary key references public.xueran_players(id) on delete cascade,
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  role_id text not null,
  identity_message text not null default '',
  host_notes text not null default '',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists xueran_identities_room_claimed_idx
  on public.xueran_identities(room_id, claimed_by);

create unique index if not exists xueran_one_identity_per_device
  on public.xueran_identities(room_id, claimed_by)
  where claimed_by is not null;

create table if not exists public.xueran_claim_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.xueran_rooms(id) on delete cascade,
  player_id uuid not null references public.xueran_players(id) on delete cascade,
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists xueran_one_pending_claim_per_device
  on public.xueran_claim_requests(player_id, applicant_user_id)
  where status = 'pending';

create or replace function public.xueran_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists xueran_rooms_updated_at on public.xueran_rooms;
create trigger xueran_rooms_updated_at
before update on public.xueran_rooms
for each row execute function public.xueran_set_updated_at();

drop trigger if exists xueran_host_state_updated_at on public.xueran_host_state;
create trigger xueran_host_state_updated_at
before update on public.xueran_host_state
for each row execute function public.xueran_set_updated_at();

drop trigger if exists xueran_players_updated_at on public.xueran_players;
create trigger xueran_players_updated_at
before update on public.xueran_players
for each row execute function public.xueran_set_updated_at();

drop trigger if exists xueran_identities_updated_at on public.xueran_identities;
create trigger xueran_identities_updated_at
before update on public.xueran_identities
for each row execute function public.xueran_set_updated_at();

drop trigger if exists xueran_claim_requests_updated_at on public.xueran_claim_requests;
create trigger xueran_claim_requests_updated_at
before update on public.xueran_claim_requests
for each row execute function public.xueran_set_updated_at();

create or replace function public.xueran_is_host(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xueran_rooms
    where id = target_room_id
      and host_user_id = auth.uid()
  );
$$;

revoke all on function public.xueran_is_host(uuid) from public;
grant execute on function public.xueran_is_host(uuid) to authenticated;

alter table public.xueran_rooms enable row level security;
alter table public.xueran_host_state enable row level security;
alter table public.xueran_players enable row level security;
alter table public.xueran_identities enable row level security;
alter table public.xueran_claim_requests enable row level security;

drop policy if exists "xueran authenticated users can find rooms" on public.xueran_rooms;
create policy "xueran authenticated users can find rooms"
on public.xueran_rooms for select
to authenticated
using (true);

drop policy if exists "xueran hosts can create rooms" on public.xueran_rooms;
create policy "xueran hosts can create rooms"
on public.xueran_rooms for insert
to authenticated
with check (host_user_id = auth.uid());

drop policy if exists "xueran hosts can update rooms" on public.xueran_rooms;
create policy "xueran hosts can update rooms"
on public.xueran_rooms for update
to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

drop policy if exists "xueran hosts can delete rooms" on public.xueran_rooms;
create policy "xueran hosts can delete rooms"
on public.xueran_rooms for delete
to authenticated
using (host_user_id = auth.uid());

drop policy if exists "xueran hosts manage private state" on public.xueran_host_state;
create policy "xueran hosts manage private state"
on public.xueran_host_state for all
to authenticated
using (public.xueran_is_host(room_id))
with check (public.xueran_is_host(room_id));

drop policy if exists "xueran players are visible in open rooms" on public.xueran_players;
create policy "xueran players are visible in open rooms"
on public.xueran_players for select
to authenticated
using (
  exists (
    select 1 from public.xueran_rooms
    where id = room_id and status = 'open'
  )
  or public.xueran_is_host(room_id)
);

drop policy if exists "xueran hosts manage players" on public.xueran_players;
create policy "xueran hosts manage players"
on public.xueran_players for all
to authenticated
using (public.xueran_is_host(room_id))
with check (public.xueran_is_host(room_id));

drop policy if exists "xueran identities are private" on public.xueran_identities;
create policy "xueran identities are private"
on public.xueran_identities for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or (
    claimed_by = auth.uid()
    and exists (
      select 1 from public.xueran_rooms
      where id = room_id and status = 'open'
    )
  )
);

drop policy if exists "xueran hosts manage identities" on public.xueran_identities;
create policy "xueran hosts manage identities"
on public.xueran_identities for all
to authenticated
using (public.xueran_is_host(room_id))
with check (public.xueran_is_host(room_id));

drop policy if exists "xueran claim requests are private" on public.xueran_claim_requests;
create policy "xueran claim requests are private"
on public.xueran_claim_requests for select
to authenticated
using (
  applicant_user_id = auth.uid()
  or public.xueran_is_host(room_id)
);

drop policy if exists "xueran players can request a seat" on public.xueran_claim_requests;
create policy "xueran players can request a seat"
on public.xueran_claim_requests for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.xueran_players p
    join public.xueran_rooms r on r.id = p.room_id
    where p.id = player_id
      and p.room_id = room_id
      and not p.is_claimed
      and r.status = 'open'
  )
);

drop policy if exists "xueran hosts update claim requests" on public.xueran_claim_requests;
create policy "xueran hosts update claim requests"
on public.xueran_claim_requests for update
to authenticated
using (public.xueran_is_host(room_id))
with check (public.xueran_is_host(room_id));

drop policy if exists "xueran claim owners can cancel" on public.xueran_claim_requests;
create policy "xueran claim owners can cancel"
on public.xueran_claim_requests for delete
to authenticated
using (
  (applicant_user_id = auth.uid() and status = 'pending')
  or public.xueran_is_host(room_id)
);

grant select, insert, update, delete on public.xueran_rooms to authenticated;
grant select, insert, update, delete on public.xueran_host_state to authenticated;
grant select, insert, update, delete on public.xueran_players to authenticated;
grant select, insert, update, delete on public.xueran_identities to authenticated;
grant select, insert, update, delete on public.xueran_claim_requests to authenticated;

revoke all on public.xueran_rooms from anon;
revoke all on public.xueran_host_state from anon;
revoke all on public.xueran_players from anon;
revoke all on public.xueran_identities from anon;
revoke all on public.xueran_claim_requests from anon;

create or replace function public.xueran_create_room(
  p_title text default '今晚的钟楼',
  p_script_id text default 'trouble-brewing',
  p_phase text default '准备',
  p_round integer default 1
)
returns public.xueran_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room public.xueran_rooms;
  candidate text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.xueran_rooms (
        code, host_user_id, title, script_id, phase, round
      )
      values (
        candidate,
        auth.uid(),
        coalesce(nullif(trim(p_title), ''), '今晚的钟楼'),
        coalesce(nullif(p_script_id, ''), 'trouble-brewing'),
        coalesce(nullif(p_phase, ''), '准备'),
        greatest(coalesce(p_round, 1), 1)
      )
      returning * into new_room;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;

  insert into public.xueran_host_state(room_id)
  values (new_room.id);

  return new_room;
end;
$$;

revoke all on function public.xueran_create_room(text, text, text, integer) from public;
grant execute on function public.xueran_create_room(text, text, text, integer) to authenticated;

create or replace function public.xueran_sync_room(
  p_room_id uuid,
  p_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  player_ids uuid[];
begin
  if not public.xueran_is_host(p_room_id) then
    raise exception 'host access required';
  end if;

  update public.xueran_rooms
  set
    script_id = coalesce(nullif(p_state->>'scriptId', ''), script_id),
    phase = coalesce(nullif(p_state->>'phase', ''), phase),
    round = greatest(coalesce((p_state->>'round')::integer, round), 1)
  where id = p_room_id;

  insert into public.xueran_host_state(room_id, storyteller_notes, night_index)
  values (
    p_room_id,
    coalesce(p_state->>'storytellerNotes', ''),
    greatest(coalesce((p_state->>'nightIndex')::integer, 0), 0)
  )
  on conflict (room_id) do update
  set
    storyteller_notes = excluded.storyteller_notes,
    night_index = excluded.night_index;

  select coalesce(array_agg((item->>'id')::uuid), '{}'::uuid[])
  into player_ids
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item;

  delete from public.xueran_players
  where room_id = p_room_id
    and not (id = any(player_ids));

  insert into public.xueran_players(id, room_id, seat, name, alive)
  select
    (item->>'id')::uuid,
    p_room_id,
    greatest((item->>'seat')::integer, 1),
    coalesce(item->>'name', ''),
    coalesce((item->>'alive')::boolean, true)
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item
  on conflict (id) do update
  set
    room_id = excluded.room_id,
    seat = excluded.seat,
    name = excluded.name,
    alive = excluded.alive;

  insert into public.xueran_identities(
    player_id,
    room_id,
    role_id,
    identity_message,
    host_notes
  )
  select
    (item->>'id')::uuid,
    p_room_id,
    coalesce(nullif(item->>'roleId', ''), 'washerwoman'),
    coalesce(item->>'identityMessage', ''),
    coalesce(item->>'notes', '')
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) item
  on conflict (player_id) do update
  set
    room_id = excluded.room_id,
    role_id = excluded.role_id,
    identity_message = excluded.identity_message,
    host_notes = excluded.host_notes;
end;
$$;

revoke all on function public.xueran_sync_room(uuid, jsonb) from public;
grant execute on function public.xueran_sync_room(uuid, jsonb) to authenticated;

create or replace function public.xueran_approve_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.xueran_claim_requests;
begin
  select *
  into request_row
  from public.xueran_claim_requests
  where id = p_claim_id
  for update;

  if request_row.id is null or not public.xueran_is_host(request_row.room_id) then
    raise exception 'host access required';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'claim is no longer pending';
  end if;

  if exists (
    select 1 from public.xueran_identities
    where player_id = request_row.player_id
      and claimed_by is not null
  ) then
    raise exception 'player is already claimed';
  end if;

  update public.xueran_identities
  set
    claimed_by = request_row.applicant_user_id,
    claimed_at = now()
  where player_id = request_row.player_id;

  update public.xueran_players
  set is_claimed = true
  where id = request_row.player_id;

  update public.xueran_claim_requests
  set status = case when id = p_claim_id then 'approved' else 'rejected' end
  where player_id = request_row.player_id
    and status = 'pending';
end;
$$;

revoke all on function public.xueran_approve_claim(uuid) from public;
grant execute on function public.xueran_approve_claim(uuid) to authenticated;

create or replace function public.xueran_revoke_claim(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  select room_id into target_room_id
  from public.xueran_players
  where id = p_player_id;

  if target_room_id is null or not public.xueran_is_host(target_room_id) then
    raise exception 'host access required';
  end if;

  update public.xueran_identities
  set claimed_by = null, claimed_at = null
  where player_id = p_player_id;

  update public.xueran_players
  set is_claimed = false
  where id = p_player_id;

  update public.xueran_claim_requests
  set status = 'revoked'
  where player_id = p_player_id
    and status = 'approved';
end;
$$;

revoke all on function public.xueran_revoke_claim(uuid) from public;
grant execute on function public.xueran_revoke_claim(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'xueran_players',
    'xueran_claim_requests',
    'xueran_identities',
    'xueran_rooms'
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
