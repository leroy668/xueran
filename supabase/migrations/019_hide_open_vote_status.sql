create or replace function public.xueran_can_view_vote(
  target_nomination_id uuid,
  target_voter_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xueran_nominations nomination
    where nomination.id = target_nomination_id
      and (
        public.xueran_is_host(nomination.room_id)
        or (
          public.xueran_is_room_player(nomination.room_id)
          and (
            nomination.status <> 'open'
            or exists (
              select 1
              from public.xueran_identities identity
              join public.xueran_players player
                on player.id = identity.player_id
              where identity.room_id = nomination.room_id
                and identity.player_id = target_voter_player_id
                and identity.claimed_by = auth.uid()
                and player.room_id = nomination.room_id
                and player.is_claimed
            )
          )
        )
      )
  );
$$;

revoke all on function public.xueran_can_view_vote(uuid, uuid) from public;
grant execute on function public.xueran_can_view_vote(uuid, uuid) to authenticated;

drop policy if exists "xueran room members see votes"
  on public.xueran_votes;

create policy "xueran room members see votes"
on public.xueran_votes for select
to authenticated
using (
  public.xueran_can_view_vote(nomination_id, voter_player_id)
);
