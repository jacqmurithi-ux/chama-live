-- Candidate-only privacy hardening for member accounting.
-- Ordinary members can read their own payment/obligation/allocation rows only.
-- Group management roles can read group-wide rows through role-guarded read paths.
-- No tables or columns are added.

DROP POLICY IF EXISTS contributions_select_same_group ON public.contributions;
DROP POLICY IF EXISTS contributions_select_own_or_management ON public.contributions;
CREATE POLICY contributions_select_own_or_management
ON public.contributions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = contributions.member_id
      AND m.group_id = contributions.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
  )
  OR public.cl_user_has_role(
    contributions.group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  )
);

DROP POLICY IF EXISTS contribution_obligations_select_group ON public.contribution_obligations;
DROP POLICY IF EXISTS contribution_obligations_select_own_or_management ON public.contribution_obligations;
CREATE POLICY contribution_obligations_select_own_or_management
ON public.contribution_obligations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = contribution_obligations.member_id
      AND m.group_id = contribution_obligations.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
  )
  OR public.cl_user_has_role(
    contribution_obligations.group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  )
);

DROP POLICY IF EXISTS contribution_allocations_select_group ON public.contribution_allocations;
DROP POLICY IF EXISTS contribution_allocations_select_own_or_management ON public.contribution_allocations;
CREATE POLICY contribution_allocations_select_own_or_management
ON public.contribution_allocations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = contribution_allocations.member_id
      AND m.group_id = contribution_allocations.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
  )
  OR public.cl_user_has_role(
    contribution_allocations.group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  )
);

DROP POLICY IF EXISTS member_payment_evidence_select_pending_verifiers ON public.member_payment_evidence;
CREATE POLICY member_payment_evidence_select_pending_verifiers
ON public.member_payment_evidence
FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND public.cl_user_has_role(group_id, ARRAY['treasurer']::text[])
);

-- This member-specific RPC must never become a back door for another member's
-- financial position, even when the caller also holds a group office.
CREATE OR REPLACE FUNCTION public.get_member_contribution_position(p_member_id uuid)
RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH target_member AS (
    SELECT m.id, m.group_id
    FROM public.members AS m
    WHERE m.id = p_member_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
  ),
  monthly_types AS (
    SELECT DISTINCT ON (ct.group_id)
      ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types AS ct
    WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
       OR lower(trim(ct.name)) = 'monthly'
    ORDER BY ct.group_id,
      CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
      ct.created_at, ct.id
  ),
  obligation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(o.due_amount), 0)::numeric AS total_due
    FROM public.contribution_obligations AS o
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  allocation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(a.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations AS a
    JOIN public.contribution_obligations AS o ON o.id = a.obligation_id
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  payment_totals AS (
    SELECT c.member_id, c.group_id,
      COALESCE(SUM(c.amount - COALESCE(pa.allocated_amount, 0)), 0)::numeric AS credit
    FROM public.contributions AS c
    JOIN target_member AS tm ON tm.id = c.member_id AND tm.group_id = c.group_id
    LEFT JOIN (
      SELECT a.payment_id, COALESCE(SUM(a.amount), 0)::numeric AS allocated_amount
      FROM public.contribution_allocations AS a GROUP BY a.payment_id
    ) AS pa ON pa.payment_id = c.id
    WHERE lower(trim(c.contribution_type)) = 'monthly'
    GROUP BY c.member_id, c.group_id
  )
  SELECT tm.id AS member_id, tm.group_id,
    COALESCE(ot.total_due, 0)::numeric(14,2) AS total_due,
    COALESCE(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
    GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0)::numeric(14,2) AS arrears,
    GREATEST(COALESCE(pt.credit, 0), 0)::numeric(14,2) AS credit,
    CASE
      WHEN GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0) > 0 THEN 'ARREARS'
      WHEN GREATEST(COALESCE(pt.credit, 0), 0) > 0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END AS status
  FROM target_member AS tm
  LEFT JOIN obligation_totals AS ot ON ot.member_id = tm.id AND ot.group_id = tm.group_id
  LEFT JOIN allocation_totals AS at ON at.member_id = tm.id AND at.group_id = tm.group_id
  LEFT JOIN payment_totals AS pt ON pt.member_id = tm.id AND pt.group_id = tm.group_id
$function$;

-- Keep the group-summary RPC role-guarded, but compute group totals directly
-- rather than calling the member-specific RPC above.
CREATE OR REPLACE FUNCTION public.get_group_contribution_positions(p_group_id uuid)
RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group cumulative contribution positions'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH monthly_types AS (
    SELECT DISTINCT ON (ct.group_id) ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types ct
    WHERE lower(trim(coalesce(ct.code,'')))='monthly' OR lower(trim(ct.name))='monthly'
    ORDER BY ct.group_id, CASE WHEN lower(trim(coalesce(ct.code,'')))='monthly' THEN 0 ELSE 1 END, ct.created_at, ct.id
  ), obligation_totals AS (
    SELECT o.member_id,o.group_id,coalesce(sum(o.due_amount),0)::numeric AS total_due
    FROM public.contribution_obligations o
    JOIN monthly_types mt ON mt.group_id=o.group_id AND mt.contribution_type_id=o.contribution_type_id
    WHERE o.group_id=p_group_id GROUP BY o.member_id,o.group_id
  ), allocation_totals AS (
    SELECT o.member_id,o.group_id,coalesce(sum(a.amount),0)::numeric AS total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id=a.obligation_id
    JOIN monthly_types mt ON mt.group_id=o.group_id AND mt.contribution_type_id=o.contribution_type_id
    WHERE o.group_id=p_group_id GROUP BY o.member_id,o.group_id
  ), payment_totals AS (
    SELECT c.member_id,c.group_id,coalesce(sum(c.amount-coalesce(pa.allocated_amount,0)),0)::numeric AS credit
    FROM public.contributions c
    LEFT JOIN (
      SELECT a.payment_id,coalesce(sum(a.amount),0)::numeric AS allocated_amount
      FROM public.contribution_allocations a GROUP BY a.payment_id
    ) pa ON pa.payment_id=c.id
    WHERE c.group_id=p_group_id AND lower(trim(c.contribution_type))='monthly'
    GROUP BY c.member_id,c.group_id
  )
  SELECT m.id,m.group_id,
    coalesce(ot.total_due,0)::numeric(14,2),
    coalesce(at.total_allocated,0)::numeric(14,2),
    greatest(coalesce(ot.total_due,0)-coalesce(at.total_allocated,0),0)::numeric(14,2),
    greatest(coalesce(pt.credit,0),0)::numeric(14,2),
    CASE
      WHEN greatest(coalesce(ot.total_due,0)-coalesce(at.total_allocated,0),0)>0 THEN 'ARREARS'
      WHEN greatest(coalesce(pt.credit,0),0)>0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END
  FROM public.members m
  LEFT JOIN obligation_totals ot ON ot.member_id=m.id AND ot.group_id=m.group_id
  LEFT JOIN allocation_totals at ON at.member_id=m.id AND at.group_id=m.group_id
  LEFT JOIN payment_totals pt ON pt.member_id=m.id AND pt.group_id=m.group_id
  WHERE m.group_id=p_group_id;
END;
$function$;
