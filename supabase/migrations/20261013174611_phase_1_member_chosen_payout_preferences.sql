-- CHAMA LIVE Phase 1: member-chosen payout-round preferences.
create table if not exists public.merry_go_round_preferences(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.groups(id) on delete cascade,
 cycle_id uuid not null references public.merry_go_round_cycles(id) on delete cascade,
 member_id uuid not null references public.members(id) on delete cascade,preferred_round_number integer not null check(preferred_round_number>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(cycle_id,member_id),unique(cycle_id,preferred_round_number));
create index if not exists merry_preferences_cycle_idx on public.merry_go_round_preferences(cycle_id,preferred_round_number);
alter table public.merry_go_round_preferences enable row level security;
drop policy if exists merry_preferences_read on public.merry_go_round_preferences;
create policy merry_preferences_read on public.merry_go_round_preferences for select to authenticated using(
 exists(select 1 from public.members m where m.group_id=merry_go_round_preferences.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active')
 and exists(select 1 from public.groups g where g.id=merry_go_round_preferences.group_id and g.merry_go_round_enabled)
 and (member_id in(select m.id from public.members m where m.group_id=merry_go_round_preferences.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())) or public.cl_user_has_role(group_id,array['admin','chairperson','treasurer','secretary']::text[])));
revoke all on public.merry_go_round_preferences from anon,authenticated;
grant select on public.merry_go_round_preferences to authenticated;
create or replace function public.cl_merry_choose_round(p_group_id uuid,p_cycle_id uuid,p_round_number integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_member uuid; v_cycle public.merry_go_round_cycles%rowtype;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null then raise exception 'Cycle not found' using errcode='P0002'; end if;
 if v_cycle.payout_order_method<>'member_chosen' then raise exception 'This cycle does not use member-chosen payout order' using errcode='22023'; end if;
 if v_cycle.status<>'active' or p_round_number<1 or p_round_number>v_cycle.number_of_rounds then raise exception 'Invalid payout round choice' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and due_date<=current_date) then raise exception 'Choices are closed after the first round starts' using errcode='22023'; end if;
 insert into public.merry_go_round_preferences(group_id,cycle_id,member_id,preferred_round_number) values(p_group_id,p_cycle_id,v_member,p_round_number)
 on conflict(cycle_id,member_id) do update set preferred_round_number=excluded.preferred_round_number,updated_at=now();
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_member,'choose_payout_round','merry_go_round_preference',p_cycle_id::text,jsonb_build_object('preferred_round_number',p_round_number));
 return true;
end; $$;
create or replace function public.cl_merry_list_preferences(p_group_id uuid,p_cycle_id uuid)
returns table(member_id uuid,member_name text,preferred_round_number integer,updated_at timestamptz) language plpgsql security definer stable set search_path=public,pg_temp as $$
begin
 perform public.cl_merry_authorize(p_group_id,false);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Only group officials can view all payout choices' using errcode='42501'; end if;
 return query select p.member_id,m.name,p.preferred_round_number,p.updated_at from public.merry_go_round_preferences p join public.members m on m.id=p.member_id where p.group_id=p_group_id and p.cycle_id=p_cycle_id order by p.preferred_round_number,m.name;
end; $$;
create or replace function public.cl_merry_apply_preferences(p_group_id uuid,p_cycle_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_cycle public.merry_go_round_cycles%rowtype; v_active_count integer; v_pref_count integer;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then raise exception 'Your role cannot finalize member payout choices' using errcode='42501'; end if;
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null or v_cycle.payout_order_method<>'member_chosen' then raise exception 'Member-chosen cycle not found' using errcode='P0002'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and (status<>'pending' or due_date<=current_date)) then raise exception 'Payout choices can only be applied before the first round starts' using errcode='22023'; end if;
 select count(*) into v_active_count from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 select count(*) into v_pref_count from public.merry_go_round_preferences where group_id=p_group_id and cycle_id=p_cycle_id;
 if v_pref_count<>v_active_count then raise exception 'Every active member must choose a unique round first (% of % submitted)',v_pref_count,v_active_count using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences p where p.cycle_id=p_cycle_id and (p.preferred_round_number<1 or p.preferred_round_number>v_cycle.number_of_rounds)) then raise exception 'Invalid preferred round' using errcode='22023'; end if;
 update public.merry_go_round_rounds r set recipient_member_id=p.member_id from public.merry_go_round_preferences p where r.cycle_id=p_cycle_id and p.cycle_id=p_cycle_id and r.round_number=p.preferred_round_number;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'apply_member_payout_choices','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('preference_count',v_pref_count));
 return true;
end; $$;
revoke all on function public.cl_merry_choose_round(uuid,uuid,integer) from public,anon;
revoke all on function public.cl_merry_list_preferences(uuid,uuid) from public,anon;
revoke all on function public.cl_merry_apply_preferences(uuid,uuid) from public,anon;
grant execute on function public.cl_merry_choose_round(uuid,uuid,integer) to authenticated;
grant execute on function public.cl_merry_list_preferences(uuid,uuid) to authenticated;
grant execute on function public.cl_merry_apply_preferences(uuid,uuid) to authenticated;