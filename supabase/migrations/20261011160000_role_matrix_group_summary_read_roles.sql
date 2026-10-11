-- Candidate-only read authorization correction.
-- Management roles may read group-wide accounting summaries; ordinary members
-- remain limited to their own contribution position. No schema objects added.
-- These two group-summary SECURITY DEFINER RPCs are not token-gated demo APIs:
-- remove anonymous execution while preserving signed-in use.

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
      AND (
        public.cl_user_has_role(
          m.group_id,
          ARRAY['admin','chairperson','secretary','treasurer']::text[]
        )
        OR m.user_id = auth.uid()
        OR m.auth_user_id = auth.uid()
      )
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
      FROM public.contribution_allocations AS a
      GROUP BY a.payment_id
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
  SELECT pos.member_id, pos.group_id, pos.total_due, pos.total_allocated, pos.arrears, pos.credit, pos.status
  FROM public.members AS m
  CROSS JOIN LATERAL public.get_member_contribution_position(m.id) AS pos
  WHERE m.group_id = p_group_id AND pos.group_id = p_group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_custom_contribution_status(p_group_id uuid)
RETURNS TABLE(member_id uuid, member_name text, contribution_name text, period_id uuid, amount_due numeric, amount_applied numeric, outstanding numeric, status text, due_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group custom contribution status'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.member_id, m.name::text,
    COALESCE(NULLIF(trim(cp.name), ''), NULLIF(trim(ct.name), ''), 'Custom Contribution')::text,
    cp.id, COALESCE(o.due_amount, o.amount_due, 0)::numeric,
    COALESCE(alloc.amount_applied, 0)::numeric,
    GREATEST(COALESCE(o.due_amount, o.amount_due, 0) - COALESCE(alloc.amount_applied, 0), 0)::numeric,
    CASE
      WHEN COALESCE(alloc.amount_applied, 0) >= COALESCE(o.due_amount, o.amount_due, 0) THEN 'paid'
      WHEN COALESCE(alloc.amount_applied, 0) > 0 THEN 'partial'
      ELSE 'outstanding'
    END::text,
    cp.due_date
  FROM public.contribution_obligations AS o
  JOIN public.members AS m ON m.id = o.member_id AND m.group_id = o.group_id
  JOIN public.contribution_periods AS cp ON cp.id = o.period_id AND cp.group_id = o.group_id
  JOIN public.contribution_types AS ct ON ct.id = o.contribution_type_id AND ct.group_id = o.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount), 0)::numeric AS amount_applied
    FROM public.contribution_allocations AS a
    WHERE a.obligation_id = o.id AND a.group_id = o.group_id AND a.member_id = o.member_id
  ) AS alloc ON true
  WHERE o.group_id = p_group_id
    AND lower(trim(COALESCE(ct.code, ''))) = 'custom'
    AND lower(trim(COALESCE(cp.status, ''))) IN ('open', 'due', 'grace')
  ORDER BY cp.due_date NULLS LAST, cp.name, m.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_contribution_positions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_custom_contribution_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_contribution_positions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_custom_contribution_status(uuid) TO authenticated;
