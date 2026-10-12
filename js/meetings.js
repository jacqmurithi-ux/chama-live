/* =========================================================
   CHAMA LIVE — MEETINGS
   FINAL STABLE + VISUALLY ENHANCED VERSION

   FEATURES
   ---------------------------------------------------------
   • Load group meetings
   • Schedule meetings
   • Edit meetings
   • View meeting details
   • Mark completed
   • Cancel meeting
   • Restore cancelled meeting
   • Save minutes and resolutions
   • Delete meetings
   • Filter by status
   • Upcoming / Completed / Cancelled totals
   • Safe rendering
   • Group-isolated data

   DATABASE RULE
   ---------------------------------------------------------
   meetings.group_id = currentMember.group_id
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: meetings.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("meetingStatus");

const errorEl =
  document.getElementById("meetingError") || document.getElementById("meetingStatus");

const form =
  document.getElementById("meetingForm");

const titleInput =
  document.getElementById("meetingTitle");

const dateInput =
  document.getElementById("meetingDate");

const venueInput =
  document.getElementById("venue");

const agendaInput =
  document.getElementById("agenda");

const saveButton =
  document.getElementById("saveMeeting");

const cancelEdit =
  document.getElementById("cancelEdit");

const statusFilter =
  document.getElementById("statusFilter");

const meetingRows =
  document.getElementById("meetingRows");

const upcomingCount =
  document.getElementById("upcomingCount");

const completedCount =
  document.getElementById("completedCount");

const cancelledCount =
  document.getElementById("cancelledCount");

const detailsCard =
  document.getElementById("detailsCard");

const meetingDetails =
  document.getElementById("meetingDetails");

const editMeeting =
  document.getElementById("editMeeting");

const completeMeeting =
  document.getElementById("completeMeeting");

const cancelMeeting =
  document.getElementById("cancelMeeting");

const restoreMeeting =
  document.getElementById("restoreMeeting");

const deleteMeeting =
  document.getElementById("deleteMeeting");

const minutesInput =
  document.getElementById("minutes");

const resolutionInput =
  document.getElementById("resolution");

const meetingRsvpSummary =
  document.getElementById("meetingRsvpSummary");

const meetingAttendance =
  document.getElementById("meetingAttendance");

const meetingAttendanceStats =
  document.getElementById("meetingAttendanceStats");

const meetingAttendanceList =
  document.getElementById("meetingAttendanceList");

const saveMeetingAttendance =
  document.getElementById("saveMeetingAttendance");

const saveMinutes =
  document.getElementById("saveMinutes");


/* =========================================================
   STATE
========================================================= */

let currentMember = null;

let groupId = null;

let meetings = [];

let selectedMeeting = null;

let editingMeetingId = null;

let attendanceMembers = [];

let attendanceRsvps = new Map();

let attendanceRows = new Map();

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(value) {
  const status = String(value || "upcoming").trim().toLowerCase();
  return ["upcoming", "held_pending_minutes", "completed", "cancelled", "postponed"].includes(status)
    ? status
    : "review";
}


/* =========================================================
   DATE
========================================================= */

function formatDate(value) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}



function getToday() {

  const date =
    new Date();


  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0")

  ].join("-");

}


/* =========================================================
   AGENDA
========================================================= */

function agendaToArray(value) {

  if (
    Array.isArray(value)
  ) {

    return value
      .map(
        item =>
          String(item ?? "").trim()
      )
      .filter(Boolean);

  }


  return String(
    value || ""
  )
    .split("\n")
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);


}


function agendaToText(value) {

  return agendaToArray(value)
    .join("\n");

}


/* =========================================================
   UI MESSAGES
========================================================= */

function showStatus(message) {

  if (!statusEl) {

    return;

  }


  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

  statusEl.className =
    message
      ? "meeting-status is-visible"
      : "meeting-status";

}


