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
