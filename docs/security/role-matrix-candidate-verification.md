# CHAMA LIVE role matrix candidate verification

## Status — NOT YET VERIFIED; production release blocked

The candidate branch now contains additional candidate-only authorization migrations:
- `20261010190000_role_matrix_chair_vice_finance_readonly.sql`
- `20261010193000_role_matrix_close_self_recording_bypasses.sql`
- `20261010194500_role_matrix_treasurer_only_initiative_mutations.sql`
- `20261010203000_role_matrix_close_remaining_financial_rpc_bypasses.sql`
- `20261010210000_role_matrix_treasury_only_fine_mutations.sql`

The initial candidate and follow-up migrations were applied to the free test project
`onzaonflquipqmhgslxi` only. The two latest migrations also returned successful
application results on that test project. Read-only post-application inspection
confirms that several remaining candidate RPC guards now explicitly use treasury-
only or secretary/treasurer authorization. This is structural source evidence, not
proof of effective authorization for real authenticated requests.

Production project `ptktftwyltxmtcodyzoa` (`ptktftwyltxmtcodyzoa`) has not been
changed by this work. **Do not deploy or merge to production yet.**

## Blocking evidence

1. The synthetic role fixture rows have no linked Auth identities. The available
   Supabase tool actions do not expose a supported Auth-user provisioning endpoint.
   Distinct test Auth users must be created in the test project's Dashboard or via
   a supported Auth API flow. Do not insert directly into `auth.users`, and do not
   repurpose a real user.
2. The test and production definitions differ for many financial SECURITY DEFINER
   functions, despite matching function signatures. Candidate replacements cannot
   be assumed to match production source.
3. Production direct REST/table policies remain broader than the candidate in
   important places. For example, production contribution insert/update policies
   allow admin and chairperson, while candidate policies restrict direct writes to
   secretary and treasurer. Production expense and financial-period policies also
   differ. This requires an explicit policy-by-policy production-source reconciliation.
4. Candidate source review identified and tightened test-project authorization for
   payment verification, initiative payment reversals, historical payment recording,
   contribution-cycle settings, monthly contribution settings, and fine mutation
   functions. These changes still need clean replay testing, source review, and
   authenticated negative/positive tests.
5. The test security advisor reports 25 RLS-enabled/no-policy findings across
   `cl_demo`, `private`, and `public` schemas. Some may be intentionally backend-
   only, but each must be classified by schema exposure and grants; do not dismiss
   public-schema findings without verification. Re-run advisors after final changes.
6. No authenticated browser, direct RPC, or direct REST/table matrix has passed yet.

## Roles and fixtures required

Use Group A and Group B with distinct synthetic users for admin/administrator,
chairperson, vice chairperson, secretary, vice secretary, treasurer, and ordinary
member. Include inactive and pending-onboarding membership cases. Link each Auth
identity to exactly the intended test member only, using a controlled test-only
process.

## Required positive checks

- Chairperson and vice chairperson can read permitted financial reports, balances,
  contributions, expenses, fine records, financial periods, and closing history.
- Vice chairperson can perform each tested non-treasury chairperson action.
- Vice secretary can perform each tested non-treasury secretary action.
- Secretary/vice secretary retain only their approved secretary-level actions.
- Treasurer can perform approved treasury RPCs in their own group.
- Admin/administrator can perform non-treasury group administration in both groups,
  subject to explicit per-feature authorization.

## Required negative checks

- Chairperson/vice chairperson cannot insert, update, or delete contribution or
  expense records through REST/table APIs or equivalent RPCs.
- Chairperson/vice chairperson cannot adjust, waive, allocate, or reverse financial
  records, manage treasury fine rules, close/reopen periods, or verify payment
  evidence when those actions are treasury-only.
- Admin/administrator cannot use treasury-only close/reopen, financial-period
  mutation, contribution deletion, expense update/delete, or fine correction paths.
- Secretary/vice secretary cannot perform treasury-only fine correction or
  period close/reopen operations.
- Group B non-admin users cannot read or mutate Group A data; test both SELECT and
  writes, including attempts to change row group/member IDs.
- Inactive and pending members cannot gain permissions from stale role values.
- UI bypasses must not bypass RPC authorization or RLS.

## Acceptance gates

- Reconcile every affected production function definition and every direct table
  policy before producing a production migration. Do not blindly replay candidate
  replacements against the production source.
- Confirm the candidate migration replays cleanly on a fresh isolated database.
- Verify exact `pg_policies`, function source, function EXECUTE grants, exposed
  schemas, and advisor findings.
- Run authenticated browser tests plus direct RPC and REST/table positive/negative
  tests, including cross-group isolation.
- Update this document with reproducible evidence and actual pass/fail outcomes.
- Production remains read-only until all gates pass and separate deployment
  approval is given.
