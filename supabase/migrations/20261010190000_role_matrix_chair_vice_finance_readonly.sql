-- CHAMA LIVE role matrix candidate.
-- IMPORTANT: Candidate migration only. Do not apply to production before
-- candidate-database verification and explicit deployment approval.
--
-- Rules:
--   * vice chairperson inherits chairperson permissions.
--   * vice secretary inherits secretary permissions.
--   * admin/administrator may administer across groups through the shared
--     role helpers, but do not inherit treasurer-only permissions implicitly.
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

COMMENT ON FUNCTION public.cl_user_has_role(uuid,text[]) IS
  'Role matrix: vice chairperson inherits chairperson; vice secretary inherits secretary; platform admin is not implicitly granted treasurer-only permissions.';
