-- STAGE ONLY: production function definitions; ordinal rows 141-150 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.get_my_active_contribution_initiatives()
 RETURNS TABLE(initiative_id uuid, group_id uuid, name text, description text, start_date date, closing_date date, amount numeric, frequency text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT i.id,i.group_id,i.name,i.description,i.start_date,i.closing_date,im.amount,i.frequency,i.status
  FROM public.contribution_initiatives i
  JOIN public.contribution_initiative_members im ON im.initiative_id=i.id
  JOIN public.members m ON m.id=im.member_id
  WHERE i.status='active' AND im.status='active'
    AND auth.uid() IS NOT NULL
    AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
    AND current_date BETWEEN i.start_date AND i.closing_date
  ORDER BY i.start_date,i.name;
$function$


CREATE OR REPLACE FUNCTION public.get_my_contribution_position()
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH target_member AS (
  SELECT m.id, m.group_id
  FROM public.members m
  WHERE auth.uid() IS NOT NULL
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at, m.id
  LIMIT 1
),
monthly_types AS (
  SELECT DISTINCT ON (ct.group_id)
    ct.group_id,
    ct.id AS contribution_type_id
  FROM public.contribution_types ct
  WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
     OR lower(trim(coalesce(ct.name, ''))) = 'monthly'
  ORDER BY ct.group_id,
    CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
    ct.created_at, ct.id
),
current_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS current_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  WHERE o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
  GROUP BY o.member_id, o.group_id
),
all_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS total_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
allocation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(a.amount), 0)::numeric AS total_allocated,
    coalesce(
      sum(
        CASE
          WHEN o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
          THEN a.amount
          ELSE 0
        END
      ),
      0
    )::numeric AS current_allocated
  FROM public.contribution_allocations a
  JOIN public.contribution_obligations o
    ON o.id = a.obligation_id
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
payment_totals AS (
  SELECT
    c.member_id,
    coalesce(
      sum(c.amount - coalesce(pa.allocated_amount, 0)),
      0
    )::numeric AS credit
  FROM public.contributions c
  JOIN target_member tm
    ON tm.id = c.member_id
  LEFT JOIN (
    SELECT
      a.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS allocated_amount
    FROM public.contribution_allocations a
    GROUP BY a.payment_id
  ) pa
    ON pa.payment_id = c.id
  WHERE lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
  GROUP BY c.member_id
)
SELECT
  tm.id AS member_id,
  tm.group_id,
  coalesce(aot.total_due, 0)::numeric(14,2) AS total_due,
  coalesce(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
  greatest(
    coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
    0
  )::numeric(14,2) AS arrears,
  greatest(coalesce(pt.credit, 0), 0)::numeric(14,2) AS credit,
  CASE
    WHEN greatest(
      coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
      0
    ) > 0 THEN 'ARREARS'
    WHEN greatest(coalesce(pt.credit, 0), 0) > 0 THEN 'CREDIT'
    ELSE 'UP_TO_DATE'
  END AS status
FROM target_member tm
LEFT JOIN all_obligation_totals aot
  ON aot.member_id = tm.id
 AND aot.group_id = tm.group_id
LEFT JOIN current_obligation_totals cot
  ON cot.member_id = tm.id
 AND cot.group_id = tm.group_id
LEFT JOIN allocation_totals at
  ON at.member_id = tm.id
 AND at.group_id = tm.group_id
LEFT JOIN payment_totals pt
  ON pt.member_id = tm.id
$function$


CREATE OR REPLACE FUNCTION public.get_my_group()
 RETURNS groups
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT g.*
  FROM public.groups g
  JOIN public.members m ON m.group_id = g.id
  WHERE (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_my_groups()
 RETURNS TABLE(group_id uuid, group_name text, role text, category text, monthly_contribution numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select g.id, g.name, m.role, g.category, g.monthly_contribution
  from public.members m
  join public.groups g on g.id = m.group_id
  where (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.created_at;
$function$


CREATE OR REPLACE FUNCTION public.get_my_member()
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.*
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_applications()
 RETURNS TABLE(application_id uuid, group_name text, category text, description text, admin_name text, admin_phone text, email text, country text, location text, town text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.group_name,
    ga.category,
    ga.description,
    ga.admin_name,
    ga.admin_phone,
    ga.email,
    ga.country,
    ga.location,
    ga.town,
    ga.status,
    ga.created_at
  FROM public.group_applications AS ga
  WHERE ga.status IN ('pending', 'under_review')
  ORDER BY
    ga.created_at ASC,
    ga.id ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_overview()
 RETURNS TABLE(groups_total bigint, groups_created_this_month bigint, members_total bigint, members_active bigint, members_with_login bigint, members_without_login bigint, onboarding_pending bigint, onboarding_invited bigint, onboarding_active bigint, onboarding_suspended bigint, applications_pending bigint, applications_under_review bigint, applications_approved bigint, applications_rejected bigint, subscriptions_active bigint, subscriptions_pending bigint, subscriptions_suspended bigint, subscriptions_cancelled bigint, subscriptions_expired bigint, invoices_paid bigint, invoices_unpaid bigint, subscription_payments_total bigint, subscription_revenue_total numeric, generated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform Admin access required';
    END IF;
    RETURN QUERY
    SELECT
        (SELECT count(*)::bigint FROM public.groups),
        (SELECT count(*)::bigint FROM public.groups WHERE created_at >= date_trunc('month', now()) AND created_at < date_trunc('month', now()) + interval '1 month'),
        (SELECT count(*)::bigint FROM public.members),
        (SELECT count(*)::bigint FROM public.members WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NOT NULL),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NULL),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'pending'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'invited'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'under_review'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'approved'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'rejected'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'cancelled'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'expired'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status = 'paid'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status IN ('draft','issued','partially_paid','overdue')),
        (SELECT count(*)::bigint FROM public.subscription_payments),
        (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.subscription_payments WHERE status = 'confirmed'),
        now();
END;
$function$


CREATE OR REPLACE FUNCTION public.guard_expense_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_table_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_table_owner FROM pg_class c WHERE c.oid = 'public.expenses'::regclass;
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS DISTINCT FROM 'pending' AND current_user <> v_table_owner THEN
      RAISE EXCEPTION 'Expenses must start pending; approval status is managed by the approval workflow';
    END IF;
  ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND current_user <> v_table_owner THEN
    RAISE EXCEPTION 'Expense approval status can only be changed through the approval workflow';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.invite_member(p_group_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text)
 RETURNS TABLE(member_id uuid, member_number text, membership_number text, invite_email text, onboarding_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_admin uuid; v_num text; v_id uuid; v_email text;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select m.id into v_admin from public.members m where m.group_id=p_group_id and (m.user_id=v_uid or m.auth_user_id=v_uid) and m.role in ('admin','chairperson') and m.status='active' and m.onboarding_status='active' limit 1;
 if v_admin is null then raise exception 'Only an active group administrator can invite members'; end if;
 if coalesce(trim(p_name),'')='' then raise exception 'Member name is required'; end if;
 if coalesce(trim(p_phone),'')='' then raise exception 'Member phone is required'; end if;
 if p_role not in ('chairperson','admin','treasurer','secretary','member') then raise exception 'Invalid member role'; end if;
 v_num:=public.generate_member_number(p_group_id);
 v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
 insert into public.members(group_id,user_id,auth_user_id,member_number,membership_number,name,phone,email,role,status,onboarding_status,join_date,invited_at)
 values(p_group_id,null,null,v_num,v_num,trim(p_name),trim(p_phone),v_email,p_role,'active','pending',current_date,now()) returning id into v_id;
 return query select v_id,v_num,v_num,v_email,'pending'::text;
end; $function$


CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and active = true
  );
$function$
