-- Align feedback submission identity with CHAMA LIVE's canonical member lookup.
drop policy if exists "authenticated members can submit own group feedback" on public.feedback;

create policy "authenticated members can submit own group feedback"
on public.feedback
for insert
to authenticated
with check (
  member_id in (
    select m.id
    from public.members m
    where (m.user_id = (select auth.uid()) or m.auth_user_id = (select auth.uid()))
      and m.group_id = feedback.group_id
  )
  and group_id in (
    select m.group_id
    from public.members m
    where m.user_id = (select auth.uid()) or m.auth_user_id = (select auth.uid())
  )
  and length(trim(message)) between 1 and 5000
  and length(trim(page)) between 1 and 300
);
