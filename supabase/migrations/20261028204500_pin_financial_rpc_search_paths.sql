-- Pin high-impact privileged functions to an empty search_path.
-- Their application tables and helper functions are schema-qualified in the definitions;
-- pg_catalog remains implicitly available for built-ins.
ALTER FUNCTION public.cl_submit_my_payment_evidence(numeric,date,text,text,text,text) SET search_path = '';
ALTER FUNCTION public.cl_loan_disburse(uuid,uuid,date) SET search_path = '';
ALTER FUNCTION public.cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) SET search_path = '';
ALTER FUNCTION public.cl_loan_review_authorized(uuid,uuid,text,text,numeric) SET search_path = '';
