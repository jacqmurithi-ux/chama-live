-- Make canonical member refresh compatible with the deployed allocation table.
-- The canonical table stores payment_id, obligation_id and amount only.
-- This migration rewrites only the allocation INSERT shape in the existing
-- refresh function; all accounting and locking logic remains unchanged.
do $migration$
declare
  v_definition text;
  v_extended_insert constant text :=
    'INSERT INTO public.contribution_allocations (group_id, member_id, payment_id, obligation_id, allocated_amount, amount)';
  v_extended_select constant text :=
    'SELECT v_group_id, p_member_id, m.payment_id, m.obligation_id, m.allocation_amount, m.allocation_amount';
  v_canonical_insert constant text :=
    'INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount)';
  v_canonical_select constant text :=
    'SELECT m.payment_id, m.obligation_id, m.allocation_amount';
begin
  select pg_catalog.pg_get_functiondef('public.cl_2b_refresh_member(uuid,date)'::regprocedure)
    into v_definition;

  if position(v_extended_insert in v_definition) > 0
     and position(v_extended_select in v_definition) > 0 then
    v_definition := replace(v_definition, v_extended_insert, v_canonical_insert);
    v_definition := replace(v_definition, v_extended_select, v_canonical_select);
    execute v_definition;
  elsif position(v_canonical_insert in v_definition) > 0
        and position(v_canonical_select in v_definition) > 0 then
    -- Already compatible; safe to replay.
    null;
  else
    raise exception 'cl_2b_refresh_member allocation INSERT does not match a known safe shape';
  end if;
end
$migration$;

do $verify$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.cl_2b_refresh_member(uuid,date)'::regprocedure)
    into v_definition;
  if position('INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount)' in v_definition) = 0
     or position('INSERT INTO public.contribution_allocations (group_id, member_id, payment_id, obligation_id, allocated_amount, amount)' in v_definition) > 0 then
    raise exception 'cl_2b_refresh_member remains incompatible with canonical allocation schema';
  end if;
end
$verify$;
