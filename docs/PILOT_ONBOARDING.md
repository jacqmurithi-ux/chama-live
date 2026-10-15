# CHAMA LIVE Pilot Onboarding Runbook

This runbook is for onboarding a real chama/CBO to the existing CHAMA LIVE production site at https://chamalive.co.ke. CHAMA LIVE uses GitHub Pages for the static frontend and Supabase for authentication and data. Do not configure Vercel.

## Before the onboarding session

- Confirm the group has approved using CHAMA LIVE and identify its authorized lead contact.
- Collect the official group name, group type, contact details, constitution, current officer list, and member register.
- Agree a cut-off date for any historical balances. Keep source records available for reconciliation.
- Prepare the member register as CSV and review it with the group before import. Do not include passwords or secret credentials in a CSV.
- Confirm who will act as the initial Admin and which members hold Chairperson, Treasurer, and Secretary positions.
- Take care not to enter test figures into a real group's records. Opening balances represent a group's existing position at an agreed cut-off date, not new payments or loan transactions.

## Create and verify the group

1. Open the production site and complete the existing group application/signup process using the authorized contact's own email.
2. Verify the email using the link sent by CHAMA LIVE. Return to the site after confirmation.
3. Complete the group application with the correct legal/working name and group details.
4. Wait for the existing platform approval process to approve the application. Do not create group or member rows manually in the database.
5. Sign in with the designated initial Admin account. Confirm the group name and account identity shown in the shared header are correct.
6. In Group Management, complete the group profile and verify the leadership/officer assignments. Confirm the initial Admin is linked to the correct group and that the officer positions are assigned to the intended members.
7. In Group Settings, leave optional modules disabled unless the group has explicitly chosen to use them. Plans & Activities, Assets, Milestones, and Data Migration should remain off by default.

## Add members and send invitations

1. Review the CSV against the current downloadable template before import.
2. Check each row for required fields, duplicate email/phone/member identifiers, malformed values, and any position assignment that is not part of the group's approved officer list.
3. Preview validation results and correct all row-level errors before committing the import. If the import reports a failure, reconcile the result before retrying; do not assume a failed request inserted nothing unless the application confirms that.
4. Invite members using the supported invitation/signup process. Each member must claim their own account through the email they control; never share a password or create a shared login.
5. Ask each member to sign in and verify that their name, group, and assigned position are correct. Resolve mismatches before entering financial information.

## Configure contributions and modules

1. Set the group's contribution rules, including the amount, frequency, effective/start date, due date or cycle, and any grace/fine settings that the group has approved.
2. Confirm the rules shown in the application match the minutes/resolution approved by the group.
3. Select only the optional modules the group needs. Keep unselected modules off.
4. Schedule the first meeting and record its agenda. Upload the group's constitution to the existing Documents area.

## Enter opening balances carefully

1. Agree and record the opening-balance cut-off date with the group.
2. Reconcile each member's opening contribution position against the source register. Separate paid amounts, amounts allocated to obligations, outstanding arrears, and any credit/overpayment; do not count one amount twice.
3. Record existing loans separately from contributions, using the existing loan records and repayment rules. Do not represent a historical loan balance as a new loan disbursement or a new repayment.
4. Use only an explicitly labelled opening-balance workflow if it is available in the deployed application. Keep supporting schedules and the group's approval/audit evidence.
5. If the application does not provide a dedicated, auditable opening-balance workflow for the required record type, stop and escalate before entering it. Do not work around the gap with direct SQL or by inserting rows into contribution ledgers.
6. After entry, reconcile the application totals against the signed-off source schedule and retain the reconciliation result.

## Pilot readiness review

Before the group begins live use, verify the following with the group's officers:

- Group profile is correct.
- Admin, Chairperson, Treasurer, and Secretary are correctly assigned.
- Member count and member identities match the approved register.
- Contribution rules match the approved resolution.
- Optional modules match the group's choices and unselected modules remain disabled.
- Opening balances, where supported by the deployed workflow, reconcile to the signed-off cut-off schedule.
- Constitution is uploaded and the first meeting is scheduled.
- Each invited member can claim an account and lands in the correct group with the correct position.
- Members cannot view another group's data. Test using accounts from two different groups; never use a real member's credentials for the test.
- Feedback can be submitted and is visible only to authorized platform owners.
- No service-role key, password, private token, or real member financial data is committed to the repository.

Record any unverified item as a pilot blocker rather than treating it as complete.

## Feedback and support

Use the in-app Send feedback control where available. Include the page name, what you expected, what happened, and steps to reproduce; avoid including passwords, authentication codes, or unnecessary personal/financial information. Platform owners should review feedback through the owner-only view.

If a step cannot be completed safely, stop at that step and contact the CHAMA LIVE platform owner. Do not edit production database rows manually, disable row-level security, or bypass the existing role and approval model.

## Onboarding sign-off

Record the group name, onboarding date, cut-off date, officer sign-off, outstanding blockers, and the person responsible for each follow-up. Mark the group ready for pilot use only after the checks above have been verified.
