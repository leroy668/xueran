create or replace function public.xueran_admin_close_all_rooms(p_token text)
returns integer
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
  where status = 'open';

  get diagnostics changed_rows = row_count;
  return changed_rows;
end;
$$;

create or replace function public.xueran_admin_delete_all_rooms(p_token text)
returns integer
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

  delete from public.xueran_rooms;

  get diagnostics changed_rows = row_count;
  return changed_rows;
end;
$$;

revoke all on function public.xueran_admin_close_all_rooms(text) from public;
revoke all on function public.xueran_admin_delete_all_rooms(text) from public;
grant execute on function public.xueran_admin_close_all_rooms(text) to authenticated;
grant execute on function public.xueran_admin_delete_all_rooms(text) to authenticated;
