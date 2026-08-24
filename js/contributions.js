import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  money,
  showError
} from "./app.js";

async function loadContributions() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const {
      data: contributions,
      error
    } = await supabase
      .from("contributions")
      .select(
        "contribution_date, amount, contribution_type, payment_method, member_id"
      )
      .eq("group_id", groupId)
      .order("contribution_date", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    const rows = document.querySelector("#rows");

    if (!rows) {
      throw new Error(
        "Contributions table container (#rows) was not found."
      );
    }

    const contributionRows = contributions || [];

    const memberIds = [
      ...new Set(
        contributionRows
          .map(row => row.member_id)
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

      memberNames = Object.fromEntries(
        (members || []).map(member => [
          member.id,
          member.name
        ])
      );
    }

    if (contributionRows.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="5">No contributions yet.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = contributionRows
      .map(contribution => `
        <tr>
          <td>${escapeHtml(
            contribution.contribution_date ?? "—"
          )}</td>

          <td>${escapeHtml(
            memberNames[contribution.member_id] ?? "—"
          )}</td>

          <td>${money(contribution.amount)}</td>

          <td>${escapeHtml(
            contribution.contribution_type ?? "—"
          )}</td>

          <td>${escapeHtml(
            contribution.payment_method ?? "—"
          )}</td>
        </tr>
      `)
      .join("");

  } catch (error) {
    console.error(
      "CHAMA LIVE contributions error:",
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
