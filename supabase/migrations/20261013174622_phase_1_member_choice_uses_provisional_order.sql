-- CHAMA LIVE Phase 1: cycle creation permission uses the shared backend role predicate, preserving Admin full control.
create or replace function public.cl_merry_create_cycle(
 p_group_id uuid,p_name text,p_contribution_amount numeric,p_frequency text,p_start_date date,
 p_number_of_rounds integer,p_payout_order_method text,p_member_order uuid[] default null,p_late_fine_amount numeric default 0
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_cycle uuid; v_members uuid[]; v_order uuid[]; v_count integer; i integer; v_due date; v_round uuid;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Not authorized to create cycle' using errcode='42501'; end if;
 if nullif(btrim(p_name),'') is null or p_contribution_amount<=0 or p_number_of_rounds<1 or p_frequency not in ('weekly','monthly') or p_payout_order_method not in ('admin','random','member_chosen') or coalesce(p_late_fine_amount,0)<0 then raise exception 'Invalid cycle settings' using errcode='22023'; end if;
 select array_agg(id order by created_at,id) into v_members from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 v_count:=coalesce(array_length(v_members,1),0);
 if v_count<2 then raise exception 'At least two active members are required' using errcode='22023'; end if;
 if p_number_of_rounds<>v_count then raise exception 'Number of rounds must match active member count (%).',v_count using errcode='22023'; end if;
 if p_payout_order_method='admin' then
  if coalesce(array_length(p_member_order,1),0)<>v_count then raise exception 'Provide the complete payout order' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_member_order) x)<>v_count or not (p_member_order @> v_members and v_members @> p_member_order) then raise exception 'Payout order must include every active member exactly once' using errcode='22023'; end if;
  v_order:=p_member_order;
 else select array_agg(id order by random()) into v_order from unnest(v_members) id;
 end if;
 insert into public.merry_go_round_cycles(group_id,name,contribution_amount,frequency,start_date,number_of_rounds,payout_order_method,late_fine_amount,created_by)
 values(p_group_id,btrim(p_name),p_contribution_amount,p_frequency,p_start_date,p_number_of_rounds,p_payout_order_method,coalesce(p_late_fine_amount,0),auth.uid()) returning id into v_cycle;
 for i in 1..p_number_of_rounds loop
  v_due:=case when p_frequency='weekly' then p_start_date+((i-1)*7) else (p_start_date + ((i-1)||' months')::interval)::date end;
  insert into public.merry_go_round_rounds(group_id,cycle_id,round_number,due_date,recipient_member_id,payout_amount) values(p_group_id,v_cycle,i,v_due,v_order[i],p_contribution_amount*v_count) returning id into v_round;
  insert into public.merry_go_round_payments(group_id,cycle_id,round_id,member_id,amount_due,late_fine_amount) select p_group_id,v_cycle,v_round,m,p_contribution_amount,0 from unnest(v_members) m;
  insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date) select p_group_id,v_cycle,v_round,m,'round_due','Merry-go-round contribution due for round '||i,v_due from unnest(v_members) m;
 end loop;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'create','merry_go_round_cycle',v_cycle::text,jsonb_build_object('name',p_name,'contribution_amount',p_contribution_amount,'frequency',p_frequency,'number_of_rounds',p_number_of_rounds,'payout_order_method',p_payout_order_method,'late_fine_amount',coalesce(p_late_fine_amount,0)));
 return v_cycle;
end; $$;
revoke all on function public.cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) from public,anon;
grant execute on function public.cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) to authenticated;