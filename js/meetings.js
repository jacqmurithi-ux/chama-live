/* =========================================================
   CHAMA LIVE — MEETINGS
   PRODUCTION-SCHEMA COMPATIBLE VERSION
   ---------------------------------------------------------
   Current production meetings columns:

     id
     group_id
     title
     date
     venue
     agenda
     minutes
     resolution
     status
     created_at

   This file intentionally does NOT reference:

     start_time
     end_time
     type
     back_dated
     meeting_documents
     meeting-minutes storage

   Attendance states:

     present
     late
     apology
     absent

   Attendance recording roles:

     admin
     secretary

   No direct writes are made to accounting tables.

   BOOT OWNERSHIP
   ---------------------------------------------------------
   admin-layout.js owns page boot.

   This file exports initPage() but does not automatically
   execute it.
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
   LIMITS
========================================================= */

const MAX_MINUTES_LENGTH = 10000;
const MAX_RESOLUTION_LENGTH = 5000;


/* =========================================================
   ATTENDANCE
========================================================= */

const ATTENDANCE_STATUSES = Object.freeze([
  "present",
  "late",
  "apology",
  "absent"
]);


const ATTENDANCE_STATUS_LABELS = Object.freeze({
  present: "Present",
  late: "Late",
  apology: "Apology",
  absent: "Absent"
});


const ATTENDANCE_RECORDING_ROLES = Object.freeze([
  "admin",
  "secretary"
]);


/* =========================================================
   MEETING ROLES
========================================================= */

const MEETING_MANAGEMENT_ROLES = Object.freeze([
  "admin",
  "secretary"
]);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("meetingStatus");


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


const meetingAttendance =
  document.getElementById("meetingAttendance");


const meetingAttendanceStats =
  document.getElementById(
    "meetingAttendanceStats"
  );


const meetingAttendanceList =
  document.getElementById(
    "meetingAttendanceList"
  );


const saveMeetingAttendance =
  document.getElementById(
    "saveMeetingAttendance"
  );


const meetingReadableView =
  document.getElementById(
    "meetingReadableView"
  );


const meetingPrintDocument =
  document.getElementById(
    "meetingPrintDocument"
  );


const expandAllMeetings =
  document.getElementById(
    "expandAllMeetings"
  );


const collapseAllMeetings =
  document.getElementById(
    "collapseAllMeetings"
  );


const fullscreenMinutes =
  document.getElementById(
    "fullscreenMinutes"
  );


const printMeetingMinutes =
  document.getElementById(
    "printMeetingMinutes"
  );


/* =========================================================
   STATE
========================================================= */

let currentMember = null;

let groupId = null;

let groupName = "CHAMA";

let meetings = [];

let selectedMeeting = null;

let editingMeetingId = null;

let attendanceMembers = [];

let attendanceRows = new Map();

let initialized = false;


/* =========================================================
   EXACT PRODUCTION SELECT
========================================================= */

const MEETING_SELECT = `
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
`;


/* =========================================================
   HTML ESCAPE
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
   ROLE
========================================================= */

function currentRole() {

  return String(
    currentMember?.role || ""
  )
    .trim()
    .toLowerCase();

}


function canManageMeetings() {

  return MEETING_MANAGEMENT_ROLES.includes(
    currentRole()
  );

}


function canRecordAttendance() {

  return ATTENDANCE_RECORDING_ROLES.includes(
    currentRole()
  );

}


/* =========================================================
   STATUS
========================================================= */

function normalizeStatus(value) {

  const status =
    String(value || "upcoming")
      .trim()
      .toLowerCase();


  if (status === "completed") {
    return "completed";
  }


  if (status === "cancelled") {
    return "cancelled";
  }


  return "upcoming";

}


/*
 * IMPORTANT:
 *
 * Do NOT use .meeting-status here.
 *
 * The HTML uses .meeting-status for the page-level
 * status message and that class has display:none.
 *
 * Meeting badges use .meeting-status-badge.
 */
function statusBadge(status) {

  const normalized =
    normalizeStatus(status);


  const label =
    normalized.charAt(0).toUpperCase() +
    normalized.slice(1);


  return `
    <span
      class="meeting-status-badge ${escapeHtml(normalized)}"
    >
      ${escapeHtml(label)}
    </span>
  `;

}


/* =========================================================
   ATTENDANCE STATUS
========================================================= */

function normalizeAttendanceStatus(value) {

  const status =
    String(value || "")
      .trim()
      .toLowerCase();


  return ATTENDANCE_STATUSES.includes(status)
    ? status
    : "absent";

}


