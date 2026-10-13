-- CHAMA LIVE Phase 1: Merry-go-round core module.
-- Additive module tables and RPC-owned writes. Canonical contribution accounting is not changed.
create table if not exists public.merry_go_round_cycles (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 name text not null, contribution_amount numeric(14,2) not null check(contribution_amount>0),
 frequency text not null check(frequency in ('weekly','monthly')), start_date date not null,
 number_of_rounds integer not null check(number_of_rounds between 1 and 500),
 payout_order_method text not null check(payout_order_method in ('admin','random','member_chosen')),
 late_fine_amount numeric(14,2) not null default 0 check(late_fine_amount>=0),
 status text not null default 'active' check(status in ('active','completed','cancelled')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.merry_go_round_rounds (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 cycle_id uuid not null references public.merry_go_round_cycles(id) on delete cascade,
 round_number integer not null check(round_number>0), due_date date not null,
 recipient_member_id uuid not null references public.members(id),
 status text not null default 'pending' check(status in ('pending','ready_for_payout','completed','cancelled')),
 payout_amount numeric(14,2) not null default 0 check(payout_amount>=0),
 payout_recorded_at timestamptz, payout_recorded_by uuid references auth.users(id),
 created_at timestamptz not null default now(), unique(cycle_id,round_number)
);
create table if not exists public.merry_go_round_payments (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 cycle_id uuid not null references public.merry_go_round_cycles(id) on delete cascade,
 round_id uuid not null references public.merry_go_round_rounds(id) on delete cascade,
 member_id uuid not null references public.members(id), amount_due numeric(14,2) not null check(amount_due>=0),
 amount_paid numeric(14,2) not null default 0 check(amount_paid>=0),
 status text not null default 'pending' check(status in ('pending','paid','late')),
 paid_at timestamptz, late_fine_amount numeric(14,2) not null default 0 check(late_fine_amount>=0),
 recorded_by uuid references auth.users(id), updated_at timestamptz not null default now(), unique(round_id,member_id)
);
create table if not exists public.merry_go_round_notifications (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 cycle_id uuid references public.merry_go_round_cycles(id) on delete cascade,
 round_id uuid references public.merry_go_round_rounds(id) on delete cascade,
 member_id uuid references public.members(id) on delete cascade, notification_type text not null, message text not null,
 due_date date, created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists merry_cycles_group_status_idx on public.merry_go_round_cycles(group_id,status);
create index if not exists merry_rounds_cycle_number_idx on public.merry_go_round_rounds(cycle_id,round_number);
create index if not exists merry_payments_group_member_idx on public.merry_go_round_payments(group_id,member_id,status);
create index if not exists merry_notifications_member_idx on public.merry_go_round_notifications(member_id,created_at desc);
alter table public.merry_go_round_cycles enable row level security;
alter table public.merry_go_round_rounds enable row level security;
alter table public.merry_go_round_payments enable row level security;
alter table public.merry_go_round_notifications enable row level security;
drop policy if exists merry_cycles_read on public.merry_go_round_cycles;
create policy merry_cycles_read on public.merry_go_round_cycles for select to authenticated using (
 exists(select 1 from public.members m where m.group_id=merry_go_round_cycles.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active')
 and exists(select 1 from public.groups g where g.id=merry_go_round_cycles.group_id and g.merry_go_round_enabled));
drop policy if exists merry_rounds_read on public.merry_go_round_rounds;
create policy merry_rounds_read on public.merry_go_round_rounds for select to authenticated using (
 exists(select 1 from public.members m where m.group_id=merry_go_round_rounds.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active')
 and exists(select 1 from public.groups g where g.id=merry_go_round_rounds.group_id and g.merry_go_round_enabled));
drop policy if exists merry_payments_read on public.merry_go_round_payments;
create policy merry_payments_read on public.merry_go_round_payments for select to authenticated using (
 exists(select 1 from public.members m where m.group_id=merry_go_round_payments.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active')
 and exists(select 1 from public.groups g where g.id=merry_go_round_payments.group_id and g.merry_go_round_enabled)
 and (member_id in (select m.id from public.members m where m.group_id=merry_go_round_payments.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())) or public.cl_user_has_role(group_id,array['admin','chairperson','treasurer','secretary']::text[])));
drop policy if exists merry_notifications_read on public.merry_go_round_notifications;
create policy merry_notifications_read on public.merry_go_round_notifications for select to authenticated using (
 member_id in (select m.id from public.members m where m.group_id=merry_go_round_notifications.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()))
 and exists(select 1 from public.groups g where g.id=merry_go_round_notifications.group_id and g.merry_go_round_enabled));
revoke all on public.merry_go_round_cycles,public.merry_go_round_rounds,public.merry_go_round_payments,public.merry_go_round_notifications from anon,authenticated;
grant select on public.merry_go_round_cycles,public.merry_go_round_rounds,public.merry_go_round_payments,public.merry_go_round_notifications to authenticated;

create or replace function public.cl_merry_authorize(p_group_id uuid,p_write boolean default false)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_member_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.merry_go_round_enabled) then raise exception 'Merry-go-round is disabled for this group' using errcode='42501'; end if;
 select m.id into v_member_id from public.members m where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active' order by m.created_at limit 1;
 if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
 if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'View-only: you do not have permission to manage merry-go-round' using errcode='42501'; end if;
 return v_member_id;
end; $$;

create or replace function public.cl_merry_create_cycle(
 p_group_id uuid,p_name text,p_contribution_amount numeric,p_frequency text,p_start_date date,
 p_number_of_rounds integer,p_payout_order_method text,p_member_order uuid[] default null,p_late_fine_amount numeric default 0
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_cycle uuid; v_members uuid[]; v_order uuid[]; v_count integer; i integer; v_due date; v_round uuid;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if lower(coalesce((select role from public.members where id=v_actor),'member')) <> 'admin'
 and not public.cl_user_has_role(p_group_id,array['chairperson','treasurer','secretary']::text[]) then raise exception 'Not authorized to create cycle' using errcode='42501'; end if;
 if p_contribution_amount<=0 or p_number_of_rounds<1 or p_frequency not in ('weekly','monthly') or p_payout_order_method not in ('admin','random','member_chosen') or coalesce(p_late_fine_amount,0)<0 then raise exception 'Invalid cycle settings' using errcode='22023'; end if;
 select array_agg(id order by created_at,id) into v_members from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 v_count:=coalesce(array_length(v_members,1),0);
 if v_count<2 then raise exception 'At least two active members are required' using errcode='22023'; end if;
 if p_number_of_rounds<>v_count then raise exception 'Number of rounds must match active member count (%).',v_count using errcode='22023'; end if;
 if p_payout_order_method in ('admin','member_chosen') then
   if coalesce(array_length(p_member_order,1),0)<>v_count then raise exception 'Provide the complete payout order' using errcode='22023'; end if;
   if (select count(distinct x) from unnest(p_member_order) x)<>v_count or not (p_member_order @> v_members and v_members @> p_member_order) then raise exception 'Payout order must include every active member exactly once' using errcode='22023'; end if;
   v_order:=p_member_order;
 else select array_agg(id order by random()) into v_order from unnest(v_members) id;
 end if;
 insert into public.merry_go_round_cycles(group_id,name,contribution_amount,frequency,start_date,number_of_rounds,payout_order_method,late_fine_amount,created_by)
 values(p_group_id,btrim(p_name),p_contribution_amount,p_frequency,p_start_date,p_number_of_rounds,p_payout_order_method,coalesce(p_late_fine_amount,0),auth.uid()) returning id into v_cycle;
 for i in 1..p_number_of_rounds loop
   v_due:=case when p_frequency='weekly' then p_start_date+((i-1)*7) else (p_start_date + ((i-1)||' months')::interval)::date end;
   insert into public.merry_go_round_rounds(group_id,cycle_id,round_number,due_date,recipient_member_id,payout_amount)
   values(p_group_id,v_cycle,i,v_due,v_order[i],p_contribution_amount*v_count) returning id into v_round;
   insert into public.merry_go_round_payments(group_id,cycle_id,round_id,member_id,amount_due,late_fine_amount)
   select p_group_id,v_cycle,v_round,m,p_contribution_amount,0 from unnest(v_members) m;
   insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
   select p_group_id,v_cycle,v_round,m,'round_due','Merry-go-round contribution due for round '||i,v_due from unnest(v_members) m;
 end loop;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'create','merry_go_round_cycle',v_cycle::text,jsonb_build_object('name',p_name,'contribution_amount',p_contribution_amount,'frequency',p_frequency,'number_of_rounds',p_number_of_rounds,'payout_order_method',p_payout_order_method,'late_fine_amount',coalesce(p_late_fine_amount,0)));
 return v_cycle;
end; $$;

create or replace function public.cl_merry_swap_recipients(p_group_id uuid,p_cycle_id uuid,p_round_a integer,p_round_b integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; a public.merry_go_round_rounds%rowtype; b public.merry_go_round_rounds%rowtype;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 select * into a from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_a for update;
 select * into b from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_b for update;
 if a.id is null or b.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if a.status<>'pending' or b.status<>'pending' or a.due_date<=current_date or b.due_date<=current_date then raise exception 'Payout order can only change before both rounds start' using errcode='22023'; end if;
 update public.merry_go_round_rounds set recipient_member_id=case when id=a.id then b.recipient_member_id else a.recipient_member_id end where id in (a.id,b.id);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'swap_payout_order','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('round_a',p_round_a,'round_b',p_round_b));
 return true;
end; $$;

create or replace function public.cl_merry_record_payment(p_group_id uuid,p_payment_id uuid,p_amount numeric)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; p public.merry_go_round_payments%rowtype; v_status text;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if p_amount<0 then raise exception 'Amount cannot be negative' using errcode='22023'; end if;
 select * into p from public.merry_go_round_payments where id=p_payment_id and group_id=p_group_id for update;
 if p.id is null then raise exception 'Payment entry not found' using errcode='P0002'; end if;
 if p_amount>p.amount_due then raise exception 'Payment exceeds amount due' using errcode='22023'; end if;
 v_status:=case when p_amount>=p.amount_due then 'paid' when current_date>(select due_date from public.merry_go_round_rounds where id=p.round_id) then 'late' else 'pending' end;
 update public.merry_go_round_payments set amount_paid=p_amount,status=v_status,paid_at=case when v_status='paid' then now() else null end,recorded_by=auth.uid(),updated_at=now() where id=p_payment_id;
 update public.merry_go_round_rounds r set status=case when not exists(select 1 from public.merry_go_round_payments x where x.round_id=r.id and x.status<>'paid') then 'ready_for_payout' else 'pending' end where r.id=p.round_id and r.status<>'completed';
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'record_payment','merry_go_round_payment',p_payment_id::text,jsonb_build_object('amount_paid',p_amount,'status',v_status));
 return v_status;
end; $$;

create or replace function public.cl_merry_complete_payout(p_group_id uuid,p_round_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; r public.merry_go_round_rounds%rowtype; v_recipient_name text;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 select * into r from public.merry_go_round_rounds where id=p_round_id and group_id=p_group_id for update;
 if r.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if r.status='completed' then return true; end if;
 if exists(select 1 from public.merry_go_round_payments p where p.round_id=r.id and p.status<>'paid') then raise exception 'All round contributions must be paid before payout' using errcode='22023'; end if;
 update public.merry_go_round_rounds set status='completed',payout_recorded_at=now(),payout_recorded_by=auth.uid() where id=r.id;
 update public.merry_go_round_cycles set status='completed',updated_at=now() where id=r.cycle_id and not exists(select 1 from public.merry_go_round_rounds x where x.cycle_id=r.cycle_id and x.status<>'completed');
 select name into v_recipient_name from public.members where id=r.recipient_member_id;
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date) values(p_group_id,r.cycle_id,r.id,r.recipient_member_id,'payout_recorded','Your merry-go-round payout of '||r.payout_amount||' has been recorded.',r.due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'complete_payout','merry_go_round_round',r.id::text,jsonb_build_object('recipient_member_id',r.recipient_member_id,'recipient_name',v_recipient_name,'payout_amount',r.payout_amount));
 return true;
end; $$;

create or replace function public.cl_merry_tracking(p_group_id uuid,p_cycle_id uuid)
returns table(round_id uuid,round_number integer,due_date date,recipient_member_id uuid,recipient_name text,round_status text,payout_amount numeric,paid_count bigint,pending_count bigint,late_count bigint,member_payments jsonb)
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare v_member uuid;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 if not exists(select 1 from public.merry_go_round_cycles c where c.id=p_cycle_id and c.group_id=p_group_id) then raise exception 'Cycle not found' using errcode='P0002'; end if;
 return query select r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount,
 count(p.id) filter(where p.status='paid'),count(p.id) filter(where p.status='pending'),count(p.id) filter(where p.status='late'),
 jsonb_agg(jsonb_build_object('member_id',p.member_id,'member_name',pm.name,'amount_due',p.amount_due,'amount_paid',p.amount_paid,'status',case when p.status<>'paid' and current_date>r.due_date then 'late' else p.status end) order by pm.name)
 from public.merry_go_round_rounds r join public.members m on m.id=r.recipient_member_id join public.merry_go_round_payments p on p.round_id=r.id join public.members pm on pm.id=p.member_id
 where r.group_id=p_group_id and r.cycle_id=p_cycle_id group by r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount order by r.round_number;
end; $$;

revoke all on function public.cl_merry_authorize(uuid,boolean) from public,anon;
revoke all on function public.cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) from public,anon;
revoke all on function public.cl_merry_swap_recipients(uuid,uuid,integer,integer) from public,anon;
revoke all on function public.cl_merry_record_payment(uuid,uuid,numeric) from public,anon;
revoke all on function public.cl_merry_complete_payout(uuid,uuid) from public,anon;
revoke all on function public.cl_merry_tracking(uuid,uuid) from public,anon;
grant execute on function public.cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) to authenticated;
grant execute on function public.cl_merry_swap_recipients(uuid,uuid,integer,integer) to authenticated;
grant execute on function public.cl_merry_record_payment(uuid,uuid,numeric) to authenticated;
grant execute on function public.cl_merry_complete_payout(uuid,uuid) to authenticated;
grant execute on function public.cl_merry_tracking(uuid,uuid) to authenticated;
