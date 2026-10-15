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
   • Save the meeting brief
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

const meetingDocumentPanel =
  document.getElementById("meetingDocumentPanel");

const meetingDocumentMeta =
  document.getElementById("meetingDocumentMeta");

const meetingDocumentList =
  document.getElementById("meetingDocumentList");

const meetingDocumentMessage =
  document.getElementById("meetingDocumentMessage");


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

              </td>


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
    detailsCard.classList.remove("is-visible");
    if (meetingAttendance) meetingAttendance.hidden = true;
    if (meetingDocumentPanel) {
      meetingDocumentPanel.hidden = true;
      meetingDocumentPanel.classList.remove("is-visible");
    }
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

  detailsCard.hidden = false;
  detailsCard.classList.add("is-visible");
  if (meetingAttendance) meetingAttendance.hidden = false;
  if (meetingDocumentPanel) {
    meetingDocumentPanel.hidden = false;
    meetingDocumentPanel.classList.add("is-visible");
  }

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
  loadMeetingDocuments().catch(showError);
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
    "Meeting brief saved successfully."
  );


  setTimeout(
    () => showStatus(""),
    3000
  );


  if (saveMinutes) {

    saveMinutes.disabled =
      false;

    saveMinutes.textContent =
      "Save Meeting Brief";

  }

}


/* =========================================================
   PRIVATE MEETING FILES
========================================================= */

function showDocumentMessage(message, isError = false) {
  if (!meetingDocumentMessage) return;
  meetingDocumentMessage.textContent = message || "";
  meetingDocumentMessage.style.color = isError ? "#b42318" : "#667085";
}

async function loadMeetingDocuments() {
  if (!selectedMeeting || !groupId || !meetingDocumentList) return;

  const [legacyResult, groupDocsResult] = await Promise.all([
    supabase
      .from("meeting_documents")
      .select("id, storage_path, file_name, content_type, size_bytes, created_at")
      .eq("group_id", groupId)
      .eq("meeting_id", selectedMeeting.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select("id, title, storage_path, mime_type, file_size, created_at, updated_at")
      .eq("group_id", groupId)
      .eq("meeting_id", selectedMeeting.id)
      .eq("category", "Minutes")
      .order("created_at", { ascending: false })
  ]);

  if (legacyResult.error) throw legacyResult.error;
  if (groupDocsResult.error) throw groupDocsResult.error;

  const legacyFiles = (legacyResult.data || []).map(file => ({...file, source: "legacy"}));
  const groupFiles = (groupDocsResult.data || []).map(file => ({
    id: "groupdoc:" + file.id,
    storage_path: file.storage_path,
    file_name: file.title,
    content_type: file.mime_type || "application/octet-stream",
    size_bytes: file.file_size || 0,
    created_at: file.updated_at || file.created_at,
    source: "groupdoc"
  }));
  const files = [...groupFiles, ...legacyFiles].sort((a, b) =>
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  if (meetingDocumentMeta) {
    meetingDocumentMeta.textContent = files.length
      ? `${files.length} private file${files.length === 1 ? "" : "s"} attached to this meeting.`
      : "No minutes documents linked yet. Upload a document in Documents and link it to this meeting.";
  }

  meetingDocumentList.innerHTML = files.length
    ? files.map(file => `
        <div class="meeting-file-row">
          <div>
            <strong>${escapeHtml(file.file_name)}</strong>
            <div class="meeting-document-meta">${escapeHtml((Number(file.size_bytes || 0) / 1024).toFixed(0))} KB · ${escapeHtml(formatDate(file.created_at))}</div>
          </div>
          <button type="button" class="btn btn-secondary" data-document-download="${escapeHtml(file.id)}">Download</button>
        </div>
      `).join("")
    : '<p class="muted">Upload meeting minutes in Documents and link them to this meeting to make them available here.</p>';
}

async function downloadMeetingFile(documentId) {
  if (!selectedMeeting || !groupId) throw new Error("Select a meeting first.");

  if (String(documentId).startsWith("groupdoc:")) {
    const sourceId = String(documentId).slice("groupdoc:".length);
    const { data: fileRecord, error: recordError } = await supabase
      .from("documents")
      .select("storage_path, title")
      .eq("id", sourceId)
      .eq("group_id", groupId)
      .eq("meeting_id", selectedMeeting.id)
      .eq("category", "Minutes")
      .single();

    if (recordError) throw recordError;
    const { data, error } = await supabase
      .storage.from("group-documents")
      .download(fileRecord.storage_path);
    if (error) throw error;

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileRecord.title || "meeting-minutes";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }

  const { data: fileRecord, error: recordError } = await supabase
    .from("meeting_documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .eq("group_id", groupId)
    .eq("meeting_id", selectedMeeting.id)
    .single();

  if (recordError) throw recordError;

  const { data, error } = await supabase
    .storage.from("meeting-files")
    .download(fileRecord.storage_path);

  if (error) throw error;

  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileRecord.file_name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* =========================================================
   COMPLETE MEETING + PUBLISH GROUP ANNOUNCEMENT
========================================================= */

async function completeMeetingAndNotify() {
  if (!selectedMeeting) throw new Error("Select a meeting first.");

  const brief = String(minutesInput?.value || "").trim();
  
  if (brief.length < 5) {
    throw new Error("Enter a short meeting brief (at least 5 characters) before completing the meeting.");
  }
  if (brief.length > 3000) {
    throw new Error("Keep the meeting brief to 3,000 characters or fewer.");
  }

  if (completeMeeting) {
    completeMeeting.disabled = true;
    completeMeeting.textContent = "Completing and notifying…";
  }

  try {
    const { data, error } = await supabase.rpc("cl_complete_meeting_and_notify", {
      p_meeting_id: selectedMeeting.id,
      p_brief: brief,
      p_resolution: null
    });

    if (error) throw error;
    if (!data?.id) throw new Error("Meeting completion was not confirmed.");

    selectedMeeting = data;
    await loadMeetings();
    renderMetrics();
    renderMeetings();
    renderDetails();

    showStatus("Meeting completed. The meeting brief has been published to group announcements.");
    setTimeout(() => showStatus(""), 5000);
  } finally {
    if (completeMeeting) {
      completeMeeting.disabled = false;
      completeMeeting.textContent = "Complete Meeting & Notify Members";
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


  completeMeeting?.addEventListener(
    "click",
    async () => {
      try {
        clearError();
        await completeMeetingAndNotify();
      } catch (error) {
        showError(error);
      }
    }
  );

  meetingDocumentList?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-document-download]");
    if (!button) return;
    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      await downloadMeetingFile(button.dataset.documentDownload);
    } catch (error) {
      showDocumentMessage(error?.message || String(error), true);
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Download";
    }
  });


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
            "Save Meeting Brief";

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
