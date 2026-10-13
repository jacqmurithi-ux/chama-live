-- CHAMA LIVE Loans: persistent in-app notifications. No email/SMS delivery is implied.
create table if not exists public.loan_notifications (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.groups(id) on delete cascade,
 recipient_member_id uuid not null references public.members(id) on delete cascade,
 loan_id uuid references public.loan_applications(id) on delete cascade,
 event_type text not null check(event_type in ('application_submitted','application_approved','application_rejected','loan_disbursed','repayment_recorded','loan_cleared')),
 title text not null,message text not null,created_at timestamptz not null default now(),read_at timestamptz
);
create index if not exists loan_notifications_recipient_unread_idx on public.loan_notifications(group_id,recipient_member_id,created_at desc) where read_at is null;
create index if not exists loan_notifications_loan_idx on public.loan_notifications(loan_id,created_at desc);
alter table public.loan_notifications enable row level security;
revoke all on public.loan_notifications from anon,authenticated;
grant select on public.loan_notifications to authenticated;
grant update(read_at) on public.loan_notifications to authenticated;
drop policy if exists loan_notifications_read_own on public.loan_notifications;
create policy loan_notifications_read_own on public.loan_notifications for select to authenticated using (
 exists(select 1 from public.members m where m.id=recipient_member_id and m.group_id=loan_notifications.group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and lower(coalesce(m.status,'active'))='active'
 and lower(coalesce(m.onboarding_status,'active'))='active') and public.cl_group_module_enabled(group_id,'loans'));
drop policy if exists loan_notifications_mark_own_read on public.loan_notifications;
create policy loan_notifications_mark_own_read on public.loan_notifications for update to authenticated using (
 exists(select 1 from public.members m where m.id=recipient_member_id and m.group_id=loan_notifications.group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and lower(coalesce(m.status,'active'))='active'
 and lower(coalesce(m.onboarding_status,'active'))='active') and public.cl_group_module_enabled(group_id,'loans'))
 with check (exists(select 1 from public.members m where m.id=recipient_member_id and m.group_id=loan_notifications.group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and lower(coalesce(m.status,'active'))='active'
 and lower(coalesce(m.onboarding_status,'active'))='active') and public.cl_group_module_enabled(group_id,'loans') and read_at is not null);
create or replace function public.cl_loan_emit_notification(p_group_id uuid,p_recipient_member_id uuid,p_loan_id uuid,p_event_type text,p_title text,p_message text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_recipient_member_id is null or not exists(select 1 from public.groups where id=p_group_id and loans_enabled=true) then return; end if;
 insert into public.loan_notifications(group_id,recipient_member_id,loan_id,event_type,title,message) values(p_group_id,p_recipient_member_id,p_loan_id,p_event_type,p_title,p_message);
end;$$;
revoke all on function public.cl_loan_emit_notification(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
create or replace function public.cl_loan_notify_application_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text; v_event text; v_title text; v_message text; v_recipient uuid;
begin
 if not exists(select 1 from public.groups where id=new.group_id and loans_enabled=true) then return new; end if;
 select coalesce(name,'A member') into v_name from public.members where id=new.member_id and group_id=new.group_id;
 if tg_op='INSERT' then
  perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,'application_submitted','Loan application submitted','Your loan application for KES '||to_char(new.requested_amount,'FM999999999990.00')||' has been submitted.');
  for v_recipient in select distinct m.id from public.members m where m.group_id=new.group_id and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
   and (lower(coalesce(m.role,'')) in ('admin','administrator','chairperson','secretary') or lower(coalesce(m.actual_position,'')) in ('admin','administrator','chairperson','secretary') or lower(coalesce(m.actual_position_name,'')) in ('admin','administrator','chairperson','secretary'))
  loop perform public.cl_loan_emit_notification(new.group_id,v_recipient,new.id,'application_submitted','New loan application',v_name||' submitted a loan application for KES '||to_char(new.requested_amount,'FM999999999990.00')||'.'); end loop;
  return new;
 end if;
 if new.status is distinct from old.status then
  if new.status='approved' then v_event:='application_approved';v_title:='Loan application approved';v_message:='Your loan application for KES '||to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00')||' was approved.';
  elsif new.status='rejected' then v_event:='application_rejected';v_title:='Loan application not approved';v_message:='Your loan application was not approved.'||case when nullif(btrim(new.decision_note),'') is not null then ' Reason: '||btrim(new.decision_note) else '' end;
  elsif new.status='active' then v_event:='loan_disbursed';v_title:='Loan disbursed';v_message:='Your loan for KES '||to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00')||' has been disbursed. Your repayment schedule is available in Loans.';
  elsif new.status='cleared' then v_event:='loan_cleared';v_title:='Loan cleared';v_message:='Your loan has been fully repaid and cleared.';
  else return new; end if;
  perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,v_event,v_title,v_message);
 end if;
 return new;
end;$$;
revoke all on function public.cl_loan_notify_application_change() from public,anon,authenticated;
drop trigger if exists loan_application_notifications on public.loan_applications;
create trigger loan_application_notifications after insert or update of status on public.loan_applications for each row execute function public.cl_loan_notify_application_change();
create or replace function public.cl_loan_notify_repayment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_member uuid; v_amount text;
begin
 if not exists(select 1 from public.groups where id=new.group_id and loans_enabled=true) then return new; end if;
 select member_id into v_member from public.loan_applications where id=new.loan_id and group_id=new.group_id;
 v_amount:=to_char(new.amount,'FM999999999990.00');
 perform public.cl_loan_emit_notification(new.group_id,v_member,new.loan_id,'repayment_recorded','Loan repayment recorded','A repayment of KES '||v_amount||' was recorded on '||new.payment_date::text||'.');
 return new;
end;$$;
revoke all on function public.cl_loan_notify_repayment() from public,anon,authenticated;
drop trigger if exists loan_repayment_notifications on public.loan_repayments;
create trigger loan_repayment_notifications after insert on public.loan_repayments for each row execute function public.cl_loan_notify_repayment();
