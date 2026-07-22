drop policy if exists "xueran day private threads belong to participants"
  on public.xueran_day_private_threads;
drop policy if exists "xueran room members see day private threads"
  on public.xueran_day_private_threads;

create policy "xueran room members see day private threads"
on public.xueran_day_private_threads for select
to authenticated
using (
  public.xueran_is_host(room_id)
  or public.xueran_is_room_player(room_id)
);

-- Only the conversation pair is public. Message rows and their bodies keep the
-- participant-or-host policy defined in 017_day_private_chat.sql.
