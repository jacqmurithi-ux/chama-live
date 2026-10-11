-- CHAMA LIVE role matrix candidate.
-- IMPORTANT: Candidate migration only. Do not apply to production before
-- candidate-database verification and explicit deployment approval.
--
-- Rules:
--   * vice chairperson inherits chairperson permissions.
--   * vice secretary inherits secretary permissions.
--   * admin/administrator cross-group access is enabled only where existing
--     policies call the shared helpers; direct-membership policies still need
--     a separate audit before full platform-wide access can be claimed.
--   * admin/administrator do not inherit treasurer-only permissions implicitly.
--   * chairperson/vice chairperson retain financial read access but are
--     excluded from treasury mutations.
--   * existing accounting RPCs remain the only accounting write path.

CREATE OR REPLACE FUNCTION public.cl_user_has_role(
  p_group_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(
      array_agg(
        CASE lower(btrim(r))
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'administrator' THEN 'admin'
          ELSE lower(btrim(r))
        END
      ),
      ARRAY[]::text[]
    ) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM public.members m
      CROSS JOIN requested q
      WHERE m.group_id = p_group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, 'active')) = 'active'
        AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
        AND (
          CASE lower(btrim(coalesce(m.role, 'member')))
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE lower(btrim(coalesce(m.role, 'member')))
          END
        ) = ANY(q.roles)
    )
    OR (
      -- Platform-wide admin fallback applies only to administrative role
      -- checks. It does not silently grant treasurer-only actions.
      NOT EXISTS (
        SELECT 1
        FROM requested q
        WHERE 'treasurer' = ANY(q.roles)
          AND NOT ('admin' = ANY(q.roles))
      )
      AND EXISTS (
        SELECT 1
        FROM public.members a
        WHERE (a.user_id = auth.uid() OR a.auth_user_id = auth.uid())
          AND lower(coalesce(a.status, 'active')) = 'active'
          AND lower(coalesce(a.onboarding_status, 'active')) = 'active'
          AND lower(btrim(coalesce(a.role, 'member'))) IN ('admin', 'administrator')
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.cl_user_in_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.group_id = p_group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, 'active')) = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.members a
      WHERE (a.user_id = auth.uid() OR a.auth_user_id = auth.uid())
        AND lower(coalesce(a.status, 'active')) = 'active'
        AND lower(coalesce(a.onboarding_status, 'active')) = 'active'
        AND lower(btrim(coalesce(a.role, 'member'))) IN ('admin', 'administrator')
    );
$function$;


