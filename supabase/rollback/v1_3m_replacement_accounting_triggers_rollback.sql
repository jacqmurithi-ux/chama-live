/*
  CHAMA LIVE — v1.3M rollback artifact

  STATUS:
    Git-only rollback artifact.
    NOT AUTHORIZED FOR PRODUCTION EXECUTION.

  Purpose:
    Restore the exact pre-v1.3M trigger inventory verified read-only
    immediately before the replacement migration was authored.

  Verified pre-migration triggers:
    public.contributions
      - audit_delete_trigger
      - contributions_set_recorded_by
      - contributions_validate_recorded_by
      - prevent_closed_month_contribution_trigger
      - trg_normalize_contribution_recorded_by
      - trg_validate_monthly_payment_domain

    public.contribution_allocations
      - trg_validate_monthly_allocation_domain

  Existing legacy trigger functions are retained by the forward migration
  and are therefore reused here. No accounting data is changed.
  This artifact must be reviewed and explicitly authorized separately.
*/

BEGIN;

-- Remove replacement triggers introduced by v1.3M.
DROP TRIGGER IF EXISTS trg_cl_guard_open_financial_period
  ON public.contributions;

DROP TRIGGER IF EXISTS trg_cl_guard_contribution_allocation
  ON public.contribution_allocations;

-- Restore the exact pre-migration contributions trigger definitions.
CREATE TRIGGER prevent_closed_month_contribution_trigger
BEFORE INSERT OR DELETE OR UPDATE
ON public.contributions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_closed_month_contribution();

CREATE TRIGGER trg_validate_monthly_payment_domain
BEFORE INSERT OR UPDATE OF initiative_id, contribution_type
ON public.contributions
FOR EACH ROW
EXECUTE FUNCTION public.validate_monthly_payment_domain();

-- Restore the exact pre-migration initiative-specific allocation trigger.
CREATE TRIGGER trg_validate_monthly_allocation_domain
BEFORE INSERT OR UPDATE
ON public.contribution_allocations
FOR EACH ROW
EXECUTE FUNCTION public.validate_monthly_allocation_domain();

-- Remove only the replacement guard functions introduced by v1.3M.
DROP FUNCTION IF EXISTS public.cl_guard_open_financial_period();
DROP FUNCTION IF EXISTS public.cl_guard_contribution_allocation();

COMMIT;
