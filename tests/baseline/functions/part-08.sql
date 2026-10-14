-- STAGE ONLY: production function definitions; ordinal rows 71-80 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_merry_authorize(p_group_id uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.merry_go_round_enabled) then
   raise exception 'Merry-go-round is disabled for this group' using errcode='42501';
 end if;
 select m.id into v_member_id from public.members m where m.group_id=p_group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active'
 order by m.created_at limit 1;
 if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
 if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
   raise exception 'View-only: you do not have permission to manage merry-go-round' using errcode='42501';
 end if;
 return v_member_id;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_choose_round(p_group_id uuid, p_cycle_id uuid, p_round_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid; v_cycle public.merry_go_round_cycles%rowtype;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null then raise exception 'Cycle not found' using errcode='P0002'; end if;
 if v_cycle.payout_order_method<>'member_chosen' then raise exception 'This cycle does not use member-chosen payout order' using errcode='22023'; end if;
 if v_cycle.status<>'active' or p_round_number<1 or p_round_number>v_cycle.number_of_rounds then raise exception 'Invalid payout round choice' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and due_date<=current_date) then raise exception 'Choices are closed after the first round starts' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences where cycle_id=p_cycle_id and preferred_round_number=p_round_number and member_id<>v_member) then raise exception 'That round has already been chosen by another member. Choose another round.' using errcode='23505'; end if;
 insert into public.merry_go_round_preferences(group_id,cycle_id,member_id,preferred_round_number) values(p_group_id,p_cycle_id,v_member,p_round_number)
 on conflict(cycle_id,member_id) do update set preferred_round_number=excluded.preferred_round_number,updated_at=now();
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_member,'choose_payout_round','merry_go_round_preference',p_cycle_id::text,jsonb_build_object('preferred_round_number',p_round_number));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_complete_payout(p_group_id uuid, p_round_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; r public.merry_go_round_rounds%rowtype; v_recipient_name text;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 select * into r from public.merry_go_round_rounds where id=p_round_id and group_id=p_group_id for update;
 if r.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if r.status='completed' then return true; end if;
 if exists(select 1 from public.merry_go_round_payments p where p.round_id=r.id and p.status<>'paid') then
  raise exception 'All round contributions must be paid before payout' using errcode='22023';
 end if;
 update public.merry_go_round_rounds set status='completed',payout_recorded_at=now(),payout_recorded_by=auth.uid() where id=r.id;
 update public.merry_go_round_cycles set status='completed',updated_at=now()
 where id=r.cycle_id and not exists(select 1 from public.merry_go_round_rounds x where x.cycle_id=r.cycle_id and x.status<>'completed');
 select name into v_recipient_name from public.members where id=r.recipient_member_id;
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,r.cycle_id,r.id,r.recipient_member_id,'payout_recorded','Your merry-go-round payout of '||r.payout_amount||' has been recorded.',r.due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'complete_payout','merry_go_round_round',r.id::text,jsonb_build_object('recipient_member_id',r.recipient_member_id,'recipient_name',v_recipient_name,'payout_amount',r.payout_amount));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_create_cycle(p_group_id uuid, p_name text, p_contribution_amount numeric, p_frequency text, p_start_date date, p_number_of_rounds integer, p_payout_order_method text, p_member_order uuid[] DEFAULT NULL::uuid[], p_late_fine_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_delete_cycle(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_cycle public.merry_go_round_cycles%rowtype;
  v_round_count integer;
  v_payment_count integer;
begin
  v_actor := public.cl_merry_authorize(p_group_id, true);

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only the group Admin can delete a merry-go-round cycle' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id
  for update;

  if v_cycle.id is null then
    raise exception 'Cycle not found in this group' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.merry_go_round_payments p
    where p.cycle_id = p_cycle_id
      and (coalesce(p.amount_paid, 0) > 0 or p.status = 'paid' or p.recorded_by is not null)
  ) then
    raise exception 'This cycle has recorded payment activity. It cannot be deleted; keep its payment history.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.merry_go_round_rounds r
    where r.cycle_id = p_cycle_id
      and (r.status = 'completed' or r.payout_recorded_at is not null or r.payout_recorded_by is not null)
  ) then
    raise exception 'This cycle has a recorded payout or completed round and cannot be deleted.' using errcode = '22023';
  end if;

  select count(*) into v_round_count
  from public.merry_go_round_rounds where cycle_id = p_cycle_id;
  select count(*) into v_payment_count
  from public.merry_go_round_payments where cycle_id = p_cycle_id;

  insert into public.group_audit_log(
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor, 'delete', 'merry_go_round_cycle', p_cycle_id::text,
    jsonb_build_object(
      'name', v_cycle.name,
      'status', v_cycle.status,
      'number_of_rounds', v_cycle.number_of_rounds,
      'round_count', v_round_count,
      'payment_record_count', v_payment_count
    )
  );

  delete from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_list_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, preferred_round_number integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform public.cl_merry_authorize(p_group_id,false);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Only group officials can view all payout choices' using errcode='42501'; end if;
 return query select p.member_id,m.name,p.preferred_round_number,p.updated_at
 from public.merry_go_round_preferences p join public.members m on m.id=p.member_id
 where p.group_id=p_group_id and p.cycle_id=p_cycle_id order by p.preferred_round_number,m.name;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_record_payment(p_group_id uuid, p_payment_id uuid, p_amount numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; p public.merry_go_round_payments%rowtype; v_status text; v_due_date date; v_fine numeric; v_late boolean;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if p_amount<0 then raise exception 'Amount cannot be negative' using errcode='22023'; end if;
 select * into p from public.merry_go_round_payments where id=p_payment_id and group_id=p_group_id for update;
 if p.id is null then raise exception 'Payment entry not found' using errcode='P0002'; end if;
 select r.due_date,c.late_fine_amount into v_due_date,v_fine from public.merry_go_round_rounds r join public.merry_go_round_cycles c on c.id=r.cycle_id where r.id=p.round_id;
 if p_amount>p.amount_due then raise exception 'Payment exceeds the contribution amount due' using errcode='22023'; end if;
 v_late:=current_date>v_due_date;
 v_status:=case when p_amount>=p.amount_due then 'paid' when v_late then 'late' else 'pending' end;
 update public.merry_go_round_payments set amount_paid=p_amount,status=v_status,paid_at=case when v_status='paid' then now() else null end,
 late_fine_amount=case when v_late then coalesce(v_fine,0) else 0 end,
 recorded_by=auth.uid(),updated_at=now() where id=p_payment_id;
 update public.merry_go_round_rounds r set status=case when not exists(select 1 from public.merry_go_round_payments x where x.round_id=r.id and x.status<>'paid') then 'ready_for_payout' else 'pending' end where r.id=p.round_id and r.status<>'completed';
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,p.cycle_id,p.round_id,p.member_id,
 case when v_late then 'payment_late' when v_status='paid' then 'payment_recorded' else 'payment_updated' end,
 case when v_late then 'Your merry-go-round contribution was recorded after its due date. Applicable late fine: KES '||coalesce(v_fine,0)||'.'
      when v_status='paid' then 'Your merry-go-round contribution has been marked paid.'
      else 'Your merry-go-round payment status was updated.' end,v_due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'record_payment','merry_go_round_payment',p_payment_id::text,
 jsonb_build_object('amount_paid',p_amount,'status',v_status,'late_fine_amount',case when v_late then coalesce(v_fine,0) else 0 end));
 return v_status;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_swap_recipients(p_group_id uuid, p_cycle_id uuid, p_round_a integer, p_round_b integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; a public.merry_go_round_rounds%rowtype; b public.merry_go_round_rounds%rowtype;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then
   raise exception 'Your role cannot change payout order' using errcode='42501';
 end if;
 select * into a from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_a for update;
 select * into b from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_b for update;
 if a.id is null or b.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if a.status<>'pending' or b.status<>'pending' or a.due_date<=current_date or b.due_date<=current_date then raise exception 'Payout order can only change before both rounds start' using errcode='22023'; end if;
 update public.merry_go_round_rounds set recipient_member_id=case when id=a.id then b.recipient_member_id else a.recipient_member_id end where id in (a.id,b.id);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'swap_payout_order','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('round_a',p_round_a,'round_b',p_round_b));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_tracking(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(round_id uuid, round_number integer, due_date date, recipient_member_id uuid, recipient_name text, round_status text, payout_amount numeric, paid_count bigint, pending_count bigint, late_count bigint, member_payments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 if not exists(select 1 from public.merry_go_round_cycles c where c.id=p_cycle_id and c.group_id=p_group_id) then raise exception 'Cycle not found' using errcode='P0002'; end if;
 return query
 select r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount,
 count(p.id) filter(where p.status='paid'),
 count(p.id) filter(where p.status<>'paid' and current_date<=r.due_date),
 count(p.id) filter(where p.status<>'paid' and current_date>r.due_date),
 jsonb_agg(jsonb_build_object('payment_id',p.id,'member_id',p.member_id,'member_name',pm.name,'amount_due',p.amount_due,'amount_paid',p.amount_paid,'late_fine_amount',p.late_fine_amount,'status',case when p.status<>'paid' and current_date>r.due_date then 'late' else p.status end) order by pm.name)
 from public.merry_go_round_rounds r join public.members m on m.id=r.recipient_member_id
 join public.merry_go_round_payments p on p.round_id=r.id join public.members pm on pm.id=p.member_id
 where r.group_id=p_group_id and r.cycle_id=p_cycle_id
 group by r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount order by r.round_number;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_user_has_role(p_group_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(array_agg(CASE lower(btrim(r))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(r)) END), ARRAY[]::text[]) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    CROSS JOIN requested q
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
      AND (
        CASE lower(btrim(coalesce(m.actual_position, '')))
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice secretary' THEN 'secretary'
          ELSE CASE lower(btrim(coalesce(m.role, 'member')))
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE lower(btrim(coalesce(m.role, 'member')))
          END
        END
      ) = ANY(q.roles)
  );
$function$
