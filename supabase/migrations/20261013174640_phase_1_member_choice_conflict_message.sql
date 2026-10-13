-- CHAMA LIVE Phase 1: friendly validation for duplicate member-selected rounds.
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
 if exists(select 1 from public.merry_go_round_preferences where cycle_id=p_cycle_id and preferred_round_number=p_round_number and member_id<>v_member) then raise exception 'That round has already been chosen by another member. Choose another round.' using errcode='23505'; end if;
 insert into public.merry_go_round_preferences(group_id,cycle_id,member_id,preferred_round_number) values(p_group_id,p_cycle_id,v_member,p_round_number) on conflict(cycle_id,member_id) do update set preferred_round_number=excluded.preferred_round_number,updated_at=now();
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_member,'choose_payout_round','merry_go_round_preference',p_cycle_id::text,jsonb_build_object('preferred_round_number',p_round_number));
 return true;
end; $$;
revoke all on function public.cl_merry_choose_round(uuid,uuid,integer) from public,anon;
grant execute on function public.cl_merry_choose_round(uuid,uuid,integer) to authenticated;