function attendanceLabel(value) {

  const status =
    normalizeAttendanceStatus(value);


  return (
    ATTENDANCE_STATUS_LABELS[status] ||
    "Absent"
  );

}


/* =========================================================
   DATE
========================================================= */

function getNairobiParts() {

  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Africa/Nairobi",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(
      new Date()
    );


  return Object.fromEntries(
    parts
      .filter(
        part =>
          part.type !== "literal"
      )
      .map(
        part => [
          part.type,
          part.value
        ]
      )
  );

}


function getToday() {

  const now =
    getNairobiParts();


  return [
    now.year,
    now.month,
    now.day
  ].join("-");

}


function formatDate(value) {

  if (!value) {
    return "—";
  }


  /*
   * PostgreSQL date values are YYYY-MM-DD.
   *
   * Parse at noon UTC so the date cannot move backward
   * because of local timezone conversion.
   */
  const raw =
    String(value)
      .slice(0, 10);


  const parts =
    raw.split("-");


  if (parts.length === 3) {

    const year =
      Number(parts[0]);

    const month =
      Number(parts[1]);

    const day =
      Number(parts[2]);


    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) {

      const date =
        new Date(
          Date.UTC(
            year,
            month - 1,
            day,
            12
          )
        );


      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {

        return date.toLocaleDateString(
          "en-KE",
          {
            timeZone: "Africa/Nairobi",
            year: "numeric",
            month: "short",
            day: "numeric"
          }
        );

      }

    }

  }


  return String(value);

}


/* =========================================================
   AGENDA
========================================================= */

