import { supabase } from "./supabase.js";

import {
  getCurrentGroupId,
  money,
  showError
} from "./app.js";

async function loadContributions() {

  try {

    const rows =
      document.querySelector("#rows");

    if (!rows) {
      throw new Error("Missing #rows");
    }

    const groupId =
      await getCurrentGroupId();

    if (!groupId) {
      throw new Error(
        "No group is linked to this account."
      );
    }

    const result =
      await supabase
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

    const data =
      result.data || [];

    if (data.length === 0) {

      rows.innerHTML =
        "<tr><td colspan='6'>No contributions yet.</td></tr>";

      return;
    }

    rows.innerHTML =
      data.map(function (item) {

        return (
          "<tr>" +
          "<td>" +
          (item.contribution_date || "—") +
          "</td>" +
          "<td>—</td>" +
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

      }).join("");

  } catch (error) {

    console.error(
      "CONTRIBUTIONS V2 ERROR:",
      error
    );

    showError(error);
  }
}

loadContributions();
