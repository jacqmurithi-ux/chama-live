import { supabase } from "./supabase.js";

import {
  getCurrentGroupId,
  money,
  showError
} from "./app.js";

async function loadContributions() {
  try {
    const rows = document.querySelector("#rows");

    if (!rows) {
      throw new Error("Missing #rows");
    }

    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const result = await supabase
      .from("contributions")
      .select(
        "contribution_date, amount, contribution_type, payment_method, reference, member_id"
      )
      .eq("group_id", groupId)
      .order("contribution_date", {
        ascending: false
      });

    if (result.error) {
      throw result.error;
    }

    const contributions = result.data || [];

    if (contributions.length === 0) {
      rows.innerHTML =
        "<tr><td colspan='6'>No contributions yet.</td></tr>";
      return;
    }

    const memberIds = [
      ...new Set(
        contributions
          .map(function (item) {
            return item.member_id;
          })
          .filter(Boolean)
      )
    ];

    const memberNames = {};

    if (memberIds.length > 0) {
      const memberResult = await supabase
        .from("members")
        .select("id, name")
        .in("id", memberIds);

      if (memberResult.error) {
        throw memberResult.error;
      }

      (memberResult.data || []).forEach(function (member) {
        memberNames[member.id] = member.name;
      });
    }

    rows.innerHTML = contributions
      .map(function (item) {
        return (
          "<tr>" +
          "<td>" +
          (item.contribution_date || "—") +
          "</td>" +
          "<td>" +
          (memberNames[item.member_id] || "—") +
          "</td>" +
          "<td>" +
          money(Number(item.amount || 0)) +
          "</td>" +
          "<td>" +
          (item.contribution_type || "—") +
          "</td>" +
          "<td>" +
          (item.payment_method || "—") +
          "</td>" +
          "<td>" +
          (item.reference || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

  } catch (error) {
    console.error(
      "CHAMA LIVE contributions error:",
      error
    );

    showError(error);
  }
}

loadContributions();