function agendaToArray(value) {

  if (Array.isArray(value)) {

    return value
      .map(
        item =>
          String(item || "")
            .trim()
      )
      .filter(Boolean);

  }


  return String(value || "")
    .split(/\r?\n/)
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
   MESSAGE
========================================================= */

function showStatus(
  message,
  type = "success"
) {

  if (!statusEl) {
    return;
  }


  const text =
    String(message || "");


  statusEl.textContent =
    text;


  statusEl.className =
    text
      ? `meeting-status is-visible ${type}`
      : "meeting-status";

}


function clearStatus() {

  showStatus("");

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


  showStatus(
    message,
    "error"
  );

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


  if (!canManageMeetings()) {

    showError(
      new Error(
        "Only an admin or secretary can edit meetings."
      )
    );

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


  if (form) {

    form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

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
      .select(MEETING_SELECT)
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


      if (status === "upcoming") {

        upcoming++;

      }
      else if (status === "completed") {

        completed++;

      }
      else if (status === "cancelled") {

        cancelled++;

      }

    }
  );


  if (upcomingCount) {

    upcomingCount.textContent =
      String(upcoming);

  }


  if (completedCount) {

    completedCount.textContent =
      String(completed);

  }


  if (cancelledCount) {

    cancelledCount.textContent =
      String(cancelled);

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

        <td
          colspan="5"
          class="meeting-empty"
        >
          No meetings found.
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


              <td>

                <div class="meeting-title">
                  ${escapeHtml(
                    meeting.title ||
                    "Untitled Meeting"
                  )}
                </div>

              </td>


              <td>

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
   TEXT → HTML
========================================================= */

function plainTextToHtml(value) {

  const text =
    String(value || "")
      .trim();


  if (!text) {

    return `
      <p class="muted">
        Not recorded.
      </p>
    `;

  }


  return text
    .split(/\r?\n/)
    .map(
      line =>
        line.trim()
    )
    .filter(Boolean)
    .map(
      line =>
        `<p>${escapeHtml(line)}</p>`
    )
    .join("");

}


/* =========================================================
   RESOLUTIONS
========================================================= */

function resolutionItems(value) {

  return String(value || "")
    .split(/\r?\n/)
    .map(
      line =>
        line.trim()
    )
    .filter(Boolean)
    .map(
      (line, index) => ({

        number:
          index + 1,

        text:
          line
            .replace(
              /^\d+[.)]\s+/,
              ""
            )
            .replace(
              /^[-*•]\s+/,
              ""
            )

      })
    );

}


/* =========================================================
   QUORUM
========================================================= */

function quorumRequired(totalMembers) {

  const total =
    Number(totalMembers);


  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {

    return 0;

  }


  return (
    Math.floor(total / 2) +
    1
  );

}


/* =========================================================
   ATTENDANCE COUNTS
========================================================= */

function getAttendanceCounts() {

  const counts = {

    present: 0,

    late: 0,

    apology: 0,

    absent: 0

  };


  attendanceMembers.forEach(
    member => {

      const row =
        attendanceRows.get(
          member.id
        );


      const status =
        normalizeAttendanceStatus(
          row?.status
        );


      counts[status]++;

    }
  );


  return counts;

}


/* =========================================================
   ATTENDANCE STATS
========================================================= */

function renderAttendanceStats() {

  if (!meetingAttendanceStats) {
    return;
  }


  const counts =
    getAttendanceCounts();


  const total =
    attendanceMembers.length;


  const attending =
    counts.present +
    counts.late;


  const required =
    quorumRequired(total);


  const quorumReached =
    total > 0 &&
    attending >= required;


  meetingAttendanceStats.innerHTML = `

    <div class="meeting-attendance-stat-grid">

      <div class="meeting-attendance-stat">
        <strong>${counts.present}</strong>
        <span>Present</span>
      </div>

      <div class="meeting-attendance-stat">
        <strong>${counts.late}</strong>
        <span>Late</span>
      </div>

      <div class="meeting-attendance-stat">
        <strong>${counts.apology}</strong>
        <span>Apologies</span>
      </div>

      <div class="meeting-attendance-stat">
        <strong>${counts.absent}</strong>
        <span>Absent</span>
      </div>

      <div class="meeting-attendance-stat">
        <strong>${attending}</strong>
        <span>Attending</span>
      </div>

      <div class="meeting-attendance-stat">
        <strong>${total ? required : "—"}</strong>
        <span>Quorum Required</span>
      </div>

    </div>

    ${
      total
        ? `
          <div class="meeting-quorum-message">

            ${
              quorumReached
                ? "Quorum reached."
                : "Quorum not reached."
            }

          </div>
        `
        : `
          <div class="muted">
            No active members found.
          </div>
        `
    }

  `;

}


/* =========================================================
   ATTENDANCE LIST
========================================================= */

function renderAttendanceList() {

  if (!meetingAttendanceList) {
    return;
  }


  if (!attendanceMembers.length) {

    meetingAttendanceList.innerHTML = `
      <div class="muted">
        No active group members found.
      </div>
    `;

    return;

  }


  const canRecord =
    canRecordAttendance();


  meetingAttendanceList.innerHTML = `

    <div class="meeting-attendance-list">

      ${attendanceMembers
        .map(
          member => {

            const row =
              attendanceRows.get(
                member.id
              );


            const status =
              normalizeAttendanceStatus(
                row?.status
              );


            const name =
              member.name ||
              member.full_name ||
              "Unnamed member";


            return `

              <div
                class="meeting-attendance-row"
                data-member-id="${escapeHtml(
                  member.id
                )}"
              >

                <div class="meeting-attendance-member">

                  <strong>
                    ${escapeHtml(name)}
                  </strong>

                </div>


                <div class="meeting-attendance-control">

                  ${
                    canRecord
                      ? `
                        <select
                          data-attendance-status="${escapeHtml(
                            member.id
                          )}"
                          aria-label="Attendance status for ${escapeHtml(
                            name
                          )}"
                        >

                          ${ATTENDANCE_STATUSES
                            .map(
                              value =>
                                `
                                  <option
                                    value="${value}"
                                    ${
                                      value === status
                                        ? "selected"
                                        : ""
                                    }
                                  >
                                    ${ATTENDANCE_STATUS_LABELS[value]}
                                  </option>
                                `
                            )
                            .join("")}

                        </select>
                      `
                      : `
                        <span>
                          ${escapeHtml(
                            attendanceLabel(status)
                          )}
                        </span>
                      `
                  }

                </div>

              </div>

            `;

          }
        )
        .join("")}

    </div>

  `;

}


/* =========================================================
   LOAD ATTENDANCE
========================================================= */

async function loadMeetingAttendance() {

  if (
    !selectedMeeting ||
    !groupId
  ) {

    return;

  }


  if (
    normalizeStatus(
      selectedMeeting.status
    ) !== "completed"
  ) {

    return;

  }


  /*
   * Active members.
   */
  const {
    data: members,
    error: membersError
  } =
    await supabase
      .from("members")
      .select(
        "id, name, full_name, user_id, status"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "active"
      )
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (membersError) {
    throw membersError;
  }


  attendanceMembers =
    members || [];


  /*
   * Existing attendance.
   */
  const {
    data: existingRows,
    error: attendanceError
  } =
    await supabase
      .from("attendance")
      .select(
        "meeting_id, member_id, status"
      )
      .eq(
        "meeting_id",
        selectedMeeting.id
      );


  if (attendanceError) {
    throw attendanceError;
  }


  const existingByMember =
    new Map();


  (existingRows || []).forEach(
    row => {

      existingByMember.set(
        String(row.member_id),
        row
      );

    }
  );


  attendanceRows =
    new Map();


  /*
   * Every active member receives an explicit state.
   *
   * If there is no attendance row, application state is
   * initially Absent.
   */
  attendanceMembers.forEach(
    member => {

      const existing =
        existingByMember.get(
          String(member.id)
        );


      attendanceRows.set(
        member.id,
        {

          meeting_id:
            selectedMeeting.id,

          member_id:
            member.id,

          status:
            normalizeAttendanceStatus(
              existing?.status
            )

        }
      );

    }
  );


  renderAttendanceList();

  renderAttendanceStats();

}


