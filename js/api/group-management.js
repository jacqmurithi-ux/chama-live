import { supabase } from "../supabase.js";
import { createApiClient } from "./client.js";

const MEMBER_CACHE = ["leadership:", "member-count:"];
const CONTRIBUTION_TYPE_CACHE = ["contribution-types:"];

const api = createApiClient(supabase, {
  allowedRpcs: [
    "get_group_contribution_settings",
    "update_group_contribution_settings",
    "update_group_monthly_contribution_settings",
    "get_group_subscription",
    "create_custom_contribution",
    "activate_custom_contribution",
    "get_group_active_contributions",
  ],
  errorScope: "Group information"
});

export const groupManagementApi = Object.freeze({
  updateGroup(groupId, values) {
    return api.request(() =>
      supabase.from("groups").update(values).eq("id", groupId)
    );
  },

  getLeadershipMembers(groupId) {
    return api.readCached(
      `leadership:${groupId}`,
      () =>
        supabase
          .from("members")
          .select("id, name, actual_position, actual_position_name")
          .eq("group_id", groupId)
          .not("actual_position", "is", null)
          .order("name", { ascending: true })
    );
  },

  countMembers(groupId) {
    return api.readCached(
      `member-count:${groupId}`,
      () =>
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("group_id", groupId)
    );
  },

  listContributionTypes(groupId) {
    return api.readCached(
      `contribution-types:${groupId}`,
      () =>
        supabase
          .from("contribution_types")
          .select("id, name, code, created_at")
          .eq("group_id", groupId)
          .order("created_at", { ascending: true })
    );
  },

  rpc(name, args) {
    return api.rpc(name, args);
  },

  invalidateMembers() {
    api.invalidateCache(MEMBER_CACHE);
  },

  invalidateContributionTypes() {
    api.invalidateCache(CONTRIBUTION_TYPE_CACHE);
  }
});
