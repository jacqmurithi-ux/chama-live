import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  showError
} from "./app.js";

async function loadMembers() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const {
      data: members,
      error
    } = await supabase
      .from("members")
      .select(
        "member_number, name, phone, email, role, status, onboarding_status"
      )
      .eq("group_id", groupId)
      .order("member_number", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    const rows = document.querySelector("#rows");

    if (!rows) {
      throw new Error("Members table container (#rows) was not found.");
    }

    if (!members || members.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="7">No members found.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = members
      .map(member => {
        return `
          <tr>
            <td>${escapeHtml(member.member_number ?? "—")}</td>
            <td>${escapeHtml(member.name ?? "—")}</td>
            <td>${escapeHtml(member.phone ?? "—")}</td>
            <td>${escapeHtml(member.email ?? "—")}</td>
            <td>${escapeHtml(member.role ?? "—")}</td>
            <td>${escapeHtml(member.status ?? "—")}</td>
            <td>${escapeHtml(member.onboarding_status ?? "—")}</td>
          </tr>
        `;
      })
      .join("");

  } catch (error) {
    console.error("CHAMA LIVE members error:", error);
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

loadMembers();