/* =========================================================
   SAVE ATTENDANCE
========================================================= */

async function saveAttendance() {

  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  if (
    normalizeStatus(
      selectedMeeting.status
    ) !== "completed"
  ) {

    throw new Error(
      "Attendance can only be recorded after the meeting is completed."
    );

  }


  if (!canRecordAttendance()) {

    throw new Error(
      "Only an admin or secretary can record attendance."
    );

  }


  if (!attendanceMembers.length) {

    throw new Error(
      "There are no active group members to record."
    );

  }


  if (saveMeetingAttendance) {

    saveMeetingAttendance.disabled =
      true;


    saveMeetingAttendance.textContent =
      "Saving...";

  }


  try {

    const rows =
      attendanceMembers.map(
        member => {

          const local =
            attendanceRows.get(
              member.id
            );


          return {

            meeting_id:
              selectedMeeting.id,

            member_id:
              member.id,

            status:
              normalizeAttendanceStatus(
                local?.status
              )

          };

        }
      );


    /*
     * This is intentionally the attendance table only.
     *
     * It does not touch any accounting table.
     *
     * Backend RLS remains authoritative.
     */
    const {
      error
    } =
      await supabase
        .from("attendance")
        .upsert(
          rows,
          {
            onConflict:
              "meeting_id,member_id"
          }
        );


    if (error) {
      throw error;
    }


    await loadMeetingAttendance();


    renderReadableMeeting();


    showStatus(
      "Attendance saved successfully.",
      "success"
    );


    window.setTimeout(
      clearStatus,
      2500
    );

  }
  finally {

    if (saveMeetingAttendance) {

      saveMeetingAttendance.disabled =
        false;


      saveMeetingAttendance.textContent =
        "Save Attendance";

    }

  }

}


/* =========================================================
   READABLE ATTENDANCE
========================================================= */

function attendancePeople(status) {

  return attendanceMembers
    .filter(
      member => {

        const row =
          attendanceRows.get(
            member.id
          );


        return (
          normalizeAttendanceStatus(
            row?.status
          ) === status
        );

      }
    )
    .map(
      member =>
        member.name ||
        member.full_name ||
        "Unnamed member"
    );

}


function renderPeopleList(people) {

  if (!people.length) {

    return `
      <span class="muted">
        None recorded
      </span>
    `;

  }


  return `
    <ul>
      ${people
        .map(
          person =>
            `<li>${escapeHtml(person)}</li>`
        )
        .join("")}
    </ul>
  `;

}


/* =========================================================
   READABLE MEETING
========================================================= */

