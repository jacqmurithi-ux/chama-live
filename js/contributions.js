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
      throw new Error(
        "The contributions table (#rows) is missing."
      );
    }


    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error(
        "No group is linked to this account."
      );
    }


    const {
      data,
      error
    } = await supabase
      .from("contributions")
      .select(
        "contribution_date, amount, contribution_type, payment_method, reference, member_id"
      )
      .eq("group_id", groupId)
      .order("contribution_date", {
        ascending: false
      });


    if (error) {
      throw error;
    }


    const contributions = data || [];


    if (contributions.length === 0) {

      rows.innerHTML = `
        <tr>
          <td colspan="6">
            No contributions yet.
          </td>
        </tr>
      `;

      return;
    }


    const memberIds = [
      ...new Set(
        contributions
          .map(item => item.member_id)
          .filter(Boolean)
      )
    ];


    let memberNames = {};


    if (memberIds.length > 0) {

      const {
        data: members,
        error: memberError
      } = await supabase
        .from("members")
        .select("id, name")
        .in("id", memberIds);


      if (memberError) {
        throw memberError;
      }


      for (const member of members || []) {

        memberNames[member.id] =
          member.name;

      }
    }


    rows.innerHTML = contributions
      .map(item => {

        const memberName =
          memberNames[item.member_id] || "—";


        return `
          <tr>

            <td>
              ${escapeHtml(
                item.contribution_date || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                memberName
              )}
            </td>

            <td>
              ${money(
                Number(item.amount || 0)
              )}
            </td>

            <td>
              ${escapeHtml(
                item.contribution_type || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                item.payment_method || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                item.reference || "—"
              )}
            </td>

          </tr>
        `;

      })
      .join("");


  } catch (error) {

    console.error(
      "CHAMA LIVE contributions:",
      error
    );

    showError(error);

  }

}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


loadContributions();
