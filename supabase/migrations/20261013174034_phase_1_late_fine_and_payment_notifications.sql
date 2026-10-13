-- CHAMA LIVE Phase 1 follow-up: assess configured late fines and create member in-app notifications.
create or replace function public.cl_merry_record_payment(p_group_id uuid,p_payment_id uuid,p_amount numeric)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; p public.merry_go_round_payments%rowtype; v_status text; v_due_date date; v_fine numeric;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if p_amount<0 then raise exception 'Amount cannot be negative' using errcode='22023'; end if;
 select * into p from public.merry_go_round_payments where id=p_payment_id and group_id=p_group_id for update;
 if p.id is null then raise exception 'Payment entry not found' using errcode='P0002'; end if;
 select r.due_date,c.late_fine_amount into v_due_date,v_fine from public.merry_go_round_rounds r join public.merry_go_round_cycles c on c.id=r.cycle_id where r.id=p.round_id;
 if p_amount>p.amount_due then raise exception 'Payment exceeds the contribution amount due' using errcode='22023'; end if;
 v_status:=case when p_amount>=p.amount_due then 'paid' when current_date>v_due_date then 'late' else 'pending' end;
 update public.merry_go_round_payments set amount_paid=p_amount,status=v_status,paid_at=case when v_status='paid' then now() else null end,
 late_fine_amount=case when current_date>v_due_date and p_amount<p.amount_due then coalesce(v_fine,0) else 0 end,
 recorded_by=auth.uid(),updated_at=now() where id=p_payment_id;
 update public.merry_go_round_rounds r set status=case when not exists(select 1 from public.merry_go_round_payments x where x.round_id=r.id and x.status<>'paid') then 'ready_for_payout' else 'pending' end where r.id=p.round_id and r.status<>'completed';
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 select p_group_id,p.cycle_id,p.round_id,p.member_id,case when v_status='paid' then 'payment_recorded' when v_status='late' then 'payment_late' else 'payment_updated' end,
 case when v_status='paid' then 'Your merry-go-round contribution has been marked paid.' when v_status='late' then 'Your merry-go-round contribution is late. Applicable late fine: KES '||coalesce(v_fine,0)||'.' else 'Your merry-go-round payment status was updated.' end,v_due_date;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'record_payment','merry_go_round_payment',p_payment_id::text,jsonb_build_object('amount_paid',p_amount,'status',v_status,'late_fine_amount',case when current_date>v_due_date and p_amount<p.amount_due then coalesce(v_fine,0) else 0 end));
 return v_status;
end; $$;
revoke all on function public.cl_merry_record_payment(uuid,uuid,numeric) from public,anon;
grant execute on function public.cl_merry_record_payment(uuid,uuid,numeric) to authenticated;
