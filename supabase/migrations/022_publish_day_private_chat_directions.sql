create or replace function public.xueran_get_day_private_chat_direction_stats(
  p_room_id uuid
)
returns table (
  thread_id uuid,
  room_id uuid,
  round integer,
  sender_player_id uuid,
  recipient_player_id uuid,
  message_count integer,
  estimated_seconds integer,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.xueran_is_host(p_room_id)
    or public.xueran_is_room_player(p_room_id)
  ) then
    raise exception 'claimed player access required';
  end if;

  return query
  select
    thread.id,
    thread.room_id,
    thread.round,
    message.sender_player_id,
    message.recipient_player_id,
    count(message.id)::integer,
    coalesce(sum(message.estimated_seconds), 0)::integer,
    max(message.created_at)
  from public.xueran_day_private_threads thread
  inner join public.xueran_day_private_messages message
    on message.thread_id = thread.id
  where thread.room_id = p_room_id
  group by
    thread.id,
    thread.room_id,
    thread.round,
    message.sender_player_id,
    message.recipient_player_id
  order by
    thread.round desc,
    max(message.created_at) desc;
end;
$$;

revoke all on function public.xueran_get_day_private_chat_direction_stats(uuid)
  from public;
grant execute on function public.xueran_get_day_private_chat_direction_stats(uuid)
  to authenticated;
