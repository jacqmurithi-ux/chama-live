-- Candidate-only consistency fix: expenses.recorded_by references auth.users(id).
-- The prior trigger chain resolved recorded_by to members.id, conflicting with that FK
-- and preventing legitimate expense submissions. Keep the existing schema unchanged:
-- persist the authenticated user UUID, and validate its active membership in the group.

CREATE OR REPLACE FUNCTION public.set_recorded_by_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to record an expense';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = NEW.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, '')) IN ('active', 'approved')
      AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ) THEN
    RAISE EXCEPTION 'No active member record is linked to this account';
  END IF;

  NEW.recorded_by := auth.uid();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recorded_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.recorded_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Invalid expense recorder';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = NEW.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, '')) = 'active'
      AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ) THEN
    RAISE EXCEPTION 'No active member record is linked to this account';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_expense_recorded_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- This column's FK is auth.users(id), so never rewrite it to members.id.
  -- Always bind the audit field to the caller and independently verify group membership.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = NEW.group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, '')) = 'active'
      AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ) THEN
    RAISE EXCEPTION 'The expense recorder is not an active member of this group';
  END IF;

  NEW.recorded_by := auth.uid();
  RETURN NEW;
END;
$function$;