function clearError() {

  if (!errorEl) {

    return;

  }


  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Meetings:",
    error
  );


  const message =
    error?.message ||
    String(error) ||
    "Unable to process meeting.";


  const messageTarget =
    errorEl || statusEl;

  if (messageTarget) {

    messageTarget.textContent =
      message;

    messageTarget.hidden =
      false;

    messageTarget.className =
      "meeting-status error is-visible";

  }

}


/* =========================================================
   FORM MODE
========================================================= */

function setCreateMode() {

  editingMeetingId =
    null;


  if (saveButton) {

    saveButton.textContent =
      "Schedule Meeting";

  }


  if (cancelEdit) {

    cancelEdit.hidden =
      true;

  }

}


function setEditMode(meeting) {

  if (!meeting) {

    return;

  }


  editingMeetingId =
    meeting.id;


  if (titleInput) {

    titleInput.value =
      meeting.title || "";

  }


  if (dateInput) {

    dateInput.value =
      meeting.date || "";

  }

  if (venueInput) {

    venueInput.value =
      meeting.venue || "";

  }


  if (agendaInput) {

    agendaInput.value =
      agendaToText(
        meeting.agenda
      );

  }


  if (saveButton) {

    saveButton.textContent =
      "Update Meeting";

  }


  if (cancelEdit) {

    cancelEdit.hidden =
      false;

  }


  form?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings() {

  if (!groupId) {
    throw new Error(
      "No group is associated with this account."
    );
  }

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        group_id,
        title,
        date,
        venue,
        agenda,
        minutes,
        resolution,
        resolution_not_required,
        status_reason,
        postponed_to,
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "date",
        {
          ascending: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  meetings =
    data || [];

}


/* =========================================================
   METRICS
========================================================= */

function renderMetrics() {
  const today = getToday();
  let upcoming = 0;
  let held = 0;
  let completed = 0;
  let cancelled = 0;
  let postponed = 0;
  let actionRequired = 0;

  meetings.forEach(meeting => {
    const status = normalizeStatus(meeting.status);
    if (status === "upcoming" && meeting.date && meeting.date < today) {
      actionRequired++;
    } else if (status === "review") {
      actionRequired++;
    } else if (status === "upcoming") {
      upcoming++;
    } else if (status === "held_pending_minutes") {
      held++;
    } else if (status === "completed") {
      completed++;
    } else if (status === "cancelled") {
      cancelled++;
    } else if (status === "postponed") {
      postponed++;
    }
  });

  if (upcomingCount) upcomingCount.textContent = upcoming;
  if (document.getElementById("heldPendingCount")) document.getElementById("heldPendingCount").textContent = held;
  if (completedCount) completedCount.textContent = completed;
  if (cancelledCount) cancelledCount.textContent = cancelled;
  if (document.getElementById("postponedCount")) document.getElementById("postponedCount").textContent = postponed;
  if (document.getElementById("actionRequiredCount")) document.getElementById("actionRequiredCount").textContent = actionRequired;
}


/* =========================================================
   FILTER
========================================================= */

function getFilteredMeetings() {

  const filter =
    String(
      statusFilter?.value ||
      "all"
    )
      .trim()
      .toLowerCase();


  return meetings.filter(
    meeting => {

      const status =
        normalizeStatus(
          meeting.status
        );


      return (
        filter === "all" ||
        filter === status
      );

    }
  );

}


/* =========================================================
   STATUS BADGE
========================================================= */

function statusLabel(status) {
  const labels = {
    upcoming: "Upcoming",
    held_pending_minutes: "Held — minutes pending",
    completed: "Completed",
    cancelled: "Cancelled",
    postponed: "Postponed",
    review: "Unknown status — review"
  };
  return labels[normalizeStatus(status)] || "Unknown status — review";
}

function statusBadge(status, meeting = null) {
  const normalized = normalizeStatus(status);
  const overdue = normalized === "upcoming" && meeting?.date && meeting.date < getToday();
  const label = overdue ? "Action required · confirm outcome" : statusLabel(normalized);
  return `<span class="meeting-status-badge ${escapeHtml(normalized)}">${escapeHtml(label)}</span>`;
}


/* =========================================================
   RENDER TABLE
========================================================= */

function renderMeetings() {

  if (!meetingRows) {

    return;

  }


  const list =
    getFilteredMeetings();


  if (!list.length) {

    meetingRows.innerHTML = `
      <tr>
        <td colspan="5">

          <div class="meeting-empty-state">

            <div class="meeting-empty-icon">
              ◷
            </div>

            <strong>
              No meetings found
            </strong>

            <div class="muted">
              Schedule a meeting to see it here.
            </div>

          </div>

        </td>
      </tr>
    `;

    return;

  }


  meetingRows.innerHTML =
    list
      .map(
        meeting => {

          const status =
            normalizeStatus(
              meeting.status
            );


          return `
            <tr>

              <td class="meeting-date">
                ${escapeHtml(
                  formatDate(
                    meeting.date
                  )
                )}
              </td>


              <td class="meeting-title-cell">

                <div class="meeting-title-main">
                  ${escapeHtml(
                    meeting.title ||
                    "Untitled Meeting"
                  )}
                </div>

              </td>


              <td class="meeting-venue">
                ${escapeHtml(
                  meeting.venue ||
                  "—"
                )}

              </td>


              <td>
                ${statusBadge(status, meeting)}
              </td>


              <td>

                <div class="meeting-actions">

                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-action="view"
                    data-id="${escapeHtml(
                      meeting.id
                    )}"
                  >
                    View
                  </button>

                </div>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER DETAILS
========================================================= */

function renderDetails() {

  if (!detailsCard || !meetingDetails) {
    return;
  }

  if (!selectedMeeting) {
    detailsCard.hidden = true;
    detailsCard.classList.remove("is-visible");
    const lifecycleEditor = document.getElementById("meetingLifecycleEditor");
    if (lifecycleEditor) lifecycleEditor.hidden = true;
    if (historyHost) historyHost.hidden = true;
    if (meetingAttendance) meetingAttendance.hidden = true;
    if (meetingRsvpSummary) meetingRsvpSummary.hidden = true;
    return;
  }

  const status = normalizeStatus(selectedMeeting.status);
  const lifecycleEditor = document.getElementById("meetingLifecycleEditor");
  const historyHost = document.getElementById("meetingStatusHistory");

  const agenda = agendaToArray(selectedMeeting.agenda);

  const agendaHtml = agenda.length
    ? `
      <ol class="meeting-agenda-list">
        ${agenda.map(item => `
          <li>${escapeHtml(item)}</li>
        `).join("")}
      </ol>
    `
    : `
      <div class="meeting-empty-text">
        No agenda recorded.
      </div>
    `;

  meetingDetails.innerHTML = `
    <div class="meeting-detail-header">
      <div>
        <h2 class="meeting-detail-title">
          ${escapeHtml(selectedMeeting.title || "Untitled Meeting")}
        </h2>
        <div class="muted">
          Meeting details and official record
        </div>
      </div>
      <div>
        ${statusBadge(status, selectedMeeting)}
      </div>
    </div>

    <div class="meeting-detail-meta">

      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Date</span>
        <span class="meeting-meta-value">
          ${escapeHtml(formatDate(selectedMeeting.date))}
        </span>
      </div>

      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Venue</span>
        <span class="meeting-meta-value">
          ${escapeHtml(selectedMeeting.venue || "Not specified")}
        </span>
      </div>


      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Status</span>
        <span class="meeting-meta-value">${escapeHtml(statusLabel(status))}</span>
      </div>
      ${selectedMeeting.status_reason ? `<div class="meeting-meta-box"><span class="meeting-meta-label">Reason / follow-up</span><span class="meeting-meta-value">${escapeHtml(selectedMeeting.status_reason)}</span></div>` : ""}
      ${selectedMeeting.postponed_to ? `<div class="meeting-meta-box"><span class="meeting-meta-label">Proposed new date</span><span class="meeting-meta-value">${escapeHtml(formatDate(selectedMeeting.postponed_to))}</span></div>` : ""}

    </div>

    <div class="meeting-agenda-box">
      <div class="meeting-subtitle">Agenda</div>
      ${agendaHtml}
    </div>
  `;

  if (minutesInput) {
    minutesInput.value = selectedMeeting.minutes || "";
  }

  if (resolutionInput) resolutionInput.value = selectedMeeting.resolution || "";
  const noResolutionInput = document.getElementById("resolutionNotRequired");
  if (noResolutionInput) noResolutionInput.checked = Boolean(selectedMeeting.resolution_not_required);
  const reasonInput = document.getElementById("meetingStatusReason");
  if (reasonInput) reasonInput.value = "";
  const postponedDateInput = document.getElementById("postponedToDate");
  if (postponedDateInput) postponedDateInput.value = selectedMeeting.postponed_to || "";

  detailsCard.hidden = false;
  detailsCard.classList.add("is-visible");
  if (lifecycleEditor) lifecycleEditor.hidden = false;
  if (historyHost) historyHost.hidden = false;
  const setVisible = (id, visible) => { const el = document.getElementById(id); if (el) el.hidden = !visible; };
  setVisible("markMeetingHeld", status === "upcoming" || status === "review");
  setVisible("markMeetingCompleted", status === "held_pending_minutes");
  setVisible("cancelMeetingLifecycle", !["cancelled", "completed", "review"].includes(status));
  setVisible("postponeMeetingLifecycle", !["cancelled", "completed", "review"].includes(status));
  setVisible("restorePostponedMeeting", status === "postponed");
  setVisible("restoreCancelledMeeting", status === "cancelled");
  const hint = document.getElementById("meetingCompletionHint");
  if (hint) hint.textContent = status === "held_pending_minutes"
    ? "Meeting held. Record minutes, attendance, and a resolution — or confirm no resolution was made — before completing."
    : status === "upcoming"
      ? "After the meeting date, confirm whether it was held, cancelled, or postponed."
      : status === "postponed"
        ? "Use the proposed date below to return this meeting to the upcoming schedule."
        : status === "completed"
          ? "Completed record. Save any authorised corrections to the minutes or resolution below."
          : "Record the meeting outcome and keep the status current.";
  if (meetingAttendance) meetingAttendance.hidden = false;

  // Legacy one-click controls bypass required minutes/attendance/reason fields.
  if (completeMeeting) completeMeeting.hidden = true;

  if (cancelMeeting) cancelMeeting.hidden = true;

  if (restoreMeeting) restoreMeeting.hidden = true;

  if (deleteMeeting) {
    deleteMeeting.hidden = false;
  }

  loadMeetingAttendance().catch(showError);
  loadMeetingStatusHistory(selectedMeeting.id).catch(error => {
    console.error("Meeting status history could not be loaded", error);
    const historyContent = document.getElementById("meetingStatusHistoryContent");
    if (historyContent && String(selectedMeeting?.id || "") === String(historyHost?.dataset?.meetingId || "")) {
      historyContent.textContent = "Status history is unavailable. Refresh and try again.";
    }
  });
}


/* =========================================================
   RSVP / ATTENDANCE / QUORUM
========================================================= */

function quorumRequired(memberCount) {
  return Math.floor(Number(memberCount || 0) / 2) + 1;
}


function renderAttendanceStats() {
  if (!meetingAttendanceStats) {
    return;
  }

  const total = attendanceMembers.length;
  const present = [...attendanceRows.values()]
    .filter(row => row.status === "present")
    .length;
  const absent = Math.max(0, total - present);
  const required = quorumRequired(total);
  const quorumMet = total > 0 && present >= required;

  meetingAttendanceStats.innerHTML = `
    <div class="meeting-meta-box">
      <span class="meeting-meta-label">Attendance</span>
      <span class="meeting-meta-value">
        Present ${present} · Absent ${absent}
      </span>
    </div>

    <div class="meeting-meta-box">
      <span class="meeting-meta-label">Quorum</span>
      <span class="meeting-meta-value">
        ${present} / ${required}
        · ${quorumMet ? "Quorum met" : "Quorum not met"}
      </span>
    </div>
  `;

  if (meetingRsvpSummary) {
    // No RSVP source is currently connected to this page.
    meetingRsvpSummary.hidden = true;
    meetingRsvpSummary.replaceChildren();
  }
}


function renderAttendanceList() {
  if (!meetingAttendanceList) {
    return;
  }

  if (!attendanceMembers.length) {
    meetingAttendanceList.innerHTML =
      '<p class="muted">No active group members found.</p>';
    renderAttendanceStats();
    return;
  }

  meetingAttendanceList.innerHTML = attendanceMembers.map(member => {
    const row = attendanceRows.get(String(member.id));
    const checked = row?.status === "present";

    return `
      <div class="meeting-attendance-row">
        <label>
          <input
            type="checkbox"
            data-attendance-member="${escapeHtml(member.id)}"
            ${checked ? "checked" : ""}
          >
          <span>
            <strong>${escapeHtml(member.name)}</strong>
            <small>${escapeHtml(member.member_number || member.membership_number || "")}</small>
          </span>
        </label>
        <span class="meeting-attendance-status">${checked ? "Present" : "Absent"}</span>
      </div>
    `;
  }).join("");

  renderAttendanceStats();
}

async function loadMeetingAttendance() {

  if (!selectedMeeting || !meetingAttendance) {
    return;
  }

  meetingAttendance.hidden = false;

  const [membersResult, attendanceResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, name, member_number, membership_number")
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("name", { ascending: true }),

    supabase
      .from("attendance")
      .select("member_id, status")
      .eq("meeting_id", selectedMeeting.id)
  ]);

  if (membersResult.error) throw membersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;

  attendanceMembers = Array.isArray(membersResult.data)
    ? membersResult.data
    : [];

  attendanceRows = new Map(
    (attendanceResult.data || [])
      .map(row => [String(row.member_id), row])
  );

  // No separate RSVP table is queried here; do not invent RSVP records.
  attendanceRsvps = new Map();

  renderAttendanceList();
}


async function saveAttendance() {
  if (!selectedMeeting || !groupId) {
    throw new Error("Select a meeting before saving attendance.");
  }

  if (!saveMeetingAttendance) {
    throw new Error("The Save Attendance button is unavailable.");
  }

  saveMeetingAttendance.disabled = true;
  saveMeetingAttendance.textContent = "Saving...";

  try {
    // The database CHECK constraint permits only "present" and "absent".
    // Keep the UI payload strictly within that persisted contract.
    const rows = attendanceMembers.map(member => {
      const memberId = String(member.id);
      const checkbox = meetingAttendanceList?.querySelector(
        `input[data-attendance-member="${CSS.escape(memberId)}"]`
      );

      return {
        meeting_id: selectedMeeting.id,
        member_id: member.id,
        status: checkbox?.checked ? "present" : "absent"
      };
    });

    if (rows.length) {
      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "meeting_id,member_id" });

      if (error) throw error;
    }

    const { data, error: reloadError } = await supabase
      .from("attendance")
      .select("member_id, status")
      .eq("meeting_id", selectedMeeting.id);

    if (reloadError) throw reloadError;

    attendanceRows = new Map(
      (data || []).map(row => [String(row.member_id), row])
    );

    renderAttendanceList();
    showStatus("Attendance saved.");
    setTimeout(() => showStatus(""), 2000);
  } finally {
    saveMeetingAttendance.disabled = false;
    saveMeetingAttendance.textContent = "Save Attendance";
  }
}


/* =========================================================
   CREATE / UPDATE
========================================================= */

async function saveMeetingForm(event) {

  event.preventDefault();

  clearError();

  showStatus("");


  try {

    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    if (!currentMember?.id) {

      throw new Error(
        "Your member record could not be found."
      );

    }


    const title =
      String(
        titleInput?.value ||
        ""
      ).trim();


    const date =
      String(
        dateInput?.value ||
        ""
      ).trim();


    const venue =
      String(venueInput?.value || "").trim();

    const agenda =
      agendaToArray(
        agendaInput?.value
      );


    if (!title) {

      throw new Error(
        "Please enter a meeting title."
      );

    }


    if (!date) {

      throw new Error(
        "Please select the meeting date."
      );

    }



    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        editingMeetingId
          ? "Updating..."
          : "Saving...";

    }


    const payload = {

      group_id:
        groupId,

      title:
        title,

      date:
        date,

      venue:
        venue ||
        null,

      agenda:
        agenda

    };


    /* =====================================================
       UPDATE
    ====================================================== */

    if (editingMeetingId) {

      const {
        data,
        error
      } =
        await supabase
          .from("meetings")
          .update(
            payload
          )
          .eq(
            "id",
            editingMeetingId
          )
          .eq(
            "group_id",
            groupId
          )
          .select(`
            id,
            group_id,
            title,
            date,
                venue,
            agenda,
            minutes,
            resolution,
            status,
            created_at
          `)
          .single();


      if (error) {

        throw error;

      }


      selectedMeeting =
        data;


      showStatus(
        "Meeting updated successfully."
      );

    }


    /* =====================================================
       CREATE
    ====================================================== */

    else {

      payload.status =
        "upcoming";


      const {
        data,
        error
      } =
        await supabase
          .from("meetings")
          .insert(
            payload
          )
          .select(`
            id,
            group_id,
            title,
            date,
                venue,
            agenda,
            minutes,
            resolution,
            status,
            created_at
          `)
          .single();


      if (error) {

        throw error;

      }


      selectedMeeting =
        data;


      showStatus(
        "Meeting scheduled successfully."
      );

    }


    /* =====================================================
       RESET FORM
    ====================================================== */

    form?.reset();


    if (dateInput) {

      dateInput.value =
        getToday();

    }


    setCreateMode();


    /* =====================================================
       REFRESH
    ====================================================== */

    await loadMeetings();

    renderMetrics();

    renderMeetings();


    if (selectedMeeting) {

      selectedMeeting =
        meetings.find(
          meeting =>
            String(
              meeting.id
            ) ===
            String(
              selectedMeeting.id
            )
        ) ||
        null;

    }


    renderDetails();


    setTimeout(
      () => showStatus(""),
      3000
    );

  }
  catch (error) {

    showError(error);

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        editingMeetingId
          ? "Update Meeting"
          : "Schedule Meeting";

    }

  }

}


/* =========================================================
   VIEW MEETING
========================================================= */

function viewMeeting(id) {

  selectedMeeting =
    meetings.find(
      meeting =>
        String(
          meeting.id
        ) ===
        String(id)
    ) ||
    null;


  renderDetails();


  if (selectedMeeting) {

    detailsCard?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


/* =========================================================
   UPDATE STATUS
========================================================= */

async function updateMeetingStatus(newStatus) {
  if (!selectedMeeting) throw new Error("Select a meeting first.");
  const allowed = ["upcoming", "held_pending_minutes", "completed", "cancelled", "postponed"];
  if (!allowed.includes(newStatus)) throw new Error("Invalid meeting status.");

  const reason = String(document.getElementById("meetingStatusReason")?.value || "").trim();
  const postponedTo = String(document.getElementById("postponedToDate")?.value || "").trim();
  const minutes = String(minutesInput?.value || "").trim();
  const resolution = String(resolutionInput?.value || "").trim();
  const noResolution = Boolean(document.getElementById("resolutionNotRequired")?.checked);
  const payload = {
    status: newStatus,
    status_reason: ["cancelled", "postponed"].includes(newStatus) ? reason : null,
    postponed_to: newStatus === "postponed" ? postponedTo : null
  };

  if (["cancelled", "postponed"].includes(newStatus) && !reason) {
    throw new Error("A reason is required before cancelling or postponing this meeting.");
  }
  if (newStatus === "postponed") {
    if (!postponedTo) throw new Error("Choose the proposed new meeting date.");
    if (postponedTo <= selectedMeeting.date) throw new Error("The new date must be later than the current meeting date.");
  }
  if (newStatus === "completed") {
    if (!minutes) throw new Error("Record the meeting minutes before marking it completed.");
    if (!resolution && !noResolution) throw new Error("Record a resolution or confirm that no resolution was made.");
    const missingAttendance = attendanceMembers.filter(member => !attendanceRows.has(String(member.id)));
    if (missingAttendance.length) throw new Error("Save attendance for every active member before completing the meeting.");
    payload.minutes = minutes;
    payload.resolution = resolution || null;
    payload.resolution_not_required = noResolution;
  }
  if (newStatus === "upcoming" && selectedMeeting.status === "postponed") {
    if (!selectedMeeting.postponed_to) throw new Error("This postponed meeting has no proposed new date.");
    payload.date = selectedMeeting.postponed_to;
  }
  if (newStatus === "upcoming") {
    payload.status_reason = null;
    payload.postponed_to = null;
  }

  const { data, error } = await supabase
    .from("meetings")
    .update(payload)
    .eq("id", selectedMeeting.id)
    .eq("group_id", groupId)
    .select(`id, group_id, title, date, venue, agenda, minutes, resolution, resolution_not_required, status_reason, postponed_to, status, created_at`)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Meeting status was not updated.");

  selectedMeeting = data;
  await loadMeetings();
  renderMetrics();
  renderMeetings();
  renderDetails();
  showStatus(`Meeting status updated: ${statusLabel(newStatus)}.`);
  setTimeout(() => showStatus(""), 3000);
}


/* =========================================================
   SAVE MINUTES
========================================================= */



async function saveMeetingMinutes() {
  if (!selectedMeeting) throw new Error("Select a meeting first.");
  const minutes = String(minutesInput?.value || "").trim();
  const resolution = String(resolutionInput?.value || "").trim();
  const resolutionNotRequired = Boolean(document.getElementById("resolutionNotRequired")?.checked);
  if (!minutes) throw new Error("Minutes are required to save the official meeting record.");
  if (!resolution && !resolutionNotRequired) throw new Error("Record a resolution or confirm no resolution was made.");

  if (saveMinutes) {
    saveMinutes.disabled = true;
    saveMinutes.textContent = "Saving...";
  }
  try {
    const { data, error } = await supabase
      .from("meetings")
      .update({ minutes, resolution: resolution || null, resolution_not_required: resolutionNotRequired })
      .eq("id", selectedMeeting.id)
      .eq("group_id", groupId)
      .select(`id, group_id, title, date, venue, agenda, minutes, resolution, resolution_not_required, status_reason, postponed_to, status, created_at`)
      .single();
    if (error) throw error;
    if (!data) throw new Error("Meeting record could not be saved.");
    selectedMeeting = data;
    await loadMeetings();
    renderDetails();
    showStatus("Meeting record saved. Mark it completed when attendance and record are complete.");
    setTimeout(() => showStatus(""), 3000);
  } finally {
    if (saveMinutes) {
      saveMinutes.disabled = false;
      saveMinutes.textContent = "Save Meeting Record";
    }
  }
}


/* =========================================================
   DELETE
========================================================= */

async function removeMeeting() {

  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  const confirmed =
    window.confirm(
      "Are you sure you want to delete this meeting?"
    );


  if (!confirmed) {

    return;

  }


  const id =
    selectedMeeting.id;


  const {
    error
  } =
    await supabase
      .from("meetings")
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    throw error;

  }


  selectedMeeting =
    null;


  await loadMeetings();

  renderMetrics();

  renderMeetings();

  renderDetails();


  showStatus(
    "Meeting deleted successfully."
  );


  setTimeout(
    () => showStatus(""),
    3000
  );

}


/* =========================================================
   TABLE ACTIONS
========================================================= */

function setupTableActions() {

  if (!meetingRows) {

    return;

  }


  meetingRows.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {

        return;

      }


      const action =
        String(
          button.dataset.action ||
          ""
        )
          .trim()
          .toLowerCase();


      if (
        action === "view"
      ) {

        viewMeeting(
          button.dataset.id
        );

      }

    }
  );

}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function setupButtons() {

  document
    .getElementById("refreshMeetings")
    ?.addEventListener(
      "click",
      async event => {
        const button = event.currentTarget;

        button.disabled = true;
        button.textContent = "Refreshing…";

        try {
          clearError();
          showStatus("Refreshing meetings...");

          await loadMeetings();
          renderMetrics();
          renderMeetings();
          renderDetails();

          showStatus("Meetings refreshed.");

          setTimeout(
            () => showStatus(""),
            2000
          );
        }
        catch (error) {
          showError(error);
        }
        finally {
          button.disabled = false;
          button.textContent = "Refresh";
        }
      }
    );

  statusFilter?.addEventListener(
    "change",
    renderMeetings
  );


  meetingAttendanceList?.addEventListener(
    "change",
    event => {
      if (event.target.matches("input[data-attendance-member]")) {
        const memberId = String(event.target.dataset.attendanceMember);
        const statusLabel = event.target
          .closest(".meeting-attendance-row")
          ?.querySelector(".meeting-attendance-status");

        if (statusLabel) {
          statusLabel.textContent = event.target.checked ? "Present" : "Absent";
        }

        renderAttendanceStats();
      }
    }
  );


  document.getElementById("meetingLifecycleEditor")?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-lifecycle-action]");
    if (!button) return;
    const action = button.dataset.lifecycleAction;
    try {
      clearError();
      button.disabled = true;
      if (action === "held") await updateMeetingStatus("held_pending_minutes");
      else if (action === "completed") await updateMeetingStatus("completed");
      else if (action === "cancelled") await updateMeetingStatus("cancelled");
      else if (action === "postponed") await updateMeetingStatus("postponed");
      else if (action === "restore-upcoming") await updateMeetingStatus("upcoming");
      else if (action === "save-record") await saveMeetingMinutes();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });

  saveMeetingAttendance?.addEventListener(
    "click",
    async () => {
      try {
        clearError();
        await saveAttendance();
      }
      catch (error) {
        showError(error);
      }
    }
  );


  editMeeting?.addEventListener(
    "click",
    () => {

      if (!selectedMeeting) {

        return;

      }


      setEditMode(
        selectedMeeting
      );

    }
  );


  cancelEdit?.addEventListener(
    "click",
    () => {

      form?.reset();

      if (dateInput) {
        dateInput.value = getToday();
      }

      setCreateMode();

      clearError();

      showStatus("");

    }
  );


  deleteMeeting?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        await removeMeeting();

      }
      catch (error) {

        showError(error);

      }

    }
  );




}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {
    return;
  }

  initialized = true;

  try {

    clearError();
    showStatus("Loading meetings...");

    await requireAuth();

    currentMember = await getMyMember();

    if (!currentMember?.id) {
      throw new Error(
        "No member record is linked to this account."
      );
    }

    groupId = currentMember.group_id;

    if (!groupId) {
      throw new Error(
        "Your member record is not linked to a group."
      );
    }

    setCreateMode();

    if (dateInput) {
      dateInput.value = getToday();
    }

    if (form) {
      form.addEventListener("submit", saveMeetingForm);
    }

    setupButtons();
    setupTableActions();

    await loadMeetings();

    renderMetrics();
    renderMeetings();
    renderDetails();

    showStatus("Meetings ready.");

    setTimeout(
      () => showStatus(""),
      2000
    );

  } catch (error) {

    initialized = false;
    showStatus("");
    showError(error);

  }

}

/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initMeetings =
  initPage;


/* =========================================================
   BOOT OWNERSHIP
   ---------------------------------------------------------
   layout.js is the sole page boot owner.

   meetings.js intentionally does NOT attach its own
   DOMContentLoaded handler and does NOT call initPage()
   automatically.

   This prevents a race between module auto-initialization
   and layout.js dynamic initialization.
========================================================= */

console.log(
  "CHAMA LIVE: meetings.js ready"
);
