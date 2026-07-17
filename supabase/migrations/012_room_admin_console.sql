create extension if not exists pgcrypto with schema extensions;

create table if not exists public.xueran_admin_settings (
  id boolean primary key default true check (id),
  token_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.xueran_admin_settings enable row level security;

revoke all on table public.xueran_admin_settings from public;
revoke all on table public.xueran_admin_settings from anon;
revoke all on table public.xueran_admin_settings from authenticated;

create or replace function public.xueran_has_admin_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.xueran_admin_settings settings
    where settings.id
      and settings.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.xueran_has_admin_token(text) from public;

create or replace function public.xueran_admin_list_rooms(p_token text)
returns table (
  room_id uuid,
  code text,
  title text,
  script_id text,
  phase text,
  round integer,
  simulation_enabled boolean,
  player_count bigint,
  claimed_count bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.xueran_has_admin_token(p_token) then
    raise exception 'invalid admin token';
  end if;

  return query
  select
    room.id,
    room.code,
    room.title,
    room.script_id,
    room.phase,
    room.round,
    room.simulation_enabled,
    count(player.id) as player_count,
    count(player.id) filter (where player.is_claimed) as claimed_count,
    room.created_at,
    room.updated_at
  from public.xueran_rooms room
  left join public.xueran_players player on player.room_id = room.id
  where room.status = 'open'
  group by room.id
  order by room.updated_at desc;
end;
$$;

create or replace function public.xueran_admin_close_room(
  p_token text,
  p_room_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  changed_rows integer;
begin
  if not public.xueran_has_admin_token(p_token) then
    raise exception 'invalid admin token';
  end if;

  update public.xueran_rooms
  set status = 'closed', updated_at = now()
  where id = p_room_id
    and status = 'open';

  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;

revoke all on function public.xueran_admin_list_rooms(text) from public;
revoke all on function public.xueran_admin_close_room(text, uuid) from public;
grant execute on function public.xueran_admin_list_rooms(text) to authenticated;
grant execute on function public.xueran_admin_close_room(text, uuid) to authenticated;
