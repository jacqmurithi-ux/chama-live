-- Pilot onboarding support: feedback is submitted by the signed-in member,
-- but only verified platform owners may read feedback. Group officials must not
-- be able to browse feedback from their own or other groups.
begin;

drop policy if exists "members can submit feedback" on public.feedback;
drop policy if exists "secretary/admin read feedback" on public.feedback;
drop policy if exists "platform owners can read feedback" on public.feedback;

alter table public.feedback enable row level security;

revoke all on table public.feedback from anon;
revoke all on table public.feedback from authenticated;
grant insert on table public.feedback to authenticated;
grant select on table public.feedback to authenticated;

create policy "authenticated members can submit own group feedback"
on public.feedback
for insert
to authenticated
with check (
  member_id in (
    select m.id
    from public.members m
    where m.user_id = (select auth.uid())
      and m.group_id = feedback.group_id
  )
  and group_id in (
    select m.group_id
    from public.members m
    where m.user_id = (select auth.uid())
  )
  and length(trim(message)) between 1 and 5000
  and length(trim(page)) between 1 and 300
);

create policy "platform owners can read feedback"
on public.feedback
for select
to authenticated
using ((select public.is_platform_admin()));

commit;
