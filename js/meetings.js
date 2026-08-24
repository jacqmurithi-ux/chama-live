import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  showError
} from "./app.js";

async function loadMeetings() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const {
      data: meetings,
      error
    } = await supabase
      .from("meetings")
      .select(
        "date, title, venue, status, resolution"
      )
      .eq("group_id", groupId)
      .order("date", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    const rows = document.querySelector("#rows");

    if (!rows) {
      throw new Error(
        "Meetings table container (#rows) was not found."
      );
    }

    const meetingRows = meetings || [];

    if (meetingRows.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="5">No meetings yet.</td>
        </tr>
      `;
      return;
    }

    rows.innerHTML = meetingRows
      .map(meeting => `
        <tr>
          <td>${escapeHtml(meeting.date ?? "—")}</td>
          <td>${escapeHtml(meeting.title ?? "—")}</td>
          <td>${escapeHtml(meeting.venue ?? "—")}</td>
          <td>${escapeHtml(meeting.status ?? "—")}</td>
          <td>${escapeHtml(meeting.resolution ?? "—")}</td>
        </tr>
      `)
      .join("");

  } catch (error) {
    console.error(
      "CHAMA LIVE meetings error:",
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

loadMeetings();
