/* CHAMA LIVE — minimal group-level page usage tracking.
   Records an allowlisted page key and group only; never member identity or page contents.
   Analytics failures must never block normal page loading. */

import { supabase } from "./supabase.js";

const PAGE_KEYS = {
  "dashboard.html": "dashboard",
  "member-dashboard.html": "dashboard",
  "members.html": "members",
  "add-member.html": "members",
  "contributions.html": "contributions",
  "member-contributions.html": "contributions",
  "member-accounting.html": "contributions",
  "expenses.html": "expenses",
  "fines.html": "fines",
  "reports.html": "reports",
  "meetings.html": "meetings",
  "documents.html": "documents",
  "group-management.html": "group_management",
  "group-settings.html": "group_settings",
  "loans.html": "loans",
  "merry-go-round.html": "merry_go_round",
  "member-my-account.html": "my_account",
  "admin-my-account.html": "my_account",
  "member-profile.html": "my_account",
  "plans-activities.html": "plans",
  "member-activities.html": "activities",
  "assets.html": "assets",
  "member-assets.html": "assets",
  "milestones.html": "milestones",
  "member-milestones.html": "milestones",
  "data-migration.html": "data_migration",
  "notifications.html": "notifications",
  "group-calendar.html": "group_calendar"
};

export function trackGroupPageUsage(context, pageName) {
  const groupId = context?.member?.group_id;
  const page = String(pageName || "").split("/").pop().toLowerCase();
  const pageKey = PAGE_KEYS[page] || "other";

  if (!groupId || !context?.user) return;

  // Fire-and-forget so analytics can never block a group task.
  void supabase.rpc("record_group_page_view", {
    p_group_id: groupId,
    p_page_key: pageKey
  }).then(({ error }) => {
    if (error) console.warn("CHAMA LIVE: page usage was not recorded.", error.message);
  }).catch((error) => {
    console.warn("CHAMA LIVE: page usage was not recorded.", error);
  });
}
