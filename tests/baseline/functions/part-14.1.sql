-- STAGE ONLY: production function definitions; ordinal rows 131-140 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

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
