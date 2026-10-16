-- STAGE ONLY: production function definitions; ordinal rows 151-160 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code text, p_name text, p_phone text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, group_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  invite_row public.group_invites%rowtype;
  existing_member public.members%rowtype;
  new_member_number text;
  clean_code text := upper(trim(coalesce(p_code,'')));
  clean_name text := trim(coalesce(p_name,''));
  caller_email text;
  assigned_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if clean_code = '' then raise exception 'Invite code is required'; end if;
  if clean_name = '' then raise exception 'Your name is required'; end if;

  select * into invite_row
  from public.group_invites
  where code = clean_code and active = true
    and expires_at > now() and use_count < max_uses
  for update;

  if not found then raise exception 'Invite code is invalid, expired, or full'; end if;

  if invite_row.email is not null then
    select email into caller_email from auth.users where id = auth.uid();
    if lower(coalesce(caller_email,'')) <> lower(invite_row.email) then
      raise exception 'This invite code was issued for a different email address';
    end if;
  end if;

  assigned_role := coalesce(nullif(invite_row.role, ''), 'member');

  select * into existing_member
  from public.members
  where user_id = auth.uid() and group_id = invite_row.group_id
  limit 1;

  if found then
    if existing_member.status <> 'active' then
      update public.members set status = 'active', name = clean_name, phone = coalesce(p_phone, phone), role = assigned_role
      where id = existing_member.id;
    end if;
  else
    new_member_number := 'MBR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.members(group_id, user_id, member_number, name, phone, role, status)
    values(invite_row.group_id, auth.uid(), new_member_number, clean_name, coalesce(p_phone,''), assigned_role, 'active');
  end if;

  update public.group_invites
  set use_count = use_count + 1,
      used_at = now(),
      active = case when use_count + 1 >= max_uses then false else active end
  where id = invite_row.id;

  return query
  select g.id, g.name, assigned_role
  from public.groups g where g.id = invite_row.group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.link_my_member(p_phone text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member public.members;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  update public.members
  set user_id = (select auth.uid()),
      auth_user_id = (select auth.uid()),
      onboarding_status = 'active',
      status = 'active',
      activated_at = coalesce(activated_at, now())
  where phone = btrim(p_phone)
    and user_id is null
    and auth_user_id is null
  returning * into v_member;

  if v_member.id is null then
    select * into v_member
    from public.members
    where (user_id = (select auth.uid()) or auth_user_id = (select auth.uid()))
      and phone = btrim(p_phone)
    order by created_at
    limit 1;
  end if;

  if v_member.id is null then
    raise exception 'No member record found for that phone number. Ask your group administrator to add you first.';
  end if;

  return v_member;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_pending_group_applications()
 RETURNS SETOF group_applications
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select a.*
  from public.group_applications a
  where public.is_platform_admin()
    and lower(coalesce(a.status,'pending')) in ('pending','under_review')
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.log_deleted_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_deleted_rows(table_name, deleted_row, deleted_by)
  values (TG_TABLE_NAME, to_jsonb(OLD), auth.uid());
  return OLD;
end;
$function$


CREATE OR REPLACE FUNCTION public.machine_renew_due_subscriptions(p_batch_size integer, p_idempotency_key text)
 RETURNS TABLE(run_id uuid, processed_count integer, renewed_count integer, not_due_count integer, already_renewed_count integer, anomalous_count integer, failed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_run_id uuid;
    v_result record;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
    END IF;
    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs AS rr
    WHERE rr.idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs AS inserted_run (execution_source, idempotency_key)
        VALUES ('scheduler', p_idempotency_key)
        RETURNING inserted_run.run_id INTO v_run_id;
    ELSIF EXISTS (
        SELECT 1 FROM private.renewal_runs AS rr
        WHERE rr.run_id = v_run_id AND rr.status <> 'running'
    ) THEN
        RETURN QUERY SELECT v_run_id, 0, 0, 0, 0, 0, 0;
        RETURN;
    END IF;
    SELECT * INTO v_result
    FROM private.machine_renew_due_subscriptions(v_run_id, p_batch_size);
    UPDATE private.renewal_runs AS rr
    SET status = 'completed', completed_at = now(), error_code = NULL, error_message = NULL
    WHERE rr.run_id = v_run_id AND rr.status = 'running';
    RETURN QUERY SELECT v_result.run_id, v_result.processed_count, v_result.renewed_count,
        v_result.not_due_count, v_result.already_renewed_count, v_result.anomalous_count,
        v_result.failed_count;
EXCEPTION WHEN OTHERS THEN
    IF v_run_id IS NOT NULL THEN
        UPDATE private.renewal_runs AS rr
        SET status = 'failed', completed_at = now(), error_code = SQLSTATE, error_message = SQLERRM
        WHERE rr.run_id = v_run_id AND rr.status = 'running';
    END IF;
    RAISE;
END;
$function$


CREATE OR REPLACE FUNCTION public.my_group_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.group_id
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member(target_group uuid)
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select * from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select m.id from public.members m where (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active' order by m.created_at limit 1
$function$


CREATE OR REPLACE FUNCTION public.my_role(target_group uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.normalize_contribution_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member_id uuid;
begin
  -- contributions.recorded_by references members(id), while the frontend
  -- currently supplies auth.uid(). Convert the authenticated user to their
  -- member row automatically.
  if new.recorded_by is null then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;

  elsif new.recorded_by = auth.uid() then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;
  end if;

  return new;
end;
$function$
