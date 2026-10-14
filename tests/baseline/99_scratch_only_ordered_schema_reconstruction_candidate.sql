-- SCRATCH-ONLY CANDIDATE: ordered reconstruction of production schema metadata.
-- Intended target: isolated Supabase project gkqkfgsizzezqorxzwed (test), PostgreSQL 17.11.
-- Source project inspected read-only: ptktftwyltxmtcodyzoa (production), PostgreSQL 17.6.
-- NO APPLICATION DATA IS INCLUDED.
-- DO NOT APPLY TO PRODUCTION.
-- Review the entire file before execution. This reconstruction has not been applied or tested.
-- It reproduces catalog definitions but still requires a post-restore object-by-object parity report
-- and the three controlled regression tests before the onboarding candidate gate can close.

BEGIN;

-- Required extension for production exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS private;

-- Rebuild only the seven known-empty scratch baseline tables; CASCADE removes their scratch dependencies.
DROP VIEW IF EXISTS public.group_balances CASCADE;
DROP VIEW IF EXISTS public.subscription_credit_balances CASCADE;
DROP TABLE IF EXISTS
  public.contribution_allocations,
  public.contribution_obligations,
  public.contributions,
  public.member_contribution_rules,
  public.contribution_types,
  public.members,
  public.groups
CASCADE;

-- Public schema ACL matches the production app-schema baseline; private remains postgres-only.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT CREATE, USAGE ON SCHEMA public TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA private TO postgres;

-- Defer function-body validation until all functions have been restored.
SET LOCAL check_function_bodies = off;

-- 1. Base tables, including identity and generated-column semantics.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.contribution_initiative_requests (
  request_id uuid NOT NULL,
  operation text NOT NULL,
  initiative_id uuid,
  group_id uuid,
  result jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE private.custom_contribution_activation_requests (
  request_id uuid NOT NULL,
  group_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL,
  period_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.custom_contribution_payment_requests (
  request_id uuid NOT NULL,
  operation text NOT NULL,
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.custom_contribution_period_requests (
  request_id uuid NOT NULL,
  group_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL,
  source_period_id uuid NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.custom_contribution_requests (
  request_id uuid NOT NULL,
  operation text NOT NULL,
  group_id uuid NOT NULL,
  contribution_type_id uuid,
  period_id uuid,
  fine_rule_id uuid,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.member_historical_onboarding_requests (
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.member_historical_payment_requests (
  request_id uuid NOT NULL,
  member_id uuid NOT NULL,
  group_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.other_contribution_cycle_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  group_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  request_operation text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE private.other_contribution_cycle_requests (
  request_id uuid NOT NULL,
  operation text NOT NULL,
  cycle_id uuid,
  group_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.other_contribution_payment_requests (
  request_id uuid NOT NULL,
  operation text NOT NULL DEFAULT 'record_other_contribution_payment'::text,
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  payment_id uuid,
  payload_hash text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE private.renewal_attempts (
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  execution_source text NOT NULL,
  result text NOT NULL,
  cycle_before integer,
  cycle_after integer,
  invoice_id uuid,
  idempotency_key text NOT NULL,
  error_code text,
  error_message text
);

CREATE TABLE private.renewal_runs (
  run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  execution_source text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'running'::text,
  error_code text,
  error_message text
);

CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  posted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  member_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'absent'::text
);

CREATE TABLE public.audit_deleted_rows (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  table_name text NOT NULL,
  deleted_row jsonb NOT NULL,
  deleted_by uuid,
  deleted_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.charge_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  amount_applied numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'applied'::text,
  applied_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  goal_name text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  description text,
  frequency text NOT NULL DEFAULT 'monthly'::text,
  start_date date,
  end_date date,
  expected_amount_per_member numeric(12,2),
  target_amount numeric(12,2),
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  initiative_obligation_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_credit_consumptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL,
  credit_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL,
  member_id uuid NOT NULL,
  source_payment_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  remaining_amount numeric(14,2) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_member_terms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  initiative_member_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_obligations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL,
  initiative_member_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount_due numeric(14,2) NOT NULL,
  due_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  initiative_period_id uuid
);

CREATE TABLE public.contribution_initiative_payment_reversals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  reason text NOT NULL,
  reversed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiative_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL,
  period_key text NOT NULL,
  opening_date date NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_initiatives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  start_date date NOT NULL,
  closing_date date NOT NULL,
  default_amount numeric(14,2) NOT NULL,
  frequency text NOT NULL DEFAULT 'one_time'::text,
  status text NOT NULL DEFAULT 'draft'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.contribution_obligations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  obligation_month date NOT NULL,
  due_amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  contribution_type_id uuid NOT NULL,
  rule_id uuid,
  period_id uuid,
  economic_month date GENERATED ALWAYS AS ((date_trunc('month'::text, (obligation_month)::timestamp without time zone))::date) STORED,
  component_kind text NOT NULL DEFAULT 'PARENT'::text,
  lifecycle_state text NOT NULL DEFAULT 'ACTIVE'::text,
  parent_obligation_id uuid
);

CREATE TABLE public.contribution_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  contribution_type_id uuid,
  frequency text NOT NULL,
  period_key text NOT NULL,
  opening_date date NOT NULL,
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  name text,
  description text,
  amount numeric,
  fine_rule_id uuid
);

CREATE TABLE public.contribution_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  code text
);

CREATE TABLE public.contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  contribution_type text NOT NULL DEFAULT 'monthly'::text,
  month text NOT NULL,
  payment_method text NOT NULL,
  reference text,
  recorded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  goal_id uuid,
  contribution_date date DEFAULT CURRENT_DATE,
  notes text,
  mpesa_reference text,
  initiative_id uuid
);

CREATE TABLE public.data_import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'uploaded'::text,
  created_by uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.data_import_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  source_column text NOT NULL,
  target_field text NOT NULL,
  mapping_type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.data_import_rows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  source_sheet text,
  source_row_number integer,
  entity_type text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_data jsonb,
  status text NOT NULL DEFAULT 'pending'::text,
  error_message text,
  target_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  title text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL,
  group_id uuid NOT NULL,
  approver_user_id uuid NOT NULL,
  approval_slot text NOT NULL,
  decision text NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  amount numeric(12,2) NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by uuid,
  receipt_url text,
  approval_status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid,
  page text,
  message text NOT NULL,
  category text DEFAULT 'general'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_charges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  obligation_id uuid NOT NULL,
  charge_type text NOT NULL,
  source text NOT NULL DEFAULT 'automatic'::text,
  source_id uuid,
  accounting_month text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  charge_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  month text NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  status text NOT NULL DEFAULT 'open'::text,
  closed_at timestamp with time zone,
  closed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.fine_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fine_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  direction text NOT NULL,
  reason text NOT NULL,
  authorized_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.fine_payment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fine_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  allocated_amount numeric(14,2) NOT NULL,
  allocated_at timestamp with time zone NOT NULL DEFAULT now(),
  allocated_by uuid NOT NULL,
  source text NOT NULL
);

CREATE TABLE public.fine_rule_contribution_types (
  rule_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL
);

CREATE TABLE public.fine_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  specificity_level smallint NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  calculation_method text NOT NULL,
  fixed_amount numeric(14,2),
  percentage_rate numeric(7,4),
  minimum_amount numeric(14,2),
  maximum_amount numeric(14,2),
  grace_period_value integer NOT NULL DEFAULT 0,
  grace_period_unit text NOT NULL,
  applicability_mode text NOT NULL,
  effective_from timestamp with time zone NOT NULL DEFAULT now(),
  effective_until timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);

CREATE TABLE public.fine_waivers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  fine_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL,
  authorized_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.fines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  trigger_type text NOT NULL,
  trigger_id uuid NOT NULL,
  accounting_month text NOT NULL,
  original_amount numeric(14,2) NOT NULL,
  calculation_method text NOT NULL,
  calculation_base numeric(14,2),
  percentage_rate numeric(7,4),
  fixed_amount numeric(14,2),
  minimum_amount numeric(14,2),
  maximum_amount numeric(14,2),
  calculated_amount numeric(14,2) NOT NULL,
  resolved_closing_at timestamp with time zone,
  triggered_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source_type text NOT NULL DEFAULT 'AUTOMATIC'::text,
  reason text,
  imposed_at timestamp with time zone
);

CREATE TABLE public.group_activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  plan_id uuid,
  title text NOT NULL,
  description text,
  assigned_to uuid,
  start_date date,
  due_date date,
  status text NOT NULL DEFAULT 'not_started'::text,
  progress_percent integer NOT NULL DEFAULT 0,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  admin_name text NOT NULL,
  admin_phone text NOT NULL,
  email text NOT NULL,
  group_name text NOT NULL,
  category text,
  monthly_contribution numeric NOT NULL DEFAULT 0,
  opening_balance numeric NOT NULL DEFAULT 0,
  description text,
  country text NOT NULL DEFAULT 'Kenya'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_group_id uuid,
  approved_member_id uuid,
  approved_member_number text,
  access_code text,
  approval_email_sent_at timestamp with time zone,
  rejection_email_sent_at timestamp with time zone,
  location text,
  town text
);

CREATE TABLE public.group_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  asset_name text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  description text,
  acquired_date date,
  acquisition_cost numeric(12,2),
  current_value numeric(12,2),
  location text,
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  group_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_member_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_contribution_calendar_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  opening_date date NOT NULL,
  closing_date date NOT NULL,
  closing_day smallint NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_contribution_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  monthly_closing_day smallint NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  monthly_grace_days smallint NOT NULL DEFAULT 0
);

CREATE TABLE public.group_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  code text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '30 days'::interval),
  max_uses integer NOT NULL DEFAULT 50,
  use_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  member_id uuid,
  email text,
  code_hash text,
  used_at timestamp with time zone,
  last_sent_at timestamp with time zone,
  role text,
  attempts integer DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.group_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  plan_id uuid,
  title text NOT NULL,
  description text,
  milestone_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'other'::text,
  amount numeric(12,2),
  document_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other'::text,
  start_date date,
  target_date date,
  status text NOT NULL DEFAULT 'planned'::text,
  progress_percent integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  pricing_tier_id uuid NOT NULL,
  pricing_tier_code text NOT NULL,
  standard_group_amount numeric(12,2) NOT NULL,
  standard_member_login_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  started_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.group_support_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  support_type text NOT NULL,
  support_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  status text NOT NULL DEFAULT 'requested'::text,
  approved_by uuid,
  created_by uuid,
  expense_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  registration_number text,
  phone text,
  email text,
  monthly_contribution numeric(12,2) NOT NULL DEFAULT 0,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  category text,
  description text,
  access_code text NOT NULL,
  country text NOT NULL DEFAULT 'Kenya'::text,
  owner_user_id uuid,
  location text,
  town text,
  merry_go_round_enabled boolean NOT NULL DEFAULT false,
  loans_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE public.loan_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  requested_amount numeric(14,2) NOT NULL,
  period_months integer NOT NULL,
  purpose text NOT NULL,
  guarantor_member_id uuid,
  status text NOT NULL DEFAULT 'submitted'::text,
  decision_note text,
  interest_rate_snapshot numeric(7,4),
  interest_type_snapshot text,
  approved_amount numeric(14,2),
  approved_by uuid,
  approved_at timestamp with time zone,
  disbursed_by uuid,
  disbursed_at timestamp with time zone,
  cleared_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  group_id uuid NOT NULL,
  approver_user_id uuid NOT NULL,
  approval_slot text NOT NULL,
  decision text NOT NULL,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  recipient_member_id uuid NOT NULL,
  loan_id uuid,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone
);

CREATE TABLE public.loan_repayment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  repayment_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  principal_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_repayment_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  installment_no integer NOT NULL,
  due_date date NOT NULL,
  principal_due numeric(14,2) NOT NULL,
  interest_due numeric(14,2) NOT NULL,
  penalty_due numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_repayments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'cash'::text,
  reference text,
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_settings (
  group_id uuid NOT NULL,
  interest_rate numeric(7,4) NOT NULL DEFAULT 0,
  interest_type text NOT NULL DEFAULT 'flat'::text,
  max_loan_amount numeric(14,2) NOT NULL DEFAULT 100000,
  max_period_months integer NOT NULL DEFAULT 12,
  late_penalty numeric(14,2) NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  title text NOT NULL,
  date date NOT NULL,
  venue text,
  agenda text[] NOT NULL DEFAULT '{}'::text[],
  minutes text,
  resolution text,
  status text NOT NULL DEFAULT 'upcoming'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.member_contribution_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  contribution_type_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  frequency text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  first_period_rule text NOT NULL DEFAULT 'full_period'::text,
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.member_payment_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  mpesa_reference text,
  payment_date date NOT NULL,
  evidence_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  verified_at timestamp with time zone,
  verified_by uuid,
  rejection_reason text,
  contribution_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.member_position_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  actual_position text NOT NULL,
  actual_position_name text,
  effective_from date NOT NULL,
  effective_to date,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  recorded_by uuid
);

CREATE TABLE public.members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid,
  member_number text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  join_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text,
  membership_number text NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'pending'::text,
  invited_at timestamp with time zone,
  activated_at timestamp with time zone,
  auth_user_id uuid,
  national_id text,
  actual_position text,
  actual_position_name text
);

CREATE TABLE public.merry_go_round_cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  name text NOT NULL,
  contribution_amount numeric(14,2) NOT NULL,
  frequency text NOT NULL,
  start_date date NOT NULL,
  number_of_rounds integer NOT NULL,
  payout_order_method text NOT NULL,
  late_fine_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'::text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.merry_go_round_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  cycle_id uuid,
  round_id uuid,
  member_id uuid,
  notification_type text NOT NULL,
  message text NOT NULL,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone
);

CREATE TABLE public.merry_go_round_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  round_id uuid NOT NULL,
  member_id uuid NOT NULL,
  amount_due numeric(14,2) NOT NULL,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  paid_at timestamp with time zone,
  late_fine_amount numeric(14,2) NOT NULL DEFAULT 0,
  recorded_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.merry_go_round_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  member_id uuid NOT NULL,
  preferred_round_number integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.merry_go_round_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  round_number integer NOT NULL,
  due_date date NOT NULL,
  recipient_member_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  payout_amount numeric(14,2) NOT NULL DEFAULT 0,
  payout_recorded_at timestamp with time zone,
  payout_recorded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.monthly_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  closing_month date NOT NULL,
  closed_by uuid,
  closed_at timestamp with time zone NOT NULL DEFAULT now(),
  total_expected numeric NOT NULL DEFAULT 0,
  total_collected numeric NOT NULL DEFAULT 0,
  total_expenses numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.pending_onboarding (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  group_name text NOT NULL,
  category text NOT NULL DEFAULT 'other'::text,
  monthly_contribution numeric NOT NULL DEFAULT 0,
  opening_balance numeric NOT NULL DEFAULT 0,
  description text,
  admin_name text,
  admin_phone text,
  country text NOT NULL DEFAULT 'Kenya'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE public.platform_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'human'::text,
  actor_display text,
  occurred_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.platform_admins (
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE public.subscription_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_payment_id uuid NOT NULL,
  original_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reversed_at timestamp with time zone
);

CREATE TABLE public.subscription_cycles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  cycle_number integer NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  member_count_snapshot integer NOT NULL,
  pricing_tier_code text NOT NULL,
  standard_group_amount numeric(12,2) NOT NULL,
  group_discount_percent numeric(5,2) NOT NULL,
  group_amount numeric(12,2) NOT NULL,
  standard_member_login_amount numeric(12,2) NOT NULL,
  member_login_discount_percent numeric(5,2) NOT NULL,
  member_login_unit_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  status text NOT NULL DEFAULT 'scheduled'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  group_id uuid NOT NULL,
  line_type text NOT NULL,
  member_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL,
  unit_amount numeric(12,2) NOT NULL,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  invoice_number text NOT NULL,
  member_count_snapshot integer NOT NULL,
  pricing_tier_code text NOT NULL,
  standard_group_amount numeric(12,2) NOT NULL,
  group_discount_amount numeric(12,2) NOT NULL,
  group_amount numeric(12,2) NOT NULL,
  member_login_count integer NOT NULL,
  member_login_unit_amount numeric(12,2) NOT NULL,
  member_login_amount numeric(12,2) NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  total_discount numeric(12,2) NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  status text NOT NULL DEFAULT 'draft'::text,
  issued_at timestamp with time zone,
  due_at timestamp with time zone,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_member_billing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  group_id uuid NOT NULL,
  member_id uuid NOT NULL,
  billable_from_cycle_id uuid NOT NULL,
  billable_until_cycle_id uuid,
  activated_at timestamp with time zone NOT NULL,
  deactivated_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_payment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  allocation_type text NOT NULL,
  credit_id uuid,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  reversed_at timestamp with time zone
);

CREATE TABLE public.subscription_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  group_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  provider text,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending'::text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_pricing_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tier_code text NOT NULL,
  min_members integer NOT NULL,
  max_members integer,
  standard_group_amount numeric(12,2) NOT NULL,
  standard_member_login_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'KES'::text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Table constraints (PK, unique, checks, exclusion constraints and foreign keys).
ALTER TABLE private.contribution_initiative_requests ADD CONSTRAINT contribution_initiative_requests_pkey PRIMARY KEY (request_id, operation);
ALTER TABLE private.custom_contribution_activation_requests ADD CONSTRAINT custom_contribution_activation_requests_group_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE private.custom_contribution_activation_requests ADD CONSTRAINT custom_contribution_activation_requests_pkey PRIMARY KEY (request_id);
ALTER TABLE private.custom_contribution_payment_requests ADD CONSTRAINT custom_contribution_payment_requests_pkey PRIMARY KEY (request_id, operation);
ALTER TABLE private.custom_contribution_period_requests ADD CONSTRAINT custom_contribution_period_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE private.custom_contribution_period_requests ADD CONSTRAINT custom_contribution_period_requests_pkey PRIMARY KEY (request_id);
ALTER TABLE private.custom_contribution_requests ADD CONSTRAINT custom_contribution_requests_group_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE private.custom_contribution_requests ADD CONSTRAINT custom_contribution_requests_operation_check CHECK (operation = 'create'::text);
ALTER TABLE private.custom_contribution_requests ADD CONSTRAINT custom_contribution_requests_payload_hash_check CHECK (payload_hash ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE private.custom_contribution_requests ADD CONSTRAINT custom_contribution_requests_pkey PRIMARY KEY (request_id, operation);
ALTER TABLE private.member_historical_onboarding_requests ADD CONSTRAINT member_historical_onboarding_requests_pkey PRIMARY KEY (request_id);
ALTER TABLE private.member_historical_payment_requests ADD CONSTRAINT member_historical_payment_requests_member_fk FOREIGN KEY (group_id, member_id) REFERENCES members(group_id, id);
ALTER TABLE private.member_historical_payment_requests ADD CONSTRAINT member_historical_payment_requests_pkey PRIMARY KEY (request_id);
ALTER TABLE private.other_contribution_cycle_audit ADD CONSTRAINT other_contribution_cycle_audit_action_ck CHECK (action = ANY (ARRAY['CYCLE_CREATED'::text, 'CYCLE_ACTIVATED'::text, 'CYCLE_OBLIGATIONS_GENERATED'::text, 'CYCLE_FINE_GENERATION'::text, 'CYCLE_CLOSED'::text]));
ALTER TABLE private.other_contribution_cycle_audit ADD CONSTRAINT other_contribution_cycle_audit_cycle_fk FOREIGN KEY (cycle_id) REFERENCES contribution_periods(id) ON DELETE RESTRICT;
ALTER TABLE private.other_contribution_cycle_audit ADD CONSTRAINT other_contribution_cycle_audit_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT;
ALTER TABLE private.other_contribution_cycle_audit ADD CONSTRAINT other_contribution_cycle_audit_pkey PRIMARY KEY (id);
ALTER TABLE private.other_contribution_cycle_audit ADD CONSTRAINT other_contribution_cycle_audit_request_fk FOREIGN KEY (request_id, request_operation) REFERENCES private.other_contribution_cycle_requests(request_id, operation) ON DELETE RESTRICT;
ALTER TABLE private.other_contribution_cycle_requests ADD CONSTRAINT other_contribution_cycle_requests_cycle_fk FOREIGN KEY (cycle_id) REFERENCES contribution_periods(id) ON DELETE RESTRICT;
ALTER TABLE private.other_contribution_cycle_requests ADD CONSTRAINT other_contribution_cycle_requests_cycle_required_ck CHECK (operation = 'create'::text OR cycle_id IS NOT NULL);
ALTER TABLE private.other_contribution_cycle_requests ADD CONSTRAINT other_contribution_cycle_requests_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT;
ALTER TABLE private.other_contribution_cycle_requests ADD CONSTRAINT other_contribution_cycle_requests_operation_ck CHECK (operation = ANY (ARRAY['create'::text, 'activate'::text, 'generate_fine'::text]));
ALTER TABLE private.other_contribution_cycle_requests ADD CONSTRAINT other_contribution_cycle_requests_pkey PRIMARY KEY (request_id, operation);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_completion_ck CHECK (completed_at IS NULL OR payment_id IS NOT NULL);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_completion_time_ck CHECK (completed_at IS NULL OR completed_at >= created_at);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_cycle_fk FOREIGN KEY (cycle_id) REFERENCES contribution_periods(id);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_group_fk FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_member_fk FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_operation_ck CHECK (operation = 'record_other_contribution_payment'::text);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_payment_fk FOREIGN KEY (payment_id) REFERENCES contributions(id);
ALTER TABLE private.other_contribution_payment_requests ADD CONSTRAINT other_contribution_payment_requests_pkey PRIMARY KEY (request_id, operation);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_cycle_after_ck CHECK (cycle_after IS NULL OR cycle_after >= 1);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_cycle_before_ck CHECK (cycle_before IS NULL OR cycle_before >= 1);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_execution_source_ck CHECK (execution_source = ANY (ARRAY['human'::text, 'scheduler'::text]));
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_idempotency_key_uq UNIQUE (idempotency_key);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_pkey PRIMARY KEY (attempt_id);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_result_ck CHECK (result = ANY (ARRAY['renewed'::text, 'not_due'::text, 'already_renewed'::text, 'anomalous'::text, 'failed'::text]));
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_result_invariants_ck CHECK (result = 'renewed'::text AND cycle_before IS NOT NULL AND cycle_after = (cycle_before + 1) AND invoice_id IS NOT NULL OR result = 'not_due'::text AND cycle_before IS NOT NULL AND cycle_after IS NULL AND invoice_id IS NULL OR result = 'already_renewed'::text AND cycle_before IS NOT NULL AND cycle_after IS NOT NULL AND cycle_after > cycle_before AND invoice_id IS NOT NULL OR result = 'anomalous'::text AND cycle_after IS NULL AND invoice_id IS NULL OR result = 'failed'::text AND cycle_before IS NOT NULL AND cycle_after IS NULL AND invoice_id IS NULL);
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_run_fk FOREIGN KEY (run_id) REFERENCES private.renewal_runs(run_id) ON DELETE RESTRICT;
ALTER TABLE private.renewal_attempts ADD CONSTRAINT renewal_attempts_run_subscription_uq UNIQUE (run_id, subscription_id);
ALTER TABLE private.renewal_runs ADD CONSTRAINT renewal_runs_execution_source_ck CHECK (execution_source = ANY (ARRAY['human'::text, 'scheduler'::text]));
ALTER TABLE private.renewal_runs ADD CONSTRAINT renewal_runs_idempotency_key_uq UNIQUE (idempotency_key);
ALTER TABLE private.renewal_runs ADD CONSTRAINT renewal_runs_pkey PRIMARY KEY (run_id);
ALTER TABLE private.renewal_runs ADD CONSTRAINT renewal_runs_status_ck CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]));
ALTER TABLE private.renewal_runs ADD CONSTRAINT renewal_runs_status_completion_ck CHECK (status = 'running'::text AND completed_at IS NULL OR (status = ANY (ARRAY['completed'::text, 'failed'::text])) AND completed_at IS NOT NULL);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES members(id);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_meeting_id_member_id_key UNIQUE (meeting_id, member_id);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check CHECK (status = ANY (ARRAY['present'::text, 'absent'::text]));
ALTER TABLE public.audit_deleted_rows ADD CONSTRAINT audit_deleted_rows_pkey PRIMARY KEY (id);
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_amount_positive CHECK (amount_applied > 0::numeric);
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES financial_charges(id) ON DELETE RESTRICT;
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_charge_payment_unique UNIQUE (charge_id, payment_id);
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES contributions(id) ON DELETE RESTRICT;
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.charge_payments ADD CONSTRAINT charge_payments_status_valid CHECK (status = 'applied'::text);
ALTER TABLE public.contribution_allocations ADD CONSTRAINT contribution_allocations_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.contribution_allocations ADD CONSTRAINT contribution_allocations_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES contribution_obligations(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_allocations ADD CONSTRAINT contribution_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES contributions(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_allocations ADD CONSTRAINT contribution_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_allocations ADD CONSTRAINT contribution_allocations_unique UNIQUE (payment_id, obligation_id);
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_category_check CHECK (category = ANY (ARRAY['regular'::text, 'welfare'::text, 'emergency'::text, 'investment'::text, 'project'::text, 'event'::text, 'fundraising'::text, 'other'::text]));
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id);
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_frequency_check CHECK (frequency = ANY (ARRAY['one_time'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text, 'bimonthly'::text, 'quarterly'::text, 'custom'::text]));
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_goals ADD CONSTRAINT contribution_goals_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'completed'::text, 'archived'::text]));
ALTER TABLE public.contribution_initiative_allocations ADD CONSTRAINT contribution_initiative_alloc_payment_id_initiative_obligat_key UNIQUE (payment_id, initiative_obligation_id);
ALTER TABLE public.contribution_initiative_allocations ADD CONSTRAINT contribution_initiative_allocatio_initiative_obligation_id_fkey FOREIGN KEY (initiative_obligation_id) REFERENCES contribution_initiative_obligations(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_allocations ADD CONSTRAINT contribution_initiative_allocations_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.contribution_initiative_allocations ADD CONSTRAINT contribution_initiative_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES contributions(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_allocations ADD CONSTRAINT contribution_initiative_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_credit_consumptions ADD CONSTRAINT contribution_initiative_credit_cons_allocation_id_credit_id_key UNIQUE (allocation_id, credit_id);
ALTER TABLE public.contribution_initiative_credit_consumptions ADD CONSTRAINT contribution_initiative_credit_consumptions_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES contribution_initiative_allocations(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_credit_consumptions ADD CONSTRAINT contribution_initiative_credit_consumptions_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.contribution_initiative_credit_consumptions ADD CONSTRAINT contribution_initiative_credit_consumptions_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES contribution_initiative_credits(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_credit_consumptions ADD CONSTRAINT contribution_initiative_credit_consumptions_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_check CHECK (remaining_amount >= 0::numeric AND remaining_amount <= amount);
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES contribution_initiatives(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_payment_lineage_uq UNIQUE (source_payment_id, initiative_id, member_id);
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_credits ADD CONSTRAINT contribution_initiative_credits_source_payment_id_fkey FOREIGN KEY (source_payment_id) REFERENCES contributions(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_membe_initiative_member_id_effectiv_key UNIQUE (initiative_member_id, effective_from);
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_member_terms_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_member_terms_check CHECK (effective_to IS NULL OR effective_from <= effective_to);
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_member_terms_initiative_member_id_fkey FOREIGN KEY (initiative_member_id) REFERENCES contribution_initiative_members(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_member_terms_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_member_terms ADD CONSTRAINT contribution_initiative_member_terms_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_check CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to);
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_id_initiative_id_member_id_key UNIQUE (id, initiative_id, member_id);
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES contribution_initiatives(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_initiative_id_member_id_key UNIQUE (initiative_id, member_id);
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_members ADD CONSTRAINT contribution_initiative_members_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'removed'::text]));
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_amount_due_check CHECK (amount_due >= 0::numeric);
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES contribution_initiatives(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_participant_fk FOREIGN KEY (initiative_member_id, initiative_id, member_id) REFERENCES contribution_initiative_members(id, initiative_id, member_id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_period_fk FOREIGN KEY (initiative_period_id) REFERENCES contribution_initiative_periods(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_period_initiative_fk FOREIGN KEY (initiative_period_id, initiative_id) REFERENCES contribution_initiative_periods(id, initiative_id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_obligations ADD CONSTRAINT contribution_initiative_obligations_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_payment_reversals ADD CONSTRAINT contribution_initiative_payment_reversals_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES contributions(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_payment_reversals ADD CONSTRAINT contribution_initiative_payment_reversals_payment_id_key UNIQUE (payment_id);
ALTER TABLE public.contribution_initiative_payment_reversals ADD CONSTRAINT contribution_initiative_payment_reversals_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_payment_reversals ADD CONSTRAINT contribution_initiative_payment_reversals_reason_check CHECK (length(TRIM(BOTH FROM reason)) > 0);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_check CHECK (opening_date <= closing_date);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_check1 CHECK (due_date = closing_date);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_check2 CHECK (period_key = to_char(opening_date::timestamp with time zone, 'YYYY-MM'::text));
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_id_initiative_id_key UNIQUE (id, initiative_id);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES contribution_initiatives(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_initiative_id_period_key_key UNIQUE (initiative_id, period_key);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiative_periods ADD CONSTRAINT contribution_initiative_periods_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_check CHECK (start_date <= closing_date);
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_contribution_type_id_fkey FOREIGN KEY (contribution_type_id) REFERENCES contribution_types(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_default_amount_check CHECK (default_amount >= 0::numeric);
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_frequency_check CHECK (frequency = ANY (ARRAY['one_time'::text, 'monthly'::text]));
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_name_check CHECK (length(TRIM(BOTH FROM name)) > 0);
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_initiatives ADD CONSTRAINT contribution_initiatives_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'cancelled'::text]));
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_component_lineage_ck CHECK (component_kind = 'PARENT'::text AND parent_obligation_id IS NULL AND (lifecycle_state = ANY (ARRAY['ACTIVE'::text, 'DECOMPOSED'::text])) OR component_kind = 'RESIDUAL'::text AND parent_obligation_id IS NOT NULL AND lifecycle_state = 'ACTIVE'::text);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_due_amount_check CHECK (due_amount >= 0::numeric);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_member_fk FOREIGN KEY (group_id, member_id) REFERENCES members(group_id, id);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_month_first_day CHECK (obligation_month = date_trunc('month'::text, obligation_month::timestamp with time zone)::date);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_parent_not_self_ck CHECK (parent_obligation_id IS NULL OR parent_obligation_id <> id);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_parent_scope_fk FOREIGN KEY (parent_obligation_id, group_id, member_id, contribution_type_id) REFERENCES contribution_obligations(id, group_id, member_id, contribution_type_id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_period_fk FOREIGN KEY (period_id) REFERENCES contribution_periods(id);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_rule_fk FOREIGN KEY (rule_id, group_id, member_id, contribution_type_id) REFERENCES member_contribution_rules(id, group_id, member_id, contribution_type_id);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_source_lineage_ck CHECK (component_kind = 'PARENT'::text AND parent_obligation_id IS NULL AND rule_id IS NOT NULL AND period_id IS NULL OR component_kind = 'PARENT'::text AND parent_obligation_id IS NULL AND rule_id IS NULL AND period_id IS NOT NULL OR component_kind = 'RESIDUAL'::text AND parent_obligation_id IS NOT NULL AND rule_id IS NOT NULL AND period_id IS NULL OR component_kind = 'RESIDUAL'::text AND parent_obligation_id IS NOT NULL AND rule_id IS NULL AND period_id IS NOT NULL);
ALTER TABLE public.contribution_obligations ADD CONSTRAINT contribution_obligations_type_fk FOREIGN KEY (group_id, contribution_type_id) REFERENCES contribution_types(group_id, id);
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_amount_check CHECK (amount IS NULL OR amount > 0::numeric);
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_created_by_fk FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_dates_check CHECK (opening_date <= due_date AND due_date <= closing_date);
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_fine_rule_fk FOREIGN KEY (fine_rule_id) REFERENCES fine_rules(id) ON DELETE RESTRICT;
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_frequency_check CHECK (frequency = ANY (ARRAY['monthly'::text, 'weekly'::text, 'quarterly'::text, 'annual'::text, 'one_time'::text]));
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_period_key_check CHECK (btrim(period_key) <> ''::text AND length(period_key) <= 100);
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_status_check CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'open'::text, 'due'::text, 'grace'::text, 'closed'::text, 'cancelled'::text]));
ALTER TABLE public.contribution_periods ADD CONSTRAINT contribution_periods_type_fk FOREIGN KEY (group_id, contribution_type_id) REFERENCES contribution_types(group_id, id);
ALTER TABLE public.contribution_types ADD CONSTRAINT contribution_types_code_check CHECK (code IS NULL OR (code = ANY (ARRAY['monthly'::text, 'registration'::text, 'special'::text, 'welfare'::text, 'custom'::text])));
ALTER TABLE public.contribution_types ADD CONSTRAINT contribution_types_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.contribution_types ADD CONSTRAINT contribution_types_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.contribution_types ADD CONSTRAINT contribution_types_group_id_id_unique UNIQUE (group_id, id);
ALTER TABLE public.contribution_types ADD CONSTRAINT contribution_types_pkey PRIMARY KEY (id);
ALTER TABLE public.contributions ADD CONSTRAINT contributions_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.contributions ADD CONSTRAINT contributions_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES contribution_goals(id);
ALTER TABLE public.contributions ADD CONSTRAINT contributions_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_initiative_id_fkey FOREIGN KEY (initiative_id) REFERENCES contribution_initiatives(id) ON DELETE RESTRICT;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_payment_method_check CHECK (payment_method = ANY (ARRAY['M-Pesa'::text, 'Cash'::text, 'Bank transfer'::text]));
ALTER TABLE public.contributions ADD CONSTRAINT contributions_pkey PRIMARY KEY (id);
ALTER TABLE public.contributions ADD CONSTRAINT contributions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES members(id);
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_dates_check CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at);
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_pkey PRIMARY KEY (id);
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_source_type_check CHECK (source_type = ANY (ARRAY['csv'::text, 'xlsx'::text, 'manual'::text, 'other'::text]));
ALTER TABLE public.data_import_batches ADD CONSTRAINT data_import_batches_status_check CHECK (status = ANY (ARRAY['uploaded'::text, 'analyzing'::text, 'mapping'::text, 'validating'::text, 'ready'::text, 'importing'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text, 'cancelled'::text]));
ALTER TABLE public.data_import_mappings ADD CONSTRAINT data_import_mappings_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES data_import_batches(id) ON DELETE CASCADE;
ALTER TABLE public.data_import_mappings ADD CONSTRAINT data_import_mappings_pkey PRIMARY KEY (id);
ALTER TABLE public.data_import_mappings ADD CONSTRAINT data_import_mappings_type_check CHECK (mapping_type = ANY (ARRAY['direct'::text, 'member_match'::text, 'date_parse'::text, 'amount_parse'::text, 'month_to_date'::text, 'constant'::text, 'ignore'::text, 'custom'::text]));
ALTER TABLE public.data_import_mappings ADD CONSTRAINT data_import_mappings_unique_column UNIQUE (batch_id, source_column);
ALTER TABLE public.data_import_rows ADD CONSTRAINT data_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES data_import_batches(id) ON DELETE CASCADE;
ALTER TABLE public.data_import_rows ADD CONSTRAINT data_import_rows_entity_type_check CHECK (entity_type = ANY (ARRAY['member'::text, 'contribution'::text, 'expense'::text, 'support'::text, 'asset'::text, 'plan'::text, 'activity'::text, 'milestone'::text, 'meeting'::text, 'opening_balance'::text, 'other'::text]));
ALTER TABLE public.data_import_rows ADD CONSTRAINT data_import_rows_pkey PRIMARY KEY (id);
ALTER TABLE public.data_import_rows ADD CONSTRAINT data_import_rows_row_number_check CHECK (source_row_number IS NULL OR source_row_number > 0);
ALTER TABLE public.data_import_rows ADD CONSTRAINT data_import_rows_status_check CHECK (status = ANY (ARRAY['pending'::text, 'valid'::text, 'warning'::text, 'error'::text, 'imported'::text, 'skipped'::text]));
ALTER TABLE public.documents ADD CONSTRAINT documents_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES members(id);
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_approval_slot_check CHECK (approval_slot = ANY (ARRAY['chair'::text, 'treasurer'::text, 'secretary'::text]));
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES auth.users(id);
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_decision_check CHECK (decision = ANY (ARRAY['approved'::text, 'rejected'::text]));
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE;
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_one_slot_per_expense UNIQUE (expense_id, approval_slot);
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_one_vote_per_person UNIQUE (expense_id, approver_user_id);
ALTER TABLE public.expense_approvals ADD CONSTRAINT expense_approvals_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_approval_status_check CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category = ANY (ARRAY['meeting'::text, 'welfare'::text, 'transport'::text, 'food'::text, 'supplies'::text, 'bank_charges'::text, 'admin'::text, 'other'::text]));
ALTER TABLE public.expenses ADD CONSTRAINT expenses_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES members(id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_category_check CHECK (category = ANY (ARRAY['confusing'::text, 'bug'::text, 'missing_feature'::text, 'general'::text]));
ALTER TABLE public.feedback ADD CONSTRAINT feedback_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.feedback ADD CONSTRAINT feedback_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_accounting_month_ck CHECK (accounting_month ~ '^[0-9]{4}-[0-9]{2}$'::text);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_amount_positive CHECK (amount > 0::numeric);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_currency_nonempty CHECK (length(TRIM(BOTH FROM currency)) > 0);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_obligation_id_fkey FOREIGN KEY (obligation_id) REFERENCES contribution_obligations(id) ON DELETE RESTRICT;
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_source_nonempty CHECK (length(TRIM(BOTH FROM source)) > 0);
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_status_valid CHECK (status = ANY (ARRAY['open'::text, 'paid'::text, 'cancelled'::text]));
ALTER TABLE public.financial_charges ADD CONSTRAINT financial_charges_type_nonempty CHECK (length(charge_type) > 0 AND charge_type = lower(charge_type) AND charge_type = btrim(charge_type));
ALTER TABLE public.financial_periods ADD CONSTRAINT financial_periods_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.financial_periods ADD CONSTRAINT financial_periods_group_id_month_key UNIQUE (group_id, month);
ALTER TABLE public.financial_periods ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.financial_periods ADD CONSTRAINT financial_periods_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));
ALTER TABLE public.fine_adjustments ADD CONSTRAINT fine_adjustments_amount_ck CHECK (amount > 0::numeric);
ALTER TABLE public.fine_adjustments ADD CONSTRAINT fine_adjustments_direction_ck CHECK (direction = ANY (ARRAY['INCREASE'::text, 'DECREASE'::text]));
ALTER TABLE public.fine_adjustments ADD CONSTRAINT fine_adjustments_fine_id_fkey FOREIGN KEY (fine_id) REFERENCES fines(id);
ALTER TABLE public.fine_adjustments ADD CONSTRAINT fine_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.fine_adjustments ADD CONSTRAINT fine_adjustments_reason_ck CHECK (btrim(reason) <> ''::text);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_amount_ck CHECK (allocated_amount > 0::numeric);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_fine_id_fkey FOREIGN KEY (fine_id) REFERENCES fines(id);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_payment_fine_uq UNIQUE (payment_id, fine_id);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES contributions(id);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.fine_payment_allocations ADD CONSTRAINT fine_payment_allocations_source_ck CHECK (source = ANY (ARRAY['MANUAL'::text, 'SYSTEM'::text]));
ALTER TABLE public.fine_rule_contribution_types ADD CONSTRAINT fine_rule_contribution_types_contribution_type_id_fkey FOREIGN KEY (contribution_type_id) REFERENCES contribution_types(id);
ALTER TABLE public.fine_rule_contribution_types ADD CONSTRAINT fine_rule_contribution_types_pkey PRIMARY KEY (rule_id, contribution_type_id);
ALTER TABLE public.fine_rule_contribution_types ADD CONSTRAINT fine_rule_contribution_types_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES fine_rules(id) ON DELETE CASCADE;
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_applicability_ck CHECK (applicability_mode = ANY (ARRAY['ALL'::text, 'SELECTED'::text, 'ALL_MEETINGS'::text, 'SELECTED_MEETINGS'::text]));
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_calculation_method_ck CHECK (calculation_method = ANY (ARRAY['FIXED'::text, 'PERCENTAGE'::text]));
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_effective_ck CHECK (effective_until IS NULL OR effective_until >= effective_from);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_fixed_amount_ck CHECK (calculation_method = 'FIXED'::text AND fixed_amount > 0::numeric AND percentage_rate IS NULL OR calculation_method = 'PERCENTAGE'::text AND percentage_rate > 0::numeric AND percentage_rate <= 100::numeric AND fixed_amount IS NULL);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_grace_ck CHECK (grace_period_value >= 0);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_grace_unit_ck CHECK (grace_period_unit = ANY (ARRAY['DAY'::text, 'WEEK'::text, 'MONTH'::text]));
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_maximum_ck CHECK (maximum_amount IS NULL OR maximum_amount >= 0::numeric);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_minimum_ck CHECK (minimum_amount IS NULL OR minimum_amount >= 0::numeric);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_minmax_ck CHECK (minimum_amount IS NULL OR maximum_amount IS NULL OR minimum_amount <= maximum_amount);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_priority_ck CHECK (priority >= 0);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_specificity_ck CHECK (specificity_level >= 1 AND specificity_level <= 3);
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_status_ck CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));
ALTER TABLE public.fine_rules ADD CONSTRAINT fine_rules_trigger_type_ck CHECK (trigger_type = ANY (ARRAY['missed_contribution'::text, 'meeting_absence'::text, 'late_attendance'::text, 'custom_event'::text]));
ALTER TABLE public.fine_waivers ADD CONSTRAINT fine_waivers_amount_ck CHECK (amount > 0::numeric);
ALTER TABLE public.fine_waivers ADD CONSTRAINT fine_waivers_fine_id_fkey FOREIGN KEY (fine_id) REFERENCES fines(id);
ALTER TABLE public.fine_waivers ADD CONSTRAINT fine_waivers_pkey PRIMARY KEY (id);
ALTER TABLE public.fine_waivers ADD CONSTRAINT fine_waivers_reason_ck CHECK (btrim(reason) <> ''::text);
ALTER TABLE public.fines ADD CONSTRAINT fines_accounting_month_ck CHECK (accounting_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text);
ALTER TABLE public.fines ADD CONSTRAINT fines_amount_snapshot_ck CHECK (calculation_method = 'FIXED'::text AND fixed_amount > 0::numeric AND percentage_rate IS NULL OR calculation_method = 'PERCENTAGE'::text AND percentage_rate > 0::numeric AND percentage_rate <= 100::numeric AND fixed_amount IS NULL);
ALTER TABLE public.fines ADD CONSTRAINT fines_calculated_amount_ck CHECK (calculated_amount > 0::numeric);
ALTER TABLE public.fines ADD CONSTRAINT fines_calculation_method_ck CHECK (calculation_method = ANY (ARRAY['FIXED'::text, 'PERCENTAGE'::text]));
ALTER TABLE public.fines ADD CONSTRAINT fines_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);
ALTER TABLE public.fines ADD CONSTRAINT fines_identity_uq UNIQUE (group_id, member_id, rule_id, trigger_type, trigger_id);
ALTER TABLE public.fines ADD CONSTRAINT fines_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public.fines ADD CONSTRAINT fines_original_amount_ck CHECK (original_amount > 0::numeric);
ALTER TABLE public.fines ADD CONSTRAINT fines_pkey PRIMARY KEY (id);
ALTER TABLE public.fines ADD CONSTRAINT fines_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES fine_rules(id);
ALTER TABLE public.fines ADD CONSTRAINT fines_snapshot_maximum_ck CHECK (maximum_amount IS NULL OR maximum_amount >= 0::numeric);
ALTER TABLE public.fines ADD CONSTRAINT fines_snapshot_minimum_ck CHECK (minimum_amount IS NULL OR minimum_amount >= 0::numeric);
ALTER TABLE public.fines ADD CONSTRAINT fines_snapshot_minmax_ck CHECK (minimum_amount IS NULL OR maximum_amount IS NULL OR minimum_amount <= maximum_amount);
ALTER TABLE public.fines ADD CONSTRAINT fines_source_type_ck CHECK (source_type = ANY (ARRAY['AUTOMATIC'::text, 'MANUAL'::text]));
ALTER TABLE public.fines ADD CONSTRAINT fines_trigger_type_ck CHECK (trigger_type = ANY (ARRAY['missed_contribution'::text, 'meeting_absence'::text, 'late_attendance'::text, 'custom_event'::text]));
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_completed_at_check CHECK (status <> 'completed'::text OR completed_at IS NOT NULL);
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_dates_check CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date);
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_pkey PRIMARY KEY (id);
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES group_plans(id) ON DELETE SET NULL;
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100);
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_status_check CHECK (status = ANY (ARRAY['not_started'::text, 'planned'::text, 'in_progress'::text, 'completed'::text, 'delayed'::text, 'cancelled'::text]));
ALTER TABLE public.group_activities ADD CONSTRAINT group_activities_title_check CHECK (length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE public.group_applications ADD CONSTRAINT group_applications_approved_group_id_fkey FOREIGN KEY (approved_group_id) REFERENCES groups(id);
ALTER TABLE public.group_applications ADD CONSTRAINT group_applications_approved_member_id_fkey FOREIGN KEY (approved_member_id) REFERENCES members(id);
ALTER TABLE public.group_applications ADD CONSTRAINT group_applications_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.group_applications ADD CONSTRAINT group_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.group_applications ADD CONSTRAINT group_applications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text, 'rejected'::text]));
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_acquisition_cost_check CHECK (acquisition_cost IS NULL OR acquisition_cost >= 0::numeric);
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_category_check CHECK (category = ANY (ARRAY['land'::text, 'building'::text, 'vehicle'::text, 'equipment'::text, 'livestock'::text, 'farm'::text, 'furniture'::text, 'investment'::text, 'shares'::text, 'other'::text]));
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_current_value_check CHECK (current_value IS NULL OR current_value >= 0::numeric);
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_name_check CHECK (length(TRIM(BOTH FROM asset_name)) > 0);
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_pkey PRIMARY KEY (id);
ALTER TABLE public.group_assets ADD CONSTRAINT group_assets_status_check CHECK (status = ANY (ARRAY['active'::text, 'disposed'::text, 'sold'::text, 'lost'::text, 'inactive'::text]));
ALTER TABLE public.group_audit_log ADD CONSTRAINT group_audit_log_actor_member_id_fkey FOREIGN KEY (actor_member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_audit_log ADD CONSTRAINT group_audit_log_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_audit_log ADD CONSTRAINT group_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_check CHECK (opening_date <= closing_date);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_closing_day_check CHECK (closing_day >= 1 AND closing_day <= 28);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_group_id_closing_date_key UNIQUE (group_id, closing_date);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_group_id_opening_date_key UNIQUE (group_id, opening_date);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.group_contribution_calendar_periods ADD CONSTRAINT group_contribution_calendar_periods_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));
ALTER TABLE public.group_contribution_settings ADD CONSTRAINT group_contribution_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_contribution_settings ADD CONSTRAINT group_contribution_settings_group_id_key UNIQUE (group_id);
ALTER TABLE public.group_contribution_settings ADD CONSTRAINT group_contribution_settings_monthly_closing_day_check CHECK (monthly_closing_day >= 1 AND monthly_closing_day <= 28);
ALTER TABLE public.group_contribution_settings ADD CONSTRAINT group_contribution_settings_monthly_grace_days_check CHECK (monthly_grace_days >= 0 AND monthly_grace_days <= 27);
ALTER TABLE public.group_contribution_settings ADD CONSTRAINT group_contribution_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_code_key UNIQUE (code);
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_max_uses_check CHECK (max_uses > 0);
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_role_check CHECK (role = ANY (ARRAY['chairperson'::text, 'admin'::text, 'secretary'::text, 'treasurer'::text, 'member'::text]));
ALTER TABLE public.group_invites ADD CONSTRAINT group_invites_use_count_check CHECK (use_count >= 0);
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_amount_check CHECK (amount IS NULL OR amount >= 0::numeric);
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_pkey PRIMARY KEY (id);
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES group_plans(id) ON DELETE SET NULL;
ALTER TABLE public.group_milestones ADD CONSTRAINT group_milestones_title_check CHECK (length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_category_check CHECK (category = ANY (ARRAY['investment'::text, 'property'::text, 'welfare'::text, 'business'::text, 'education'::text, 'membership'::text, 'fundraising'::text, 'infrastructure'::text, 'other'::text]));
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_dates_check CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date);
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100);
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_status_check CHECK (status = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text, 'paused'::text, 'cancelled'::text]));
ALTER TABLE public.group_plans ADD CONSTRAINT group_plans_title_check CHECK (length(TRIM(BOTH FROM title)) > 0);
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_amount_ck CHECK (standard_group_amount >= 0::numeric AND standard_member_login_amount >= 0::numeric);
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_currency_ck CHECK (currency = 'KES'::text);
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_status_ck CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'cancelled'::text, 'expired'::text]));
ALTER TABLE public.group_subscriptions ADD CONSTRAINT group_subscriptions_tier_fk FOREIGN KEY (pricing_tier_id) REFERENCES subscription_pricing_tiers(id);
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_amount_check CHECK (amount >= 0::numeric);
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_created_by_fkey FOREIGN KEY (created_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_pkey PRIMARY KEY (id);
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_status_check CHECK (status = ANY (ARRAY['requested'::text, 'approved'::text, 'paid'::text, 'completed'::text, 'rejected'::text, 'cancelled'::text]));
ALTER TABLE public.group_support_cases ADD CONSTRAINT group_support_cases_type_check CHECK (support_type = ANY (ARRAY['welfare'::text, 'hospital'::text, 'bereavement'::text, 'education'::text, 'emergency'::text, 'accident'::text, 'marriage'::text, 'new_baby'::text, 'disaster'::text, 'other'::text]));
ALTER TABLE public.groups ADD CONSTRAINT groups_access_code_key UNIQUE (access_code);
ALTER TABLE public.groups ADD CONSTRAINT groups_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_approved_amount_check CHECK (approved_amount IS NULL OR approved_amount > 0::numeric);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_check CHECK (guarantor_member_id IS NULL OR guarantor_member_id <> member_id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_disbursed_by_fkey FOREIGN KEY (disbursed_by) REFERENCES auth.users(id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_guarantor_member_id_fkey FOREIGN KEY (guarantor_member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_id_group_id_key UNIQUE (id, group_id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_interest_rate_snapshot_check CHECK (interest_rate_snapshot IS NULL OR interest_rate_snapshot >= 0::numeric AND interest_rate_snapshot <= 100::numeric);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_interest_type_snapshot_check CHECK (interest_type_snapshot IS NULL OR (interest_type_snapshot = ANY (ARRAY['flat'::text, 'reducing_balance'::text])));
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_period_months_check CHECK (period_months >= 1 AND period_months <= 120);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_purpose_check CHECK (length(btrim(purpose)) >= 3 AND length(btrim(purpose)) <= 2000);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_requested_amount_check CHECK (requested_amount > 0::numeric);
ALTER TABLE public.loan_applications ADD CONSTRAINT loan_applications_status_check CHECK (status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'active'::text, 'overdue'::text, 'cleared'::text]));
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_approval_slot_check CHECK (approval_slot = ANY (ARRAY['chairperson'::text, 'treasurer'::text, 'secretary'::text]));
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_decision_check CHECK (decision = ANY (ARRAY['approved'::text, 'rejected'::text]));
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loan_applications(id) ON DELETE CASCADE;
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_one_person_per_loan UNIQUE (loan_id, approver_user_id);
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_one_person_per_slot UNIQUE (loan_id, approval_slot);
ALTER TABLE public.loan_approvals ADD CONSTRAINT loan_approvals_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_notifications ADD CONSTRAINT loan_notifications_event_type_check CHECK (event_type = ANY (ARRAY['application_submitted'::text, 'application_approved'::text, 'application_rejected'::text, 'loan_disbursed'::text, 'repayment_recorded'::text, 'loan_cleared'::text]));
ALTER TABLE public.loan_notifications ADD CONSTRAINT loan_notifications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.loan_notifications ADD CONSTRAINT loan_notifications_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES loan_applications(id) ON DELETE CASCADE;
ALTER TABLE public.loan_notifications ADD CONSTRAINT loan_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_notifications ADD CONSTRAINT loan_notifications_recipient_member_id_fkey FOREIGN KEY (recipient_member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_interest_amount_check CHECK (interest_amount >= 0::numeric);
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_loan_id_group_id_fkey FOREIGN KEY (loan_id, group_id) REFERENCES loan_applications(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_penalty_amount_check CHECK (penalty_amount >= 0::numeric);
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_principal_amount_check CHECK (principal_amount >= 0::numeric);
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_repayment_id_fkey FOREIGN KEY (repayment_id) REFERENCES loan_repayments(id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayment_allocations ADD CONSTRAINT loan_repayment_allocations_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES loan_repayment_schedule(id) ON DELETE RESTRICT;
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_amount_paid_check CHECK (amount_paid >= 0::numeric);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_check CHECK (amount_paid <= (principal_due + interest_due + penalty_due));
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_installment_no_check CHECK (installment_no > 0);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_interest_due_check CHECK (interest_due >= 0::numeric);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_loan_id_group_id_fkey FOREIGN KEY (loan_id, group_id) REFERENCES loan_applications(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_loan_id_installment_no_key UNIQUE (loan_id, installment_no);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_penalty_due_check CHECK (penalty_due >= 0::numeric);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_principal_due_check CHECK (principal_due >= 0::numeric);
ALTER TABLE public.loan_repayment_schedule ADD CONSTRAINT loan_repayment_schedule_status_check CHECK (status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'overdue'::text]));
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_loan_id_group_id_fkey FOREIGN KEY (loan_id, group_id) REFERENCES loan_applications(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_payment_method_check CHECK (payment_method = ANY (ARRAY['cash'::text, 'mpesa'::text, 'bank'::text, 'other'::text]));
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_pkey PRIMARY KEY (id);
ALTER TABLE public.loan_repayments ADD CONSTRAINT loan_repayments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_interest_rate_check CHECK (interest_rate >= 0::numeric AND interest_rate <= 100::numeric);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_interest_type_check CHECK (interest_type = ANY (ARRAY['flat'::text, 'reducing_balance'::text]));
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_late_penalty_check CHECK (late_penalty >= 0::numeric);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_max_loan_amount_check CHECK (max_loan_amount > 0::numeric);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_max_period_months_check CHECK (max_period_months >= 1 AND max_period_months <= 120);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_pkey PRIMARY KEY (group_id);
ALTER TABLE public.loan_settings ADD CONSTRAINT loan_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.meetings ADD CONSTRAINT meetings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.meetings ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);
ALTER TABLE public.meetings ADD CONSTRAINT meetings_status_check CHECK (status = ANY (ARRAY['upcoming'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_created_by_fk FOREIGN KEY (created_by) REFERENCES members(id);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_dates_check CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_ended_date_check CHECK (status <> 'ended'::text OR effective_to IS NOT NULL);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_first_period_check CHECK (first_period_rule = ANY (ARRAY['full_period'::text, 'next_full_period'::text]));
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_frequency_check CHECK (frequency = ANY (ARRAY['monthly'::text, 'weekly'::text, 'quarterly'::text, 'annual'::text, 'one_time'::text]));
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_id_group_member_type_key UNIQUE (id, group_id, member_id, contribution_type_id);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_member_fk FOREIGN KEY (group_id, member_id) REFERENCES members(group_id, id);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_no_overlap EXCLUDE USING gist (group_id WITH =, member_id WITH =, contribution_type_id WITH =, daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)'::text) WITH &&);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'ended'::text]));
ALTER TABLE public.member_contribution_rules ADD CONSTRAINT member_contribution_rules_type_fk FOREIGN KEY (group_id, contribution_type_id) REFERENCES contribution_types(group_id, id);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES contributions(id);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_mpesa_reference_check CHECK (payment_method = 'M-Pesa'::text AND mpesa_reference IS NOT NULL AND btrim(mpesa_reference) <> ''::text OR payment_method <> 'M-Pesa'::text AND mpesa_reference IS NULL);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_payment_method_check CHECK (payment_method = ANY (ARRAY['M-Pesa'::text, 'Cash'::text, 'Bank transfer'::text]));
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_pending_state_check CHECK (status <> 'pending'::text OR contribution_id IS NULL AND verified_by IS NULL AND verified_at IS NULL AND rejection_reason IS NULL);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_pkey PRIMARY KEY (id);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_rejected_state_check CHECK (status <> 'rejected'::text OR contribution_id IS NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> ''::text);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_status_check CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]));
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES members(id);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_verified_identity_check CHECK (status <> 'verified'::text OR contribution_id = id);
ALTER TABLE public.member_payment_evidence ADD CONSTRAINT member_payment_evidence_verified_state_check CHECK (status <> 'verified'::text OR contribution_id IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND rejection_reason IS NULL);
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_date_check CHECK (effective_to IS NULL OR effective_to > effective_from);
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_member_fk FOREIGN KEY (group_id, member_id) REFERENCES members(group_id, id) ON DELETE CASCADE;
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_name_check CHECK (actual_position = 'other'::text OR actual_position_name IS NULL OR btrim(actual_position_name) <> ''::text);
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_no_overlap EXCLUDE USING gist (member_id WITH =, daterange(effective_from, effective_to, '[)'::text) WITH &&);
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_pkey PRIMARY KEY (id);
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_position_check CHECK (actual_position = ANY (ARRAY['chairperson'::text, 'vice_chairperson'::text, 'treasurer'::text, 'secretary'::text, 'vice_secretary'::text, 'committee_member'::text, 'member'::text, 'other'::text]));
ALTER TABLE public.member_position_history ADD CONSTRAINT member_position_history_recorded_by_fk FOREIGN KEY (recorded_by) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public.members ADD CONSTRAINT members_actual_position_check CHECK (actual_position IS NULL OR (actual_position = ANY (ARRAY['chairperson'::text, 'vice_chairperson'::text, 'treasurer'::text, 'secretary'::text, 'vice_secretary'::text, 'committee_member'::text, 'member'::text, 'other'::text])));
ALTER TABLE public.members ADD CONSTRAINT members_actual_position_name_check CHECK (actual_position = 'other'::text OR actual_position_name IS NULL OR btrim(actual_position_name) <> ''::text);
ALTER TABLE public.members ADD CONSTRAINT members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.members ADD CONSTRAINT members_group_id_id_unique UNIQUE (group_id, id);
ALTER TABLE public.members ADD CONSTRAINT members_group_id_member_number_key UNIQUE (group_id, member_number);
ALTER TABLE public.members ADD CONSTRAINT members_membership_number_format_ck CHECK (membership_number ~ '^[0-9]{4}$'::text);
ALTER TABLE public.members ADD CONSTRAINT members_onboarding_status_check CHECK (onboarding_status = ANY (ARRAY['pending'::text, 'invited'::text, 'active'::text, 'suspended'::text]));
ALTER TABLE public.members ADD CONSTRAINT members_pkey PRIMARY KEY (id);
ALTER TABLE public.members ADD CONSTRAINT members_role_check CHECK (role = ANY (ARRAY['chairperson'::text, 'admin'::text, 'treasurer'::text, 'secretary'::text, 'member'::text]));
ALTER TABLE public.members ADD CONSTRAINT members_status_check CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text]));
ALTER TABLE public.members ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_contribution_amount_check CHECK (contribution_amount > 0::numeric);
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_frequency_check CHECK (frequency = ANY (ARRAY['weekly'::text, 'monthly'::text]));
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_late_fine_amount_check CHECK (late_fine_amount >= 0::numeric);
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_number_of_rounds_check CHECK (number_of_rounds >= 1 AND number_of_rounds <= 500);
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_payout_order_method_check CHECK (payout_order_method = ANY (ARRAY['admin'::text, 'random'::text, 'member_chosen'::text]));
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_pkey PRIMARY KEY (id);
ALTER TABLE public.merry_go_round_cycles ADD CONSTRAINT merry_go_round_cycles_status_check CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE public.merry_go_round_notifications ADD CONSTRAINT merry_go_round_notifications_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES merry_go_round_cycles(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_notifications ADD CONSTRAINT merry_go_round_notifications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_notifications ADD CONSTRAINT merry_go_round_notifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_notifications ADD CONSTRAINT merry_go_round_notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.merry_go_round_notifications ADD CONSTRAINT merry_go_round_notifications_round_id_fkey FOREIGN KEY (round_id) REFERENCES merry_go_round_rounds(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_amount_due_check CHECK (amount_due >= 0::numeric);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_amount_paid_check CHECK (amount_paid >= 0::numeric);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES merry_go_round_cycles(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_late_fine_amount_check CHECK (late_fine_amount >= 0::numeric);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_round_id_fkey FOREIGN KEY (round_id) REFERENCES merry_go_round_rounds(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_round_id_member_id_key UNIQUE (round_id, member_id);
ALTER TABLE public.merry_go_round_payments ADD CONSTRAINT merry_go_round_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'late'::text]));
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES merry_go_round_cycles(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_cycle_id_member_id_key UNIQUE (cycle_id, member_id);
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_cycle_id_preferred_round_number_key UNIQUE (cycle_id, preferred_round_number);
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.merry_go_round_preferences ADD CONSTRAINT merry_go_round_preferences_preferred_round_number_check CHECK (preferred_round_number > 0);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES merry_go_round_cycles(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_cycle_id_round_number_key UNIQUE (cycle_id, round_number);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_payout_amount_check CHECK (payout_amount >= 0::numeric);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_payout_recorded_by_fkey FOREIGN KEY (payout_recorded_by) REFERENCES auth.users(id);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_pkey PRIMARY KEY (id);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_recipient_member_id_fkey FOREIGN KEY (recipient_member_id) REFERENCES members(id);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_round_number_check CHECK (round_number > 0);
ALTER TABLE public.merry_go_round_rounds ADD CONSTRAINT merry_go_round_rounds_status_check CHECK (status = ANY (ARRAY['pending'::text, 'ready_for_payout'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id);
ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_group_id_closing_month_key UNIQUE (group_id, closing_month);
ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_closings ADD CONSTRAINT monthly_closings_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_onboarding ADD CONSTRAINT pending_onboarding_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_onboarding ADD CONSTRAINT pending_onboarding_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_onboarding ADD CONSTRAINT pending_onboarding_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE public.platform_activity ADD CONSTRAINT platform_activity_actor_type_chk CHECK (actor_type = ANY (ARRAY['human'::text, 'system'::text]));
ALTER TABLE public.platform_activity ADD CONSTRAINT platform_activity_event_type_chk CHECK (event_type = ANY (ARRAY['group_application_submitted'::text, 'group_application_reviewed'::text, 'group_approved'::text, 'group_created'::text, 'member_created'::text, 'subscription_renewed'::text, 'subscription_payment_confirmed'::text, 'subscription_payment_reversed'::text]));
ALTER TABLE public.platform_activity ADD CONSTRAINT platform_activity_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'::text);
ALTER TABLE public.platform_activity ADD CONSTRAINT platform_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_credits ADD CONSTRAINT subscription_credits_original_amount_check CHECK (original_amount > 0::numeric);
ALTER TABLE public.subscription_credits ADD CONSTRAINT subscription_credits_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_credits ADD CONSTRAINT subscription_credits_reversed_at_ck CHECK (status = 'reversed'::text AND reversed_at IS NOT NULL OR status <> 'reversed'::text AND reversed_at IS NULL);
ALTER TABLE public.subscription_credits ADD CONSTRAINT subscription_credits_source_payment_id_fkey FOREIGN KEY (source_payment_id) REFERENCES subscription_payments(id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_credits ADD CONSTRAINT subscription_credits_status_check CHECK (status = ANY (ARRAY['active'::text, 'exhausted'::text, 'reversed'::text]));
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_amount_ck CHECK (standard_group_amount >= 0::numeric AND group_amount >= 0::numeric AND standard_member_login_amount >= 0::numeric AND member_login_unit_amount >= 0::numeric);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_currency_ck CHECK (currency = 'KES'::text);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_discount_ck CHECK (group_discount_percent >= 0::numeric AND group_discount_percent <= 100::numeric AND member_login_discount_percent >= 0::numeric AND member_login_discount_percent <= 100::numeric);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_duration_ck CHECK (ends_at = (starts_at + '30 days'::interval));
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_id_subscription_uidx UNIQUE (id, subscription_id);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_member_count_ck CHECK (member_count_snapshot >= 0);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_number_ck CHECK (cycle_number >= 1);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_order_ck CHECK (ends_at > starts_at);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_status_ck CHECK (status = ANY (ARRAY['scheduled'::text, 'open'::text, 'invoiced'::text, 'paid'::text, 'overdue'::text, 'closed'::text, 'cancelled'::text]));
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_subscription_fk FOREIGN KEY (subscription_id) REFERENCES group_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_unique_number UNIQUE (subscription_id, cycle_number);
ALTER TABLE public.subscription_cycles ADD CONSTRAINT subscription_cycles_unique_start UNIQUE (subscription_id, starts_at);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_amount_ck CHECK (unit_amount >= 0::numeric AND discount_percent >= 0::numeric AND discount_percent <= 100::numeric AND discount_amount >= 0::numeric AND line_amount >= 0::numeric);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_currency_ck CHECK (currency = 'KES'::text);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_invoice_fk FOREIGN KEY (invoice_id, group_id) REFERENCES subscription_invoices(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_login_member_ck CHECK (line_type <> 'member_login'::text OR member_id IS NOT NULL);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_member_fk FOREIGN KEY (member_id) REFERENCES members(id);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_quantity_ck CHECK (quantity > 0);
ALTER TABLE public.subscription_invoice_lines ADD CONSTRAINT subscription_invoice_lines_type_ck CHECK (line_type = ANY (ARRAY['group_subscription'::text, 'member_login'::text, 'adjustment'::text]));
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_amount_ck CHECK (standard_group_amount >= 0::numeric AND group_discount_amount >= 0::numeric AND group_amount >= 0::numeric AND member_login_unit_amount >= 0::numeric AND member_login_amount >= 0::numeric AND subtotal >= 0::numeric AND total_discount >= 0::numeric AND total_amount >= 0::numeric);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_currency_ck CHECK (currency = 'KES'::text);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_cycle_fk FOREIGN KEY (subscription_id, cycle_id) REFERENCES subscription_cycles(subscription_id, id);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_group_fk FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_id_group_uidx UNIQUE (id, group_id);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_login_count_ck CHECK (member_login_count >= 0);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_member_count_ck CHECK (member_count_snapshot >= 0);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_number_unique UNIQUE (invoice_number);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_status_ck CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text, 'void'::text, 'cancelled'::text]));
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_subscription_fk FOREIGN KEY (subscription_id, group_id) REFERENCES group_subscriptions(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_unique_cycle UNIQUE (subscription_id, cycle_id);
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_dates_ck CHECK (deactivated_at IS NULL OR deactivated_at >= activated_at);
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_from_cycle_fk FOREIGN KEY (subscription_id, billable_from_cycle_id) REFERENCES subscription_cycles(subscription_id, id);
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_member_fk FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_member_unique UNIQUE (subscription_id, member_id);
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_status_ck CHECK (status = ANY (ARRAY['active'::text, 'ended'::text]));
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_subscription_fk FOREIGN KEY (subscription_id, group_id) REFERENCES group_subscriptions(id, group_id) ON DELETE CASCADE;
ALTER TABLE public.subscription_member_billing ADD CONSTRAINT subscription_member_billing_until_cycle_fk FOREIGN KEY (subscription_id, billable_until_cycle_id) REFERENCES subscription_cycles(subscription_id, id);
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_allocation_type_check CHECK (allocation_type = ANY (ARRAY['direct'::text, 'credit'::text]));
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_amount_check CHECK (amount > 0::numeric);
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_credit_ck CHECK (allocation_type = 'direct'::text AND credit_id IS NULL OR allocation_type = 'credit'::text AND credit_id IS NOT NULL);
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES subscription_credits(id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES subscription_invoices(id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES subscription_payments(id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_reversed_at_ck CHECK (status = 'reversed'::text AND reversed_at IS NOT NULL OR status <> 'reversed'::text AND reversed_at IS NULL);
ALTER TABLE public.subscription_payment_allocations ADD CONSTRAINT subscription_payment_allocations_status_check CHECK (status = ANY (ARRAY['active'::text, 'reversed'::text]));
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_amount_ck CHECK (amount > 0::numeric);
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_invoice_fk FOREIGN KEY (invoice_id, group_id) REFERENCES subscription_invoices(id, group_id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_method_ck CHECK (payment_method = ANY (ARRAY['mpesa'::text, 'bank'::text, 'cash'::text, 'other'::text]));
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_status_ck CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'failed'::text, 'reversed'::text, 'cancelled'::text]));
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_amount_ck CHECK (standard_group_amount >= 0::numeric AND standard_member_login_amount >= 0::numeric);
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_currency_ck CHECK (currency = 'KES'::text);
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_max_ck CHECK (max_members IS NULL OR max_members >= min_members);
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_min_ck CHECK (min_members >= 1);
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_pricing_tiers ADD CONSTRAINT subscription_pricing_tiers_tier_code_key UNIQUE (tier_code);

-- 3. Non-constraint-backed indexes.
CREATE INDEX member_historical_payment_requests_member_idx ON private.member_historical_payment_requests USING btree (group_id, member_id, created_at DESC);
CREATE UNIQUE INDEX other_contribution_cycle_audit_activated_uq ON private.other_contribution_cycle_audit USING btree (cycle_id, action) WHERE (action = ANY (ARRAY['CYCLE_ACTIVATED'::text, 'CYCLE_OBLIGATIONS_GENERATED'::text]));
CREATE INDEX other_contribution_cycle_audit_cycle_idx ON private.other_contribution_cycle_audit USING btree (cycle_id, created_at);
CREATE INDEX other_contribution_cycle_requests_cycle_idx ON private.other_contribution_cycle_requests USING btree (cycle_id) WHERE (cycle_id IS NOT NULL);
CREATE INDEX idx_other_payment_requests_cycle_created ON private.other_contribution_payment_requests USING btree (cycle_id, created_at DESC);
CREATE INDEX idx_other_payment_requests_group_created ON private.other_contribution_payment_requests USING btree (group_id, created_at DESC);
CREATE UNIQUE INDEX uq_other_payment_request_payment_id ON private.other_contribution_payment_requests USING btree (payment_id) WHERE (payment_id IS NOT NULL);
CREATE INDEX renewal_attempts_subscription_idx ON private.renewal_attempts USING btree (subscription_id);
CREATE INDEX renewal_runs_started_at_idx ON private.renewal_runs USING btree (started_at DESC);
CREATE INDEX charge_payments_charge_idx ON public.charge_payments USING btree (charge_id);
CREATE INDEX charge_payments_payment_idx ON public.charge_payments USING btree (payment_id);
CREATE INDEX idx_2b_allocations_obligation ON public.contribution_allocations USING btree (obligation_id);
CREATE INDEX idx_2b_allocations_payment ON public.contribution_allocations USING btree (payment_id);
CREATE INDEX idx_cl_2b_allocations_obligation ON public.contribution_allocations USING btree (obligation_id);
CREATE INDEX idx_cl_2b_allocations_payment ON public.contribution_allocations USING btree (payment_id);
CREATE INDEX idx_contribution_goals_group ON public.contribution_goals USING btree (group_id);
CREATE INDEX contribution_initiative_allocations_obligation_idx ON public.contribution_initiative_allocations USING btree (initiative_obligation_id);
CREATE INDEX contribution_initiative_allocations_payment_idx ON public.contribution_initiative_allocations USING btree (payment_id);
CREATE INDEX contribution_initiative_credit_consumptions_allocation_idx ON public.contribution_initiative_credit_consumptions USING btree (allocation_id, id);
CREATE INDEX contribution_initiative_credit_consumptions_credit_idx ON public.contribution_initiative_credit_consumptions USING btree (credit_id, id);
CREATE INDEX contribution_initiative_credits_member_idx ON public.contribution_initiative_credits USING btree (initiative_id, member_id, created_at, id) WHERE (remaining_amount > (0)::numeric);
CREATE INDEX contribution_initiative_member_terms_lookup_idx ON public.contribution_initiative_member_terms USING btree (initiative_member_id, effective_from, effective_to, status);
CREATE INDEX contribution_initiative_members_initiative_status_idx ON public.contribution_initiative_members USING btree (initiative_id, status);
CREATE INDEX contribution_initiative_obligations_initiative_member_idx ON public.contribution_initiative_obligations USING btree (initiative_id, member_id);
CREATE UNIQUE INDEX contribution_initiative_obligations_legacy_unique ON public.contribution_initiative_obligations USING btree (initiative_id, member_id) WHERE (initiative_period_id IS NULL);
CREATE INDEX contribution_initiative_obligations_member_due_idx ON public.contribution_initiative_obligations USING btree (initiative_id, member_id, due_date, id);
CREATE INDEX contribution_initiative_obligations_period_member_idx ON public.contribution_initiative_obligations USING btree (initiative_period_id, member_id, due_date, id);
CREATE UNIQUE INDEX contribution_initiative_obligations_period_member_unique ON public.contribution_initiative_obligations USING btree (initiative_period_id, member_id) WHERE (initiative_period_id IS NOT NULL);
CREATE INDEX contribution_initiative_periods_initiative_opening_idx ON public.contribution_initiative_periods USING btree (initiative_id, opening_date, closing_date, id);
CREATE INDEX contribution_initiatives_group_status_idx ON public.contribution_initiatives USING btree (group_id, status, start_date, closing_date);
CREATE UNIQUE INDEX contribution_obligations_one_residual_per_parent_uq ON public.contribution_obligations USING btree (parent_obligation_id) WHERE (component_kind = 'RESIDUAL'::text);
CREATE UNIQUE INDEX contribution_obligations_parent_economic_uq ON public.contribution_obligations USING btree (group_id, member_id, contribution_type_id, obligation_month) WHERE ((component_kind = 'PARENT'::text) AND (rule_id IS NOT NULL));
CREATE INDEX contribution_obligations_period_id_idx ON public.contribution_obligations USING btree (period_id);
CREATE UNIQUE INDEX contribution_obligations_universal_uq ON public.contribution_obligations USING btree (group_id, period_id, member_id, contribution_type_id) WHERE ((period_id IS NOT NULL) AND (component_kind = 'PARENT'::text));
CREATE INDEX idx_2b_obligations_group_month ON public.contribution_obligations USING btree (group_id, obligation_month);
CREATE INDEX idx_2b_obligations_member_month ON public.contribution_obligations USING btree (member_id, obligation_month);
CREATE INDEX idx_cl_2b_obligations_group_month ON public.contribution_obligations USING btree (group_id, obligation_month);
CREATE INDEX idx_cl_2b_obligations_group_type_month ON public.contribution_obligations USING btree (group_id, contribution_type_id, obligation_month);
CREATE INDEX idx_cl_2b_obligations_member_month ON public.contribution_obligations USING btree (member_id, obligation_month);
CREATE INDEX idx_cl_2b_obligations_member_type_month ON public.contribution_obligations USING btree (member_id, contribution_type_id, obligation_month);
CREATE INDEX contribution_periods_fine_rule_idx ON public.contribution_periods USING btree (fine_rule_id) WHERE (fine_rule_id IS NOT NULL);
CREATE INDEX contribution_periods_group_status_idx ON public.contribution_periods USING btree (group_id, status, opening_date);
CREATE INDEX contribution_periods_type_dates_idx ON public.contribution_periods USING btree (group_id, contribution_type_id, opening_date, closing_date);
CREATE UNIQUE INDEX contribution_periods_typed_uq ON public.contribution_periods USING btree (group_id, contribution_type_id, period_key) WHERE (contribution_type_id IS NOT NULL);
CREATE UNIQUE INDEX contribution_periods_universal_uq ON public.contribution_periods USING btree (group_id, period_key) WHERE (contribution_type_id IS NULL);
CREATE UNIQUE INDEX contribution_types_group_code_unique ON public.contribution_types USING btree (group_id, code) WHERE (code IS NOT NULL);
CREATE INDEX contribution_types_group_id_idx ON public.contribution_types USING btree (group_id);
CREATE UNIQUE INDEX contribution_types_group_name_unique ON public.contribution_types USING btree (group_id, lower(TRIM(BOTH FROM name)));
CREATE INDEX contributions_group_month_idx ON public.contributions USING btree (group_id, month);
CREATE INDEX contributions_member_month_idx ON public.contributions USING btree (member_id, month);
CREATE UNIQUE INDEX contributions_mpesa_reference_unique_idx ON public.contributions USING btree (lower(TRIM(BOTH FROM reference))) WHERE ((payment_method = 'M-Pesa'::text) AND (reference IS NOT NULL) AND (TRIM(BOTH FROM reference) <> ''::text));
CREATE INDEX idx_cl_2b_contributions_member_date ON public.contributions USING btree (member_id, contribution_date, created_at);
CREATE INDEX idx_contributions_goal ON public.contributions USING btree (goal_id);
CREATE INDEX idx_contributions_group ON public.contributions USING btree (group_id);
CREATE INDEX idx_contributions_group_date ON public.contributions USING btree (group_id, contribution_date DESC);
CREATE INDEX idx_contributions_member ON public.contributions USING btree (member_id);
CREATE INDEX data_import_batches_group_idx ON public.data_import_batches USING btree (group_id);
CREATE INDEX data_import_batches_status_idx ON public.data_import_batches USING btree (group_id, status);
CREATE INDEX data_import_mappings_batch_idx ON public.data_import_mappings USING btree (batch_id);
CREATE INDEX data_import_rows_batch_idx ON public.data_import_rows USING btree (batch_id);
CREATE INDEX data_import_rows_entity_idx ON public.data_import_rows USING btree (batch_id, entity_type);
CREATE INDEX data_import_rows_status_idx ON public.data_import_rows USING btree (batch_id, status);
CREATE INDEX expense_approvals_group_expense_idx ON public.expense_approvals USING btree (group_id, expense_id);
CREATE INDEX expenses_group_date_idx ON public.expenses USING btree (group_id, date);
CREATE INDEX idx_expenses_group ON public.expenses USING btree (group_id);
CREATE INDEX idx_expenses_group_date ON public.expenses USING btree (group_id, date DESC);
CREATE INDEX financial_charges_accounting_month_idx ON public.financial_charges USING btree (group_id, accounting_month);
CREATE UNIQUE INDEX financial_charges_automatic_identity_uidx ON public.financial_charges USING btree (obligation_id, charge_type) WHERE (source = 'automatic'::text);
CREATE INDEX financial_charges_group_member_idx ON public.financial_charges USING btree (group_id, member_id);
CREATE INDEX financial_charges_obligation_idx ON public.financial_charges USING btree (obligation_id);
CREATE INDEX financial_charges_status_idx ON public.financial_charges USING btree (status);
CREATE INDEX financial_periods_group_month_idx ON public.financial_periods USING btree (group_id, month);
CREATE INDEX fine_adjustments_fine_created_idx ON public.fine_adjustments USING btree (fine_id, created_at);
CREATE INDEX fine_payment_allocations_fine_created_idx ON public.fine_payment_allocations USING btree (fine_id, allocated_at);
CREATE INDEX fine_payment_allocations_payment_idx ON public.fine_payment_allocations USING btree (payment_id);
CREATE INDEX fine_rule_contribution_types_type_rule_idx ON public.fine_rule_contribution_types USING btree (contribution_type_id, rule_id);
CREATE INDEX fine_rules_group_effective_idx ON public.fine_rules USING btree (group_id, effective_from);
CREATE INDEX fine_rules_group_trigger_status_idx ON public.fine_rules USING btree (group_id, trigger_type, status);
CREATE INDEX fine_waivers_fine_created_idx ON public.fine_waivers USING btree (fine_id, created_at);
CREATE INDEX fines_group_member_idx ON public.fines USING btree (group_id, member_id);
CREATE INDEX fines_group_month_idx ON public.fines USING btree (group_id, accounting_month);
CREATE INDEX fines_member_created_idx ON public.fines USING btree (member_id, created_at);
CREATE INDEX fines_rule_trigger_idx ON public.fines USING btree (rule_id, trigger_type, trigger_id);
CREATE INDEX group_activities_assigned_idx ON public.group_activities USING btree (assigned_to);
CREATE INDEX group_activities_group_idx ON public.group_activities USING btree (group_id);
CREATE INDEX group_activities_plan_idx ON public.group_activities USING btree (plan_id);
CREATE INDEX group_activities_status_idx ON public.group_activities USING btree (group_id, status);
CREATE UNIQUE INDEX group_applications_auth_user_unique ON public.group_applications USING btree (auth_user_id) WHERE (status = ANY (ARRAY['pending'::text, 'under_review'::text, 'approved'::text]));
CREATE INDEX group_applications_status_idx ON public.group_applications USING btree (status, created_at DESC);
CREATE INDEX idx_group_applications_status_created_at ON public.group_applications USING btree (status, created_at);
CREATE INDEX group_assets_group_idx ON public.group_assets USING btree (group_id);
CREATE INDEX group_assets_status_idx ON public.group_assets USING btree (group_id, status);
CREATE INDEX group_audit_log_group_created_idx ON public.group_audit_log USING btree (group_id, created_at DESC);
CREATE UNIQUE INDEX group_invites_code_hash_uidx ON public.group_invites USING btree (code_hash) WHERE (code_hash IS NOT NULL);
CREATE INDEX group_invites_member_id_idx ON public.group_invites USING btree (member_id);
CREATE INDEX idx_group_invites_code ON public.group_invites USING btree (code);
CREATE INDEX idx_group_invites_email ON public.group_invites USING btree (lower(email));
CREATE INDEX idx_group_invites_group ON public.group_invites USING btree (group_id);
CREATE INDEX idx_group_invites_group_id ON public.group_invites USING btree (group_id);
CREATE INDEX group_milestones_date_idx ON public.group_milestones USING btree (group_id, milestone_date DESC);
CREATE INDEX group_milestones_group_idx ON public.group_milestones USING btree (group_id);
CREATE INDEX group_milestones_plan_idx ON public.group_milestones USING btree (plan_id);
CREATE INDEX group_plans_group_idx ON public.group_plans USING btree (group_id);
CREATE INDEX group_plans_status_idx ON public.group_plans USING btree (group_id, status);
CREATE UNIQUE INDEX group_subscriptions_one_active_idx ON public.group_subscriptions USING btree (group_id) WHERE (status = 'active'::text);
CREATE INDEX group_support_cases_date_idx ON public.group_support_cases USING btree (group_id, support_date DESC);
CREATE INDEX group_support_cases_group_idx ON public.group_support_cases USING btree (group_id);
CREATE INDEX group_support_cases_member_idx ON public.group_support_cases USING btree (member_id);
CREATE INDEX group_support_cases_status_idx ON public.group_support_cases USING btree (group_id, status);
CREATE UNIQUE INDEX groups_owner_user_id_uidx ON public.groups USING btree (owner_user_id) WHERE (owner_user_id IS NOT NULL);
CREATE INDEX loan_applications_group_status_idx ON public.loan_applications USING btree (group_id, status, created_at DESC);
CREATE INDEX loan_applications_member_idx ON public.loan_applications USING btree (group_id, member_id, created_at DESC);
CREATE INDEX loan_approvals_group_loan_idx ON public.loan_approvals USING btree (group_id, loan_id);
CREATE INDEX loan_notifications_loan_idx ON public.loan_notifications USING btree (loan_id, created_at DESC);
CREATE INDEX loan_notifications_recipient_unread_idx ON public.loan_notifications USING btree (group_id, recipient_member_id, created_at DESC) WHERE (read_at IS NULL);
CREATE INDEX loan_allocations_schedule_idx ON public.loan_repayment_allocations USING btree (schedule_id);
CREATE INDEX loan_schedule_loan_due_idx ON public.loan_repayment_schedule USING btree (loan_id, due_date);
CREATE INDEX loan_repayments_loan_date_idx ON public.loan_repayments USING btree (loan_id, payment_date DESC);
CREATE INDEX idx_meetings_date ON public.meetings USING btree (date);
CREATE INDEX idx_meetings_group ON public.meetings USING btree (group_id);
CREATE INDEX idx_meetings_group_id ON public.meetings USING btree (group_id);
CREATE INDEX idx_member_contribution_rules_active ON public.member_contribution_rules USING btree (member_id, contribution_type_id, effective_from) WHERE (status = 'active'::text);
CREATE INDEX idx_member_contribution_rules_lookup ON public.member_contribution_rules USING btree (group_id, member_id, contribution_type_id, effective_from);
CREATE UNIQUE INDEX member_payment_evidence_active_mpesa_reference_uidx ON public.member_payment_evidence USING btree (btrim(mpesa_reference)) WHERE ((mpesa_reference IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'verified'::text])));
CREATE UNIQUE INDEX member_payment_evidence_contribution_id_uidx ON public.member_payment_evidence USING btree (contribution_id) WHERE (contribution_id IS NOT NULL);
CREATE INDEX member_payment_evidence_group_member_idx ON public.member_payment_evidence USING btree (group_id, member_id);
CREATE INDEX member_payment_evidence_pending_idx ON public.member_payment_evidence USING btree (group_id, submitted_at) WHERE (status = 'pending'::text);
CREATE INDEX member_payment_evidence_verified_by_idx ON public.member_payment_evidence USING btree (verified_by) WHERE (verified_by IS NOT NULL);
CREATE INDEX member_position_history_group_member_idx ON public.member_position_history USING btree (group_id, member_id);
CREATE INDEX member_position_history_member_from_idx ON public.member_position_history USING btree (member_id, effective_from DESC);
CREATE INDEX idx_members_group ON public.members USING btree (group_id);
CREATE INDEX idx_members_user ON public.members USING btree (user_id);
CREATE INDEX members_auth_user_id_idx ON public.members USING btree (auth_user_id);
CREATE UNIQUE INDEX members_auth_user_id_uidx ON public.members USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX members_group_email_uidx ON public.members USING btree (group_id, lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX members_group_id_idx ON public.members USING btree (group_id);
CREATE UNIQUE INDEX members_group_member_number_uidx ON public.members USING btree (group_id, member_number);
CREATE UNIQUE INDEX members_group_membership_number_uidx ON public.members USING btree (group_id, membership_number) WHERE (membership_number IS NOT NULL);
CREATE INDEX members_group_role_idx ON public.members USING btree (group_id, role);
CREATE INDEX merry_cycles_group_status_idx ON public.merry_go_round_cycles USING btree (group_id, status);
CREATE INDEX merry_notifications_member_idx ON public.merry_go_round_notifications USING btree (member_id, created_at DESC);
CREATE INDEX merry_payments_group_member_idx ON public.merry_go_round_payments USING btree (group_id, member_id, status);
CREATE INDEX merry_preferences_cycle_idx ON public.merry_go_round_preferences USING btree (cycle_id, preferred_round_number);
CREATE INDEX merry_rounds_cycle_number_idx ON public.merry_go_round_rounds USING btree (cycle_id, round_number);
CREATE INDEX idx_monthly_closings_group_month ON public.monthly_closings USING btree (group_id, closing_month DESC);
CREATE UNIQUE INDEX pending_onboarding_auth_user_unique ON public.pending_onboarding USING btree (auth_user_id) WHERE (status = 'pending'::text);
CREATE INDEX platform_activity_recent_idx ON public.platform_activity USING btree (occurred_at DESC, id DESC);
CREATE INDEX idx_platform_admins_active ON public.platform_admins USING btree (active) WHERE (active = true);
CREATE INDEX subscription_credits_source_payment_idx ON public.subscription_credits USING btree (source_payment_id);
CREATE UNIQUE INDEX subscription_credits_source_payment_uidx ON public.subscription_credits USING btree (source_payment_id);
CREATE INDEX subscription_credits_status_idx ON public.subscription_credits USING btree (status);
CREATE INDEX subscription_payment_allocations_credit_idx ON public.subscription_payment_allocations USING btree (credit_id);
CREATE UNIQUE INDEX subscription_payment_allocations_credit_uidx ON public.subscription_payment_allocations USING btree (payment_id, invoice_id, credit_id, allocation_type) WHERE (allocation_type = 'credit'::text);
CREATE UNIQUE INDEX subscription_payment_allocations_direct_uidx ON public.subscription_payment_allocations USING btree (payment_id, invoice_id, allocation_type) WHERE (allocation_type = 'direct'::text);
CREATE INDEX subscription_payment_allocations_invoice_idx ON public.subscription_payment_allocations USING btree (invoice_id);
CREATE INDEX subscription_payment_allocations_payment_idx ON public.subscription_payment_allocations USING btree (payment_id);
CREATE UNIQUE INDEX subscription_payments_provider_reference_uidx ON public.subscription_payments USING btree (provider, provider_reference) WHERE ((provider IS NOT NULL) AND (provider_reference IS NOT NULL));

-- 4. All 201 production function/procedure definitions, captured directly from pg_get_functiondef.
-- Function source is split into four alphabetical bundles; bodies are production definitions.
CREATE OR REPLACE FUNCTION private.append_platform_activity(p_event_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_actor_display text;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE = '42501';
  END IF;
  IF p_event_type NOT IN (
    'group_application_submitted','group_application_reviewed','group_approved',
    'group_created','member_created','subscription_renewed',
    'subscription_payment_confirmed','subscription_payment_reversed'
  ) THEN
    RAISE EXCEPTION 'Unsupported platform activity event type: %', p_event_type
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Platform activity metadata must be a JSON object'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(
    NULLIF(BTRIM(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',''
    )), ''),
    NULLIF(BTRIM(u.email), '')
  ) INTO v_actor_display
  FROM auth.users AS u WHERE u.id = v_actor_user_id;

  INSERT INTO public.platform_activity(
    event_type, actor_user_id, actor_type, actor_display, metadata
  ) VALUES (
    p_event_type, v_actor_user_id, 'human', v_actor_display, v_metadata
  ) RETURNING id INTO v_activity_id;
  RETURN v_activity_id;
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_fine_config_lock(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid fine group';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:fine-config:' || p_group_id::text, 0));
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_fine_lock(p_group_id uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Invalid fine accounting key';
  END IF;
  PERFORM public.cl_2b_accounting_lock(p_group_id, p_month);
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_other_assert_fine_rule(p_group_id uuid, p_contribution_type_id uuid, p_fine_rule_id uuid, p_cycle_opening_date date, p_cycle_closing_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_rule public.fine_rules%ROWTYPE;
BEGIN
  IF p_fine_rule_id IS NULL THEN RETURN; END IF;
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=p_fine_rule_id AND r.group_id=p_group_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine rule does not belong to cycle group'; END IF;
  IF v_rule.status <> 'active' THEN RAISE EXCEPTION 'Other cycle fine rule must be active'; END IF;
  IF v_rule.trigger_type <> 'missed_contribution' THEN
    RAISE EXCEPTION 'Other cycles require missed_contribution fine rules';
  END IF;
  IF v_rule.applicability_mode NOT IN ('ALL','SELECTED') THEN
    RAISE EXCEPTION 'Other cycles require ALL or SELECTED fine applicability';
  END IF;
  IF v_rule.effective_from > ((p_cycle_opening_date)::timestamp AT TIME ZONE 'Africa/Nairobi') THEN
    RAISE EXCEPTION 'Fine rule becomes effective after cycle opens';
  END IF;
  IF v_rule.effective_until IS NOT NULL
     AND v_rule.effective_until < ((p_cycle_closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi') THEN
    RAISE EXCEPTION 'Fine rule expires before cycle closing boundary';
  END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS (SELECT 1 FROM public.fine_rule_contribution_types rt
                     WHERE rt.rule_id=v_rule.id
                       AND rt.contribution_type_id=p_contribution_type_id) THEN
    RAISE EXCEPTION 'Selected fine rule is not applicable to contribution type';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_assert_type(p_group_id uuid, p_contribution_type_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_code text;
BEGIN
  SELECT ct.code INTO v_code FROM public.contribution_types ct
  WHERE ct.id=p_contribution_type_id AND ct.group_id=p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contribution type does not belong to group'; END IF;
  IF lower(coalesce(v_code,''))='monthly' THEN
    RAISE EXCEPTION 'Monthly contribution type cannot use Other lifecycle';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_cycle_authorize(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_member_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.user_id=v_actor OR m.auth_user_id=v_actor)
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND (EXISTS (SELECT 1 FROM public.groups g
                 WHERE g.id=p_group_id AND g.owner_user_id=v_actor)
         OR lower(coalesce(m.actual_position,'')) IN ('chairperson','treasurer'))
  ORDER BY m.id LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Other cycle authorization requires owner, chairperson, or treasurer'
      USING ERRCODE='42501';
  END IF;
  RETURN v_member_id;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_cycle_lock(p_group_id uuid, p_contribution_type_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL OR p_contribution_type_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Other contribution cycle lock key';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('chama-live:other-cycle:'||p_group_id::text||':'||
                     p_contribution_type_id::text,0));
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_obligation_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_parent public.contribution_obligations%ROWTYPE;
BEGIN
  IF NEW.component_kind='RESIDUAL' THEN
    IF NEW.parent_obligation_id IS NULL THEN
      RAISE EXCEPTION 'Residual requires parent obligation';
    END IF;
    SELECT o.* INTO v_parent
    FROM public.contribution_obligations o
    WHERE o.id=NEW.parent_obligation_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Residual parent obligation % not found',NEW.parent_obligation_id;
    END IF;
    IF v_parent.group_id IS DISTINCT FROM NEW.group_id
       OR v_parent.member_id IS DISTINCT FROM NEW.member_id
       OR v_parent.contribution_type_id IS DISTINCT FROM NEW.contribution_type_id
       OR v_parent.obligation_month IS DISTINCT FROM NEW.obligation_month
       OR v_parent.economic_month IS DISTINCT FROM NEW.economic_month
       OR v_parent.rule_id IS DISTINCT FROM NEW.rule_id
       OR v_parent.period_id IS DISTINCT FROM NEW.period_id THEN
      RAISE EXCEPTION 'Residual source identity does not match parent obligation %',
        NEW.parent_obligation_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_payment_request_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.operation IS DISTINCT FROM OLD.operation
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
       OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'Other payment request identity is immutable';
    END IF;

    IF OLD.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Completed other payment request is immutable';
    END IF;

    IF OLD.payment_id IS NOT NULL
       AND NEW.payment_id IS DISTINCT FROM OLD.payment_id
    THEN
        RAISE EXCEPTION
            'Other payment request payment_id is immutable once assigned';
    END IF;

    IF NEW.completed_at IS NULL THEN
        IF NEW.result IS DISTINCT FROM OLD.result THEN
            RAISE EXCEPTION
                'Incomplete other payment request result is immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.payment_id IS NULL THEN
        RAISE EXCEPTION
            'Completed other payment request requires payment_id';
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_other_period_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status <> 'draft' AND NEW.status='draft' THEN
    RAISE EXCEPTION 'Activated contribution cycle cannot return to draft';
  END IF;
  IF NEW.status <> 'draft' THEN
    IF NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.contribution_type_id IS DISTINCT FROM OLD.contribution_type_id
       OR NEW.frequency IS DISTINCT FROM OLD.frequency
       OR NEW.period_key IS DISTINCT FROM OLD.period_key
       OR NEW.opening_date IS DISTINCT FROM OLD.opening_date
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.closing_date IS DISTINCT FROM OLD.closing_date
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.fine_rule_id IS DISTINCT FROM OLD.fine_rule_id THEN
      RAISE EXCEPTION 'Activated contribution-cycle configuration is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $function$



CREATE OR REPLACE FUNCTION private.cl_other_request_lock(p_request_id uuid, p_operation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_request_id IS NULL OR p_operation NOT IN ('create','activate','generate_fine') THEN
    RAISE EXCEPTION 'Invalid Other contribution request lock key';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('chama-live:other-request:'||p_request_id::text||':'||p_operation,0));
END $function$


CREATE OR REPLACE FUNCTION private.create_next_subscription_cycle(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_previous public.subscription_cycles%ROWTYPE;v_cycle_id uuid;v_cycle_number integer;v_starts_at timestamptz;v_ends_at timestamptz;v_member_count integer;v_tier public.subscription_pricing_tiers%ROWTYPE;v_group_discount numeric(5,2);v_login_discount numeric(5,2);v_group_amount numeric(12,2);v_login_unit numeric(12,2);v_member public.members%ROWTYPE; BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0)); SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002'; END IF; IF v_subscription.status<>'active' THEN RAISE EXCEPTION 'Subscription % is not active',p_subscription_id USING ERRCODE='P0001'; END IF; SELECT * INTO v_previous FROM public.subscription_cycles WHERE subscription_id=p_subscription_id ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE; IF NOT FOUND THEN v_cycle_number:=1;v_starts_at:=v_subscription.started_at; ELSE v_cycle_number:=v_previous.cycle_number+1;v_starts_at:=v_previous.ends_at; END IF; v_ends_at:=v_starts_at+interval '30 days'; FOR v_member IN SELECT m.* FROM public.members m WHERE m.group_id=v_subscription.group_id ORDER BY m.id FOR UPDATE LOOP NULL; END LOOP; SELECT count(*) INTO v_member_count FROM public.members m WHERE m.group_id=v_subscription.group_id AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'pending'))='active'; SELECT * INTO v_tier FROM public.subscription_pricing_tiers t WHERE t.active AND v_member_count>=t.min_members AND(t.max_members IS NULL OR v_member_count<=t.max_members) ORDER BY t.min_members DESC LIMIT 1; IF NOT FOUND THEN RAISE EXCEPTION 'No subscription pricing tier exists for % active members',v_member_count; END IF; IF v_cycle_number=1 THEN v_group_discount:=100;v_login_discount:=100;ELSIF v_cycle_number BETWEEN 2 AND 5 THEN v_group_discount:=30;v_login_discount:=30;ELSE v_group_discount:=0;v_login_discount:=0;END IF; v_group_amount:=round(v_tier.standard_group_amount*(1-v_group_discount/100),2);v_login_unit:=round(v_tier.standard_member_login_amount*(1-v_login_discount/100),2); INSERT INTO public.subscription_cycles(subscription_id,cycle_number,starts_at,ends_at,member_count_snapshot,pricing_tier_code,standard_group_amount,group_discount_percent,group_amount,standard_member_login_amount,member_login_discount_percent,member_login_unit_amount,currency,status) VALUES(p_subscription_id,v_cycle_number,v_starts_at,v_ends_at,v_member_count,v_tier.tier_code,v_tier.standard_group_amount,v_group_discount,v_group_amount,v_tier.standard_member_login_amount,v_login_discount,v_login_unit,v_tier.currency,'open') RETURNING id INTO v_cycle_id; IF v_cycle_number>=2 THEN INSERT INTO public.subscription_member_billing(subscription_id,group_id,member_id,billable_from_cycle_id,activated_at,status) SELECT p_subscription_id,v_subscription.group_id,m.id,v_cycle_id,m.activated_at,'active' FROM public.members m WHERE m.group_id=v_subscription.group_id AND lower(coalesce(m.status,''))='active' AND lower(coalesce(m.onboarding_status,''))='active' AND m.activated_at IS NOT NULL AND m.activated_at<=v_starts_at AND NOT EXISTS(SELECT 1 FROM public.subscription_member_billing smb WHERE smb.subscription_id=p_subscription_id AND smb.member_id=m.id); END IF; RETURN v_cycle_id; END; $function$


CREATE OR REPLACE FUNCTION private.create_subscription_invoice_authority(p_cycle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_cycle public.subscription_cycles%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_invoice_sequence bigint;
    v_invoice_number text;
    v_issued_at timestamptz;
    v_due_at timestamptz;
    v_member_login_count integer;
    v_standard_member_login_amount numeric(12,2);
    v_member_login_unit_amount numeric(12,2);
    v_member_login_amount numeric(12,2);
    v_group_discount_amount numeric(12,2);
    v_total_discount numeric(12,2);
    v_subtotal numeric(12,2);
    v_total_amount numeric(12,2);
    v_status text;
BEGIN
    SELECT gs.*
    INTO v_subscription
    FROM public.subscription_cycles sc
    JOIN public.group_subscriptions gs ON gs.id = sc.subscription_id
    WHERE sc.id = p_cycle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist', p_cycle_id USING ERRCODE = 'P0002';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || v_subscription.id::text, 0)
    );

    SELECT * INTO v_subscription
    FROM public.group_subscriptions
    WHERE id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % does not exist', v_subscription.id USING ERRCODE = 'P0002';
    END IF;

    IF v_subscription.status <> 'active' THEN
        RAISE EXCEPTION 'Subscription % is not active', v_subscription.id USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_cycle
    FROM public.subscription_cycles
    WHERE id = p_cycle_id
      AND subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist for subscription %', p_cycle_id, v_subscription.id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE subscription_id = v_subscription.id
      AND cycle_id = v_cycle.id
    FOR UPDATE;

    IF FOUND THEN
        RETURN v_invoice.id;
    END IF;

    IF v_cycle.status <> 'open' THEN
        RAISE EXCEPTION 'Subscription cycle % is not open for invoicing', v_cycle.cycle_number USING ERRCODE = 'P0001';
    END IF;

    v_issued_at := now();
    v_due_at := v_issued_at + interval '7 days';

    SELECT
        count(*)::integer,
        coalesce(sum(v_cycle.standard_member_login_amount), 0)::numeric(12,2)
    INTO v_member_login_count, v_standard_member_login_amount
    FROM public.subscription_member_billing b
    JOIN public.subscription_cycles from_cycle
      ON from_cycle.id = b.billable_from_cycle_id
     AND from_cycle.subscription_id = v_subscription.id
    LEFT JOIN public.subscription_cycles until_cycle
      ON until_cycle.id = b.billable_until_cycle_id
     AND until_cycle.subscription_id = v_subscription.id
    WHERE b.subscription_id = v_subscription.id
      AND b.group_id = v_subscription.group_id
      AND from_cycle.cycle_number <= v_cycle.cycle_number
      AND (until_cycle.id IS NULL OR until_cycle.cycle_number >= v_cycle.cycle_number)
      AND b.status = 'active';

    v_standard_member_login_amount := coalesce(v_standard_member_login_amount, 0);
    v_member_login_unit_amount := round(v_cycle.member_login_unit_amount, 2);
    v_member_login_amount := round(v_member_login_count * v_member_login_unit_amount, 2);
    v_group_discount_amount := round(v_cycle.standard_group_amount - v_cycle.group_amount, 2);
    v_total_discount := round(v_group_discount_amount + (v_standard_member_login_amount - v_member_login_amount), 2);
    v_subtotal := round(v_cycle.standard_group_amount + v_standard_member_login_amount, 2);
    v_total_amount := round(v_cycle.group_amount + v_member_login_amount, 2);

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_invoice_number:' || to_char(v_issued_at, 'YYYY'), 0)
    );

    SELECT COALESCE(MAX(substring(invoice_number FROM 10 FOR 6)::bigint), 0)
    INTO v_invoice_sequence
    FROM public.subscription_invoices
    WHERE invoice_number LIKE 'INV-' || to_char(v_issued_at, 'YYYY') || '-%';

    v_invoice_number :=
        'INV-' || to_char(v_issued_at, 'YYYY') || '-' ||
        lpad((v_invoice_sequence + 1)::text, 6, '0');

    v_status := CASE WHEN v_total_amount = 0 THEN 'paid' ELSE 'issued' END;

    INSERT INTO public.subscription_invoices (
        group_id, subscription_id, cycle_id, invoice_number,
        member_count_snapshot, pricing_tier_code,
        standard_group_amount, group_discount_amount, group_amount,
        member_login_count, member_login_unit_amount, member_login_amount,
        subtotal, total_discount, total_amount, currency, status,
        issued_at, due_at, paid_at
    )
    VALUES (
        v_subscription.group_id, v_subscription.id, v_cycle.id, v_invoice_number,
        v_cycle.member_count_snapshot, v_cycle.pricing_tier_code,
        v_cycle.standard_group_amount, v_group_discount_amount, v_cycle.group_amount,
        v_member_login_count, v_member_login_unit_amount, v_member_login_amount,
        v_subtotal, v_total_discount, v_total_amount, v_cycle.currency, v_status,
        v_issued_at, v_due_at, NULL
    )
    RETURNING * INTO v_invoice;

    INSERT INTO public.subscription_invoice_lines (
        invoice_id, group_id, line_type, member_id, description,
        quantity, unit_amount, discount_percent, discount_amount, line_amount, currency
    )
    VALUES (
        v_invoice.id, v_subscription.group_id, 'group_subscription', NULL,
        'Group subscription', 1, v_cycle.standard_group_amount,
        v_cycle.group_discount_percent, v_group_discount_amount,
        v_cycle.group_amount, v_cycle.currency
    );

    INSERT INTO public.subscription_invoice_lines (
        invoice_id, group_id, line_type, member_id, description,
        quantity, unit_amount, discount_percent, discount_amount, line_amount, currency
    )
    SELECT
        v_invoice.id, b.group_id, 'member_login', b.member_id,
        'Member login subscription', 1, v_cycle.standard_member_login_amount,
        v_cycle.member_login_discount_percent,
        round(v_cycle.standard_member_login_amount - v_cycle.member_login_unit_amount, 2),
        v_cycle.member_login_unit_amount, v_cycle.currency
    FROM public.subscription_member_billing b
    JOIN public.subscription_cycles from_cycle
      ON from_cycle.id = b.billable_from_cycle_id
     AND from_cycle.subscription_id = v_subscription.id
    LEFT JOIN public.subscription_cycles until_cycle
      ON until_cycle.id = b.billable_until_cycle_id
     AND until_cycle.subscription_id = v_subscription.id
    WHERE b.subscription_id = v_subscription.id
      AND b.group_id = v_subscription.group_id
      AND from_cycle.cycle_number <= v_cycle.cycle_number
      AND (until_cycle.id IS NULL OR until_cycle.cycle_number >= v_cycle.cycle_number)
      AND b.status = 'active';

    UPDATE public.subscription_cycles
    SET status = 'invoiced'
    WHERE id = v_cycle.id
      AND subscription_id = v_subscription.id
      AND status = 'open';

    RETURN v_invoice.id;
END;
$function$


CREATE OR REPLACE FUNCTION private.deactivate_member_login_billing(p_subscription_id uuid, p_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_billing public.subscription_member_billing%ROWTYPE;v_current_cycle public.subscription_cycles%ROWTYPE;v_next_cycle public.subscription_cycles%ROWTYPE;BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0));SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002';END IF;SELECT * INTO v_billing FROM public.subscription_member_billing WHERE subscription_id=p_subscription_id AND member_id=p_member_id FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;IF v_billing.status='ended' THEN RETURN true;END IF;SELECT * INTO v_current_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND now()>=sc.starts_at AND now()<sc.ends_at ORDER BY sc.cycle_number DESC LIMIT 1 FOR UPDATE;IF FOUND THEN SELECT * INTO v_next_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND sc.cycle_number=v_current_cycle.cycle_number+1 LIMIT 1 FOR UPDATE;END IF;UPDATE public.subscription_member_billing SET status='ended',deactivated_at=now(),billable_until_cycle_id=CASE WHEN v_next_cycle.id IS NOT NULL THEN v_next_cycle.id ELSE billable_until_cycle_id END WHERE id=v_billing.id;RETURN true;END; $function$


CREATE OR REPLACE FUNCTION private.get_my_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    select m.group_id
    from public.members m
    where m.user_id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION private.initialize_group_subscription(p_group_id uuid, p_started_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription_id uuid;v_member_count integer;v_tier public.subscription_pricing_tiers%ROWTYPE; BEGIN SELECT count(*) INTO v_member_count FROM public.members m WHERE m.group_id=p_group_id AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'pending'))='active'; SELECT * INTO v_tier FROM public.subscription_pricing_tiers t WHERE t.active AND v_member_count>=t.min_members AND(t.max_members IS NULL OR v_member_count<=t.max_members) ORDER BY t.min_members DESC LIMIT 1; IF NOT FOUND THEN RAISE EXCEPTION 'No subscription pricing tier exists for % active members',v_member_count; END IF; INSERT INTO public.group_subscriptions(group_id,pricing_tier_id,pricing_tier_code,standard_group_amount,standard_member_login_amount,currency,started_at,status) VALUES(p_group_id,v_tier.id,v_tier.tier_code,v_tier.standard_group_amount,v_tier.standard_member_login_amount,v_tier.currency,p_started_at,'active') RETURNING id INTO v_subscription_id; RETURN v_subscription_id; END; $function$


CREATE OR REPLACE FUNCTION private.machine_renew_due_subscriptions(p_run_id uuid, p_batch_size integer)
 RETURNS TABLE(run_id uuid, processed_count integer, renewed_count integer, not_due_count integer, already_renewed_count integer, anomalous_count integer, failed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_run private.renewal_runs%ROWTYPE;
    v_processed integer := 0;
    v_renewed integer := 0;
    v_not_due integer := 0;
    v_already_renewed integer := 0;
    v_anomalous integer := 0;
    v_failed integer := 0;
    v_candidate record;
    v_attempt record;
BEGIN
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'batch size must be between 1 and 100';
    END IF;

    SELECT * INTO v_run
    FROM private.renewal_runs AS rr
    WHERE rr.run_id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'renewal run % not found', p_run_id;
    END IF;

    IF v_run.execution_source <> 'scheduler' THEN
        RAISE EXCEPTION 'renewal run % is not a scheduler run', p_run_id;
    END IF;

    IF v_run.status <> 'running' THEN
        RAISE EXCEPTION 'renewal run % is not running', p_run_id;
    END IF;

    FOR v_candidate IN
        SELECT gs.id AS subscription_id,
               lc.id AS expected_cycle_id
        FROM public.group_subscriptions AS gs
        JOIN LATERAL (
            SELECT sc.*
            FROM public.subscription_cycles AS sc
            WHERE sc.subscription_id = gs.id
            ORDER BY sc.cycle_number DESC
            LIMIT 1
        ) AS lc ON true
        WHERE gs.status = 'active'
          AND lc.ends_at <= pg_catalog.now()
        ORDER BY lc.ends_at, gs.id
        FOR UPDATE OF gs SKIP LOCKED
        LIMIT p_batch_size
    LOOP
        v_processed := v_processed + 1;

        BEGIN
            SELECT *
            INTO v_attempt
            FROM private.renew_subscription_authority(
                v_candidate.subscription_id,
                v_candidate.expected_cycle_id,
                p_run_id,
                'scheduler:' || v_candidate.subscription_id::text || ':' || v_candidate.expected_cycle_id::text,
                'scheduler'
            );

            IF v_attempt.result = 'renewed' THEN
                v_renewed := v_renewed + 1;
            ELSIF v_attempt.result = 'not_due' THEN
                v_not_due := v_not_due + 1;
            ELSIF v_attempt.result = 'already_renewed' THEN
                v_already_renewed := v_already_renewed + 1;
            ELSIF v_attempt.result = 'anomalous' THEN
                v_anomalous := v_anomalous + 1;
            ELSIF v_attempt.result = 'failed' THEN
                v_failed := v_failed + 1;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_failed := v_failed + 1;
        END;
    END LOOP;

    RETURN QUERY
    SELECT
        p_run_id,
        v_processed,
        v_renewed,
        v_not_due,
        v_already_renewed,
        v_anomalous,
        v_failed;
END;
$function$


CREATE OR REPLACE FUNCTION private.register_member_login_billing(p_subscription_id uuid, p_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_member public.members%ROWTYPE;v_cycle public.subscription_cycles%ROWTYPE;v_auth_user_id uuid;v_billing_id uuid; BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0));SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002';END IF;IF v_subscription.status<>'active' THEN RAISE EXCEPTION 'Subscription % is not active',p_subscription_id USING ERRCODE='P0001';END IF;SELECT * INTO v_member FROM public.members WHERE id=p_member_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Member % does not exist',p_member_id USING ERRCODE='P0002';END IF;IF v_member.group_id<>v_subscription.group_id THEN RAISE EXCEPTION 'Member % does not belong to subscription group',p_member_id USING ERRCODE='P0001';END IF;IF lower(coalesce(v_member.status,''))<>'active' OR lower(coalesce(v_member.onboarding_status,''))<>'active' THEN RAISE EXCEPTION 'Member % is not currently eligible for login billing',p_member_id USING ERRCODE='P0001';END IF;IF v_member.activated_at IS NULL THEN RAISE EXCEPTION 'Member % has not been activated',p_member_id USING ERRCODE='P0001';END IF;IF v_member.user_id IS NOT NULL AND v_member.auth_user_id IS NOT NULL AND v_member.user_id<>v_member.auth_user_id THEN RAISE EXCEPTION 'Member has conflicting Auth identities';END IF;v_auth_user_id:=coalesce(v_member.auth_user_id,v_member.user_id);IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'Member has no authenticated login';END IF;IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_auth_user_id) THEN RAISE EXCEPTION 'Authenticated user does not exist';END IF;SELECT * INTO v_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND sc.cycle_number>=2 AND sc.starts_at>=v_member.activated_at ORDER BY sc.cycle_number LIMIT 1 FOR UPDATE;IF NOT FOUND THEN RETURN NULL;END IF;SELECT id INTO v_billing_id FROM public.subscription_member_billing WHERE subscription_id=p_subscription_id AND member_id=p_member_id FOR UPDATE;IF FOUND THEN RETURN v_billing_id;END IF;INSERT INTO public.subscription_member_billing(subscription_id,group_id,member_id,billable_from_cycle_id,activated_at,status) VALUES(p_subscription_id,v_subscription.group_id,p_member_id,v_cycle.id,v_member.activated_at,'active') RETURNING id INTO v_billing_id;RETURN v_billing_id;END; $function$


CREATE OR REPLACE FUNCTION private.renew_subscription_authority(p_subscription_id uuid, p_expected_cycle_id uuid, p_run_id uuid, p_idempotency_key text, p_execution_source text)
 RETURNS TABLE(attempt_id uuid, subscription_id uuid, result text, cycle_before integer, cycle_after integer, invoice_id uuid, error_code text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_attempt private.renewal_attempts%ROWTYPE;
    v_run private.renewal_runs%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_expected public.subscription_cycles%ROWTYPE;
    v_previous public.subscription_cycles%ROWTYPE;
    v_new_cycle_id uuid;
    v_new_cycle public.subscription_cycles%ROWTYPE;
    v_invoice_id uuid;
    v_error_code text;
    v_error_message text;
BEGIN
    IF p_execution_source NOT IN ('human','scheduler') THEN
        RAISE EXCEPTION 'Invalid execution source %', p_execution_source USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
    FROM private.renewal_attempts
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
            v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
            v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
        RETURN;
    END IF;

    SELECT * INTO v_run
    FROM private.renewal_runs
    WHERE run_id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Renewal run % does not exist', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF v_run.status <> 'running' THEN
        RAISE EXCEPTION 'Renewal run % is not running', p_run_id USING ERRCODE = 'P0001';
    END IF;

    IF v_run.execution_source <> p_execution_source THEN
        RAISE EXCEPTION 'Renewal run execution source mismatch' USING ERRCODE = '42501';
    END IF;

    BEGIN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('chama_live_subscription:' || p_subscription_id::text, 0)
        );

        SELECT * INTO v_subscription
        FROM public.group_subscriptions
        WHERE id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'SUBSCRIPTION_MISSING',
                format('Subscription %s does not exist', p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_subscription.status <> 'active' THEN
            RAISE EXCEPTION 'Subscription % is not active', p_subscription_id USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_expected
        FROM public.subscription_cycles
        WHERE id = p_expected_cycle_id
          AND subscription_id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'EXPECTED_CYCLE_MISSING',
                format('Expected cycle %s does not exist for subscription %s',
                       p_expected_cycle_id, p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        SELECT * INTO v_previous
        FROM public.subscription_cycles
        WHERE subscription_id = p_subscription_id
        ORDER BY cycle_number DESC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'NO_LATEST_CYCLE',
                format('Subscription %s has no latest cycle', p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_previous.id <> p_expected_cycle_id THEN
            SELECT i.id INTO v_invoice_id
            FROM public.subscription_invoices i
            WHERE i.subscription_id = p_subscription_id
              AND i.cycle_id = v_previous.id
            ORDER BY i.id
            LIMIT 1;

            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'already_renewed',
                v_expected.cycle_number, v_previous.cycle_number,
                v_invoice_id, p_idempotency_key
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_previous.ends_at > now() THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'not_due',
                v_previous.cycle_number, NULL, NULL, p_idempotency_key
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        v_new_cycle_id := private.create_next_subscription_cycle(p_subscription_id);

        SELECT * INTO v_new_cycle
        FROM public.subscription_cycles
        WHERE id = v_new_cycle_id
          AND subscription_id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cycle creation returned a missing cycle' USING ERRCODE = 'P0001';
        END IF;

        IF v_new_cycle.cycle_number <> v_previous.cycle_number + 1 THEN
            RAISE EXCEPTION 'Unexpected cycle number created: %, expected %',
                v_new_cycle.cycle_number, v_previous.cycle_number + 1 USING ERRCODE = 'P0001';
        END IF;

        IF v_new_cycle.starts_at <> v_previous.ends_at THEN
            RAISE EXCEPTION 'New cycle does not begin at previous cycle end' USING ERRCODE = 'P0001';
        END IF;

        v_invoice_id := private.create_subscription_invoice_authority(v_new_cycle.id);

        INSERT INTO private.renewal_attempts(
            run_id, subscription_id, execution_source, result,
            cycle_before, cycle_after, invoice_id, idempotency_key
        ) VALUES (
            p_run_id, p_subscription_id, p_execution_source, 'renewed',
            v_previous.cycle_number, v_new_cycle.cycle_number,
            v_invoice_id, p_idempotency_key
        )
        RETURNING * INTO v_attempt;

    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_error_code = RETURNED_SQLSTATE,
            v_error_message = MESSAGE_TEXT;

        IF v_previous.cycle_number IS NULL THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, v_error_code, v_error_message
            )
            RETURNING * INTO v_attempt;
        ELSE
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'failed',
                v_previous.cycle_number, NULL, NULL, p_idempotency_key,
                v_error_code, v_error_message
            )
            RETURNING * INTO v_attempt;
        END IF;
    END;

    RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
        v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
        v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
END;
$function$


CREATE OR REPLACE FUNCTION public.activate_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; r record; v_count int:=0; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'activate_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='activate_initiative';
    RETURN v_existing;
  END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Initiative is not draft'; END IF;
  IF current_date > v_i.closing_date THEN RAISE EXCEPTION 'Cannot activate after closing date'; END IF;

  FOR r IN SELECT im.*,m.group_id AS member_group FROM public.contribution_initiative_members im JOIN public.members m ON m.id=im.member_id WHERE im.initiative_id=p_initiative_id ORDER BY im.member_id FOR UPDATE OF m LOOP
    IF r.member_group IS DISTINCT FROM v_i.group_id THEN RAISE EXCEPTION 'Participant group mismatch'; END IF;
    INSERT INTO public.contribution_initiative_obligations(initiative_id,initiative_member_id,member_id,amount_due,due_date)
    VALUES(v_i.id,r.id,r.member_id,r.amount,v_i.closing_date)
    ON CONFLICT(initiative_id,member_id) WHERE initiative_period_id IS NULL DO NOTHING;
    v_count:=v_count+1;
  END LOOP;

  UPDATE public.contribution_initiatives SET status='active',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','active','initiative_id',v_i.id,'obligations_created',v_count);
  UPDATE private.contribution_initiative_requests
  SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='activate_initiative';
  RETURN v_existing;
END;
$function$



CREATE OR REPLACE FUNCTION public.activate_custom_contribution(p_group_id uuid, p_period_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid(); v_actor_member_id uuid;
  v_period public.contribution_periods%rowtype; v_obligation_count integer := 0;
  v_result jsonb; v_payload jsonb; v_hash text; v_existing_hash text; v_existing_result jsonb;
begin
  if v_auth_user_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_group_id is null or p_period_id is null or p_request_id is null then raise exception 'GROUP_PERIOD_AND_REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if not exists (select 1 from public.groups g where g.id=p_group_id and g.owner_user_id=v_auth_user_id)
     and not public.cl_user_has_role(p_group_id,array['chairperson']::text[]) then
    raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select m.id into v_actor_member_id from public.members m
  where m.group_id=p_group_id and (m.user_id=v_auth_user_id or m.auth_user_id=v_auth_user_id)
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.id limit 1;
  if v_actor_member_id is null then raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501'; end if;
  select * into v_period from public.contribution_periods where id=p_period_id and group_id=p_group_id for update;
  if not found then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023'; end if;
  if v_period.contribution_type_id is null then raise exception 'CUSTOM_CONTRIBUTION_TYPE_REQUIRED' using errcode='22023'; end if;
  if v_period.status not in ('draft','open') then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_ACTIVATABLE' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('group_id',p_group_id,'period_id',p_period_id,'contribution_type_id',v_period.contribution_type_id);
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('chama-live:custom-contribution-request:'||p_request_id::text||':activate',0));
  select r.payload_hash,r.result into v_existing_hash,v_existing_result from private.custom_contribution_activation_requests r where r.request_id=p_request_id for update;
  if v_existing_hash is not null then
    if v_existing_hash<>v_hash then raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023'; end if;
    if v_existing_result is null then raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000'; end if;
    return jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
  end if;
  insert into private.custom_contribution_activation_requests(request_id,group_id,contribution_type_id,period_id,payload_hash)
  values(p_request_id,p_group_id,v_period.contribution_type_id,v_period.id,v_hash);
  perform public.cl_2b_accounting_lock_range(p_group_id,date_trunc('month',v_period.opening_date)::date,date_trunc('month',v_period.closing_date)::date);
  insert into public.member_contribution_rules(group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,first_period_rule,status,created_by)
  select m.group_id,m.id,v_period.contribution_type_id,v_period.amount,v_period.frequency,v_period.opening_date,v_period.closing_date,'full_period','active',v_actor_member_id
  from public.members m
  where m.group_id=p_group_id and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
    and not exists(select 1 from public.member_contribution_rules r where r.group_id=m.group_id and r.member_id=m.id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date);
  insert into public.contribution_obligations(group_id,member_id,contribution_type_id,obligation_month,due_amount,period_id)
  select r.group_id,r.member_id,r.contribution_type_id,date_trunc('month',v_period.due_date)::date,r.amount,v_period.id
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date and r.status='active'
    and not exists(select 1 from public.contribution_obligations o where o.group_id=r.group_id and o.member_id=r.member_id and o.contribution_type_id=r.contribution_type_id and o.obligation_month=date_trunc('month',v_period.due_date)::date and o.component_kind='PARENT');
  get diagnostics v_obligation_count=row_count;
  update public.contribution_periods set status='open' where id=v_period.id and group_id=p_group_id;
  v_result:=jsonb_build_object('ok',true,'operation','activate','replayed',false,'contribution_type_id',v_period.contribution_type_id,'period_id',v_period.id,'status','open','ongoing',true,'obligations_created',v_obligation_count);
  update private.custom_contribution_activation_requests set result=v_result,completed_at=now() where request_id=p_request_id;
  return v_result;
end;$function$


CREATE OR REPLACE FUNCTION public.activate_member_account(p_member_number text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_member public.members;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select * into v_member from public.members where member_number=trim(p_member_number) and onboarding_status='pending' limit 1;
 if v_member.id is null then raise exception 'Pending member account not found'; end if;
 if v_member.email is not null and exists(select 1 from auth.users where id=v_uid and lower(email)<>lower(v_member.email)) then raise exception 'This login email does not match the invited member email'; end if;
 update public.members set user_id=v_uid,auth_user_id=v_uid,onboarding_status='active',activated_at=now() where id=v_member.id returning * into v_member;
 return v_member;
end; $function$


CREATE OR REPLACE FUNCTION public.activate_other_contribution_cycle(p_cycle_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_cycle public.contribution_periods%ROWTYPE;
  v_request private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_expected_count bigint; v_actual_count bigint;
  v_collision_count bigint; v_missing_count bigint; v_extra_count bigint;
  v_existing_activation boolean; v_existing_generation boolean; v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_cycle_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Cycle id and request id are required';
  END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'activate');
  v_payload_hash:=md5(jsonb_build_object('cycle_id',p_cycle_id)::text);
  SELECT * INTO v_request FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='activate';
  IF FOUND THEN
    IF v_request.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Activation request was previously used for another payload';
    END IF;
    IF v_request.completed_at IS NOT NULL AND v_request.result IS NOT NULL THEN
      RETURN v_request.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
  PERFORM private.cl_other_cycle_authorize(v_cycle.group_id);
  PERFORM private.cl_other_cycle_lock(v_cycle.group_id,v_cycle.contribution_type_id);
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id FOR UPDATE;
  PERFORM private.cl_other_assert_type(v_cycle.group_id,v_cycle.contribution_type_id);
  IF v_cycle.name IS NULL OR btrim(v_cycle.name)='' THEN RAISE EXCEPTION 'Cycle name required at activation'; END IF;
  IF v_cycle.amount IS NULL OR v_cycle.amount<=0 THEN RAISE EXCEPTION 'Cycle amount invalid at activation'; END IF;
  IF v_cycle.frequency NOT IN ('monthly','one_time') THEN RAISE EXCEPTION 'Cycle frequency invalid at activation'; END IF;
  IF v_cycle.period_key IS NULL OR btrim(v_cycle.period_key)='' OR length(btrim(v_cycle.period_key))>100 THEN
    RAISE EXCEPTION 'Cycle period key invalid at activation';
  END IF;
  IF v_cycle.opening_date IS NULL OR v_cycle.due_date IS NULL OR v_cycle.closing_date IS NULL
     OR v_cycle.opening_date>v_cycle.due_date OR v_cycle.due_date>v_cycle.closing_date THEN
    RAISE EXCEPTION 'Cycle dates invalid at activation';
  END IF;
  PERFORM private.cl_other_assert_fine_rule(
    v_cycle.group_id,v_cycle.contribution_type_id,v_cycle.fine_rule_id,
    v_cycle.opening_date,v_cycle.closing_date);

  IF v_cycle.status<>'draft' THEN
    IF v_cycle.status='cancelled' THEN RAISE EXCEPTION 'Cancelled cycle cannot be activated'; END IF;
    IF v_cycle.status NOT IN ('open','due','grace','closed') THEN
      RAISE EXCEPTION 'Cycle status % is not an activation state',v_cycle.status;
    END IF;
    SELECT EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_ACTIVATED'),
           EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED')
      INTO v_existing_activation,v_existing_generation;
    SELECT a.details->'eligible_member_ids' INTO v_snapshot
    FROM private.other_contribution_cycle_audit a
    WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED'
    ORDER BY a.created_at LIMIT 1;
    SELECT count(*) INTO v_expected_count
    FROM jsonb_array_elements_text(coalesce(v_snapshot,'[]'::jsonb));
    SELECT count(*) INTO v_actual_count
    FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;
    IF NOT v_existing_activation OR NOT v_existing_generation OR v_snapshot IS NULL
       OR v_expected_count<>v_actual_count THEN
      RAISE EXCEPTION 'Activated cycle % is not canonically complete',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM(
      SELECT o.member_id::text member_id FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
      EXCEPT SELECT jsonb_array_elements_text(v_snapshot)) s)
       OR EXISTS(SELECT 1 FROM(
      SELECT jsonb_array_elements_text(v_snapshot) member_id
      EXCEPT SELECT o.member_id::text FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    ) s) THEN
      RAISE EXCEPTION 'Activated cycle % has a frozen eligibility/member-set mismatch',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM public.contribution_obligations o
              WHERE o.period_id=v_cycle.id
                AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                  OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                  OR o.component_kind IS DISTINCT FROM 'PARENT'
                  OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                  OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
      RAISE EXCEPTION 'Activated cycle contains invalid obligation identity';
    END IF;
    INSERT INTO private.other_contribution_cycle_requests(
      request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
    VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
           jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true),now())
    ON CONFLICT(request_id,operation) DO UPDATE
      SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
          payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
          completed_at=EXCLUDED.completed_at;
    RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true);
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_periods cp
            WHERE cp.id<>v_cycle.id AND cp.group_id=v_cycle.group_id
              AND cp.contribution_type_id=v_cycle.contribution_type_id
              AND lower(cp.status) IN ('scheduled','open','due','grace')
              AND cp.opening_date<=v_cycle.closing_date AND cp.closing_date>=v_cycle.opening_date) THEN
    RAISE EXCEPTION 'Another active/scheduled Other cycle overlaps this cycle';
  END IF;

  PERFORM 1 FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
  ORDER BY m.id FOR UPDATE;

  SELECT count(*) INTO v_expected_count FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date;

  SELECT count(*) INTO v_collision_count FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id;
  IF v_collision_count>v_expected_count THEN
    RAISE EXCEPTION 'Cycle has more obligations than eligible members';
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_obligations o
            WHERE o.period_id=v_cycle.id
              AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                OR o.component_kind IS DISTINCT FROM 'PARENT'
                OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
    RAISE EXCEPTION 'Cycle contains unexpected obligation identity';
  END IF;

  INSERT INTO public.contribution_obligations(
    group_id,member_id,obligation_month,due_amount,contribution_type_id,rule_id,
    period_id,component_kind,lifecycle_state,parent_obligation_id)
  SELECT v_cycle.group_id,m.id,date_trunc('month',v_cycle.opening_date)::date,v_cycle.amount,
         v_cycle.contribution_type_id,NULL,v_cycle.id,'PARENT','ACTIVE',NULL
  FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
    AND NOT EXISTS(SELECT 1 FROM public.contribution_obligations o
                   WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
                     AND o.member_id=m.id AND o.contribution_type_id=v_cycle.contribution_type_id
                     AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL
                     AND o.rule_id IS NULL);

  PERFORM 1 FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id AND o.group_id=v_cycle.group_id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
  ORDER BY o.member_id,o.id FOR UPDATE;

  SELECT count(*) INTO v_actual_count FROM public.contribution_obligations o
  WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;

  SELECT count(*) INTO v_missing_count FROM(
    SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date
    EXCEPT SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL) s;
  SELECT count(*) INTO v_extra_count FROM(
    SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    EXCEPT SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date) s;
  IF v_expected_count<>v_actual_count OR v_missing_count<>0 OR v_extra_count<>0 THEN
    RAISE EXCEPTION 'Other cycle conservation failed: expected %, actual %, missing %, extra %',
      v_expected_count,v_actual_count,v_missing_count,v_extra_count;
  END IF;

  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_OBLIGATIONS_GENERATED',v_actor,p_request_id,'activate',
         jsonb_build_object('expected_members',v_expected_count,'created_parents',v_actual_count,
                            'missing_members',v_missing_count,'extra_members',v_extra_count,
                            'eligible_member_ids',(
                              SELECT coalesce(jsonb_agg(m.id ORDER BY m.id),'[]'::jsonb)
                              FROM public.members m
                              WHERE m.group_id=v_cycle.group_id
                                AND lower(coalesce(m.status,''))='active'
                                AND lower(coalesce(m.onboarding_status,''))='active'
                                AND m.join_date<=v_cycle.opening_date)));

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_ACTIVATED',v_actor,p_request_id,'activate',
         jsonb_build_object('previous_status',v_cycle.status,'new_status','open',
                            'expected_members',v_expected_count,'created_parents',v_actual_count));

  UPDATE public.contribution_periods SET status='open'
  WHERE id=v_cycle.id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle could not transition draft to open'; END IF;

  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false);
END $function$


CREATE OR REPLACE FUNCTION public.activate_recurring_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives; v_count integer; v_existing jsonb; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'activate_recurring_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='activate_recurring_initiative' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    RETURN v_request || jsonb_build_object('idempotent',true);
  END IF;
  IF v_i.frequency <> 'monthly' THEN RAISE EXCEPTION 'Initiative is not monthly'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Initiative is not draft'; END IF;
  IF current_date > v_i.closing_date THEN RAISE EXCEPTION 'Initiative closing date has passed'; END IF;
  SELECT count(*) INTO v_count FROM public.contribution_initiative_members im
  WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active';
  IF v_count=0 THEN RAISE EXCEPTION 'Recurring initiative requires at least one active participant'; END IF;
  IF EXISTS (SELECT 1 FROM public.contribution_initiative_members im
    WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active'
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_member_terms t
        WHERE t.initiative_member_id=im.id
          AND t.effective_from <= (date_trunc('month',v_i.start_date)::date + CASE WHEN v_i.start_date > date_trunc('month',v_i.start_date)::date THEN interval '1 month' ELSE interval '0 month' END)
          AND t.status='active'))
  THEN RAISE EXCEPTION 'Every active recurring participant requires an effective term'; END IF;
  UPDATE public.contribution_initiatives SET status='active',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','active','initiative_id',v_i.id,'participant_count',v_count);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='activate_recurring_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id uuid, p_name text, p_member_number text DEFAULT NULL::text, p_membership_number text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text, p_join_date date DEFAULT CURRENT_DATE)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_member public.members;
  v_role text;
  v_member_number text;
  v_membership_number text;
  v_next_number integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(m.role)
    INTO v_role
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = (SELECT auth.uid()) OR m.auth_user_id = (SELECT auth.uid()))
    AND lower(coalesce(m.status,'active')) = 'active'
    AND lower(coalesce(m.onboarding_status,'active')) = 'active'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin','chairperson') THEN
    RAISE EXCEPTION 'Only a group admin or chairperson can add members';
  END IF;

  IF nullif(trim(p_name),'') IS NULL THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;

  IF nullif(trim(p_phone),'') IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  IF lower(coalesce(p_role,'member')) NOT IN ('member','secretary','treasurer','chairperson','admin') THEN
    RAISE EXCEPTION 'Invalid member role';
  END IF;

  -- Generate the next 4-digit member number when the frontend does not supply one.
  IF nullif(trim(p_member_number),'') IS NULL THEN
    SELECT coalesce(max(NULLIF(regexp_replace(m.member_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
      INTO v_next_number
    FROM public.members m
    WHERE m.group_id = p_group_id;

    v_member_number := lpad(v_next_number::text, 4, '0');
  ELSE
    v_member_number := trim(p_member_number);
  END IF;

  -- Keep membership_number synchronized with member_number when omitted.
  v_membership_number := coalesce(nullif(trim(p_membership_number), ''), v_member_number);

  IF EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (
        m.member_number = v_member_number
        OR m.membership_number = v_membership_number
      )
  ) THEN
    RAISE EXCEPTION 'Member number or membership number already exists in this group';
  END IF;

  INSERT INTO public.members (
    group_id,
    member_number,
    membership_number,
    name,
    phone,
    email,
    role,
    join_date,
    status,
    onboarding_status,
    invited_at
  )
  VALUES (
    p_group_id,
    v_member_number,
    v_membership_number,
    trim(p_name),
    trim(p_phone),
    nullif(trim(p_email),''),
    lower(coalesce(p_role,'member')),
    coalesce(p_join_date,current_date),
    'active',
    'pending',
    now()
  )
  RETURNING * INTO v_member;

  PERFORM private.append_platform_activity(
      'member_created',
      jsonb_build_object(
          'group_id', v_member.group_id,
          'member_id', v_member.id,
          'member_role', v_member.role
      )
  );

  RETURN v_member;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_subscription public.group_subscriptions%ROWTYPE;
    v_latest_cycle public.subscription_cycles%ROWTYPE;
    v_current_cycle public.subscription_cycles%ROWTYPE;
    v_run_id uuid;
    v_attempt record;
    v_key text;
    v_return_cycle_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || p_subscription_id::text, 0)
    );

    SELECT * INTO v_subscription
    FROM public.group_subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % does not exist', p_subscription_id USING ERRCODE = 'P0002';
    END IF;

    IF v_subscription.status <> 'active' THEN
        RAISE EXCEPTION 'Subscription % is not active', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_latest_cycle
    FROM public.subscription_cycles
    WHERE subscription_id = p_subscription_id
    ORDER BY cycle_number DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % has no existing cycle', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    v_key := 'human:' || p_subscription_id::text || ':' || v_latest_cycle.id::text;

    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs rr
    WHERE rr.idempotency_key = v_key;

    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs(execution_source, idempotency_key)
        VALUES ('human', v_key)
        RETURNING run_id INTO v_run_id;
    END IF;

    SELECT * INTO v_attempt
    FROM private.renew_subscription_authority(
        p_subscription_id,
        v_latest_cycle.id,
        v_run_id,
        v_key,
        'human'
    );

    UPDATE private.renewal_runs
    SET status = 'completed',
        completed_at = now(),
        error_code = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_code ELSE NULL END,
        error_message = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_message ELSE NULL END
    WHERE run_id = v_run_id
      AND status = 'running';

    IF v_attempt.result IN ('renewed','already_renewed') THEN
        SELECT id INTO v_return_cycle_id
        FROM public.subscription_cycles
        WHERE subscription_id = p_subscription_id
          AND cycle_number = v_attempt.cycle_after
        LIMIT 1;

        IF v_return_cycle_id IS NULL THEN
            RAISE EXCEPTION 'Renewal result did not resolve a cycle id' USING ERRCODE = 'P0001';
        END IF;

        IF v_attempt.result = 'renewed' THEN
            PERFORM private.append_platform_activity(
                'subscription_renewed',
                jsonb_build_object(
                    'subscription_id', p_subscription_id,
                    'cycle_id', v_return_cycle_id
                )
            );
        END IF;

        RETURN v_return_cycle_id;
    END IF;

    IF v_attempt.result = 'not_due' THEN
        RAISE EXCEPTION 'Subscription cycle % has not ended', v_latest_cycle.cycle_number USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'Subscription renewal failed or was anomalous: %',
        coalesce(v_attempt.error_message, 'unknown renewal result') USING ERRCODE = 'P0001';
END;
$function$


CREATE OR REPLACE FUNCTION public.approve_group_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    a public.group_applications%ROWTYPE;
    v_group_id uuid;
    v_member_id uuid;
    v_member_number text;
    v_access_code text;
    v_subscription_id uuid;
    v_cycle_id uuid;
    v_activated_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator access required'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO a
    FROM public.group_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
    IF a.status = 'approved' THEN RAISE EXCEPTION 'Application is already approved'; END IF;
    IF a.status = 'rejected' THEN RAISE EXCEPTION 'Rejected applications cannot be approved'; END IF;

    IF nullif(btrim(coalesce(a.location, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application location is required';
    END IF;

    IF nullif(btrim(coalesce(a.town, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application town is required';
    END IF;

    v_activated_at := now();
    v_access_code := public.generate_group_access_code(a.group_name);

    INSERT INTO public.groups (
        name, category, monthly_contribution, opening_balance, description,
        country, location, town, access_code, phone, email, owner_user_id
    )
    VALUES (
        a.group_name, coalesce(a.category, 'other'), 0, 0, a.description,
        coalesce(a.country, 'Kenya'), btrim(a.location), btrim(a.town),
        v_access_code, a.admin_phone, a.email, a.auth_user_id
    )
    RETURNING id INTO v_group_id;

    SELECT lpad(
        (coalesce(max(nullif(membership_number, '')::integer), 0) + 1)::text,
        4, '0'
    )
    INTO v_member_number
    FROM public.members
    WHERE group_id = v_group_id;

    INSERT INTO public.members (
        group_id, user_id, auth_user_id, member_number, membership_number,
        name, phone, email, role, status, onboarding_status, invited_at, activated_at
    )
    VALUES (
        v_group_id, a.auth_user_id, a.auth_user_id, v_member_number,
        v_member_number, a.admin_name, a.admin_phone, a.email, 'admin',
        'active', 'active', v_activated_at, v_activated_at
    )
    RETURNING id INTO v_member_id;

    INSERT INTO public.contribution_types (group_id, name, code, created_by)
    SELECT v_group_id, 'Monthly', 'monthly', v_member_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.contribution_types ct
        WHERE ct.group_id = v_group_id
          AND (
              lower(trim(ct.name)) = 'monthly'
              OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
          )
    );

    INSERT INTO public.financial_periods (group_id, month, opening_balance, status)
    VALUES (v_group_id, to_char(v_activated_at::date, 'YYYY-MM'), 0, 'open');

    v_subscription_id := private.initialize_group_subscription(v_group_id, v_activated_at);
    v_cycle_id := private.create_next_subscription_cycle(v_subscription_id);
    PERFORM public.create_subscription_invoice(v_cycle_id);

    IF NOT EXISTS (
        SELECT 1 FROM public.subscription_cycles sc
        WHERE sc.id = v_cycle_id
          AND sc.subscription_id = v_subscription_id
          AND sc.cycle_number = 1
    ) THEN
        RAISE EXCEPTION 'Subscription initialization failed to create Cycle 1';
    END IF;

    UPDATE public.group_applications
    SET status = 'approved',
        reviewed_at = v_activated_at,
        reviewed_by = auth.uid(),
        updated_at = v_activated_at,
        approved_group_id = v_group_id,
        approved_member_id = v_member_id,
        approved_member_number = v_member_number,
        access_code = v_access_code
    WHERE id = p_application_id;

    PERFORM private.append_platform_activity(
        'group_application_reviewed',
        jsonb_build_object('application_id', a.id, 'group_name', a.group_name)
    );

    PERFORM private.append_platform_activity(
        'group_approved',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'group_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'member_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'member_id', v_member_id, 'member_role', 'admin'
        )
    );

    RETURN jsonb_build_object(
        'success', true, 'application_id', a.id, 'group_id', v_group_id,
        'member_id', v_member_id, 'member_number', v_member_number,
        'access_code', v_access_code, 'role', 'admin', 'email', a.email,
        'admin_name', a.admin_name, 'group_name', a.group_name
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.can_add_group_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.current_user_role(p_group_id) IN ('admin', 'chairperson', 'treasurer'),
    false
  );
$function$


CREATE OR REPLACE FUNCTION public.can_manage_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_user_role(p_group_id) in ('admin','chairperson'), false);
$function$


CREATE OR REPLACE FUNCTION public.charge_payments_guard_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    RETURN NEW;
END;
$function$



CREATE OR REPLACE FUNCTION public.check_application_status(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_group_name text;
  v_member_email text;
  v_onboarding_status text;
  v_member_status text;
  v_application_status text;
BEGIN
  v_email := lower(trim(coalesce(p_email, '')));

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Please enter the registered administrator email address.'
    );
  END IF;

  /*
     Only the registered group administrator is eligible.
     Do not return internal IDs or any other member/group data.
  */
  SELECT
    g.name,
    m.email,
    lower(trim(coalesce(m.onboarding_status, ''))),
    lower(trim(coalesce(m.status, '')))
  INTO
    v_group_name,
    v_member_email,
    v_onboarding_status,
    v_member_status
  FROM public.members AS m
  INNER JOIN public.groups AS g
    ON g.id = m.group_id
  WHERE lower(trim(coalesce(m.email, ''))) = v_email
    AND lower(trim(coalesce(m.role, ''))) IN (
      'admin',
      'administrator',
      'group_admin',
      'group administrator',
      'chairperson'
    )
  ORDER BY m.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_group_name IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No registered group administrator application was found for this email address.'
    );
  END IF;

  /*
     Normalize the database states into the four statuses
     exposed by the Account Review page.
  */
  IF v_member_status = 'suspended' THEN
    v_application_status := 'suspended';

  ELSIF v_member_status = 'rejected'
     OR v_onboarding_status = 'rejected' THEN
    v_application_status := 'rejected';

  ELSIF v_onboarding_status IN ('approved', 'active')
     OR v_member_status = 'active' THEN
    v_application_status := 'active';

  ELSE
    v_application_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'group_name', v_group_name,
    'masked_email',
      CASE
        WHEN position('@' IN v_member_email) > 1 THEN
          left(split_part(v_member_email, '@', 1), 1)
          || repeat('*', greatest(length(split_part(v_member_email, '@', 1)) - 1, 1))
          || '@'
          || split_part(v_member_email, '@', 2)
        ELSE
          '***'
      END,
    'onboarding_status',
      CASE
        WHEN v_onboarding_status = '' THEN NULL
        ELSE v_onboarding_status
      END,
    'application_status', v_application_status
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_accounting_lock(p_group_id uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Group and month YYYY-MM are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:accounting:' || p_group_id::text || ':' || p_month,
      0
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_accounting_lock_range(p_group_id uuid, p_start_month date, p_end_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date;
BEGIN
  IF p_group_id IS NULL
     OR p_start_month IS NULL
     OR p_end_month IS NULL
     OR date_trunc('month',p_start_month)::date > date_trunc('month',p_end_month)::date
  THEN
    RAISE EXCEPTION 'Valid accounting month range is required';
  END IF;

  FOR v_month IN
    SELECT gs::date
    FROM pg_catalog.generate_series(
      date_trunc('month',p_start_month)::date,
      date_trunc('month',p_end_month)::date,
      interval '1 month'
    ) AS gs
    ORDER BY gs
  LOOP
    PERFORM public.cl_2b_accounting_lock(
      p_group_id,
      to_char(v_month,'YYYY-MM')
    );
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_decompose_obligation(p_parent_obligation_id uuid)
 RETURNS TABLE(parent_obligation_id uuid, residual_obligation_id uuid, status text, original_due_amount numeric, historical_allocated numeric, residual_due_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_parent record;
  v_member record;
  v_residual record;
  v_group_id uuid;
  v_member_id uuid;
  v_residual_obligation_id uuid;
  v_caller_rows integer := 0;
  v_has_active boolean := false;
  v_has_onboarded boolean := false;
  v_has_treasurer boolean := false;
  v_self_target boolean := false;
  v_historical_allocated numeric := 0;
  v_outstanding numeric := 0;
  v_residual_count integer := 0;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF p_parent_obligation_id IS NULL THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT o.id,o.group_id,o.member_id,o.contribution_type_id,o.rule_id,
         o.obligation_month,o.due_amount,o.period_id,o.component_kind,
         o.lifecycle_state,o.parent_obligation_id
  INTO v_parent
  FROM public.contribution_obligations o
  WHERE o.id = p_parent_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_group_id := v_parent.group_id;
  v_member_id := v_parent.member_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || v_member_id::text,0
    )
  );

  SELECT o.id,o.group_id,o.member_id,o.contribution_type_id,o.rule_id,
         o.obligation_month,o.due_amount,o.period_id,o.component_kind,
         o.lifecycle_state,o.parent_obligation_id
  INTO v_parent
  FROM public.contribution_obligations o
  WHERE o.id = p_parent_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_member IN
    SELECT m.id,m.user_id,m.auth_user_id,m.role,m.status,m.onboarding_status
    FROM public.members m
    WHERE m.group_id = v_parent.group_id
      AND (m.user_id = v_caller_uid OR m.auth_user_id = v_caller_uid)
    ORDER BY m.id
    FOR UPDATE
  LOOP
    v_caller_rows := v_caller_rows + 1;

    IF v_member.id = v_parent.member_id THEN
      v_self_target := true;
    END IF;

    IF lower(coalesce(v_member.status,'active')) = 'active' THEN
      v_has_active := true;
    END IF;

    IF lower(coalesce(v_member.onboarding_status,'active')) = 'active' THEN
      v_has_onboarded := true;
    END IF;

    IF lower(coalesce(v_member.status,'active')) = 'active'
       AND lower(coalesce(v_member.onboarding_status,'active')) = 'active'
       AND lower(coalesce(v_member.role,'member')) = 'treasurer' THEN
      v_has_treasurer := true;
    END IF;
  END LOOP;

  IF v_caller_rows = 0 THEN
    RAISE EXCEPTION 'UNAUTHORIZED_GROUP' USING ERRCODE = '42501';
  END IF;

  IF v_self_target THEN
    RAISE EXCEPTION 'SELF_CONFIGURATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_active THEN
    RAISE EXCEPTION 'CALLER_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_onboarded THEN
    RAISE EXCEPTION 'CALLER_NOT_ONBOARDED' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_treasurer THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  IF v_parent.component_kind <> 'PARENT'
     OR v_parent.parent_obligation_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PARENT_COMPONENT' USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_residual_count
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_parent.lifecycle_state = 'DECOMPOSED' THEN
    IF v_residual_count <> 1 THEN
      RAISE EXCEPTION 'DECOMPOSED_PARENT_MISSING_RESIDUAL' USING ERRCODE = '23514';
    END IF;

    SELECT r.id,r.group_id,r.member_id,r.contribution_type_id,r.rule_id,
           r.obligation_month,r.due_amount,r.period_id,r.lifecycle_state
    INTO v_residual
    FROM public.contribution_obligations r
    WHERE r.parent_obligation_id = v_parent.id
      AND r.component_kind = 'RESIDUAL';

    IF v_residual.lifecycle_state <> 'ACTIVE'
       OR v_residual.group_id <> v_parent.group_id
       OR v_residual.member_id <> v_parent.member_id
       OR v_residual.contribution_type_id <> v_parent.contribution_type_id
       OR v_residual.obligation_month <> v_parent.obligation_month
       OR v_residual.period_id IS DISTINCT FROM v_parent.period_id THEN
      RAISE EXCEPTION 'INVALID_RESIDUAL_LINEAGE' USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(a.amount),0)::numeric
    INTO v_historical_allocated
    FROM public.contribution_allocations a
    WHERE a.obligation_id = v_parent.id;

    IF v_historical_allocated < 0
       OR v_historical_allocated > v_parent.due_amount
       OR v_historical_allocated + v_residual.due_amount <> v_parent.due_amount THEN
      RAISE EXCEPTION 'RESIDUAL_CONSERVATION_FAILURE' USING ERRCODE = '23514';
    END IF;

    RETURN QUERY
    SELECT v_parent.id,v_residual.id,'ALREADY_DECOMPOSED'::text,
           v_parent.due_amount,v_historical_allocated,v_residual.due_amount;
    RETURN;
  END IF;

  IF v_parent.lifecycle_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'INVALID_PARENT_LIFECYCLE' USING ERRCODE = '23514';
  END IF;

  IF v_residual_count <> 0 THEN
    RAISE EXCEPTION 'ACTIVE_PARENT_HAS_RESIDUAL' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(a.amount),0)::numeric
  INTO v_historical_allocated
  FROM public.contribution_allocations a
  WHERE a.obligation_id = v_parent.id;

  IF v_historical_allocated < 0
     OR v_historical_allocated > v_parent.due_amount THEN
    RAISE EXCEPTION 'PARENT_ALLOCATION_INVARIANT_FAILURE' USING ERRCODE = '23514';
  END IF;

  v_outstanding := v_parent.due_amount - v_historical_allocated;

  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'PARENT_HAS_NO_OUTSTANDING_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.contribution_obligations (
    group_id,member_id,obligation_month,due_amount,
    contribution_type_id,rule_id,period_id,
    component_kind,lifecycle_state,parent_obligation_id
  )
  VALUES (
    v_parent.group_id,v_parent.member_id,v_parent.obligation_month,v_outstanding,
    v_parent.contribution_type_id,v_parent.rule_id,v_parent.period_id,
    'RESIDUAL','ACTIVE',v_parent.id
  )
  RETURNING id INTO v_residual_obligation_id;

  UPDATE public.contribution_obligations
  SET lifecycle_state = 'DECOMPOSED'
  WHERE id = v_parent.id
    AND component_kind = 'PARENT'
    AND lifecycle_state = 'ACTIVE'
    AND parent_obligation_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_STATE_TRANSITION_FAILED' USING ERRCODE = '40001';
  END IF;

  SELECT count(*)
  INTO v_residual_count
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_residual_count <> 1 THEN
    RAISE EXCEPTION 'RESIDUAL_IDENTITY_FAILURE' USING ERRCODE = '23514';
  END IF;

  SELECT r.id,r.due_amount,r.group_id,r.member_id,r.contribution_type_id,
         r.obligation_month,r.period_id,r.lifecycle_state
  INTO v_residual
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_residual.lifecycle_state <> 'ACTIVE'
     OR v_residual.group_id <> v_parent.group_id
     OR v_residual.member_id <> v_parent.member_id
     OR v_residual.contribution_type_id <> v_parent.contribution_type_id
     OR v_residual.obligation_month <> v_parent.obligation_month
     OR v_residual.period_id IS DISTINCT FROM v_parent.period_id
     OR v_residual.due_amount <> v_outstanding THEN
    RAISE EXCEPTION 'INVALID_RESIDUAL_LINEAGE' USING ERRCODE = '23514';
  END IF;

  IF v_historical_allocated + v_residual.due_amount <> v_parent.due_amount THEN
    RAISE EXCEPTION 'RESIDUAL_CONSERVATION_FAILURE' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT v_parent.id,v_residual.id,'DECOMPOSED'::text,
         v_parent.due_amount,v_historical_allocated,v_residual.due_amount;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_record_contribution(p_group_id uuid, p_member_id uuid, p_amount numeric, p_contribution_type text, p_contribution_date date, p_payment_method text, p_reference text, p_notes text, p_goal_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_id uuid;
BEGIN
  IF p_idempotency_key IS NULL
     OR nullif(trim(p_idempotency_key),'') IS NULL
  THEN
    RAISE EXCEPTION 'Payment idempotency key is required';
  END IF;

  BEGIN
    v_payment_id := trim(p_idempotency_key)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'Payment idempotency key must be a valid UUID';
  END;

  RETURN public.cl_2b_record_contribution(
    p_payment_id=>v_payment_id,
    p_group_id=>p_group_id,
    p_member_id=>p_member_id,
    p_amount=>p_amount,
    p_contribution_date=>p_contribution_date,
    p_contribution_type=>p_contribution_type,
    p_payment_method=>p_payment_method,
    p_reference=>p_reference,
    p_mpesa_reference=>NULL,
    p_goal_id=>p_goal_id,
    p_notes=>p_notes
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_record_contribution(p_payment_id uuid, p_group_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_contribution_type text DEFAULT 'monthly'::text, p_payment_method text DEFAULT 'M-Pesa'::text, p_reference text DEFAULT NULL::text, p_mpesa_reference text DEFAULT NULL::text, p_goal_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_month text;
  v_payment_month_date date;
  v_rebuild_start date;
  v_rebuild_horizon date;
  v_existing public.contributions%rowtype;
  v_period public.financial_periods%rowtype;
  v_reference text;
  v_mpesa_reference text;
  v_input_reference text;
  v_input_mpesa_reference text;
  v_existing_reference text;
  v_existing_mpesa_reference text;
  v_existing_effective_mpesa_reference text;
  v_initial_lock_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment idempotency key is required';
  END IF;

  IF p_group_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'Group and member are required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Contribution amount must be greater than zero';
  END IF;

  IF p_contribution_date IS NULL THEN
    RAISE EXCEPTION 'Contribution date is required';
  END IF;

  IF lower(trim(coalesce(p_contribution_type,''))) <> 'monthly' THEN
    RAISE EXCEPTION '2B only supports monthly contributions';
  END IF;

  IF p_payment_method IS NULL
     OR p_payment_method NOT IN ('M-Pesa','Cash','Bank transfer')
  THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Finance authorization required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id=p_member_id
      AND m.group_id=p_group_id
  ) THEN
    RAISE EXCEPTION 'Member does not belong to the supplied group';
  END IF;

  v_payment_month:=to_char(p_contribution_date,'YYYY-MM');
  v_payment_month_date:=date_trunc('month',p_contribution_date)::date;

  -- cl_2b_refresh_member rewrites all allocations for the member through
  -- its supplied horizon. Determine the safe horizon before locking, then
  -- lock the entire member allocation span before any status decision.
  SELECT greatest(
    p_contribution_date,
    coalesce(
      (
        SELECT max(c.contribution_date)
        FROM public.contributions c
        WHERE c.member_id=p_member_id
          AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
      ),
      p_contribution_date
    ),
    coalesce(
      (
        SELECT max(o.obligation_month)
        FROM public.contribution_obligations o
        WHERE o.member_id=p_member_id
      ),
      p_contribution_date
    )
  )
  INTO v_rebuild_horizon;

  SELECT date_trunc('month',m.join_date)::date
  INTO v_rebuild_start
  FROM public.members m
  WHERE m.id=p_member_id
    AND m.group_id=p_group_id;

  v_rebuild_start:=least(
    coalesce(v_rebuild_start,v_payment_month_date),
    v_payment_month_date
  );

  v_initial_lock_end:=date_trunc('month',v_rebuild_horizon)::date;

  PERFORM public.cl_2b_accounting_lock_range(
    p_group_id,
    v_rebuild_start,
    v_initial_lock_end
  );

  -- Re-read the horizon after acquiring the initial lock envelope.
  -- A concurrent writer may have committed a later payment/obligation
  -- while this transaction was waiting for the shared accounting locks.
  -- Extend only forward, preserving deterministic ascending lock order,
  -- before refresh can delete/rebuild the member's allocations.
  SELECT greatest(
    p_contribution_date,
    coalesce(
      (
        SELECT max(c.contribution_date)
        FROM public.contributions c
        WHERE c.member_id=p_member_id
          AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
      ),
      p_contribution_date
    ),
    coalesce(
      (
        SELECT max(o.obligation_month)
        FROM public.contribution_obligations o
        WHERE o.member_id=p_member_id
      ),
      p_contribution_date
    )
  )
  INTO v_rebuild_horizon;

  IF date_trunc('month',v_rebuild_horizon)::date > v_initial_lock_end THEN
    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      (v_initial_lock_end + interval '1 month')::date,
      date_trunc('month',v_rebuild_horizon)::date
    );
  END IF;

  v_period:=public.ensure_financial_period(
    p_group_id,v_payment_month
  );

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION
      'Unable to establish financial period for %',
      v_payment_month;
  END IF;

  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      v_payment_month;
  END IF;

  v_input_reference:=nullif(trim(p_reference),'');
  v_input_mpesa_reference:=nullif(trim(p_mpesa_reference),'');

  IF p_payment_method='M-Pesa' THEN
    IF v_input_reference IS NOT NULL
       AND v_input_mpesa_reference IS NOT NULL
       AND v_input_reference IS DISTINCT FROM v_input_mpesa_reference
    THEN
      RAISE EXCEPTION 'M-Pesa reference fields do not match';
    END IF;

    v_mpesa_reference:=coalesce(
      v_input_mpesa_reference,v_input_reference
    );
    v_reference:=v_mpesa_reference;
  ELSE
    IF v_input_mpesa_reference IS NOT NULL THEN
      RAISE EXCEPTION
        'M-Pesa reference is only valid for M-Pesa payments';
    END IF;

    v_mpesa_reference:=NULL;
    v_reference:=v_input_reference;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' ||
      p_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  SELECT c.*
  INTO v_existing
  FROM public.contributions c
  WHERE c.id=p_payment_id
  FOR UPDATE;

  IF FOUND THEN
    v_existing_reference:=nullif(trim(v_existing.reference),'');
    v_existing_mpesa_reference:=
      nullif(trim(v_existing.mpesa_reference),'');

    IF p_payment_method='M-Pesa' THEN
      IF v_existing_reference IS NOT NULL
         AND v_existing_mpesa_reference IS NOT NULL
         AND v_existing_reference IS DISTINCT FROM
             v_existing_mpesa_reference
      THEN
        RAISE EXCEPTION
          'Existing M-Pesa payment contains conflicting reference fields';
      END IF;

      v_existing_effective_mpesa_reference:=coalesce(
        v_existing_mpesa_reference,v_existing_reference
      );

      IF v_existing.group_id IS DISTINCT FROM p_group_id
         OR v_existing.member_id IS DISTINCT FROM p_member_id
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.contribution_date IS DISTINCT FROM
             p_contribution_date
         OR lower(trim(coalesce(v_existing.contribution_type,'')))
              IS DISTINCT FROM lower(trim(p_contribution_type))
         OR v_existing.payment_method IS DISTINCT FROM p_payment_method
         OR v_existing_effective_mpesa_reference IS DISTINCT FROM
             v_mpesa_reference
         OR v_existing.goal_id IS DISTINCT FROM p_goal_id
         OR v_existing.notes IS DISTINCT FROM p_notes
      THEN
        RAISE EXCEPTION
          'Idempotency key already exists for a different contribution';
      END IF;
    ELSE
      IF v_existing.group_id IS DISTINCT FROM p_group_id
         OR v_existing.member_id IS DISTINCT FROM p_member_id
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.contribution_date IS DISTINCT FROM
             p_contribution_date
         OR lower(trim(coalesce(v_existing.contribution_type,'')))
              IS DISTINCT FROM lower(trim(p_contribution_type))
         OR v_existing.payment_method IS DISTINCT FROM p_payment_method
         OR v_existing_reference IS DISTINCT FROM v_reference
         OR v_existing_mpesa_reference IS NOT NULL
         OR v_existing.goal_id IS DISTINCT FROM p_goal_id
         OR v_existing.notes IS DISTINCT FROM p_notes
      THEN
        RAISE EXCEPTION
          'Idempotency key already exists for a different contribution';
      END IF;
    END IF;

    PERFORM public.cl_2b_refresh_member(
      p_member_id,
      date_trunc('month',v_rebuild_horizon)::date
    );

    RETURN jsonb_build_object(
      'success',true,
      'idempotent_replay',true,
      'payment_id',v_existing.id,
      'group_id',v_existing.group_id,
      'member_id',v_existing.member_id,
      'amount',v_existing.amount,
      'contribution_date',v_existing.contribution_date,
      'rebuild_horizon',
        date_trunc('month',v_rebuild_horizon)::date
    );
  END IF;

  INSERT INTO public.contributions (
    id,group_id,member_id,amount,contribution_type,month,
    payment_method,reference,goal_id,notes,mpesa_reference,
    contribution_date
  )
  VALUES (
    p_payment_id,p_group_id,p_member_id,p_amount,'monthly',
    v_payment_month,p_payment_method,v_reference,p_goal_id,p_notes,
    v_mpesa_reference,p_contribution_date
  );

  PERFORM public.cl_2b_refresh_member(
    p_member_id,
    date_trunc('month',v_rebuild_horizon)::date
  );

  RETURN jsonb_build_object(
    'success',true,
    'idempotent_replay',false,
    'payment_id',p_payment_id,
    'group_id',p_group_id,
    'member_id',p_member_id,
    'amount',p_amount,
    'contribution_date',p_contribution_date,
    'contribution_type','monthly',
    'payment_method',p_payment_method,
    'rebuild_horizon',
      date_trunc('month',v_rebuild_horizon)::date
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_refresh_member(p_member_id uuid, p_through_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_join_month date;
  v_requested_month date;
  v_effective_through_month date;
  v_latest_payment_month date;
  v_latest_obligation_month date;
  v_initial_lock_end date;
  v_monthly_type_id uuid;
  v_financial_start_month date;
  v_earliest_rule_month date;
  v_earliest_obligation_month date;
  v_earliest_payment_month date;
BEGIN
  IF p_member_id IS NULL OR p_through_month IS NULL THEN
    RAISE EXCEPTION 'Member and through month are required';
  END IF;

  v_requested_month := date_trunc('month', p_through_month)::date;

  SELECT m.group_id, date_trunc('month', m.join_date)::date
  INTO v_group_id, v_join_month
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_group_id IS NULL THEN RETURN; END IF;
  IF v_join_month IS NULL THEN v_join_month = v_requested_month; END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id = v_group_id
    AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ORDER BY CASE WHEN ct.code = 'monthly' THEN 0 ELSE 1 END, ct.created_at, ct.id
  LIMIT 1;

  IF v_monthly_type_id IS NULL THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type is missing';
  END IF;

  SELECT min(date_trunc('month', r.effective_from)::date)
  INTO v_earliest_rule_month
  FROM public.member_contribution_rules r
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id AND r.frequency = 'monthly'
    AND r.effective_from IS NOT NULL;

  SELECT min(date_trunc('month', o.obligation_month)::date)
  INTO v_earliest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.group_id = v_group_id AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id;

  SELECT min(date_trunc('month', c.contribution_date)::date)
  INTO v_earliest_payment_month
  FROM public.contributions c
  WHERE c.group_id = v_group_id AND c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  v_financial_start_month := least(
    coalesce(v_earliest_rule_month, v_requested_month),
    coalesce(v_earliest_obligation_month, v_requested_month),
    coalesce(v_earliest_payment_month, v_requested_month),
    v_requested_month
  );

  SELECT max(c.contribution_date) INTO v_latest_payment_month
  FROM public.contributions c
  WHERE c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  SELECT max(o.obligation_month) INTO v_latest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.member_id = p_member_id AND o.contribution_type_id = v_monthly_type_id;

  v_effective_through_month := greatest(
    v_requested_month,
    coalesce(date_trunc('month', v_latest_payment_month)::date, v_requested_month),
    coalesce(v_latest_obligation_month, v_requested_month),
    coalesce((
      SELECT max((date_trunc('month', r.effective_from) + interval '1 month')::date)
      FROM public.member_contribution_rules r
      WHERE r.group_id = v_group_id AND r.member_id = p_member_id
        AND r.contribution_type_id = v_monthly_type_id
        AND r.frequency = 'monthly' AND r.status = 'active'
        AND r.first_period_rule = 'next_full_period'
        AND date_trunc('month', r.effective_from)::date = v_join_month
    ), v_requested_month)
  );

  v_initial_lock_end = v_effective_through_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id, v_financial_start_month, v_initial_lock_end
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text, 0
    )
  );

  INSERT INTO public.contribution_obligations (
    group_id, member_id, contribution_type_id, rule_id, obligation_month, due_amount
  )
  SELECT r.group_id, r.member_id, r.contribution_type_id, r.id, gs::date, r.amount
  FROM public.member_contribution_rules r
  CROSS JOIN LATERAL generate_series(
    CASE WHEN r.first_period_rule = 'next_full_period'
      THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
      ELSE date_trunc('month', r.effective_from)::date END,
    least(
      v_effective_through_month,
      coalesce(date_trunc('month', r.effective_to)::date, v_effective_through_month)
    ),
    interval '1 month'
  ) gs
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id
    AND r.frequency = 'monthly' AND r.status = 'active'
    AND date_trunc('month', r.effective_from)::date <= v_effective_through_month
    AND (
      r.effective_to IS NULL
      OR date_trunc('month', r.effective_to)::date >=
        CASE WHEN r.first_period_rule = 'next_full_period'
          THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
          ELSE date_trunc('month', r.effective_from)::date END
    )
  ON CONFLICT (
    group_id, member_id, contribution_type_id, obligation_month
  )
  WHERE component_kind = 'PARENT'
    AND rule_id IS NOT NULL
  DO NOTHING;

  WITH monthly_payments AS (
    SELECT c.id AS payment_id, c.amount::numeric AS amount,
           c.contribution_date, c.created_at
    FROM public.contributions c
    WHERE c.group_id = v_group_id AND c.member_id = p_member_id
      AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND date_trunc('month', c.contribution_date)::date <= v_effective_through_month
  ),
  payment_allocations AS (
    SELECT p.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS all_allocated_amount,
      coalesce(sum(a.amount) FILTER (WHERE o.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_payments p
    LEFT JOIN public.contribution_allocations a ON a.payment_id = p.payment_id
    LEFT JOIN public.contribution_obligations o ON o.id = a.obligation_id
      AND o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
    GROUP BY p.payment_id
  ),
  payment_residuals AS (
    SELECT p.payment_id,
      greatest(p.amount - coalesce(pa.all_allocated_amount, 0), 0)::numeric AS residual_amount,
      p.contribution_date, p.created_at
    FROM monthly_payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.payment_id
    WHERE p.amount > coalesce(pa.all_allocated_amount, 0)
  ),
  monthly_obligations AS (
    SELECT o.id AS obligation_id, o.due_amount::numeric AS due_amount, o.obligation_month
    FROM public.contribution_obligations o
    WHERE o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
      AND o.obligation_month <= v_effective_through_month
  ),
  obligation_allocations AS (
    SELECT o.obligation_id,
      coalesce(sum(a.amount) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_obligations o
    LEFT JOIN public.contribution_allocations a ON a.obligation_id = o.obligation_id
    LEFT JOIN public.contributions p ON p.id = a.payment_id
      AND p.group_id = v_group_id AND p.member_id = p_member_id
      AND lower(trim(coalesce(p.contribution_type, ''))) = 'monthly'
    GROUP BY o.obligation_id
  ),
  obligation_residuals AS (
    SELECT o.obligation_id,
      greatest(o.due_amount - coalesce(oa.monthly_allocated_amount, 0), 0)::numeric AS residual_amount,
      o.obligation_month
    FROM monthly_obligations o
    LEFT JOIN obligation_allocations oa ON oa.obligation_id = o.obligation_id
    WHERE o.due_amount > coalesce(oa.monthly_allocated_amount, 0)
  ),
  payment_ranges AS (
    SELECT pr.*,
      coalesce(sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS payment_from,
      sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS payment_to
    FROM payment_residuals pr
  ),
  obligation_ranges AS (
    SELECT orr.*,
      coalesce(sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS obligation_from,
      sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS obligation_to
    FROM obligation_residuals orr
  ),
  matches AS (
    SELECT p.payment_id, o.obligation_id,
      greatest(
        0,
        least(p.payment_to, o.obligation_to) -
        greatest(p.payment_from, o.obligation_from)
      )::numeric AS allocation_amount
    FROM payment_ranges p
    CROSS JOIN obligation_ranges o
    WHERE greatest(
      0,
      least(p.payment_to, o.obligation_to) -
      greatest(p.payment_from, o.obligation_from)
    ) > 0
  )
  INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount)
  SELECT m.payment_id, m.obligation_id, m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    WHERE a.payment_id = m.payment_id AND a.obligation_id = m.obligation_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE (p.member_id = p_member_id OR o.member_id = p_member_id)
      AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
  ) THEN
    RAISE EXCEPTION 'Cross-member/group allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.payment_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id = a.payment_id
      WHERE p.member_id = p_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id = x.payment_id
    WHERE x.allocated > p.amount
  ) THEN
    RAISE EXCEPTION 'Payment over-allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.obligation_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id
      WHERE o.member_id = p_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id = x.obligation_id
    WHERE x.allocated > o.due_amount
  ) THEN
    RAISE EXCEPTION 'Obligation over-allocation detected';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_adjust(p_fine_id uuid, p_amount numeric, p_direction text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_balance numeric(14,2);
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_direction NOT IN ('INCREASE','DECREASE') OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Invalid adjustment'; END IF;
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine not found'; END IF;
  IF NOT public.cl_user_has_role(v_fine.group_id, ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'Fine adjustment requires chairperson or treasurer' USING ERRCODE='42501'; END IF;
  PERFORM private.cl_fine_lock(v_fine.group_id,v_fine.accounting_month);
  SELECT fp.* INTO v_period FROM public.financial_periods fp WHERE fp.group_id=v_fine.group_id AND fp.month=v_fine.accounting_month FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status)='closed' THEN RAISE EXCEPTION 'Financial month is closed or missing'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_fine.group_id::text || ':' || v_fine.member_id::text,
      0
    )
  );
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id FOR UPDATE;
  SELECT v_fine.original_amount
    + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=v_fine.id),0)
  INTO v_balance;
  IF p_direction='DECREASE' AND p_amount > round(v_balance,2) THEN RAISE EXCEPTION 'Decrease adjustment exceeds collectible balance'; END IF;
  INSERT INTO public.fine_adjustments(fine_id,amount,direction,reason,authorized_by) VALUES(p_fine_id,round(p_amount,2),p_direction,btrim(p_reason),v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_allocate_payment(p_fine_id uuid, p_payment_id uuid, p_amount numeric, p_source text DEFAULT 'MANUAL'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_payment public.contributions%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_outstanding numeric(14,2);
  v_allocated numeric(14,2);
  v_id uuid;
  v_fine_month date;
  v_payment_month date;
  v_lock_start date;
  v_lock_end date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  IF p_amount IS NULL OR round(p_amount,2) <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive after currency rounding';
  END IF;

  IF p_source NOT IN ('MANUAL','SYSTEM') THEN
    RAISE EXCEPTION 'Invalid allocation source';
  END IF;

  -- Unlocked reads are used only to derive the lock envelope. All
  -- authoritative ownership/value checks are repeated after the shared
  -- serialization boundary is acquired.
  SELECT f.*
  INTO v_fine
  FROM public.fines f
  WHERE f.id=p_fine_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fine not found';
  END IF;

  IF NOT public.cl_user_has_role(
    v_fine.group_id,
    ARRAY['chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Fine allocation requires chairperson or treasurer'
      USING ERRCODE='42501';
  END IF;

  SELECT c.*
  INTO v_payment
  FROM public.contributions c
  WHERE c.id=p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.contribution_date IS NULL THEN
    RAISE EXCEPTION 'Payment contribution date is required for allocation serialization';
  END IF;

  IF v_payment.group_id<>v_fine.group_id
     OR v_payment.member_id<>v_fine.member_id THEN
    RAISE EXCEPTION 'Cross-member or cross-group payment allocation prohibited';
  END IF;

  v_fine_month := to_date(v_fine.accounting_month || '-01','YYYY-MM-DD');
  v_payment_month := date_trunc('month',v_payment.contribution_date)::date;
  v_lock_start := least(v_fine_month,v_payment_month);
  v_lock_end := greatest(v_fine_month,v_payment_month);

  -- Participate in the same accounting lock domain used by
  -- cl_2b_record_contribution()/cl_2b_refresh_member(). A range is required
  -- because the payment month and fine accounting month are not assumed to
  -- be identical.
  PERFORM public.cl_2b_accounting_lock_range(
    v_fine.group_id,
    v_lock_start,
    v_lock_end
  );

  -- Lock the required financial-period row before entering the member/payment/fine
  -- portion of the lock order. The accounting advisory range above remains the
  -- month-range serializer; this row lock is only for the financial period
  -- actually required by the Fine allocation (the Fine's accounting month).
  SELECT fp.*
  INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=v_fine.group_id
    AND fp.month=v_fine.accounting_month
  FOR UPDATE;

  IF NOT FOUND OR lower(v_period.status)='closed' THEN
    RAISE EXCEPTION 'Financial month is closed or missing';
  END IF;

  -- This is the canonical member serialization key already used by the 2B
  -- member refresh path. It is acquired only after the accounting and required
  -- financial-period locks, and before payment/fine row serialization.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' ||
      v_fine.group_id::text || ':' ||
      v_fine.member_id::text,
      0
    )
  );

  -- The payment row is the next physical serialization point for the payment's
  -- total available balance. It is deliberately acquired before the Fine row
  -- so the complete row-lock suffix is Payment -> Fine.
  SELECT c.*
  INTO v_payment
  FROM public.contributions c
  WHERE c.id=p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.group_id<>v_fine.group_id
     OR v_payment.member_id<>v_fine.member_id THEN
    RAISE EXCEPTION 'Cross-member or cross-group payment allocation prohibited';
  END IF;

  IF date_trunc('month',v_payment.contribution_date)::date<>v_payment_month THEN
    RAISE EXCEPTION 'Payment accounting month changed during allocation';
  END IF;

  -- Re-read the authoritative Fine only after the payment row is locked. This
  -- is the final row lock in the canonical allocation order.
  SELECT f.*
  INTO v_fine
  FROM public.fines f
  WHERE f.id=p_fine_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fine not found';
  END IF;

  IF v_fine.group_id<>v_payment.group_id
     OR v_fine.member_id<>v_payment.member_id THEN
    RAISE EXCEPTION 'Fine ownership changed';
  END IF;

  IF NOT public.cl_user_has_role(
    v_fine.group_id,
    ARRAY['chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Fine allocation requires chairperson or treasurer'
      USING ERRCODE='42501';
  END IF;

  -- Fine outstanding balance.
  SELECT coalesce(sum(a.allocated_amount),0)
  INTO v_allocated
  FROM public.fine_payment_allocations a
  WHERE a.fine_id=v_fine.id;

  SELECT coalesce(
    sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END),
    0
  )
  INTO v_outstanding
  FROM public.fine_adjustments a
  WHERE a.fine_id=v_fine.id;

  v_outstanding := v_fine.original_amount + v_outstanding;

  SELECT v_outstanding - coalesce(sum(w.amount),0) - v_allocated
  INTO v_outstanding
  FROM public.fine_waivers w
  WHERE w.fine_id=v_fine.id;

  v_outstanding := round(v_outstanding,2);

  -- Total payment availability is cross-ledger:
  -- contribution allocations + fine allocations cannot exceed the payment.
  SELECT
    coalesce((
      SELECT sum(ca.amount)
      FROM public.contribution_allocations ca
      WHERE ca.payment_id=v_payment.id
    ),0)
    + coalesce((
      SELECT sum(fa.allocated_amount)
      FROM public.fine_payment_allocations fa
      WHERE fa.payment_id=v_payment.id
    ),0)
  INTO v_allocated;

  IF p_amount > round(v_payment.amount - v_allocated,2) THEN
    RAISE EXCEPTION 'Allocation exceeds payment remaining unallocated balance';
  END IF;

  IF v_outstanding <= 0 OR p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Allocation exceeds outstanding fine balance';
  END IF;

  INSERT INTO public.fine_payment_allocations(
    fine_id,
    payment_id,
    allocated_amount,
    allocated_by,
    source
  )
  VALUES(
    p_fine_id,
    p_payment_id,
    round(p_amount,2),
    v_actor,
    p_source
  )
  ON CONFLICT (payment_id,fine_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Payment is already allocated to this fine';
  END IF;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_balance(p_fine_id uuid)
 RETURNS TABLE(fine_id uuid, original_amount numeric, adjustments_increase numeric, adjustments_decrease numeric, waived_amount numeric, allocated_amount numeric, outstanding_amount numeric, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT f.id,
         f.original_amount,
         coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='INCREASE'),0),
         coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='DECREASE'),0),
         coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0),
         coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0),
         greatest(round(
           f.original_amount
           + coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='INCREASE'),0)
           - coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='DECREASE'),0)
           - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
           - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0)
         ,2),0),
         CASE
           WHEN coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
                >= f.original_amount
                + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=f.id),0)
             THEN 'WAIVED'
           WHEN greatest(round(f.original_amount
                + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=f.id),0)
                - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
                - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0),2),0)=0
             THEN 'PAID'
           WHEN coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0)>0
             THEN 'PARTIALLY_PAID'
           ELSE 'OUTSTANDING'
         END
  FROM public.fines f
  WHERE f.id=p_fine_id
    AND (
      public.cl_user_has_role(
        f.group_id,
        ARRAY['chairperson','treasurer']::text[]
      )
      OR EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id=f.member_id
          AND m.group_id=f.group_id
          AND (m.auth_user_id=auth.uid() OR m.user_id=auth.uid())
      )
    );
$function$



CREATE OR REPLACE FUNCTION public.cl_fine_create_rule(p_group_id uuid, p_name text, p_description text, p_trigger_type text, p_specificity_level smallint, p_priority integer, p_calculation_method text, p_fixed_amount numeric, p_percentage_rate numeric, p_minimum_amount numeric, p_maximum_amount numeric, p_grace_period_value integer, p_grace_period_unit text, p_applicability_mode text, p_effective_from timestamp with time zone, p_effective_until timestamp with time zone, p_contribution_type_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_member_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine-rule management requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;
  IF p_group_id IS NULL OR p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Group and effective_from are required';
  END IF;
  IF btrim(coalesce(p_name,'')) = '' THEN
    RAISE EXCEPTION 'Rule name is required';
  END IF;
  IF p_specificity_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Invalid specificity level';
  END IF;
  IF p_trigger_type NOT IN ('missed_contribution','meeting_absence','late_attendance','custom_event') THEN
    RAISE EXCEPTION 'Invalid trigger type';
  END IF;
  IF p_applicability_mode IN ('ALL','SELECTED') AND p_trigger_type <> 'missed_contribution' THEN
    RAISE EXCEPTION 'Contribution applicability mode is only valid for contribution fines';
  END IF;
  IF p_trigger_type = 'missed_contribution' AND p_applicability_mode NOT IN ('ALL','SELECTED') THEN
    RAISE EXCEPTION 'Invalid contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_applicability_mode NOT IN ('ALL_MEETINGS') THEN
    RAISE EXCEPTION 'Invalid non-contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_contribution_type_ids IS NOT NULL AND cardinality(p_contribution_type_ids) > 0 THEN
    RAISE EXCEPTION 'Contribution types are only valid for contribution rules';
  END IF;

  v_month := to_char(date_trunc('month', p_effective_from)::date, 'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=v_actor OR m.user_id=v_actor)
    AND lower(m.status)='active'
    AND lower(m.onboarding_status)='active'
  ORDER BY m.id LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Active group membership required' USING ERRCODE='42501';
  END IF;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    IF p_contribution_type_ids IS NULL OR cardinality(p_contribution_type_ids)=0 THEN
      RAISE EXCEPTION 'Selected contribution rules require contribution types';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.contribution_types ct
      WHERE ct.id = ANY(p_contribution_type_ids)
        AND ct.group_id <> p_group_id
    ) OR EXISTS (
      SELECT 1
      FROM unnest(p_contribution_type_ids) x(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.contribution_types ct WHERE ct.id=x.id)
    ) THEN
      RAISE EXCEPTION 'Selected contribution type does not belong to the rule group';
    END IF;
  END IF;

  -- Manual custom_event rules are selectable fine types, not competing
  -- automatic rules. Keep conflict detection for all automatic triggers.
  IF p_trigger_type <> 'custom_event' AND EXISTS (
    SELECT 1 FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type=p_trigger_type
      AND r.status='active'
      AND r.specificity_level=p_specificity_level
      AND r.priority=p_priority
      AND r.effective_from <= coalesce(p_effective_until,'infinity'::timestamptz)
      AND coalesce(r.effective_until,'infinity'::timestamptz) >= p_effective_from
  ) THEN
    RAISE EXCEPTION 'Equal specificity and priority rule conflict';
  END IF;

  INSERT INTO public.fine_rules(
    group_id,name,description,trigger_type,specificity_level,priority,
    calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,
    grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,
    status,created_by,updated_by
  ) VALUES (
    p_group_id,btrim(p_name),p_description,p_trigger_type,p_specificity_level,p_priority,
    p_calculation_method,p_fixed_amount,p_percentage_rate,p_minimum_amount,p_maximum_amount,
    p_grace_period_value,p_grace_period_unit,p_applicability_mode,p_effective_from,p_effective_until,
    'active',v_actor,v_actor
  ) RETURNING id INTO v_id;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    INSERT INTO public.fine_rule_contribution_types(rule_id, contribution_type_id)
    SELECT v_id, x.id FROM unnest(p_contribution_type_ids) x(id);
  END IF;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_generate_contribution(p_group_id uuid, p_member_id uuid, p_obligation_id uuid, p_triggered_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obligation public.contribution_obligations%ROWTYPE;
  v_rule public.fine_rules%ROWTYPE;
  v_fine_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_close_at timestamptz;
  v_fine_eligible_at timestamptz;
  v_base numeric(14,2);
  v_amount numeric(14,2);
  v_period public.financial_periods%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine generation requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id;
  IF NOT FOUND OR v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership mismatch';
  END IF;

  v_month := to_char(v_obligation.obligation_month,'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id
  FOR UPDATE;
  IF v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership changed';
  END IF;

  v_period := public.ensure_financial_period(p_group_id,v_month);
  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION 'Financial month % is closed',v_month;
  END IF;

  -- Current physical contract provides a group contribution calendar period.
  -- Resolve that authoritative closing date; no contribution-type override is
  -- assumed because no such physical relation was reconciled.
  SELECT (gcp.closing_date + interval '1 day') AT TIME ZONE 'Africa/Nairobi'
  INTO v_close_at
  FROM public.group_contribution_calendar_periods gcp
  WHERE gcp.group_id=p_group_id
    AND gcp.opening_date <= v_obligation.obligation_month
    AND gcp.closing_date >= v_obligation.obligation_month
  ORDER BY gcp.closing_date
  LIMIT 1;
  IF v_close_at IS NULL THEN
    RAISE EXCEPTION 'No authoritative contribution closing period configured';
  END IF;

  IF p_triggered_at < v_close_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    WHERE a.obligation_id=p_obligation_id
    GROUP BY a.obligation_id
    HAVING coalesce(sum(a.amount),0) >= v_obligation.due_amount
  ) THEN
    RAISE EXCEPTION 'Contribution obligation is settled; no missed-contribution fine';
  END IF;

  IF (
    SELECT count(*)
    FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type='missed_contribution'
      AND r.status='active'
      AND r.effective_from <= p_triggered_at
      AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
      AND (
        r.applicability_mode='ALL'
        OR EXISTS (
          SELECT 1 FROM public.fine_rule_contribution_types rt
          WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
        )
      )
      AND r.specificity_level = (
        SELECT max(r2.specificity_level)
        FROM public.fine_rules r2
        WHERE r2.group_id=p_group_id
          AND r2.trigger_type='missed_contribution'
          AND r2.status='active'
          AND r2.effective_from <= p_triggered_at
          AND (r2.effective_until IS NULL OR r2.effective_until >= p_triggered_at)
          AND (r2.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt2
            WHERE rt2.rule_id=r2.id AND rt2.contribution_type_id=v_obligation.contribution_type_id
          ))
      )
      AND r.priority = (
        SELECT max(r3.priority)
        FROM public.fine_rules r3
        WHERE r3.group_id=p_group_id
          AND r3.trigger_type='missed_contribution'
          AND r3.status='active'
          AND r3.effective_from <= p_triggered_at
          AND (r3.effective_until IS NULL OR r3.effective_until >= p_triggered_at)
          AND (r3.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt3
            WHERE rt3.rule_id=r3.id AND rt3.contribution_type_id=v_obligation.contribution_type_id
          ))
          AND r3.specificity_level = r.specificity_level
      )
  ) > 1 THEN
    RAISE EXCEPTION 'Equal specificity and priority produces ambiguous fine-rule precedence';
  END IF;

  SELECT r.* INTO v_rule
  FROM public.fine_rules r
  WHERE r.group_id=p_group_id
    AND r.trigger_type='missed_contribution'
    AND r.status='active'
    AND r.effective_from <= p_triggered_at
    AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
    AND (r.applicability_mode='ALL' OR EXISTS (
      SELECT 1 FROM public.fine_rule_contribution_types rt
      WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
    ))
  ORDER BY r.specificity_level DESC, r.priority DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'No applicable contribution fine rule'; END IF;

  v_fine_eligible_at := v_close_at
    + CASE v_rule.grace_period_unit
        WHEN 'DAY' THEN make_interval(days => v_rule.grace_period_value)
        WHEN 'WEEK' THEN make_interval(days => v_rule.grace_period_value * 7)
        WHEN 'MONTH' THEN make_interval(months => v_rule.grace_period_value)
      END;
  IF p_triggered_at < v_fine_eligible_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing and grace boundary';
  END IF;

  v_base := round(v_obligation.due_amount,2);
  IF v_rule.calculation_method='FIXED' THEN
    v_amount := round(v_rule.fixed_amount,2);
  ELSE
    v_amount := round(v_base * v_rule.percentage_rate / 100,2);
  END IF;
  IF v_rule.minimum_amount IS NOT NULL THEN v_amount := greatest(v_amount, round(v_rule.minimum_amount,2)); END IF;
  IF v_rule.maximum_amount IS NOT NULL THEN v_amount := least(v_amount, round(v_rule.maximum_amount,2)); END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Calculated fine amount must be positive'; END IF;

  INSERT INTO public.fines(
    group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
    original_amount,calculation_method,calculation_base,percentage_rate,fixed_amount,
    minimum_amount,maximum_amount,calculated_amount,resolved_closing_at,triggered_at
  ) VALUES (
    p_group_id,p_member_id,v_rule.id,'missed_contribution',p_obligation_id,v_month,
    v_amount,v_rule.calculation_method,v_base,v_rule.percentage_rate,v_rule.fixed_amount,
    v_rule.minimum_amount,v_rule.maximum_amount,v_amount,v_close_at,p_triggered_at
  )
  ON CONFLICT (group_id,member_id,rule_id,trigger_type,trigger_id)
  DO NOTHING
  RETURNING id INTO v_fine_id;

  IF v_fine_id IS NULL THEN
    SELECT f.id INTO v_fine_id FROM public.fines f
    WHERE f.group_id=p_group_id AND f.member_id=p_member_id
      AND f.rule_id=v_rule.id AND f.trigger_type='missed_contribution'
      AND f.trigger_id=p_obligation_id;
  END IF;

  RETURN v_fine_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_waive(p_fine_id uuid, p_amount numeric, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_balance numeric(14,2);
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Valid waiver amount and reason are required'; END IF;
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine not found'; END IF;
  IF NOT public.cl_user_has_role(v_fine.group_id, ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'Fine waiver requires chairperson or treasurer' USING ERRCODE='42501'; END IF;
  PERFORM private.cl_fine_lock(v_fine.group_id,v_fine.accounting_month);
  SELECT fp.* INTO v_period FROM public.financial_periods fp WHERE fp.group_id=v_fine.group_id AND fp.month=v_fine.accounting_month FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status)='closed' THEN RAISE EXCEPTION 'Financial month is closed or missing'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_fine.group_id::text || ':' || v_fine.member_id::text,
      0
    )
  );
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id FOR UPDATE;
  SELECT v_fine.original_amount
    + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=v_fine.id),0)
  INTO v_balance;
  IF p_amount > round(v_balance,2) THEN RAISE EXCEPTION 'Waiver exceeds outstanding fine balance'; END IF;
  INSERT INTO public.fine_waivers(fine_id,amount,reason,authorized_by) VALUES(p_fine_id,round(p_amount,2),btrim(p_reason),v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_loan_summary(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_group_id is null then
    raise exception 'Group is required' using errcode = '22023';
  end if;

  -- A member may view their own group's summary. Group managers may
  -- view groups where they hold a recognized management role, and owners
  -- may view the group they own. Never trust a client-supplied group ID alone.
  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.members m
          where m.group_id = g.id
            and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
            and lower(coalesce(m.status, 'active')) = 'active'
            and lower(coalesce(m.onboarding_status, 'active')) = 'active'
        )
        or public.cl_user_has_role(
          g.id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
      )
  ) then
    raise exception 'You are not authorized to view this group loan summary'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and coalesce(g.loans_enabled, false) = true
  ) then
    raise exception 'Loans are not enabled for this group'
      using errcode = '42501';
  end if;

  with disbursed_loans as (
    select la.id, la.group_id, la.member_id, la.approved_amount, la.status
    from public.loan_applications la
    where la.group_id = p_group_id
      and la.disbursed_at is not null
      and la.status in ('active', 'overdue', 'cleared')
  ),
  loan_totals as (
    select
      coalesce(sum(approved_amount), 0)::numeric as total_disbursed,
      count(distinct member_id)::integer as members_benefited,
      count(*) filter (where status in ('active', 'overdue'))::integer as active_loans_count
    from disbursed_loans
  ),
  interest_totals as (
    -- Allocations record interest that was actually paid as part of a
    -- recorded repayment. Scheduled/unpaid interest is not counted.
    select coalesce(sum(a.interest_amount), 0)::numeric as interest_gained
    from public.loan_repayment_allocations a
    join disbursed_loans dl on dl.id = a.loan_id
    where a.group_id = p_group_id
  ),
  principal_totals as (
    -- Exclude cleared loans; overdue loans remain outstanding until cleared.
    -- Principal allocations, not total installment payments, reduce principal.
    select coalesce(sum(greatest(s.principal_due - coalesce(pa.principal_paid, 0), 0)), 0)::numeric
      as outstanding_amount
    from public.loan_repayment_schedule s
    join disbursed_loans dl on dl.id = s.loan_id
    left join (
      select schedule_id, sum(principal_amount)::numeric as principal_paid
      from public.loan_repayment_allocations
      where group_id = p_group_id
      group by schedule_id
    ) pa on pa.schedule_id = s.id
    where s.group_id = p_group_id
      and dl.status in ('active', 'overdue')
  )
  select jsonb_build_object(
    'totalDisbursed', lt.total_disbursed,
    'interestGained', it.interest_gained,
    'membersBenefited', lt.members_benefited,
    'outstandingAmount', pt.outstanding_amount,
    'activeLoansCount', lt.active_loans_count
  )
  into v_summary
  from loan_totals lt
  cross join interest_totals it
  cross join principal_totals pt;

  return coalesce(v_summary, jsonb_build_object(
    'totalDisbursed', 0,
    'interestGained', 0,
    'membersBenefited', 0,
    'outstandingAmount', 0,
    'activeLoansCount', 0
  ));
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_support_summary(p_group_id uuid)
 RETURNS TABLE(support_id uuid, member_id uuid, member_name text, support_type text, support_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.group_id=p_group_id AND (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND lower(coalesce(m.status,'active'))='active') THEN RAISE EXCEPTION 'Group access denied'; END IF; RETURN QUERY SELECT s.id,s.member_id,m.name,s.support_type,s.support_date,s.status FROM public.group_support_cases s JOIN public.members m ON m.id=s.member_id WHERE s.group_id=p_group_id ORDER BY s.support_date DESC,s.created_at DESC; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_activities_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_assets_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_milestones_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_module_enabled(p_group_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(p_module, ''))) = 'merry_go_round' then
    select g.merry_go_round_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  elsif lower(btrim(coalesce(p_module, ''))) = 'loans' then
    select g.loans_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  else
    raise exception 'Unknown optional module' using errcode = '22023';
  end if;

  if v_enabled is null then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  return v_enabled;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_group_plans_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$

CREATE OR REPLACE FUNCTION public.cl_group_support_cases_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_guard_contribution_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_lock_start date;
  v_lock_end date;

  v_payment_id uuid;
  v_obligation_id uuid;

  v_payment_group_id uuid;
  v_payment_member_id uuid;
  v_payment_amount numeric;

  v_obligation_group_id uuid;
  v_obligation_member_id uuid;
  v_obligation_due numeric;

  v_payment_allocated numeric;
  v_fine_allocated numeric;
  v_obligation_allocated numeric;

  v_post_payment_allocated numeric;
  v_post_obligation_allocated numeric;

  v_status text;
  v_month date;
BEGIN
  /*
    Pre-lock discovery only.
    No payment/obligation FOR UPDATE occurs before the accounting boundary.
  */
  SELECT p.group_id
    INTO v_group_id
  FROM public.contributions p
  WHERE p.id = NEW.payment_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Allocation payment does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contributions c
    WHERE c.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND c.group_id IS DISTINCT FROM v_group_id
  ) THEN
    RAISE EXCEPTION
      'Allocation payment targets must belong to the same group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND o.group_id IS DISTINCT FROM v_group_id
  ) THEN
    RAISE EXCEPTION
      'Allocation obligation targets must belong to the same group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contributions c
    WHERE c.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND c.contribution_date IS NULL
  ) THEN
    RAISE EXCEPTION
      'All affected allocation payments require contribution_date';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND o.economic_month IS NULL
  ) THEN
    RAISE EXCEPTION
      'All affected allocation obligations require economic_month';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id = NEW.obligation_id
  ) THEN
    RAISE EXCEPTION 'Allocation obligation does not exist';
  END IF;

  SELECT MIN(x.month_start), MAX(x.month_start)
    INTO v_lock_start, v_lock_end
  FROM (
    SELECT date_trunc('month', p.contribution_date)::date AS month_start
    FROM public.contributions p
    WHERE p.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND TG_OP = 'UPDATE'

    UNION

    SELECT date_trunc('month', p.contribution_date)::date
    FROM public.contributions p
    WHERE p.id = NEW.payment_id

    UNION

    SELECT o.economic_month
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND TG_OP = 'UPDATE'

    UNION

    SELECT o.economic_month
    FROM public.contribution_obligations o
    WHERE o.id = NEW.obligation_id
  ) x
  WHERE x.month_start IS NOT NULL;

  IF v_lock_start IS NULL OR v_lock_end IS NULL THEN
    RAISE EXCEPTION 'Unable to determine complete accounting envelope for allocation';
  END IF;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  /*
    Existing financial-period rows are locked after accounting
    serialization. Missing rows are open for mutation and are not created.
  */
  FOR v_month IN
    SELECT DISTINCT x.month_start
    FROM (
      SELECT date_trunc('month', p.contribution_date)::date AS month_start
      FROM public.contributions p
      WHERE p.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
        AND TG_OP = 'UPDATE'

      UNION
      SELECT date_trunc('month', p.contribution_date)::date
      FROM public.contributions p
      WHERE p.id = NEW.payment_id

      UNION
      SELECT o.economic_month
      FROM public.contribution_obligations o
      WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
        AND TG_OP = 'UPDATE'

      UNION
      SELECT o.economic_month
      FROM public.contribution_obligations o
      WHERE o.id = NEW.obligation_id
    ) x
    WHERE x.month_start IS NOT NULL
    ORDER BY x.month_start
  LOOP
    SELECT fp.status
      INTO v_status
    FROM public.financial_periods fp
    WHERE fp.group_id = v_group_id
      AND fp.month = to_char(v_month, 'YYYY-MM')
    FOR UPDATE;

    IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
      RAISE EXCEPTION
        'Allocation cannot affect closed financial month %',
        to_char(v_month, 'YYYY-MM');
    END IF;
  END LOOP;

  FOR v_payment_id IN
    SELECT DISTINCT payment_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END AS payment_id
      UNION
      SELECT NEW.payment_id
    ) p
    WHERE payment_id IS NOT NULL
    ORDER BY payment_id
  LOOP
    SELECT c.group_id, c.member_id, c.amount
      INTO v_payment_group_id, v_payment_member_id, v_payment_amount
    FROM public.contributions c
    WHERE c.id = v_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Affected allocation payment % does not exist', v_payment_id;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0)
      INTO v_payment_allocated
    FROM public.contribution_allocations a
    WHERE a.payment_id = v_payment_id;

    SELECT COALESCE(SUM(fpa.allocated_amount), 0)
      INTO v_fine_allocated
    FROM public.fine_payment_allocations fpa
    WHERE fpa.payment_id = v_payment_id;

    v_post_payment_allocated :=
      v_payment_allocated
      - CASE
          WHEN TG_OP = 'UPDATE' THEN
            CASE WHEN OLD.payment_id = v_payment_id THEN OLD.amount ELSE 0 END
          ELSE 0
        END
      + CASE
          WHEN NEW.payment_id = v_payment_id
          THEN NEW.amount
          ELSE 0
        END;

    IF v_post_payment_allocated < 0 THEN
      RAISE EXCEPTION 'Allocation mutation produces negative payment allocation balance';
    END IF;

    IF v_post_payment_allocated + v_fine_allocated > v_payment_amount THEN
      RAISE EXCEPTION
        'Allocation exceeds available payment balance for payment %',
        v_payment_id;
    END IF;
  END LOOP;

  FOR v_obligation_id IN
    SELECT DISTINCT obligation_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END AS obligation_id
      UNION
      SELECT NEW.obligation_id
    ) o
    WHERE obligation_id IS NOT NULL
    ORDER BY obligation_id
  LOOP
    SELECT o.group_id, o.member_id, o.due_amount
      INTO v_obligation_group_id, v_obligation_member_id, v_obligation_due
    FROM public.contribution_obligations o
    WHERE o.id = v_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Affected allocation obligation % does not exist',
        v_obligation_id;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0)
      INTO v_obligation_allocated
    FROM public.contribution_allocations a
    WHERE a.obligation_id = v_obligation_id;

    v_post_obligation_allocated :=
      v_obligation_allocated
      - CASE
          WHEN TG_OP = 'UPDATE' THEN
            CASE WHEN OLD.obligation_id = v_obligation_id THEN OLD.amount ELSE 0 END
          ELSE 0
        END
      + CASE
          WHEN NEW.obligation_id = v_obligation_id
          THEN NEW.amount
          ELSE 0
        END;

    IF v_post_obligation_allocated < 0 THEN
      RAISE EXCEPTION
        'Allocation mutation produces negative obligation allocation balance';
    END IF;

    IF v_post_obligation_allocated > v_obligation_due THEN
      RAISE EXCEPTION
        'Allocation exceeds obligation balance for obligation %',
        v_obligation_id;
    END IF;
  END LOOP;

  FOR v_payment_id IN
    SELECT DISTINCT payment_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END AS payment_id
      UNION
      SELECT NEW.payment_id
    ) p
    WHERE payment_id IS NOT NULL
    ORDER BY payment_id
  LOOP
    SELECT c.group_id, c.member_id, c.amount
      INTO v_payment_group_id, v_payment_member_id, v_payment_amount
    FROM public.contributions c
    WHERE c.id = v_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Affected allocation payment % does not exist', v_payment_id;
    END IF;

    IF v_payment_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Affected allocation payment % changed group during validation', v_payment_id;
    END IF;
  END LOOP;

  FOR v_obligation_id IN
    SELECT DISTINCT obligation_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END AS obligation_id
      UNION
      SELECT NEW.obligation_id
    ) o
    WHERE obligation_id IS NOT NULL
    ORDER BY obligation_id
  LOOP
    SELECT o.group_id, o.member_id, o.due_amount
      INTO v_obligation_group_id, v_obligation_member_id, v_obligation_due
    FROM public.contribution_obligations o
    WHERE o.id = v_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Affected allocation obligation % does not exist', v_obligation_id;
    END IF;

    IF v_obligation_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Affected allocation obligation % changed group during validation', v_obligation_id;
    END IF;
  END LOOP;

  SELECT c.group_id, c.member_id, c.amount
    INTO v_payment_group_id, v_payment_member_id, v_payment_amount
  FROM public.contributions c
  WHERE c.id = NEW.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation payment does not exist';
  END IF;

  SELECT o.group_id, o.member_id, o.due_amount
    INTO v_obligation_group_id, v_obligation_member_id, v_obligation_due
  FROM public.contribution_obligations o
  WHERE o.id = NEW.obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation obligation does not exist';
  END IF;

  IF v_payment_group_id IS DISTINCT FROM v_obligation_group_id
     OR v_payment_member_id IS DISTINCT FROM v_obligation_member_id
  THEN
    RAISE EXCEPTION
      'Contribution allocation payment and obligation must belong to the same group and member';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Contribution allocation amount must be greater than zero';
  END IF;

  SELECT date_trunc('month', c.contribution_date)::date
    INTO v_month
  FROM public.contributions c
  WHERE c.id = NEW.payment_id;

  IF v_month < v_lock_start OR v_month > v_lock_end THEN
    RAISE EXCEPTION
      'Authoritative payment month expanded outside the acquired accounting envelope';
  END IF;

  SELECT o.economic_month
    INTO v_month
  FROM public.contribution_obligations o
  WHERE o.id = NEW.obligation_id;

  IF v_month < v_lock_start OR v_month > v_lock_end THEN
    RAISE EXCEPTION
      'Authoritative obligation month expanded outside the acquired accounting envelope';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_guard_open_financial_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_lock_start date;
  v_lock_end date;
  v_status text;
  v_month date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_group_id := NEW.group_id;

    IF NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT date_trunc('month', NEW.contribution_date)::date
      INTO v_month;

  ELSIF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;

    IF OLD.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT date_trunc('month', OLD.contribution_date)::date
      INTO v_month;

  ELSE
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'Contribution group cannot be changed';
    END IF;

    v_group_id := NEW.group_id;

    IF OLD.contribution_date IS NULL OR NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT MIN(x.month_start), MAX(x.month_start)
      INTO v_lock_start, v_lock_end
    FROM (
      VALUES
        (date_trunc('month', OLD.contribution_date)::date),
        (date_trunc('month', NEW.contribution_date)::date)
    ) AS x(month_start);

    PERFORM public.cl_2b_accounting_lock_range(
      v_group_id,
      v_lock_start,
      v_lock_end
    );

    FOR v_status IN
      SELECT fp.status
      FROM public.financial_periods fp
      WHERE fp.group_id = v_group_id
        AND fp.month BETWEEN
          to_char(v_lock_start, 'YYYY-MM')
          AND to_char(v_lock_end, 'YYYY-MM')
      ORDER BY fp.month
      FOR UPDATE
    LOOP
      IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
        RAISE EXCEPTION
          'Financial month is closed. Contributions cannot be changed.';
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  v_lock_start := v_month;
  v_lock_end := v_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  SELECT fp.status
    INTO v_status
  FROM public.financial_periods fp
  WHERE fp.group_id = v_group_id
    AND fp.month = to_char(v_month, 'YYYY-MM')
  FOR UPDATE;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      to_char(v_month, 'YYYY-MM');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_import_financial_batch_atomic(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch public.data_import_batches%rowtype;
  v_row public.data_import_rows%rowtype;
  v_imported integer:=0;
  v_contributions integer:=0;
  v_expenses integer:=0;
  v_total_amount numeric:=0;
  v_target_id uuid;
  v_payment_result jsonb;
  v_normalized jsonb;
  v_member_id uuid;
  v_group_id uuid;
  v_amount numeric;
  v_contribution_date date;
  v_contribution_type text;
  v_payment_method text;
  v_reference text;
  v_mpesa_reference text;
  v_goal_id uuid;
  v_notes text;
  v_expense_description text;
  v_expense_date date;
  v_expense_category text;
  v_expense_status text;
  v_receipt_url text;
  v_idempotency_key uuid;
  v_month text;
  v_expected_count integer;
  v_actual_count integer;
  v_expected_amount numeric;
  v_actual_amount numeric;
  v_finance_member_id uuid;
  v_existing public.expenses%rowtype;
  v_lock_start date;
  v_lock_end date;
  v_member_join date;
  v_member_horizon date;
  v_initial_lock_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch id is required';
  END IF;

  SELECT b.*
    INTO v_batch
  FROM public.data_import_batches b
  WHERE b.id=p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;

  v_group_id:=v_batch.group_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Import batch has no group';
  END IF;

  IF NOT public.cl_user_has_role(
    v_group_id,
    ARRAY['admin','chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Finance authorization required';
  END IF;

  IF lower(coalesce(v_batch.status,''))='completed' THEN
    RETURN jsonb_build_object(
      'ok',true,
      'idempotent_replay',true,
      'batch_id',p_batch_id,
      'group_id',v_group_id,
      'status',v_batch.status,
      'summary',v_batch.summary
    );
  END IF;

  IF lower(coalesce(v_batch.status,'')) NOT IN ('ready','failed') THEN
    RAISE EXCEPTION
      'Batch status % is not importable',v_batch.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(coalesce(r.status,''))='imported'
  ) THEN
    RAISE EXCEPTION
      'Batch contains previously imported rows; reconcile it before atomic import';
  END IF;

  PERFORM 1
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id
  ORDER BY r.source_row_number NULLS LAST,r.id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
  ) THEN
    RAISE EXCEPTION 'Import batch contains no rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)
          NOT IN ('contribution','expense')
  ) THEN
    RAISE EXCEPTION 'Batch contains unsupported entity type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(coalesce(r.status,''))
          NOT IN ('valid','warning')
  ) THEN
    RAISE EXCEPTION
      'Every import row must be validated before atomic import';
  END IF;

  -- Validate every normalized row without accounting mutation.
  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY r.source_row_number NULLS LAST,r.id
  LOOP
    v_normalized:=coalesce(v_row.normalized_data,'{}'::jsonb);

    IF lower(v_row.entity_type)='contribution' THEN
      BEGIN
        v_member_id:=nullif(
          v_normalized->>'member_id',''
        )::uuid;
        v_amount:=nullif(
          v_normalized->>'amount',''
        )::numeric;
        v_contribution_date:=nullif(
          v_normalized->>'contribution_date',''
        )::date;
        v_contribution_type:=coalesce(
          nullif(trim(v_normalized->>'contribution_type'),''),
          'monthly'
        );
        v_payment_method:=nullif(
          trim(v_normalized->>'payment_method'),''
        );
        v_reference:=nullif(
          trim(v_normalized->>'reference'),''
        );
        v_mpesa_reference:=nullif(
          trim(v_normalized->>'mpesa_reference'),''
        );
        v_goal_id:=nullif(
          v_normalized->>'goal_id',''
        )::uuid;
        v_notes:=nullif(v_normalized->>'notes','');
        v_idempotency_key:=nullif(
          v_normalized->>'__idempotency_key',''
        )::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION
          'Row % contains invalid normalized UUID/date/numeric data',
          v_row.source_row_number;
      END;

      IF v_member_id IS NULL
         OR v_amount IS NULL
         OR v_amount<=0
         OR v_contribution_date IS NULL
         OR v_idempotency_key IS NULL
      THEN
        RAISE EXCEPTION
          'Row % has incomplete contribution data',
          v_row.source_row_number;
      END IF;

      IF lower(v_contribution_type)<>'monthly' THEN
        RAISE EXCEPTION
          'Row % is not a monthly contribution',
          v_row.source_row_number;
      END IF;

      IF v_payment_method NOT IN
         ('M-Pesa','Cash','Bank transfer')
      THEN
        RAISE EXCEPTION
          'Row % has invalid payment method',
          v_row.source_row_number;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id=v_member_id
          AND m.group_id=v_group_id
      ) THEN
        RAISE EXCEPTION
          'Row % member does not belong to batch group',
          v_row.source_row_number;
      END IF;

      IF v_goal_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.contribution_goals cg
           WHERE cg.id=v_goal_id
             AND cg.group_id=v_group_id
         )
      THEN
        RAISE EXCEPTION
          'Row % goal does not belong to batch group',
          v_row.source_row_number;
      END IF;

      IF v_payment_method='M-Pesa'
         AND v_reference IS NOT NULL
         AND v_mpesa_reference IS NOT NULL
         AND v_reference IS DISTINCT FROM v_mpesa_reference
      THEN
        RAISE EXCEPTION
          'Row % has conflicting M-Pesa references',
          v_row.source_row_number;
      END IF;

      IF v_payment_method<>'M-Pesa'
         AND v_mpesa_reference IS NOT NULL
      THEN
        RAISE EXCEPTION
          'Row % has M-Pesa reference on non-M-Pesa payment',
          v_row.source_row_number;
      END IF;

    ELSE
      BEGIN
        v_amount:=nullif(
          v_normalized->>'amount',''
        )::numeric;
        v_expense_date:=nullif(
          v_normalized->>'date',''
        )::date;
        v_expense_description:=nullif(
          trim(v_normalized->>'description'),''
        );
        v_expense_category:=coalesce(
          nullif(trim(v_normalized->>'category'),''),
          'other'
        );
        v_expense_status:=coalesce(
          nullif(trim(v_normalized->>'approval_status'),''),
          'pending'
        );
        v_receipt_url:=nullif(
          v_normalized->>'receipt_url',''
        );
        v_idempotency_key:=nullif(
          v_normalized->>'__idempotency_key',''
        )::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION
          'Row % contains invalid normalized UUID/date/numeric data',
          v_row.source_row_number;
      END;

      IF v_expense_description IS NULL
         OR v_amount IS NULL
         OR v_amount<=0
         OR v_expense_date IS NULL
         OR v_idempotency_key IS NULL
      THEN
        RAISE EXCEPTION
          'Row % has incomplete expense data',
          v_row.source_row_number;
      END IF;

      IF v_expense_status NOT IN
         ('pending','approved','rejected')
      THEN
        RAISE EXCEPTION
          'Row % has invalid expense approval status',
          v_row.source_row_number;
      END IF;
    END IF;
  END LOOP;

  -- Determine the complete accounting lock envelope before taking
  -- any accounting-month locks.  A contribution can cause
  -- cl_2b_refresh_member() to rewrite allocations from the member's
  -- join month through the safe rebuild horizon, not merely the
  -- payment month.  Use one continuous group/month envelope so every
  -- delegated payment writer acquires a compatible lock set.
  v_lock_start:=NULL;
  v_lock_end:=NULL;

  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)='contribution'
    ORDER BY
      nullif(r.normalized_data->>'member_id','')::uuid,
      (r.normalized_data->>'contribution_date')::date,
      r.source_row_number NULLS LAST,
      r.id
  LOOP
    v_member_id:=(v_row.normalized_data->>'member_id')::uuid;
    v_contribution_date:=
      (v_row.normalized_data->>'contribution_date')::date;

    SELECT m.join_date
      INTO v_member_join
    FROM public.members m
    WHERE m.id=v_member_id
      AND m.group_id=v_group_id;

    IF v_member_join IS NULL THEN
      v_member_join:=v_contribution_date;
    END IF;

    SELECT greatest(
      v_contribution_date,
      coalesce(
        (
          SELECT max(c.contribution_date)
          FROM public.contributions c
          WHERE c.group_id=v_group_id
            AND c.member_id=v_member_id
            AND lower(coalesce(c.contribution_type,''))='monthly'
        ),
        v_contribution_date
      ),
      coalesce(
        (
          SELECT max(o.obligation_month)
          FROM public.contribution_obligations o
          WHERE o.group_id=v_group_id
            AND o.member_id=v_member_id
        ),
        v_contribution_date
      )
    )
    INTO v_member_horizon;

    v_lock_start:=least(
      coalesce(v_lock_start,date_trunc('month',v_member_join)::date),
      date_trunc('month',v_member_join)::date
    );
    v_lock_end:=greatest(
      coalesce(v_lock_end,date_trunc('month',v_member_horizon)::date),
      date_trunc('month',v_member_horizon)::date
    );
  END LOOP;

  -- Expenses do not rebuild contribution allocations, but their own
  -- accounting month must still participate in the same deterministic
  -- group/month lock envelope.
  SELECT least(
           coalesce(v_lock_start,min_month),
           min_month
         ),
         greatest(
           coalesce(v_lock_end,max_month),
           max_month
         )
    INTO v_lock_start,v_lock_end
  FROM (
    SELECT
      min(
        CASE
          WHEN lower(r.entity_type)='contribution'
            THEN date_trunc(
              'month',
              (r.normalized_data->>'contribution_date')::date
            )::date
          ELSE date_trunc(
            'month',
            (r.normalized_data->>'date')::date
          )::date
        END
      ) AS min_month,
      max(
        CASE
          WHEN lower(r.entity_type)='contribution'
            THEN date_trunc(
              'month',
              (r.normalized_data->>'contribution_date')::date
            )::date
          ELSE date_trunc(
            'month',
            (r.normalized_data->>'date')::date
          )::date
        END
      ) AS max_month
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
  ) s;

  IF v_lock_start IS NULL OR v_lock_end IS NULL THEN
    RAISE EXCEPTION 'Could not determine batch accounting lock envelope';
  END IF;

  -- Acquire the complete envelope in ascending month order before
  -- period decisions or any accounting mutation.
  v_initial_lock_end:=v_lock_end;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_initial_lock_end
  );

  -- Re-read every contribution member's horizon after the initial lock.
  -- This closes the wait-then-refresh gap: a later concurrent payment
  -- committed before this batch acquired the lock must remain inside the
  -- allocation rebuild envelope. Any required extension is forward-only.
  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)='contribution'
    ORDER BY
      nullif(r.normalized_data->>'member_id','')::uuid,
      (r.normalized_data->>'contribution_date')::date,
      r.source_row_number NULLS LAST,
      r.id
  LOOP
    v_member_id:=(v_row.normalized_data->>'member_id')::uuid;
    v_contribution_date:=
      (v_row.normalized_data->>'contribution_date')::date;

    SELECT greatest(
      v_contribution_date,
      coalesce(
        (
          SELECT max(c.contribution_date)
          FROM public.contributions c
          WHERE c.group_id=v_group_id
            AND c.member_id=v_member_id
            AND lower(coalesce(c.contribution_type,''))='monthly'
        ),
        v_contribution_date
      ),
      coalesce(
        (
          SELECT max(o.obligation_month)
          FROM public.contribution_obligations o
          WHERE o.group_id=v_group_id
            AND o.member_id=v_member_id
        ),
        v_contribution_date
      )
    )
    INTO v_member_horizon;

    IF date_trunc('month',v_member_horizon)::date > v_initial_lock_end THEN
      PERFORM public.cl_2b_accounting_lock_range(
        v_group_id,
        (v_initial_lock_end + interval '1 month')::date,
        date_trunc('month',v_member_horizon)::date
      );
      v_initial_lock_end:=date_trunc('month',v_member_horizon)::date;
    END IF;
  END LOOP;

  v_lock_end:=v_initial_lock_end;

  -- Establish/lock all periods only after all month locks exist.
  FOR v_month IN
    SELECT DISTINCT to_char(
      CASE
        WHEN lower(r.entity_type)='contribution'
          THEN (r.normalized_data->>'contribution_date')::date
        ELSE (r.normalized_data->>'date')::date
      END,
      'YYYY-MM'
    )
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY 1
  LOOP
    PERFORM public.ensure_financial_period(
      v_group_id,v_month
    );

    PERFORM 1
    FROM public.financial_periods fp
    WHERE fp.group_id=v_group_id
      AND fp.month=v_month
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.financial_periods fp
      WHERE fp.group_id=v_group_id
        AND fp.month=v_month
        AND lower(coalesce(fp.status,'open'))='closed'
    ) THEN
      RAISE EXCEPTION
        'Batch contains rows targeting closed financial period %',
        v_month;
    END IF;
  END LOOP;

  SELECT m.id
    INTO v_finance_member_id
  FROM public.members m
  WHERE m.group_id=v_group_id
    AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
    AND lower(coalesce(m.onboarding_status,'active'))='active'
    AND lower(coalesce(m.role,'member')) =
        ANY(
          ARRAY[
            'admin','chairperson','secretary','treasurer'
          ]::text[]
        )
  ORDER BY
    CASE WHEN m.auth_user_id=auth.uid() THEN 0 ELSE 1 END,
    m.id
  LIMIT 1;

  IF v_finance_member_id IS NULL THEN
    RAISE EXCEPTION
      'Authenticated finance member could not be resolved';
  END IF;

  UPDATE public.data_import_batches
  SET status='importing',
      started_at=coalesce(started_at,now()),
      completed_at=NULL
  WHERE id=p_batch_id;

  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY r.source_row_number NULLS LAST,r.id
  LOOP
    v_normalized:=coalesce(v_row.normalized_data,'{}'::jsonb);

    IF lower(v_row.entity_type)='contribution' THEN
      v_member_id:=(v_normalized->>'member_id')::uuid;
      v_amount:=(v_normalized->>'amount')::numeric;
      v_contribution_date:=
        (v_normalized->>'contribution_date')::date;
      v_contribution_type:=coalesce(
        nullif(trim(v_normalized->>'contribution_type'),''),
        'monthly'
      );
      v_payment_method:=v_normalized->>'payment_method';
      v_reference:=nullif(
        trim(v_normalized->>'reference'),''
      );
      v_mpesa_reference:=nullif(
        trim(v_normalized->>'mpesa_reference'),''
      );
      v_goal_id:=nullif(
        v_normalized->>'goal_id',''
      )::uuid;
      v_notes:=nullif(v_normalized->>'notes','');
      v_idempotency_key:=
        (v_normalized->>'__idempotency_key')::uuid;

      v_payment_result:=public.cl_2b_record_contribution(
        p_payment_id=>v_idempotency_key,
        p_group_id=>v_group_id,
        p_member_id=>v_member_id,
        p_amount=>v_amount,
        p_contribution_date=>v_contribution_date,
        p_contribution_type=>v_contribution_type,
        p_payment_method=>v_payment_method,
        p_reference=>v_reference,
        p_mpesa_reference=>v_mpesa_reference,
        p_goal_id=>v_goal_id,
        p_notes=>v_notes
      );

      v_target_id:=coalesce(
        nullif(v_payment_result->>'payment_id','')::uuid,
        v_idempotency_key
      );

      IF NOT EXISTS (
        SELECT 1
        FROM public.contributions c
        WHERE c.id=v_target_id
          AND c.group_id=v_group_id
          AND c.member_id=v_member_id
          AND c.amount=v_amount
          AND c.contribution_date=v_contribution_date
      ) THEN
        RAISE EXCEPTION
          'Atomic verification failed for contribution row %',
          v_row.source_row_number;
      END IF;

      v_contributions:=v_contributions+1;

    ELSE
      v_amount:=(v_normalized->>'amount')::numeric;
      v_expense_date:=(v_normalized->>'date')::date;
      v_expense_description:=
        v_normalized->>'description';
      v_expense_category:=coalesce(
        nullif(trim(v_normalized->>'category'),''),
        'other'
      );
      v_expense_status:=coalesce(
        nullif(trim(v_normalized->>'approval_status'),''),
        'pending'
      );
      v_receipt_url:=nullif(
        v_normalized->>'receipt_url',''
      );
      v_idempotency_key:=
        (v_normalized->>'__idempotency_key')::uuid;

      SELECT e.*
        INTO v_existing
      FROM public.expenses e
      WHERE e.id=v_idempotency_key
      FOR UPDATE;

      IF FOUND THEN
        IF v_existing.group_id IS DISTINCT FROM v_group_id
           OR v_existing.description IS DISTINCT FROM
              v_expense_description
           OR v_existing.category IS DISTINCT FROM
              v_expense_category
           OR v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.date IS DISTINCT FROM v_expense_date
           OR v_existing.recorded_by IS DISTINCT FROM
              v_finance_member_id
           OR v_existing.receipt_url IS DISTINCT FROM
              v_receipt_url
           OR v_existing.approval_status IS DISTINCT FROM
              v_expense_status
        THEN
          RAISE EXCEPTION
            'Expense idempotency key already exists for a different expense';
        END IF;

        v_target_id:=v_existing.id;
      ELSE
        INSERT INTO public.expenses (
          id,group_id,description,category,amount,date,
          recorded_by,receipt_url,approval_status
        )
        VALUES (
          v_idempotency_key,v_group_id,v_expense_description,
          v_expense_category,v_amount,v_expense_date,
          v_finance_member_id,v_receipt_url,v_expense_status
        )
        RETURNING id INTO v_target_id;

        SELECT e.*
          INTO v_existing
        FROM public.expenses e
        WHERE e.id=v_target_id
        FOR UPDATE;

        IF v_existing.group_id IS DISTINCT FROM v_group_id
           OR v_existing.description IS DISTINCT FROM
              v_expense_description
           OR v_existing.category IS DISTINCT FROM
              v_expense_category
           OR v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.date IS DISTINCT FROM v_expense_date
           OR v_existing.recorded_by IS DISTINCT FROM
              v_finance_member_id
           OR v_existing.receipt_url IS DISTINCT FROM
              v_receipt_url
           OR v_existing.approval_status IS DISTINCT FROM
              v_expense_status
        THEN
          RAISE EXCEPTION
            'Atomic verification failed for expense row %',
            v_row.source_row_number;
        END IF;
      END IF;

      v_expenses:=v_expenses+1;
    END IF;

    UPDATE public.data_import_rows
    SET status='imported',
        target_id=v_target_id,
        error_message=NULL
    WHERE id=v_row.id
      AND batch_id=p_batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Could not mark import row % imported',
        v_row.source_row_number;
    END IF;

    v_imported:=v_imported+1;
    v_total_amount:=v_total_amount+v_amount;
  END LOOP;

  SELECT count(*),
         coalesce(
           sum((r.normalized_data->>'amount')::numeric),0
         )
    INTO v_expected_count,v_expected_amount
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id;

  SELECT count(*),
         coalesce(
           sum((r.normalized_data->>'amount')::numeric),0
         )
    INTO v_actual_count,v_actual_amount
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id
    AND lower(r.status)='imported'
    AND r.target_id IS NOT NULL;

  IF v_actual_count<>v_expected_count THEN
    RAISE EXCEPTION
      'Atomic staging verification failed: % of % rows imported',
      v_actual_count,v_expected_count;
  END IF;

  IF v_actual_amount IS DISTINCT FROM v_expected_amount THEN
    RAISE EXCEPTION
      'Atomic staging verification failed: amount mismatch';
  END IF;

  UPDATE public.data_import_batches
  SET status='completed',
      completed_at=now(),
      summary=jsonb_build_object(
        'candidate',true,
        'atomic',true,
        'entity_scope',
          jsonb_build_array('contribution','expense'),
        'total_rows',v_imported,
        'imported_rows',v_imported,
        'contributions',v_contributions,
        'expenses',v_expenses,
        'total_amount',v_total_amount
      )
  WHERE id=p_batch_id
    AND group_id=v_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Could not mark atomic batch completed';
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'atomic',true,
    'idempotent_replay',false,
    'batch_id',p_batch_id,
    'group_id',v_group_id,
    'imported_rows',v_imported,
    'contributions',v_contributions,
    'expenses',v_expenses,
    'total_amount',v_total_amount
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_actor(p_group_id uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.cl_group_module_enabled(p_group_id, 'loans') then
    raise exception 'Loans is disabled for this group' using errcode='42501';
  end if;
  select m.id into v_member_id from public.members m
  where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.created_at limit 1;
  if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
  if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then
    raise exception 'View only: you do not have permission to manage loans' using errcode='42501';
  end if;
  return v_member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_apply(p_group_id uuid, p_requested_amount numeric, p_period_months integer, p_purpose text, p_guarantor_member_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid; v_settings public.loan_settings%rowtype; v_id uuid;
begin
  v_member_id := public.cl_loan_actor(p_group_id, false);
  if p_requested_amount is null or p_requested_amount <= 0 or p_period_months is null or p_period_months < 1
    or length(btrim(coalesce(p_purpose,''))) < 3 or length(btrim(p_purpose)) > 2000 then
    raise exception 'Enter a valid amount, period and purpose' using errcode='22023';
  end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings have not been configured by the Admin' using errcode='P0002'; end if;
  if p_requested_amount > v_settings.max_loan_amount then raise exception 'Requested amount exceeds the group maximum' using errcode='22023'; end if;
  if p_period_months > v_settings.max_period_months then raise exception 'Requested period exceeds the group maximum' using errcode='22023'; end if;
  if p_guarantor_member_id is not null and not exists(select 1 from public.members m where m.id=p_guarantor_member_id
    and m.group_id=p_group_id and m.id<>v_member_id and m.status='active' and m.onboarding_status='active') then
    raise exception 'Guarantor must be another active member of this group' using errcode='22023';
  end if;
  insert into public.loan_applications(group_id,member_id,requested_amount,period_months,purpose,guarantor_member_id)
  values(p_group_id,v_member_id,p_requested_amount,p_period_months,btrim(p_purpose),p_guarantor_member_id)
  returning id into v_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_member_id,'submit_loan_application','loan_application',v_id::text,
    jsonb_build_object('requested_amount',p_requested_amount,'period_months',p_period_months));
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_disburse(p_group_id uuid, p_loan_id uuid, p_disbursed_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_i integer; v_principal numeric(14,2); v_interest numeric(14,2); v_opening numeric(14,2);
  v_principal_each numeric(14,2); v_remaining numeric(14,2); v_total_interest numeric(14,2);
  v_due date; v_schedule_total numeric(14,2);
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer']::text[]) then
    raise exception 'Only Admin, Chairperson or Treasurer can disburse an approved loan' using errcode='42501';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status <> 'approved' then raise exception 'Only approved loans can be disbursed' using errcode='55000'; end if;
  if exists(select 1 from public.loan_repayment_schedule where loan_id=p_loan_id) then raise exception 'Repayment schedule already exists' using errcode='55000'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  v_principal := v_loan.approved_amount;
  v_principal_each := round(v_principal / v_loan.period_months,2);
  v_remaining := v_principal;
  for v_i in 1..v_loan.period_months loop
    v_due := (p_disbursed_date + make_interval(months => v_i))::date;
    if v_i = v_loan.period_months then
      v_opening := v_remaining;
      v_principal_each := v_remaining;
    else
      v_opening := v_remaining;
    end if;
    if v_loan.interest_type_snapshot='flat' then
      v_interest := round(v_principal * v_loan.interest_rate_snapshot / 100 / 12,2);
    else
      v_interest := round(v_opening * v_loan.interest_rate_snapshot / 100 / 12,2);
    end if;
    insert into public.loan_repayment_schedule(group_id,loan_id,installment_no,due_date,principal_due,interest_due,status)
    values(p_group_id,p_loan_id,v_i,v_due,v_principal_each,v_interest,'pending');
    v_remaining := round(v_remaining-v_principal_each,2);
  end loop;
  select coalesce(sum(interest_due),0) into v_total_interest from public.loan_repayment_schedule where loan_id=p_loan_id;
  update public.loan_applications set status='active',disbursed_by=auth.uid(),disbursed_at=p_disbursed_date::timestamptz,
    updated_at=now() where id=p_loan_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'disburse_loan','loan_application',p_loan_id::text,
    jsonb_build_object('principal',v_principal,'interest_total',v_total_interest,'period_months',v_loan.period_months,'disbursed_date',p_disbursed_date));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_emit_notification(p_group_id uuid, p_recipient_member_id uuid, p_loan_id uuid, p_event_type text, p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_recipient_member_id is null or not exists (
    select 1 from public.groups g where g.id = p_group_id and g.loans_enabled = true
  ) then return; end if;
  insert into public.loan_notifications(group_id,recipient_member_id,loan_id,event_type,title,message)
  values(p_group_id,p_recipient_member_id,p_loan_id,p_event_type,p_title,p_message);
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_guard_approval_office()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member public.members%rowtype;
  v_member_count integer;
  v_position text;
  v_position_name text;
  v_slot text;
begin
  if auth.uid() is null or new.approver_user_id <> auth.uid() then
    raise exception 'A loan approval must be submitted by the signed-in official' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';
  if v_member_count<>1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_member
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position='treasurer' or v_position_name='treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Your declared group office is not eligible to approve loans' using errcode='42501';
  end if;

  if v_slot<>new.approval_slot then
    raise exception 'The approval slot must match your declared group office' using errcode='42501';
  end if;

  if exists (
    select 1 from public.loan_applications l
    where l.id=new.loan_id and l.group_id=new.group_id and l.member_id=v_member.id
  ) then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_guard_disbursement_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
  if new.status='active' and old.status is distinct from 'active' then
    select count(*) into v_count from public.loan_approvals a
    where a.loan_id=new.id and a.group_id=new.group_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_count<>3 or exists(select 1 from public.loan_approvals a where a.loan_id=new.id and a.decision='rejected') then
      raise exception 'Loan disbursement blocked: Chairperson, Treasurer and Secretary approvals are all required' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$



CREATE OR REPLACE FUNCTION public.cl_loan_guard_repayment_recorder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.group_id=new.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member_name text;
  v_event text;
  v_title text;
  v_message text;
  v_recipient_member_id uuid;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then
    return new;
  end if;

  select coalesce(m.name,'A member') into v_member_name
  from public.members m where m.id = new.member_id and m.group_id = new.group_id;

  if tg_op = 'INSERT' then
    perform public.cl_loan_emit_notification(
      new.group_id,new.member_id,new.id,'application_submitted',
      'Loan application submitted',
      'Your loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || ' has been submitted.'
    );
    for v_recipient_member_id in
      select distinct m.id
      from public.members m
      where m.group_id = new.group_id
        and lower(coalesce(m.status,'active')) = 'active'
        and lower(coalesce(m.onboarding_status,'active')) = 'active'
        and (
          lower(coalesce(m.role,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position_name,'')) in ('admin','administrator','chairperson','secretary')
        )
    loop
      perform public.cl_loan_emit_notification(
        new.group_id,v_recipient_member_id,new.id,'application_submitted','New loan application',
        v_member_name || ' submitted a loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || '.'
      );
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      v_event := 'application_approved'; v_title := 'Loan application approved';
      v_message := 'Your loan application for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' was approved.';
    elsif new.status = 'rejected' then
      v_event := 'application_rejected'; v_title := 'Loan application not approved';
      v_message := 'Your loan application was not approved.' || case when nullif(btrim(new.decision_note),'') is not null then ' Reason: ' || btrim(new.decision_note) else '' end;
    elsif new.status = 'active' then
      v_event := 'loan_disbursed'; v_title := 'Loan disbursed';
      v_message := 'Your loan for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' has been disbursed. Your repayment schedule is available in Loans.';
    elsif new.status = 'cleared' then
      v_event := 'loan_cleared'; v_title := 'Loan cleared';
      v_message := 'Your loan has been fully repaid and cleared.';
    else
      return new;
    end if;
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,v_event,v_title,v_message);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_repayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid; v_amount text;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then return new; end if;
  select l.member_id into v_member_id from public.loan_applications l where l.id = new.loan_id and l.group_id = new.group_id;
  v_amount := to_char(new.amount,'FM999999999990.00');
  perform public.cl_loan_emit_notification(
    new.group_id,v_member_id,new.loan_id,'repayment_recorded','Loan repayment recorded',
    'A repayment of KES ' || v_amount || ' was recorded on ' || new.payment_date::text || '.'
  );
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_repayment_id uuid; v_remaining numeric(14,2); v_total_outstanding numeric(14,2);
  r record; v_penalty_alloc numeric(14,2); v_interest_alloc numeric(14,2); v_principal_alloc numeric(14,2);
  v_new_paid numeric(14,2); v_cleared boolean;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
    raise exception 'You do not have permission to record loan repayments' using errcode='42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_payment_method not in ('cash','mpesa','bank','other') then
    raise exception 'Enter a positive repayment amount and valid payment method' using errcode='22023';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan not found' using errcode='P0002'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Repayments can only be recorded for active loans' using errcode='55000'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if v_settings.late_penalty > 0 then
    update public.loan_repayment_schedule s set penalty_due=v_settings.late_penalty
    where s.loan_id=p_loan_id and s.group_id=p_group_id and s.due_date < p_payment_date
      and s.penalty_due=0 and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due;
  end if;

  select coalesce(sum(principal_due+interest_due+penalty_due-amount_paid),0)
    into v_total_outstanding
  from public.loan_repayment_schedule where loan_id=p_loan_id and group_id=p_group_id;
  if p_amount > v_total_outstanding then
    raise exception 'Repayment exceeds the outstanding loan balance (%). No payment was recorded.', v_total_outstanding using errcode='22023';
  end if;

  insert into public.loan_repayments(group_id,loan_id,amount,payment_date,payment_method,reference,note,recorded_by)
  values(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,
    nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_note,'')),''),auth.uid())
  returning id into v_repayment_id;
  v_remaining := p_amount;

  for r in
    select s.*,
      coalesce(a.principal_paid,0) as principal_paid,
      coalesce(a.interest_paid,0) as interest_paid,
      coalesce(a.penalty_paid,0) as penalty_paid
    from public.loan_repayment_schedule s
    left join (
      select schedule_id, sum(principal_amount) principal_paid,
        sum(interest_amount) interest_paid, sum(penalty_amount) penalty_paid
      from public.loan_repayment_allocations group by schedule_id
    ) a on a.schedule_id=s.id
    where s.loan_id=p_loan_id and s.group_id=p_group_id
      and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due
    order by s.due_date,s.installment_no
    for update of s
  loop
    exit when v_remaining <= 0;
    v_penalty_alloc := least(v_remaining,greatest(r.penalty_due-r.penalty_paid,0));
    v_remaining := v_remaining-v_penalty_alloc;
    v_interest_alloc := least(v_remaining,greatest(r.interest_due-r.interest_paid,0));
    v_remaining := v_remaining-v_interest_alloc;
    v_principal_alloc := least(v_remaining,greatest(r.principal_due-r.principal_paid,0));
    v_remaining := v_remaining-v_principal_alloc;

    if v_penalty_alloc+v_interest_alloc+v_principal_alloc > 0 then
      insert into public.loan_repayment_allocations(group_id,repayment_id,loan_id,schedule_id,principal_amount,interest_amount,penalty_amount)
      values(p_group_id,v_repayment_id,p_loan_id,r.id,v_principal_alloc,v_interest_alloc,v_penalty_alloc);
      v_new_paid := r.amount_paid+v_penalty_alloc+v_interest_alloc+v_principal_alloc;
      update public.loan_repayment_schedule set amount_paid=v_new_paid,
        status=case when v_new_paid >= principal_due+interest_due+penalty_due then 'paid'
                    when due_date < p_payment_date then 'overdue' else 'partial' end,
        paid_at=case when v_new_paid >= principal_due+interest_due+penalty_due then now() else null end
      where id=r.id;
    end if;
  end loop;

  select not exists(select 1 from public.loan_repayment_schedule s where s.loan_id=p_loan_id
    and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due) into v_cleared;
  if v_cleared then
    update public.loan_applications set status='cleared',cleared_at=now(),updated_at=now() where id=p_loan_id;
  else
    update public.loan_applications set status=case when exists(select 1 from public.loan_repayment_schedule s
      where s.loan_id=p_loan_id and s.due_date < p_payment_date and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due)
      then 'overdue' else 'active' end, updated_at=now() where id=p_loan_id;
  end if;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'record_loan_repayment','loan_repayment',v_repayment_id::text,
    jsonb_build_object('loan_id',p_loan_id,'amount',p_amount,'payment_date',p_payment_date,
      'payment_method',p_payment_method,'unallocated_amount',v_remaining));
  return v_repayment_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment_authorized(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.cl_loan_actor(p_group_id,true);
  if not exists (
    select 1 from public.members m
    where m.group_id=p_group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return public.cl_loan_record_repayment(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,p_reference,p_note);
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_refresh_statuses(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_count integer;
begin
 v_actor_member_id:=public.cl_loan_actor(p_group_id,false);
 update public.loan_applications l set status=case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
    and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue'
  else 'active' end, updated_at=now()
 where l.group_id=p_group_id and l.status in ('active','overdue')
 and l.status is distinct from case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
   and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue' else 'active' end;
 get diagnostics v_count=row_count;
 if v_count>0 then
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'refresh_loan_statuses','loan_application',jsonb_build_object('updated_count',v_count));
 end if;
 return v_count;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_loan_review(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype; v_amount numeric(14,2);
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='22023'; end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status <> 'submitted' then raise exception 'Only submitted applications can be reviewed' using errcode='55000'; end if;
  if p_decision='rejected' and length(btrim(coalesce(p_decision_note,'')))=0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;
  v_amount := coalesce(p_approved_amount,v_loan.requested_amount);
  if p_decision='approved' and (v_amount <= 0 or v_amount > v_loan.requested_amount or v_amount > v_settings.max_loan_amount) then
    raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
  end if;
  update public.loan_applications set status=p_decision, decision_note=nullif(btrim(coalesce(p_decision_note,'')),''),
    approved_amount=case when p_decision='approved' then v_amount else null end,
    interest_rate_snapshot=case when p_decision='approved' then v_settings.interest_rate else null end,
    interest_type_snapshot=case when p_decision='approved' then v_settings.interest_type else null end,
    approved_by=auth.uid(), approved_at=now(), updated_at=now()
  where id=p_loan_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',p_decision,'approved_amount',case when p_decision='approved' then v_amount else null end,
      'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_review_authorized(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid;
  v_approver public.members%rowtype;
  v_loan public.loan_applications%rowtype;
  v_settings public.loan_settings%rowtype;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
  v_technical_role text;
  v_amount numeric(14,2);
  v_approvals integer;
  v_status text;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);

  if lower(btrim(coalesce(p_decision,''))) not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;
  if lower(btrim(coalesce(p_decision,''))) = 'rejected'
     and length(btrim(coalesce(p_decision_note,''))) = 0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;

  select * into v_loan
  from public.loan_applications
  where id = p_loan_id and group_id = p_group_id
  for update;
  if not found then
    raise exception 'Loan application not found' using errcode='P0002';
  end if;
  if v_loan.status <> 'submitted' then
    raise exception 'Only pending loan applications can receive an office decision' using errcode='55000';
  end if;
  if v_loan.member_id = v_actor_member_id then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';
  if v_member_count <> 1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_approver
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_technical_role := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.role,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position = 'treasurer' or v_position_name = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  elsif v_technical_role in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_technical_role = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_technical_role in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Only the designated Chairperson, Treasurer or Secretary can decide loan applications' using errcode='42501';
  end if;

  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approver_user_id=auth.uid()) then
    raise exception 'You have already submitted a decision for this loan' using errcode='55000';
  end if;
  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approval_slot=v_slot) then
    raise exception 'Another official has already filled the % approval slot', v_slot using errcode='55000';
  end if;

  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;

  if lower(p_decision)='approved' then
    v_amount := coalesce(p_approved_amount,v_loan.approved_amount,v_loan.requested_amount);
    if v_amount<=0 or v_amount>v_loan.requested_amount or v_amount>v_settings.max_loan_amount then
      raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
    end if;
    if v_loan.approved_amount is not null and v_loan.approved_amount<>v_amount then
      raise exception 'All three officials must approve the same loan amount (% KES)',v_loan.approved_amount using errcode='22023';
    end if;
  else
    v_amount := null;
  end if;

  insert into public.loan_approvals(loan_id,group_id,approver_user_id,approval_slot,decision,note)
  values(p_loan_id,p_group_id,auth.uid(),v_slot,lower(p_decision),nullif(btrim(coalesce(p_decision_note,'')), ''));

  if lower(p_decision)='rejected' then
    v_status := 'rejected';
    update public.loan_applications set status='rejected',
      decision_note=nullif(btrim(coalesce(p_decision_note,'')), ''),
      approved_amount=null, interest_rate_snapshot=null, interest_type_snapshot=null,
      approved_by=null, approved_at=null, updated_at=now()
    where id=p_loan_id;
  else
    if v_loan.approved_amount is null then
      update public.loan_applications set approved_amount=v_amount,
        interest_rate_snapshot=v_settings.interest_rate, interest_type_snapshot=v_settings.interest_type,
        updated_at=now() where id=p_loan_id;
    end if;
    select count(*) into v_approvals from public.loan_approvals a
    where a.loan_id=p_loan_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_approvals=3 and not exists(select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='rejected') then
      v_status := 'approved';
      update public.loan_applications set status='approved', decision_note=null,
        approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=p_loan_id;
    else
      v_status := 'submitted';
    end if;
  end if;

  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',lower(p_decision),'approval_slot',v_slot,'approval_status',v_status,
      'approved_slots',(select count(*) from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='approved'),
      'required_slots',3,'approved_amount',case when lower(p_decision)='approved' then v_amount else null end,'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_update_settings(p_group_id uuid, p_interest_rate numeric, p_interest_type text, p_max_loan_amount numeric, p_max_period_months integer, p_late_penalty numeric)
 RETURNS loan_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_row public.loan_settings;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin']::text[]) then
    raise exception 'Only the group Admin can change loan settings' using errcode='42501';
  end if;
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > 100
    or p_interest_type not in ('flat','reducing_balance')
    or p_max_loan_amount is null or p_max_loan_amount <= 0
    or p_max_period_months is null or p_max_period_months < 1 or p_max_period_months > 120
    or p_late_penalty is null or p_late_penalty < 0 then
    raise exception 'Invalid loan settings' using errcode='22023';
  end if;
  insert into public.loan_settings(group_id,interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty,updated_by,updated_at)
  values(p_group_id,p_interest_rate,p_interest_type,p_max_loan_amount,p_max_period_months,p_late_penalty,auth.uid(),now())
  on conflict(group_id) do update set interest_rate=excluded.interest_rate, interest_type=excluded.interest_type,
    max_loan_amount=excluded.max_loan_amount, max_period_months=excluded.max_period_months,
    late_penalty=excluded.late_penalty, updated_by=excluded.updated_by, updated_at=now()
  returning * into v_row;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'update_loan_settings','loan_settings',p_group_id::text,
    jsonb_build_object('interest_rate',p_interest_rate,'interest_type',p_interest_type,'max_loan_amount',p_max_loan_amount,
      'max_period_months',p_max_period_months,'late_penalty',p_late_penalty));
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_apply_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; v_cycle public.merry_go_round_cycles%rowtype; v_active_count integer; v_pref_count integer;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then raise exception 'Your role cannot finalize member payout choices' using errcode='42501'; end if;
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null or v_cycle.payout_order_method<>'member_chosen' then raise exception 'Member-chosen cycle not found' using errcode='P0002'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and (status<>'pending' or due_date<=current_date)) then raise exception 'Payout choices can only be applied before the first round starts' using errcode='22023'; end if;
 select count(*) into v_active_count from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 select count(*) into v_pref_count from public.merry_go_round_preferences where group_id=p_group_id and cycle_id=p_cycle_id;
 if v_pref_count<>v_active_count then raise exception 'Every active member must choose a unique round first (% of % submitted)',v_pref_count,v_active_count using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences p where p.cycle_id=p_cycle_id and (p.preferred_round_number<1 or p.preferred_round_number>v_cycle.number_of_rounds)) then raise exception 'Invalid preferred round' using errcode='22023'; end if;
 update public.merry_go_round_rounds r set recipient_member_id=p.member_id
 from public.merry_go_round_preferences p where r.cycle_id=p_cycle_id and p.cycle_id=p_cycle_id and r.round_number=p.preferred_round_number;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'apply_member_payout_choices','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('preference_count',v_pref_count));
 return true;
end; $function$



CREATE OR REPLACE FUNCTION public.cl_merry_authorize(p_group_id uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.merry_go_round_enabled) then
   raise exception 'Merry-go-round is disabled for this group' using errcode='42501';
 end if;
 select m.id into v_member_id from public.members m where m.group_id=p_group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active'
 order by m.created_at limit 1;
 if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
 if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
   raise exception 'View-only: you do not have permission to manage merry-go-round' using errcode='42501';
 end if;
 return v_member_id;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_choose_round(p_group_id uuid, p_cycle_id uuid, p_round_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid; v_cycle public.merry_go_round_cycles%rowtype;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null then raise exception 'Cycle not found' using errcode='P0002'; end if;
 if v_cycle.payout_order_method<>'member_chosen' then raise exception 'This cycle does not use member-chosen payout order' using errcode='22023'; end if;
 if v_cycle.status<>'active' or p_round_number<1 or p_round_number>v_cycle.number_of_rounds then raise exception 'Invalid payout round choice' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and due_date<=current_date) then raise exception 'Choices are closed after the first round starts' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences where cycle_id=p_cycle_id and preferred_round_number=p_round_number and member_id<>v_member) then raise exception 'That round has already been chosen by another member. Choose another round.' using errcode='23505'; end if;
 insert into public.merry_go_round_preferences(group_id,cycle_id,member_id,preferred_round_number) values(p_group_id,p_cycle_id,v_member,p_round_number)
 on conflict(cycle_id,member_id) do update set preferred_round_number=excluded.preferred_round_number,updated_at=now();
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_member,'choose_payout_round','merry_go_round_preference',p_cycle_id::text,jsonb_build_object('preferred_round_number',p_round_number));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_complete_payout(p_group_id uuid, p_round_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; r public.merry_go_round_rounds%rowtype; v_recipient_name text;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 select * into r from public.merry_go_round_rounds where id=p_round_id and group_id=p_group_id for update;
 if r.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if r.status='completed' then return true; end if;
 if exists(select 1 from public.merry_go_round_payments p where p.round_id=r.id and p.status<>'paid') then
  raise exception 'All round contributions must be paid before payout' using errcode='22023';
 end if;
 update public.merry_go_round_rounds set status='completed',payout_recorded_at=now(),payout_recorded_by=auth.uid() where id=r.id;
 update public.merry_go_round_cycles set status='completed',updated_at=now()
 where id=r.cycle_id and not exists(select 1 from public.merry_go_round_rounds x where x.cycle_id=r.cycle_id and x.status<>'completed');
 select name into v_recipient_name from public.members where id=r.recipient_member_id;
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,r.cycle_id,r.id,r.recipient_member_id,'payout_recorded','Your merry-go-round payout of '||r.payout_amount||' has been recorded.',r.due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'complete_payout','merry_go_round_round',r.id::text,jsonb_build_object('recipient_member_id',r.recipient_member_id,'recipient_name',v_recipient_name,'payout_amount',r.payout_amount));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_create_cycle(p_group_id uuid, p_name text, p_contribution_amount numeric, p_frequency text, p_start_date date, p_number_of_rounds integer, p_payout_order_method text, p_member_order uuid[] DEFAULT NULL::uuid[], p_late_fine_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; v_cycle uuid; v_members uuid[]; v_order uuid[]; v_count integer; i integer; v_due date; v_round uuid;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Not authorized to create cycle' using errcode='42501'; end if;
 if nullif(btrim(p_name),'') is null or p_contribution_amount<=0 or p_number_of_rounds<1 or p_frequency not in ('weekly','monthly') or p_payout_order_method not in ('admin','random','member_chosen') or coalesce(p_late_fine_amount,0)<0 then raise exception 'Invalid cycle settings' using errcode='22023'; end if;
 select array_agg(id order by created_at,id) into v_members from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 v_count:=coalesce(array_length(v_members,1),0);
 if v_count<2 then raise exception 'At least two active members are required' using errcode='22023'; end if;
 if p_number_of_rounds<>v_count then raise exception 'Number of rounds must match active member count (%).',v_count using errcode='22023'; end if;
 if p_payout_order_method='admin' then
  if coalesce(array_length(p_member_order,1),0)<>v_count then raise exception 'Provide the complete payout order' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_member_order) x)<>v_count or not (p_member_order @> v_members and v_members @> p_member_order) then raise exception 'Payout order must include every active member exactly once' using errcode='22023'; end if;
  v_order:=p_member_order;
 else select array_agg(id order by random()) into v_order from unnest(v_members) id;
 end if;
 insert into public.merry_go_round_cycles(group_id,name,contribution_amount,frequency,start_date,number_of_rounds,payout_order_method,late_fine_amount,created_by)
 values(p_group_id,btrim(p_name),p_contribution_amount,p_frequency,p_start_date,p_number_of_rounds,p_payout_order_method,coalesce(p_late_fine_amount,0),auth.uid()) returning id into v_cycle;
 for i in 1..p_number_of_rounds loop
  v_due:=case when p_frequency='weekly' then p_start_date+((i-1)*7) else (p_start_date + ((i-1)||' months')::interval)::date end;
  insert into public.merry_go_round_rounds(group_id,cycle_id,round_number,due_date,recipient_member_id,payout_amount) values(p_group_id,v_cycle,i,v_due,v_order[i],p_contribution_amount*v_count) returning id into v_round;
  insert into public.merry_go_round_payments(group_id,cycle_id,round_id,member_id,amount_due,late_fine_amount) select p_group_id,v_cycle,v_round,m,p_contribution_amount,0 from unnest(v_members) m;
  insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date) select p_group_id,v_cycle,v_round,m,'round_due','Merry-go-round contribution due for round '||i,v_due from unnest(v_members) m;
 end loop;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'create','merry_go_round_cycle',v_cycle::text,jsonb_build_object('name',p_name,'contribution_amount',p_contribution_amount,'frequency',p_frequency,'number_of_rounds',p_number_of_rounds,'payout_order_method',p_payout_order_method,'late_fine_amount',coalesce(p_late_fine_amount,0)));
 return v_cycle;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_delete_cycle(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_cycle public.merry_go_round_cycles%rowtype;
  v_round_count integer;
  v_payment_count integer;
begin
  v_actor := public.cl_merry_authorize(p_group_id, true);

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only the group Admin can delete a merry-go-round cycle' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id
  for update;

  if v_cycle.id is null then
    raise exception 'Cycle not found in this group' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.merry_go_round_payments p
    where p.cycle_id = p_cycle_id
      and (coalesce(p.amount_paid, 0) > 0 or p.status = 'paid' or p.recorded_by is not null)
  ) then
    raise exception 'This cycle has recorded payment activity. It cannot be deleted; keep its payment history.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.merry_go_round_rounds r
    where r.cycle_id = p_cycle_id
      and (r.status = 'completed' or r.payout_recorded_at is not null or r.payout_recorded_by is not null)
  ) then
    raise exception 'This cycle has a recorded payout or completed round and cannot be deleted.' using errcode = '22023';
  end if;

  select count(*) into v_round_count
  from public.merry_go_round_rounds where cycle_id = p_cycle_id;
  select count(*) into v_payment_count
  from public.merry_go_round_payments where cycle_id = p_cycle_id;

  insert into public.group_audit_log(
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor, 'delete', 'merry_go_round_cycle', p_cycle_id::text,
    jsonb_build_object(
      'name', v_cycle.name,
      'status', v_cycle.status,
      'number_of_rounds', v_cycle.number_of_rounds,
      'round_count', v_round_count,
      'payment_record_count', v_payment_count
    )
  );

  delete from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_list_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, preferred_round_number integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform public.cl_merry_authorize(p_group_id,false);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Only group officials can view all payout choices' using errcode='42501'; end if;
 return query select p.member_id,m.name,p.preferred_round_number,p.updated_at
 from public.merry_go_round_preferences p join public.members m on m.id=p.member_id
 where p.group_id=p_group_id and p.cycle_id=p_cycle_id order by p.preferred_round_number,m.name;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_record_payment(p_group_id uuid, p_payment_id uuid, p_amount numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; p public.merry_go_round_payments%rowtype; v_status text; v_due_date date; v_fine numeric; v_late boolean;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if p_amount<0 then raise exception 'Amount cannot be negative' using errcode='22023'; end if;
 select * into p from public.merry_go_round_payments where id=p_payment_id and group_id=p_group_id for update;
 if p.id is null then raise exception 'Payment entry not found' using errcode='P0002'; end if;
 select r.due_date,c.late_fine_amount into v_due_date,v_fine from public.merry_go_round_rounds r join public.merry_go_round_cycles c on c.id=r.cycle_id where r.id=p.round_id;
 if p_amount>p.amount_due then raise exception 'Payment exceeds the contribution amount due' using errcode='22023'; end if;
 v_late:=current_date>v_due_date;
 v_status:=case when p_amount>=p.amount_due then 'paid' when v_late then 'late' else 'pending' end;
 update public.merry_go_round_payments set amount_paid=p_amount,status=v_status,paid_at=case when v_status='paid' then now() else null end,
 late_fine_amount=case when v_late then coalesce(v_fine,0) else 0 end,
 recorded_by=auth.uid(),updated_at=now() where id=p_payment_id;
 update public.merry_go_round_rounds r set status=case when not exists(select 1 from public.merry_go_round_payments x where x.round_id=r.id and x.status<>'paid') then 'ready_for_payout' else 'pending' end where r.id=p.round_id and r.status<>'completed';
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,p.cycle_id,p.round_id,p.member_id,
 case when v_late then 'payment_late' when v_status='paid' then 'payment_recorded' else 'payment_updated' end,
 case when v_late then 'Your merry-go-round contribution was recorded after its due date. Applicable late fine: KES '||coalesce(v_fine,0)||'.'
      when v_status='paid' then 'Your merry-go-round contribution has been marked paid.'
      else 'Your merry-go-round payment status was updated.' end,v_due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'record_payment','merry_go_round_payment',p_payment_id::text,
 jsonb_build_object('amount_paid',p_amount,'status',v_status,'late_fine_amount',case when v_late then coalesce(v_fine,0) else 0 end));
 return v_status;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_swap_recipients(p_group_id uuid, p_cycle_id uuid, p_round_a integer, p_round_b integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; a public.merry_go_round_rounds%rowtype; b public.merry_go_round_rounds%rowtype;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then
   raise exception 'Your role cannot change payout order' using errcode='42501';
 end if;
 select * into a from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_a for update;
 select * into b from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_b for update;
 if a.id is null or b.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if a.status<>'pending' or b.status<>'pending' or a.due_date<=current_date or b.due_date<=current_date then raise exception 'Payout order can only change before both rounds start' using errcode='22023'; end if;
 update public.merry_go_round_rounds set recipient_member_id=case when id=a.id then b.recipient_member_id else a.recipient_member_id end where id in (a.id,b.id);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'swap_payout_order','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('round_a',p_round_a,'round_b',p_round_b));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_tracking(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(round_id uuid, round_number integer, due_date date, recipient_member_id uuid, recipient_name text, round_status text, payout_amount numeric, paid_count bigint, pending_count bigint, late_count bigint, member_payments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 if not exists(select 1 from public.merry_go_round_cycles c where c.id=p_cycle_id and c.group_id=p_group_id) then raise exception 'Cycle not found' using errcode='P0002'; end if;
 return query
 select r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount,
 count(p.id) filter(where p.status='paid'),
 count(p.id) filter(where p.status<>'paid' and current_date<=r.due_date),
 count(p.id) filter(where p.status<>'paid' and current_date>r.due_date),
 jsonb_agg(jsonb_build_object('payment_id',p.id,'member_id',p.member_id,'member_name',pm.name,'amount_due',p.amount_due,'amount_paid',p.amount_paid,'late_fine_amount',p.late_fine_amount,'status',case when p.status<>'paid' and current_date>r.due_date then 'late' else p.status end) order by pm.name)
 from public.merry_go_round_rounds r join public.members m on m.id=r.recipient_member_id
 join public.merry_go_round_payments p on p.round_id=r.id join public.members pm on pm.id=p.member_id
 where r.group_id=p_group_id and r.cycle_id=p_cycle_id
 group by r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount order by r.round_number;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_user_has_role(p_group_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(array_agg(CASE lower(btrim(r))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(r)) END), ARRAY[]::text[]) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    CROSS JOIN requested q
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
      AND (
        CASE lower(btrim(coalesce(m.actual_position, '')))
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice secretary' THEN 'secretary'
          ELSE CASE lower(btrim(coalesce(m.role, 'member')))
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE lower(btrim(coalesce(m.role, 'member')))
          END
        END
      ) = ANY(q.roles)
  );
$function$



CREATE OR REPLACE FUNCTION public.cl_user_in_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
  );
$function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_assigned_group uuid; v_creator_group uuid; v_plan_group uuid; BEGIN IF NEW.assigned_to IS NOT NULL THEN SELECT m.group_id INTO v_assigned_group FROM public.members m WHERE m.id=NEW.assigned_to; IF v_assigned_group IS NULL OR v_assigned_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity assignee does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity plan does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Asset creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; v_plan_group uuid; v_document_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone plan does not belong to this group'; END IF; END IF; IF NEW.document_id IS NOT NULL THEN SELECT d.group_id INTO v_document_group FROM public.documents d WHERE d.id=NEW.document_id; IF v_document_group IS NULL OR v_document_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone document does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Plan creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_support_case()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_member_group uuid; v_approved_group uuid; v_created_group uuid; v_expense_group uuid; BEGIN SELECT m.group_id INTO v_member_group FROM public.members m WHERE m.id=NEW.member_id; IF v_member_group IS NULL THEN RAISE EXCEPTION 'Support member does not exist'; END IF; IF v_member_group<>NEW.group_id THEN RAISE EXCEPTION 'Support member does not belong to this group'; END IF; IF NEW.approved_by IS NOT NULL THEN SELECT m.group_id INTO v_approved_group FROM public.members m WHERE m.id=NEW.approved_by; IF v_approved_group IS NULL OR v_approved_group<>NEW.group_id THEN RAISE EXCEPTION 'Support approver does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_created_group FROM public.members m WHERE m.id=NEW.created_by; IF v_created_group IS NULL OR v_created_group<>NEW.group_id THEN RAISE EXCEPTION 'Support creator does not belong to this group'; END IF; END IF; IF NEW.expense_id IS NOT NULL THEN SELECT e.group_id INTO v_expense_group FROM public.expenses e WHERE e.id=NEW.expense_id; IF v_expense_group IS NULL OR v_expense_group<>NEW.group_id THEN RAISE EXCEPTION 'Support expense does not belong to this group'; END IF; END IF; IF NEW.status='paid' AND NEW.expense_id IS NULL THEN RAISE EXCEPTION 'Paid support cases must reference an expense'; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.claim_member_account(p_membership_number text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_number text := trim(coalesce(p_membership_number,''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' or v_number = '' then
    raise exception 'Membership number and email are required';
  end if;

  select * into v_member
  from public.members m
  where lower(coalesce(m.email,'')) = v_email
    and (m.membership_number = v_number or m.member_number = v_number)
    and m.auth_user_id is null
    and m.onboarding_status in ('pending','invited')
    and lower(coalesce(m.status,'active')) = 'active'
  limit 1;

  if not found then
    raise exception 'No pending member account matches those details';
  end if;

  if exists (select 1 from public.members m where m.auth_user_id = v_uid) then
    raise exception 'This login is already linked to a member';
  end if;

  update public.members
  set user_id = v_uid,
      auth_user_id = v_uid,
      onboarding_status = 'active',
      activated_at = coalesce(activated_at, now())
  where id = v_member.id;

  return jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'group_id', v_member.group_id,
    'role', v_member.role,
    'name', v_member.name,
    'membership_number', v_member.membership_number
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.close_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'close_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='close_initiative'; RETURN v_existing; END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative is not active'; END IF;
  UPDATE public.contribution_initiatives SET status='closed',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','closed','initiative_id',v_i.id);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='close_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.close_financial_month(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods%rowtype;
  v_report jsonb;
  v_closing numeric;
  v_member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Group and month YYYY-MM are required';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION
      'You are not authorized to close financial months for this group';
  END IF;

  PERFORM public.cl_2b_accounting_lock(p_group_id,p_month);

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id
    AND fp.month=p_month
  FOR UPDATE;

  IF NOT FOUND THEN
    v_period := public.ensure_financial_period(
      p_group_id,p_month
    );
  END IF;

  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION
      'Financial month % is already closed',p_month;
  END IF;

  v_report := public.get_monthly_financial_report(
    p_group_id,p_month
  );

  v_closing :=
    coalesce((v_report->>'closing_balance')::numeric,0);

  UPDATE public.financial_periods
  SET closing_balance=v_closing,
      status='closed',
      closed_at=now(),
      closed_by=auth.uid()
  WHERE id=v_period.id;

  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=auth.uid() OR m.user_id=auth.uid())
  ORDER BY
    CASE WHEN m.auth_user_id=auth.uid() THEN 0 ELSE 1 END,
    m.id
  LIMIT 1;

  INSERT INTO public.monthly_closings (
    group_id,closing_month,closed_by,closed_at,
    total_expected,total_collected,total_expenses,
    closing_balance,notes
  )
  VALUES (
    p_group_id,
    (p_month||'-01')::date,
    auth.uid(),
    now(),
    coalesce(
      (v_report->>'expected_monthly_contributions')::numeric,0
    ),
    coalesce(
      (v_report->>'total_contributions_collected')::numeric,0
    ),
    coalesce((v_report->>'approved_expenses')::numeric,0),
    v_closing,
    'Closed through CHAMA LIVE financial period.'
  )
  ON CONFLICT (group_id,closing_month)
  DO UPDATE SET
    closed_by=EXCLUDED.closed_by,
    closed_at=EXCLUDED.closed_at,
    total_expected=EXCLUDED.total_expected,
    total_collected=EXCLUDED.total_collected,
    total_expenses=EXCLUDED.total_expenses,
    closing_balance=EXCLUDED.closing_balance,
    notes=EXCLUDED.notes;

  RETURN public.get_monthly_financial_report(
    p_group_id,p_month
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.close_month(p_group_id uuid, p_month text, p_notes text DEFAULT NULL::text)
 RETURNS monthly_closings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report jsonb;
  v_result public.monthly_closings;
BEGIN
  v_report := public.close_financial_month(p_group_id, p_month);

  IF p_notes IS NOT NULL THEN
    UPDATE public.monthly_closings
    SET notes = p_notes
    WHERE group_id = p_group_id
      AND closing_month = (p_month || '-01')::date;
  END IF;

  SELECT *
  INTO v_result
  FROM public.monthly_closings
  WHERE group_id = p_group_id
    AND closing_month = (p_month || '-01')::date
  LIMIT 1;

  RETURN v_result;
END;
$function$



CREATE OR REPLACE FUNCTION public.complete_group_onboarding(p_group_name text, p_monthly_contribution numeric, p_opening_balance numeric DEFAULT 0, p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare

  v_uid uuid := auth.uid();

  v_result jsonb;

begin

  if v_uid is null then
    raise exception 'Authentication required';
  end if;


  if lower(
    coalesce(p_role, 'admin')
  ) not in (
    'admin',
    'chairperson'
  ) then

    raise exception
      'Only admin or chairperson can create a group';

  end if;


  /*
   * Save the onboarding request against
   * the authenticated user.
   */

  perform public.save_pending_onboarding(

    p_group_name,

    'other',

    p_monthly_contribution,

    p_opening_balance,

    null,

    p_name,

    p_phone,

    'Kenya'

  );


  /*
   * If the user is already authenticated,
   * complete immediately.
   */

  v_result :=
    public.onboard_new_group();


  return
    v_result ||
    jsonb_build_object(
      'role',
      lower(
        coalesce(
          p_role,
          'admin'
        )
      )
    );

end;

$function$


CREATE OR REPLACE FUNCTION public.confirm_subscription_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_payment public.subscription_payments%ROWTYPE;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_cycle public.subscription_cycles%ROWTYPE;

    v_payment_ids uuid[];
    v_credit_ids uuid[];
    v_allocation_ids uuid[];
    v_lock_id uuid;

    v_applied_current numeric := 0;
    v_available_current numeric := 0;
    v_invoice_applied numeric := 0;
    v_invoice_outstanding numeric := 0;

    v_credit RECORD;
    v_credit_applied numeric;
    v_credit_remaining numeric;
    v_allocate numeric;
    v_now timestamptz := clock_timestamp();
BEGIN
    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not resolve to its authoritative invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_invoice.subscription_id
      AND gs.group_id = v_invoice.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % does not resolve to its authoritative subscription', v_invoice.id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.payment_id ORDER BY x.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
        UNION
        SELECT sp.id
        FROM public.subscription_payments AS sp
        JOIN public.subscription_credits AS c
          ON c.source_payment_id = sp.id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id
         AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    JOIN public.subscription_payments AS sp
      ON sp.id = c.source_payment_id
    JOIN public.subscription_invoices AS si
      ON si.id = sp.invoice_id
     AND si.group_id = sp.group_id
    WHERE c.status IN ('active', 'exhausted')
      AND si.subscription_id = v_subscription.id
      AND si.group_id = v_subscription.group_id;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chama_live_subscription:' || v_subscription.id::text,
            0
        )
    );

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_invoice.subscription_id
      AND gs.group_id = v_invoice.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % no longer resolves to its subscription', v_invoice.id
            USING ERRCODE = '23503';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND OR v_invoice.subscription_id <> v_subscription.id THEN
        RAISE EXCEPTION 'Payment % no longer resolves to its authoritative invoice/subscription', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.payment_id ORDER BY x.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
        UNION
        SELECT sp.id
        FROM public.subscription_payments AS sp
        JOIN public.subscription_credits AS c
          ON c.source_payment_id = sp.id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id
         AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    FOR v_lock_id IN
        SELECT unnest(v_payment_ids)
        ORDER BY 1
    LOOP
        PERFORM 1
        FROM public.subscription_payments AS sp
        WHERE sp.id = v_lock_id
        FOR UPDATE;
    END LOOP;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id
      AND si.subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % destination invoice is unavailable', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    JOIN public.subscription_payments AS sp
      ON sp.id = c.source_payment_id
    JOIN public.subscription_invoices AS si
      ON si.id = sp.invoice_id
     AND si.group_id = sp.group_id
    WHERE c.status IN ('active', 'exhausted')
      AND si.subscription_id = v_subscription.id
      AND si.group_id = v_subscription.group_id;

    IF v_credit_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT c.id
            FROM public.subscription_credits AS c
            WHERE c.id = ANY(v_credit_ids)
            ORDER BY c.created_at, c.id
        LOOP
            PERFORM 1
            FROM public.subscription_credits AS c
            WHERE c.id = v_lock_id
            FOR UPDATE;
        END LOOP;
    END IF;

    SELECT sc.* INTO v_cycle
    FROM public.subscription_cycles AS sc
    WHERE sc.id = v_invoice.cycle_id
      AND sc.subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % not found for subscription %',
            v_invoice.cycle_id, v_subscription.id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF v_payment.status = 'confirmed' THEN
        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_applied_current
        FROM public.subscription_payment_allocations AS a
        WHERE a.payment_id = v_payment.id;

        IF v_applied_current > v_payment.amount THEN
            RAISE EXCEPTION 'Payment % has allocations exceeding its source amount', v_payment.id;
        END IF;

        RETURN jsonb_build_object(
            'status', 'already_confirmed',
            'payment_id', v_payment.id,
            'invoice_id', v_invoice.id,
            'subscription_id', v_subscription.id,
            'payment_amount', v_payment.amount,
            'applied_amount', v_applied_current,
            'remaining_amount', GREATEST(v_payment.amount - v_applied_current, 0)
        );
    END IF;

    IF v_payment.status <> 'pending' THEN
        RAISE EXCEPTION 'Payment % cannot be confirmed from status %', v_payment.id, v_payment.status
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_applied_current
    FROM public.subscription_payment_allocations AS a
    WHERE a.payment_id = v_payment.id;

    IF v_applied_current <> 0 THEN
        RAISE EXCEPTION 'Pending payment % already has allocations', v_payment.id;
    END IF;

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_invoice_applied
    FROM public.subscription_payment_allocations AS a
    WHERE a.invoice_id = v_invoice.id;

    IF v_invoice_applied > v_invoice.total_amount THEN
        RAISE EXCEPTION 'Invoice % has allocations exceeding invoice total', v_invoice.id;
    END IF;

    v_invoice_outstanding := GREATEST(v_invoice.total_amount - v_invoice_applied, 0);

    FOR v_credit IN
        SELECT c.id, c.source_payment_id, c.original_amount, c.status, c.created_at,
               sp.amount AS source_payment_amount,
               si.subscription_id AS source_subscription_id,
               si.group_id AS source_group_id
        FROM public.subscription_credits AS c
        JOIN public.subscription_payments AS sp ON sp.id = c.source_payment_id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        ORDER BY c.created_at, c.id
    LOOP
        EXIT WHEN v_invoice_outstanding <= 0;

        IF v_credit.source_subscription_id <> v_subscription.id
           OR v_credit.source_group_id <> v_subscription.group_id THEN
            RAISE EXCEPTION 'Cross-subscription credit allocation rejected';
        END IF;

        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_credit_applied
        FROM public.subscription_payment_allocations AS a
        WHERE a.payment_id = v_credit.source_payment_id;

        IF v_credit_applied > v_credit.source_payment_amount THEN
            RAISE EXCEPTION 'Source payment % has allocations exceeding its amount', v_credit.source_payment_id;
        END IF;

        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_credit_applied
        FROM public.subscription_payment_allocations AS a
        WHERE a.credit_id = v_credit.id;

        IF v_credit_applied > v_credit.original_amount THEN
            RAISE EXCEPTION 'Credit % has allocations exceeding its original amount', v_credit.id;
        END IF;

        v_credit_remaining := GREATEST(v_credit.original_amount - v_credit_applied, 0);

        IF v_credit_remaining <= 0 THEN
            UPDATE public.subscription_credits
            SET status = 'exhausted'
            WHERE id = v_credit.id AND status <> 'reversed';
            CONTINUE;
        END IF;

        v_allocate := LEAST(v_credit_remaining, v_invoice_outstanding);

        IF v_allocate > 0 THEN
            INSERT INTO public.subscription_payment_allocations (
                payment_id, invoice_id, allocation_type, credit_id, amount, status
            ) VALUES (
                v_credit.source_payment_id, v_invoice.id, 'credit', v_credit.id, v_allocate, 'active'
            );

            v_invoice_outstanding := GREATEST(v_invoice_outstanding - v_allocate, 0);

            SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
            INTO v_credit_applied
            FROM public.subscription_payment_allocations AS a
            WHERE a.credit_id = v_credit.id;

            IF v_credit_applied > v_credit.original_amount THEN
                RAISE EXCEPTION 'Credit % exceeded during allocation', v_credit.id;
            END IF;

            UPDATE public.subscription_credits
            SET status = CASE
                WHEN v_credit_applied >= original_amount THEN 'exhausted'
                ELSE 'active'
            END
            WHERE id = v_credit.id AND status <> 'reversed';
        END IF;
    END LOOP;

    IF v_invoice_outstanding > 0 THEN
        v_available_current := GREATEST(v_payment.amount - v_applied_current, 0);
        v_allocate := LEAST(v_available_current, v_invoice_outstanding);

        IF v_allocate > 0 THEN
            INSERT INTO public.subscription_payment_allocations (
                payment_id, invoice_id, allocation_type, credit_id, amount, status
            ) VALUES (
                v_payment.id, v_invoice.id, 'direct', NULL, v_allocate, 'active'
            );
            v_applied_current := v_applied_current + v_allocate;
            v_invoice_outstanding := GREATEST(v_invoice_outstanding - v_allocate, 0);
        END IF;
    END IF;

    IF v_applied_current > v_payment.amount THEN
        RAISE EXCEPTION 'Payment % allocations exceed payment amount', v_payment.id;
    END IF;

    v_available_current := GREATEST(v_payment.amount - v_applied_current, 0);

    IF v_available_current > 0 THEN
        INSERT INTO public.subscription_credits (source_payment_id, original_amount, status)
        VALUES (v_payment.id, v_available_current, 'active');
    END IF;

    UPDATE public.subscription_payments
    SET status = 'confirmed', paid_at = COALESCE(paid_at, v_now)
    WHERE id = v_payment.id AND status = 'pending';

    PERFORM private.append_platform_activity(
        'subscription_payment_confirmed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_id', v_invoice.id,
            'subscription_id', v_subscription.id,
            'amount', v_payment.amount
        )
    );

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_invoice_applied
    FROM public.subscription_payment_allocations AS a
    WHERE a.invoice_id = v_invoice.id;

    IF v_invoice.total_amount = 0 THEN
        UPDATE public.subscription_invoices
        SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
        WHERE id = v_invoice.id;
    ELSIF v_invoice_applied >= v_invoice.total_amount THEN
        UPDATE public.subscription_invoices
        SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
        WHERE id = v_invoice.id;
    ELSIF v_invoice_applied > 0 THEN
        UPDATE public.subscription_invoices
        SET status = 'partially_paid', paid_at = NULL
        WHERE id = v_invoice.id;
    ELSIF v_invoice.due_at IS NOT NULL AND v_now > v_invoice.due_at THEN
        UPDATE public.subscription_invoices
        SET status = 'overdue', paid_at = NULL
        WHERE id = v_invoice.id;
    ELSE
        UPDATE public.subscription_invoices
        SET status = 'issued', paid_at = NULL
        WHERE id = v_invoice.id;
    END IF;

    SELECT si.status INTO v_invoice.status
    FROM public.subscription_invoices AS si
    WHERE si.id = v_invoice.id;

    IF v_invoice.status = 'paid' THEN
        UPDATE public.subscription_cycles SET status = 'paid'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    ELSIF v_invoice.status = 'overdue' THEN
        UPDATE public.subscription_cycles SET status = 'overdue'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    ELSE
        UPDATE public.subscription_cycles SET status = 'invoiced'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'confirmed',
        'payment_id', v_payment.id,
        'invoice_id', v_invoice.id,
        'subscription_id', v_subscription.id,
        'payment_amount', v_payment.amount,
        'applied_amount', v_applied_current,
        'credit_created', v_available_current,
        'invoice_status', v_invoice.status
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.create_and_record_automatic_charge_payment(p_obligation_id uuid, p_charge_type text, p_payment_id uuid, p_amount numeric)
 RETURNS charge_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_obligation public.contribution_obligations%rowtype;
    v_charge public.financial_charges%rowtype;
    v_payment public.contributions%rowtype;
    v_period public.financial_periods%rowtype;
    v_accounting_month text;
    v_applied numeric(14,2);
    v_remaining numeric(14,2);
    v_result public.charge_payments%rowtype;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_obligation_id IS NULL
       OR p_payment_id IS NULL
       OR p_charge_type IS NULL
       OR length(trim(p_charge_type)) = 0
    THEN
        RAISE EXCEPTION 'Obligation, charge type and payment are required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Charge allocation amount must be greater than zero';
    END IF;

    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Charge allocation amount must have no more than two decimal places';
    END IF;

    p_charge_type := lower(pg_catalog.btrim(p_charge_type));

    -- Canonical global lock order for this path:
    --   authoritative accounting key read (no row lock)
    --   -> accounting advisory lock
    --   -> obligation FOR UPDATE
    --   -> period lock
    --   -> automatic charge FOR UPDATE
    --   -> payment FOR SHARE.
    -- This matches cl_2b_record_contribution()/cl_2b_refresh_member(),
    -- which acquire accounting locks before obligation work.
    -- The initial obligation read supplies only the serialization key.
    -- The authoritative row is locked and re-read after the accounting lock;
    -- a changed group/month aborts instead of using a stale lock key.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', p_obligation_id;
    END IF;

    v_accounting_month := pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');

    IF NOT public.cl_user_has_role(
        v_obligation.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Finance authorization required';
    END IF;

    PERFORM public.cl_2b_accounting_lock(
        v_obligation.group_id,
        v_accounting_month
    );

    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', p_obligation_id;
    END IF;

    IF v_obligation.group_id IS NULL
       OR pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM') IS DISTINCT FROM v_accounting_month
    THEN
        RAISE EXCEPTION 'Contribution obligation % changed during accounting serialization', p_obligation_id;
    END IF;

    v_period := public.ensure_financial_period(
        v_obligation.group_id,
        v_accounting_month
    );

    IF lower(coalesce(v_period.status, 'open')) = 'closed' THEN
        RAISE EXCEPTION 'Financial period % is closed', v_accounting_month;
    END IF;

    -- Re-read under the row lock after serialization. The month/group/member
    -- must remain the same authoritative values used for the accounting lock.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id
    FOR UPDATE;

    IF v_obligation.group_id IS NULL
       OR pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM') IS DISTINCT FROM v_accounting_month
    THEN
        RAISE EXCEPTION 'Contribution obligation % changed during accounting serialization', p_obligation_id;
    END IF;

    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.obligation_id = p_obligation_id
      AND fc.charge_type = p_charge_type
      AND fc.source = 'automatic'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.financial_charges (
            group_id,
            member_id,
            obligation_id,
            charge_type,
            source,
            accounting_month,
            amount,
            currency,
            charge_date,
            status
        )
        VALUES (
            v_obligation.group_id,
            v_obligation.member_id,
            v_obligation.id,
            p_charge_type,
            'automatic',
            v_accounting_month,
            v_obligation.due_amount,
            'KES',
            current_date,
            'open'
        )
        RETURNING * INTO v_charge;
    END IF;

    IF v_charge.accounting_month IS DISTINCT FROM v_accounting_month
       OR v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.obligation_id IS DISTINCT FROM v_obligation.id
       OR v_charge.source IS DISTINCT FROM 'automatic'
       OR v_charge.charge_type IS DISTINCT FROM p_charge_type
       OR v_charge.amount IS DISTINCT FROM v_obligation.due_amount
    THEN
        RAISE EXCEPTION 'Automatic financial charge % is inconsistent with its obligation contract', v_charge.id;
    END IF;

    IF v_charge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Financial charge % is cancelled', v_charge.id;
    END IF;

    SELECT c.*
      INTO v_payment
    FROM public.contributions c
    WHERE c.id = p_payment_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
    END IF;

    IF v_payment.group_id <> v_obligation.group_id
       OR v_payment.member_id <> v_obligation.member_id
       OR v_payment.group_id <> v_charge.group_id
       OR v_payment.member_id <> v_charge.member_id
    THEN
        RAISE EXCEPTION 'Payment % does not belong to automatic charge group/member',
            p_payment_id;
    END IF;

    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = v_charge.id
      AND cp.status = 'applied';

    v_remaining := v_charge.amount - v_applied;

    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'Financial charge % has no remaining balance', v_charge.id;
    END IF;

    IF p_amount > v_remaining THEN
        RAISE EXCEPTION 'Allocation %.2f exceeds remaining charge balance %.2f',
            p_amount, v_remaining;
    END IF;

    INSERT INTO public.charge_payments (
        charge_id, payment_id, amount_applied
    )
    VALUES (
        v_charge.id, p_payment_id, p_amount
    )
    RETURNING * INTO v_result;

    UPDATE public.financial_charges
       SET status = CASE
           WHEN v_applied + p_amount = amount THEN 'paid'
           ELSE 'open'
       END
     WHERE id = v_charge.id;

    RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_contribution_initiative(p_group_id uuid, p_name text, p_description text, p_contribution_type_id uuid, p_start_date date, p_closing_date date, p_default_amount numeric, p_frequency text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_existing jsonb; v_id uuid; v_group uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'create_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='create_initiative';
    RETURN v_existing;
  END IF;
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name))=0 OR p_start_date > p_closing_date OR p_default_amount < 0 OR p_frequency NOT IN ('one_time','monthly') THEN RAISE EXCEPTION 'Invalid initiative terms'; END IF;
  SELECT group_id INTO v_group FROM public.contribution_types WHERE id=p_contribution_type_id;
  IF v_group IS DISTINCT FROM p_group_id THEN RAISE EXCEPTION 'Contribution type does not belong to group'; END IF;
  INSERT INTO public.contribution_initiatives(group_id,contribution_type_id,name,description,start_date,closing_date,default_amount,frequency,status,created_by)
  VALUES(p_group_id,p_contribution_type_id,trim(p_name),p_description,p_start_date,p_closing_date,p_default_amount,p_frequency,'draft',auth.uid())
  RETURNING id INTO v_id;
  v_existing=jsonb_build_object('status','created','initiative_id',v_id);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_id,group_id=p_group_id,result=v_existing WHERE request_id=p_request_id AND operation='create_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_custom_contribution(p_group_id uuid, p_name text, p_description text, p_amount numeric, p_frequency text, p_start_date date, p_due_date date, p_closing_date date, p_grace_period_value integer, p_apply_fine boolean, p_fine_amount numeric, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_auth_user_id uuid:=auth.uid(); v_member_id uuid; v_type_id uuid; v_period_id uuid; v_fine_rule_id uuid:=NULL;
 v_period_key text; v_payload jsonb; v_payload_hash text; v_result jsonb; v_existing_hash text; v_existing_result jsonb;
BEGIN
 IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_group_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'GROUP_ID_AND_REQUEST_ID_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.id=p_group_id AND g.owner_user_id=v_auth_user_id)
 AND NOT public.cl_user_has_role(p_group_id,ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO v_member_id FROM public.members m WHERE m.group_id=p_group_id AND (m.user_id=v_auth_user_id OR m.auth_user_id=v_auth_user_id) AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'active'))='active' ORDER BY m.id LIMIT 1;
 IF v_member_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF nullif(trim(coalesce(p_name,'')),'') IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_MUST_BE_POSITIVE' USING ERRCODE='22023'; END IF;
 IF p_frequency IS NULL OR p_frequency NOT IN ('one_time','weekly','monthly','quarterly','annual') THEN RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_FREQUENCY' USING ERRCODE='22023'; END IF;
 IF p_start_date IS NULL OR p_due_date IS NULL OR p_closing_date IS NULL THEN RAISE EXCEPTION 'START_DUE_CLOSING_DATES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_start_date>p_due_date OR p_due_date>p_closing_date THEN RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_DATE_RANGE' USING ERRCODE='22023'; END IF;
 IF p_grace_period_value IS NULL OR p_grace_period_value<0 THEN RAISE EXCEPTION 'INVALID_GRACE_PERIOD' USING ERRCODE='22023'; END IF;
 IF p_apply_fine IS NULL THEN RAISE EXCEPTION 'APPLY_FINE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_apply_fine AND (p_fine_amount IS NULL OR p_fine_amount<=0) THEN RAISE EXCEPTION 'FINE_AMOUNT_MUST_BE_POSITIVE_WHEN_ENABLED' USING ERRCODE='22023'; END IF;
 IF NOT p_apply_fine THEN p_fine_amount:=NULL; END IF;
 v_payload:=jsonb_build_object('group_id',p_group_id,'name',trim(p_name),'description',coalesce(p_description,''),'amount',p_amount,'frequency',p_frequency,'start_date',p_start_date,'due_date',p_due_date,'closing_date',p_closing_date,'grace_period_value',p_grace_period_value,'apply_fine',p_apply_fine,'fine_amount',CASE WHEN p_apply_fine THEN p_fine_amount ELSE NULL END);
 v_payload_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:custom-contribution-request:'||p_request_id::text||':create',0));
 SELECT r.payload_hash,r.result INTO v_existing_hash,v_existing_result FROM private.custom_contribution_requests r WHERE r.request_id=p_request_id AND r.operation='create' FOR UPDATE;
 IF v_existing_hash IS NOT NULL THEN
  IF v_existing_hash<>v_payload_hash THEN RAISE EXCEPTION 'REQUEST_ID_REUSE_MISMATCH' USING ERRCODE='22023'; END IF;
  IF v_existing_result IS NULL THEN RAISE EXCEPTION 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' USING ERRCODE='55000'; END IF;
  RETURN jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
 END IF;
 INSERT INTO private.custom_contribution_requests(request_id,operation,group_id,payload_hash) VALUES(p_request_id,'create',p_group_id,v_payload_hash);
 INSERT INTO public.contribution_types(group_id,name,code,created_by) VALUES(p_group_id,trim(p_name),'custom',v_member_id) RETURNING id INTO v_type_id;
 v_period_key:='custom:v1:'||v_type_id::text||':'||to_char(p_start_date,'YYYY-MM-DD')||':'||to_char(p_due_date,'YYYY-MM-DD')||':'||to_char(p_closing_date,'YYYY-MM-DD');
 IF p_apply_fine THEN
  INSERT INTO public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
  VALUES(p_group_id,trim(p_name)||' Fine','Automatic fixed fine for missed '||trim(p_name)||' contribution.','missed_contribution',1,0,'FIXED',p_fine_amount,NULL,NULL,NULL,p_grace_period_value,'DAY','ALL',p_start_date::timestamp AT TIME ZONE 'UTC',NULL,'active',v_member_id,v_member_id) RETURNING id INTO v_fine_rule_id;
  INSERT INTO public.fine_rule_contribution_types(rule_id,contribution_type_id) VALUES(v_fine_rule_id,v_type_id);
 END IF;
 INSERT INTO public.contribution_periods(group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,due_date,status,created_by,name,description,amount,fine_rule_id)
 VALUES(p_group_id,v_type_id,p_frequency,v_period_key,p_start_date,p_closing_date,p_due_date,'draft',v_member_id,trim(p_name),NULLIF(trim(coalesce(p_description,'')),''),p_amount,v_fine_rule_id) RETURNING id INTO v_period_id;
 v_result:=jsonb_build_object('ok',true,'operation','create','replayed',false,'contribution_type_id',v_type_id,'period_id',v_period_id,'fine_rule_id',v_fine_rule_id,'status','draft','period_key',v_period_key);
 UPDATE private.custom_contribution_requests SET contribution_type_id=v_type_id,period_id=v_period_id,fine_rule_id=v_fine_rule_id,result=v_result,completed_at=now() WHERE request_id=p_request_id AND operation='create';
 RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_group(p_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS TABLE(group_id uuid, access_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_group_id uuid;
  new_access_code text;
  admin_email text;
  resolved_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Group name is required'; end if;

  new_access_code := generate_group_access_code(p_name);

  insert into groups (
    name, category, monthly_contribution, description, country, access_code
  )
  values (
    trim(p_name), coalesce(p_category, 'other'), coalesce(p_monthly_contribution, 0),
    p_description, coalesce(nullif(trim(p_country), ''), 'Kenya'), new_access_code
  )
  returning id into new_group_id;

  select email into admin_email from auth.users where id = auth.uid();

  resolved_name := coalesce(
    nullif(trim(p_admin_name), ''),
    split_part(admin_email, '@', 1),
    'Admin'
  );

  insert into members (
    group_id, user_id, member_number, name, phone, role, status
  )
  values (
    new_group_id, auth.uid(),
    'ADM-' || to_char(now(), 'YYYYMMDDHH24MISS'),
    resolved_name, coalesce(nullif(trim(p_admin_phone), ''), ''),
    'admin', 'active'
  );

  INSERT INTO contribution_types (group_id, name, code)
  SELECT new_group_id, 'Monthly', 'monthly'
  WHERE NOT EXISTS (
    SELECT 1 FROM contribution_types ct
    WHERE ct.group_id = new_group_id
      AND (
        lower(trim(ct.name)) = 'monthly'
        OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  return query select new_group_id, new_access_code;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_group_account(p_name text, p_category text DEFAULT NULL::text, p_monthly_contribution numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS TABLE(group_id uuid, access_code text, member_id uuid, member_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_member_id uuid;
  v_access_code text;
  v_member_number text;
  v_email text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Group name is required'; end if;
  if coalesce(p_monthly_contribution, 0) < 0 then raise exception 'Monthly contribution must be zero or greater'; end if;

  select email into v_email from auth.users where id = v_uid;

  if exists (
    select 1 from public.members m
    where (m.user_id = v_uid or m.auth_user_id = v_uid)
      and lower(coalesce(m.status,'active')) = 'active'
      and lower(coalesce(m.onboarding_status,'active')) in ('active','pending','approved')
  ) then
    raise exception 'This account is already linked to a group';
  end if;

  v_access_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  while exists (select 1 from public.groups g where g.access_code = v_access_code) loop
    v_access_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  end loop;

  insert into public.groups (
    name, category, monthly_contribution, description, country, access_code, email
  ) values (
    trim(p_name), nullif(trim(p_category), ''), coalesce(p_monthly_contribution, 0),
    nullif(trim(p_description), ''), coalesce(nullif(trim(p_country), ''), 'Kenya'),
    v_access_code, v_email
  ) returning id into v_group_id;

  v_member_number := '0001';
  while exists (
    select 1 from public.members m
    where m.group_id = v_group_id AND m.member_number = v_member_number
  ) loop
    v_member_number := lpad(((v_member_number::integer) + 1)::text, 4, '0');
  end loop;

  insert into public.members (
    group_id, user_id, auth_user_id, member_number, membership_number,
    name, phone, email, role, status, onboarding_status, join_date, activated_at
  ) values (
    v_group_id, v_uid, v_uid, v_member_number, v_member_number,
    trim(p_admin_name), trim(p_admin_phone), v_email,
    'admin', 'pending', 'pending', current_date, null
  ) returning id into v_member_id;

  insert into public.contribution_types (group_id, name, code, created_by)
  select v_group_id, 'Monthly', 'monthly', v_member_id
  where not exists (
    select 1 from public.contribution_types ct
    where ct.group_id = v_group_id
      and (
        lower(trim(ct.name)) = 'monthly'
        or lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  return query select v_group_id, v_access_code, v_member_id, v_member_number;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_group_invite(p_group_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text)
 RETURNS TABLE(id uuid, group_id uuid, code text, expires_at timestamp with time zone, max_uses integer, email text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE target_group uuid:=p_group_id; caller_role text; new_id uuid; new_code text;
        v_expires timestamptz; v_max integer; v_email text; v_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role:=lower(trim(coalesce(p_role,'member')));
  IF v_role NOT IN ('admin','secretary','treasurer','member','chairperson') THEN RAISE EXCEPTION 'Invalid role: %',v_role; END IF;
  IF target_group IS NULL THEN
    SELECT m.group_id,lower(m.role) INTO target_group,caller_role FROM public.members m
    WHERE (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND m.status='active'
    ORDER BY m.created_at LIMIT 1;
  ELSE
    SELECT lower(m.role) INTO caller_role FROM public.members m
    WHERE (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND m.group_id=target_group AND m.status='active' LIMIT 1;
  END IF;
  IF target_group IS NULL THEN RAISE EXCEPTION 'You do not belong to a group'; END IF;
  IF caller_role NOT IN ('admin','chairperson') THEN RAISE EXCEPTION 'Only a group admin or chairperson can create an invite'; END IF;
  new_code:=upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,8));
  INSERT INTO public.group_invites(group_id,code,created_by,email,role)
  VALUES(target_group,new_code,(SELECT auth.uid()),nullif(trim(coalesce(p_email,'')),''),v_role)
  RETURNING public.group_invites.id,public.group_invites.expires_at,public.group_invites.max_uses,public.group_invites.email
  INTO new_id,v_expires,v_max,v_email;
  RETURN QUERY SELECT new_id,target_group,new_code,v_expires,v_max,v_email,v_role;
END; $function$


CREATE OR REPLACE FUNCTION public.create_manual_member_fine(p_group_id uuid, p_member_id uuid, p_rule_id uuid, p_amount numeric, p_reason text, p_trigger_id uuid, p_imposed_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_imposed_at timestamptz := coalesce(p_imposed_at, now());
  v_month text;
  v_member_group uuid;
  v_rule public.fine_rules%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_existing public.fines%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF p_group_id IS NULL OR p_member_id IS NULL OR p_rule_id IS NULL OR p_trigger_id IS NULL THEN
    RAISE EXCEPTION 'Group, member, fine type, and request id are required';
  END IF;
  IF p_amount IS NULL OR round(p_amount,2) <= 0 THEN
    RAISE EXCEPTION 'Fine amount must be positive after currency rounding';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'Fine reason is required';
  END IF;
  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['chairperson','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION 'Manual fine requires an authorised group officer' USING ERRCODE='42501';
  END IF;

  v_month := to_char(date_trunc('month', v_imposed_at)::date, 'YYYY-MM');

  -- Preserve the canonical fine lock order: configuration, accounting month,
  -- financial period row, member advisory lock, then existing fine row.
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT m.group_id INTO v_member_group
  FROM public.members m
  WHERE m.id=p_member_id;
  IF NOT FOUND OR v_member_group <> p_group_id THEN
    RAISE EXCEPTION 'Selected member does not belong to this group';
  END IF;

  SELECT fp.* INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id AND fp.month=v_month
  FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status) <> 'open' THEN
    RAISE EXCEPTION 'Financial month is closed or missing';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || p_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  -- Idempotency check precedes rule status so safe retries still return the
  -- original fine after the fine type is retired.
  SELECT f.* INTO v_existing
  FROM public.fines f
  WHERE f.group_id=p_group_id
    AND f.member_id=p_member_id
    AND f.rule_id=p_rule_id
    AND f.trigger_type='custom_event'
    AND f.trigger_id=p_trigger_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.source_type='MANUAL'
       AND round(v_existing.original_amount,2)=round(p_amount,2)
       AND coalesce(v_existing.reason,'')=btrim(p_reason)
       AND v_existing.imposed_at=v_imposed_at THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'Duplicate request id conflicts with an existing fine';
  END IF;

  SELECT r.* INTO v_rule
  FROM public.fine_rules r
  WHERE r.id=p_rule_id
    AND r.group_id=p_group_id
    AND r.trigger_type='custom_event'
    AND r.status='active'
    AND r.effective_from <= v_imposed_at
    AND (r.effective_until IS NULL OR r.effective_until >= v_imposed_at);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active manual fine type effective on the incident date is required';
  END IF;

  IF v_rule.minimum_amount IS NOT NULL AND round(p_amount,2) < v_rule.minimum_amount THEN
    RAISE EXCEPTION 'Fine amount is below the configured minimum';
  END IF;
  IF v_rule.maximum_amount IS NOT NULL AND round(p_amount,2) > v_rule.maximum_amount THEN
    RAISE EXCEPTION 'Fine amount exceeds the configured maximum';
  END IF;

  INSERT INTO public.fines(
    group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
    original_amount,calculation_method,calculation_base,percentage_rate,
    fixed_amount,minimum_amount,maximum_amount,calculated_amount,
    resolved_closing_at,triggered_at,source_type,reason,imposed_at
  ) VALUES (
    p_group_id,p_member_id,p_rule_id,'custom_event',p_trigger_id,v_month,
    round(p_amount,2),'FIXED',NULL,NULL,
    round(p_amount,2),v_rule.minimum_amount,v_rule.maximum_amount,
    round(p_amount,2),NULL,v_imposed_at,'MANUAL',btrim(p_reason),v_imposed_at
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_member_with_contribution_plan(p_member jsonb, p_contribution_plan jsonb)
 RETURNS TABLE(member_id uuid, group_id uuid, member_number text, membership_number text, join_date date, contribution_status text, obligations_created integer, total_due numeric, total_allocated numeric, arrears numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_creator_member_id uuid;
    v_group_id uuid;
    v_member_id uuid;
    v_member_number text;
    v_membership_number text;
    v_name text;
    v_phone text;
    v_email text;
    v_national_id text;
    v_role text;
    v_member_status text;
    v_onboarding_status text;
    v_join_date date;
    v_actual_position text;
    v_actual_position_name text;
    v_actual_position_effective_from date;
    v_plan jsonb;
    v_plan_item jsonb;
    v_type_id uuid;
    v_amount numeric(14,2);
    v_frequency text;
    v_effective_from date;
    v_effective_to date;
    v_first_period_rule text;
    v_rule_status text;
    v_before_obligations integer := 0;
    v_after_obligations integer := 0;
    v_total_due numeric(14,2) := 0;
    v_total_allocated numeric(14,2) := 0;
    v_credit numeric(14,2) := 0;
    v_arrears numeric(14,2) := 0;
    v_contribution_status text;
    v_constraint_name text;
BEGIN
    IF p_member IS NULL OR jsonb_typeof(p_member) <> 'object' THEN
        RAISE EXCEPTION 'MEMBER_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;

    IF p_contribution_plan IS NULL THEN
        v_plan := '[]'::jsonb;
    ELSIF jsonb_typeof(p_contribution_plan) <> 'array' THEN
        RAISE EXCEPTION 'CONTRIBUTION_PLAN_INVALID' USING ERRCODE = '22023';
    ELSE
        v_plan := p_contribution_plan;
    END IF;

    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT m.id, m.group_id
    INTO v_creator_member_id, v_group_id
    FROM public.members m
    WHERE (m.auth_user_id = v_auth_uid OR m.user_id = v_auth_uid)
      AND lower(coalesce(m.status,'active')) = 'active'
    ORDER BY
        CASE WHEN lower(coalesce(m.onboarding_status,'pending')) = 'active'
             THEN 0 ELSE 1 END,
        m.created_at,
        m.id
    LIMIT 1;

    IF v_creator_member_id IS NULL OR v_group_id IS NULL THEN
        RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_add_group_members(v_group_id) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    v_member_number := nullif(trim(p_member->>'member_number'), '');
    v_membership_number := nullif(trim(p_member->>'membership_number'), '');
    v_name := nullif(trim(p_member->>'name'), '');
    v_phone := nullif(trim(p_member->>'phone'), '');
    v_email := nullif(trim(p_member->>'email'), '');
    v_national_id := nullif(trim(p_member->>'national_id'), '');
    v_role := lower(coalesce(nullif(trim(p_member->>'role'), ''), 'member'));
    v_member_status := lower(coalesce(nullif(trim(p_member->>'status'), ''), 'active'));
    v_onboarding_status := lower(coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending'));
    v_join_date := coalesce(nullif(trim(p_member->>'join_date'), '')::date, CURRENT_DATE);
    v_actual_position := lower(nullif(trim(p_member->>'actual_position'), ''));
    v_actual_position_name := nullif(trim(p_member->>'actual_position_name'), '');
    IF v_actual_position IS NOT NULL AND v_actual_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_actual_position = 'other' AND v_actual_position_name IS NULL THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF v_actual_position IS DISTINCT FROM 'other' THEN v_actual_position_name := NULL; END IF;
    IF nullif(trim(p_member->>'actual_position_effective_from'), '') IS NULL THEN
        v_actual_position_effective_from := v_join_date;
    ELSE
        BEGIN
            v_actual_position_effective_from := (p_member->>'actual_position_effective_from')::date;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_INVALID' USING ERRCODE='22023';
        END;
    END IF;
    IF v_actual_position IS NOT NULL AND v_actual_position_effective_from < v_join_date THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
    END IF;

    IF v_member_number IS NULL THEN RAISE EXCEPTION 'MEMBER_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
    END;

    IF v_actual_position IS NOT NULL THEN
        INSERT INTO public.member_position_history (
            group_id, member_id, actual_position, actual_position_name,
            effective_from, effective_to, recorded_by
        )
        VALUES (
            v_group_id, v_member_id, v_actual_position, v_actual_position_name,
            v_actual_position_effective_from, NULL, v_creator_member_id
        );
    END IF;

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
            GROUP BY a.payment_id
        ) x
        JOIN public.contributions p ON p.id = x.payment_id
        WHERE x.allocated > p.amount
    ) THEN
        RAISE EXCEPTION 'Payment over-allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$

CREATE OR REPLACE FUNCTION public.create_member_with_historical_contributions(p_member jsonb, p_contribution_plan jsonb, p_historical jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid;
  v_creator_member_id uuid;
  v_group_id uuid;
  v_member_id uuid;
  v_member_number text;
  v_membership_number text;
  v_name text;
  v_phone text;
  v_email text;
  v_national_id text;
  v_role text;
  v_status text;
  v_onboarding_status text;
  v_join_date date;
  v_actual_position text;
  v_actual_position_name text;
  v_actual_position_effective_from date;
  v_plan_count integer;
  v_contribution_type_id uuid;
  v_monthly_amount numeric(14,2);
  v_frequency text;
  v_effective_from date;
  v_effective_to date;
  v_first_period_rule text;
  v_rule_status text;
  v_historical_enabled boolean;
  v_historical_amount numeric(14,2);
  v_paid_through date;
  v_payment_method text;
  v_first_historical_month date;
  v_historical_last_month date;
  v_current_month date;
  v_payment_date date;
  v_payment_id uuid;
  v_historical_payment_count integer := 0;
  v_closed_month text;
  v_payload_hash text;
  v_existing_payload_hash text;
  v_existing_result jsonb;
  v_obligations_created integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_arrears numeric := 0;
  v_credit numeric := 0;
  v_result jsonb;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request idempotency key is required'; END IF;
  IF p_member IS NULL OR jsonb_typeof(p_member) <> 'object' THEN RAISE EXCEPTION 'Member payload must be a JSON object'; END IF;
  IF p_contribution_plan IS NULL OR jsonb_typeof(p_contribution_plan) <> 'array' THEN RAISE EXCEPTION 'Contribution plan must be a JSON array'; END IF;
  IF p_historical IS NULL OR jsonb_typeof(p_historical) <> 'object' THEN RAISE EXCEPTION 'Historical payload must be a JSON object'; END IF;

  v_payload_hash := pg_catalog.md5(jsonb_build_object('member', p_member, 'contribution_plan', p_contribution_plan, 'historical', p_historical)::text);

  INSERT INTO private.member_historical_onboarding_requests (request_id, payload_hash)
  VALUES (p_request_id, v_payload_hash)
  ON CONFLICT (request_id) DO NOTHING;

  SELECT r.payload_hash, r.result
  INTO v_existing_payload_hash, v_existing_result
  FROM private.member_historical_onboarding_requests r
  WHERE r.request_id = p_request_id
  FOR UPDATE;

  IF v_existing_payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;

  IF v_existing_result IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'request_id', p_request_id, 'result', v_existing_result);
  END IF;

  SELECT m.id, m.group_id
  INTO v_creator_member_id, v_group_id
  FROM public.members m
  WHERE (m.user_id = v_auth_uid OR m.auth_user_id = v_auth_uid)
    AND lower(coalesce(m.status, '')) = 'active'
    AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ORDER BY m.id
  LIMIT 1;

  IF v_creator_member_id IS NULL OR v_group_id IS NULL THEN RAISE EXCEPTION 'Active group membership is required'; END IF;
  IF NOT public.can_add_group_members(v_group_id) THEN RAISE EXCEPTION 'Member-management authorization required'; END IF;

  v_member_number := nullif(trim(p_member->>'member_number'), '');
  v_membership_number := nullif(trim(p_member->>'membership_number'), '');
  v_name := nullif(trim(p_member->>'name'), '');
  v_phone := nullif(trim(p_member->>'phone'), '');
  v_email := nullif(trim(p_member->>'email'), '');
  v_national_id := nullif(trim(p_member->>'national_id'), '');
  v_role := coalesce(nullif(trim(p_member->>'role'), ''), 'member');
  v_status := coalesce(nullif(trim(p_member->>'status'), ''), 'active');
  v_onboarding_status := coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending');
  v_actual_position := lower(nullif(trim(p_member->>'actual_position'), ''));
  v_actual_position_name := nullif(trim(p_member->>'actual_position_name'), '');
  IF v_actual_position IS NOT NULL AND v_actual_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_actual_position = 'other' AND v_actual_position_name IS NULL THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF v_actual_position IS DISTINCT FROM 'other' THEN v_actual_position_name := NULL; END IF;
  IF nullif(trim(p_member->>'actual_position_effective_from'), '') IS NULL THEN
    v_actual_position_effective_from := v_join_date;
  ELSE
    BEGIN
      v_actual_position_effective_from := (p_member->>'actual_position_effective_from')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_INVALID' USING ERRCODE='22023';
    END;
  END IF;
  IF v_actual_position IS NOT NULL AND v_actual_position_effective_from < v_join_date THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
  END IF;

  IF v_member_number IS NULL THEN RAISE EXCEPTION 'Member number is required'; END IF;
  IF v_membership_number IS NULL THEN RAISE EXCEPTION 'Membership number is required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Member name is required'; END IF;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Member phone is required'; END IF;

  IF nullif(trim(p_member->>'join_date'), '') IS NULL THEN
    v_join_date := current_date;
  ELSE
    BEGIN
      v_join_date := (p_member->>'join_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid join_date';
    END;
  END IF;

  v_plan_count := jsonb_array_length(p_contribution_plan);
  IF v_plan_count <> 1 THEN RAISE EXCEPTION 'Revision 3.2 requires exactly one Monthly contribution rule'; END IF;
  IF jsonb_typeof(p_contribution_plan->0) <> 'object' THEN RAISE EXCEPTION 'Contribution plan item must be a JSON object'; END IF;

  BEGIN
    v_contribution_type_id := nullif(trim(p_contribution_plan->0->>'contribution_type_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid contribution_type_id';
  END;

  IF v_contribution_type_id IS NULL THEN RAISE EXCEPTION 'Contribution type is required'; END IF;

  BEGIN
    v_monthly_amount := (p_contribution_plan->0->>'amount')::numeric(14,2);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid contribution amount';
  END;

  IF v_monthly_amount IS NULL OR v_monthly_amount <= 0 THEN RAISE EXCEPTION 'Monthly contribution amount must be greater than zero'; END IF;

  v_frequency := lower(trim(coalesce(p_contribution_plan->0->>'frequency', 'monthly')));
  IF v_frequency <> 'monthly' THEN RAISE EXCEPTION 'Revision 3.2 supports Monthly contributions only'; END IF;

  IF nullif(trim(p_contribution_plan->0->>'effective_from'), '') IS NULL THEN
    v_effective_from := v_join_date;
  ELSE
    BEGIN
      v_effective_from := (p_contribution_plan->0->>'effective_from')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid contribution effective_from';
    END;
  END IF;

  IF nullif(trim(p_contribution_plan->0->>'effective_to'), '') IS NULL THEN
    v_effective_to := NULL;
  ELSE
    BEGIN
      v_effective_to := (p_contribution_plan->0->>'effective_to')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid contribution effective_to';
    END;
  END IF;

  v_first_period_rule := lower(trim(coalesce(p_contribution_plan->0->>'first_period_rule', 'full_period')));
  IF v_first_period_rule NOT IN ('full_period', 'next_full_period') THEN RAISE EXCEPTION 'Invalid first_period_rule'; END IF;

  v_rule_status := lower(trim(coalesce(p_contribution_plan->0->>'status', 'active')));
  IF v_effective_from < v_join_date THEN RAISE EXCEPTION 'Contribution effective_from cannot precede join_date'; END IF;
  IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN RAISE EXCEPTION 'Contribution effective_to cannot precede effective_from'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contribution_types ct
    WHERE ct.id = v_contribution_type_id
      AND ct.group_id = v_group_id
      AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ) THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type does not belong to the group';
  END IF;

  v_historical_enabled := coalesce((p_historical->>'enabled')::boolean, false);
  IF NOT v_historical_enabled THEN RAISE EXCEPTION 'Historical onboarding must be explicitly enabled'; END IF;

  BEGIN
    v_historical_amount := (p_historical->>'monthly_amount')::numeric(14,2);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid historical monthly_amount';
  END;

  IF v_historical_amount IS NULL OR v_historical_amount <= 0 THEN RAISE EXCEPTION 'Historical monthly amount must be greater than zero'; END IF;
  IF v_historical_amount <> v_monthly_amount THEN RAISE EXCEPTION 'Historical monthly amount must equal current Monthly amount'; END IF;

  BEGIN
    v_paid_through := (p_historical->>'paid_through')::date;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid historical paid_through';
  END;

  IF v_paid_through IS NULL THEN RAISE EXCEPTION 'paid_through is required'; END IF;
  IF v_paid_through > current_date THEN RAISE EXCEPTION 'Historical paid_through cannot be in the future'; END IF;

  v_payment_method := trim(coalesce(p_historical->>'payment_method', ''));
  IF v_payment_method NOT IN ('M-Pesa', 'Cash', 'Bank transfer') THEN RAISE EXCEPTION 'Invalid historical payment method'; END IF;

  IF v_first_period_rule = 'next_full_period'
     AND date_trunc('month', v_effective_from)::date = date_trunc('month', v_join_date)::date THEN
    v_first_historical_month := (date_trunc('month', v_join_date) + interval '1 month')::date;
  ELSE
    v_first_historical_month := date_trunc('month', greatest(v_effective_from, v_join_date))::date;
  END IF;

  v_historical_last_month := date_trunc('month', v_paid_through)::date;
  IF v_historical_last_month < v_first_historical_month THEN RAISE EXCEPTION 'paid_through does not reach the first historical obligation month'; END IF;

  IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.member_number = v_member_number) THEN RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS'; END IF;
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number) THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS'; END IF;

  BEGIN
    INSERT INTO public.members (group_id, member_number, name, phone, role, join_date, status, email, membership_number, onboarding_status, auth_user_id, national_id)
    VALUES (v_group_id, v_member_number, v_name, v_phone, v_role, v_join_date, v_status, v_email, v_membership_number, v_onboarding_status, NULL, v_national_id)
    RETURNING id INTO v_member_id;
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.member_number = v_member_number) THEN RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS'; END IF;
    IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number) THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS'; END IF;
    RAISE;
  END;

  IF v_actual_position IS NOT NULL THEN
    INSERT INTO public.member_position_history (
      group_id, member_id, actual_position, actual_position_name,
      effective_from, effective_to, recorded_by
    )
    VALUES (
      v_group_id, v_member_id, v_actual_position, v_actual_position_name,
      v_actual_position_effective_from, NULL, v_creator_member_id
    );
  END IF;

  PERFORM public.cl_2b_accounting_lock_range(v_group_id, v_first_historical_month, v_historical_last_month);

  SELECT fp.month INTO v_closed_month
  FROM public.financial_periods fp
  WHERE fp.group_id = v_group_id
    AND fp.month >= to_char(v_first_historical_month, 'YYYY-MM')
    AND fp.month <= to_char(v_historical_last_month, 'YYYY-MM')
    AND lower(coalesce(fp.status, 'open')) = 'closed'
  ORDER BY fp.month
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Financial month % is closed. Historical onboarding cannot modify it.', v_closed_month;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0));

  BEGIN
    INSERT INTO public.member_contribution_rules (group_id, member_id, contribution_type_id, amount, frequency, effective_from, effective_to, first_period_rule, status, created_by)
    VALUES (v_group_id, v_member_id, v_contribution_type_id, v_monthly_amount, 'monthly', v_effective_from, v_effective_to, v_first_period_rule, v_rule_status, v_creator_member_id);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP';
  END;

  v_current_month := v_first_historical_month;

  WHILE v_current_month <= v_historical_last_month LOOP
    IF v_current_month = v_first_historical_month
       AND v_first_period_rule = 'full_period'
       AND date_trunc('month', v_join_date)::date = v_first_historical_month THEN
      v_payment_date := v_join_date;
    ELSE
      v_payment_date := v_current_month;
    END IF;

    v_payment_id := (pg_catalog.md5('chama-live:revision-3.2:historical:' || p_request_id::text || ':' || to_char(v_current_month, 'YYYY-MM')))::uuid;

    PERFORM public.cl_2b_record_contribution(
      v_payment_id, v_group_id, v_member_id, v_historical_amount, v_payment_date,
      'monthly', v_payment_method, NULL, NULL, NULL,
      'Revision 3.2 historical onboarding ' || to_char(v_current_month, 'YYYY-MM')
    );

    v_historical_payment_count := v_historical_payment_count + 1;
    v_current_month := (v_current_month + interval '1 month')::date;
  END LOOP;

  PERFORM public.cl_2b_refresh_member(v_member_id, v_historical_last_month);

  SELECT count(*)::integer, coalesce(sum(o.due_amount), 0)::numeric
  INTO v_obligations_created, v_total_due
  FROM public.contribution_obligations o
  WHERE o.group_id = v_group_id AND o.member_id = v_member_id AND o.contribution_type_id = v_contribution_type_id;

  SELECT coalesce(sum(a.amount), 0)::numeric
  INTO v_total_allocated
  FROM public.contribution_allocations a
  JOIN public.contribution_obligations o ON o.id = a.obligation_id
  WHERE o.group_id = v_group_id AND o.member_id = v_member_id AND o.contribution_type_id = v_contribution_type_id;

  v_arrears := greatest(v_total_due - v_total_allocated, 0);
  v_credit := greatest(v_total_allocated - v_total_due, 0);

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE p.member_id = v_member_id
      AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
  ) THEN RAISE EXCEPTION 'Cross-member/group allocation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.payment_id, sum(a.amount) AS allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id = a.payment_id
      WHERE p.member_id = v_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id = x.payment_id
    WHERE x.allocated > p.amount
  ) THEN RAISE EXCEPTION 'Payment over-allocation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.obligation_id, sum(a.amount) AS allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id
      WHERE o.member_id = v_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id = x.obligation_id
    WHERE x.allocated > o.due_amount
  ) THEN RAISE EXCEPTION 'Obligation over-allocation detected'; END IF;

  v_result := jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'request_id', p_request_id,
    'member_id', v_member_id,
    'group_id', v_group_id,
    'member_number', v_member_number,
    'membership_number', v_membership_number,
    'join_date', v_join_date,
    'contribution_type_id', v_contribution_type_id,
    'monthly_amount', v_monthly_amount,
    'first_period_rule', v_first_period_rule,
    'historical_enabled', true,
    'historical_paid_through', v_paid_through,
    'historical_first_month', v_first_historical_month,
    'historical_last_month', v_historical_last_month,
    'historical_payment_count', v_historical_payment_count,
    'result_scope', 'resulting_member_accounting_state',
    'obligations_created', v_obligations_created,
    'total_due', v_total_due,
    'total_allocated', v_total_allocated,
    'arrears', v_arrears,
    'credit', v_credit,
    'payment_method', v_payment_method
  );

  UPDATE private.member_historical_onboarding_requests
  SET result = v_result, completed_at = now()
  WHERE request_id = p_request_id;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_other_contribution_cycle(p_group_id uuid, p_contribution_type_id uuid, p_name text, p_description text, p_amount numeric, p_frequency text, p_period_key text, p_opening_date date, p_due_date date, p_closing_date date, p_fine_rule_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_actor_member_id uuid;
  v_existing private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_cycle_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'create');
  v_actor_member_id:=private.cl_other_cycle_authorize(p_group_id);
  v_payload_hash:=md5(jsonb_build_object(
    'group_id',p_group_id,'contribution_type_id',p_contribution_type_id,
    'name',btrim(coalesce(p_name,'')),'description',p_description,'amount',p_amount,
    'frequency',lower(btrim(coalesce(p_frequency,''))),
    'period_key',btrim(coalesce(p_period_key,'')),
    'opening_date',p_opening_date,'due_date',p_due_date,
    'closing_date',p_closing_date,'fine_rule_id',p_fine_rule_id)::text);
  SELECT * INTO v_existing FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='create';
  IF FOUND THEN
    IF v_existing.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Request was previously used with a different payload';
    END IF;
    IF v_existing.completed_at IS NOT NULL AND v_existing.result IS NOT NULL THEN
      RETURN v_existing.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  PERFORM private.cl_other_cycle_lock(p_group_id,p_contribution_type_id);
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Cycle name is required'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Cycle amount must be greater than zero'; END IF;
  IF lower(coalesce(p_frequency,'')) NOT IN ('monthly','one_time') THEN
    RAISE EXCEPTION 'Cycle frequency must be monthly or one_time';
  END IF;
  IF p_period_key IS NULL OR btrim(p_period_key)='' OR length(btrim(p_period_key))>100 THEN
    RAISE EXCEPTION 'Valid period key is required';
  END IF;
  IF p_opening_date IS NULL OR p_due_date IS NULL OR p_closing_date IS NULL
     OR p_opening_date>p_due_date OR p_due_date>p_closing_date THEN
    RAISE EXCEPTION 'Dates must satisfy opening <= due <= closing';
  END IF;
  PERFORM private.cl_other_assert_type(p_group_id,p_contribution_type_id);
  PERFORM private.cl_other_assert_fine_rule(
    p_group_id,p_contribution_type_id,p_fine_rule_id,p_opening_date,p_closing_date);
  IF EXISTS (SELECT 1 FROM public.contribution_periods cp
             WHERE cp.group_id=p_group_id AND cp.contribution_type_id=p_contribution_type_id
               AND lower(cp.status) IN ('scheduled','open','due','grace')
               AND cp.opening_date<=p_closing_date AND cp.closing_date>=p_opening_date) THEN
    RAISE EXCEPTION 'Another active/scheduled Other cycle overlaps this cycle';
  END IF;
  INSERT INTO public.contribution_periods(
    group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,due_date,
    status,created_by,name,description,amount,fine_rule_id)
  VALUES(p_group_id,p_contribution_type_id,lower(p_frequency),btrim(p_period_key),
         p_opening_date,p_closing_date,p_due_date,'draft',v_actor_member_id,
         btrim(p_name),p_description,p_amount,p_fine_rule_id)
  RETURNING id INTO v_cycle_id;
  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'create',v_cycle_id,p_group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle_id,'group_id',p_group_id,'status','draft'),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;
  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle_id,p_group_id,'CYCLE_CREATED',v_actor,p_request_id,'create',
         jsonb_build_object('amount',p_amount,'frequency',lower(p_frequency),
                            'opening_date',p_opening_date,'due_date',p_due_date,
                            'closing_date',p_closing_date,'fine_rule_id',p_fine_rule_id));
  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle_id,'group_id',p_group_id,
                            'status','draft','idempotent_replay',false);
END $function$


CREATE OR REPLACE FUNCTION public.create_subscription_invoice(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_subscription public.group_subscriptions%ROWTYPE;
    v_invoice_id uuid;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_existing boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.subscription_cycles sc
    JOIN public.group_subscriptions gs ON gs.id = sc.subscription_id
    WHERE sc.id = p_cycle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist', p_cycle_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_platform_admin()
       AND NOT EXISTS (
           SELECT 1 FROM public.groups g
           WHERE g.id = v_subscription.group_id
             AND g.owner_user_id = auth.uid()
       )
       AND NOT EXISTS (
           SELECT 1 FROM public.members m
           WHERE m.group_id = v_subscription.group_id
             AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
             AND lower(coalesce(m.role,'')) = 'admin'
             AND lower(coalesce(m.status,'')) = 'active'
             AND lower(coalesce(m.onboarding_status,'')) = 'active'
       ) THEN
        RAISE EXCEPTION 'Group administrator privileges required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || v_subscription.id::text, 0)
    );

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE subscription_id = v_subscription.id
      AND cycle_id = p_cycle_id
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true, 'existing', true,
            'invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number,
            'subscription_id', v_invoice.subscription_id, 'cycle_id', v_invoice.cycle_id,
            'status', v_invoice.status, 'total_amount', v_invoice.total_amount
        );
    END IF;

    v_invoice_id := private.create_subscription_invoice_authority(p_cycle_id);

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE id = v_invoice_id
    FOR UPDATE;

    RETURN jsonb_build_object(
        'success', true, 'existing', false,
        'invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number,
        'subscription_id', v_invoice.subscription_id, 'cycle_id', v_invoice.cycle_id,
        'status', v_invoice.status,
        'member_count_snapshot', v_invoice.member_count_snapshot,
        'member_login_count', v_invoice.member_login_count,
        'subtotal', v_invoice.subtotal,
        'total_discount', v_invoice.total_discount,
        'total_amount', v_invoice.total_amount,
        'currency', v_invoice.currency
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.current_user_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select group_id
  from public.members
  where (user_id = (select auth.uid()) or auth_user_id = (select auth.uid()))
    and status = 'active'
    and onboarding_status = 'active';
$function$


CREATE OR REPLACE FUNCTION public.current_user_role(p_group_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(coalesce(m.actual_position, '')))
    WHEN 'vice_chairperson' THEN 'chairperson'
    WHEN 'vice-chairperson' THEN 'chairperson'
    WHEN 'vice chairperson' THEN 'chairperson'
    WHEN 'vice_secretary' THEN 'secretary'
    WHEN 'vice-secretary' THEN 'secretary'
    WHEN 'vice secretary' THEN 'secretary'
    ELSE CASE lower(btrim(coalesce(m.role, 'member')))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(coalesce(m.role, 'member')))
    END
  END
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
    AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ORDER BY m.id
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.enforce_member_position_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.actual_position IS DISTINCT FROM OLD.actual_position OR NEW.actual_position_name IS DISTINCT FROM OLD.actual_position_name THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_position_history h
      WHERE h.group_id=NEW.group_id AND h.member_id=NEW.id AND h.effective_to IS NULL
        AND h.actual_position IS NOT DISTINCT FROM NEW.actual_position
        AND h.actual_position_name IS NOT DISTINCT FROM NEW.actual_position_name
    ) THEN RAISE EXCEPTION 'POSITION_HISTORY_REQUIRED' USING ERRCODE='23514',HINT='Use set_member_actual_position().'; END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_contribution_initiative_period(p_initiative_id uuid, p_period_key text, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives; v_open date; v_close date; v_first date; v_existing uuid; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  IF NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'ensure_recurring_period','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='ensure_recurring_period' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    RETURN ((v_request->>'period_id'))::uuid;
  END IF;
  v_open:=to_date(p_period_key||'-01','YYYY-MM-DD');
  IF to_char(v_open,'YYYY-MM')<>p_period_key THEN RAISE EXCEPTION 'Invalid period key'; END IF;
  v_close:=(v_open+interval '1 month'-interval '1 day')::date;
  v_first:=date_trunc('month',v_i.start_date)::date;
  IF v_i.start_date>v_first THEN v_first:=(v_first+interval '1 month')::date; END IF;
  IF v_open<v_first OR v_close>v_i.closing_date THEN RAISE EXCEPTION 'Period outside recurring window'; END IF;
  IF v_open<>date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Just-in-time generation permits current calendar month only'; END IF;
  SELECT id INTO v_existing FROM public.contribution_initiative_periods WHERE initiative_id=v_i.id AND period_key=p_period_key;
  IF FOUND THEN
    UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('period_id',v_existing)
    WHERE request_id=p_request_id AND operation='ensure_recurring_period';
    RETURN v_existing;
  END IF;
  INSERT INTO public.contribution_initiative_periods(initiative_id,period_key,opening_date,closing_date,due_date,status)
  VALUES(v_i.id,p_period_key,v_open,v_close,v_close,'open')
  ON CONFLICT(initiative_id,period_key) DO UPDATE SET updated_at=public.contribution_initiative_periods.updated_at
  RETURNING id INTO v_existing;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('period_id',v_existing)
  WHERE request_id=p_request_id AND operation='ensure_recurring_period';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_contribution_initiative_period_obligations(p_period_id uuid, p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_p public.contribution_initiative_periods; v_i public.contribution_initiatives; v_count integer:=0; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid; v_request_period_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT i.* INTO v_i FROM public.contribution_initiatives i
  WHERE i.id=(SELECT p.initiative_id FROM public.contribution_initiative_periods p WHERE p.id=p_period_id) FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  SELECT * INTO v_p FROM public.contribution_initiative_periods WHERE id=p_period_id AND initiative_id=v_i.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period not found'; END IF;
  IF NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'ensure_recurring_period_obligations','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='ensure_recurring_period_obligations' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    v_request_period_id:=(v_request->>'period_id')::uuid;
    IF v_request_period_id IS DISTINCT FROM v_p.id THEN RAISE EXCEPTION 'Request id is already bound to another period'; END IF;
    RETURN coalesce((v_request->>'inserted_count')::integer,0);
  END IF;
  IF v_p.opening_date>date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Cannot generate obligations for a future period'; END IF;
  INSERT INTO public.contribution_initiative_obligations(initiative_id,initiative_period_id,initiative_member_id,member_id,amount_due,due_date)
  SELECT v_i.id,v_p.id,im.id,im.member_id,t.amount,v_p.due_date
  FROM public.contribution_initiative_members im
  JOIN LATERAL (SELECT t.amount FROM public.contribution_initiative_member_terms t
    WHERE t.initiative_member_id=im.id AND t.status='active' AND t.effective_from<=v_p.opening_date
      AND (t.effective_to IS NULL OR t.effective_to>=v_p.opening_date)
    ORDER BY t.effective_from DESC,t.id DESC LIMIT 1) t ON true
  WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active'
  ON CONFLICT(initiative_period_id,member_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('inserted_count',v_count,'period_id',v_p.id)
  WHERE request_id=p_request_id AND operation='ensure_recurring_period_obligations';
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_financial_period(p_group_id uuid, p_month text)
 RETURNS financial_periods
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods;
  v_opening numeric := 0;
  v_previous_month text;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group ID is required';
  END IF;

  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format';
  END IF;

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = p_month
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_period;
  END IF;

  v_previous_month :=
    to_char(
      (to_date(p_month || '-01','YYYY-MM-DD') - interval '1 month')::date,
      'YYYY-MM'
    );

  SELECT fp.closing_balance
    INTO v_opening
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = v_previous_month
  LIMIT 1;

  IF v_opening IS NULL THEN
    SELECT g.opening_balance
      INTO v_opening
    FROM public.groups g
    WHERE g.id = p_group_id;
  END IF;

  v_opening := coalesce(v_opening,0);

  INSERT INTO public.financial_periods (
    group_id, month, opening_balance, closing_balance, status
  )
  VALUES (
    p_group_id, p_month, v_opening, v_opening, 'open'
  )
  ON CONFLICT (group_id,month) DO NOTHING;

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = p_month
  FOR UPDATE;

  RETURN v_period;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_guard_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.charge_type IS DISTINCT FROM OLD.charge_type
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.accounting_month IS DISTINCT FROM OLD.accounting_month
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
    THEN
        RAISE EXCEPTION 'Financial charge accounting identity is immutable';
    END IF;

    RETURN NEW;
END;
$function$



CREATE OR REPLACE FUNCTION public.financial_charges_guard_obligation_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_obligation public.contribution_obligations%rowtype;
    v_expected_month text;
BEGIN
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = NEW.obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', NEW.obligation_id;
    END IF;

    v_expected_month := pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');

    IF NEW.accounting_month IS DISTINCT FROM v_expected_month THEN
        RAISE EXCEPTION 'Charge accounting month % does not match obligation month %',
            NEW.accounting_month, v_expected_month;
    END IF;

    IF NEW.group_id IS DISTINCT FROM v_obligation.group_id
       OR NEW.member_id IS DISTINCT FROM v_obligation.member_id
    THEN
        RAISE EXCEPTION 'Charge group/member does not match obligation';
    END IF;

    IF NEW.source = 'automatic'
       AND NEW.amount IS DISTINCT FROM v_obligation.due_amount
    THEN
        RAISE EXCEPTION
            'Automatic charge amount % does not match obligation due_amount %',
            NEW.amount, v_obligation.due_amount;
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_guard_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_applied numeric(14,2);
BEGIN
    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = NEW.id
      AND cp.status = 'applied';

    IF NEW.status = 'paid' AND v_applied <> NEW.amount THEN
        RAISE EXCEPTION 'Paid charge % must have allocations equal to charge amount', NEW.id;
    END IF;

    IF NEW.status = 'open' AND v_applied >= NEW.amount THEN
        RAISE EXCEPTION 'Open charge % cannot have allocations equal to or above charge amount', NEW.id;
    END IF;

    IF NEW.status = 'cancelled' AND v_applied <> 0 THEN
        RAISE EXCEPTION 'Cancelled charge % cannot have applied payments', NEW.id;
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_normalize_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    NEW.charge_type := lower(pg_catalog.btrim(NEW.charge_type));
    IF NEW.charge_type = '' THEN
        RAISE EXCEPTION 'Charge type is required';
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_group_access_code(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  prefix text;
  candidate text;
  attempt int := 0;
begin
  -- First two letters of the group name, uppercased, falling back to "CL"
  -- (Chama Live) if the name has no usable letters.
  prefix := upper(left(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z]', '', 'g'), 2));
  if length(prefix) < 2 then
    prefix := 'CL';
  end if;

  loop
    candidate := prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from groups where access_code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique access code';
    end if;
  end loop;

  return candidate;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_member_number(p_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_num integer;
begin
  if p_group_id is null then raise exception 'Group is required'; end if;
  select coalesce(max(nullif(regexp_replace(member_number,'[^0-9]','','g'),'')::integer),0)+1 into v_num
  from public.members where group_id=p_group_id and member_number ~ '^[0-9]+$';
  return lpad(v_num::text,4,'0');
end; $function$


CREATE OR REPLACE FUNCTION public.generate_next_custom_contribution_period(p_group_id uuid, p_contribution_type_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth uuid := auth.uid();
  v_actor uuid;
  v_source public.contribution_periods%rowtype;
  v_next_open date;
  v_next_due date;
  v_next_close date;
  v_period_id uuid;
  v_period_key text;
  v_result jsonb;
  v_existing jsonb;
  v_frequency text;
  v_step interval;
  v_close_span integer;
  v_due_span integer;
begin
  if v_auth is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.groups g where g.id=p_group_id and g.owner_user_id=v_auth)
     and not public.cl_user_has_role(p_group_id,array['chairperson']::text[])
  then raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501'; end if;

  select m.id into v_actor
  from public.members m
  where m.group_id=p_group_id
    and (m.user_id=v_auth or m.auth_user_id=v_auth)
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.id limit 1;
  if v_actor is null then raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'chama-live:custom-next-period:'||p_request_id::text,0));

  select result into v_existing
  from private.custom_contribution_period_requests
  where request_id=p_request_id
  for update;
  if v_existing is not null then
    return jsonb_set(v_existing,'{replayed}','true'::jsonb,true);
  end if;

  select * into v_source
  from public.contribution_periods
  where group_id=p_group_id
    and contribution_type_id=p_contribution_type_id
    and status in ('open','due','grace','closed')
  order by closing_date desc,created_at desc,id desc
  limit 1
  for update;

  if not found then raise exception 'SOURCE_CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023'; end if;

  v_frequency:=lower(v_source.frequency);
  if v_frequency='weekly' then v_step:=interval '7 days';
  elsif v_frequency='monthly' then v_step:=interval '1 month';
  elsif v_frequency='quarterly' then v_step:=interval '3 months';
  elsif v_frequency='annual' then v_step:=interval '1 year';
  else raise exception 'NON_RECURRING_CUSTOM_CONTRIBUTION' using errcode='22023';
  end if;

  v_close_span:=v_source.closing_date-v_source.opening_date;
  v_due_span:=v_source.due_date-v_source.opening_date;
  v_next_open:=v_source.opening_date+v_step;
  v_next_due:=v_next_open+v_due_span;
  v_next_close:=v_next_open+v_close_span;

  if exists(
    select 1 from public.contribution_periods cp
    where cp.group_id=p_group_id
      and cp.contribution_type_id=p_contribution_type_id
      and cp.opening_date=v_next_open
      and cp.due_date=v_next_due
      and cp.closing_date=v_next_close
  ) then
    select jsonb_build_object(
      'ok',true,'operation','generate_next','replayed',false,
      'existing',true,'contribution_type_id',p_contribution_type_id,
      'period_id',cp.id,'status',cp.status
    ) into v_result
    from public.contribution_periods cp
    where cp.group_id=p_group_id and cp.contribution_type_id=p_contribution_type_id
      and cp.opening_date=v_next_open and cp.due_date=v_next_due
      and cp.closing_date=v_next_close
    limit 1;
    insert into private.custom_contribution_period_requests(request_id,group_id,contribution_type_id,source_period_id,result,completed_at)
    values(p_request_id,p_group_id,p_contribution_type_id,v_source.id,v_result,now());
    return v_result;
  end if;

  v_period_key:='custom:v1:'||p_contribution_type_id::text||':'||
    to_char(v_next_open,'YYYY-MM-DD')||':'||to_char(v_next_due,'YYYY-MM-DD')||':'||
    to_char(v_next_close,'YYYY-MM-DD');

  insert into public.contribution_periods(
    group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,
    due_date,status,created_by,name,description,amount,fine_rule_id
  ) values(
    p_group_id,p_contribution_type_id,v_source.frequency,v_period_key,v_next_open,
    v_next_close,v_next_due,'open',v_actor,v_source.name,v_source.description,
    v_source.amount,v_source.fine_rule_id
  ) returning id into v_period_id;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,date_trunc('month',v_next_open)::date,date_trunc('month',v_next_close)::date);

  insert into public.member_contribution_rules(
    group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,
    first_period_rule,status,created_by
  )
  select m.group_id,m.id,p_contribution_type_id,v_source.amount,v_source.frequency,
         v_next_open,v_next_close,'full_period','active',v_actor
  from public.members m
  where m.group_id=p_group_id
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
    and not exists(
      select 1 from public.member_contribution_rules r
      where r.group_id=m.group_id and r.member_id=m.id
        and r.contribution_type_id=p_contribution_type_id
        and r.effective_from=v_next_open and r.effective_to=v_next_close);

  insert into public.contribution_obligations(
    group_id,member_id,contribution_type_id,rule_id,obligation_month,due_amount,
    period_id,economic_month
  )
  select r.group_id,r.member_id,r.contribution_type_id,r.id,
         date_trunc('month',v_next_due)::date,r.amount,
         v_period_id,v_next_due
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.contribution_type_id=p_contribution_type_id
    and r.effective_from=v_next_open and r.effective_to=v_next_close
    and r.status='active'
    and not exists(
      select 1 from public.contribution_obligations o
      where o.group_id=r.group_id and o.member_id=r.member_id
        and o.contribution_type_id=r.contribution_type_id
        and o.obligation_month=date_trunc('month',v_next_due)::date
        and o.component_kind='PARENT');

  v_result:=jsonb_build_object(
    'ok',true,'operation','generate_next','replayed',false,
    'existing',false,'contribution_type_id',p_contribution_type_id,
    'source_period_id',v_source.id,'period_id',v_period_id,'status','open',
    'opening_date',v_next_open,'due_date',v_next_due,'closing_date',v_next_close);

  insert into private.custom_contribution_period_requests(
    request_id,group_id,contribution_type_id,source_period_id,result,completed_at)
  values(p_request_id,p_group_id,p_contribution_type_id,v_source.id,v_result,now());

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_other_contribution_fines(p_cycle_id uuid, p_request_id uuid, p_triggered_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_cycle public.contribution_periods%ROWTYPE;
  v_rule public.fine_rules%ROWTYPE;
  v_request private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_fine_eligible_at timestamptz;
  v_obligation record; v_existing_fine uuid; v_fine_id uuid;
  v_generated_count bigint:=0; v_existing_count bigint:=0; v_skipped_settled bigint:=0;
  v_base numeric(14,2); v_amount numeric(14,2); v_allocated numeric(14,2);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_cycle_id IS NULL OR p_request_id IS NULL OR p_triggered_at IS NULL THEN
    RAISE EXCEPTION 'Cycle id, request id and trigger time are required';
  END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'generate_fine');
  v_payload_hash:=md5(jsonb_build_object('cycle_id',p_cycle_id,'triggered_at',p_triggered_at)::text);
  SELECT * INTO v_request FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='generate_fine';
  IF FOUND THEN
    IF v_request.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Fine-generation request was previously used with another payload';
    END IF;
    IF v_request.completed_at IS NOT NULL AND v_request.result IS NOT NULL THEN
      RETURN v_request.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
  PERFORM private.cl_other_cycle_authorize(v_cycle.group_id);
  PERFORM private.cl_other_cycle_lock(v_cycle.group_id,v_cycle.contribution_type_id);
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id FOR UPDATE;
  IF v_cycle.status NOT IN ('open','due','grace','closed') THEN
    RAISE EXCEPTION 'Cycle status % cannot generate fines',v_cycle.status;
  END IF;
  IF v_cycle.fine_rule_id IS NULL THEN RAISE EXCEPTION 'Cycle has no fine rule'; END IF;
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=v_cycle.fine_rule_id AND r.group_id=v_cycle.group_id
    AND r.trigger_type='missed_contribution'
    AND r.applicability_mode IN ('ALL','SELECTED');
  IF NOT FOUND THEN RAISE EXCEPTION 'Configured Other fine rule is unavailable'; END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS(SELECT 1 FROM public.fine_rule_contribution_types rt
                    WHERE rt.rule_id=v_rule.id
                      AND rt.contribution_type_id=v_cycle.contribution_type_id) THEN
    RAISE EXCEPTION 'Configured fine rule is not applicable to this contribution type';
  END IF;
  v_fine_eligible_at:=((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')+
    CASE v_rule.grace_period_unit
      WHEN 'DAY' THEN make_interval(days=>v_rule.grace_period_value)
      WHEN 'WEEK' THEN make_interval(days=>v_rule.grace_period_value*7)
      WHEN 'MONTH' THEN make_interval(months=>v_rule.grace_period_value)
    END;
  IF p_triggered_at<v_fine_eligible_at THEN
    RAISE EXCEPTION 'Cycle has not crossed closing plus grace boundary';
  END IF;

  -- LOCK ORDER #4: all canonical Other obligations, then the fine-rule row.
  PERFORM 1
  FROM public.contribution_obligations o
  WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
  ORDER BY o.member_id,o.id FOR UPDATE;

  -- Re-lock/re-read the referenced rule after obligation locks.
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=v_cycle.fine_rule_id AND r.group_id=v_cycle.group_id
    AND r.trigger_type='missed_contribution'
    AND r.applicability_mode IN ('ALL','SELECTED') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configured Other fine rule disappeared'; END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS(SELECT 1 FROM public.fine_rule_contribution_types rt
                    WHERE rt.rule_id=v_rule.id
                      AND rt.contribution_type_id=v_cycle.contribution_type_id) THEN
    RAISE EXCEPTION 'Configured fine rule is not applicable to this contribution type';
  END IF;
  v_fine_eligible_at:=((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')+
    CASE v_rule.grace_period_unit
      WHEN 'DAY' THEN make_interval(days=>v_rule.grace_period_value)
      WHEN 'WEEK' THEN make_interval(days=>v_rule.grace_period_value*7)
      WHEN 'MONTH' THEN make_interval(months=>v_rule.grace_period_value)
    END;
  IF p_triggered_at<v_fine_eligible_at THEN
    RAISE EXCEPTION 'Cycle has not crossed closing plus grace boundary';
  END IF;

  FOR v_obligation IN
    SELECT
      o.id,o.group_id,o.member_id,o.contribution_type_id,o.due_amount,
      o.obligation_month,o.period_id,
      greatest(
        round(o.due_amount,2) -
        round(coalesce((SELECT sum(a.amount)
                        FROM public.contribution_allocations a
                        WHERE a.obligation_id=o.id),0),2),
        0
      ) AS outstanding_principal
    FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.rule_id IS NULL
      AND o.lifecycle_state='ACTIVE'
      AND (
        (o.component_kind='PARENT' AND o.parent_obligation_id IS NULL)
        OR
        (o.component_kind='RESIDUAL' AND o.parent_obligation_id IS NOT NULL)
      )
    ORDER BY o.member_id,o.id FOR UPDATE
  LOOP
    -- A decomposed Other parent is no longer the active canonical charge.
    -- The active residual carries the remaining principal; only ACTIVE
    -- Active Other parent/residual charge components are fine candidates.
    v_base:=v_obligation.outstanding_principal;
    IF v_base<=0 THEN v_skipped_settled:=v_skipped_settled+1; CONTINUE; END IF;

    SELECT f.id INTO v_existing_fine FROM public.fines f
    WHERE f.group_id=v_cycle.group_id AND f.member_id=v_obligation.member_id
      AND f.rule_id=v_rule.id AND f.trigger_type='missed_contribution'
      AND f.trigger_id=v_obligation.id FOR UPDATE;
    IF v_existing_fine IS NOT NULL THEN v_existing_count:=v_existing_count+1; CONTINUE; END IF;

    IF v_rule.calculation_method='FIXED' THEN
      v_amount:=round(v_rule.fixed_amount,2);
    ELSE
      v_amount:=round(v_base*v_rule.percentage_rate/100,2);
    END IF;
    IF v_rule.minimum_amount IS NOT NULL THEN
      v_amount:=greatest(v_amount,round(v_rule.minimum_amount,2));
    END IF;
    IF v_rule.maximum_amount IS NOT NULL THEN
      v_amount:=least(v_amount,round(v_rule.maximum_amount,2));
    END IF;
    IF v_amount<=0 THEN RAISE EXCEPTION 'Calculated fine amount must be positive'; END IF;

    -- No ON CONFLICT DO NOTHING: the fine identity was explicitly checked
    -- under the obligation lock; an unexpected unique collision aborts.
    INSERT INTO public.fines(
      group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
      original_amount,calculation_method,calculation_base,percentage_rate,
      fixed_amount,minimum_amount,maximum_amount,calculated_amount,
      resolved_closing_at,triggered_at)
    VALUES(v_cycle.group_id,v_obligation.member_id,v_rule.id,'missed_contribution',
           v_obligation.id,to_char(v_cycle.opening_date,'YYYY-MM'),v_amount,
           v_rule.calculation_method,v_base,v_rule.percentage_rate,v_rule.fixed_amount,
           v_rule.minimum_amount,v_rule.maximum_amount,v_amount,
           ((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi'),p_triggered_at)
    RETURNING id INTO v_fine_id;
    v_generated_count:=v_generated_count+1;
  END LOOP;

  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'generate_fine',v_cycle.id,v_cycle.group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle.id,
                            'generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,
                            'fine_eligible_at',v_fine_eligible_at,'idempotent_replay',false),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;
  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_FINE_GENERATION',v_actor,p_request_id,'generate_fine',
         jsonb_build_object('generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,'fine_rule_id',v_rule.id,
                            'fine_eligible_at',v_fine_eligible_at,'triggered_at',p_triggered_at));
  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,
                            'generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,
                            'fine_eligible_at',v_fine_eligible_at,'idempotent_replay',false);
END $function$


CREATE OR REPLACE FUNCTION public.get_canonical_member_monthly_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_number text, member_name text, monthly_due numeric, previous_outstanding numeric, previous_credit numeric, current_month_payment numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, total_paid_to_date numeric, total_due_to_date numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_month date;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if not public.cl_user_in_group(p_group_id) then
        raise exception 'You do not have access to this group';
    end if;
    if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
        raise exception 'Month must use YYYY-MM format';
    end if;
    v_month := (p_month || '-01')::date;

    return query
    with member_set as (
        select m.id, m.member_number::text, m.name
        from public.members m
        where m.group_id = p_group_id
          and lower(coalesce(m.status, 'active')) = 'active'
          and (m.join_date is null or date_trunc('month', m.join_date)::date <= v_month)
    ),
    obligations as (
        select o.member_id, o.obligation_month, o.due_amount::numeric as due_amount
        from public.contribution_obligations o
        where o.group_id = p_group_id
          and o.obligation_month <= v_month
          and o.rule_id is not null
    ),
    obligation_totals as (
        select o.member_id,
               coalesce(sum(o.due_amount) filter (where o.obligation_month = v_month), 0)::numeric as monthly_due,
               coalesce(sum(o.due_amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_due,
               coalesce(sum(o.due_amount), 0)::numeric as total_due
        from obligations o group by o.member_id
    ),
    payments as (
        select c.id, c.member_id, c.amount::numeric as amount, c.contribution_date
        from public.contributions c
        where c.group_id = p_group_id
          and lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
          and c.contribution_date is not null
          and c.contribution_date < (v_month + interval '1 month')::date
    ),
    payment_totals as (
        select p.member_id,
               coalesce(sum(p.amount) filter (
                   where p.contribution_date >= v_month
                     and p.contribution_date < (v_month + interval '1 month')::date
               ), 0)::numeric as current_month_payment,
               coalesce(sum(p.amount), 0)::numeric as total_paid
        from payments p group by p.member_id
    ),
    allocation_totals as (
        select o.member_id,
               coalesce(sum(ca.amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_allocated,
               coalesce(sum(ca.amount) filter (where o.obligation_month = v_month), 0)::numeric as current_allocated,
               coalesce(sum(ca.amount), 0)::numeric as total_allocated
        from public.contribution_allocations ca
        join public.contribution_obligations o on o.id = ca.obligation_id
        where o.group_id = p_group_id and o.obligation_month <= v_month
        group by o.member_id
    )
    select
        ms.id,
        ms.member_number,
        ms.name,
        coalesce(ot.monthly_due, 0)::numeric,
        greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated, 0), 0)::numeric,
        greatest(coalesce(at.prior_allocated, 0) - coalesce(ot.prior_due, 0), 0)::numeric,
        coalesce(pt.current_month_payment, 0)::numeric,
        coalesce(at.current_allocated, 0)::numeric,
        greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0)::numeric,
        greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0)::numeric,
        coalesce(pt.total_paid, 0)::numeric,
        coalesce(ot.total_due, 0)::numeric,
        case
            when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0
             and greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0) > 0 then 'credit'
            when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0 then 'paid'
            when coalesce(at.current_allocated, 0) > 0 then 'partial'
            else 'outstanding'
        end::text
    from member_set ms
    left join obligation_totals ot on ot.member_id = ms.id
    left join payment_totals pt on pt.member_id = ms.id
    left join allocation_totals at on at.member_id = ms.id
    order by ms.name;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_canonical_monthly_accounting_summary(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
    v_expected numeric := 0;
    v_collected numeric := 0;
    v_applied numeric := 0;
    v_credit numeric := 0;
    v_outstanding numeric := 0;

    v_active integer := 0;
    v_paid integer := 0;
    v_partial integer := 0;
    v_unpaid integer := 0;

    v_collection_rate numeric := 0;

begin

    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;


    if not public.cl_user_in_group(p_group_id) then
        raise exception
            'You do not have access to this group';
    end if;


    select

        count(*)::integer,

        coalesce(
            sum(s.monthly_due),
            0
        ),

        coalesce(
            sum(s.current_month_payment),
            0
        ),

        coalesce(
            sum(s.applied_this_month),
            0
        ),

        coalesce(
            sum(s.carry_forward),
            0
        ),

        coalesce(
            sum(s.current_outstanding),
            0
        ),

        count(*) filter (
            where s.status in (
                'paid',
                'credit'
            )
        )::integer,

        count(*) filter (
            where s.status = 'partial'
        )::integer,

        count(*) filter (
            where s.status = 'outstanding'
        )::integer

    into

        v_active,
        v_expected,
        v_collected,
        v_applied,
        v_credit,
        v_outstanding,
        v_paid,
        v_partial,
        v_unpaid

    from public.get_canonical_member_monthly_status(
        p_group_id,
        p_month
    ) s;


    if v_expected > 0 then

        v_collection_rate :=
            least(
                (
                    v_applied /
                    v_expected
                ) * 100,
                100
            );

    end if;


    return jsonb_build_object(

        'month',
        p_month,

        'active_members',
        v_active,

        'expected_monthly_contributions',
        v_expected,

        'total_contributions_collected',
        v_collected,

        'applied_this_month',
        v_applied,

        'carry_forward',
        v_credit,

        'current_outstanding',
        v_outstanding,

        'members_paid',
        v_paid,

        'partial_payments',
        v_partial,

        'outstanding_members',
        v_unpaid,

        'collection_rate',
        round(
            v_collection_rate,
            2
        )
    );

end;
$function$



CREATE OR REPLACE FUNCTION public.get_contribution_initiative_member_status(p_initiative_id uuid, p_member_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_o public.contribution_initiative_obligations;
  v_allocated numeric := 0;
  v_credit numeric := 0;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT * INTO v_o FROM public.contribution_initiative_obligations
  WHERE initiative_period_id=v_p.id AND member_id=p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'obligation_exists',false);
  END IF;

  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.initiative_obligation_id=v_o.id
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);

  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c
  WHERE c.initiative_id=p_initiative_id AND c.member_id=p_member_id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'member_id',p_member_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'amount_due',v_o.amount_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',greatest(v_o.amount_due-v_allocated,0),
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id
    into v_group_id
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select im.id,
           im.member_id,
           im.amount,
           im.effective_from,
           im.effective_to,
           im.status
      from public.contribution_initiative_members im
     where im.initiative_id = p_initiative_id
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_period_status(p_initiative_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_obligations integer;
  v_allocated numeric;
  v_outstanding numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT count(*),
         coalesce(sum(coalesce(a.allocated,0)),0),
         coalesce(sum(greatest(o.amount_due-coalesce(a.allocated,0),0)),0)
  INTO v_obligations,v_allocated,v_outstanding
  FROM public.contribution_initiative_obligations o
  LEFT JOIN LATERAL (
    SELECT sum(x.amount) allocated
    FROM public.contribution_initiative_allocations x
    WHERE x.initiative_obligation_id=o.id
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=x.payment_id)
  ) a ON true
  WHERE o.initiative_period_id=v_p.id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'opening_date',v_p.opening_date,
    'closing_date',v_p.closing_date,
    'status',v_p.status,
    'obligation_count',v_obligations,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_recurring_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_frequency text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id, ci.frequency
    into v_group_id, v_frequency
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  if v_frequency <> 'monthly' then
    raise exception 'Initiative is not recurring monthly';
  end if;

  return query
    select im.id,
           im.member_id,
           coalesce(term.amount, im.amount),
           coalesce(term.effective_from, im.effective_from),
           coalesce(term.effective_to, im.effective_to),
           coalesce(term.status, im.status)
      from public.contribution_initiative_members im
      left join lateral (
        select t.amount, t.effective_from, t.effective_to, t.status
          from public.contribution_initiative_member_terms t
         where t.initiative_member_id = im.id
         order by t.effective_from desc
         limit 1
      ) term on true
     where im.initiative_id = p_initiative_id
       and lower(coalesce(im.status, 'active')) = 'active'
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_summary(p_initiative_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_periods integer;
  v_obligations integer;
  v_due numeric;
  v_allocated numeric;
  v_outstanding numeric;
  v_credit numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT count(*) INTO v_periods FROM public.contribution_initiative_periods WHERE initiative_id=p_initiative_id;
  SELECT count(*),coalesce(sum(o.amount_due),0) INTO v_obligations,v_due
  FROM public.contribution_initiative_obligations o WHERE o.initiative_id=p_initiative_id AND o.initiative_period_id IS NOT NULL;
  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE EXISTS (SELECT 1 FROM public.contribution_initiative_obligations o WHERE o.id=a.initiative_obligation_id AND o.initiative_id=p_initiative_id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);
  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c WHERE c.initiative_id=p_initiative_id;
  v_outstanding=greatest(v_due-v_allocated,0);

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'status',v_i.status,
    'frequency',v_i.frequency,
    'period_count',v_periods,
    'obligation_count',v_obligations,
    'amount_due',v_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding,
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_positions(p_group_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, current_opening_date date, current_closing_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_day smallint; v_close date; v_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT s.monthly_closing_day INTO v_day FROM public.group_contribution_settings s WHERE s.group_id=p_group_id;
  IF v_day IS NULL THEN v_day := 5; END IF;
  v_close := CASE WHEN current_date <= make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    THEN make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    ELSE make_date(extract(year from current_date + interval '1 month')::int,extract(month from current_date + interval '1 month')::int,v_day) END;
  v_open := v_close - interval '1 month' + interval '1 day';
  v_open := v_open::date;
  RETURN QUERY SELECT p_group_id,v_day,v_open,v_close;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_custom_contribution_status(p_group_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, contribution_name text, period_id uuid, amount_due numeric, amount_applied numeric, outstanding numeric, status text, due_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group custom contribution status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.member_id,
    m.name::text,
    COALESCE(NULLIF(trim(cp.name), ''), NULLIF(trim(ct.name), ''), 'Custom Contribution')::text,
    cp.id,
    COALESCE(o.due_amount, 0)::numeric,
    COALESCE(alloc.amount_applied, 0)::numeric,
    GREATEST(COALESCE(o.due_amount, 0) - COALESCE(alloc.amount_applied, 0), 0)::numeric,
    CASE
      WHEN COALESCE(alloc.amount_applied, 0) >= COALESCE(o.due_amount, 0) THEN 'paid'
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
  ) AS alloc ON true
  WHERE o.group_id = p_group_id
    AND lower(trim(COALESCE(ct.code, ''))) = 'custom'
    AND lower(trim(COALESCE(cp.status, ''))) IN ('open', 'due', 'grace')
  ORDER BY cp.due_date NULLS LAST, cp.name, m.name;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_module_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  return query
  select g.id, g.merry_go_round_enabled, g.loans_enabled
  from public.groups g
  where g.id = p_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_group_monthly_cycle_status(p_group_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, monthly_grace_days smallint, cycle_opening_date date, cycle_closing_date date, cycle_status text, grace_start_date date, grace_end_date date, is_in_grace boolean, next_cycle_opening_date date, next_cycle_closing_date date, grace_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_closing_day smallint;
  v_grace_days smallint;
  v_owner_user_id uuid;
  v_role text;
  v_cycle_closing date;
  v_cycle_opening date;
  v_previous_closing date;
  v_grace_start date;
  v_grace_end date;
  v_next_opening date;
  v_next_closing date;
  v_in_grace boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select g.owner_user_id into v_owner_user_id
  from public.groups g
  where g.id = p_group_id;

  if v_owner_user_id is null then raise exception 'GROUP_NOT_FOUND'; end if;

  v_role := public.current_user_role(p_group_id);

  if auth.uid() <> v_owner_user_id and v_role is null then
    raise exception 'GROUP_ACCESS_NOT_AUTHORIZED';
  end if;

  select s.monthly_closing_day, coalesce(s.monthly_grace_days,0)
    into v_closing_day, v_grace_days
  from public.group_contribution_settings s
  where s.group_id=p_group_id;

  if v_closing_day is null then raise exception 'CONTRIBUTION_SETTINGS_NOT_FOUND'; end if;

  if extract(day from p_as_of_date)::int <= v_closing_day then
    v_cycle_closing := make_date(extract(year from p_as_of_date)::int,extract(month from p_as_of_date)::int,v_closing_day);
  else
    v_cycle_closing := (date_trunc('month',p_as_of_date)::date + interval '1 month')::date + (v_closing_day-1);
  end if;

  v_cycle_opening := (v_cycle_closing - interval '1 month')::date + 1;
  v_next_opening := v_cycle_closing + 1;
  v_next_closing := (v_cycle_closing + interval '1 month')::date;

  if extract(day from p_as_of_date)::int > v_closing_day then
    v_previous_closing := date_trunc('month',p_as_of_date)::date + (v_closing_day-1);
  else
    v_previous_closing := (date_trunc('month',p_as_of_date)::date - interval '1 month')::date + (v_closing_day-1);
  end if;

  v_grace_start := v_previous_closing + 1;
  v_grace_end := v_previous_closing + v_grace_days;
  v_in_grace := v_grace_days > 0 and p_as_of_date between v_grace_start and v_grace_end;

  return query
  select p_group_id,v_closing_day,v_grace_days,v_cycle_opening,v_cycle_closing,
    case when v_in_grace then 'GRACE' else 'OPEN' end,
    v_grace_start,v_grace_end,v_in_grace,v_next_opening,v_next_closing,
    case when v_in_grace then 'Previous contribution cycle is in its grace period through '||to_char(v_grace_end,'DD Mon YYYY') else null end;
end;
$function$



CREATE OR REPLACE FUNCTION public.get_group_subscription(p_group_id uuid)
 RETURNS TABLE(subscription_id uuid, group_id uuid, status text, started_at timestamp with time zone, pricing_tier_code text, standard_group_amount numeric, standard_member_login_amount numeric, currency text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT s.id,s.group_id,s.status,s.started_at,s.pricing_tier_code,s.standard_group_amount,s.standard_member_login_amount,s.currency FROM public.group_subscriptions s WHERE s.group_id=p_group_id AND public.cl_user_in_group(p_group_id); $function$


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
$function$


CREATE OR REPLACE FUNCTION public.get_member_monthly_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_name text, member_number text, monthly_due numeric, previous_outstanding numeric, payment_this_month numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, contribution_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_selected_month date;
    v_monthly_due numeric := 0;
    r_member record;

    v_debt numeric := 0;
    v_credit numeric := 0;
    v_payment numeric := 0;
    v_available numeric := 0;
    v_current_due numeric := 0;
    v_applied numeric := 0;
    v_current_outstanding numeric := 0;
    v_previous_outstanding numeric := 0;

    v_month date;
    v_start_month date;
BEGIN

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_month IS NULL
       OR p_month !~ '^\d{4}-\d{2}$'
    THEN
        RAISE EXCEPTION 'Invalid month. Expected YYYY-MM';
    END IF;

    v_selected_month :=
        (p_month || '-01')::date;

    IF NOT public.cl_user_in_group(p_group_id) THEN
        RAISE EXCEPTION
            'You are not a member of this group';
    END IF;

    SELECT COALESCE(
        g.monthly_contribution,
        0
    )
    INTO v_monthly_due
    FROM public.groups g
    WHERE g.id = p_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found';
    END IF;

    /*
     * ACTIVE MEMBERS
     *
     * status = active is the authoritative membership
     * condition for contribution reporting.
     *
     * onboarding_status is deliberately NOT used here.
     */
    FOR r_member IN
        SELECT
            m.id,
            m.name,
            m.member_number,
            m.join_date
        FROM public.members m
        WHERE m.group_id = p_group_id
          AND lower(
                COALESCE(m.status, 'active')
              ) = 'active'
        ORDER BY m.name
    LOOP

        v_debt := 0;
        v_credit := 0;

        v_start_month :=
            date_trunc(
                'month',
                COALESCE(
                    r_member.join_date,
                    v_selected_month
                )
            )::date;

        IF v_start_month > v_selected_month THEN
            v_start_month := v_selected_month;
        END IF;

        v_month := v_start_month;

        /*
         * Process months before selected month.
         */
        WHILE v_month < v_selected_month LOOP

            SELECT COALESCE(
                SUM(c.amount),
                0
            )
            INTO v_payment
            FROM public.contributions c
            WHERE c.group_id = p_group_id
              AND c.member_id = r_member.id
              AND lower(
                    COALESCE(
                        c.contribution_type,
                        ''
                    )
                  ) = 'monthly'
              AND c.contribution_date >= v_month
              AND c.contribution_date <
                    (
                        v_month +
                        interval '1 month'
                    )::date;

            v_available :=
                v_payment + v_credit;

            /*
             * Clear historical debt first.
             */
            IF v_debt > 0 THEN

                IF v_available >= v_debt THEN
                    v_available :=
                        v_available - v_debt;

                    v_debt := 0;

                ELSE
                    v_debt :=
                        v_debt - v_available;

                    v_available := 0;

                END IF;

            END IF;

            v_applied :=
                LEAST(
                    v_available,
                    v_monthly_due
                );

            v_available :=
                GREATEST(
                    v_available - v_applied,
                    0
                );

            v_current_outstanding :=
                GREATEST(
                    v_monthly_due - v_applied,
                    0
                );

            v_credit := v_available;

            v_debt :=
                v_debt +
                v_current_outstanding;

            v_month :=
                (
                    v_month +
                    interval '1 month'
                )::date;

        END LOOP;

        /*
         * Debt entering selected month.
         */
        v_previous_outstanding :=
            GREATEST(v_debt, 0);

        /*
         * Selected month's actual monthly payments.
         */
        SELECT COALESCE(
            SUM(c.amount),
            0
        )
        INTO v_payment
        FROM public.contributions c
        WHERE c.group_id = p_group_id
          AND c.member_id = r_member.id
          AND lower(
                COALESCE(
                    c.contribution_type,
                    ''
                )
              ) = 'monthly'
          AND c.contribution_date >=
                v_selected_month
          AND c.contribution_date <
                (
                    v_selected_month +
                    interval '1 month'
                )::date;

        v_available :=
            v_payment + v_credit;

        /*
         * Previous arrears are cleared first.
         */
        IF v_debt > 0 THEN

            IF v_available >= v_debt THEN

                v_available :=
                    v_available - v_debt;

                v_debt := 0;

            ELSE

                v_debt :=
                    v_debt - v_available;

                v_available := 0;

            END IF;

        END IF;

        v_current_due :=
            v_monthly_due;

        v_applied :=
            LEAST(
                v_available,
                v_current_due
            );

        v_available :=
            GREATEST(
                v_available - v_applied,
                0
            );

        v_current_outstanding :=
            GREATEST(
                v_current_due - v_applied,
                0
            );

        v_credit :=
            v_available;

        /*
         * RETURN ROW
         */
        member_id :=
            r_member.id;

        member_name :=
            r_member.name;

        member_number :=
            r_member.member_number;

        monthly_due :=
            v_monthly_due;

        previous_outstanding :=
            v_previous_outstanding;

        payment_this_month :=
            v_payment;

        applied_this_month :=
            v_applied;

        carry_forward :=
            v_credit;

        current_outstanding :=
            v_current_outstanding;

        contribution_status :=
            CASE
                WHEN v_current_outstanding <= 0
                    THEN 'Paid'

                WHEN v_applied > 0
                    THEN 'Partial'

                ELSE 'Outstanding'
            END;

        RETURN NEXT;

    END LOOP;

END;
$function$


CREATE OR REPLACE FUNCTION public.get_member_payment_allocation_statement(p_member_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(payment_id uuid, member_id uuid, group_id uuid, payment_date date, payment_amount numeric, payment_method text, reference text, mpesa_reference text, notes text, created_at timestamp with time zone, allocation_id uuid, allocated_amount numeric, obligation_id uuid, obligation_month date, obligation_due_amount numeric, economic_month date, contribution_type_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select
        c.id as payment_id,
        c.member_id,
        c.group_id,
        c.contribution_date as payment_date,
        c.amount as payment_amount,
        c.payment_method,
        c.reference,
        c.mpesa_reference,
        c.notes,
        c.created_at,
        a.id as allocation_id,
        a.amount as allocated_amount,
        o.id as obligation_id,
        o.obligation_month,
        o.due_amount as obligation_due_amount,
        o.economic_month,
        o.contribution_type_id
    from public.contributions c
    join public.members m
      on m.id = c.member_id
    left join public.contribution_allocations a
      on a.payment_id = c.id
    left join public.contribution_obligations o
      on o.id = a.obligation_id
     and o.member_id = c.member_id
     and o.group_id = c.group_id
    where c.member_id = p_member_id
      and c.group_id = m.group_id
      and auth.uid() is not null
      and (
          m.user_id = auth.uid()
          or m.auth_user_id = auth.uid()
          or public.cl_user_has_role(
              m.group_id,
              array[
                  'admin',
                  'chairperson',
                  'treasurer',
                  'secretary'
              ]::text[]
          )
      )
      and (
          p_from_date is null
          or c.contribution_date >= p_from_date
      )
      and (
          p_to_date is null
          or c.contribution_date <= p_to_date
      )
    order by
        c.contribution_date desc nulls last,
        c.created_at desc,
        c.id desc,
        o.obligation_month asc nulls last,
        o.id asc nulls last;
$function$


CREATE OR REPLACE FUNCTION public.get_member_payment_statement(p_member_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(payment_id uuid, member_id uuid, group_id uuid, payment_date date, amount numeric, contribution_type text, payment_method text, reference text, mpesa_reference text, initiative_id uuid, initiative_name text, initiative_contribution_type_id uuid, initiative_contribution_type_name text, notes text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT
        c.id AS payment_id,
        c.member_id,
        c.group_id,
        c.contribution_date AS payment_date,
        c.amount::numeric,
        c.contribution_type,
        c.payment_method,
        c.reference,
        c.mpesa_reference,
        c.initiative_id,
        ci.name AS initiative_name,
        ci.contribution_type_id AS initiative_contribution_type_id,
        ct.name AS initiative_contribution_type_name,
        c.notes,
        c.created_at
    FROM public.contributions AS c
    JOIN public.members AS m
        ON m.id = c.member_id
       AND m.group_id = c.group_id
    LEFT JOIN public.contribution_initiatives AS ci
        ON ci.id = c.initiative_id
       AND ci.group_id = c.group_id
    LEFT JOIN public.contribution_types AS ct
        ON ct.id = ci.contribution_type_id
       AND ct.group_id = c.group_id
    WHERE c.member_id = p_member_id
      AND auth.uid() IS NOT NULL
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
          OR public.cl_user_has_role(
              m.group_id,
              ARRAY['admin','chairperson','treasurer','secretary']::text[]
          )
      )
      AND (
          p_from_date IS NULL
          OR c.contribution_date >= p_from_date
      )
      AND (
          p_to_date IS NULL
          OR c.contribution_date <= p_to_date
      )
    ORDER BY
        c.contribution_date DESC NULLS LAST,
        c.created_at DESC,
        c.id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_member_total_recognized_payments(p_member_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_recognized numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT
        m.id AS member_id,
        m.group_id,
        COALESCE(SUM(c.amount), 0)::numeric AS total_recognized
    FROM public.members AS m
    LEFT JOIN public.contributions AS c
        ON c.member_id = m.id
       AND c.group_id = m.group_id
    WHERE m.id = p_member_id
      AND auth.uid() IS NOT NULL
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
          OR public.cl_user_has_role(
              m.group_id,
              ARRAY['admin','chairperson','treasurer','secretary']::text[]
          )
      )
    GROUP BY
        m.id,
        m.group_id;
$function$


CREATE OR REPLACE FUNCTION public.get_monthly_accounting_summary(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_end date;
  v_expected numeric := 0;
  v_collected numeric := 0;
  v_applied numeric := 0;
  v_credit numeric := 0;
  v_outstanding numeric := 0;
  v_expenses numeric := 0;
  v_opening numeric := 0;
  v_closing numeric := 0;
  v_active integer := 0;
  v_paid integer := 0;
  v_partial integer := 0;
  v_unpaid integer := 0;
  v_rate numeric := 0;
  v_period_status text := 'open';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_group_id is null then
    raise exception 'Group is required';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month. Expected YYYY-MM';
  end if;

  if not public.cl_user_in_group(p_group_id) then
    raise exception 'You are not a member of this group';
  end if;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month')::date;

  select
    coalesce(fp.opening_balance, 0),
    coalesce(fp.status, 'open')
  into
    v_opening,
    v_period_status
  from public.financial_periods fp
  where fp.group_id = p_group_id
    and fp.month = p_month
  limit 1;

  if not found then
    select coalesce(
      (
        select fp.closing_balance
        from public.financial_periods fp
        where fp.group_id = p_group_id
          and lower(fp.status) = 'closed'
          and fp.month < p_month
        order by fp.month desc
        limit 1
      ),
      (
        select mc.closing_balance
        from public.monthly_closings mc
        where mc.group_id = p_group_id
          and mc.closing_month < v_start
        order by mc.closing_month desc
        limit 1
      ),
      g.opening_balance,
      0
    )
    into v_opening
    from public.groups g
    where g.id = p_group_id;
  end if;

  select
    coalesce(sum(s.monthly_due), 0),
    coalesce(sum(s.applied_this_month), 0),
    coalesce(sum(s.carry_forward), 0),
    coalesce(sum(s.current_outstanding), 0),
    count(*),
    count(*) filter (
      where lower(s.status) in ('paid', 'credit')
    ),
    count(*) filter (
      where lower(s.status) = 'partial'
    ),
    count(*) filter (
      where lower(s.status) = 'outstanding'
    )
  into
    v_expected,
    v_applied,
    v_credit,
    v_outstanding,
    v_active,
    v_paid,
    v_partial,
    v_unpaid
  from public.get_canonical_member_monthly_status(
    p_group_id,
    p_month
  ) s;

  select coalesce(sum(c.amount), 0)
  into v_collected
  from public.contributions c
  where c.group_id = p_group_id
    and c.contribution_date >= v_start
    and c.contribution_date < v_end;

  select coalesce(sum(e.amount), 0)
  into v_expenses
  from public.expenses e
  where e.group_id = p_group_id
    and e.date >= v_start
    and e.date < v_end
    and lower(coalesce(e.approval_status, '')) = 'approved';

  if v_expected > 0 then
    v_rate := least((v_applied / v_expected) * 100, 100);
  end if;

  v_closing :=
    v_opening
    + v_collected
    - v_expenses;

  return jsonb_build_object(
    'month', p_month,
    'period_status', v_period_status,
    'opening_balance', v_opening,
    'expected_monthly_contributions', v_expected,
    'total_contributions_collected', v_collected,
    'applied_this_month', v_applied,
    'carry_forward', v_credit,
    'current_outstanding', v_outstanding,
    'approved_expenses', v_expenses,
    'closing_balance', v_closing,
    'active_members', v_active,
    'members_paid', v_paid,
    'partial_payments', v_partial,
    'outstanding_members', v_unpaid,
    'collection_rate', round(v_rate, 2)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.get_monthly_contribution_progress(p_group_id uuid, p_month text)
 RETURNS TABLE(month text, expected numeric, collected numeric, percentage numeric, members_total bigint, members_contributed bigint, participation_percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_auth_group uuid;

begin

  v_auth_group :=
    public.my_group_id();


  if v_auth_group is null
     or p_group_id <> v_auth_group then

    raise exception
      'You do not have access to this group.';

  end if;


  return query

  with active as (

    select
      count(*)::bigint as total

    from public.members m

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

  ),

  payments as (

    select

      coalesce(
        sum(c.amount),
        0
      )::numeric as collected,

      count(
        distinct c.member_id
      )::bigint as members_contributed

    from public.contributions c

    where c.group_id = p_group_id

      and c.month = p_month

      and lower(
        coalesce(
          c.contribution_type,
          ''
        )
      ) = 'monthly'

  ),

  expected as (

    select

      coalesce(
        sum(
          case

            when date_trunc(
              'month',
              m.join_date
            )::date
            <= to_date(
              p_month || '-01',
              'YYYY-MM-DD'
            )

            then g.monthly_contribution

            else 0

          end
        ),
        0
      )::numeric as expected

    from public.members m

    join public.groups g
      on g.id = m.group_id

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

  )

  select

    p_month,

    e.expected,

    p.collected,

    case

      when e.expected <= 0
        then 0

      else round(
        least(
          100,
          (
            p.collected
            /
            e.expected
          ) * 100
        ),
        2
      )

    end,

    a.total,

    p.members_contributed,

    case

      when a.total <= 0
        then 0

      else round(
        (
          p.members_contributed::numeric
          /
          a.total
        ) * 100,
        2
      )

    end

  from active a
  cross join payments p
  cross join expected e;

end;

$function$


CREATE OR REPLACE FUNCTION public.get_monthly_contribution_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_number text, member_name text, monthly_due numeric, previous_outstanding numeric, previous_credit numeric, current_month_payment numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, total_paid_to_date numeric, total_due_to_date numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_auth_group uuid;

  v_month_date date;

begin

  v_auth_group :=
    public.my_group_id();


  if v_auth_group is null then

    raise exception
      'No active member group found.';

  end if;


  if p_group_id <> v_auth_group then

    raise exception
      'You do not have access to this group.';

  end if;


  if p_month is null
     or p_month !~ '^[0-9]{4}-[0-9]{2}$' then

    raise exception
      'Month must use YYYY-MM format.';

  end if;


  v_month_date :=
    to_date(
      p_month || '-01',
      'YYYY-MM-DD'
    );


  return query

  with active_members as (

    select

      m.id,

      m.member_number,

      m.name,

      g.monthly_contribution,

      greatest(
        date_trunc(
          'month',
          m.join_date
        )::date,
        date '1900-01-01'
      ) as join_month

    from public.members m

    join public.groups g
      on g.id = m.group_id

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

      and date_trunc(
        'month',
        m.join_date
      )::date <= v_month_date

  ),

  member_due as (

    select

      am.*,

      (
        greatest(
          0,
          (
            (
              extract(
                year
                from age(
                  v_month_date,
                  am.join_month
                )
              )::integer
              * 12
            )
            +
            extract(
              month
              from age(
                v_month_date,
                am.join_month
              )
            )::integer
            + 1
          )
        )
        * coalesce(
          am.monthly_contribution,
          0
        )
      )::numeric
      as total_due

    from active_members am

  ),

  payment_totals as (

    select

      c.member_id,

      coalesce(
        sum(
          case
            when c.month < p_month
            then c.amount
            else 0
          end
        ),
        0
      )::numeric
      as previous_paid,

      coalesce(
        sum(
          case
            when c.month = p_month
            then c.amount
            else 0
          end
        ),
        0
      )::numeric
      as current_paid,

      coalesce(
        sum(c.amount),
        0
      )::numeric
      as total_paid

    from public.contributions c

    where c.group_id = p_group_id

      and lower(
        coalesce(
          c.contribution_type,
          ''
        )
      ) = 'monthly'

      and c.month <= p_month

    group by
      c.member_id

  ),

  previous_due as (

    select

      md.*,

      greatest(
        0,

        (
          md.total_due
          -
          md.monthly_due
        )
      )::numeric
      as due_before_current

    from (

      select

        md0.*,

        (
          greatest(
            0,

            (
              (
                extract(
                  year
                  from age(
                    v_month_date,
                    md0.join_month
                  )
                )::integer
                * 12
              )
              +
              extract(
                month
                from age(
                  v_month_date,
                  md0.join_month
                )
              )::integer
              + 1
            )
          )
          * coalesce(
            md0.monthly_contribution,
            0
          )
        )::numeric
        as total_due

      from active_members md0

    ) md

  ),

  calculations as (

    select

      md.id,

      md.member_number,

      md.name,

      coalesce(
        md.monthly_contribution,
        0
      )::numeric
      as monthly_due,

      greatest(
        0,

        md.total_due
        -
        md.monthly_due
        -
        coalesce(
          pt.previous_paid,
          0
        )

      )::numeric
      as previous_outstanding,

      greatest(
        0,

        coalesce(
          pt.previous_paid,
          0
        )
        -
        (
          md.total_due
          -
          md.monthly_due
        )

      )::numeric
      as previous_credit,

      coalesce(
        pt.current_paid,
        0
      )::numeric
      as current_month_payment,

      greatest(
        0,

        least(
          md.monthly_due,

          greatest(
            0,

            greatest(
              0,

              coalesce(
                pt.previous_paid,
                0
              )
              -
              (
                md.total_due
                -
                md.monthly_due
              )
            )
            +
            coalesce(
              pt.current_paid,
              0
            )

          )

        )

      )::numeric
      as applied_this_month,

      greatest(
        0,

        greatest(
          0,

          greatest(
            0,

            coalesce(
              pt.previous_paid,
              0
            )
            -
            (
              md.total_due
              -
              md.monthly_due
            )

          )
          +
          coalesce(
            pt.current_paid,
            0
          )

        )
        -
        md.monthly_due

      )::numeric
      as carry_forward,

      greatest(
        0,

        md.total_due
        -
        coalesce(
          pt.total_paid,
          0
        )

      )::numeric
      as current_outstanding,

      coalesce(
        pt.total_paid,
        0
      )::numeric
      as total_paid_to_date,

      md.total_due

    from member_due md

    left join payment_totals pt
      on pt.member_id = md.id

  )

  select

    c.id,

    c.member_number,

    c.name,

    c.monthly_due,

    c.previous_outstanding,

    c.previous_credit,

    c.current_month_payment,

    c.applied_this_month,

    c.carry_forward,

    c.current_outstanding,

    c.total_paid_to_date,

    c.total_due,

    case

      when c.current_outstanding <= 0
        and c.carry_forward > 0
        then 'credit'

      when c.current_outstanding <= 0
        then 'paid'

      when c.current_month_payment > 0
        then 'partial'

      else 'outstanding'

    end

  from calculations c

  order by
    c.name;

end;

$function$


CREATE OR REPLACE FUNCTION public.get_monthly_financial_report(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return public.get_monthly_accounting_summary(p_group_id, p_month);
end;
$function$



CREATE OR REPLACE FUNCTION public.get_my_active_contribution_initiatives()
 RETURNS TABLE(initiative_id uuid, group_id uuid, name text, description text, start_date date, closing_date date, amount numeric, frequency text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT i.id,i.group_id,i.name,i.description,i.start_date,i.closing_date,im.amount,i.frequency,i.status
  FROM public.contribution_initiatives i
  JOIN public.contribution_initiative_members im ON im.initiative_id=i.id
  JOIN public.members m ON m.id=im.member_id
  WHERE i.status='active' AND im.status='active'
    AND auth.uid() IS NOT NULL
    AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
    AND current_date BETWEEN i.start_date AND i.closing_date
  ORDER BY i.start_date,i.name;
$function$


CREATE OR REPLACE FUNCTION public.get_my_contribution_position()
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH target_member AS (
  SELECT m.id, m.group_id
  FROM public.members m
  WHERE auth.uid() IS NOT NULL
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at, m.id
  LIMIT 1
),
monthly_types AS (
  SELECT DISTINCT ON (ct.group_id)
    ct.group_id,
    ct.id AS contribution_type_id
  FROM public.contribution_types ct
  WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
     OR lower(trim(coalesce(ct.name, ''))) = 'monthly'
  ORDER BY ct.group_id,
    CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
    ct.created_at, ct.id
),
current_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS current_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  WHERE o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
  GROUP BY o.member_id, o.group_id
),
all_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS total_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
allocation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(a.amount), 0)::numeric AS total_allocated,
    coalesce(
      sum(
        CASE
          WHEN o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
          THEN a.amount
          ELSE 0
        END
      ),
      0
    )::numeric AS current_allocated
  FROM public.contribution_allocations a
  JOIN public.contribution_obligations o
    ON o.id = a.obligation_id
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
payment_totals AS (
  SELECT
    c.member_id,
    coalesce(
      sum(c.amount - coalesce(pa.allocated_amount, 0)),
      0
    )::numeric AS credit
  FROM public.contributions c
  JOIN target_member tm
    ON tm.id = c.member_id
  LEFT JOIN (
    SELECT
      a.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS allocated_amount
    FROM public.contribution_allocations a
    GROUP BY a.payment_id
  ) pa
    ON pa.payment_id = c.id
  WHERE lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
  GROUP BY c.member_id
)
SELECT
  tm.id AS member_id,
  tm.group_id,
  coalesce(aot.total_due, 0)::numeric(14,2) AS total_due,
  coalesce(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
  greatest(
    coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
    0
  )::numeric(14,2) AS arrears,
  greatest(coalesce(pt.credit, 0), 0)::numeric(14,2) AS credit,
  CASE
    WHEN greatest(
      coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
      0
    ) > 0 THEN 'ARREARS'
    WHEN greatest(coalesce(pt.credit, 0), 0) > 0 THEN 'CREDIT'
    ELSE 'UP_TO_DATE'
  END AS status
FROM target_member tm
LEFT JOIN all_obligation_totals aot
  ON aot.member_id = tm.id
 AND aot.group_id = tm.group_id
LEFT JOIN current_obligation_totals cot
  ON cot.member_id = tm.id
 AND cot.group_id = tm.group_id
LEFT JOIN allocation_totals at
  ON at.member_id = tm.id
 AND at.group_id = tm.group_id
LEFT JOIN payment_totals pt
  ON pt.member_id = tm.id
$function$


CREATE OR REPLACE FUNCTION public.get_my_group()
 RETURNS groups
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT g.*
  FROM public.groups g
  JOIN public.members m ON m.group_id = g.id
  WHERE (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_my_groups()
 RETURNS TABLE(group_id uuid, group_name text, role text, category text, monthly_contribution numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select g.id, g.name, m.role, g.category, g.monthly_contribution
  from public.members m
  join public.groups g on g.id = m.group_id
  where (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.created_at;
$function$


CREATE OR REPLACE FUNCTION public.get_my_member()
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.*
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_applications()
 RETURNS TABLE(application_id uuid, group_name text, category text, description text, admin_name text, admin_phone text, email text, country text, location text, town text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.group_name,
    ga.category,
    ga.description,
    ga.admin_name,
    ga.admin_phone,
    ga.email,
    ga.country,
    ga.location,
    ga.town,
    ga.status,
    ga.created_at
  FROM public.group_applications AS ga
  WHERE ga.status IN ('pending', 'under_review')
  ORDER BY
    ga.created_at ASC,
    ga.id ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_overview()
 RETURNS TABLE(groups_total bigint, groups_created_this_month bigint, members_total bigint, members_active bigint, members_with_login bigint, members_without_login bigint, onboarding_pending bigint, onboarding_invited bigint, onboarding_active bigint, onboarding_suspended bigint, applications_pending bigint, applications_under_review bigint, applications_approved bigint, applications_rejected bigint, subscriptions_active bigint, subscriptions_pending bigint, subscriptions_suspended bigint, subscriptions_cancelled bigint, subscriptions_expired bigint, invoices_paid bigint, invoices_unpaid bigint, subscription_payments_total bigint, subscription_revenue_total numeric, generated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform Admin access required';
    END IF;
    RETURN QUERY
    SELECT
        (SELECT count(*)::bigint FROM public.groups),
        (SELECT count(*)::bigint FROM public.groups WHERE created_at >= date_trunc('month', now()) AND created_at < date_trunc('month', now()) + interval '1 month'),
        (SELECT count(*)::bigint FROM public.members),
        (SELECT count(*)::bigint FROM public.members WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NOT NULL),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NULL),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'pending'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'invited'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'under_review'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'approved'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'rejected'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'cancelled'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'expired'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status = 'paid'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status IN ('draft','issued','partially_paid','overdue')),
        (SELECT count(*)::bigint FROM public.subscription_payments),
        (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.subscription_payments WHERE status = 'confirmed'),
        now();
END;
$function$


CREATE OR REPLACE FUNCTION public.guard_expense_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_table_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_table_owner FROM pg_class c WHERE c.oid = 'public.expenses'::regclass;
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS DISTINCT FROM 'pending' AND current_user <> v_table_owner THEN
      RAISE EXCEPTION 'Expenses must start pending; approval status is managed by the approval workflow';
    END IF;
  ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND current_user <> v_table_owner THEN
    RAISE EXCEPTION 'Expense approval status can only be changed through the approval workflow';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.invite_member(p_group_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text)
 RETURNS TABLE(member_id uuid, member_number text, membership_number text, invite_email text, onboarding_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_admin uuid; v_num text; v_id uuid; v_email text;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select m.id into v_admin from public.members m where m.group_id=p_group_id and (m.user_id=v_uid or m.auth_user_id=v_uid) and m.role in ('admin','chairperson') and m.status='active' and m.onboarding_status='active' limit 1;
 if v_admin is null then raise exception 'Only an active group administrator can invite members'; end if;
 if coalesce(trim(p_name),'')='' then raise exception 'Member name is required'; end if;
 if coalesce(trim(p_phone),'')='' then raise exception 'Member phone is required'; end if;
 if p_role not in ('chairperson','admin','treasurer','secretary','member') then raise exception 'Invalid member role'; end if;
 v_num:=public.generate_member_number(p_group_id);
 v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
 insert into public.members(group_id,user_id,auth_user_id,member_number,membership_number,name,phone,email,role,status,onboarding_status,join_date,invited_at)
 values(p_group_id,null,null,v_num,v_num,trim(p_name),trim(p_phone),v_email,p_role,'active','pending',current_date,now()) returning id into v_id;
 return query select v_id,v_num,v_num,v_email,'pending'::text;
end; $function$


CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and active = true
  );
$function$

CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code text, p_name text, p_phone text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, group_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  invite_row public.group_invites%rowtype;
  existing_member public.members%rowtype;
  new_member_number text;
  clean_code text := upper(trim(coalesce(p_code,'')));
  clean_name text := trim(coalesce(p_name,''));
  caller_email text;
  assigned_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if clean_code = '' then raise exception 'Invite code is required'; end if;
  if clean_name = '' then raise exception 'Your name is required'; end if;

  select * into invite_row
  from public.group_invites
  where code = clean_code and active = true
    and expires_at > now() and use_count < max_uses
  for update;

  if not found then raise exception 'Invite code is invalid, expired, or full'; end if;

  if invite_row.email is not null then
    select email into caller_email from auth.users where id = auth.uid();
    if lower(coalesce(caller_email,'')) <> lower(invite_row.email) then
      raise exception 'This invite code was issued for a different email address';
    end if;
  end if;

  assigned_role := coalesce(nullif(invite_row.role, ''), 'member');

  select * into existing_member
  from public.members
  where user_id = auth.uid() and group_id = invite_row.group_id
  limit 1;

  if found then
    if existing_member.status <> 'active' then
      update public.members set status = 'active', name = clean_name, phone = coalesce(p_phone, phone), role = assigned_role
      where id = existing_member.id;
    end if;
  else
    new_member_number := 'MBR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.members(group_id, user_id, member_number, name, phone, role, status)
    values(invite_row.group_id, auth.uid(), new_member_number, clean_name, coalesce(p_phone,''), assigned_role, 'active');
  end if;

  update public.group_invites
  set use_count = use_count + 1,
      used_at = now(),
      active = case when use_count + 1 >= max_uses then false else active end
  where id = invite_row.id;

  return query
  select g.id, g.name, assigned_role
  from public.groups g where g.id = invite_row.group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.link_my_member(p_phone text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member public.members;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  update public.members
  set user_id = (select auth.uid()),
      auth_user_id = (select auth.uid()),
      onboarding_status = 'active',
      status = 'active',
      activated_at = coalesce(activated_at, now())
  where phone = btrim(p_phone)
    and user_id is null
    and auth_user_id is null
  returning * into v_member;

  if v_member.id is null then
    select * into v_member
    from public.members
    where (user_id = (select auth.uid()) or auth_user_id = (select auth.uid()))
      and phone = btrim(p_phone)
    order by created_at
    limit 1;
  end if;

  if v_member.id is null then
    raise exception 'No member record found for that phone number. Ask your group administrator to add you first.';
  end if;

  return v_member;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_pending_group_applications()
 RETURNS SETOF group_applications
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select a.*
  from public.group_applications a
  where public.is_platform_admin()
    and lower(coalesce(a.status,'pending')) in ('pending','under_review')
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.log_deleted_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_deleted_rows(table_name, deleted_row, deleted_by)
  values (TG_TABLE_NAME, to_jsonb(OLD), auth.uid());
  return OLD;
end;
$function$


CREATE OR REPLACE FUNCTION public.machine_renew_due_subscriptions(p_batch_size integer, p_idempotency_key text)
 RETURNS TABLE(run_id uuid, processed_count integer, renewed_count integer, not_due_count integer, already_renewed_count integer, anomalous_count integer, failed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_run_id uuid;
    v_result record;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
    END IF;
    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs AS rr
    WHERE rr.idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs AS inserted_run (execution_source, idempotency_key)
        VALUES ('scheduler', p_idempotency_key)
        RETURNING inserted_run.run_id INTO v_run_id;
    ELSIF EXISTS (
        SELECT 1 FROM private.renewal_runs AS rr
        WHERE rr.run_id = v_run_id AND rr.status <> 'running'
    ) THEN
        RETURN QUERY SELECT v_run_id, 0, 0, 0, 0, 0, 0;
        RETURN;
    END IF;
    SELECT * INTO v_result
    FROM private.machine_renew_due_subscriptions(v_run_id, p_batch_size);
    UPDATE private.renewal_runs AS rr
    SET status = 'completed', completed_at = now(), error_code = NULL, error_message = NULL
    WHERE rr.run_id = v_run_id AND rr.status = 'running';
    RETURN QUERY SELECT v_result.run_id, v_result.processed_count, v_result.renewed_count,
        v_result.not_due_count, v_result.already_renewed_count, v_result.anomalous_count,
        v_result.failed_count;
EXCEPTION WHEN OTHERS THEN
    IF v_run_id IS NOT NULL THEN
        UPDATE private.renewal_runs AS rr
        SET status = 'failed', completed_at = now(), error_code = SQLSTATE, error_message = SQLERRM
        WHERE rr.run_id = v_run_id AND rr.status = 'running';
    END IF;
    RAISE;
END;
$function$


CREATE OR REPLACE FUNCTION public.my_group_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.group_id
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member(target_group uuid)
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select * from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select m.id from public.members m where (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active' order by m.created_at limit 1
$function$


CREATE OR REPLACE FUNCTION public.my_role(target_group uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.normalize_contribution_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member_id uuid;
begin
  -- contributions.recorded_by references members(id), while the frontend
  -- currently supplies auth.uid(). Convert the authenticated user to their
  -- member row automatically.
  if new.recorded_by is null then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;

  elsif new.recorded_by = auth.uid() then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;
  end if;

  return new;
end;
$function$



CREATE OR REPLACE FUNCTION public.onboard_new_group(p_group_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_email text;
  v_admin_name text;
  v_access_code text;
  v_group_id uuid;
  v_member_id uuid;
  v_member_number text;
  v_subscription_id uuid;
  v_cycle_id uuid;
  v_started_at timestamptz;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_group_name IS NULL OR btrim(p_group_name) = '' THEN RAISE EXCEPTION 'Group name is required'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.members
    WHERE auth_user_id = v_uid OR user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'User is already linked to a group';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Authenticated user email not found'; END IF;

  v_admin_name := NULLIF(btrim(p_admin_name), '');
  IF v_admin_name IS NULL THEN v_admin_name := split_part(v_email, '@', 1); END IF;

  v_started_at := now();
  v_access_code := public.generate_group_access_code(p_group_name);

  INSERT INTO public.groups (
    name, category, country, monthly_contribution,
    opening_balance, description, access_code, owner_user_id
  )
  VALUES (
    btrim(p_group_name),
    COALESCE(NULLIF(btrim(p_category), ''), 'other'),
    COALESCE(NULLIF(btrim(p_country), ''), 'Kenya'),
    COALESCE(p_monthly_contribution, 0),
    COALESCE(p_opening_balance, 0),
    p_description, v_access_code, v_uid
  )
  RETURNING id INTO v_group_id;

  SELECT COALESCE(
    max(NULLIF(regexp_replace(member_number, '[^0-9]', '', 'g'), '')::integer),
    0
  ) + 1
  INTO v_member_number
  FROM public.members
  WHERE group_id = v_group_id;

  v_member_number := lpad(v_member_number, 4, '0');

  INSERT INTO public.members (
    group_id, user_id, auth_user_id, member_number, membership_number,
    name, phone, email, role, status, onboarding_status, invited_at, activated_at
  )
  VALUES (
    v_group_id, v_uid, v_uid, v_member_number, v_member_number,
    v_admin_name, COALESCE(NULLIF(btrim(p_admin_phone), ''), ''),
    v_email, 'admin', 'active', 'active', v_started_at, v_started_at
  )
  RETURNING id INTO v_member_id;

  INSERT INTO public.contribution_types (group_id, name, code, created_by)
  SELECT v_group_id, 'Monthly', 'monthly', v_member_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_types ct
    WHERE ct.group_id = v_group_id
      AND (
        lower(trim(ct.name)) = 'monthly'
        OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  INSERT INTO public.financial_periods (group_id, month, opening_balance, status)
  VALUES (
    v_group_id, to_char(v_started_at::date, 'YYYY-MM'),
    COALESCE(p_opening_balance, 0), 'open'
  );

  v_subscription_id := private.initialize_group_subscription(v_group_id, v_started_at);
  v_cycle_id := private.create_next_subscription_cycle(v_subscription_id);
  PERFORM public.create_subscription_invoice(v_cycle_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_cycles sc
    WHERE sc.id = v_cycle_id
      AND sc.subscription_id = v_subscription_id
      AND sc.cycle_number = 1
      AND sc.status = 'invoiced'
  ) THEN
    RAISE EXCEPTION 'Subscription initialization failed to create Cycle 1';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'group_id', v_group_id, 'member_id', v_member_id,
    'member_number', v_member_number, 'access_code', v_access_code,
    'role', 'admin', 'subscription_id', v_subscription_id,
    'subscription_cycle_id', v_cycle_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_closed_month_contribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_month text;
  v_status text;
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.initiative_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group_id := COALESCE(NEW.group_id, OLD.group_id);
  v_month := COALESCE(
    NEW.month,
    to_char(NEW.contribution_date, 'YYYY-MM'),
    OLD.month,
    to_char(OLD.contribution_date, 'YYYY-MM')
  );

  SELECT status INTO v_status
  FROM public.financial_periods
  WHERE group_id = v_group_id
    AND month = v_month
  LIMIT 1;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION 'Financial month % is closed. Contributions cannot be changed.', v_month;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_closed_month_expense()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_month text;
  v_status text;
BEGIN
  v_group_id := COALESCE(NEW.group_id, OLD.group_id);
  v_month := to_char(COALESCE(NEW.date, OLD.date), 'YYYY-MM');

  SELECT status INTO v_status
  FROM public.financial_periods
  WHERE group_id = v_group_id
    AND month = v_month
  LIMIT 1;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION 'Financial month % is closed. Expenses cannot be changed.', v_month;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.reconcile_member_historical_payments(p_member_id uuid, p_through_date date DEFAULT NULL::date)
 RETURNS TABLE(member_id uuid, group_id uuid, payments_considered integer, payments_with_residual integer, allocations_created integer, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text, reconciled_through date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_group_id uuid;
  v_cutoff date := COALESCE(p_through_date, CURRENT_DATE);
  v_monthly_type_id uuid;
  v_join_date date;
  v_lock_start date;
  v_lock_end date;
  v_payments_considered integer := 0;
  v_payments_with_residual integer := 0;
  v_allocations_created integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_arrears numeric := 0;
  v_credit numeric := 0;
  v_status text;
  v_reconciled_through date;
  v_payment record;
  v_obligation record;
  v_period record;
  v_period_status text;
  v_remaining numeric;
  v_available numeric;
  v_alloc_amount numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Member is required';
  END IF;

  SELECT m.group_id, m.join_date
  INTO STRICT v_group_id, v_join_date
  FROM public.members AS m
  WHERE m.id = p_member_id
  FOR SHARE;

  IF NOT public.can_manage_members(v_group_id) THEN
    RAISE EXCEPTION 'Not authorized to reconcile this member';
  END IF;

  v_lock_start := date_trunc('month', COALESCE(v_join_date, v_cutoff))::date;
  v_lock_end := date_trunc('month', v_cutoff)::date;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  SELECT ct.id
  INTO STRICT v_monthly_type_id
  FROM public.contribution_types AS ct
  WHERE ct.group_id = v_group_id
    AND ct.code = 'monthly';

  SELECT COALESCE(MAX(o.obligation_month), v_join_date)
  INTO v_reconciled_through
  FROM public.contribution_obligations AS o
  WHERE o.group_id = v_group_id
    AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id
    AND o.obligation_month <= v_cutoff;

  FOR v_period IN
    SELECT DISTINCT o.obligation_month
    FROM public.contribution_obligations AS o
    WHERE o.group_id = v_group_id
      AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
      AND o.obligation_month <= v_cutoff
      AND o.obligation_month >= date_trunc('month', v_join_date)::date
    ORDER BY o.obligation_month
  LOOP
    SELECT fp.status
    INTO v_period_status
    FROM public.financial_periods AS fp
    WHERE fp.group_id = v_group_id
      AND fp.month = to_char(v_period.obligation_month, 'YYYY-MM')
    FOR UPDATE;

    IF lower(COALESCE(v_period_status, 'open')) = 'closed'
       AND EXISTS (
         SELECT 1
         FROM public.contribution_obligations AS o
         WHERE o.group_id = v_group_id
           AND o.member_id = p_member_id
           AND o.contribution_type_id = v_monthly_type_id
           AND o.obligation_month = v_period.obligation_month
           AND o.due_amount > (
             SELECT COALESCE(SUM(a.amount), 0)
             FROM public.contribution_allocations AS a
             WHERE a.obligation_id = o.id
           )
       )
    THEN
      RAISE EXCEPTION
        'Financial month % is closed and has outstanding obligation for this member',
        to_char(v_period.obligation_month, 'YYYY-MM');
    END IF;
  END LOOP;

  FOR v_payment IN
    SELECT c.id, c.amount
    FROM public.contributions AS c
    WHERE c.group_id = v_group_id
      AND c.member_id = p_member_id
      AND c.contribution_type = 'monthly'
      AND c.contribution_date <= v_cutoff
      AND c.amount > 0
    ORDER BY c.contribution_date, c.id
    FOR UPDATE
  LOOP
    v_payments_considered := v_payments_considered + 1;

    SELECT c.amount - COALESCE(SUM(a.amount), 0)
    INTO v_remaining
    FROM public.contributions AS c
    LEFT JOIN public.contribution_allocations AS a
      ON a.payment_id = c.id
    WHERE c.id = v_payment.id
    GROUP BY c.id, c.amount;

    IF v_remaining > 0 THEN
      v_payments_with_residual := v_payments_with_residual + 1;
    ELSE
      CONTINUE;
    END IF;

    FOR v_obligation IN
      SELECT
        o.id,
        o.obligation_month,
        o.due_amount,
        o.due_amount - COALESCE((
          SELECT SUM(a.amount)
          FROM public.contribution_allocations AS a
          WHERE a.obligation_id = o.id
        ), 0) AS outstanding
      FROM public.contribution_obligations AS o
      WHERE o.group_id = v_group_id
        AND o.member_id = p_member_id
        AND o.contribution_type_id = v_monthly_type_id
        AND o.obligation_month <= v_cutoff
        AND o.obligation_month >= date_trunc('month', v_join_date)::date
        AND o.due_amount > COALESCE((
          SELECT SUM(a.amount)
          FROM public.contribution_allocations AS a
          WHERE a.obligation_id = o.id
        ), 0)
      ORDER BY o.obligation_month, o.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_available := GREATEST(v_obligation.outstanding, 0);
      v_alloc_amount := LEAST(v_remaining, v_available);

      IF v_alloc_amount <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.contribution_allocations (
        payment_id,
        obligation_id,
        amount
      )
      VALUES (
        v_payment.id,
        v_obligation.id,
        v_alloc_amount
      )
      ON CONFLICT (payment_id, obligation_id) DO NOTHING;

      IF FOUND THEN
        v_allocations_created := v_allocations_created + 1;
        v_remaining := v_remaining - v_alloc_amount;
      END IF;
    END LOOP;
  END LOOP;

  SELECT
    COALESCE(SUM(o.due_amount), 0),
    COALESCE(SUM(oa.allocated_amount), 0)
  INTO v_total_due, v_total_allocated
  FROM public.contribution_obligations AS o
  LEFT JOIN (
    SELECT a.obligation_id, SUM(a.amount) AS allocated_amount
    FROM public.contribution_allocations AS a
    GROUP BY a.obligation_id
  ) AS oa ON oa.obligation_id = o.id
  WHERE o.group_id = v_group_id
    AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id
    AND o.obligation_month <= v_cutoff;

  v_arrears := GREATEST(v_total_due - v_total_allocated, 0);

  SELECT COALESCE(SUM(
    GREATEST(c.amount - COALESCE(a.allocated_amount, 0), 0)
  ), 0)
  INTO v_credit
  FROM public.contributions AS c
  LEFT JOIN (
    SELECT a.payment_id, SUM(a.amount) AS allocated_amount
    FROM public.contribution_allocations AS a
    GROUP BY a.payment_id
  ) AS a ON a.payment_id = c.id
  WHERE c.group_id = v_group_id
    AND c.member_id = p_member_id
    AND c.contribution_type = 'monthly'
    AND c.contribution_date <= v_cutoff
    AND c.amount > 0;

  IF v_arrears > 0 THEN
    v_status := 'ARREARS';
  ELSIF v_credit > 0 THEN
    v_status := 'CREDIT';
  ELSE
    v_status := 'UP_TO_DATE';
  END IF;

  RETURN QUERY
  SELECT
    p_member_id,
    v_group_id,
    v_payments_considered,
    v_payments_with_residual,
    v_allocations_created,
    round(v_total_due, 2),
    round(v_total_allocated, 2),
    round(v_arrears, 2),
    round(v_credit, 2),
    v_status,
    v_reconciled_through;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_charge_payment(p_charge_id uuid, p_payment_id uuid, p_amount numeric)
 RETURNS charge_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_charge public.financial_charges%rowtype;
    v_obligation public.contribution_obligations%rowtype;
    v_payment public.contributions%rowtype;
    v_period public.financial_periods%rowtype;
    v_applied numeric(14,2);
    v_remaining numeric(14,2);
    v_result public.charge_payments%rowtype;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_charge_id IS NULL OR p_payment_id IS NULL THEN
        RAISE EXCEPTION 'Charge and payment are required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Charge allocation amount must be greater than zero';
    END IF;

    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Charge allocation amount must have no more than two decimal places';
    END IF;

    -- Authoritative lock order for this path:
    -- Canonical global lock order for this path:
    --   authoritative accounting key read (no row lock)
    --   -> accounting advisory lock
    --   -> obligation FOR UPDATE
    --   -> period lock
    --   -> charge FOR UPDATE
    --   -> payment FOR SHARE.
    -- The canonical contribution writer and refresh path acquire accounting
    -- locks before obligation work. This path therefore MUST acquire the
    -- accounting lock before locking the obligation row. After the accounting
    -- lock is held, the obligation is locked and re-read; any change to the
    -- group/month used for the lock key causes the transaction to abort rather
    -- than operating under a stale serialization key.
    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.id = p_charge_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial charge % does not exist', p_charge_id;
    END IF;

    -- Derive the serialization key from the persisted charge identity,
    -- without locking the obligation first. This is a key read only.
    PERFORM public.cl_2b_accounting_lock(
        v_charge.group_id,
        v_charge.accounting_month
    );

    -- Now acquire the authoritative obligation row lock under the canonical
    -- accounting lock. Re-read the row and reject any stale key rather than
    -- silently serializing the operation against the wrong accounting month.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = v_charge.obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial charge % references a missing obligation', p_charge_id;
    END IF;

    IF v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.accounting_month IS DISTINCT FROM
          pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM')
    THEN
        RAISE EXCEPTION 'Financial charge % is inconsistent with its obligation', p_charge_id;
    END IF;

    IF NOT public.cl_user_has_role(
        v_obligation.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Finance authorization required';
    END IF;

    v_period := public.ensure_financial_period(
        v_obligation.group_id,
        v_charge.accounting_month
    );

    IF lower(coalesce(v_period.status, 'open')) = 'closed' THEN
        RAISE EXCEPTION 'Financial period % is closed',
            pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');
    END IF;

    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.id = p_charge_id
    FOR UPDATE;

    IF v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.obligation_id IS DISTINCT FROM v_obligation.id
       OR v_charge.accounting_month IS DISTINCT FROM
          pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM')
    THEN
        RAISE EXCEPTION 'Financial charge % changed inconsistently with its obligation', p_charge_id;
    END IF;

    IF v_charge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Financial charge % is cancelled', p_charge_id;
    END IF;

    SELECT c.*
      INTO v_payment
    FROM public.contributions c
    WHERE c.id = p_payment_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
    END IF;

    IF v_payment.group_id <> v_charge.group_id
       OR v_payment.member_id <> v_charge.member_id
    THEN
        RAISE EXCEPTION 'Payment % does not belong to charge group/member', p_payment_id;
    END IF;

    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = p_charge_id
      AND cp.status = 'applied';

    v_remaining := v_charge.amount - v_applied;

    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'Financial charge % has no remaining balance', p_charge_id;
    END IF;

    IF p_amount > v_remaining THEN
        RAISE EXCEPTION 'Allocation %.2f exceeds remaining charge balance %.2f',
            p_amount, v_remaining;
    END IF;

    INSERT INTO public.charge_payments (
        charge_id, payment_id, amount_applied
    )
    VALUES (
        v_charge.id, p_payment_id, p_amount
    )
    RETURNING * INTO v_result;

    UPDATE public.financial_charges
       SET status = CASE
           WHEN v_applied + p_amount = amount THEN 'paid'
           ELSE 'open'
       END
     WHERE id = v_charge.id;

    RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_contribution_initiative_payment(p_initiative_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_i public.contribution_initiatives; v_o public.contribution_initiative_obligations; v_existing jsonb; v_payment uuid; v_allocated numeric; v_claimed boolean; v_member_group uuid; v_member_user uuid; v_member_auth uuid; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF; SELECT m.group_id,m.user_id,m.auth_user_id INTO v_member_group,v_member_user,v_member_auth FROM public.members m WHERE m.id=p_member_id AND lower(coalesce(m.status,'active'))='active'; IF v_member_group IS NULL THEN RAISE EXCEPTION 'Member not found or inactive'; END IF; IF NOT (public.can_manage_members(v_member_group) OR v_member_user=auth.uid() OR v_member_auth=auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF; INSERT INTO private.contribution_initiative_requests(request_id,operation,result) VALUES(p_request_id,'record_initiative_payment','{}'::jsonb) ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed; IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='record_initiative_payment'; RETURN v_existing; END IF; SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE; IF NOT FOUND OR v_i.group_id IS DISTINCT FROM v_member_group THEN RAISE EXCEPTION 'Initiative not found'; END IF; IF v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative is not active'; END IF; IF p_contribution_date < v_i.start_date OR p_contribution_date > v_i.closing_date THEN RAISE EXCEPTION 'Payment date outside initiative window'; END IF; IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF; SELECT o.* INTO v_o FROM public.contribution_initiative_obligations o WHERE o.initiative_id=p_initiative_id AND o.member_id=p_member_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Member has no initiative obligation'; END IF; SELECT coalesce(sum(a.amount),0) INTO v_allocated FROM public.contribution_initiative_allocations a WHERE a.initiative_obligation_id=v_o.id; IF p_amount > v_o.amount_due-v_allocated THEN RAISE EXCEPTION 'Payment exceeds outstanding initiative obligation'; END IF; INSERT INTO public.contributions(group_id,member_id,amount,contribution_type,month,payment_method,reference,recorded_by,contribution_date,notes,mpesa_reference,initiative_id) VALUES(v_i.group_id,p_member_id,p_amount,'initiative',to_char(p_contribution_date,'YYYY-MM'),p_payment_method,p_reference,auth.uid(),p_contribution_date,p_notes,p_mpesa_reference,p_initiative_id) RETURNING id INTO v_payment; INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount) VALUES(v_payment,v_o.id,p_amount); v_existing=jsonb_build_object('status','recorded','payment_id',v_payment,'initiative_id',v_i.id,'obligation_id',v_o.id,'amount',p_amount); UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='record_initiative_payment'; RETURN v_existing; END; $function$


CREATE OR REPLACE FUNCTION public.record_custom_contribution_payment(p_group_id uuid, p_member_id uuid, p_contribution_type_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_type_name text;
  v_start date;
  v_end date;
  v_obligation record;
  v_remaining numeric := p_amount;
  v_allocated numeric := 0;
  v_due numeric;
  v_paid numeric;
  v_apply numeric;
  v_payload jsonb;
  v_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_payment_id uuid := p_request_id;
begin
  if v_auth_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if p_group_id is null or p_member_id is null
     or p_contribution_type_id is null or p_request_id is null then
    raise exception 'REQUIRED_PAYMENT_FIELDS_MISSING' using errcode='22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'PAYMENT_AMOUNT_MUST_BE_POSITIVE' using errcode='22023';
  end if;

  if p_contribution_date is null then
    raise exception 'CONTRIBUTION_DATE_REQUIRED' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = v_auth_user_id
  ) and not public.cl_user_has_role(
    p_group_id, array['chairperson','treasurer','secretary']::text[]
  ) then
    raise exception 'CUSTOM_PAYMENT_NOT_AUTHORIZED' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_auth_user_id or m.auth_user_id = v_auth_user_id)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id
  limit 1;

  if v_actor_member_id is null then
    raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id
      and m.group_id = p_group_id
      and lower(coalesce(m.status,'active')) = 'active'
  ) then
    raise exception 'MEMBER_NOT_IN_GROUP' using errcode='22023';
  end if;

  select ct.name into v_type_name
  from public.contribution_types ct
  where ct.id = p_contribution_type_id
    and ct.group_id = p_group_id;

  if v_type_name is null then
    raise exception 'CONTRIBUTION_TYPE_NOT_FOUND' using errcode='22023';
  end if;

  v_payload := jsonb_build_object(
    'group_id',p_group_id,'member_id',p_member_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'contribution_date',p_contribution_date,
    'payment_method',coalesce(p_payment_method,''),
    'reference',coalesce(p_reference,''),
    'notes',coalesce(p_notes,'')
  );
  v_hash := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('chama-live:custom-payment:'||p_request_id::text,0)
  );

  select payload_hash,result
  into v_existing_hash,v_existing_result
  from private.custom_contribution_payment_requests
  where request_id = p_request_id and operation = 'record'
  for update;

  if v_existing_hash is not null then
    if v_existing_hash <> v_hash then
      raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023';
    end if;
    if v_existing_result is null then
      raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000';
    end if;
    return jsonb_set(
      v_existing_result,'{replayed}','true'::jsonb,true
    );
  end if;

  select min(cp.opening_date), max(cp.closing_date)
  into v_start,v_end
  from public.contribution_periods cp
  where cp.group_id = p_group_id
    and cp.contribution_type_id = p_contribution_type_id
    and cp.status in ('open','due','grace')
    and cp.opening_date <= p_contribution_date
    and p_contribution_date <= cp.closing_date;

  if v_start is null then
    raise exception 'NO_ELIGIBLE_CUSTOM_CONTRIBUTION_PERIOD' using errcode='22023';
  end if;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,
    date_trunc('month',v_start)::date,
    date_trunc('month',greatest(v_end,p_contribution_date))::date
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:'||p_group_id::text||':'||p_member_id::text,0
    )
  );

  insert into private.custom_contribution_payment_requests(
    request_id,operation,group_id,member_id,contribution_type_id,payload_hash
  )
  values(
    p_request_id,'record',p_group_id,p_member_id,p_contribution_type_id,v_hash
  );

  insert into public.contributions(
    id,group_id,member_id,amount,contribution_type,month,
    payment_method,reference,recorded_by,goal_id,contribution_date,
    notes,mpesa_reference
  )
  values(
    v_payment_id,p_group_id,p_member_id,p_amount,v_type_name,
    to_char(p_contribution_date,'YYYY-MM'),coalesce(p_payment_method,'Cash'),
    nullif(trim(p_reference),''),v_actor_member_id,null,p_contribution_date,
    nullif(trim(p_notes),''), 
    case when lower(coalesce(p_payment_method,''))='m-pesa'
      then nullif(trim(p_reference),'') else null end
  );

  for v_obligation in
    select o.id,o.due_amount,o.obligation_month
    from public.contribution_obligations o
    join public.contribution_periods cp on cp.id=o.period_id
    where o.group_id=p_group_id
      and o.member_id=p_member_id
      and o.contribution_type_id=p_contribution_type_id
      and o.component_kind='PARENT'
      and o.lifecycle_state='ACTIVE'
      and cp.status in ('open','due','grace')
      and cp.opening_date <= p_contribution_date
      and p_contribution_date <= cp.closing_date
    order by o.obligation_month asc,o.id asc
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(a.amount),0)
    into v_paid
    from public.contribution_allocations a
    where a.obligation_id=v_obligation.id;

    v_due := greatest(v_obligation.due_amount-v_paid,0);
    if v_due <= 0 then
      continue;
    end if;

    v_apply := least(v_remaining,v_due);

    insert into public.contribution_allocations(
      payment_id,obligation_id,amount
    ) values(v_payment_id,v_obligation.id,v_apply);

    v_remaining := v_remaining-v_apply;
    v_allocated := v_allocated+v_apply;
  end loop;

  if v_allocated > p_amount then
    raise exception 'PAYMENT_OVER_ALLOCATION_DETECTED';
  end if;

  v_existing_result := jsonb_build_object(
    'ok',true,'replayed',false,'payment_id',v_payment_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'allocated_amount',v_allocated,
    'unapplied_amount',greatest(v_remaining,0)
  );

  update private.custom_contribution_payment_requests
  set result=v_existing_result,completed_at=now()
  where request_id=p_request_id and operation='record';

  return v_existing_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_existing_member_historical_payments(p_request_id uuid, p_member_id uuid, p_monthly_amount numeric, p_effective_from date, p_effective_to date, p_first_period_rule text, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid;
  v_creator_member_id uuid;
  v_member public.members%ROWTYPE;
  v_group_id uuid;
  v_payload_hash text;
  v_existing_payload_hash text;
  v_existing_result jsonb;
  v_canonical_payments jsonb;
  v_monthly_type_id uuid;
  v_existing_rule public.member_contribution_rules%ROWTYPE;
  v_first_payment_month date;
  v_last_payment_month date;
  v_obligation_start_month date;
  v_accounting_end_month date;
  v_payment_date date;
  v_payment_month date;
  v_closed_month text;
  v_item jsonb;
  v_payment_id uuid;
  v_amount numeric;
  v_payment_method text;
  v_reference text;
  v_mpesa_reference text;
  v_notes text;
  v_record_result jsonb;
  v_idempotent_replay boolean;
  v_payment_count integer := 0;
  v_recorded_count integer := 0;
  v_replayed_count integer := 0;
  v_obligations_count integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_credit numeric := 0;
  v_arrears numeric := 0;
  v_position_status text;
  v_result jsonb;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
  IF p_member_id IS NULL THEN RAISE EXCEPTION 'MEMBER_ID_REQUIRED'; END IF;
  IF p_monthly_amount IS NULL OR p_monthly_amount <= 0 THEN RAISE EXCEPTION 'MONTHLY_AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'EFFECTIVE_FROM_REQUIRED'; END IF;
  IF date_trunc('month', p_effective_from)::date <> p_effective_from THEN RAISE EXCEPTION 'EFFECTIVE_FROM_MUST_BE_FIRST_OF_MONTH'; END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN RAISE EXCEPTION 'EFFECTIVE_TO_CANNOT_PRECEDE_EFFECTIVE_FROM'; END IF;
  IF p_first_period_rule IS NULL OR p_first_period_rule NOT IN ('full_period','next_full_period') THEN RAISE EXCEPTION 'INVALID_FIRST_PERIOD_RULE'; END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN RAISE EXCEPTION 'HISTORICAL_PAYMENTS_ARRAY_REQUIRED'; END IF;

  SELECT m.* INTO v_member FROM public.members m WHERE m.id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  v_group_id := v_member.group_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'MEMBER_GROUP_REQUIRED'; END IF;

  SELECT m.id INTO v_creator_member_id
  FROM public.members m
  WHERE m.group_id = v_group_id
    AND (m.user_id = v_auth_uid OR m.auth_user_id = v_auth_uid)
    AND lower(coalesce(m.status,'')) = 'active'
    AND lower(coalesce(m.onboarding_status,'')) = 'active'
  ORDER BY m.id LIMIT 1;
  IF v_creator_member_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_GROUP_MEMBERSHIP_REQUIRED'; END IF;
  IF NOT public.can_manage_members(v_group_id) THEN RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_count := v_payment_count + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_MUST_BE_OBJECT',v_payment_count; END IF;
    IF NULLIF(trim(v_item->>'payment_id'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_PAYMENT_ID_REQUIRED',v_payment_count; END IF;
    BEGIN v_payment_id := (v_item->>'payment_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_PAYMENT_ID_INVALID',v_payment_count; END;
    IF NULLIF(trim(v_item->>'payment_date'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_DATE_REQUIRED',v_payment_count; END IF;
    BEGIN v_payment_date := (v_item->>'payment_date')::date; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_DATE_INVALID',v_payment_count; END;
    IF NULLIF(trim(v_item->>'amount'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_REQUIRED',v_payment_count; END IF;
    BEGIN v_amount := (v_item->>'amount')::numeric; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_INVALID',v_payment_count; END;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_MUST_BE_POSITIVE',v_payment_count; END IF;
    v_payment_method := trim(coalesce(v_item->>'payment_method',''));
    IF v_payment_method NOT IN ('M-Pesa','Cash','Bank transfer') THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_INVALID_PAYMENT_METHOD',v_payment_count; END IF;
    v_reference := NULLIF(trim(v_item->>'reference'),'');
    v_mpesa_reference := NULLIF(trim(v_item->>'mpesa_reference'),'');
    v_notes := NULLIF(trim(v_item->>'notes'),'');
    IF v_payment_method <> 'M-Pesa' AND v_mpesa_reference IS NOT NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_MPESA_REFERENCE_REQUIRES_MPESA',v_payment_count; END IF;
    v_payment_month := date_trunc('month',v_payment_date)::date;
    IF v_payment_month < p_effective_from THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_BEFORE_RULE_EFFECTIVE_FROM',v_payment_count; END IF;
    IF p_effective_to IS NOT NULL AND v_payment_month > p_effective_to THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AFTER_RULE_EFFECTIVE_TO',v_payment_count; END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM (SELECT (value->>'payment_id')::uuid payment_id FROM jsonb_array_elements(p_payments)) q
    GROUP BY payment_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'DUPLICATE_PAYMENT_ID_IN_REQUEST'; END IF;

  SELECT min(date_trunc('month',(value->>'payment_date')::date)::date),
         max(date_trunc('month',(value->>'payment_date')::date)::date)
  INTO v_first_payment_month,v_last_payment_month
  FROM jsonb_array_elements(p_payments);

  IF p_first_period_rule = 'next_full_period' THEN
    v_obligation_start_month := (date_trunc('month',p_effective_from)+interval '1 month')::date;
  ELSE
    v_obligation_start_month := date_trunc('month',p_effective_from)::date;
  END IF;
  IF v_first_payment_month < v_obligation_start_month THEN RAISE EXCEPTION 'PAYMENT_PRECEDES_FIRST_ELIGIBLE_OBLIGATION_MONTH'; END IF;
  v_accounting_end_month := v_last_payment_month;

  SELECT jsonb_agg(value ORDER BY (value->>'payment_id')::uuid) INTO v_canonical_payments
  FROM jsonb_array_elements(p_payments);
  v_payload_hash := pg_catalog.md5(jsonb_build_object(
    'member_id',p_member_id,'monthly_amount',p_monthly_amount,'effective_from',p_effective_from,
    'effective_to',p_effective_to,'first_period_rule',p_first_period_rule,'payments',v_canonical_payments)::text);

  INSERT INTO private.member_historical_payment_requests(request_id,member_id,group_id,payload_hash)
  VALUES(p_request_id,p_member_id,v_group_id,v_payload_hash)
  ON CONFLICT(request_id) DO NOTHING;

  SELECT r.payload_hash,r.result INTO v_existing_payload_hash,v_existing_result
  FROM private.member_historical_payment_requests r
  WHERE r.request_id=p_request_id FOR UPDATE;
  IF v_existing_payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF v_existing_result IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'result',v_existing_result);
  END IF;

  SELECT m.* INTO v_member FROM public.members m WHERE m.id=p_member_id AND m.group_id=v_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NO_LONGER_EXISTS_IN_GROUP'; END IF;
  IF lower(coalesce(v_member.status,'')) <> 'active' THEN RAISE EXCEPTION 'TARGET_MEMBER_NOT_ACTIVE'; END IF;
  IF lower(coalesce(v_member.onboarding_status,'')) <> 'active' THEN RAISE EXCEPTION 'TARGET_MEMBER_ONBOARDING_NOT_ACTIVE'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chama-live:member:'||v_group_id::text||':'||p_member_id::text,0));
  PERFORM public.cl_2b_accounting_lock_range(v_group_id,v_obligation_start_month,v_accounting_end_month);

  SELECT fp.month INTO v_closed_month
  FROM public.financial_periods fp
  WHERE fp.group_id=v_group_id
    AND fp.month >= to_char(v_obligation_start_month,'YYYY-MM')
    AND fp.month <= to_char(v_accounting_end_month,'YYYY-MM')
    AND lower(coalesce(fp.status,'open'))='closed'
  ORDER BY fp.month LIMIT 1;
  IF v_closed_month IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_MONTH_CLOSED:%',v_closed_month; END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id=v_group_id AND (ct.code='monthly' OR lower(trim(ct.name))='monthly')
  ORDER BY CASE WHEN ct.code='monthly' THEN 0 ELSE 1 END,ct.created_at,ct.id LIMIT 1;
  IF v_monthly_type_id IS NULL THEN RAISE EXCEPTION 'MONTHLY_CONTRIBUTION_TYPE_NOT_FOUND'; END IF;

  SELECT r.* INTO v_existing_rule
  FROM public.member_contribution_rules r
  WHERE r.group_id=v_group_id AND r.member_id=p_member_id AND r.contribution_type_id=v_monthly_type_id
    AND r.frequency='monthly' AND r.status='active'
    AND r.effective_from <= v_obligation_start_month
    AND (r.effective_to IS NULL OR r.effective_to >= v_accounting_end_month)
  ORDER BY r.effective_from DESC,r.created_at DESC LIMIT 1;

  IF v_existing_rule.id IS NOT NULL THEN
    IF v_existing_rule.amount <> p_monthly_amount THEN
      RAISE EXCEPTION 'MONTHLY_RULE_AMOUNT_CONFLICT:existing=%,requested=%',v_existing_rule.amount,p_monthly_amount;
    END IF;
    IF v_existing_rule.first_period_rule <> p_first_period_rule THEN RAISE EXCEPTION 'MONTHLY_RULE_FIRST_PERIOD_CONFLICT'; END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.member_contribution_rules r
      WHERE r.group_id=v_group_id AND r.member_id=p_member_id AND r.contribution_type_id=v_monthly_type_id
        AND daterange(r.effective_from,coalesce(r.effective_to+1,'infinity'::date),'[)')
            && daterange(p_effective_from,coalesce(p_effective_to+1,'infinity'::date),'[)')
    ) THEN RAISE EXCEPTION 'MONTHLY_RULE_OVERLAP_REQUIRES_EXPLICIT_RECONCILIATION'; END IF;

    INSERT INTO public.member_contribution_rules(
      group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,
      first_period_rule,status,created_by
    ) VALUES(
      v_group_id,p_member_id,v_monthly_type_id,p_monthly_amount,'monthly',p_effective_from,p_effective_to,
      p_first_period_rule,'active',v_creator_member_id
    );
  END IF;

  PERFORM public.cl_2b_refresh_member(p_member_id,v_accounting_end_month);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_month := date_trunc('month',(v_item->>'payment_date')::date)::date;
    IF NOT EXISTS (
      SELECT 1 FROM public.contribution_obligations o
      WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id
        AND o.obligation_month=v_payment_month
    ) THEN RAISE EXCEPTION 'MONTHLY_OBLIGATION_NOT_FOUND:%',to_char(v_payment_month,'YYYY-MM'); END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_id := (v_item->>'payment_id')::uuid;
    v_payment_date := (v_item->>'payment_date')::date;
    v_amount := (v_item->>'amount')::numeric;
    v_payment_method := trim(v_item->>'payment_method');
    v_reference := NULLIF(trim(v_item->>'reference'),'');
    v_mpesa_reference := NULLIF(trim(v_item->>'mpesa_reference'),'');
    v_notes := NULLIF(trim(v_item->>'notes'),'');

    v_record_result := public.cl_2b_record_contribution(
      p_payment_id=>v_payment_id,p_group_id=>v_group_id,p_member_id=>p_member_id,p_amount=>v_amount,
      p_contribution_date=>v_payment_date,p_contribution_type=>'monthly',p_payment_method=>v_payment_method,
      p_reference=>v_reference,p_mpesa_reference=>v_mpesa_reference,p_goal_id=>NULL,p_notes=>v_notes
    );
    IF coalesce((v_record_result->>'success')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'CANONICAL_PAYMENT_RECORDING_FAILED:%',v_payment_id;
    END IF;
    v_idempotent_replay := coalesce((v_record_result->>'idempotent_replay')::boolean,false);
    IF v_idempotent_replay THEN v_replayed_count:=v_replayed_count+1; ELSE v_recorded_count:=v_recorded_count+1; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.contributions c
      WHERE c.id=v_payment_id AND c.group_id=v_group_id AND c.member_id=p_member_id
        AND c.amount=v_amount AND c.contribution_date=v_payment_date
        AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
    ) THEN RAISE EXCEPTION 'CANONICAL_PAYMENT_VERIFICATION_FAILED:%',v_payment_id; END IF;
  END LOOP;

  PERFORM public.cl_2b_refresh_member(p_member_id,v_accounting_end_month);

  IF EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id=a.payment_id
    JOIN public.contribution_obligations o ON o.id=a.obligation_id
    WHERE p.member_id=p_member_id
      AND (p.group_id<>v_group_id OR o.group_id<>v_group_id OR o.member_id<>p_member_id)
  ) THEN RAISE EXCEPTION 'CROSS_MEMBER_OR_GROUP_ALLOCATION_DETECTED'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.payment_id,sum(a.amount) allocated
      FROM public.contribution_allocations a JOIN public.contributions p ON p.id=a.payment_id
      WHERE p.member_id=p_member_id AND p.group_id=v_group_id GROUP BY a.payment_id
    ) x JOIN public.contributions p ON p.id=x.payment_id WHERE x.allocated>p.amount
  ) THEN RAISE EXCEPTION 'PAYMENT_OVER_ALLOCATION_DETECTED'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.obligation_id,sum(a.amount) allocated
      FROM public.contribution_allocations a JOIN public.contribution_obligations o ON o.id=a.obligation_id
      WHERE o.member_id=p_member_id AND o.group_id=v_group_id AND o.contribution_type_id=v_monthly_type_id
      GROUP BY a.obligation_id
    ) x JOIN public.contribution_obligations o ON o.id=x.obligation_id WHERE x.allocated>o.due_amount
  ) THEN RAISE EXCEPTION 'OBLIGATION_OVER_ALLOCATION_DETECTED'; END IF;

  SELECT count(*)::integer,coalesce(sum(o.due_amount),0)::numeric
  INTO v_obligations_count,v_total_due
  FROM public.contribution_obligations o
  WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id;

  SELECT coalesce(sum(a.amount),0)::numeric INTO v_total_allocated
  FROM public.contribution_allocations a JOIN public.contribution_obligations o ON o.id=a.obligation_id
  WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id;

  SELECT greatest(
    coalesce(sum(c.amount),0)-coalesce((
      SELECT sum(a.amount) FROM public.contribution_allocations a
      JOIN public.contributions c2 ON c2.id=a.payment_id
      WHERE c2.group_id=v_group_id AND c2.member_id=p_member_id
        AND lower(trim(coalesce(c2.contribution_type,'')))='monthly'
    ),0),0
  )::numeric
  INTO v_credit
  FROM public.contributions c
  WHERE c.group_id=v_group_id AND c.member_id=p_member_id
    AND lower(trim(coalesce(c.contribution_type,'')))='monthly';

  v_arrears:=greatest(v_total_due-v_total_allocated,0);
  v_position_status:=CASE WHEN v_arrears>0 THEN 'ARREARS' WHEN v_credit>0 THEN 'CREDIT' ELSE 'UP_TO_DATE' END;

  v_result:=jsonb_build_object(
    'success',true,'idempotent_replay',false,'request_id',p_request_id,'member_id',p_member_id,
    'group_id',v_group_id,'monthly_contribution_type_id',v_monthly_type_id,'monthly_amount',p_monthly_amount,
    'effective_from',p_effective_from,'effective_to',p_effective_to,'first_period_rule',p_first_period_rule,
    'historical_first_month',v_first_payment_month,'historical_last_month',v_last_payment_month,
    'obligation_start_month',v_obligation_start_month,'payments_requested',v_payment_count,
    'payments_recorded',v_recorded_count,'payments_replayed',v_replayed_count,'obligations_count',v_obligations_count,
    'total_due',v_total_due,'total_allocated',v_total_allocated,'arrears',v_arrears,'credit',v_credit,
    'position_status',v_position_status,'accounting_engine','cl_2b_record_contribution + cl_2b_refresh_member'
  );

  UPDATE private.member_historical_payment_requests
  SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_my_initiative_payment(p_initiative_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_member uuid; v_group uuid; v_i public.contribution_initiatives;
BEGIN
  SELECT m.id,m.group_id INTO v_member,v_group
  FROM public.members m
  WHERE auth.uid() IS NOT NULL AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
  ORDER BY m.created_at,m.id LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Authenticated member not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR v_i.group_id IS DISTINCT FROM v_group THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  RETURN public.record_contribution_initiative_payment(
    p_initiative_id,v_member,p_amount,p_contribution_date,p_payment_method,p_reference,
    p_mpesa_reference,p_notes,p_request_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.record_other_contribution_payment(p_cycle_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_payment_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_cycle public.contribution_periods%ROWTYPE;
    v_type public.contribution_types%ROWTYPE;
    v_member public.members%ROWTYPE;
    v_existing_request private.other_contribution_payment_requests%ROWTYPE;
    v_payload jsonb;
    v_payload_hash text;
    v_payment_month date;
    v_month text;
    v_financial_period public.financial_periods%ROWTYPE;
    v_lock_start date;
    v_lock_end date;
    v_initial_lock_start date;
    v_initial_lock_end date;
    v_recheck_start date;
    v_recheck_end date;
    v_payment public.contributions%ROWTYPE;
    v_obligation public.contribution_obligations%ROWTYPE;
    v_outstanding numeric;
    v_remaining numeric;
    v_allocate numeric;
    v_allocated numeric := 0;
    v_allocation_count integer := 0;
    v_result jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    IF p_cycle_id IS NULL OR p_member_id IS NULL OR p_payment_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Cycle, member, payment id and request id are required'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
    IF p_contribution_date IS NULL THEN RAISE EXCEPTION 'Contribution date is required'; END IF;
    IF p_payment_method IS NULL OR p_payment_method NOT IN ('M-Pesa','Cash','Bank transfer') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

    IF p_payment_method = 'M-Pesa' THEN
        IF p_reference IS NULL OR btrim(p_reference) = '' THEN RAISE EXCEPTION 'M-Pesa payment requires a payment reference'; END IF;
        IF p_mpesa_reference IS NULL OR btrim(p_mpesa_reference) = '' THEN RAISE EXCEPTION 'M-Pesa payment requires an M-Pesa reference'; END IF;
        p_reference := btrim(p_reference);
        p_mpesa_reference := btrim(p_mpesa_reference);
        IF lower(p_reference) IS DISTINCT FROM lower(p_mpesa_reference) THEN RAISE EXCEPTION 'M-Pesa reference and payment reference must match'; END IF;
    ELSE
        IF p_reference IS NOT NULL THEN p_reference := btrim(p_reference); IF p_reference = '' THEN p_reference := NULL; END IF; END IF;
        IF p_mpesa_reference IS NOT NULL THEN p_mpesa_reference := btrim(p_mpesa_reference); IF p_mpesa_reference = '' THEN p_mpesa_reference := NULL; END IF; END IF;
        IF p_mpesa_reference IS NOT NULL THEN RAISE EXCEPTION 'M-Pesa reference is only valid for M-Pesa payments'; END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:other-payment-request:' || p_request_id::text || ':record_other_contribution_payment', 0));

    SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id = p_cycle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
    IF v_cycle.status <> 'open' THEN RAISE EXCEPTION 'Other contribution cycle is not open'; END IF;
    IF v_cycle.group_id IS NULL OR v_cycle.contribution_type_id IS NULL THEN RAISE EXCEPTION 'Other contribution cycle has incomplete group/type lineage'; END IF;

    SELECT ct.* INTO v_type FROM public.contribution_types ct WHERE ct.id = v_cycle.contribution_type_id AND ct.group_id = v_cycle.group_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution type does not belong to cycle group'; END IF;
    IF lower(coalesce(v_type.code,'')) <> 'special' THEN RAISE EXCEPTION 'Cycle contribution type is not the registered Other type'; END IF;
    IF NOT public.cl_user_has_role(v_cycle.group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]) THEN RAISE EXCEPTION 'Finance authorization required'; END IF;

    v_payload := jsonb_build_object('cycle_id', p_cycle_id, 'member_id', p_member_id, 'amount', p_amount, 'contribution_date', p_contribution_date, 'payment_method', p_payment_method, 'reference', p_reference, 'mpesa_reference', p_mpesa_reference, 'notes', p_notes, 'payment_id', p_payment_id);
    v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

    INSERT INTO private.other_contribution_payment_requests (request_id, operation, group_id, member_id, cycle_id, payment_id, payload_hash, result)
    VALUES (p_request_id, 'record_other_contribution_payment', v_cycle.group_id, p_member_id, p_cycle_id, NULL, v_payload_hash, '{}'::jsonb)
    ON CONFLICT (request_id, operation) DO NOTHING;

    SELECT r.* INTO v_existing_request FROM private.other_contribution_payment_requests r
    WHERE r.request_id = p_request_id AND r.operation = 'record_other_contribution_payment' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unable to establish payment request ledger entry'; END IF;

    IF v_existing_request.payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'Request id is already bound to a different payment payload'; END IF;
    IF v_existing_request.group_id IS DISTINCT FROM v_cycle.group_id OR v_existing_request.member_id IS DISTINCT FROM p_member_id OR v_existing_request.cycle_id IS DISTINCT FROM p_cycle_id THEN RAISE EXCEPTION 'Request id is already bound to a different payment context'; END IF;

    IF v_existing_request.completed_at IS NOT NULL THEN
        RETURN jsonb_set(v_existing_request.result, '{idempotent_replay}', 'true'::jsonb, true);
    END IF;

    IF v_existing_request.payment_id IS NOT NULL THEN RAISE EXCEPTION 'Payment request is already partially completed'; END IF;

    SELECT c.* INTO v_payment FROM public.contributions c WHERE c.id = p_payment_id FOR UPDATE;
    IF FOUND THEN
        IF v_payment.group_id IS DISTINCT FROM v_cycle.group_id OR v_payment.member_id IS DISTINCT FROM p_member_id OR v_payment.amount IS DISTINCT FROM p_amount OR v_payment.contribution_date IS DISTINCT FROM p_contribution_date OR lower(coalesce(v_payment.contribution_type,'')) <> 'other' THEN
            RAISE EXCEPTION 'Payment id is already bound to a different contribution';
        END IF;
        RAISE EXCEPTION 'Payment id is already used by another request';
    END IF;

    v_payment_month := date_trunc('month', p_contribution_date)::date;
    v_month := to_char(v_payment_month, 'YYYY-MM');

    SELECT least(v_payment_month, min(o.economic_month)), greatest(v_payment_month, max(o.economic_month))
    INTO v_lock_start, v_lock_end
    FROM public.contribution_obligations o
    WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
      AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
      AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0;

    v_lock_start := coalesce(v_lock_start, v_payment_month);
    v_lock_end := coalesce(v_lock_end, v_payment_month);
    v_initial_lock_start := v_lock_start;
    v_initial_lock_end := v_lock_end;

    PERFORM public.cl_2b_accounting_lock_range(v_cycle.group_id, v_lock_start, v_lock_end);

    SELECT least(v_payment_month, min(o.economic_month)), greatest(v_payment_month, max(o.economic_month))
    INTO v_recheck_start, v_recheck_end
    FROM public.contribution_obligations o
    WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
      AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
      AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0;

    v_recheck_start := coalesce(v_recheck_start, v_payment_month);
    v_recheck_end := coalesce(v_recheck_end, v_payment_month);
    IF v_recheck_start < v_initial_lock_start THEN RAISE EXCEPTION 'Eligible Other obligation appeared before the locked accounting range'; END IF;
    IF v_recheck_end > v_initial_lock_end THEN
        PERFORM public.cl_2b_accounting_lock_range(v_cycle.group_id, v_initial_lock_end + interval '1 month', v_recheck_end);
        v_lock_end := v_recheck_end;
    END IF;

    SELECT m.* INTO v_member FROM public.members m WHERE m.id = p_member_id AND m.group_id = v_cycle.group_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to the cycle group'; END IF;
    IF lower(coalesce(v_member.status,'active')) <> 'active' OR lower(coalesce(v_member.onboarding_status,'active')) <> 'active' THEN RAISE EXCEPTION 'Member is not active'; END IF;

    SELECT fp.* INTO v_financial_period FROM public.ensure_financial_period(v_cycle.group_id, v_month) fp;
    IF v_financial_period.status <> 'open' THEN RAISE EXCEPTION 'Payment accounting month is closed'; END IF;

    v_remaining := p_amount;
    FOR v_obligation IN
        SELECT o.* FROM public.contribution_obligations o
        WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
          AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
          AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0
        ORDER BY o.economic_month ASC, o.obligation_month ASC, o.id ASC FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        SELECT greatest(v_obligation.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = v_obligation.id),0),0) INTO v_outstanding;
        IF v_outstanding <= 0 THEN CONTINUE; END IF;
        v_allocate := least(v_remaining, v_outstanding);
        SELECT fp.* INTO v_financial_period FROM public.ensure_financial_period(v_cycle.group_id, to_char(v_obligation.economic_month, 'YYYY-MM')) fp;
        IF v_financial_period.status <> 'open' THEN RAISE EXCEPTION 'An eligible Other obligation belongs to a closed accounting month'; END IF;
        v_remaining := v_remaining - v_allocate;
    END LOOP;

    INSERT INTO public.contributions (id, group_id, member_id, amount, contribution_type, month, payment_method, reference, recorded_by, contribution_date, notes, mpesa_reference, initiative_id)
    VALUES (p_payment_id, v_cycle.group_id, p_member_id, p_amount, 'other', v_month, p_payment_method, p_reference, v_uid, p_contribution_date, p_notes, p_mpesa_reference, NULL)
    RETURNING * INTO v_payment;

    v_remaining := p_amount; v_allocated := 0; v_allocation_count := 0;
    FOR v_obligation IN
        SELECT o.* FROM public.contribution_obligations o
        WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
          AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
          AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0
        ORDER BY o.economic_month ASC, o.obligation_month ASC, o.id ASC FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        SELECT greatest(v_obligation.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = v_obligation.id),0),0) INTO v_outstanding;
        IF v_outstanding <= 0 THEN CONTINUE; END IF;
        v_allocate := least(v_remaining, v_outstanding);
        INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount) VALUES (p_payment_id, v_obligation.id, v_allocate);
        v_remaining := v_remaining - v_allocate;
        v_allocated := v_allocated + v_allocate;
        v_allocation_count := v_allocation_count + 1;
    END LOOP;

    v_result := jsonb_build_object('status','recorded','idempotent_replay',false,'payment_id',p_payment_id,'request_id',p_request_id,'group_id',v_cycle.group_id,'member_id',p_member_id,'cycle_id',p_cycle_id,'amount',p_amount,'allocated_amount',v_allocated,'unallocated_remainder',v_remaining,'allocation_count',v_allocation_count,'accounting_month',v_month);

    UPDATE private.other_contribution_payment_requests
    SET payment_id=p_payment_id, result=v_result, completed_at=clock_timestamp()
    WHERE request_id=p_request_id AND operation='record_other_contribution_payment';

    RETURN v_result;
END;
$function$



CREATE OR REPLACE FUNCTION public.record_recurring_contribution_initiative_payment(p_initiative_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_payment uuid;
  v_cash numeric := p_amount;
  v_alloc numeric;
  v_remaining numeric;
  v_credit_used numeric := 0;
  v_cash_allocated numeric := 0;
  r record;
  c record;
  v_result jsonb;
  v_alloc_id uuid;
  v_claimed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid payment request'; END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  IF p_contribution_date < v_i.start_date OR p_contribution_date > v_i.closing_date THEN RAISE EXCEPTION 'Payment date outside initiative window'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id=p_member_id AND m.group_id=v_i.group_id
      AND lower(coalesce(m.status,'active'))='active'
      AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid() OR public.can_manage_members(v_i.group_id))
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'record_recurring_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_result FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='record_recurring_initiative_payment';
    RETURN v_result || jsonb_build_object('idempotent',true);
  END IF;

  INSERT INTO public.contributions
    (group_id,member_id,amount,contribution_type,month,payment_method,reference,recorded_by,contribution_date,notes,mpesa_reference,initiative_id)
  VALUES
    (v_i.group_id,p_member_id,p_amount,'initiative',to_char(p_contribution_date,'YYYY-MM'),p_payment_method,p_reference,auth.uid(),p_contribution_date,p_notes,p_mpesa_reference,p_initiative_id)
  RETURNING id INTO v_payment;

  /* Initiative lock is acquired first. Eligible obligations are then locked in deterministic chronological order. */
  FOR r IN
    SELECT o.id,o.amount_due,o.due_date,
      greatest(o.amount_due-coalesce((
        SELECT sum(a.amount) FROM public.contribution_initiative_allocations a
        WHERE a.initiative_obligation_id=o.id
          AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals x WHERE x.payment_id=a.payment_id)
      ),0),0) outstanding
    FROM public.contribution_initiative_obligations o
    JOIN public.contribution_initiative_periods p ON p.id=o.initiative_period_id
    WHERE o.initiative_id=v_i.id AND o.member_id=p_member_id AND p.opening_date<=date_trunc('month',p_contribution_date)::date
    ORDER BY o.due_date,o.id
    FOR UPDATE OF o
  LOOP
    v_remaining:=r.outstanding;
    v_alloc_id:=NULL;
    IF v_remaining<=0 THEN CONTINUE; END IF;

    IF v_cash>0 THEN
      v_alloc:=least(v_cash,v_remaining);
      INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount)
      VALUES(v_payment,r.id,v_alloc) RETURNING id INTO v_alloc_id;
      v_cash:=v_cash-v_alloc;
      v_cash_allocated:=v_cash_allocated+v_alloc;
      v_remaining:=v_remaining-v_alloc;
    END IF;

    WHILE v_remaining>0 LOOP
      SELECT * INTO c FROM public.contribution_initiative_credits
      WHERE initiative_id=v_i.id AND member_id=p_member_id AND remaining_amount>0
      ORDER BY created_at,id LIMIT 1 FOR UPDATE;
      EXIT WHEN NOT FOUND;

      v_alloc:=least(v_remaining,c.remaining_amount);
      IF v_alloc_id IS NULL THEN
        INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount)
        VALUES(v_payment,r.id,v_alloc) RETURNING id INTO v_alloc_id;
      ELSE
        UPDATE public.contribution_initiative_allocations SET amount=amount+v_alloc WHERE id=v_alloc_id;
      END IF;
      INSERT INTO public.contribution_initiative_credit_consumptions(allocation_id,credit_id,amount)
      VALUES(v_alloc_id,c.id,v_alloc);
      UPDATE public.contribution_initiative_credits SET remaining_amount=remaining_amount-v_alloc WHERE id=c.id;
      v_remaining:=v_remaining-v_alloc;
      v_credit_used:=v_credit_used+v_alloc;
    END LOOP;
  END LOOP;

  IF v_cash>0 THEN
    INSERT INTO public.contribution_initiative_credits(initiative_id,member_id,source_payment_id,amount,remaining_amount)
    VALUES(v_i.id,p_member_id,v_payment,v_cash,v_cash);
    /* source_payment_id is an existing FK to contributions(id); initiative/member
       lineage is established atomically by this authenticated recurring RPC. */
  END IF;

  v_result=jsonb_build_object('status','recorded','payment_id',v_payment,'initiative_id',v_i.id,'amount',p_amount,'cash_allocated',v_cash_allocated,'credit_used',v_credit_used,'credit_created',v_cash);
  UPDATE private.contribution_initiative_requests
  SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_result
  WHERE request_id=p_request_id AND operation='record_recurring_initiative_payment';
  RETURN v_result;
END;
$function$


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
$function$


CREATE OR REPLACE FUNCTION public.refresh_my_group_contribution_accounting(p_group_id uuid, p_through_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_through_month IS NULL
     OR p_through_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['chairperson', 'treasurer', 'secretary', 'owner', 'administrator']::text[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to refresh contribution accounting for this group'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.refresh_canonical_contribution_accounting(
    p_group_id,
    p_through_month,
    NULL
  );
END;
$function$


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

  IF NOT public.can_manage_members(v_group_id) THEN
    RAISE EXCEPTION 'Not authorized to manage members in this group';
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
$function$


CREATE OR REPLACE FUNCTION public.reject_group_application(p_application_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a public.group_applications%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT *
  INTO a
  FROM public.group_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF a.status = 'approved' THEN
    RAISE EXCEPTION 'Approved applications cannot be rejected';
  END IF;

  IF a.status = 'rejected' THEN
    RAISE EXCEPTION 'Application is already rejected';
  END IF;

  UPDATE public.group_applications
  SET status = 'rejected',
      rejection_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_application_id;

  PERFORM private.append_platform_activity(
    'group_application_reviewed',
    jsonb_build_object(
      'application_id', a.id,
      'group_name', a.group_name,
      'review_outcome', 'rejected',
      'rejection_reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', a.id,
    'email', a.email,
    'admin_name', a.admin_name,
    'group_name', a.group_name,
    'rejection_reason', v_reason
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.reopen_financial_month(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Invalid month. Expected YYYY-MM';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION
      'Not authorized to reopen this financial month';
  END IF;

  PERFORM public.cl_2b_accounting_lock(p_group_id,p_month);

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id
    AND fp.month=p_month
  FOR UPDATE;

  IF NOT FOUND
     OR lower(coalesce(v_period.status,''))<>'closed'
  THEN
    RAISE EXCEPTION
      'Financial month % is not closed',p_month;
  END IF;

  UPDATE public.financial_periods
  SET status='open',
      closing_balance=NULL,
      closed_at=NULL,
      closed_by=NULL
  WHERE id=v_period.id;

  RETURN public.get_monthly_financial_report(
    p_group_id,p_month
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_expense_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resolved_member_id uuid;
BEGIN
  -- recorded_by is defined as members.id, but the frontend may provide
  -- the authenticated user's UUID. Resolve it to the member row first.
  IF NEW.recorded_by IS NOT NULL THEN
    SELECT m.id
      INTO resolved_member_id
    FROM public.members m
    WHERE m.group_id = NEW.group_id
      AND (m.id = NEW.recorded_by
           OR m.user_id = NEW.recorded_by
           OR m.auth_user_id = NEW.recorded_by)
    LIMIT 1;

    IF resolved_member_id IS NULL THEN
      RAISE EXCEPTION 'The expense recorder is not a member of this group.';
    END IF;

    NEW.recorded_by := resolved_member_id;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_contribution_initiative_payment(p_payment_id uuid, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_c public.contributions; v_i public.contribution_initiatives; v_existing jsonb; v_rev uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'reverse_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='reverse_initiative_payment'; RETURN v_existing; END IF;

  SELECT * INTO v_c FROM public.contributions WHERE id=p_payment_id AND initiative_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative payment not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=v_c.initiative_id FOR UPDATE;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF EXISTS(SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=p_payment_id) THEN RAISE EXCEPTION 'Payment already reversed'; END IF;
  IF length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'Reversal reason is required'; END IF;
  INSERT INTO public.contribution_initiative_payment_reversals(payment_id,reason,reversed_by)
  VALUES(p_payment_id,trim(p_reason),auth.uid()) RETURNING id INTO v_rev;
  v_existing=jsonb_build_object('status','reversed','payment_id',p_payment_id,'reversal_id',v_rev);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='reverse_initiative_payment';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_recurring_contribution_initiative_payment(p_payment_id uuid, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existing jsonb;
  v_i uuid;
  v_claimed boolean;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason and request id are required'; END IF;

  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'reverse_recurring_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='reverse_recurring_initiative_payment';
    RETURN v_existing || jsonb_build_object('idempotent',true);
  END IF;

  SELECT c.initiative_id INTO v_i FROM public.contributions c
  WHERE c.id=p_payment_id AND c.initiative_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring initiative payment not found'; END IF;

  PERFORM 1 FROM public.contribution_initiatives i
  WHERE i.id=v_i AND public.can_manage_members(i.group_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals WHERE payment_id=p_payment_id) THEN
    RAISE EXCEPTION 'Payment already reversed';
  END IF;

  /* A source-credit reversal cannot silently invalidate a later payment's allocation. */
  IF EXISTS (
    SELECT 1
    FROM public.contribution_initiative_credit_consumptions cc
    JOIN public.contribution_initiative_credits c ON c.id=cc.credit_id
    JOIN public.contribution_initiative_allocations a ON a.id=cc.allocation_id
    WHERE c.source_payment_id=p_payment_id AND a.payment_id<>p_payment_id
  ) THEN
    RAISE EXCEPTION 'Cannot reverse payment whose initiative credit was already consumed by another payment';
  END IF;

  INSERT INTO public.contribution_initiative_payment_reversals(payment_id,reason,reversed_by)
  VALUES(p_payment_id,p_reason,auth.uid());

  /* Restore credits consumed by this payment itself. */
  FOR r IN
    SELECT cc.credit_id,sum(cc.amount) amount
    FROM public.contribution_initiative_credit_consumptions cc
    JOIN public.contribution_initiative_allocations a ON a.id=cc.allocation_id
    WHERE a.payment_id=p_payment_id
    GROUP BY cc.credit_id
  LOOP
    UPDATE public.contribution_initiative_credits
    SET remaining_amount=least(amount,remaining_amount+r.amount)
    WHERE id=r.credit_id;
  END LOOP;

  /* Excess credit created by the reversed payment is no longer available. */
  UPDATE public.contribution_initiative_credits SET remaining_amount=0 WHERE source_payment_id=p_payment_id;

  v_existing=jsonb_build_object('status','reversed','payment_id',p_payment_id,'initiative_id',v_i);
  UPDATE private.contribution_initiative_requests r
  SET initiative_id=i.id,group_id=i.group_id,result=v_existing
  FROM public.contribution_initiatives i
  WHERE i.id=v_i AND r.request_id=p_request_id AND r.operation='reverse_recurring_initiative_payment';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_subscription_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_payment public.subscription_payments%ROWTYPE;
    v_source_invoice public.subscription_invoices%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_affected_invoice public.subscription_invoices%ROWTYPE;
    v_credit RECORD;
    v_allocation RECORD;
    v_payment_ids uuid[];
    v_invoice_ids uuid[];
    v_credit_ids uuid[];
    v_allocation_ids uuid[];
    v_cycle_ids uuid[];
    v_lock_id uuid;
    v_invoice_id uuid;
    v_invoice_applied numeric;
    v_now timestamptz := clock_timestamp();
BEGIN
    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_source_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source payment % does not resolve to its invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_source_invoice.subscription_id
      AND gs.group_id = v_source_invoice.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice does not resolve to its subscription'
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.invoice_id ORDER BY x.invoice_id)
    INTO v_invoice_ids
    FROM (
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    WHERE c.source_payment_id = v_payment.id;

    v_payment_ids := ARRAY[v_payment.id];

    SELECT array_agg(x.cycle_id ORDER BY x.cycle_id)
    INTO v_cycle_ids
    FROM (
        SELECT si.cycle_id
        FROM public.subscription_invoices AS si
        WHERE si.id = ANY(COALESCE(v_invoice_ids, ARRAY[]::uuid[]))
          AND si.subscription_id = v_subscription.id
        UNION
        SELECT v_source_invoice.cycle_id
    ) AS x;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chama_live_subscription:' || v_subscription.id::text,
            0
        )
    );

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_source_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source payment % no longer resolves to its invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_source_invoice.subscription_id
      AND gs.group_id = v_source_invoice.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice no longer resolves to its subscription'
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(a.payment_id ORDER BY a.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
    ) AS a;

    IF EXISTS (
        SELECT 1
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE (
            a.payment_id = v_payment.id
            OR EXISTS (
                SELECT 1
                FROM public.subscription_credits AS c
                WHERE c.id = a.credit_id
                  AND c.source_payment_id = v_payment.id
            )
        )
        AND si.subscription_id <> v_subscription.id
    ) THEN
        RAISE EXCEPTION
            'Payment % has an allocation resolving outside its authoritative subscription',
            v_payment.id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.invoice_id ORDER BY x.invoice_id)
    INTO v_invoice_ids
    FROM (
        SELECT v_source_invoice.id AS invoice_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    WHERE c.source_payment_id = v_payment.id;

    SELECT array_agg(x.allocation_id ORDER BY x.allocation_id)
    INTO v_allocation_ids
    FROM (
        SELECT a.id AS allocation_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.id AS allocation_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(x.cycle_id ORDER BY x.cycle_id)
    INTO v_cycle_ids
    FROM (
        SELECT si.cycle_id
        FROM public.subscription_invoices AS si
        WHERE si.id = ANY(COALESCE(v_invoice_ids, ARRAY[]::uuid[]))
          AND si.subscription_id = v_subscription.id
        UNION
        SELECT v_source_invoice.cycle_id
    ) AS x;

    FOR v_lock_id IN
        SELECT unnest(v_payment_ids)
        ORDER BY 1
    LOOP
        PERFORM 1
        FROM public.subscription_payments AS sp
        WHERE sp.id = v_lock_id
        FOR UPDATE;
    END LOOP;

    IF v_invoice_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_invoice_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_invoices AS si
            WHERE si.id = v_lock_id
              AND si.subscription_id = v_subscription.id
              AND si.group_id = v_subscription.group_id
            FOR UPDATE;
        END LOOP;
    END IF;

    IF v_credit_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT c.id
            FROM public.subscription_credits AS c
            WHERE c.id = ANY(v_credit_ids)
            ORDER BY c.created_at, c.id
        LOOP
            PERFORM 1
            FROM public.subscription_credits AS c
            WHERE c.id = v_lock_id
            FOR UPDATE;
        END LOOP;
    END IF;

    IF v_allocation_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_allocation_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_payment_allocations AS a
            JOIN public.subscription_invoices AS si
              ON si.id = a.invoice_id
            WHERE a.id = v_lock_id
              AND si.subscription_id = v_subscription.id
              AND si.group_id = v_subscription.group_id
            FOR UPDATE OF a;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Allocation % no longer resolves to the authoritative subscription/group',
                    v_lock_id
                    USING ERRCODE = '23503';
            END IF;
        END LOOP;
    END IF;

    IF v_cycle_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_cycle_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_cycles AS sc
            WHERE sc.id = v_lock_id
              AND sc.subscription_id = v_subscription.id
            FOR UPDATE;
        END LOOP;
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF v_payment.status = 'reversed' THEN
        RETURN jsonb_build_object(
            'status', 'already_reversed',
            'payment_id', v_payment.id,
            'invoice_id', v_source_invoice.id,
            'subscription_id', v_subscription.id
        );
    END IF;

    IF v_payment.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only confirmed payment % can be reversed; current status is %',
            v_payment.id, v_payment.status
            USING ERRCODE = '22023';
    END IF;

    IF v_credit_ids IS NOT NULL THEN
        FOR v_credit IN
            SELECT c.id, c.source_payment_id
            FROM public.subscription_credits AS c
            WHERE c.id = ANY(v_credit_ids)
            ORDER BY c.created_at, c.id
        LOOP
            FOR v_allocation IN
                SELECT a.id
                FROM public.subscription_payment_allocations AS a
                WHERE a.id = ANY(
                    COALESCE(v_allocation_ids, ARRAY[]::uuid[])
                )
                  AND a.credit_id = v_credit.id
                  AND a.status = 'active'
                ORDER BY a.id
            LOOP
                UPDATE public.subscription_payment_allocations
                SET status = 'reversed', reversed_at = v_now
                WHERE id = v_allocation.id AND status = 'active';
            END LOOP;

            UPDATE public.subscription_credits
            SET status = 'reversed', reversed_at = v_now
            WHERE id = v_credit.id AND status <> 'reversed';
        END LOOP;
    END IF;

    FOR v_allocation IN
        SELECT a.id
        FROM public.subscription_payment_allocations AS a
        WHERE a.id = ANY(
            COALESCE(v_allocation_ids, ARRAY[]::uuid[])
        )
          AND a.payment_id = v_payment.id
          AND a.credit_id IS NULL
          AND a.status = 'active'
        ORDER BY a.id
    LOOP
        UPDATE public.subscription_payment_allocations
        SET status = 'reversed', reversed_at = v_now
        WHERE id = v_allocation.id AND status = 'active';
    END LOOP;

    UPDATE public.subscription_payments
    SET status = 'reversed'
    WHERE id = v_payment.id AND status = 'confirmed';

    PERFORM private.append_platform_activity(
        'subscription_payment_reversed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_id', v_source_invoice.id,
            'subscription_id', v_subscription.id
        )
    );

    IF v_invoice_ids IS NOT NULL THEN
        FOREACH v_invoice_id IN ARRAY v_invoice_ids
        LOOP
            SELECT si.* INTO v_affected_invoice
            FROM public.subscription_invoices AS si
            WHERE si.id = v_invoice_id;

            SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
            INTO v_invoice_applied
            FROM public.subscription_payment_allocations AS a
            WHERE a.invoice_id = v_invoice_id;

            IF v_affected_invoice.total_amount = 0 THEN
                UPDATE public.subscription_invoices
                SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
                WHERE id = v_invoice_id;
            ELSIF v_invoice_applied >= v_affected_invoice.total_amount THEN
                UPDATE public.subscription_invoices
                SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
                WHERE id = v_invoice_id;
            ELSIF v_invoice_applied > 0 THEN
                UPDATE public.subscription_invoices
                SET status = 'partially_paid', paid_at = NULL
                WHERE id = v_invoice_id;
            ELSIF v_affected_invoice.due_at IS NOT NULL AND v_now > v_affected_invoice.due_at THEN
                UPDATE public.subscription_invoices
                SET status = 'overdue', paid_at = NULL
                WHERE id = v_invoice_id;
            ELSE
                UPDATE public.subscription_invoices
                SET status = 'issued', paid_at = NULL
                WHERE id = v_invoice_id;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.subscription_invoices AS si
                WHERE si.id = v_invoice_id AND si.status = 'paid'
            ) THEN
                UPDATE public.subscription_cycles
                SET status = 'paid'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            ELSIF EXISTS (
                SELECT 1 FROM public.subscription_invoices AS si
                WHERE si.id = v_invoice_id AND si.status = 'overdue'
            ) THEN
                UPDATE public.subscription_cycles
                SET status = 'overdue'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            ELSE
                UPDATE public.subscription_cycles
                SET status = 'invoiced'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'status', 'reversed',
        'payment_id', v_payment.id,
        'invoice_id', v_source_invoice.id,
        'subscription_id', v_subscription.id
    );
END;
$function$



CREATE OR REPLACE FUNCTION public.save_pending_onboarding(p_group_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare
  v_uid uuid := auth.uid();
  v_id uuid;

  v_monthly numeric :=
    greatest(coalesce(p_monthly_contribution, 0), 0);

  v_opening numeric :=
    greatest(coalesce(p_opening_balance, 0), 0);

begin

  /* =====================================================
     AUTHENTICATION
  ===================================================== */

  if v_uid is null then
    raise exception 'Authentication required';
  end if;


  /* =====================================================
     VALIDATION
  ===================================================== */

  if nullif(
    btrim(coalesce(p_group_name, '')),
    ''
  ) is null then

    raise exception 'Group name is required';

  end if;


  /* =====================================================
     DO NOT ALLOW EXISTING GROUP MEMBER
  ===================================================== */

  if exists (
    select 1
    from public.members m
    where m.auth_user_id = v_uid
       or m.user_id = v_uid
  ) then

    raise exception
      'This account is already assigned to a group';

  end if;


  /* =====================================================
     CANCEL OLD PENDING RECORD
  ===================================================== */

  update public.pending_onboarding
  set
    status = 'cancelled'
  where auth_user_id = v_uid
    and status = 'pending';


  /* =====================================================
     SAVE NEW PENDING ONBOARDING
  ===================================================== */

  insert into public.pending_onboarding (
    auth_user_id,
    group_name,
    category,
    monthly_contribution,
    opening_balance,
    description,
    admin_name,
    admin_phone,
    country,
    status
  )
  values (
    v_uid,
    btrim(p_group_name),
    coalesce(
      nullif(btrim(p_category), ''),
      'other'
    ),
    v_monthly,
    v_opening,
    nullif(
      btrim(coalesce(p_description, '')),
      ''
    ),
    nullif(
      btrim(coalesce(p_admin_name, '')),
      ''
    ),
    nullif(
      btrim(coalesce(p_admin_phone, '')),
      ''
    ),
    coalesce(
      nullif(btrim(p_country), ''),
      'Kenya'
    ),
    'pending'
  )
  returning id into v_id;


  return jsonb_build_object(
    'success', true,
    'pending_id', v_id
  );

end;

$function$


CREATE OR REPLACE FUNCTION public.set_contribution_initiative_member_term(p_initiative_member_id uuid, p_effective_from date, p_amount numeric, p_status text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_im public.contribution_initiative_members; v_i public.contribution_initiatives; v_existing jsonb; v_first date; v_term public.contribution_initiative_member_terms; v_claimed boolean;
  v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  IF p_amount<0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;
  IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid term status'; END IF;
  SELECT * INTO v_im FROM public.contribution_initiative_members WHERE id=p_initiative_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative participant not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=v_im.initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency<>'monthly' THEN RAISE EXCEPTION 'Initiative is not recurring monthly'; END IF;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'set_recurring_initiative_member_term','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT initiative_id,group_id,result INTO v_request_initiative_id,v_request_group_id,v_existing
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='set_recurring_initiative_member_term' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id
       OR (v_existing->>'initiative_member_id')::uuid IS DISTINCT FROM p_initiative_member_id
    THEN RAISE EXCEPTION 'Request id is already bound to another participant'; END IF;
    RETURN v_existing||jsonb_build_object('idempotent',true);
  END IF;
  v_first:=date_trunc('month',v_i.start_date)::date;
  IF v_i.start_date>v_first THEN v_first:=(v_first+interval '1 month')::date; END IF;
  IF p_effective_from<v_first OR p_effective_from>v_i.closing_date THEN RAISE EXCEPTION 'Term effective date outside recurring period window'; END IF;
  IF p_effective_from<>date_trunc('month',p_effective_from)::date THEN RAISE EXCEPTION 'Recurring term effective date must be the first day of a calendar month'; END IF;
  IF v_i.status='active' AND EXISTS(SELECT 1 FROM public.contribution_initiative_periods p WHERE p.initiative_id=v_i.id AND p.period_key=to_char(p_effective_from,'YYYY-MM')) THEN RAISE EXCEPTION 'Participant term cannot change after that period has begun'; END IF;
  SELECT * INTO v_term FROM public.contribution_initiative_member_terms WHERE initiative_member_id=p_initiative_member_id AND effective_from=p_effective_from;
  IF FOUND THEN
    IF v_term.amount IS DISTINCT FROM p_amount OR v_term.status IS DISTINCT FROM p_status THEN RAISE EXCEPTION 'Conflicting term already exists for effective date'; END IF;
    v_existing=jsonb_build_object('status','idempotent','initiative_member_id',p_initiative_member_id,'effective_from',p_effective_from,'amount',v_term.amount);
  ELSE
    UPDATE public.contribution_initiative_member_terms SET effective_to=p_effective_from-1
    WHERE initiative_member_id=p_initiative_member_id AND effective_from<p_effective_from AND (effective_to IS NULL OR effective_to>=p_effective_from);
    INSERT INTO public.contribution_initiative_member_terms(initiative_member_id,effective_from,amount,status)
    VALUES(p_initiative_member_id,p_effective_from,p_amount,p_status) RETURNING * INTO v_term;
    v_existing=jsonb_build_object('status','recorded','initiative_member_id',p_initiative_member_id,'effective_from',p_effective_from,'amount',p_amount);
  END IF;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='set_recurring_initiative_member_term';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_contribution_initiative_members(p_initiative_id uuid, p_members jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; x jsonb; v_member uuid; v_amount numeric; v_group uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'set_initiative_members','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='set_initiative_members'; RETURN v_existing; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Participants can only be changed while draft'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) LOOP
    v_member=(x->>'member_id')::uuid; v_amount=(x->>'amount')::numeric;
    SELECT m.group_id INTO v_group FROM public.members m WHERE m.id=v_member;
    IF v_group IS DISTINCT FROM v_i.group_id OR v_amount IS NULL OR v_amount < 0 THEN RAISE EXCEPTION 'Invalid participant'; END IF;
  END LOOP;
  DELETE FROM public.contribution_initiative_members WHERE initiative_id=p_initiative_id;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) LOOP
    INSERT INTO public.contribution_initiative_members(initiative_id,member_id,amount,effective_from,effective_to,status)
    VALUES(p_initiative_id,(x->>'member_id')::uuid,(x->>'amount')::numeric,v_i.start_date,v_i.closing_date,'active');
  END LOOP;
  v_existing=jsonb_build_object('status','participants_updated','initiative_id',p_initiative_id,'count',jsonb_array_length(coalesce(p_members,'[]'::jsonb)));
  UPDATE private.contribution_initiative_requests SET initiative_id=p_initiative_id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='set_initiative_members';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_member_actual_position(p_member_id uuid, p_actual_position text, p_actual_position_name text DEFAULT NULL::text, p_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid; v_actor_member_id uuid; v_group_id uuid; v_join_date date;
  v_current_position text; v_current_position_name text; v_latest_from date; v_latest_to date;
  v_effective_from date; v_position text; v_position_name text; v_history_count integer;
BEGIN
  v_auth_uid:=auth.uid(); IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  v_position:=lower(nullif(btrim(p_actual_position),''));
  v_position_name:=nullif(btrim(p_actual_position_name),'');
  IF v_position IS NULL OR v_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023'; END IF;
  IF v_position='other' AND v_position_name IS NULL THEN RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_position<>'other' THEN v_position_name:=NULL; END IF;
  SELECT m.group_id,m.join_date INTO v_group_id,v_join_date FROM public.members m WHERE m.id=p_member_id FOR UPDATE;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT m.id INTO v_actor_member_id FROM public.members m WHERE m.group_id=v_group_id AND (m.auth_user_id=v_auth_uid OR m.user_id=v_auth_uid)
    AND lower(coalesce(m.status,''))='active' AND lower(coalesce(m.onboarding_status,''))='active' ORDER BY m.id LIMIT 1;
  IF v_actor_member_id IS NULL OR NOT public.can_manage_members(v_group_id) THEN RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT count(*)::integer INTO v_history_count FROM public.member_position_history h WHERE h.member_id=p_member_id;
  IF v_history_count=0 THEN
    v_effective_from:=coalesce(p_effective_from,v_join_date);
    IF v_effective_from<v_join_date THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023'; END IF;
    INSERT INTO public.member_position_history(group_id,member_id,actual_position,actual_position_name,effective_from,effective_to,recorded_by)
    VALUES(v_group_id,p_member_id,v_position,v_position_name,v_effective_from,NULL,v_actor_member_id);
    UPDATE public.members SET actual_position=v_position,actual_position_name=v_position_name WHERE id=p_member_id;
    RETURN jsonb_build_object('success',true,'member_id',p_member_id,'actual_position',v_position,'actual_position_name',v_position_name,'effective_from',v_effective_from);
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_REQUIRED' USING ERRCODE='22023'; END IF;
  v_effective_from:=p_effective_from;
  IF v_effective_from<CURRENT_DATE THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_RETROACTIVE' USING ERRCODE='22023'; END IF;
  SELECT h.effective_from,h.effective_to,h.actual_position,h.actual_position_name INTO v_latest_from,v_latest_to,v_current_position,v_current_position_name
  FROM public.member_position_history h WHERE h.member_id=p_member_id ORDER BY h.effective_from DESC LIMIT 1;
  IF v_latest_to IS NOT NULL THEN RAISE EXCEPTION 'CURRENT_POSITION_HISTORY_NOT_OPEN' USING ERRCODE='23514'; END IF;
  IF v_effective_from<=v_latest_from THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_NOT_AFTER_LATEST' USING ERRCODE='22023'; END IF;
  UPDATE public.member_position_history SET effective_to=v_effective_from WHERE member_id=p_member_id AND effective_to IS NULL;
  INSERT INTO public.member_position_history(group_id,member_id,actual_position,actual_position_name,effective_from,effective_to,recorded_by)
  VALUES(v_group_id,p_member_id,v_position,v_position_name,v_effective_from,NULL,v_actor_member_id);
  UPDATE public.members SET actual_position=v_position,actual_position_name=v_position_name WHERE id=p_member_id;
  RETURN jsonb_build_object('success',true,'member_id',p_member_id,'actual_position',v_position,'actual_position_name',v_position_name,'effective_from',v_effective_from);
END;
$function$


CREATE OR REPLACE FUNCTION public.set_recorded_by_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  /*
   * recorded_by stores members.id, not auth.users.id.
   * Always resolve the authenticated user to the active member
   * in the row's group before validation runs. This is important
   * because BEFORE triggers execute in trigger-name order and the
   * validation trigger can otherwise see auth.uid() and reject it.
   */
  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.group_id = NEW.group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, '')) IN ('active', 'approved')
    AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'No active member record is linked to this account';
  END IF;

  NEW.recorded_by := v_member_id;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.submit_expense_approval(p_expense_id uuid, p_decision text DEFAULT 'approved'::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_approver public.members%ROWTYPE;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_approvals integer;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication is required to approve an expense'; END IF;
  IF v_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  SELECT e.* INTO v_expense FROM public.expenses e WHERE e.id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_expense.approval_status <> 'pending' THEN RAISE EXCEPTION 'Only pending expenses can receive approvals'; END IF;
  IF v_expense.recorded_by IS NULL THEN RAISE EXCEPTION 'Expense recorder is missing; approval is blocked'; END IF;
  IF v_expense.recorded_by = v_user_id OR EXISTS (
    SELECT 1 FROM public.members recorder WHERE recorder.id = v_expense.recorded_by
      AND (recorder.user_id = v_user_id OR recorder.auth_user_id = v_user_id)
  ) THEN RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense'; END IF;
  SELECT count(*) INTO v_member_count FROM public.members m
  WHERE m.group_id = v_expense.group_id AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active' AND lower(coalesce(m.onboarding_status, '')) = 'active';
  IF v_member_count <> 1 THEN RAISE EXCEPTION 'Exactly one active member record in this group is required to approve expenses'; END IF;
  SELECT m.* INTO v_approver FROM public.members m
  WHERE m.group_id = v_expense.group_id AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active' AND lower(coalesce(m.onboarding_status, '')) = 'active';
  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position, '')), '_', ' '), '-', ' '), '[[:space:]]+', ' ', 'g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name, '')), '_', ' '), '-', ' '), '[[:space:]]+', ' ', 'g'));
  IF v_position IN ('chairperson', 'vice chairperson', 'chair', 'vice chair') OR v_position_name IN ('chairperson', 'vice chairperson', 'chair', 'vice chair') THEN
    v_slot := 'chair';
  ELSIF v_position = 'treasurer' OR v_position_name = 'treasurer' THEN
    v_slot := 'treasurer';
  ELSIF v_position IN ('secretary', 'vice secretary') OR v_position_name IN ('secretary', 'vice secretary') THEN
    v_slot := 'secretary';
  ELSE RAISE EXCEPTION 'Your declared group office is not eligible to approve expenses'; END IF;
  IF EXISTS (SELECT 1 FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.approver_user_id = v_user_id) THEN
    RAISE EXCEPTION 'You have already submitted a decision for this expense';
  END IF;
  IF EXISTS (SELECT 1 FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.approval_slot = v_slot) THEN
    RAISE EXCEPTION 'Another person has already filled your office approval slot';
  END IF;
  INSERT INTO public.expense_approvals (expense_id, group_id, approver_user_id, approval_slot, decision, note)
  VALUES (v_expense.id, v_expense.group_id, v_user_id, v_slot, v_decision, nullif(btrim(coalesce(p_note, '')), ''));
  IF v_decision = 'rejected' THEN v_status := 'rejected';
  ELSE
    SELECT count(*) INTO v_approvals FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.decision = 'approved';
    v_status := CASE WHEN v_approvals = 3 THEN 'approved' ELSE 'pending' END;
  END IF;
  UPDATE public.expenses SET approval_status = v_status WHERE id = v_expense.id;
  SELECT count(*) INTO v_approvals FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.decision = 'approved';
  RETURN jsonb_build_object('expense_id', v_expense.id, 'approval_status', v_status, 'approved_slots', v_approvals, 'required_slots', 3, 'recorded_by', v_expense.recorded_by);
END;
$function$


CREATE OR REPLACE FUNCTION public.submit_group_application(p_group_name text, p_category text, p_description text, p_admin_name text, p_admin_phone text, p_country text, p_location text, p_town text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_application_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(coalesce(p_group_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Group name is required'; END IF;
  IF nullif(btrim(coalesce(p_admin_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Administrator name is required'; END IF;
  IF nullif(btrim(coalesce(p_admin_phone,'')),'') IS NULL THEN RAISE EXCEPTION 'Administrator phone is required'; END IF;
  IF nullif(btrim(coalesce(p_location,'')),'') IS NULL THEN RAISE EXCEPTION 'Group location is required'; END IF;
  IF nullif(btrim(coalesce(p_town,'')),'') IS NULL THEN RAISE EXCEPTION 'Town is required'; END IF;

  SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Authenticated email could not be found'; END IF;

  IF EXISTS (SELECT 1 FROM public.members m WHERE m.auth_user_id=v_uid OR m.user_id=v_uid)
  THEN RAISE EXCEPTION 'This account is already assigned to a group'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_applications ga
    WHERE ga.auth_user_id=v_uid AND ga.status IN ('pending','under_review','approved')
  ) THEN
    RAISE EXCEPTION 'A group account application already exists for this account';
  END IF;

  INSERT INTO public.group_applications(
    auth_user_id,admin_name,admin_phone,email,group_name,category,
    description,country,location,town,status
  ) VALUES (
    v_uid,btrim(p_admin_name),btrim(p_admin_phone),v_email,btrim(p_group_name),
    nullif(btrim(coalesce(p_category,'')),''),
    nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(p_country),''),'Kenya'),
    btrim(p_location),btrim(p_town),'pending'
  ) RETURNING id INTO v_application_id;

  PERFORM private.append_platform_activity(
    'group_application_submitted',
    jsonb_build_object(
      'application_id',v_application_id,
      'group_name',btrim(p_group_name),
      'location',btrim(p_location),
      'town',btrim(p_town)
    )
  );

  RETURN jsonb_build_object(
    'success',true,'application_id',v_application_id,'status','pending'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.submit_group_application(p_group_name text, p_category text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_application_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_group_name,'')),'') is null then raise exception 'Group name is required'; end if;
  if nullif(btrim(coalesce(p_admin_name,'')),'') is null then raise exception 'Administrator name is required'; end if;
  if nullif(btrim(coalesce(p_admin_phone,'')),'') is null then raise exception 'Administrator phone is required'; end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'Authenticated email could not be found'; end if;

  if exists (select 1 from public.members m where m.auth_user_id = v_uid or m.user_id = v_uid) then
    raise exception 'This account is already assigned to a group';
  end if;

  select id into v_application_id
  from public.group_applications
  where auth_user_id = v_uid and status in ('pending','under_review','approved')
  order by created_at desc limit 1;

  if v_application_id is not null then
    raise exception 'A group account application already exists for this account';
  end if;

  insert into public.group_applications (
    auth_user_id, admin_name, admin_phone, email, group_name, category,
    monthly_contribution, opening_balance, description, country, status
  ) values (
    v_uid, btrim(p_admin_name), btrim(p_admin_phone), v_email,
    btrim(p_group_name), nullif(btrim(coalesce(p_category,'')),''),
    greatest(coalesce(p_monthly_contribution,0),0),
    greatest(coalesce(p_opening_balance,0),0),
    nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(p_country),''),'Kenya'), 'pending'
  ) returning id into v_application_id;

  return jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'status', 'pending'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_membership_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(trim(new.member_number), '') is null and nullif(trim(new.membership_number), '') is not null then
    new.member_number := trim(new.membership_number);
  elsif nullif(trim(new.membership_number), '') is null and nullif(trim(new.member_number), '') is not null then
    new.membership_number := trim(new.member_number);
  end if;
  return new;
end;
$function$



CREATE OR REPLACE FUNCTION public.update_group_contribution_cycle_settings(p_group_id uuid, p_monthly_closing_day smallint, p_monthly_grace_days smallint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_user_id uuid;
  v_role text;
  v_opening_date date;
  v_closing_date date;
  v_grace smallint;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_monthly_closing_day < 1 or p_monthly_closing_day > 28 then raise exception 'MONTHLY_CLOSING_DAY_MUST_BE_1_TO_28'; end if;
  if p_monthly_grace_days is null or p_monthly_grace_days < 0 or p_monthly_grace_days > 27 then raise exception 'MONTHLY_GRACE_DAYS_MUST_BE_0_TO_27'; end if;

  select owner_user_id into v_owner_user_id from public.groups where id=p_group_id;
  if v_owner_user_id is null then raise exception 'GROUP_NOT_FOUND'; end if;

  v_role := public.current_user_role(p_group_id);
  if auth.uid() <> v_owner_user_id and coalesce(v_role,'') not in ('admin','chairperson') then
    raise exception 'CONTRIBUTION_SETTINGS_NOT_AUTHORIZED';
  end if;

  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day);

  update public.group_contribution_settings
     set monthly_grace_days=p_monthly_grace_days, updated_by=auth.uid(), updated_at=now()
   where group_id=p_group_id;

  select current_opening_date,current_closing_date into v_opening_date,v_closing_date
  from public.get_group_contribution_settings(p_group_id);

  return jsonb_build_object(
    'group_id',p_group_id,
    'monthly_closing_day',p_monthly_closing_day,
    'monthly_grace_days',p_monthly_grace_days,
    'current_opening_date',v_opening_date,
    'current_closing_date',v_closing_date
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.update_group_contribution_settings(p_group_id uuid, p_monthly_closing_day smallint)
 RETURNS group_contribution_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_row public.group_contribution_settings; v_close date; v_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_monthly_closing_day NOT BETWEEN 1 AND 28 THEN RAISE EXCEPTION 'Closing day must be between 1 and 28'; END IF;
  INSERT INTO public.group_contribution_settings(group_id,monthly_closing_day,updated_by)
  VALUES(p_group_id,p_monthly_closing_day,auth.uid())
  ON CONFLICT(group_id) DO UPDATE SET monthly_closing_day=excluded.monthly_closing_day,updated_at=now(),updated_by=auth.uid()
  RETURNING * INTO v_row;

  v_close := CASE WHEN current_date <= make_date(extract(year from current_date)::int,extract(month from current_date)::int,p_monthly_closing_day)
    THEN make_date(extract(year from current_date)::int,extract(month from current_date)::int,p_monthly_closing_day)
    ELSE make_date(extract(year from current_date + interval '1 month')::int,extract(month from current_date + interval '1 month')::int,p_monthly_closing_day) END;
  v_open := (v_close - interval '1 month' + interval '1 day')::date;

  INSERT INTO public.group_contribution_calendar_periods(group_id,opening_date,closing_date,closing_day,status)
  VALUES(p_group_id,v_open,v_close,p_monthly_closing_day,'open')
  ON CONFLICT(group_id,opening_date) DO NOTHING;

  RETURN v_row;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_group_module_settings(p_group_id uuid, p_merry_go_round_enabled boolean, p_loans_enabled boolean)
 RETURNS TABLE(group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid;
  v_old_merry boolean;
  v_old_loans boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only a group Admin can change optional module settings' using errcode = '42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by m.created_at
  limit 1;

  select g.merry_go_round_enabled, g.loans_enabled
    into v_old_merry, v_old_loans
  from public.groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  update public.groups g
  set merry_go_round_enabled = coalesce(p_merry_go_round_enabled, false),
      loans_enabled = coalesce(p_loans_enabled, false)
  where g.id = p_group_id;

  insert into public.group_audit_log (
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor_member_id, 'update_module_settings',
    'group_module_settings', p_group_id::text,
    jsonb_build_object(
      'before', jsonb_build_object(
        'merry_go_round_enabled', v_old_merry,
        'loans_enabled', v_old_loans
      ),
      'after', jsonb_build_object(
        'merry_go_round_enabled', coalesce(p_merry_go_round_enabled, false),
        'loans_enabled', coalesce(p_loans_enabled, false)
      )
    )
  );

  return query
  select g.id, g.merry_go_round_enabled, g.loans_enabled
  from public.groups g where g.id = p_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_group_monthly_contribution_settings(p_group_id uuid, p_monthly_closing_day integer, p_monthly_grace_days integer DEFAULT 0, p_fine_applies boolean DEFAULT false, p_fine_amount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid(); v_owner_user_id uuid; v_role text; v_monthly_type_id uuid;
 v_existing_rule_id uuid; v_existing_fixed_amount numeric; v_existing_grace integer;
 v_effective_from timestamptz; v_new_rule_id uuid; v_fine_amount numeric:=coalesce(p_fine_amount,0);
 v_rule_count integer; v_opening_date date; v_closing_date date;
begin
 if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_group_id is null then raise exception 'GROUP_NOT_FOUND'; end if;
 if p_monthly_closing_day is null or p_monthly_closing_day<1 or p_monthly_closing_day>28 then raise exception 'MONTHLY_CLOSING_DAY_MUST_BE_1_TO_28'; end if;
 if p_monthly_grace_days is null or p_monthly_grace_days<0 or p_monthly_grace_days>27 then raise exception 'MONTHLY_GRACE_DAYS_MUST_BE_0_TO_27'; end if;
 if p_fine_applies and v_fine_amount<=0 then raise exception 'FINE_AMOUNT_REQUIRED'; end if;
 select g.owner_user_id into v_owner_user_id from public.groups g where g.id=p_group_id;
 if not found then raise exception 'GROUP_NOT_FOUND'; end if;
 v_role:=public.current_user_role(p_group_id);
 if v_actor<>v_owner_user_id and coalesce(v_role,'') not in ('admin','chairperson') then raise exception 'MONTHLY_SETTINGS_NOT_AUTHORIZED'; end if;
 perform private.cl_fine_config_lock(p_group_id);
 select ct.id into v_monthly_type_id from public.contribution_types ct where ct.group_id=p_group_id and lower(coalesce(ct.code,''))='monthly' order by ct.id limit 1;
 if v_monthly_type_id is null then raise exception 'MONTHLY_CONTRIBUTION_TYPE_NOT_FOUND'; end if;
 select count(*) into v_rule_count from public.fine_rules r join public.fine_rule_contribution_types rt on rt.rule_id=r.id and rt.contribution_type_id=v_monthly_type_id
 where r.group_id=p_group_id and r.trigger_type='missed_contribution' and r.applicability_mode='SELECTED' and r.status='active' and r.effective_from<=now() and (r.effective_until is null or r.effective_until>=now());
 if v_rule_count>1 then raise exception 'MONTHLY_FINE_RULE_CONFLICT'; end if;
 if v_rule_count=1 then
  select r.id,r.fixed_amount,r.grace_period_value into v_existing_rule_id,v_existing_fixed_amount,v_existing_grace
  from public.fine_rules r join public.fine_rule_contribution_types rt on rt.rule_id=r.id and rt.contribution_type_id=v_monthly_type_id
  where r.group_id=p_group_id and r.trigger_type='missed_contribution' and r.applicability_mode='SELECTED' and r.status='active' and r.effective_from<=now() and (r.effective_until is null or r.effective_until>=now()) for update;
 end if;
 if not p_fine_applies then
  if v_existing_rule_id is not null then
   update public.fine_rules set effective_until=now()-interval '1 microsecond',status='inactive',updated_at=now(),updated_by=v_actor where id=v_existing_rule_id;
  end if;
  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day::smallint);
  update public.group_contribution_settings set monthly_grace_days=p_monthly_grace_days,updated_by=v_actor,updated_at=now() where group_id=p_group_id;
 else
  if v_existing_rule_id is null then
   v_effective_from:=clock_timestamp();
   insert into public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
   values(p_group_id,'Monthly Contribution Fine','Monthly contribution late-payment fine managed by Monthly contribution settings.','missed_contribution',3,100,'FIXED',round(v_fine_amount,2),null,null,null,p_monthly_grace_days,'DAY','SELECTED',v_effective_from,null,'active',v_actor,v_actor) returning id into v_new_rule_id;
   insert into public.fine_rule_contribution_types(rule_id,contribution_type_id) values(v_new_rule_id,v_monthly_type_id);
  elsif round(coalesce(v_existing_fixed_amount,0),2)<>round(v_fine_amount,2) or coalesce(v_existing_grace,-1)<>p_monthly_grace_days then
   v_effective_from:=clock_timestamp();
   update public.fine_rules set effective_until=v_effective_from-interval '1 microsecond',status='inactive',updated_at=now(),updated_by=v_actor where id=v_existing_rule_id;
   insert into public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
   values(p_group_id,'Monthly Contribution Fine','Monthly contribution late-payment fine managed by Monthly contribution settings.','missed_contribution',3,100,'FIXED',round(v_fine_amount,2),null,null,null,p_monthly_grace_days,'DAY','SELECTED',v_effective_from,null,'active',v_actor,v_actor) returning id into v_new_rule_id;
   insert into public.fine_rule_contribution_types(rule_id,contribution_type_id) values(v_new_rule_id,v_monthly_type_id);
  else v_new_rule_id:=v_existing_rule_id;
  end if;
  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day::smallint);
  update public.group_contribution_settings set monthly_grace_days=p_monthly_grace_days,updated_by=v_actor,updated_at=now() where group_id=p_group_id;
 end if;
 select s.current_opening_date,s.current_closing_date into v_opening_date,v_closing_date from public.get_group_contribution_settings(p_group_id) s;
 return jsonb_build_object('ok',true,'group_id',p_group_id,'contribution_type_id',v_monthly_type_id,'monthly_closing_day',p_monthly_closing_day,'monthly_grace_days',p_monthly_grace_days,'fine_applies',p_fine_applies,'fine_amount',case when p_fine_applies then round(v_fine_amount,2) else 0 end,'fine_rule_id',case when p_fine_applies then coalesce(v_new_rule_id,v_existing_rule_id) else null end,'fine_rule_status',case when p_fine_applies then 'active' else 'inactive' end,'current_opening_date',v_opening_date,'current_closing_date',v_closing_date);
end;
$function$


CREATE OR REPLACE FUNCTION public.validate_initiative_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_initiative uuid;
  v_obligation_initiative uuid;
  v_payment_amount numeric;
  v_allocated numeric;
  v_obligation_amount numeric;
  v_obligation_allocated numeric;
BEGIN
  SELECT c.initiative_id, c.amount
    INTO v_payment_initiative, v_payment_amount
  FROM public.contributions c
  WHERE c.id = NEW.payment_id;

  IF v_payment_initiative IS NULL THEN
    RAISE EXCEPTION 'Initiative allocation requires an initiative payment';
  END IF;

  SELECT o.initiative_id, o.amount_due
    INTO v_obligation_initiative, v_obligation_amount
  FROM public.contribution_initiative_obligations o
  WHERE o.id = NEW.initiative_obligation_id;

  IF v_obligation_initiative IS NULL OR v_obligation_initiative <> v_payment_initiative THEN
    RAISE EXCEPTION 'Payment and obligation belong to different initiatives';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contribution_initiative_payment_reversals r
    WHERE r.payment_id = NEW.payment_id
  ) THEN
    RAISE EXCEPTION 'Reversed payment cannot receive an allocation';
  END IF;

  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.payment_id = NEW.payment_id AND a.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT coalesce(sum(a.amount),0) INTO v_obligation_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.initiative_obligation_id = NEW.initiative_obligation_id AND a.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NEW.amount + v_allocated > v_payment_amount THEN
    RAISE EXCEPTION 'Initiative allocation exceeds payment amount';
  END IF;

  IF NEW.amount + v_obligation_allocated > v_obligation_amount THEN
    RAISE EXCEPTION 'Initiative allocation exceeds obligation amount';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_monthly_allocation_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_initiative uuid;
BEGIN
  SELECT c.initiative_id INTO v_initiative FROM public.contributions c WHERE c.id=NEW.payment_id;
  IF v_initiative IS NOT NULL THEN
    RAISE EXCEPTION 'Monthly allocation cannot reference an initiative payment';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_monthly_payment_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.initiative_id IS NOT NULL AND lower(trim(NEW.contribution_type)) = 'monthly' THEN
    RAISE EXCEPTION 'Monthly contribution cannot reference an initiative';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.recorded_by is null then raise exception 'No active member record is linked to this account'; end if;
 if not exists(select 1 from public.members m where m.id=new.recorded_by and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active') then raise exception 'Invalid recorded_by member'; end if;
 return new;
end; $function$


CREATE OR REPLACE FUNCTION public.verify_group_access_code(p_access_code text)
 RETURNS TABLE(group_id uuid, role text, member_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m.group_id, m.role, m.id
  from public.members m
  join public.groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and upper(trim(g.access_code)) = upper(trim(p_access_code))
    and m.status = 'active'
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.verify_group_invite(p_email text, p_access_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_invite public.group_invites%rowtype;
begin
  select * into v_invite
  from public.group_invites
  where lower(email)=lower(trim(p_email))
    and (code_hash = encode(extensions.digest(upper(trim(p_access_code)), 'sha256'), 'hex') or code = upper(trim(p_access_code)))
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Invalid email or one-time access code.');
  end if;
  if not v_invite.active or v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('success', false, 'message', 'This access code has already been used.');
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('success', false, 'message', 'This access code has expired.');
  end if;

  update public.group_invites
  set last_sent_at = now(), updated_at = now(), attempts = coalesce(attempts,0) + 1
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'invite_id', v_invite.id, 'group_id', v_invite.group_id, 'email', lower(v_invite.email), 'role', v_invite.role);
end;
$function$



CREATE OR REPLACE FUNCTION public.verify_member_payment_evidence(p_evidence_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_evidence public.member_payment_evidence%rowtype;
    v_verifier public.members%rowtype;
    v_contribution jsonb;
    v_reason text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_evidence_id IS NULL THEN
        RAISE EXCEPTION 'Evidence id is required';
    END IF;

    IF p_decision NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be verified or rejected';
    END IF;

    v_reason := nullif(btrim(p_rejection_reason), '');

    IF p_decision = 'rejected' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    IF p_decision = 'verified' AND v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Rejection reason is only valid for rejected evidence';
    END IF;

    SELECT e.*
    INTO v_evidence
    FROM public.member_payment_evidence e
    WHERE e.id = p_evidence_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment evidence % not found', p_evidence_id;
    END IF;

    IF v_evidence.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'evidence_id', v_evidence.id,
            'status', v_evidence.status,
            'contribution_id', v_evidence.contribution_id,
            'verified_by', v_evidence.verified_by,
            'verified_at', v_evidence.verified_at,
            'rejection_reason', v_evidence.rejection_reason
        );
    END IF;

    SELECT m.*
    INTO v_verifier
    FROM public.members m
    WHERE m.group_id = v_evidence.group_id
      AND m.status = 'active'
      AND m.onboarding_status = 'active'
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
      )
    ORDER BY
        CASE
            WHEN m.auth_user_id = auth.uid() THEN 0
            ELSE 1
        END,
        m.id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active group verifier identity required';
    END IF;

    IF NOT public.cl_user_has_role(
        v_evidence.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Payment verification authorization required';
    END IF;

    IF v_evidence.group_id IS NULL
       OR v_evidence.member_id IS NULL
       OR v_evidence.amount IS NULL
       OR v_evidence.amount <= 0
       OR v_evidence.payment_date IS NULL
       OR v_evidence.evidence_text IS NULL
       OR btrim(v_evidence.evidence_text) = ''
    THEN
        RAISE EXCEPTION 'Payment evidence integrity check failed';
    END IF;

    IF v_evidence.payment_method = 'M-Pesa'
       AND (
           v_evidence.mpesa_reference IS NULL
           OR btrim(v_evidence.mpesa_reference) = ''
       )
    THEN
        RAISE EXCEPTION 'M-Pesa reference is required';
    END IF;

    IF p_decision = 'rejected' THEN
        UPDATE public.member_payment_evidence
        SET status = 'rejected',
            verified_by = v_verifier.id,
            verified_at = now(),
            rejection_reason = v_reason,
            updated_at = now()
        WHERE id = v_evidence.id;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', false,
            'evidence_id', v_evidence.id,
            'status', 'rejected',
            'contribution_id', NULL,
            'verified_by', v_verifier.id,
            'verified_at', now(),
            'rejection_reason', v_reason
        );
    END IF;

    v_contribution := public.cl_2b_record_contribution(
        v_evidence.id,
        v_evidence.group_id,
        v_evidence.member_id,
        v_evidence.amount,
        v_evidence.payment_date,
        'monthly',
        v_evidence.payment_method,
        v_evidence.mpesa_reference,
        v_evidence.mpesa_reference,
        NULL,
        v_evidence.evidence_text
    );

    UPDATE public.member_payment_evidence
    SET status = 'verified',
        contribution_id = v_evidence.id,
        verified_by = v_verifier.id,
        verified_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = v_evidence.id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'evidence_id', v_evidence.id,
        'status', 'verified',
        'contribution_id', v_evidence.id,
        'verified_by', v_verifier.id,
        'verified_at', now(),
        'contribution', v_contribution
    );
END;
$function$

SET LOCAL check_function_bodies = on;

-- 5. Views, preserving security_invoker options.
CREATE OR REPLACE VIEW public.group_balances WITH (security_invoker = true) AS
 SELECT id AS group_id,
    opening_balance + COALESCE(( SELECT sum(c.amount) AS sum
           FROM contributions c
          WHERE c.group_id = g.id), 0::numeric) - COALESCE(( SELECT sum(e.amount) AS sum
           FROM expenses e
          WHERE e.group_id = g.id AND e.approval_status = 'approved'::text), 0::numeric) AS current_balance
   FROM groups g;;

CREATE OR REPLACE VIEW public.subscription_credit_balances WITH (security_invoker = true) AS
 SELECT c.id AS credit_id,
    c.source_payment_id,
    c.original_amount,
    c.status,
    c.created_at,
    c.reversed_at,
        CASE
            WHEN c.status = 'reversed'::text THEN 0::numeric
            ELSE GREATEST(c.original_amount - COALESCE(sum(
            CASE
                WHEN a.status = 'active'::text THEN a.amount
                ELSE 0::numeric
            END), 0::numeric), 0::numeric)
        END AS remaining_amount
   FROM subscription_credits c
     LEFT JOIN subscription_payment_allocations a ON a.credit_id = c.id
  GROUP BY c.id;;

-- 6. Triggers (all 45 were enabled in production).
CREATE TRIGGER trg_other_payment_request_guard BEFORE UPDATE ON private.other_contribution_payment_requests FOR EACH ROW EXECUTE FUNCTION private.cl_other_payment_request_guard();
CREATE TRIGGER charge_payments_guard_immutable BEFORE DELETE OR UPDATE ON charge_payments FOR EACH ROW EXECUTE FUNCTION charge_payments_guard_immutable();
CREATE TRIGGER trg_cl_guard_contribution_allocation BEFORE INSERT OR UPDATE ON contribution_allocations FOR EACH ROW EXECUTE FUNCTION cl_guard_contribution_allocation();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON contribution_goals FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER contribution_goals_updated_at BEFORE UPDATE ON contribution_goals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_initiative_payment_allocation BEFORE INSERT OR UPDATE ON contribution_initiative_allocations FOR EACH ROW EXECUTE FUNCTION validate_initiative_payment_allocation();
CREATE TRIGGER trg_cl_other_obligation_lineage BEFORE INSERT OR UPDATE OF group_id, member_id, contribution_type_id, obligation_month, economic_month, rule_id, period_id, component_kind, parent_obligation_id ON contribution_obligations FOR EACH ROW EXECUTE FUNCTION private.cl_other_obligation_lineage();
CREATE TRIGGER trg_cl_other_period_immutable BEFORE UPDATE ON contribution_periods FOR EACH ROW EXECUTE FUNCTION private.cl_other_period_immutable();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON contributions FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER contributions_set_recorded_by BEFORE INSERT OR UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION set_recorded_by_from_auth();
CREATE TRIGGER contributions_validate_recorded_by BEFORE INSERT OR UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION validate_recorded_by();
CREATE TRIGGER trg_cl_guard_open_financial_period BEFORE INSERT OR DELETE OR UPDATE ON contributions FOR EACH ROW EXECUTE FUNCTION cl_guard_open_financial_period();
CREATE TRIGGER trg_normalize_contribution_recorded_by BEFORE INSERT OR UPDATE OF recorded_by, group_id ON contributions FOR EACH ROW EXECUTE FUNCTION normalize_contribution_recorded_by();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER expenses_set_recorded_by BEFORE INSERT OR UPDATE OF recorded_by, group_id ON expenses FOR EACH ROW EXECUTE FUNCTION set_recorded_by_from_auth();
CREATE TRIGGER expenses_validate_recorded_by BEFORE INSERT OR UPDATE OF recorded_by, group_id ON expenses FOR EACH ROW EXECUTE FUNCTION validate_recorded_by();
CREATE TRIGGER guard_expense_approval_status_trigger BEFORE INSERT OR UPDATE OF approval_status ON expenses FOR EACH ROW EXECUTE FUNCTION guard_expense_approval_status();
CREATE TRIGGER prevent_closed_month_expense_trigger BEFORE INSERT OR DELETE OR UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION prevent_closed_month_expense();
CREATE TRIGGER trg_resolve_expense_recorded_by BEFORE INSERT OR UPDATE OF recorded_by, group_id ON expenses FOR EACH ROW EXECUTE FUNCTION resolve_expense_recorded_by();
CREATE TRIGGER financial_charges_guard_identity BEFORE UPDATE ON financial_charges FOR EACH ROW EXECUTE FUNCTION financial_charges_guard_identity();
CREATE TRIGGER financial_charges_guard_obligation_contract BEFORE INSERT OR UPDATE OF group_id, member_id, obligation_id, accounting_month ON financial_charges FOR EACH ROW EXECUTE FUNCTION financial_charges_guard_obligation_contract();
CREATE TRIGGER financial_charges_guard_status BEFORE INSERT OR UPDATE ON financial_charges FOR EACH ROW EXECUTE FUNCTION financial_charges_guard_status();
CREATE TRIGGER financial_charges_normalize_type BEFORE INSERT OR UPDATE OF charge_type ON financial_charges FOR EACH ROW EXECUTE FUNCTION financial_charges_normalize_type();
CREATE TRIGGER financial_charges_set_updated_at BEFORE UPDATE ON financial_charges FOR EACH ROW EXECUTE FUNCTION financial_charges_set_updated_at();
CREATE TRIGGER trg_group_activities_updated_at BEFORE UPDATE ON group_activities FOR EACH ROW EXECUTE FUNCTION cl_group_activities_set_updated_at();
CREATE TRIGGER trg_group_activities_validate BEFORE INSERT OR UPDATE ON group_activities FOR EACH ROW EXECUTE FUNCTION cl_validate_group_activity();
CREATE TRIGGER trg_group_assets_updated_at BEFORE UPDATE ON group_assets FOR EACH ROW EXECUTE FUNCTION cl_group_assets_set_updated_at();
CREATE TRIGGER trg_group_assets_validate BEFORE INSERT OR UPDATE ON group_assets FOR EACH ROW EXECUTE FUNCTION cl_validate_group_asset();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON group_invites FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER trg_group_milestones_updated_at BEFORE UPDATE ON group_milestones FOR EACH ROW EXECUTE FUNCTION cl_group_milestones_set_updated_at();
CREATE TRIGGER trg_group_milestones_validate BEFORE INSERT OR UPDATE ON group_milestones FOR EACH ROW EXECUTE FUNCTION cl_validate_group_milestone();
CREATE TRIGGER trg_group_plans_updated_at BEFORE UPDATE ON group_plans FOR EACH ROW EXECUTE FUNCTION cl_group_plans_set_updated_at();
CREATE TRIGGER trg_group_plans_validate BEFORE INSERT OR UPDATE ON group_plans FOR EACH ROW EXECUTE FUNCTION cl_validate_group_plan();
CREATE TRIGGER trg_group_support_cases_updated_at BEFORE UPDATE ON group_support_cases FOR EACH ROW EXECUTE FUNCTION cl_group_support_cases_set_updated_at();
CREATE TRIGGER trg_group_support_cases_validate BEFORE INSERT OR UPDATE ON group_support_cases FOR EACH ROW EXECUTE FUNCTION cl_validate_group_support_case();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON groups FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER loan_application_notifications AFTER INSERT OR UPDATE OF status ON loan_applications FOR EACH ROW EXECUTE FUNCTION cl_loan_notify_application_change();
CREATE TRIGGER loan_disbursement_requires_three_approvals BEFORE UPDATE OF status ON loan_applications FOR EACH ROW EXECUTE FUNCTION cl_loan_guard_disbursement_approvals();
CREATE TRIGGER loan_approval_requires_declared_office BEFORE INSERT ON loan_approvals FOR EACH ROW EXECUTE FUNCTION cl_loan_guard_approval_office();
CREATE TRIGGER loan_repayment_notifications AFTER INSERT ON loan_repayments FOR EACH ROW EXECUTE FUNCTION cl_loan_notify_repayment();
CREATE TRIGGER loan_repayment_recorder_role_guard BEFORE INSERT ON loan_repayments FOR EACH ROW EXECUTE FUNCTION cl_loan_guard_repayment_recorder();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON meetings FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER audit_delete_trigger BEFORE DELETE ON members FOR EACH ROW EXECUTE FUNCTION log_deleted_row();
CREATE TRIGGER trg_enforce_member_position_snapshot BEFORE UPDATE OF actual_position, actual_position_name ON members FOR EACH ROW EXECUTE FUNCTION enforce_member_position_snapshot();
CREATE TRIGGER trg_sync_membership_number BEFORE INSERT OR UPDATE OF member_number, membership_number ON members FOR EACH ROW EXECUTE FUNCTION sync_membership_number();

-- 7. Restore RLS enabled/forced flags, then production policies.
ALTER TABLE private.contribution_initiative_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.custom_contribution_activation_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.custom_contribution_payment_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.custom_contribution_period_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.custom_contribution_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.member_historical_onboarding_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.member_historical_payment_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.other_contribution_cycle_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.other_contribution_cycle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.other_contribution_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.renewal_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE private.renewal_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_deleted_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_credit_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_member_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiative_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_charges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_rule_contribution_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fine_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_contribution_calendar_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_contribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_contribution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_position_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merry_go_round_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merry_go_round_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merry_go_round_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merry_go_round_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merry_go_round_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_member_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read announcements of my group" ON public.announcements AS PERMISSIVE FOR SELECT TO PUBLIC USING ((group_id IN ( SELECT members.group_id
   FROM members
  WHERE (members.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "secretary/admin post announcements" ON public.announcements AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((my_role(group_id) = ANY (ARRAY['secretary'::text, 'admin'::text])));
CREATE POLICY "read attendance of my group" ON public.attendance AS PERMISSIVE FOR SELECT TO PUBLIC USING ((meeting_id IN ( SELECT meetings.id
   FROM meetings
  WHERE (meetings.group_id IN ( SELECT members.group_id
           FROM members
          WHERE (members.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "secretary/admin record attendance" ON public.attendance AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((( SELECT meetings.group_id
   FROM meetings
  WHERE (meetings.id = attendance.meeting_id)) IN ( SELECT members.group_id
   FROM members
  WHERE ((members.user_id = ( SELECT auth.uid() AS uid)) AND (members.role = ANY (ARRAY['secretary'::text, 'admin'::text]))))));
CREATE POLICY "secretary/admin update attendance" ON public.attendance AS PERMISSIVE FOR UPDATE TO authenticated USING ((meeting_id IN ( SELECT meetings.id
   FROM meetings
  WHERE (meetings.group_id IN ( SELECT members.group_id
           FROM members
          WHERE ((members.user_id = ( SELECT auth.uid() AS uid)) AND (members.role = ANY (ARRAY['secretary'::text, 'admin'::text])))))))) WITH CHECK ((meeting_id IN ( SELECT meetings.id
   FROM meetings
  WHERE (meetings.group_id IN ( SELECT members.group_id
           FROM members
          WHERE ((members.user_id = ( SELECT auth.uid() AS uid)) AND (members.role = ANY (ARRAY['secretary'::text, 'admin'::text]))))))));
CREATE POLICY audit_deleted_rows_select ON public.audit_deleted_rows AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((deleted_row ->> 'group_id'::text) IS NOT NULL) AND cl_user_has_role(((deleted_row ->> 'group_id'::text))::uuid, ARRAY['admin'::text])));
CREATE POLICY contribution_allocations_select_group ON public.contribution_allocations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contribution_obligations o
  WHERE ((o.id = contribution_allocations.obligation_id) AND cl_user_in_group(o.group_id)))));
CREATE POLICY "admin or secretary creates goals" ON public.contribution_goals AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((my_role(group_id) = ANY (ARRAY['admin'::text, 'secretary'::text])));
CREATE POLICY "admin or secretary updates goals" ON public.contribution_goals AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((my_role(group_id) = ANY (ARRAY['admin'::text, 'secretary'::text])));
CREATE POLICY "read goals of my group" ON public.contribution_goals AS PERMISSIVE FOR SELECT TO PUBLIC USING ((group_id IN ( SELECT members.group_id
   FROM members
  WHERE (members.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY contribution_initiative_credit_consumptions_select ON public.contribution_initiative_credit_consumptions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (((contribution_initiative_credits c
     JOIN contribution_initiative_allocations a ON ((a.id = contribution_initiative_credit_consumptions.allocation_id)))
     JOIN contribution_initiative_obligations o ON ((o.id = a.initiative_obligation_id)))
     JOIN contribution_initiatives i ON ((i.id = o.initiative_id)))
  WHERE ((c.id = contribution_initiative_credit_consumptions.credit_id) AND cl_user_in_group(i.group_id)))));
CREATE POLICY contribution_initiative_credits_select ON public.contribution_initiative_credits AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contribution_initiatives i
  WHERE ((i.id = contribution_initiative_credits.initiative_id) AND cl_user_in_group(i.group_id)))));
CREATE POLICY contribution_initiative_member_terms_select ON public.contribution_initiative_member_terms AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (contribution_initiative_members im
     JOIN contribution_initiatives i ON ((i.id = im.initiative_id)))
  WHERE ((im.id = contribution_initiative_member_terms.initiative_member_id) AND cl_user_in_group(i.group_id)))));
CREATE POLICY contribution_initiative_periods_select ON public.contribution_initiative_periods AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM contribution_initiatives i
  WHERE ((i.id = contribution_initiative_periods.initiative_id) AND cl_user_in_group(i.group_id)))));
CREATE POLICY contribution_initiatives_select_group ON public.contribution_initiatives AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY contribution_obligations_select_group ON public.contribution_obligations AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY contribution_periods_select_group ON public.contribution_periods AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY contribution_types_delete_admin ON public.contribution_types AS PERMISSIVE FOR DELETE TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]));
CREATE POLICY contribution_types_insert_admin ON public.contribution_types AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND ((created_by IS NULL) OR (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = contribution_types.created_by) AND (m.group_id = contribution_types.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, 'active'::text)) = 'active'::text)))))));
CREATE POLICY contribution_types_select_group ON public.contribution_types AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = contribution_types.group_id) AND (COALESCE(m.auth_user_id, m.user_id) = ( SELECT auth.uid() AS uid))))));
CREATE POLICY contribution_types_update_admin ON public.contribution_types AS PERMISSIVE FOR UPDATE TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text])) WITH CHECK (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]));
CREATE POLICY contributions_delete_treasurer_admin ON public.contributions AS PERMISSIVE FOR DELETE TO authenticated USING ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = contributions.group_id) AND (fp.month = contributions.month) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY contributions_insert_finance_role ON public.contributions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = contributions.group_id) AND (fp.month = contributions.month) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY contributions_select_same_group ON public.contributions AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY contributions_update_finance_role ON public.contributions AS PERMISSIVE FOR UPDATE TO authenticated USING ((cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = contributions.group_id) AND (fp.month = contributions.month) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text))))))) WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = contributions.group_id) AND (fp.month = contributions.month) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY data_import_batches_delete_admin ON public.data_import_batches AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(data_import_batches.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY data_import_batches_insert_authorized ON public.data_import_batches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(data_import_batches.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY data_import_batches_select_authorized ON public.data_import_batches AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_has_role(data_import_batches.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY data_import_batches_update_authorized ON public.data_import_batches AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(data_import_batches.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(data_import_batches.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY data_import_mappings_delete_admin ON public.data_import_mappings AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_mappings.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_mappings_insert_authorized ON public.data_import_mappings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_mappings.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_mappings_select_authorized ON public.data_import_mappings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_mappings.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_mappings_update_authorized ON public.data_import_mappings AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_mappings.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_mappings.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_rows_delete_admin ON public.data_import_rows AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_rows.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_rows_insert_authorized ON public.data_import_rows AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_rows.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_rows_select_authorized ON public.data_import_rows AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_rows.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY data_import_rows_update_authorized ON public.data_import_rows AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_rows.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM data_import_batches b
  WHERE ((b.id = data_import_rows.batch_id) AND ( SELECT cl_user_has_role(b.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)))));
CREATE POLICY "read documents of my group" ON public.documents AS PERMISSIVE FOR SELECT TO PUBLIC USING ((group_id IN ( SELECT members.group_id
   FROM members
  WHERE (members.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "secretary/admin upload documents" ON public.documents AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((my_role(group_id) = ANY (ARRAY['secretary'::text, 'admin'::text])));
CREATE POLICY expense_approvals_select_same_group ON public.expense_approvals AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = expense_approvals.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, ''::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, ''::text)) = 'active'::text)))));
CREATE POLICY expenses_delete_treasurer_admin ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = expenses.group_id) AND (fp.month = to_char((expenses.date)::timestamp with time zone, 'YYYY-MM'::text)) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY expenses_insert_finance_role ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AND (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = expenses.group_id) AND (fp.month = to_char((expenses.date)::timestamp with time zone, 'YYYY-MM'::text)) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY expenses_select_same_group ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY expenses_update_finance_role ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = expenses.group_id) AND (fp.month = to_char((expenses.date)::timestamp with time zone, 'YYYY-MM'::text)) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text))))))) WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])) AND (NOT (EXISTS ( SELECT 1
   FROM financial_periods fp
  WHERE ((fp.group_id = expenses.group_id) AND (fp.month = to_char((expenses.date)::timestamp with time zone, 'YYYY-MM'::text)) AND (lower(COALESCE(fp.status, 'open'::text)) = 'closed'::text)))))));
CREATE POLICY "members can submit feedback" ON public.feedback AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((group_id IN ( SELECT members.group_id
   FROM members
  WHERE (members.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "secretary/admin read feedback" ON public.feedback AS PERMISSIVE FOR SELECT TO PUBLIC USING ((my_role(group_id) = ANY (ARRAY['secretary'::text, 'admin'::text])));
CREATE POLICY financial_periods_insert_treasurer_admin ON public.financial_periods AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]));
CREATE POLICY financial_periods_select_same_group ON public.financial_periods AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY financial_periods_update_treasurer_admin ON public.financial_periods AS PERMISSIVE FOR UPDATE TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text])) WITH CHECK (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]));
CREATE POLICY fine_adjustments_member_or_officer_read ON public.fine_adjustments AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM fines f
  WHERE ((f.id = fine_adjustments.fine_id) AND (cl_user_has_role(f.group_id, ARRAY['chairperson'::text, 'treasurer'::text]) OR (EXISTS ( SELECT 1
           FROM members m
          WHERE ((m.id = f.member_id) AND (m.group_id = f.group_id) AND ((m.auth_user_id = auth.uid()) OR (m.user_id = auth.uid()))))))))));
CREATE POLICY fine_payment_allocations_member_or_officer_read ON public.fine_payment_allocations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM fines f
  WHERE ((f.id = fine_payment_allocations.fine_id) AND (cl_user_has_role(f.group_id, ARRAY['chairperson'::text, 'treasurer'::text]) OR (EXISTS ( SELECT 1
           FROM members m
          WHERE ((m.id = f.member_id) AND (m.group_id = f.group_id) AND ((m.auth_user_id = auth.uid()) OR (m.user_id = auth.uid()))))))))));
CREATE POLICY fine_rule_contribution_types_group_read ON public.fine_rule_contribution_types AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM fine_rules r
  WHERE ((r.id = fine_rule_contribution_types.rule_id) AND cl_user_has_role(r.group_id, ARRAY['chairperson'::text, 'treasurer'::text])))));
CREATE POLICY fine_rules_group_read ON public.fine_rules AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_has_role(group_id, ARRAY['chairperson'::text, 'treasurer'::text]));
CREATE POLICY fine_waivers_member_or_officer_read ON public.fine_waivers AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM fines f
  WHERE ((f.id = fine_waivers.fine_id) AND (cl_user_has_role(f.group_id, ARRAY['chairperson'::text, 'treasurer'::text]) OR (EXISTS ( SELECT 1
           FROM members m
          WHERE ((m.id = f.member_id) AND (m.group_id = f.group_id) AND ((m.auth_user_id = auth.uid()) OR (m.user_id = auth.uid()))))))))));
CREATE POLICY fines_member_or_officer_read ON public.fines AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_user_has_role(group_id, ARRAY['chairperson'::text, 'treasurer'::text]) OR (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = fines.member_id) AND (m.group_id = fines.group_id) AND ((m.auth_user_id = auth.uid()) OR (m.user_id = auth.uid())))))));
CREATE POLICY group_activities_delete_admin ON public.group_activities AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(group_activities.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY group_activities_insert_management ON public.group_activities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(group_activities.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY group_activities_select_group ON public.group_activities AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(group_activities.group_id) AS cl_user_in_group));
CREATE POLICY group_activities_update_management ON public.group_activities AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(group_activities.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(group_activities.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY "Applicants can create their own application" ON public.group_applications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = auth_user_id));
CREATE POLICY "Applicants can view their own application" ON public.group_applications AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = auth_user_id));
CREATE POLICY group_assets_delete_admin ON public.group_assets AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(group_assets.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY group_assets_insert_management ON public.group_assets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(group_assets.group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY group_assets_select_group ON public.group_assets AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(group_assets.group_id) AS cl_user_in_group));
CREATE POLICY group_assets_update_management ON public.group_assets AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(group_assets.group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(group_assets.group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY group_audit_log_official_read ON public.group_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text, 'secretary'::text]));
CREATE POLICY invites_insert_admin ON public.group_invites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text])));
CREATE POLICY invites_select_admin ON public.group_invites AS PERMISSIVE FOR SELECT TO authenticated USING ((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text])));
CREATE POLICY invites_update_admin ON public.group_invites AS PERMISSIVE FOR UPDATE TO authenticated USING ((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text]))) WITH CHECK ((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text])));
CREATE POLICY group_milestones_delete_admin ON public.group_milestones AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(group_milestones.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY group_milestones_insert_management ON public.group_milestones AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(group_milestones.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY group_milestones_select_group ON public.group_milestones AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(group_milestones.group_id) AS cl_user_in_group));
CREATE POLICY group_milestones_update_management ON public.group_milestones AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(group_milestones.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(group_milestones.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY group_plans_delete_admin ON public.group_plans AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(group_plans.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY group_plans_insert_management ON public.group_plans AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(group_plans.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY group_plans_select_group ON public.group_plans AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(group_plans.group_id) AS cl_user_in_group));
CREATE POLICY group_plans_update_management ON public.group_plans AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(group_plans.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(group_plans.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text]) AS cl_user_has_role));
CREATE POLICY group_subscriptions_group_select ON public.group_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(group_subscriptions.group_id) AS cl_user_in_group));
CREATE POLICY group_support_cases_delete_admin ON public.group_support_cases AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT cl_user_has_role(group_support_cases.group_id, ARRAY['admin'::text]) AS cl_user_has_role));
CREATE POLICY group_support_cases_insert_management ON public.group_support_cases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT cl_user_has_role(group_support_cases.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY group_support_cases_select_management ON public.group_support_cases AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_has_role(group_support_cases.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY group_support_cases_update_management ON public.group_support_cases AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT cl_user_has_role(group_support_cases.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role)) WITH CHECK (( SELECT cl_user_has_role(group_support_cases.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) AS cl_user_has_role));
CREATE POLICY groups_delete ON public.groups AS PERMISSIVE FOR DELETE TO authenticated USING (cl_user_has_role(id, ARRAY['admin'::text]));
CREATE POLICY groups_select ON public.groups AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(id));
CREATE POLICY groups_update ON public.groups AS PERMISSIVE FOR UPDATE TO authenticated USING (cl_user_has_role(id, ARRAY['admin'::text])) WITH CHECK (cl_user_has_role(id, ARRAY['admin'::text]));
CREATE POLICY loan_applications_read_member_or_official ON public.loan_applications AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND ((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = loan_applications.member_id) AND (m.group_id = loan_applications.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]))));
CREATE POLICY loan_approvals_select_same_group ON public.loan_approvals AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND (EXISTS ( SELECT 1
   FROM members active_member
  WHERE ((active_member.group_id = loan_approvals.group_id) AND ((active_member.user_id = auth.uid()) OR (active_member.auth_user_id = auth.uid())) AND (lower(COALESCE(active_member.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(active_member.onboarding_status, 'active'::text)) = 'active'::text)))) AND (cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]) OR (EXISTS ( SELECT 1
   FROM (loan_applications own_loan
     JOIN members loan_owner ON (((loan_owner.id = own_loan.member_id) AND (loan_owner.group_id = own_loan.group_id))))
  WHERE ((own_loan.id = loan_approvals.loan_id) AND (own_loan.group_id = loan_approvals.group_id) AND ((loan_owner.user_id = auth.uid()) OR (loan_owner.auth_user_id = auth.uid()))))))));
CREATE POLICY loan_notifications_mark_own_read ON public.loan_notifications AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = loan_notifications.recipient_member_id) AND (m.group_id = loan_notifications.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, 'active'::text)) = 'active'::text)))) AND cl_group_module_enabled(group_id, 'loans'::text))) WITH CHECK (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = loan_notifications.recipient_member_id) AND (m.group_id = loan_notifications.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, 'active'::text)) = 'active'::text)))) AND cl_group_module_enabled(group_id, 'loans'::text) AND (read_at IS NOT NULL)));
CREATE POLICY loan_notifications_read_own ON public.loan_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = loan_notifications.recipient_member_id) AND (m.group_id = loan_notifications.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, 'active'::text)) = 'active'::text)))) AND cl_group_module_enabled(group_id, 'loans'::text)));
CREATE POLICY loan_allocations_read_member_or_official ON public.loan_repayment_allocations AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND (EXISTS ( SELECT 1
   FROM loan_applications l
  WHERE ((l.id = loan_repayment_allocations.loan_id) AND (l.group_id = loan_repayment_allocations.group_id) AND ((l.member_id IN ( SELECT m.id
           FROM members m
          WHERE ((m.group_id = l.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(l.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text])))))));
CREATE POLICY loan_schedule_read_member_or_official ON public.loan_repayment_schedule AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND (EXISTS ( SELECT 1
   FROM loan_applications l
  WHERE ((l.id = loan_repayment_schedule.loan_id) AND (l.group_id = loan_repayment_schedule.group_id) AND ((l.member_id IN ( SELECT m.id
           FROM members m
          WHERE ((m.group_id = l.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(l.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text])))))));
CREATE POLICY loan_repayments_read_member_or_official ON public.loan_repayments AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND (EXISTS ( SELECT 1
   FROM loan_applications l
  WHERE ((l.id = loan_repayments.loan_id) AND (l.group_id = loan_repayments.group_id) AND ((l.member_id IN ( SELECT m.id
           FROM members m
          WHERE ((m.group_id = l.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(l.group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text])))))));
CREATE POLICY loan_settings_read_member ON public.loan_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((cl_group_module_enabled(group_id, 'loans'::text) AND (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = loan_settings.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (lower(COALESCE(m.status, 'active'::text)) = 'active'::text) AND (lower(COALESCE(m.onboarding_status, 'active'::text)) = 'active'::text))))));
CREATE POLICY meetings_delete_group ON public.meetings AS PERMISSIVE FOR DELETE TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text]));
CREATE POLICY meetings_insert_group ON public.meetings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (cl_user_has_role(group_id, ARRAY['secretary'::text, 'admin'::text, 'chairperson'::text]));
CREATE POLICY meetings_select_group ON public.meetings AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY meetings_update_group ON public.meetings AS PERMISSIVE FOR UPDATE TO authenticated USING (cl_user_has_role(group_id, ARRAY['secretary'::text, 'admin'::text])) WITH CHECK (cl_user_has_role(group_id, ARRAY['secretary'::text, 'admin'::text]));
CREATE POLICY member_contribution_rules_select_group_officers ON public.member_contribution_rules AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text]));
CREATE POLICY member_payment_evidence_insert_own_pending ON public.member_payment_evidence AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (contribution_id IS NULL) AND (verified_by IS NULL) AND (verified_at IS NULL) AND (rejection_reason IS NULL) AND (EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = member_payment_evidence.member_id) AND (m.group_id = member_payment_evidence.group_id) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text) AND ((m.user_id = ( SELECT auth.uid() AS uid)) OR (m.auth_user_id = ( SELECT auth.uid() AS uid))))))));
CREATE POLICY member_payment_evidence_select_own ON public.member_payment_evidence AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.id = member_payment_evidence.member_id) AND (m.group_id = member_payment_evidence.group_id) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text) AND ((m.user_id = ( SELECT auth.uid() AS uid)) OR (m.auth_user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY member_payment_evidence_select_pending_verifiers ON public.member_payment_evidence AS PERMISSIVE FOR SELECT TO authenticated USING (((status = 'pending'::text) AND cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'secretary'::text, 'treasurer'::text])));
CREATE POLICY member_position_history_select ON public.member_position_history AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY members_delete_admin_chairperson ON public.members AS PERMISSIVE FOR DELETE TO authenticated USING (((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text])) AND (auth_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid)) AND (user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))));
CREATE POLICY members_insert_admin_chairperson ON public.members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((current_user_role(group_id) = ANY (ARRAY['admin'::text, 'chairperson'::text])) AND (onboarding_status = ANY (ARRAY['pending'::text, 'active'::text])) AND (role = ANY (ARRAY['chairperson'::text, 'admin'::text, 'treasurer'::text, 'secretary'::text, 'member'::text])) AND (group_id IS NOT NULL)));
CREATE POLICY members_select_own_or_group ON public.members AS PERMISSIVE FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid)) OR cl_user_in_group(group_id)));
CREATE POLICY members_update_admin_chairperson ON public.members AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_members(group_id)) WITH CHECK ((can_manage_members(group_id) AND (role = ANY (ARRAY['chairperson'::text, 'admin'::text, 'treasurer'::text, 'secretary'::text, 'member'::text])) AND (onboarding_status = ANY (ARRAY['pending'::text, 'invited'::text, 'active'::text]))));
CREATE POLICY merry_cycles_read ON public.merry_go_round_cycles AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = merry_go_round_cycles.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = merry_go_round_cycles.group_id) AND g.merry_go_round_enabled)))));
CREATE POLICY merry_notifications_read ON public.merry_go_round_notifications AS PERMISSIVE FOR SELECT TO authenticated USING (((member_id IN ( SELECT m.id
   FROM members m
  WHERE ((m.group_id = merry_go_round_notifications.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = merry_go_round_notifications.group_id) AND g.merry_go_round_enabled)))));
CREATE POLICY merry_payments_read ON public.merry_go_round_payments AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = merry_go_round_payments.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = merry_go_round_payments.group_id) AND g.merry_go_round_enabled))) AND ((member_id IN ( SELECT m.id
   FROM members m
  WHERE ((m.group_id = merry_go_round_payments.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text, 'secretary'::text]))));
CREATE POLICY merry_preferences_read ON public.merry_go_round_preferences AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = merry_go_round_preferences.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = merry_go_round_preferences.group_id) AND g.merry_go_round_enabled))) AND ((member_id IN ( SELECT m.id
   FROM members m
  WHERE ((m.group_id = merry_go_round_preferences.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid()))))) OR cl_user_has_role(group_id, ARRAY['admin'::text, 'chairperson'::text, 'treasurer'::text, 'secretary'::text]))));
CREATE POLICY merry_rounds_read ON public.merry_go_round_rounds AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM members m
  WHERE ((m.group_id = merry_go_round_rounds.group_id) AND ((m.user_id = auth.uid()) OR (m.auth_user_id = auth.uid())) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = merry_go_round_rounds.group_id) AND g.merry_go_round_enabled)))));
CREATE POLICY monthly_closings_insert_treasurer_admin ON public.monthly_closings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (closed_by = ( SELECT auth.uid() AS uid)) AND (closing_month = (date_trunc('month'::text, (closing_month)::timestamp with time zone))::date) AND (total_expected >= (0)::numeric) AND (total_collected >= (0)::numeric) AND (total_expenses >= (0)::numeric)));
CREATE POLICY monthly_closings_select_same_group ON public.monthly_closings AS PERMISSIVE FOR SELECT TO authenticated USING (cl_user_in_group(group_id));
CREATE POLICY monthly_closings_update_treasurer_admin ON public.monthly_closings AS PERMISSIVE FOR UPDATE TO authenticated USING (cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text])) WITH CHECK ((cl_user_has_role(group_id, ARRAY['admin'::text, 'treasurer'::text]) AND (closed_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY platform_activity_platform_admin_select ON public.platform_activity AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY subscription_credits_select_policy ON public.subscription_credits AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM (members m
     JOIN subscription_payments sp ON ((sp.id = subscription_credits.source_payment_id)))
  WHERE ((m.auth_user_id = auth.uid()) AND (m.group_id = sp.group_id) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text))))));
CREATE POLICY subscription_cycles_group_select ON public.subscription_cycles AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM group_subscriptions s
  WHERE ((s.id = subscription_cycles.subscription_id) AND ( SELECT cl_user_in_group(s.group_id) AS cl_user_in_group)))));
CREATE POLICY subscription_invoice_lines_group_select ON public.subscription_invoice_lines AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(subscription_invoice_lines.group_id) AS cl_user_in_group));
CREATE POLICY subscription_invoices_group_select ON public.subscription_invoices AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(subscription_invoices.group_id) AS cl_user_in_group));
CREATE POLICY subscription_member_billing_group_select ON public.subscription_member_billing AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(subscription_member_billing.group_id) AS cl_user_in_group));
CREATE POLICY subscription_payment_allocations_select_policy ON public.subscription_payment_allocations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM (members m
     JOIN subscription_invoices si ON ((si.id = subscription_payment_allocations.invoice_id)))
  WHERE ((m.auth_user_id = auth.uid()) AND (m.group_id = si.group_id) AND (m.status = 'active'::text) AND (m.onboarding_status = 'active'::text))))));
CREATE POLICY subscription_payments_group_select ON public.subscription_payments AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT cl_user_in_group(subscription_payments.group_id) AS cl_user_in_group));
CREATE POLICY subscription_pricing_authenticated_select ON public.subscription_pricing_tiers AS PERMISSIVE FOR SELECT TO authenticated USING ((active = true));

-- 8. Reset scratch object ACLs and replay production object grants.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public, private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public, private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public, private FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION activate_contribution_initiative(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_contribution_initiative(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION activate_custom_contribution(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_custom_contribution(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION activate_member_account(text) TO service_role;
GRANT EXECUTE ON FUNCTION activate_other_contribution_cycle(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_recurring_contribution_initiative(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION activate_recurring_contribution_initiative(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION add_group_member(uuid,text,text,text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION add_group_member(uuid,text,text,text,text,text,text,date) TO service_role;
GRANT EXECUTE ON FUNCTION admin_renew_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_renew_subscription(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION approve_group_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_group_application(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION can_add_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_add_group_members(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION can_manage_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_members(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION charge_payments_guard_immutable() TO service_role;
GRANT EXECUTE ON FUNCTION check_application_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_application_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_2b_accounting_lock(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_2b_accounting_lock_range(uuid,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION cl_2b_decompose_obligation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_2b_record_contribution(uuid,uuid,numeric,text,date,text,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_2b_record_contribution(uuid,uuid,numeric,text,date,text,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_2b_record_contribution(uuid,uuid,uuid,numeric,date,text,text,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_2b_record_contribution(uuid,uuid,uuid,numeric,date,text,text,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_2b_refresh_member(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_adjust(uuid,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_adjust(uuid,numeric,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_allocate_payment(uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_allocate_payment(uuid,uuid,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamp with time zone,timestamp with time zone,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamp with time zone,timestamp with time zone,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_generate_contribution(uuid,uuid,uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_generate_contribution(uuid,uuid,uuid,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION cl_fine_waive(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_fine_waive(uuid,numeric,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_get_group_loan_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_get_group_loan_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_get_group_support_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_get_group_support_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_group_module_enabled(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_group_module_enabled(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_guard_contribution_allocation() TO service_role;
GRANT EXECUTE ON FUNCTION cl_guard_open_financial_period() TO service_role;
GRANT EXECUTE ON FUNCTION cl_import_financial_batch_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_import_financial_batch_atomic(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_actor(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_apply(uuid,numeric,integer,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_apply(uuid,numeric,integer,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_disburse(uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_disburse(uuid,uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_emit_notification(uuid,uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_guard_approval_office() TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_guard_disbursement_approvals() TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_guard_repayment_recorder() TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_notify_application_change() TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_notify_repayment() TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_record_repayment(uuid,uuid,numeric,date,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_refresh_statuses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_refresh_statuses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_review(uuid,uuid,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_review_authorized(uuid,uuid,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_review_authorized(uuid,uuid,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION cl_loan_update_settings(uuid,numeric,text,numeric,integer,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_loan_update_settings(uuid,numeric,text,numeric,integer,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_apply_preferences(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_apply_preferences(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_authorize(uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_choose_round(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_choose_round(uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_complete_payout(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_complete_payout(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_create_cycle(uuid,text,numeric,text,date,integer,text,uuid[],numeric) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_delete_cycle(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_delete_cycle(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_list_preferences(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_list_preferences(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_record_payment(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_record_payment(uuid,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_swap_recipients(uuid,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_swap_recipients(uuid,uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION cl_merry_tracking(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_merry_tracking(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cl_user_has_role(uuid,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_user_has_role(uuid,text[]) TO service_role;
GRANT EXECUTE ON FUNCTION cl_user_in_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION cl_user_in_group(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION claim_member_account(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_member_account(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION close_contribution_initiative(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION close_contribution_initiative(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION close_financial_month(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION close_financial_month(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION close_month(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION complete_group_onboarding(text,numeric,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_subscription_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_subscription_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_and_record_automatic_charge_payment(uuid,text,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION create_and_record_automatic_charge_payment(uuid,text,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION create_contribution_initiative(uuid,text,text,uuid,date,date,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_contribution_initiative(uuid,text,text,uuid,date,date,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_custom_contribution(uuid,text,text,numeric,text,date,date,date,integer,boolean,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_custom_contribution(uuid,text,text,numeric,text,date,date,date,integer,boolean,numeric,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_group(text,text,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group(text,text,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_group_account(text,text,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group_account(text,text,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_group_invite(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group_invite(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION create_member_with_contribution_plan(jsonb,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION create_member_with_contribution_plan(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION create_member_with_historical_contributions(jsonb,jsonb,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_member_with_historical_contributions(jsonb,jsonb,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_other_contribution_cycle(uuid,uuid,text,text,numeric,text,text,date,date,date,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_subscription_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_subscription_invoice(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION current_user_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_group_ids() TO service_role;
GRANT EXECUTE ON FUNCTION current_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION enforce_member_position_snapshot() TO PUBLIC;
GRANT EXECUTE ON FUNCTION enforce_member_position_snapshot() TO anon;
GRANT EXECUTE ON FUNCTION enforce_member_position_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION enforce_member_position_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_contribution_initiative_period(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_contribution_initiative_period(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION ensure_contribution_initiative_period_obligations(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_contribution_initiative_period_obligations(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION ensure_financial_period(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION financial_charges_guard_identity() TO service_role;
GRANT EXECUTE ON FUNCTION financial_charges_guard_obligation_contract() TO service_role;
GRANT EXECUTE ON FUNCTION financial_charges_guard_status() TO service_role;
GRANT EXECUTE ON FUNCTION financial_charges_normalize_type() TO service_role;
GRANT EXECUTE ON FUNCTION financial_charges_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION generate_group_access_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_group_access_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION generate_member_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_member_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION generate_next_custom_contribution_period(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_next_custom_contribution_period(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION generate_other_contribution_fines(uuid,uuid,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION get_canonical_member_monthly_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_canonical_member_monthly_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_canonical_monthly_accounting_summary(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_canonical_monthly_accounting_summary(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_member_status(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_member_status(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_participants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_participants(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_period_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_period_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_recurring_participants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_recurring_participants(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_contribution_initiative_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_contribution_positions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_contribution_positions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_contribution_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_contribution_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_custom_contribution_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_custom_contribution_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_module_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_module_settings(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_monthly_cycle_status(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_monthly_cycle_status(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION get_group_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_subscription(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_member_contribution_position(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_contribution_position(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_member_monthly_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_monthly_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_member_payment_allocation_statement(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_payment_allocation_statement(uuid,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION get_member_payment_statement(uuid,date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_payment_statement(uuid,date,date) TO service_role;
GRANT EXECUTE ON FUNCTION get_member_total_recognized_payments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_member_total_recognized_payments(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_accounting_summary(uuid,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_monthly_accounting_summary(uuid,text) TO anon;
GRANT EXECUTE ON FUNCTION get_monthly_accounting_summary(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_accounting_summary(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_contribution_progress(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_contribution_progress(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_contribution_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_contribution_status(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_monthly_financial_report(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_financial_report(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION get_my_active_contribution_initiatives() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_active_contribution_initiatives() TO service_role;
GRANT EXECUTE ON FUNCTION get_my_contribution_position() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_contribution_position() TO service_role;
GRANT EXECUTE ON FUNCTION get_my_group() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_group() TO service_role;
GRANT EXECUTE ON FUNCTION get_my_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_groups() TO service_role;
GRANT EXECUTE ON FUNCTION get_my_member() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_member() TO service_role;
GRANT EXECUTE ON FUNCTION get_platform_admin_applications() TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_admin_overview() TO service_role;
GRANT EXECUTE ON FUNCTION guard_expense_approval_status() TO service_role;
GRANT EXECUTE ON FUNCTION invite_member(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_platform_admin() TO service_role;
GRANT EXECUTE ON FUNCTION join_group_by_code(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION join_group_by_code(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION link_my_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION link_my_member(text) TO service_role;
GRANT EXECUTE ON FUNCTION list_pending_group_applications() TO service_role;
GRANT EXECUTE ON FUNCTION log_deleted_row() TO anon;
GRANT EXECUTE ON FUNCTION log_deleted_row() TO authenticated;
GRANT EXECUTE ON FUNCTION log_deleted_row() TO service_role;
GRANT EXECUTE ON FUNCTION machine_renew_due_subscriptions(integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION my_group_id() TO authenticated;
GRANT EXECUTE ON FUNCTION my_group_id() TO service_role;
GRANT EXECUTE ON FUNCTION my_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION my_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION my_member_id() TO authenticated;
GRANT EXECUTE ON FUNCTION my_member_id() TO service_role;
GRANT EXECUTE ON FUNCTION my_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION my_role(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION normalize_contribution_recorded_by() TO anon;
GRANT EXECUTE ON FUNCTION normalize_contribution_recorded_by() TO authenticated;
GRANT EXECUTE ON FUNCTION normalize_contribution_recorded_by() TO service_role;
GRANT EXECUTE ON FUNCTION onboard_new_group(text,text,numeric,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION onboard_new_group(text,text,numeric,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION prevent_closed_month_contribution() TO anon;
GRANT EXECUTE ON FUNCTION prevent_closed_month_contribution() TO authenticated;
GRANT EXECUTE ON FUNCTION prevent_closed_month_contribution() TO service_role;
GRANT EXECUTE ON FUNCTION prevent_closed_month_expense() TO anon;
GRANT EXECUTE ON FUNCTION prevent_closed_month_expense() TO authenticated;
GRANT EXECUTE ON FUNCTION prevent_closed_month_expense() TO service_role;
GRANT EXECUTE ON FUNCTION private.get_my_group_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_member_historical_payments(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_member_historical_payments(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION record_charge_payment(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION record_charge_payment(uuid,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION record_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_existing_member_historical_payments(uuid,uuid,numeric,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION record_existing_member_historical_payments(uuid,uuid,numeric,date,date,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION record_my_initiative_payment(uuid,numeric,date,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_my_initiative_payment(uuid,numeric,date,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_other_contribution_payment(uuid,uuid,numeric,date,text,text,text,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_other_contribution_payment(uuid,uuid,numeric,date,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_recurring_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_recurring_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_canonical_contribution_accounting(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_my_group_contribution_accounting(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_my_group_contribution_accounting(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION refresh_my_managed_member_accounting(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_my_managed_member_accounting(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reject_group_application(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_group_application(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION reopen_financial_month(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_financial_month(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION resolve_expense_recorded_by() TO anon;
GRANT EXECUTE ON FUNCTION resolve_expense_recorded_by() TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_expense_recorded_by() TO service_role;
GRANT EXECUTE ON FUNCTION reverse_contribution_initiative_payment(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_contribution_initiative_payment(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reverse_recurring_contribution_initiative_payment(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_recurring_contribution_initiative_payment(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reverse_subscription_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_subscription_payment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION save_pending_onboarding(text,text,numeric,numeric,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION save_pending_onboarding(text,text,numeric,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION set_contribution_initiative_member_term(uuid,date,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_contribution_initiative_member_term(uuid,date,numeric,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION set_contribution_initiative_members(uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_contribution_initiative_members(uuid,jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION set_member_actual_position(uuid,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION set_member_actual_position(uuid,text,text,date) TO service_role;
GRANT EXECUTE ON FUNCTION set_recorded_by_from_auth() TO anon;
GRANT EXECUTE ON FUNCTION set_recorded_by_from_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION set_recorded_by_from_auth() TO service_role;
GRANT EXECUTE ON FUNCTION set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION submit_expense_approval(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_expense_approval(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION submit_group_application(text,text,numeric,numeric,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION submit_group_application(text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_group_application(text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION sync_membership_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION sync_membership_number() TO anon;
GRANT EXECUTE ON FUNCTION sync_membership_number() TO authenticated;
GRANT EXECUTE ON FUNCTION sync_membership_number() TO service_role;
GRANT EXECUTE ON FUNCTION update_group_contribution_cycle_settings(uuid,smallint,smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_contribution_cycle_settings(uuid,smallint,smallint) TO service_role;
GRANT EXECUTE ON FUNCTION update_group_contribution_settings(uuid,smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_contribution_settings(uuid,smallint) TO service_role;
GRANT EXECUTE ON FUNCTION update_group_module_settings(uuid,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_module_settings(uuid,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION update_group_monthly_contribution_settings(uuid,integer,integer,boolean,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_monthly_contribution_settings(uuid,integer,integer,boolean,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION validate_initiative_payment_allocation() TO anon;
GRANT EXECUTE ON FUNCTION validate_initiative_payment_allocation() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_initiative_payment_allocation() TO service_role;
GRANT EXECUTE ON FUNCTION validate_monthly_allocation_domain() TO service_role;
GRANT EXECUTE ON FUNCTION validate_monthly_payment_domain() TO anon;
GRANT EXECUTE ON FUNCTION validate_monthly_payment_domain() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_monthly_payment_domain() TO service_role;
GRANT EXECUTE ON FUNCTION validate_recorded_by() TO anon;
GRANT EXECUTE ON FUNCTION validate_recorded_by() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_recorded_by() TO service_role;
GRANT EXECUTE ON FUNCTION verify_group_access_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_group_access_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION verify_group_invite(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_group_invite(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION verify_member_payment_evidence(uuid,text,text) TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.audit_deleted_rows_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.audit_deleted_rows_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.audit_deleted_rows_id_seq TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.group_audit_log_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.group_audit_log_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.group_audit_log_id_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.announcements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.attendance TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_deleted_rows TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_deleted_rows TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_deleted_rows TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.charge_payments TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.contribution_allocations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_allocations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_goals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_goals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_goals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_allocations TO service_role;
GRANT MAINTAIN, SELECT ON TABLE public.contribution_initiative_credit_consumptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_credit_consumptions TO service_role;
GRANT MAINTAIN, SELECT ON TABLE public.contribution_initiative_credits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_credits TO service_role;
GRANT MAINTAIN, SELECT ON TABLE public.contribution_initiative_member_terms TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_member_terms TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_obligations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_payment_reversals TO service_role;
GRANT MAINTAIN, SELECT ON TABLE public.contribution_initiative_periods TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiative_periods TO service_role;
GRANT SELECT ON TABLE public.contribution_initiatives TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_initiatives TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.contribution_obligations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_obligations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_periods TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_periods TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_periods TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.contribution_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contribution_types TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.contributions TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.contributions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.contributions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_batches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_batches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_mappings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_mappings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_rows TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.data_import_rows TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.documents TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.documents TO service_role;
GRANT SELECT ON TABLE public.expense_approvals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_approvals TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.expenses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feedback TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feedback TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feedback TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_charges TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.financial_periods TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.financial_periods TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.financial_periods TO service_role;
GRANT SELECT ON TABLE public.fine_adjustments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fine_adjustments TO service_role;
GRANT SELECT ON TABLE public.fine_payment_allocations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fine_payment_allocations TO service_role;
GRANT SELECT ON TABLE public.fine_rule_contribution_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fine_rule_contribution_types TO service_role;
GRANT SELECT ON TABLE public.fine_rules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fine_rules TO service_role;
GRANT SELECT ON TABLE public.fine_waivers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fine_waivers TO service_role;
GRANT SELECT ON TABLE public.fines TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.fines TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_activities TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_activities TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_applications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_applications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_assets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_assets TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.group_audit_log TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.group_audit_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_audit_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_contribution_calendar_periods TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_contribution_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_invites TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_milestones TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_milestones TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_plans TO service_role;
GRANT SELECT ON TABLE public.group_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_support_cases TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_support_cases TO service_role;
GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO service_role;
GRANT SELECT ON TABLE public.loan_applications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_applications TO service_role;
GRANT SELECT ON TABLE public.loan_approvals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_approvals TO service_role;
GRANT SELECT ON TABLE public.loan_notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_notifications TO service_role;
GRANT SELECT ON TABLE public.loan_repayment_allocations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_repayment_allocations TO service_role;
GRANT SELECT ON TABLE public.loan_repayment_schedule TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_repayment_schedule TO service_role;
GRANT SELECT ON TABLE public.loan_repayments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_repayments TO service_role;
GRANT SELECT ON TABLE public.loan_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.loan_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.meetings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.meetings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.meetings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_contribution_rules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_contribution_rules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_contribution_rules TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_payment_evidence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_payment_evidence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_payment_evidence TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.member_position_history TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.member_position_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.member_position_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.members TO service_role;
GRANT SELECT ON TABLE public.merry_go_round_cycles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.merry_go_round_cycles TO service_role;
GRANT SELECT ON TABLE public.merry_go_round_notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.merry_go_round_notifications TO service_role;
GRANT SELECT ON TABLE public.merry_go_round_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.merry_go_round_payments TO service_role;
GRANT SELECT ON TABLE public.merry_go_round_preferences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.merry_go_round_preferences TO service_role;
GRANT SELECT ON TABLE public.merry_go_round_rounds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.merry_go_round_rounds TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.monthly_closings TO anon;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.monthly_closings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.monthly_closings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_onboarding TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_onboarding TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pending_onboarding TO service_role;
GRANT SELECT ON TABLE public.platform_activity TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_activity TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_admins TO service_role;
GRANT SELECT ON TABLE public.subscription_credits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_credits TO service_role;
GRANT SELECT ON TABLE public.subscription_cycles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_cycles TO service_role;
GRANT SELECT ON TABLE public.subscription_invoice_lines TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_invoice_lines TO service_role;
GRANT SELECT ON TABLE public.subscription_invoices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_invoices TO service_role;
GRANT SELECT ON TABLE public.subscription_member_billing TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_member_billing TO service_role;
GRANT SELECT ON TABLE public.subscription_payment_allocations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payment_allocations TO service_role;
GRANT SELECT ON TABLE public.subscription_payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payments TO service_role;
GRANT SELECT ON TABLE public.subscription_pricing_tiers TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_pricing_tiers TO service_role;

-- View grants are captured separately because views have their own ACL entries.
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_balances TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_balances TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_balances TO service_role;
GRANT SELECT ON TABLE public.subscription_credit_balances TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_credit_balances TO service_role;

-- Production also has schema-specific default ACLs for objects created by postgres and supabase_admin
-- in public. They are intentionally not altered in this candidate until the default-ACL parity
-- inventory is reviewed independently; the object-level ACLs above are explicitly replayed.

COMMIT;