CREATE OR REPLACE FUNCTION public.current_user_role(p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.members a
      WHERE (a.user_id = auth.uid() OR a.auth_user_id = auth.uid())
        AND lower(coalesce(a.status, 'active')) = 'active'
        AND lower(coalesce(a.onboarding_status, 'active')) = 'active'
        AND lower(btrim(coalesce(a.role, 'member'))) IN ('admin', 'administrator')
    ) THEN 'admin'
    ELSE (
      SELECT CASE lower(btrim(coalesce(m.role, 'member')))
        WHEN 'vice chairperson' THEN 'chairperson'
        WHEN 'vice-chairperson' THEN 'chairperson'
        WHEN 'vice secretary' THEN 'secretary'
        WHEN 'vice-secretary' THEN 'secretary'
        WHEN 'administrator' THEN 'admin'
        ELSE lower(btrim(coalesce(m.role, 'member')))
      END
      FROM public.members m
      WHERE m.group_id = p_group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, 'active')) = 'active'
        AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
      ORDER BY m.id
      LIMIT 1
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.my_role(target_group uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.current_user_role(target_group);
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_members(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.cl_user_has_role(p_group_id, ARRAY['admin','chairperson']::text[]);
$function$;

-- Contribution writes: secretary and treasurer retain their existing duties.
-- Admin and chair roles are not granted treasury mutation access by policy.
DROP POLICY IF EXISTS contributions_insert_finance_role ON public.contributions;
CREATE POLICY contributions_insert_finance_role
ON public.contributions
FOR INSERT TO authenticated
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['secretary','treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = contributions.group_id
      AND fp.month = contributions.month
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS contributions_update_finance_role ON public.contributions;
CREATE POLICY contributions_update_finance_role
ON public.contributions
FOR UPDATE TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['secretary','treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = contributions.group_id
      AND fp.month = contributions.month
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
)
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['secretary','treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = contributions.group_id
      AND fp.month = contributions.month
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS contributions_delete_treasurer_admin ON public.contributions;
CREATE POLICY contributions_delete_treasurer_admin
ON public.contributions
FOR DELETE TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = contributions.group_id
      AND fp.month = contributions.month
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS expenses_insert_finance_role ON public.expenses;
CREATE POLICY expenses_insert_finance_role
ON public.expenses
FOR INSERT TO authenticated
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['secretary','treasurer']::text[])
  AND approval_status = ANY (ARRAY['pending','approved','rejected']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = expenses.group_id
      AND fp.month = to_char(expenses.date::timestamp with time zone, 'YYYY-MM')
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS expenses_update_finance_role ON public.expenses;
CREATE POLICY expenses_update_finance_role
ON public.expenses
FOR UPDATE TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = expenses.group_id
      AND fp.month = to_char(expenses.date::timestamp with time zone, 'YYYY-MM')
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
)
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND approval_status = ANY (ARRAY['pending','approved','rejected']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = expenses.group_id
      AND fp.month = to_char(expenses.date::timestamp with time zone, 'YYYY-MM')
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS expenses_delete_finance_role ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_treasurer_admin ON public.expenses;
CREATE POLICY expenses_delete_treasurer_admin
ON public.expenses
FOR DELETE TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = expenses.group_id
      AND fp.month = to_char(expenses.date::timestamp with time zone, 'YYYY-MM')
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

DROP POLICY IF EXISTS financial_periods_insert_treasurer_admin ON public.financial_periods;
CREATE POLICY financial_periods_insert_treasurer_admin
ON public.financial_periods
FOR INSERT TO authenticated
WITH CHECK (public.cl_user_has_role(group_id, ARRAY['treasurer']::text[]));

DROP POLICY IF EXISTS financial_periods_update_treasurer_admin ON public.financial_periods;
CREATE POLICY financial_periods_update_treasurer_admin
ON public.financial_periods
FOR UPDATE TO authenticated
USING (public.cl_user_has_role(group_id, ARRAY['treasurer']::text[]))
WITH CHECK (public.cl_user_has_role(group_id, ARRAY['treasurer']::text[]));

DROP POLICY IF EXISTS monthly_closings_insert_treasurer_admin ON public.monthly_closings;
CREATE POLICY monthly_closings_insert_treasurer_admin
ON public.monthly_closings
FOR INSERT TO authenticated
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND closed_by = (SELECT auth.uid())
  AND closing_month = date_trunc('month', closing_month::timestamp with time zone)::date
  AND total_expected >= 0
  AND total_collected >= 0
  AND total_expenses >= 0
);

DROP POLICY IF EXISTS monthly_closings_update_treasurer_admin ON public.monthly_closings;
CREATE POLICY monthly_closings_update_treasurer_admin
ON public.monthly_closings
FOR UPDATE TO authenticated
USING (public.cl_user_has_role(group_id, ARRAY['treasurer']::text[]))
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
  AND closed_by = (SELECT auth.uid())
);

-- Update role arrays inside existing SECURITY DEFINER RPCs without replacing
-- their accounting implementation. Abort if an expected guard is not found.
DO $role_guard_updates$
DECLARE
  r record;
  v_oid oid;
  v_definition text;
  v_updated text;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('public.cl_fine_adjust(uuid,numeric,text,text)', 'ARRAY[''chairperson'',''treasurer'']', 'ARRAY[''treasurer'']'),
      ('public.cl_fine_waive(uuid,numeric,text)', 'ARRAY[''chairperson'',''treasurer'']', 'ARRAY[''treasurer'']'),
      ('public.cl_fine_allocate_payment(uuid,uuid,numeric,text)', 'ARRAY[''chairperson'',''treasurer'']', 'ARRAY[''treasurer'']'),
      ('public.cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamp with time zone,timestamp with time zone,uuid[])', 'ARRAY[''chairperson'',''treasurer'']', 'ARRAY[''treasurer'']'),
      ('public.create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamp with time zone)', 'ARRAY[''chairperson'',''treasurer'',''secretary'']', 'ARRAY[''treasurer'',''secretary'']'),
      ('public.cl_2b_record_contribution(uuid,uuid,uuid,numeric,date,text,text,text,text,uuid,text)', 'ARRAY[''admin'',''chairperson'',''secretary'',''treasurer'']', 'ARRAY[''secretary'',''treasurer'']'),
      ('public.record_other_contribution_payment(uuid,uuid,numeric,date,text,text,text,text,uuid,uuid)', 'ARRAY[''admin'',''chairperson'',''secretary'',''treasurer'']', 'ARRAY[''secretary'',''treasurer'']'),
      ('public.verify_member_payment_evidence(uuid,text,text)', 'ARRAY[''admin'',''chairperson'',''secretary'',''treasurer'']', 'ARRAY[''secretary'',''treasurer'']'),
      ('public.close_financial_month(uuid,text)', 'ARRAY[''admin'',''treasurer'',''secretary'']', 'ARRAY[''treasurer'']'),
      ('public.reopen_financial_month(uuid,text)', 'ARRAY[''admin'',''treasurer'',''secretary'']', 'ARRAY[''treasurer'']')
    ) AS updates(signature, old_array, new_array)
  LOOP
    v_oid := to_regprocedure(r.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Required role-guard function not found: %', r.signature;
    END IF;

    v_definition := pg_get_functiondef(v_oid);
    v_updated := replace(v_definition, r.old_array, r.new_array);

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Expected role guard not found in function %', r.signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END;
$role_guard_updates$;


-- Additional SECURITY DEFINER entry points found during the read-only RPC audit.
-- Each source rewrite is guarded: unexpected production/candidate function text
-- aborts the migration instead of silently leaving an unprotected path.



-- Complete the direct-RPC audit for treasury operations. These guarded edits
-- preserve the existing transaction/idempotency bodies while replacing only
-- the authorization predicate. A mismatch aborts candidate migration.
DO $direct_treasury_guard_updates$
DECLARE
  r record;
  v_oid oid;
  v_definition text;
  v_updated text;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'public.activate_custom_contribution(uuid,uuid,uuid)',
        $pat$if not exists\s*\(select 1 from public\.groups g where g\.id=p_group_id and g\.owner_user_id=v_auth_user_id\)\s+and not public\.cl_user_has_role\(p_group_id,array\['chairperson'\]::text\[\]\) then$pat$,
        $rep$if not public.cl_user_has_role(p_group_id,array['treasurer']::text[]) then$rep$
      ),
      (
        'public.generate_next_custom_contribution_period(uuid,uuid,uuid)',
        $pat$if not exists\s*\(select 1 from public\.groups g where g\.id=p_group_id and g\.owner_user_id=v_auth\)\s+and not public\.cl_user_has_role\(p_group_id,array\['chairperson'\]::text\[\]\)\s*then$pat$,
        $rep$if not public.cl_user_has_role(p_group_id,array['treasurer']::text[]) then$rep$
      ),
      (
        'public.create_custom_contribution(uuid,text,text,numeric,text,date,date,date,integer,boolean,numeric,uuid)',
        $pat$IF NOT EXISTS \(SELECT 1 FROM public\.groups g WHERE g\.id=p_group_id AND g\.owner_user_id=v_auth_user_id\)\s+AND NOT public\.cl_user_has_role\(p_group_id,ARRAY\['chairperson'\]::text\[\]\) THEN$pat$,
        $rep$IF NOT public.cl_user_has_role(p_group_id,ARRAY['treasurer']::text[]) THEN$rep$
      ),
      (
        'public.record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid)',
        $pat$if not exists\s*\(\s*select 1 from public\.groups g\s+where g\.id = p_group_id and g\.owner_user_id = v_auth_user_id\s*\)\s*and not public\.cl_user_has_role\(\s*p_group_id, array\['chairperson','treasurer','secretary'\]::text\[\]\s*\) then$pat$,
        $rep$if not public.cl_user_has_role(p_group_id, array['secretary','treasurer']::text[]) then$rep$
      ),
      (
        'public.record_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid)',
        $pat$public\.can_manage_members\(v_member_group\)$pat$,
        $rep$public.cl_user_has_role(v_member_group, ARRAY['secretary','treasurer']::text[])$rep$
      ),
      (
        'public.record_recurring_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid)',
        $pat$public\.can_manage_members\(v_i\.group_id\)$pat$,
        $rep$public.cl_user_has_role(v_i.group_id, ARRAY['secretary','treasurer']::text[])$rep$
      ),
      (
        'public.cl_fine_generate_contribution(uuid,uuid,uuid,timestamp with time zone)',
        $pat$ARRAY\['chairperson','treasurer'\]$pat$,
        $rep$ARRAY['treasurer']$rep$
      ),
      (
        'public.create_and_record_automatic_charge_payment(uuid,text,uuid,numeric)',
        $pat$ARRAY\['admin','chairperson','secretary','treasurer'\]$pat$,
        $rep$ARRAY['secretary','treasurer']$rep$
      ),
      (
        'public.record_charge_payment(uuid,uuid,numeric)',
        $pat$ARRAY\['admin','chairperson','secretary','treasurer'\]$pat$,
        $rep$ARRAY['secretary','treasurer']$rep$
      ),
      (
        'public.cl_import_financial_batch_atomic(uuid)',
        $pat$ARRAY\[\s*'admin'\s*,\s*'chairperson'\s*,\s*'secretary'\s*,\s*'treasurer'\s*\]$pat$,
        $rep$ARRAY['treasurer']$rep$
      ),
      (
        'public.cl_import_financial_batch_atomic(uuid)',
        $pat$ARRAY\['admin','chairperson','treasurer'\]$pat$,
        $rep$ARRAY['treasurer']$rep$
      ),
      (
        'public.update_group_contribution_cycle_settings(uuid,smallint,smallint)',
        $pat$if auth\.uid\(\) <> v_owner_user_id and coalesce\(v_role,''\) not in \('admin','chairperson'\) then$pat$,
        $rep$if not public.cl_user_has_role(p_group_id, ARRAY['treasurer']::text[]) then$rep$
      ),
      (
        'public.update_group_contribution_settings(uuid,smallint)',
        $pat$IF NOT public\.can_manage_members\(p_group_id\) THEN RAISE EXCEPTION 'Not authorized'; END IF;$pat$,
        $rep$IF NOT public.cl_user_has_role(p_group_id, ARRAY['treasurer']::text[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;$rep$
      ),
      (
        'public.update_group_monthly_contribution_settings(uuid,integer,integer,boolean,numeric)',
        $pat$if v_actor<>v_owner_user_id and coalesce\(v_role,''\) not in \('admin','chairperson'\) then$pat$,
        $rep$if not public.cl_user_has_role(p_group_id, ARRAY['treasurer']::text[]) then$rep$
      )
    ) AS updates(signature, pattern, replacement)
  LOOP
    v_oid := to_regprocedure(r.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Required treasury RPC not found: %', r.signature;
    END IF;

    v_definition := pg_get_functiondef(v_oid);
    v_updated := regexp_replace(v_definition, r.pattern, r.replacement, 'gi');

    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Expected treasury authorization guard not found in %', r.signature;
    END IF;

    EXECUTE v_updated;
  END LOOP;
END;
$direct_treasury_guard_updates$;

COMMENT ON FUNCTION public.cl_user_has_role(uuid,text[]) IS
  'Role matrix: vice chairperson inherits chairperson; vice secretary inherits secretary; platform admin is not implicitly granted treasurer-only permissions.';
