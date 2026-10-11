-- Candidate-only authorization correction for officer dashboard accounting reads.
-- Allows Secretary/Vice Secretary and Chairperson/Vice Chairperson to view
-- custom contribution payment status. Treasurer's existing access is preserved.
-- Vice-office titles are normalized by current_user_role(uuid) from the protected
-- actual_position projection. No writes, accounting changes, or schema changes.

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

  -- Keep the existing Treasurer permission. Add Secretary; the protected
  -- current_user_role() projection normalizes Vice Secretary to secretary and
  -- Vice Chairperson to chairperson. Do not widen can_manage_members().
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'treasurer', 'secretary') THEN
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
