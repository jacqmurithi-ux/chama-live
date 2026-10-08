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
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("meetingForm");

const titleInput =
  document.getElementById("title");

const dateInput =
  document.getElementById("meetingDate");

const startTimeInput =
  document.getElementById("meetingStartTime");

const endTimeInput =
  document.getElementById("meetingEndTime");

const meetingTypeInput =
  document.getElementById("meetingType");

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

  const status =
    String(
      value || "upcoming"
    )
      .trim()
      .toLowerCase();


  if (
    status === "completed"
  ) {

    return "completed";

  }


  if (
    status === "cancelled"
  ) {

    return "cancelled";

  }


  return "upcoming";

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


function formatTime(value) {
  if (!value) return "Not specified";
  const parts = String(value).split(":");
  const hour = Number(parts[0]);
  const minute = parts[1] || "00";
  if (!Number.isFinite(hour)) return String(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return displayHour + ":" + minute + " " + suffix;
}

function formatMeetingType(value) {
  const type = String(value || "regular").trim();
  return ({
    regular: "Regular",
    AGM: "AGM",
    special: "Special",
    committee: "Committee"
  })[type] || type;
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


  if (errorEl) {

    errorEl.textContent =
      message;

    errorEl.hidden =
      false;

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


  if (startTimeInput) {
    startTimeInput.value = meeting.start_time || "";
  }

  if (endTimeInput) {
    endTimeInput.value = meeting.end_time || "";
  }

  if (meetingTypeInput) {
    meetingTypeInput.value = meeting.type || "regular";
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
        start_time,
        end_time,
        type,
        venue,
        agenda,
        minutes,
        resolution,
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

  let upcoming = 0;

  let completed = 0;

  let cancelled = 0;


  meetings.forEach(
    meeting => {

      const status =
        normalizeStatus(
          meeting.status
        );


      if (
        status === "upcoming"
      ) {

        upcoming++;

      }
      else if (
        status === "completed"
      ) {

        completed++;

      }
      else {

        cancelled++;

      }

    }
  );


  if (upcomingCount) {

    upcomingCount.textContent =
      upcoming;

  }


  if (completedCount) {

    completedCount.textContent =
      completed;

  }


  if (cancelledCount) {

    cancelledCount.textContent =
      cancelled;

  }

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

function statusBadge(status) {

  const normalized =
    normalizeStatus(status);


  return `
    <span
      class="meeting-status meeting-status-${normalized}"
    >
      ${escapeHtml(normalized)}
    </span>
  `;

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

                <div class="muted">
                  ${escapeHtml(formatMeetingType(meeting.type))}
                </div>              </td>


              <td>
                ${statusBadge(status)}
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
    if (meetingAttendance) meetingAttendance.hidden = true;
    if (meetingRsvpSummary) meetingRsvpSummary.hidden = true;
    return;
  }

  const status = normalizeStatus(selectedMeeting.status);

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
        ${statusBadge(status)}
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
        <span class="meeting-meta-label">Time</span>
        <span class="meeting-meta-value">
          ${escapeHtml(formatTime(selectedMeeting.start_time))}
          ${selectedMeeting.end_time ? "– " + escapeHtml(formatTime(selectedMeeting.end_time)) : ""}
        </span>
      </div>

      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Type</span>
        <span class="meeting-meta-value">
          ${escapeHtml(formatMeetingType(selectedMeeting.type))}
        </span>
      </div>

      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Status</span>
        <span class="meeting-meta-value">
          ${escapeHtml(status)}
        </span>
      </div>

    </div>

    <div class="meeting-agenda-box">
      <div class="meeting-subtitle">Agenda</div>
      ${agendaHtml}
    </div>
  `;

  if (minutesInput) {
    minutesInput.value = selectedMeeting.minutes || "";
  }

  if (resolutionInput) {
    resolutionInput.value = selectedMeeting.resolution || "";
  }

  detailsCard.hidden = false;

  if (completeMeeting) {
    completeMeeting.hidden = status !== "upcoming";
  }

  if (cancelMeeting) {
    cancelMeeting.hidden =
      status === "cancelled" ||
      status === "completed";
  }

  if (restoreMeeting) {
    restoreMeeting.hidden = status !== "cancelled";
  }

  if (deleteMeeting) {
    deleteMeeting.hidden = false;
  }

  loadMeetingAttendance().catch(showError);
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

  const total =
    attendanceMembers.length;

  const attending =
    [...attendanceRows.values()]
      .filter(row =>
        row.status === "present" ||
        row.status === "late"
      ).length;

  const late =
    [...attendanceRows.values()]
      .filter(row => row.status === "late")
      .length;

  const apologies =
    [...attendanceRows.values()]
      .filter(row => row.status === "apology")
      .length;

  const absent =
    Math.max(
      0,
      total - attending - apologies
    );

  const required =
    quorumRequired(total);

  const quorumMet =
    total > 0 &&
    attending >= required;

  const rsvpAttending =
    [...attendanceRsvps.values()]
      .filter(row => row.status === "attending")
      .length;

  const rsvpApologies =
    [...attendanceRsvps.values()]
      .filter(row => row.status === "apology")
      .length;

  const noResponse =
    Math.max(
      0,
      total - rsvpAttending - rsvpApologies
    );

  meetingAttendanceStats.innerHTML = `
    <div class="meeting-meta-box">
      <span class="meeting-meta-label">RSVP</span>
      <span class="meeting-meta-value">
        Attending ${rsvpAttending} · Apologies ${rsvpApologies} · No response ${noResponse}
      </span>
    </div>

    <div class="meeting-meta-box">
      <span class="meeting-meta-label">Attendance</span>
      <span class="meeting-meta-value">
        Present ${attending} · Late ${late} · Apologies ${apologies} · Absent ${absent}
      </span>
    </div>

    <div class="meeting-meta-box">
      <span class="meeting-meta-label">Quorum</span>
      <span class="meeting-meta-value">
        ${attending} / ${required}
        · ${quorumMet ? "Quorum met" : "Quorum not met"}
      </span>
    </div>
  `;

  if (meetingRsvpSummary) {
    meetingRsvpSummary.hidden = false;
    meetingRsvpSummary.innerHTML = `
      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Member RSVP</span>
        <span class="meeting-meta-value">
          Attending ${rsvpAttending} · Apologies ${rsvpApologies} · No response ${noResponse}
        </span>
      </div>
    `;
  }
}


function renderAttendanceList() {

  if (!meetingAttendanceList) {
    return;
  }

  if (!attendanceMembers.length) {
    meetingAttendanceList.innerHTML =
      "<p class=\"muted\">No active group members found.</p>";
    return;
  }

  meetingAttendanceList.innerHTML =
    attendanceMembers.map(member => {

      const row =
        attendanceRows.get(member.id);

      const checked =
        row?.status === "present" ||
        row?.status === "late";

      const late =
        row?.status === "late";

      const rsvp =
        attendanceRsvps.get(member.id);

      const defaultStatus =
        rsvp?.status === "apology"
          ? "apology"
          : "absent";

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
              <small>
                ${escapeHtml(member.member_number || member.membership_number || "")}
                · RSVP: ${escapeHtml(rsvp?.status || "No response")}
              </small>
            </span>
          </label>

          <select
            data-attendance-status="${escapeHtml(member.id)}"
            aria-label="Attendance status for ${escapeHtml(member.name)}"
            ${checked ? "" : "hidden"}
          >
            <option value="present" ${!late ? "selected" : ""}>Present</option>
            <option value="late" ${late ? "selected" : ""}>Late</option>
          </select>

          <input
            type="hidden"
            data-attendance-default="${escapeHtml(member.id)}"
            value="${defaultStatus}"
          >
        </div>
      `;
    }).join("");

  renderAttendanceStats();
}


async function loadMeetingAttendance() {

  if (!selectedMeeting || !meetingAttendance) {
    return;
  }

  const { error } =
      await supabase
        .from("attendance")
        .upsert(
          rows,
          {
            onConflict: "meeting_id,member_id"
          }
        );

    if (error) throw error;

    const { data, error: reloadError } =
      await supabase
        .from("attendance")
        .select("member_id, status")
        .eq("meeting_id", selectedMeeting.id);

    if (reloadError) throw reloadError;

    attendanceRows =
      new Map(
        (data || [])
          .map(row => [row.member_id, row])
      );

    renderAttendanceList();

    showStatus("Attendance saved.");

    setTimeout(
      () => showStatus(""),
      2000
    );

  }
  finally {
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


    const startTime =
      String(startTimeInput?.value || "").trim();

    const endTime =
      String(endTimeInput?.value || "").trim();

    const meetingType =
      String(meetingTypeInput?.value || "regular").trim();

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


    if (!startTime) {
      throw new Error("Please select the meeting start time.");
    }

    if (endTime && endTime <= startTime) {
      throw new Error("End time must be later than start time.");
    }

    if (!["regular", "AGM", "special", "committee"].includes(meetingType)) {
      throw new Error("Please select a valid meeting type.");
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

      start_time:
        startTime,

      end_time:
        endTime ||
        null,

      type:
        meetingType,

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
            start_time,
            end_time,
            type,
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
            start_time,
            end_time,
            type,
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

async function updateMeetingStatus(
  newStatus
) {

  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  const allowed = [
    "upcoming",
    "completed",
    "cancelled"
  ];


  if (
    !allowed.includes(
      newStatus
    )
  ) {

    throw new Error(
      "Invalid meeting status."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .update({
        status:
          newStatus
      })
      .eq(
        "id",
        selectedMeeting.id
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
        start_time,
        end_time,
        type,
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


  if (!data) {

    throw new Error(
      "Meeting was not updated."
    );

  }


  selectedMeeting =
    data;


  await loadMeetings();

  renderMetrics();

  renderMeetings();

  renderDetails();


  showStatus(
    `Meeting marked ${newStatus}.`
  );


  setTimeout(
    () => showStatus(""),
    3000
  );

}


/* =========================================================
   SAVE MINUTES
========================================================= */

async function saveMeetingMinutes() {

  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  const minutes =
    String(
      minutesInput?.value ||
      ""
    ).trim();


  const resolution =
    String(
      resolutionInput?.value ||
      ""
    ).trim();


  if (saveMinutes) {

    saveMinutes.disabled =
      true;

    saveMinutes.textContent =
      "Saving...";

  }


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .update({

        minutes:
          minutes ||
          null,

        resolution:
          resolution ||
          null

      })
      .eq(
        "id",
        selectedMeeting.id
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
        start_time,
        end_time,
        type,
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


  if (!data) {

    throw new Error(
      "Minutes could not be saved."
    );

  }


  selectedMeeting =
    data;


  await loadMeetings();

  renderDetails();


  showStatus(
    "Minutes and resolutions saved successfully."
  );


  setTimeout(
    () => showStatus(""),
    3000
  );


  if (saveMinutes) {

    saveMinutes.disabled =
      false;

    saveMinutes.textContent =
      "Save Minutes & Resolutions";

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
      const checkbox =
        event.target.closest("input[data-attendance-member]");

      if (!checkbox) return;

      const memberId = checkbox.dataset.attendanceMember;
      const statusSelect =
        meetingAttendanceList.querySelector(
          `select[data-attendance-status="${CSS.escape(memberId)}"]`
        );

      if (statusSelect) {
        statusSelect.hidden = !checkbox.checked;
      }

      renderAttendanceStats();
    }
  );


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

      if (startTimeInput) startTimeInput.value = "";
      if (endTimeInput) endTimeInput.value = "";
      if (meetingTypeInput) meetingTypeInput.value = "regular";

      setCreateMode();

      clearError();

      showStatus("");

    }
  );


  completeMeeting?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        await updateMeetingStatus(
          "completed"
        );

      }
      catch (error) {

        showError(error);

      }

    }
  );


  cancelMeeting?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        await updateMeetingStatus(
          "cancelled"
        );

      }
      catch (error) {

        showError(error);

      }

    }
  );


  restoreMeeting?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        await updateMeetingStatus(
          "upcoming"
        );

      }
      catch (error) {

        showError(error);

      }

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


  saveMinutes?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        await saveMeetingMinutes();

      }
      catch (error) {

        showError(error);

        if (saveMinutes) {

          saveMinutes.disabled =
            false;

          saveMinutes.textContent =
            "Save Minutes & Resolutions";

        }

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

    showStatus(
      "Loading meetings..."
    );

    await requireAuth();


      currentMember =
        await getMyMember();

      if (!currentMember) {
        throw new Error(
          "No member record is linked to this account."
        );
      }

      groupId = null;

      setCreateMode();

      if (dateInput) {
        dateInput.value =
          getToday();
      }

      form?.addEventListener(
        "submit",
        saveMeetingForm
      );

      setupButtons();
      setupTableActions();

    }

    await loadMeetings();

    renderMetrics();
    renderMeetings();
    renderDetails();

    showStatus(
      "Meetings ready."
    );

    setTimeout(
      () => showStatus(""),
      2000
    );

  }
  catch (error) {

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