function renderReadableMeeting() {

  if (
    !meetingReadableView ||
    !selectedMeeting
  ) {

    return;

  }


  const status =
    normalizeStatus(
      selectedMeeting.status
    );


  const agenda =
    agendaToArray(
      selectedMeeting.agenda
    );


  const resolutions =
    resolutionItems(
      selectedMeeting.resolution
    );


  const present =
    attendancePeople("present");


  const late =
    attendancePeople("late");


  const apologies =
    attendancePeople("apology");


  const absent =
    attendancePeople("absent");


  const attending =
    present.length +
    late.length;


  const total =
    attendanceMembers.length;


  const required =
    quorumRequired(total);


  meetingReadableView.innerHTML = `

    <article class="meeting-readable-document">

      <header>

        <p class="muted">
          ${escapeHtml(groupName)}
        </p>

        <h2>
          ${escapeHtml(
            selectedMeeting.title ||
            "Meeting"
          )}
        </h2>

        <p>

          <strong>
            Date:
          </strong>

          ${escapeHtml(
            formatDate(
              selectedMeeting.date
            )
          )}

        </p>


        <p>

          <strong>
            Venue:
          </strong>

          ${escapeHtml(
            selectedMeeting.venue ||
            "—"
          )}

        </p>


        <p>

          <strong>
            Status:
          </strong>

          ${statusBadge(status)}

        </p>

      </header>


      <section>

        <h3>
          Agenda
        </h3>

        ${
          agenda.length
            ? `
              <ol>
                ${agenda
                  .map(
                    item =>
                      `<li>${escapeHtml(item)}</li>`
                  )
                  .join("")}
              </ol>
            `
            : `
              <p class="muted">
                No agenda recorded.
              </p>
            `
        }

      </section>


      <section>

        <h3>
          Minutes
        </h3>

        ${plainTextToHtml(
          selectedMeeting.minutes
        )}

      </section>


      <section>

        <h3>
          Resolutions
        </h3>

        ${
          resolutions.length
            ? `
              <ol>
                ${resolutions
                  .map(
                    item =>
                      `<li>${escapeHtml(item.text)}</li>`
                  )
                  .join("")}
              </ol>
            `
            : `
              <p class="muted">
                No resolutions recorded.
              </p>
            `
        }

      </section>


      ${
        status === "completed"
          ? `
            <section>

              <h3>
                Attendance
              </h3>

              <p>

                ${
                  total
                    ? `
                      ${attending}
                      of
                      ${total}
                      attended.
                      Quorum required:
                      ${required}.
                    `
                    : `
                      Attendance has not been loaded.
                    `
                }

              </p>


              <div>

                <h4>
                  Present
                </h4>

                ${renderPeopleList(present)}

              </div>


              <div>

                <h4>
                  Late
                </h4>

                ${renderPeopleList(late)}

              </div>


              <div>

                <h4>
                  Apologies
                </h4>

                ${renderPeopleList(apologies)}

              </div>


              <div>

                <h4>
                  Absent
                </h4>

                ${renderPeopleList(absent)}

              </div>

            </section>
          `
          : ""
      }

    </article>

  `;

}


/* =========================================================
   PRINT
========================================================= */

function renderPrintDocument() {

  if (
    !meetingPrintDocument ||
    !selectedMeeting
  ) {

    return;

  }


  meetingPrintDocument.innerHTML = `

    <article>

      <h1>
        ${escapeHtml(groupName)}
      </h1>


      <h2>
        ${escapeHtml(
          selectedMeeting.title ||
          "Meeting"
        )}
      </h2>


      <p>

        <strong>
          Date:
        </strong>

        ${escapeHtml(
          formatDate(
            selectedMeeting.date
          )
        )}

      </p>


      <p>

        <strong>
          Venue:
        </strong>

        ${escapeHtml(
          selectedMeeting.venue ||
          "—"
        )}

      </p>


      <h3>
        Agenda
      </h3>


      ${
        agendaToArray(
          selectedMeeting.agenda
        )
          .map(
            item =>
              `<p>${escapeHtml(item)}</p>`
          )
          .join("")
        ||
        "<p>None recorded.</p>"
      }


      <h3>
        Minutes
      </h3>


      ${plainTextToHtml(
        selectedMeeting.minutes
      )}


      <h3>
        Resolutions
      </h3>


      ${
        resolutionItems(
          selectedMeeting.resolution
        )
          .map(
            item =>
              `<p>${escapeHtml(item.text)}</p>`
          )
          .join("")
        ||
        "<p>None recorded.</p>"
      }

    </article>

  `;

}


/* =========================================================
   DETAILS ACTION BAR
========================================================= */

