-- Scratch-only schema parity inventory gate.
-- Expected counts captured from production catalog on 2026-10-14.
-- This is a necessary inventory check, NOT a substitute for object-by-object
-- definition parity (column/default signatures, constraints, indexes, policies,
-- function bodies, ACLs, extensions, enum/type definitions and sequence settings).
-- Run against the isolated scratch project only; this script is read-only.

WITH actual AS (
  SELECT 'tables_public_private'::text AS check_name,
         (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','private'))::bigint AS actual,
         87::bigint AS expected
  UNION ALL
  SELECT 'columns_public_private',
         (SELECT count(*) FROM information_schema.columns WHERE table_schema IN ('public','private')),
         892
  UNION ALL
  SELECT 'constraints_public_private',
         (SELECT count(*) FROM pg_constraint co
          JOIN pg_class c ON c.oid=co.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','private')),
         563
  UNION ALL
  SELECT 'indexes_public_private',
         (SELECT count(*) FROM pg_indexes WHERE schemaname IN ('public','private')),
         295
  UNION ALL
  SELECT 'user_triggers_public_private',
         (SELECT count(*) FROM pg_trigger t
          JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','private') AND NOT t.tgisinternal),
         45
  UNION ALL
  SELECT 'rls_policies_public_private',
         (SELECT count(*) FROM pg_policy p
          JOIN pg_class c ON c.oid=p.polrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('public','private')),
         123
  UNION ALL
  SELECT 'functions_and_procedures_public_private',
         (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname IN ('public','private') AND p.prokind IN ('f','p')),
         201
)
SELECT check_name, actual, expected, actual = expected AS pass
FROM actual
ORDER BY check_name;

-- Separate critical security parity checks. These are intentionally included
-- because inventory counts alone cannot prove the right ACL or SECURITY DEFINER.
SELECT p.oid::regprocedure::text AS function_name,
       p.prosecdef AS security_definer,
       p.proconfig AS function_config,
       COALESCE(
         (SELECT jsonb_agg(jsonb_build_object(
            'grantee', CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
            'privilege', a.privilege_type,
            'grantable', a.is_grantable
          ) ORDER BY a.grantee, a.privilege_type)
          FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a),
         '[]'::jsonb
       ) AS effective_acl,
       (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
        AND NOT EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
          WHERE a.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname='anon'),
                                 (SELECT oid FROM pg_roles WHERE rolname='authenticated'))
            AND a.privilege_type='EXECUTE'
        )
       ) AS security_contract_pass
FROM pg_proc p
WHERE p.oid IN (
  to_regprocedure('public.cl_2b_accounting_lock_range(uuid,date,date)'),
  to_regprocedure('public.cl_2b_refresh_member(uuid,date)')
)
ORDER BY function_name;
