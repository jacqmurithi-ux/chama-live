-- STAGE ONLY: view definitions recovered from production catalog 2026-10-14.
-- Includes security_invoker reloptions. Install referenced functions and tables first.

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