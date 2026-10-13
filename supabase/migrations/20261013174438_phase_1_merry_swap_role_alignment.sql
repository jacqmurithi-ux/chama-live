-- CHAMA LIVE Phase 1: align server-side payout swap permissions with the shared role matrix.
create or replace function public.cl_merry_swap_recipients(p_group_id uuid,p_cycle_id uuid,p_round_a integer,p_round_b integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; a public.merry_go_round_rounds%rowtype; b public.merry_go_round_rounds%rowtype;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then raise exception 'Your role cannot change payout order' using errcode='42501'; end if;
 select * into a from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_a for update;
 select * into b from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_b for update;
 if a.id is null or b.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if a.status<>'pending' or b.status<>'pending' or a.due_date<=current_date or b.due_date<=current_date then raise exception 'Payout order can only change before both rounds start' using errcode='22023'; end if;
 update public.merry_go_round_rounds set recipient_member_id=case when id=a.id then b.recipient_member_id else a.recipient_member_id end where id in (a.id,b.id);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'swap_payout_order','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('round_a',p_round_a,'round_b',p_round_b));
 return true;
end; $$;
revoke all on function public.cl_merry_swap_recipients(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.cl_merry_swap_recipients(uuid,uuid,integer,integer) to authenticated;