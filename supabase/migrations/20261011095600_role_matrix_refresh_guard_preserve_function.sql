-- Candidate-only authorization hardening using the existing production function bodies.
-- Only role guards and EXECUTE grants change; canonical accounting logic is preserved.
CREATE OR REPLACE FUNCTION public.refresh_canonical_contribution_accounting(p_group_id uuid, p_through_month text, p_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date;
  v_count integer:=0;
  v_member_horizon date;
  v_rebuild_start date;
  v_member_row record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  IF NOT public.cl_user_has_role(p_group_id, ARRAY['treasurer']::text[]) THEN
    RAISE EXCEPTION 'Only the treasurer may refresh canonical contribution accounting' USING ERRCODE='42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group is required';
  END IF;

  IF p_through_month IS NULL
     OR p_through_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format';
  END IF;

  v_month:=(p_through_month||'-01')::date;

  IF p_member_id IS NOT NULL THEN
    SELECT
      least(
        coalesce((SELECT min(date_trunc('month',mcr.effective_from)::date) FROM public.member_contribution_rules mcr WHERE mcr.group_id=p_group_id AND mcr.member_id=p_member_id AND mcr.frequency='monthly' AND mcr.effective_from IS NOT NULL),v_month),
        coalesce((SELECT min(date_trunc('month',o.obligation_month)::date) FROM public.contribution_obligations o WHERE o.group_id=p_group_id AND o.member_id=p_member_id),v_month),
        coalesce((SELECT min(date_trunc('month',c.contribution_date)::date) FROM public.contributions c WHERE c.group_id=p_group_id AND c.member_id=p_member_id AND lower(trim(coalesce(c.contribution_type,'')))='monthly' AND c.contribution_date IS NOT NULL),v_month),
        v_month
      ),
      greatest(
        v_month,
        coalesce(
          (
            SELECT max(c.contribution_date)
            FROM public.contributions c
            WHERE c.member_id=p_member_id
              AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
          ),
          v_month
        ),
        coalesce(
          (
            SELECT max(o.obligation_month)
            FROM public.contribution_obligations o
            WHERE o.member_id=p_member_id
          ),
          v_month
        )
      )
    INTO v_rebuild_start,v_member_horizon
    FROM public.members m
    WHERE m.id=p_member_id
      AND m.group_id=p_group_id;

    IF v_rebuild_start IS NULL THEN
      RAISE EXCEPTION 'Member does not belong to this group';
    END IF;

    v_rebuild_start:=least(
      date_trunc('month',v_rebuild_start)::date,
      v_month
    );

    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      v_rebuild_start,
      date_trunc('month',v_member_horizon)::date
    );

    PERFORM public.cl_2b_refresh_member(
      p_member_id,
      date_trunc('month',v_member_horizon)::date
    );
    v_count:=1;
  ELSE
    SELECT
      least(
        coalesce((SELECT min(date_trunc('month',mcr.effective_from)::date) FROM public.member_contribution_rules mcr WHERE mcr.group_id=p_group_id AND mcr.frequency='monthly' AND mcr.effective_from IS NOT NULL),v_month),
        coalesce((SELECT min(date_trunc('month',o.obligation_month)::date) FROM public.contribution_obligations o WHERE o.group_id=p_group_id),v_month),
        coalesce((SELECT min(date_trunc('month',c.contribution_date)::date) FROM public.contributions c WHERE c.group_id=p_group_id AND lower(trim(coalesce(c.contribution_type,'')))='monthly' AND c.contribution_date IS NOT NULL),v_month),
        v_month
      ),
      greatest(
        v_month,
        coalesce(
          (
            SELECT max(c.contribution_date)
            FROM public.contributions c
            WHERE c.group_id=p_group_id
              AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
          ),
          v_month
        ),
        coalesce(
          (
            SELECT max(o.obligation_month)
            FROM public.contribution_obligations o
            WHERE o.group_id=p_group_id
          ),
          v_month
        )
      )
    INTO v_rebuild_start,v_member_horizon
    FROM public.members m
    WHERE m.group_id=p_group_id;

    v_rebuild_start:=least(
      coalesce(
        date_trunc('month',v_rebuild_start)::date,
        v_month
      ),
      v_month
    );

    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      v_rebuild_start,
      date_trunc('month',v_member_horizon)::date
    );

    FOR v_member_row IN
      SELECT m.id
      FROM public.members m
      WHERE m.group_id=p_group_id
      ORDER BY m.id
    LOOP
      PERFORM public.cl_2b_refresh_member(
        v_member_row.id,
        date_trunc('month',v_member_horizon)::date
      );
      v_count:=v_count+1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'group_id',p_group_id,
    'through_month',p_through_month,
    'members_refreshed',v_count,
    'rebuild_horizon',
      date_trunc('month',v_member_horizon)::date
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.refresh_my_managed_member_accounting(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_through_month text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Member is required';
  END IF;

  SELECT m.group_id
  INTO v_group_id
  FROM public.members AS m
  WHERE m.id = p_member_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Member does not exist';
  END IF;

  IF NOT public.cl_user_has_role(v_group_id, ARRAY['treasurer']::text[]) THEN
    RAISE EXCEPTION 'Only the treasurer may refresh canonical contribution accounting' USING ERRCODE='42501';
  END IF;

  v_through_month :=
    to_char(
      date_trunc('month', current_date)::date,
      'YYYY-MM'
    );

  v_result :=
    public.refresh_canonical_contribution_accounting(
      v_group_id,
      v_through_month,
      p_member_id
    );

  RETURN v_result;
END;
$function$;


REVOKE ALL ON FUNCTION public.refresh_canonical_contribution_accounting(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_canonical_contribution_accounting(uuid,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cl_2b_refresh_member(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cl_2b_refresh_member(uuid,date) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_my_managed_member_accounting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_managed_member_accounting(uuid) TO authenticated;
