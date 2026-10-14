-- STAGE ONLY: column/default reconstruction from production catalog, captured 2026-10-14.
-- NOT a complete migration. Constraints, indexes, triggers, policies, views, ownership, grants, sequence ownership/state,
-- function dependencies and full object parity are not included. DO NOT APPLY as a standalone migration.
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
  id bigint NOT NULL,
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
  economic_month date DEFAULT (date_trunc('month'::text, (obligation_month)::timestamp without time zone))::date,
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
  id bigint NOT NULL,
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