# CHAMA LIVE Demo Sandbox — Verification Gate

Target: candidate Supabase project `onzaonflquipqmhgslxi` and Git branch `demo/furaha-sandbox-rebuild-20261009`.

## Safety boundary

- Live production project `ptktftwyltxmtcodyzoa` is not a target of this work.
- Demo CRUD writes only `cl_demo.session_overrides`; it does not insert/update/delete canonical contribution, allocation, obligation, fine, attendance, or other group records.
- Contribution and attendance smoke tests verified that canonical row counts did not change.
- Demo profile contact values use the reserved `.invalid` domain and visibly fake `DEMO-PHONE-` placeholders.
- Demo visitor/member records are not linked to Supabase Auth users.

## Verification results

| Gate | Result | Evidence |
|---|---|---|
| Session edit isolation | PASS | Two temporary sessions independently read different override values for the same member |
| Reset isolation | PASS | Reset removed session A overrides without changing session B |
| Delete projection | PASS | Deleted seeded row hidden only for the owning session |
| Create projection | PASS | New member override appeared only in the creating session |
| Accounting isolation | PASS | Simulated contribution appeared in demo read while canonical contribution count remained unchanged |
| Attendance isolation | PASS | Synthetic attendance appeared in demo read, reset removed it, canonical attendance count remained unchanged |
| Group boundary validation | PASS | Override with a mismatched group ID was rejected |
| Browser JavaScript parse check | PASS | `js/demo-app.js`, `js/demo-api.js`, and `js/demo-session.js` parsed successfully after removing module imports/exports for syntax checking |
| Candidate OTP group lookup | PASS (code change deployed) | Edge Function resolves the unique `is_demo=true` group instead of hardcoded `E2600` |
| Live browser start/end test | NOT RUN | Requires a real browser request to the deployed candidate Edge Function; no browser automation/invocation tool is available in this session |
| Field-specific create/edit form | PARTIAL PASS | Replaced raw JSON with field controls, enum selectors, member/meeting dropdowns, and placeholder-contact validation; full per-module validation remains pending |
| Security-definer view findings | PASS (candidate only) | Set `security_invoker=true` on `public.group_balances` and `public.subscription_credit_balances`; candidate advisor no longer reports `security_definer_view` |
| Context/read response shape | PASS | `cl_demo_get_context` returned `demo=true`, Furaha group name; `cl_demo_get_rows(...,'members')` returned an array of 15 rows |
| Full page-by-page visual/workflow parity | NOT COMPLETE | Shared routes exist; every form, selector, validation, calculation and workflow has not yet been compared against production HTML |

## Portal page coverage map

### Group/admin workflows represented in the demo navigation

| Current page | Demo route / workflow | Coverage status |
|---|---|---|
| `dashboard.html` | Group dashboard | Scaffolded; browser parity pending |
| `members.html`, `admin-members.html`, `add-member.html` | Members / Admin Member Management / New record | CRUD override workflow represented; form parity pending |
| `contributions.html` | Contributions | Session-only override table; canonical accounting workflow intentionally not invoked |
| `fines.html` | Fines | Session-only override table; detailed fine form and validation parity pending |
| `meetings.html` | Meetings | Session-only override table; meeting creation/minutes lifecycle parity pending |
| Attendance workflow | Attendance Register | Select meeting and set each member to present/late/apology/absent; session-only saves |
| `expenses.html` | Expenses | Session-only override table; form parity pending |
| `assets.html` | Assets | Session-only override table; form parity pending |
| `plans-activities.html` | Plans & Activities | Plans and activities tables represented; combined-page parity pending |
| `milestones.html` | Milestones | Session-only override table; form parity pending |
| `welfare.html` | Welfare | Session-only override table; workflow parity pending |
| `monthly-closing.html` | Monthly Closing | Read/edit override projection; canonical closing RPCs intentionally not invoked |
| `reports.html` | Reports | Contribution-record view; report filters/exports parity pending |
| `billing.html` | Billing | Subscription data view; subscription workflows parity pending |
| `group-management.html` | Group Management | Group profile override projection; settings form parity pending |
| `data-migration.html` | Data Import Simulation | CSV preview and simulated contribution overrides; no production import |
| `admin-getting-started.html` | Admin Getting Started | Demo guide |
| `member-dashboard.html` | Member Dashboard Preview | Preview; not authenticated/personalized |
| `member-contributions.html` | My Contributions | Contribution data view; member scoping UI parity pending |
| `member-accounting.html`, `member-profile.html` | Member Accounting / Member Profile Preview | Read-only previews; member scoping UI parity pending |
| `member-activities.html` | Member Activities | Activities view |
| `member-assets.html` | Member Assets | Assets view |
| `member-milestones.html` | Member Milestones | Milestones view |
| `member-getting-started.html` | Member Getting Started | Demo guide |

### Pages deliberately not routed into the no-login sandbox

- Authentication/security: `login.html`, `admin-login.html`, `member-login.html`, `signup.html`, `confirm.html`, `activate-account.html`, `forgot-password.html`, `reset-password.html`. These must not establish or modify real Auth sessions from the demo.
- Privileged platform administration: `platform-admin.html`, `platform-admin-login.html`. These must never be exposed as demo features.
- Diagnostic-only: `2b-authenticated-rpc-test.html`.
- Public informational/marketing pages: `index.html`, `faq.html`, `pricing.html`, `privacy.html`, `sitemap.html`, `terms.html`, `tour.html`. These are public-site content, not group portal workflows.
- Demo aliases `demo.html`, `demo-members.html`, `demo-meetings.html`, and `demo-app.html` are entry/shared-workspace pages.

## Security review notes

- Candidate `security_definer_view` advisor finding count is now zero after setting both flagged views to `security_invoker=true`; anonymous SELECT remains denied on both.
- Remaining `SECURITY DEFINER` demo RPCs are intentionally callable by `anon` because the no-login sandbox uses bearer tokens. They must continue to validate token hash, expiry, revocation, group scope and table allowlists. Advisor warnings for these functions remain and require per-function review; do not blindly revoke EXECUTE while the browser depends on these RPCs.
- Candidate direct-start rate-limit identity now uses `cf-connecting-ip`; no raw IP is stored, only a SHA-256-derived anonymous identifier. Real edge/browser testing is still required to verify the header is present in the deployed runtime.

## Remaining release gates

1. Run real browser tests for direct start, invalid/expired token, explicit end, and a second visitor.
2. Verify meeting create/edit/minutes, attendance submission/resubmission/idempotency and dashboard projections in the browser.
3. Finish field-specific forms, selectors and validation in every CRUD module; raw JSON is no longer the main editor, but each module still needs parity checks.
4. Compare each covered route with its live counterpart and record PASS/FAIL per workflow.
5. Run a final candidate security review; do not merge this branch or deploy to `chamalive.co.ke` until the browser and parity gates pass.
