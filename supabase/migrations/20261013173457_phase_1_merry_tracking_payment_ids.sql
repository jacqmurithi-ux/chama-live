-- CHAMA LIVE Phase 1 follow-up: expose payment IDs for authenticated official payment actions.
create or replace function public.cl_merry_tracking(p_group_id uuid,p_cycle_id uuid)
returns table(round_id uuid,round_number integer,due_date date,recipient_member_id uuid,recipient_name text,round_status text,payout_amount numeric,paid_count bigint,pending_count bigint,late_count bigint,member_payments jsonb)
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare v_member uuid;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 if not exists(select 1 from public.merry_go_round_cycles c where c.id=p_cycle_id and c.group_id=p_group_id) then raise exception 'Cycle not found' using errcode='P0002'; end if;
 return query
 select r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount,
 count(p.id) filter(where p.status='paid'),count(p.id) filter(where p.status='pending'),count(p.id) filter(where p.status='late'),
 jsonb_agg(jsonb_build_object('payment_id',p.id,'member_id',p.member_id,'member_name',pm.name,'amount_due',p.amount_due,'amount_paid',p.amount_paid,'late_fine_amount',p.late_fine_amount,'status',case when p.status<>'paid' and current_date>r.due_date then 'late' else p.status end) order by pm.name)
 from public.merry_go_round_rounds r join public.members m on m.id=r.recipient_member_id
 join public.merry_go_round_payments p on p.round_id=r.id join public.members pm on pm.id=p.member_id
 where r.group_id=p_group_id and r.cycle_id=p_cycle_id
 group by r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount order by r.round_number;
end; $$;
revoke all on function public.cl_merry_tracking(uuid,uuid) from public,anon;
grant execute on function public.cl_merry_tracking(uuid,uuid) to authenticated;