function renderMeetingActions() {

  if (!meetingDetails || !selectedMeeting) {
    return;
  }


  const status =
    normalizeStatus(
      selectedMeeting.status
    );


  const management =
    canManageMeetings();


  const admin =
    currentRole() === "admin";


  const actions =
    document.createElement("div");


  actions.className =
    "meeting-detail-actions";


  if (management) {

    const edit =
      document.createElement("button");


    edit.type =
      "button";


    edit.id =
      "editMeeting";


    edit.className =
      "btn btn-secondary";


    edit.textContent =
      "Edit Meeting";


    edit.addEventListener(
      "click",
      () => {

        setEditMode(
          selectedMeeting
        );

      }
    );


    actions.appendChild(
      edit
    );

  }


  if (
    management &&
    status === "upcoming"
  ) {

    const complete =
      document.createElement("button");


    complete.type =
      "button";


    complete.id =
      "completeMeeting";


    complete.className =
      "btn btn-primary";


    complete.textContent =
      "Complete Meeting";


    complete.addEventListener(
      "click",
      async () => {

        try {

          clearStatus();


          await updateMeetingStatus(
            "completed"
          );

        }
        catch (error) {

          showError(error);

        }

      }
    );


    actions.appendChild(
      complete
    );


    const cancel =
      document.createElement("button");


    cancel.type =
      "button";


    cancel.id =
      "cancelMeeting";


    cancel.className =
      "btn btn-secondary";


    cancel.textContent =
      "Cancel Meeting";


    cancel.addEventListener(
      "click",
      async () => {

        try {

          clearStatus();


          await updateMeetingStatus(
            "cancelled"
          );

        }
        catch (error) {

          showError(error);

        }

      }
    );


    actions.appendChild(
      cancel
    );

  }


  if (
    management &&
    status === "cancelled"
  ) {

    const restore =
      document.createElement("button");


    restore.type =
      "button";


    restore.id =
      "restoreMeeting";


    restore.className =
      "btn btn-secondary";


    restore.textContent =
      "Restore Meeting";


    restore.addEventListener(
      "click",
      async () => {

        try {

          clearStatus();


          await updateMeetingStatus(
            "upcoming"
          );

        }
        catch (error) {

          showError(error);

        }

      }
    );


    actions.appendChild(
      restore
    );

  }


  if (admin) {

    const remove =
      document.createElement("button");


    remove.type =
      "button";


    remove.id =
      "deleteMeeting";


    remove.className =
      "btn btn-danger";


    remove.textContent =
      "Delete Meeting";


    remove.addEventListener(
      "click",
      async () => {

        try {

          clearStatus();


          await removeMeeting();

        }
        catch (error) {

          showError(error);

        }

      }
    );


    actions.appendChild(
      remove
    );

  }


  meetingDetails.appendChild(
    actions
  );

}


/* =========================================================
   RENDER DETAILS
========================================================= */

async function renderDetails() {

  if (!meetingDetails) {
    return;
  }


  if (!selectedMeeting) {

    if (detailsCard) {

      detailsCard.hidden =
        true;

    }


    if (meetingAttendance) {

      meetingAttendance.hidden =
        true;

    }


    return;

  }


  if (detailsCard) {

    detailsCard.hidden =
      false;

  }


  const status =
    normalizeStatus(
      selectedMeeting.status
    );


  const completed =
    status === "completed";


  meetingDetails.innerHTML = `

    <div class="meeting-details-header">

      <div>

        <h2 class="meeting-details-title">

          ${escapeHtml(
            selectedMeeting.title ||
            "Meeting"
          )}

        </h2>


        <div class="meeting-details-meta">

          <span>

            <strong>
              Date:
            </strong>

            ${escapeHtml(
              formatDate(
                selectedMeeting.date
              )
            )}

          </span>


          <span>

            <strong>
              Venue:
            </strong>

            ${escapeHtml(
              selectedMeeting.venue ||
              "—"
            )}

          </span>


          <span>

            ${statusBadge(status)}

          </span>

        </div>

      </div>

    </div>


    <div class="meeting-detail-grid">

      <div class="meeting-detail-card">

        <h3>
          Agenda
        </h3>


        ${
          agendaToArray(
            selectedMeeting.agenda
          ).length
            ? `
              <ol class="meeting-agenda-list">

                ${agendaToArray(
                  selectedMeeting.agenda
                )
                  .map(
                    item =>
                      `<li>${escapeHtml(item)}</li>`
                  )
                  .join("")}

              </ol>
            `
            : `
              <p class="muted">
                No agenda recorded.
              </p>
            `
        }

      </div>


      <div class="meeting-detail-card">

        <h3>
          Meeting Summary
        </h3>


        <p>

          ${
            completed
              ? "This meeting has been completed. Attendance and the recorded meeting history are available below."
              : status === "cancelled"
                ? "This meeting was cancelled."
                : "This meeting is scheduled as upcoming."
          }

        </p>

      </div>

    </div>


    ${
      completed
        ? `
          <div class="meeting-content-section">

            <h3>
              Minutes
            </h3>

            ${
              selectedMeeting.minutes
                ? plainTextToHtml(
                    selectedMeeting.minutes
                  )
                : `
                  <p class="muted">
                    No minutes have been recorded yet.
                  </p>
                `
            }

          </div>


          <div class="meeting-content-section">

            <h3>
              Resolutions
            </h3>

            ${
              resolutionItems(
                selectedMeeting.resolution
              ).length
                ? `
                  <ol>

                    ${resolutionItems(
                      selectedMeeting.resolution
                    )
                      .map(
                        item =>
                          `<li>${escapeHtml(item.text)}</li>`
                      )
                      .join("")}

                  </ol>
                `
                : `
                  <p class="muted">
                    No resolutions have been recorded.
                  </p>
                `
            }

          </div>
        `
        : ""
    }

  `;


  renderMeetingActions();


  renderReadableMeeting();


  if (completed) {

    /*
     * Attendance is shown only after a completed meeting
     * is selected.
     *
     * Members can view where SELECT RLS permits.
     */
    if (meetingAttendance) {

      meetingAttendance.hidden =
        false;

    }


    try {

      await loadMeetingAttendance();


      renderAttendanceStats();

      renderAttendanceList();

      renderReadableMeeting();

    }
    catch (error) {

      console.error(
        "CHAMA LIVE: attendance load failed",
        error
      );


      if (meetingAttendanceList) {

        meetingAttendanceList.innerHTML = `
          <div class="muted">
            Attendance could not be loaded.
          </div>
        `;

      }

    }

  }
  else {

    if (meetingAttendance) {

      meetingAttendance.hidden =
        true;

    }


    attendanceMembers = [];

    attendanceRows =
      new Map();

  }

}


