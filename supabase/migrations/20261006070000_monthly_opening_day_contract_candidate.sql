/*
  CHAMA LIVE — Monthly Contribution Opening-Day Contract
  STATUS: CANDIDATE ONLY — DO NOT EXECUTE IN PRODUCTION.

  Scope:
    - Replace the monthly closing-day semantic with monthly opening-day.
    - Save amount + opening day atomically.
    - Derive current opening/closing dates without creating/activating cycles.
    - No obligations, payments, fines, allocations, or accounting mutations.
*/

BEGIN;

CREATE TABLE IF NOT EXISTS public.group_contribution_settings (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  monthly_opening_day smallint NOT NULL DEFAULT 1
    CHECK (monthly_opening_day BETWEEN 1 AND 28),
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.group_contribution_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_group_contribution_settings(
  p_group_id uuid
)
RETURNS TABLE (
  group_id uuid,
  monthly_contribution numeric,
  monthly_opening_day smallint,
  current_opening_date date,
  current_closing_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_day smallint;
  v_this_open date;
  v_open date;
  v_close date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN
    RAISE EXCEPTION 'Not authorized to manage contribution settings';
  END IF;

  SELECT
    COALESCE(s.monthly_opening_day, 1),
    g.monthly_contribution
  INTO
    v_day,
    monthly_contribution
  FROM public.groups g
  LEFT JOIN public.group_contribution_settings s
    ON s.group_id = g.id
  WHERE g.id = p_group_id;

  IF monthly_contribution IS NULL THEN
    RAISE EXCEPTION 'Group does not exist';
  END IF;

  v_this_open :=
    (
      date_trunc('month', current_date)::date
      + (v_day - 1)
    );

  IF current_date >= v_this_open THEN
    v_open := v_this_open;
  ELSE
    v_open :=
      (
        (date_trunc('month', current_date) - interval '1 month')::date
        + (v_day - 1)
      );
  END IF;

  v_close :=
    (
      date_trunc('month', v_open + interval '1 month')::date
      + (v_day - 1)
      - 1
    );

  group_id := p_group_id;
  monthly_opening_day := v_day;
  current_opening_date := v_open;
  current_closing_date := v_close;

  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_group_contribution_settings(
  p_group_id uuid,
  p_monthly_contribution numeric,
  p_monthly_opening_day smallint
)
RETURNS TABLE (
  group_id uuid,
  monthly_contribution numeric,
  monthly_opening_day smallint,
  current_opening_date date,
  current_closing_date date
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_open date;
  v_close date;
  v_this_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN
    RAISE EXCEPTION 'Not authorized to manage contribution settings';
  END IF;

  IF p_monthly_contribution IS NULL OR p_monthly_contribution < 0 THEN
    RAISE EXCEPTION 'Monthly contribution must be a valid non-negative amount';
  END IF;

  IF p_monthly_opening_day IS NULL
     OR p_monthly_opening_day < 1
     OR p_monthly_opening_day > 28 THEN
    RAISE EXCEPTION 'Monthly opening day must be a whole number between 1 and 28';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = p_group_id
  ) THEN
    RAISE EXCEPTION 'Group does not exist';
  END IF;

  /*
    One atomic configuration write:
      - group monthly amount
      - monthly opening-day setting

    No contribution period, obligation, payment, fine, allocation,
    activation, or accounting row is created here.
  */
  UPDATE public.groups
  SET monthly_contribution = p_monthly_contribution
  WHERE id = p_group_id;

  INSERT INTO public.group_contribution_settings (
    group_id,
    monthly_opening_day,
    updated_by,
    updated_at
  )
  VALUES (
    p_group_id,
    p_monthly_opening_day,
    auth.uid(),
    now()
  )
  ON CONFLICT (group_id)
  DO UPDATE SET
    monthly_opening_day = EXCLUDED.monthly_opening_day,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  v_this_open :=
    (
      date_trunc('month', current_date)::date
      + (p_monthly_opening_day - 1)
    );

  IF current_date >= v_this_open THEN
    v_open := v_this_open;
  ELSE
    v_open :=
      (
        (date_trunc('month', current_date) - interval '1 month')::date
        + (p_monthly_opening_day - 1)
      );
  END IF;

  v_close :=
    (
      date_trunc('month', v_open + interval '1 month')::date
      + (p_monthly_opening_day - 1)
      - 1
    );

  group_id := p_group_id;
  monthly_contribution := p_monthly_contribution;
  monthly_opening_day := p_monthly_opening_day;
  current_opening_date := v_open;
  current_closing_date := v_close;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_contribution_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_group_contribution_settings(uuid, numeric, smallint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_group_contribution_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_group_contribution_settings(uuid, numeric, smallint) TO authenticated;

COMMIT;
