-- Candidate-first, read-only accounting projections for group officers.
-- Do not deploy to production until authenticated role and ledger reconciliation tests pass.

CREATE OR REPLACE FUNCTION public.get_group_custom_contribution_status(p_group_id uuid)
RETURNS TABLE (
  member_id uuid,
  member_name text,
  contribution_name text,
  period_id uuid,
  amount_due numeric,
  amount_applied numeric,
  outstanding numeric,
  status text,
  due_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);

  IF v_role NOT IN ('admin', 'chairperson', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group custom contribution status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.member_id,
    m.name::text,
    COALESCE(NULLIF(trim(cp.name), ''), NULLIF(trim(ct.name), ''), 'Custom Contribution')::text,
    cp.id,
    COALESCE(o.due_amount, o.amount_due, 0)::numeric,
    COALESCE(alloc.amount_applied, 0)::numeric,
    GREATEST(COALESCE(o.due_amount, o.amount_due, 0) - COALESCE(alloc.amount_applied, 0), 0)::numeric,
    CASE
      WHEN COALESCE(alloc.amount_applied, 0) >= COALESCE(o.due_amount, o.amount_due, 0) THEN 'paid'
      WHEN COALESCE(alloc.amount_applied, 0) > 0 THEN 'partial'
      ELSE 'outstanding'
    END::text,
    cp.due_date
  FROM public.contribution_obligations AS o
  JOIN public.members AS m
    ON m.id = o.member_id
   AND m.group_id = o.group_id
  JOIN public.contribution_periods AS cp
    ON cp.id = o.period_id
   AND cp.group_id = o.group_id
  JOIN public.contribution_types AS ct
    ON ct.id = o.contribution_type_id
   AND ct.group_id = o.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount), 0)::numeric AS amount_applied
    FROM public.contribution_allocations AS a
    WHERE a.obligation_id = o.id
      AND a.group_id = o.group_id
      AND a.member_id = o.member_id
  ) AS alloc ON true
  WHERE o.group_id = p_group_id
    AND lower(trim(COALESCE(ct.code, ''))) = 'custom'
    AND lower(trim(COALESCE(cp.status, ''))) IN ('open', 'due', 'grace')
  ORDER BY cp.due_date NULLS LAST, cp.name, m.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_custom_contribution_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_custom_contribution_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_contribution_positions(p_group_id uuid)
RETURNS TABLE (
  member_id uuid,
  group_id uuid,
  total_due numeric,
  total_allocated numeric,
  arrears numeric,
  credit numeric,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);

  IF v_role NOT IN ('admin', 'chairperson', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group cumulative contribution positions'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pos.member_id, pos.group_id, pos.total_due, pos.total_allocated,
         pos.arrears, pos.credit, pos.status
  FROM public.members AS m
  CROSS JOIN LATERAL public.get_member_contribution_position(m.id) AS pos
  WHERE m.group_id = p_group_id
    AND pos.group_id = p_group_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_contribution_positions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_contribution_positions(uuid) TO authenticated;