/* =========================================================
   UPDATE STATUS
========================================================= */

async function updateMeetingStatus(
  newStatus
) {

  if (!canManageMeetings()) {

    throw new Error(
      "Only an admin or secretary can change meeting status."
    );

  }


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


  if (!allowed.includes(newStatus)) {

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
      .select(
        MEETING_SELECT
      )
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

  await renderDetails();


  showStatus(
    `Meeting marked ${newStatus}.`,
    "success"
  );


  window.setTimeout(
    clearStatus,
    2500
  );

}


/* =========================================================
   SAVE MEETING
========================================================= */

async function saveMeetingForm(event) {

  event.preventDefault();


  clearStatus();


  try {

    if (!canManageMeetings()) {

      throw new Error(
        "Only an admin or secretary can create or edit meetings."
      );

    }


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
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
      String(
        venueInput?.value ||
        ""
      ).trim();


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


    /*
     * ONLY current production columns.
     */
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


    if (editingMeetingId) {

      const {
        data,
        error
      } =
        await supabase
          .from("meetings")
          .update(payload)
          .eq(
            "id",
            editingMeetingId
          )
          .eq(
            "group_id",
            groupId
          )
          .select(
            MEETING_SELECT
          )
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


      showStatus(
        "Meeting updated successfully.",
        "success"
      );

    }
    else {

      const {
        data,
        error
      } =
        await supabase
          .from("meetings")
          .insert({

            ...payload,

            status:
              "upcoming"

          })
          .select(
            MEETING_SELECT
          )
          .single();


      if (error) {
        throw error;
      }


      if (!data) {

        throw new Error(
          "Meeting could not be created."
        );

      }


      selectedMeeting =
        data;


      showStatus(
        "Meeting scheduled successfully.",
        "success"
      );

    }


    if (form) {

      form.reset();

    }


    if (dateInput) {

      dateInput.value =
        getToday();

    }


    setCreateMode();


    await loadMeetings();


    renderMetrics();

    renderMeetings();


    if (selectedMeeting) {

      selectedMeeting =
        meetings.find(
          meeting =>
            String(meeting.id) ===
            String(selectedMeeting.id)
        ) ||
        null;

    }


    await renderDetails();


    window.setTimeout(
      clearStatus,
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

async function viewMeeting(id) {

  selectedMeeting =
    meetings.find(
      meeting =>
        String(meeting.id) ===
        String(id)
    ) ||
    null;


  attendanceMembers = [];

  attendanceRows =
    new Map();


  await renderDetails();


  if (
    selectedMeeting &&
    detailsCard
  ) {

    detailsCard.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


/* =========================================================
   DELETE
========================================================= */

async function removeMeeting() {

  if (currentRole() !== "admin") {

    throw new Error(
      "Only an admin can delete a meeting."
    );

  }


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


  const {
    error
  } =
    await supabase
      .from("meetings")
      .delete()
      .eq(
        "id",
        selectedMeeting.id
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


  attendanceMembers = [];

  attendanceRows =
    new Map();


  await loadMeetings();


  renderMetrics();

  renderMeetings();

  await renderDetails();


  showStatus(
    "Meeting deleted successfully.",
    "success"
  );


  window.setTimeout(
    clearStatus,
    3000
  );

}


/* =========================================================
   TABLE EVENTS
========================================================= */

function setupTableActions() {

  if (!meetingRows) {
    return;
  }


  meetingRows.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {
        return;
      }


      if (
        button.dataset.action ===
        "view"
      ) {

        await viewMeeting(
          button.dataset.id
        );

      }

    }
  );

}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

  if (statusFilter) {

    statusFilter.addEventListener(
      "change",
      renderMeetings
    );

  }


  if (expandAllMeetings) {

    expandAllMeetings.addEventListener(
      "click",
      () => {

        if (!meetingReadableView) {
          return;
        }


        meetingReadableView
          .querySelectorAll(
            "details"
          )
          .forEach(
            item => {
              item.open = true;
            }
          );

      }
    );

  }


  if (collapseAllMeetings) {

    collapseAllMeetings.addEventListener(
      "click",
      () => {

        if (!meetingReadableView) {
          return;
        }


        meetingReadableView
          .querySelectorAll(
            "details"
          )
          .forEach(
            item => {
              item.open = false;
            }
          );

      }
    );

  }


  if (fullscreenMinutes) {

    fullscreenMinutes.addEventListener(
      "click",
      () => {

        if (!meetingReadableView) {
          return;
        }


        meetingReadableView.classList.toggle(
          "meeting-fullscreen"
        );


        const active =
          meetingReadableView.classList.contains(
            "meeting-fullscreen"
          );


        fullscreenMinutes.textContent =
          active
            ? "Exit full-screen"
            : "Full-screen reading";

      }
    );

  }


  if (printMeetingMinutes) {

    printMeetingMinutes.addEventListener(
      "click",
      () => {

        if (!selectedMeeting) {
          return;
        }


        renderPrintDocument();

        window.print();

      }
    );

  }


  if (meetingAttendanceList) {

    meetingAttendanceList.addEventListener(
      "change",
      event => {

        const select =
          event.target.closest(
            "select[data-attendance-status]"
          );


        if (!select) {
          return;
        }


        if (!canRecordAttendance()) {

          showError(
            new Error(
              "Only an admin or secretary can record attendance."
            )
          );

          return;

        }


        const memberId =
          select.dataset.attendanceStatus;


        const status =
          normalizeAttendanceStatus(
            select.value
          );


        const existing =
          attendanceRows.get(
            memberId
          );


        attendanceRows.set(
          memberId,
          {

            ...(existing || {}),

            meeting_id:
              selectedMeeting?.id,

            member_id:
              memberId,

            status

          }
        );


        renderAttendanceStats();

      }
    );

  }


  if (saveMeetingAttendance) {

    saveMeetingAttendance.addEventListener(
      "click",
      async () => {

        try {

          clearStatus();


          await saveAttendance();

        }
        catch (error) {

          showError(error);

        }

      }
    );

  }


  if (form) {

    form.addEventListener(
      "submit",
      saveMeetingForm
    );

  }


  if (cancelEdit) {

    cancelEdit.addEventListener(
      "click",
      () => {

        if (form) {
          form.reset();
        }


        if (dateInput) {

          dateInput.value =
            getToday();

        }


        setCreateMode();

        clearStatus();

      }
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    clearStatus();


    showStatus(
      "Loading meetings...",
      "success"
    );


    /* =====================================================
       AUTH
    ====================================================== */

    await requireAuth();


    /* =====================================================
       MEMBER
    ====================================================== */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /* =====================================================
       GROUP
    ====================================================== */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    /* =====================================================
       GROUP NAME
    ====================================================== */

    const {
      data: group,
      error: groupError
    } =
      await supabase
        .from("groups")
        .select("name")
        .eq(
          "id",
          groupId
        )
        .maybeSingle();


    if (
      !groupError &&
      group?.name
    ) {

      groupName =
        group.name;

    }


    console.log(
      "CHAMA LIVE: meetings context",
      {

        memberId:
          currentMember.id,

        groupId:
          groupId,

        role:
          currentMember.role

      }
    );


    /* =====================================================
       FORM
    ====================================================== */

    setCreateMode();


    if (dateInput) {

      dateInput.value =
        getToday();

    }


    /*
     * Only authorized management roles see the scheduling
     * form. Backend RLS remains authoritative.
     */
    if (form) {

      form.hidden =
        !canManageMeetings();

    }


    setupButtons();

    setupTableActions();


    /* =====================================================
       LOAD DATA
    ====================================================== */

    await loadMeetings();


    renderMetrics();

    renderMeetings();


    /*
     * Nothing is selected when the page first opens.
     */
    selectedMeeting =
      null;


    if (detailsCard) {

      detailsCard.hidden =
        true;

    }


    if (meetingAttendance) {

      meetingAttendance.hidden =
        true;

    }


    clearStatus();


    console.log(
      "CHAMA LIVE: meetings initialized"
    );

  }
  catch (error) {

    initialized =
      false;


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
========================================================= */

console.log(
  "CHAMA LIVE: meetings.js ready"
);
