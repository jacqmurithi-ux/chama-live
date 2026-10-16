-- STAGE ONLY: RLS policy definitions recovered from production catalog 2026-10-14.
-- Tables must have RLS enabled; review policy semantics and grants before applying.

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