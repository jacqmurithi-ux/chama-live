import { supabase } from "../supabase.js";
import { createApiClient } from "./client.js";

const MEMBER_FIELDS =
  "id, group_id, user_id, member_number, name, phone, role, join_date, status, created_at, email, membership_number, onboarding_status, invited_at, activated_at, auth_user_id, national_id, actual_position, actual_position_name";
const RULE_FIELDS =
  "group_id, member_id, contribution_type_id, amount, frequency, effective_from, effective_to, first_period_rule, status";
const TYPE_FIELDS = "id, group_id, name, code, created_at";
const MEMBER_CACHE = ["members:", "rules:", "types:"];

const MEMBER_WRITE_RPCS = [
  "create_member_with_historical_contributions",
  "create_member_with_contribution_plan",
  "set_member_actual_position",
  "reconcile_member_historical_payments"
];

const api = createApiClient(supabase, {
  allowedRpcs: [
    "refresh_my_managed_member_accounting",
    "get_member_contribution_position",
    ...MEMBER_WRITE_RPCS
  ],
  errorScope: "Member information",
  invalidateByRpc: Object.fromEntries(
    MEMBER_WRITE_RPCS.map((name) => [name, MEMBER_CACHE])
  )
});

export const membersApi = Object.freeze({
  list(groupId) {
    return api.readCached(
      `members:${groupId}`,
      () =>
        supabase
          .from("members")
          .select(MEMBER_FIELDS)
          .eq("group_id", groupId)
          .order("member_number", {
            ascending: true,
            nullsFirst: false
          })
    );
  },

  contributionTypes(groupId) {
    return api.readCached(
      `types:${groupId}`,
      () =>
        supabase
          .from("contribution_types")
          .select(TYPE_FIELDS)
          .eq("group_id", groupId)
    );
  },

  contributionRules(groupId, memberIds) {
    if (!memberIds?.length) {
      return Promise.resolve({
        data: [],
        error: null
      });
    }

    return api.readCached(
      `rules:${groupId}`,
      () =>
        supabase
          .from("member_contribution_rules")
          .select(RULE_FIELDS)
          .eq("group_id", groupId)
          .in("member_id", memberIds)
    );
  },

  updateMember(groupId, memberId, values) {
    return api
      .request(() =>
        supabase
          .from("members")
          .update(values)
          .eq("id", memberId)
          .eq("group_id", groupId)
      )
      .then((result) => {
        if (!result.error) {
          api.invalidateCache(MEMBER_CACHE);
        }

        return result;
      });
  },

  rpc(name, args) {
    return api.rpc(name, args);
  }
});
