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

   IMPORTANT
   ---------------------------------------------------------
   This frontend intentionally does NOT reference:

     start_time
     end_time
     type
     back_dated
     meeting_documents
     meeting-minutes storage

   Those belong to the candidate Meetings upgrade and must
   not be used by the production frontend until their
   corresponding backend/database gates have passed.

   Attendance states:

     present
     late
     apology
     absent

   Attendance recording roles:

     admin
     secretary

   Members may view attendance where permitted by the
   application flow but may not record it.

   No direct writes are made to accounting tables.
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
   APPLICATION LIMITS
========================================================= */

const MAX_MINUTES_LENGTH = 10000;
const MAX_RESOLUTION_LENGTH = 5000;


/* =========================================================
   ATTENDANCE STATES
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


/*
 * Current application contract for recording attendance.
 */
const ATTENDANCE_RECORDING_ROLES =
  Object.freeze([
    "admin",
    "secretary"
  ]);


/*
 * Current production meetings INSERT/UPDATE contract.
 *
 * Chairperson may view meetings, but current production
 * meeting write policies do not grant chairperson the same
 * write access as admin/secretary.
 */
const MEETING_MANAGEMENT_ROLES =
  Object.freeze([
    "admin",
    "secretary"
  ]);


/*
 * Officers who may view official meeting controls.
 *
 * Chairperson remains a valid governance role for viewing
 * official meeting information, but write operations remain
 * governed by the backend.
 */
const MEETING_OFFICIAL_ROLES =
  Object.freeze([
    "admin",
    "secretary",
    "chairperson"
  ]);


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


const meetingReadableView =
  document.getElementById("meetingReadableView");


const meetingReadingToolbar =
  document.getElementById("meetingReadingToolbar");


const meetingPrintDocument =
  document.getElementById("meetingPrintDocument");


const expandAllMeetings =
  document.getElementById("expandAllMeetings");


const collapseAllMeetings =
  document.getElementById("collapseAllMeetings");


const fullscreenMinutes =
  document.getElementById("fullscreenMinutes");


const printMeetingMinutes =
  document.getElementById("printMeetingMinutes");


/*
 * Candidate-only document elements are deliberately NOT
 * used in this production-compatible file.
 *
 * No references to:
 *
 *   meetingDocumentPanel
 *   meetingDocumentMeta
 *   meetingDocumentActions
 *   meetingDocumentFile
 *   uploadMeetingDocument
 *   downloadMeetingDocument
 *   meetingDocumentMessage
 *   meetingDocumentViewer
 *
 * are required here.
 */


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
   DATABASE SELECT
========================================================= */

/*
 * EXACT current production meetings schema.
 *
 * Do not add start_time/end_time here until the production
 * Step 1 migration has explicitly passed its gate.
 */
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
   ROLE HELPERS
========================================================= */

function currentRole() {

  return String(
    (currentMember && currentMember.role) || ""
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


function isMeetingOfficial() {

  return MEETING_OFFICIAL_ROLES.includes(
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


function attendanceLabel(status) {

  const normalized =
    normalizeAttendanceStatus(status);


  return (
    ATTENDANCE_STATUS_LABELS[normalized] ||
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
    ).formatToParts(new Date());


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


/* =========================================================
   AGENDA
========================================================= */

function agendaToArray(value) {

  if (Array.isArray(value)) {

    return value
      .map(
        item =>
          String(item || "").trim()
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
    (
      error &&
      error.message
    ) ||
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
      (
        statusFilter &&
        statusFilter.value
      ) ||
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
      class="meeting-status meeting-status-${escapeHtml(normalized)}"
    >
      ${escapeHtml(normalized)}
    </span>
  `;

}


/* =========================================================
   RENDER MEETINGS TABLE
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
   TEXT → SAFE HTML
========================================================= */

function plainTextToHtml(value) {

  const lines =
    escapeHtml(
      value || ""
    )
      .split(/\r?\n/);


  let html = "";

  let listType = null;


  const closeList = () => {

    if (listType) {

      html +=
        `</${listType}>`;

      listType =
        null;

    }

  };


  lines.forEach(
    line => {

      const trimmed =
        line.trim();


      if (!trimmed) {

        closeList();

        return;

      }


      const heading =
        trimmed.match(
          /^#{1,3}\s+(.+)$/
        );


      const bullet =
        trimmed.match(
          /^[-*•]\s+(.+)$/
        );


      const numbered =
        trimmed.match(
          /^\d+[.)]\s+(.+)$/
        );


      if (heading) {

        closeList();

        html +=
          `<h3>${heading[1]}</h3>`;

        return;

      }


      if (bullet) {

        if (listType !== "ul") {

          closeList();

          html += "<ul>";

          listType =
            "ul";

        }


        html +=
          `<li>${bullet[1]}</li>`;

        return;

      }


      if (numbered) {

        if (listType !== "ol") {

          closeList();

          html += "<ol>";

          listType =
            "ol";

        }


        html +=
          `<li>${numbered[1]}</li>`;

        return;

      }


      closeList();


      html +=
        `<p>${trimmed}</p>`;

    }
  );


  closeList();


  return (
    html ||
    '<p class="muted">Not recorded.</p>'
  );

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
   ATTENDANCE HELPERS
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
            row &&
            row.status
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


function quorumRequired(totalMembers) {

  if (!Number.isFinite(totalMembers)) {

    return 0;

  }


  return (
    Math.floor(
      totalMembers / 2
    ) + 1
  );

}


/* =========================================================
   RENDER READABLE MEETING
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


  const minutes =
    selectedMeeting.minutes ||
    "";


  const resolutions =
    resolutionItems(
      selectedMeeting.resolution
    );


  const present =
    attendancePeople(
      "present"
    );


  const late =
    attendancePeople(
      "late"
    );


  const apologies =
    attendancePeople(
      "apology"
    );


  const absent =
    attendancePeople(
      "absent"
    );


  const attending =
    present.length +
    late.length;


  const required =
    quorumRequired(
      attendanceMembers.length
    );


  const quorumText =
    attendanceMembers.length
      ? `${attending} of ${attendanceMembers.length} attended; ${required} required`
      : "Attendance not recorded";


  const agendaHtml =
    agenda.length
      ? `
          <ol class="meeting-agenda-list">
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
        `;


  const minutesHtml =
    minutes
      ? `
          <div class="meeting-readable-text">
            ${plainTextToHtml(minutes)}
          </div>
        `
      : `
          <p class="muted">
            No minutes recorded.
          </p>
        `;


  const resolutionHtml =
    resolutions.length
      ? `
          <ol class="meeting-resolution-list">
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
        `;


  const peopleList =
    people => {

      if (!people.length) {

        return `
          <span class="muted">
            None recorded
          </span>
        `;

      }


      return `
        <ul class="meeting-attendance-people">
          ${people
            .map(
              person =>
                `<li>${escapeHtml(person)}</li>`
            )
            .join("")}
        </ul>
      `;

    };


  meetingReadableView.innerHTML = `
    <article class="meeting-readable-document">

      <header class="meeting-readable-header">

        <div class="meeting-readable-kicker">
          ${escapeHtml(groupName)}
        </div>

        <h2>
          ${escapeHtml(
            selectedMeeting.title ||
            "Meeting"
          )}
        </h2>

        <div class="meeting-readable-meta">

          <span>
            <strong>Date:</strong>
            ${escapeHtml(
              formatDate(
                selectedMeeting.date
              )
            )}
          </span>

          <span>
            <strong>Venue:</strong>
            ${escapeHtml(
              selectedMeeting.venue ||
              "—"
            )}
          </span>

          <span>
            <strong>Status:</strong>
            ${escapeHtml(status)}
          </span>

        </div>

      </header>


      <section class="meeting-readable-section">

        <h3>
          Agenda
        </h3>

        ${agendaHtml}

      </section>


      ${
        status === "completed"
          ? `
              <section class="meeting-readable-section">

                <h3>
                  Minutes
                </h3>

                ${minutesHtml}

              </section>


              <section class="meeting-readable-section">

                <h3>
                  Resolutions
                </h3>

                ${resolutionHtml}

              </section>


              <section class="meeting-readable-section">

                <h3>
                  Attendance
                </h3>

                <p>
                  ${escapeHtml(quorumText)}
                </p>


                <div class="meeting-attendance-readable-grid">

                  <div>
                    <h4>Present</h4>
                    ${peopleList(present)}
                  </div>

                  <div>
                    <h4>Late</h4>
                    ${peopleList(late)}
                  </div>

                  <div>
                    <h4>Apologies</h4>
                    ${peopleList(apologies)}
                  </div>

                  <div>
                    <h4>Absent</h4>
                    ${peopleList(absent)}
                  </div>

                </div>

              </section>
            `
          : ""
      }

    </article>
  `;

}


/* =========================================================
   ACCORDION / READING STATE
========================================================= */

function setAccordionState(expanded) {

  if (!meetingReadableView) {

    return;

  }


  const details =
    meetingReadableView.querySelectorAll(
      "details"
    );


  details.forEach(
    item => {

      item.open =
        Boolean(expanded);

    }
  );

}


/* =========================================================
   PRINT DOCUMENT
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

      <header>

        <h1>
          ${escapeHtml(
            groupName
          )}
        </h1>

        <h2>
          ${escapeHtml(
            selectedMeeting.title ||
            "Meeting"
          )}
        </h2>

        <p>
          <strong>Date:</strong>
          ${escapeHtml(
            formatDate(
              selectedMeeting.date
            )
          )}
        </p>

        <p>
          <strong>Venue:</strong>
          ${escapeHtml(
            selectedMeeting.venue ||
            "—"
          )}
        </p>

      </header>


      <section>

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

      </section>


      <section>

        <h3>
          Minutes
        </h3>

        ${
          plainTextToHtml(
            selectedMeeting.minutes ||
            ""
          )
        }

      </section>


      <section>

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

      </section>

    </article>
  `;

}


/* =========================================================
   DETAILS
========================================================= */

function renderDetails() {

  if (!meetingDetails) {

    return;

  }


  if (!selectedMeeting) {

    detailsCard &&
      (detailsCard.hidden = true);


    if (meetingReadableView) {

      meetingReadableView.innerHTML =
        "";

    }


    if (meetingReadingToolbar) {

      meetingReadingToolbar.hidden =
        true;

    }


    if (meetingAttendance) {

      meetingAttendance.hidden =
        true;

    }


    return;

  }


  detailsCard &&
    (detailsCard.hidden = false);


  const status =
    normalizeStatus(
      selectedMeeting.status
    );


  const completed =
    status === "completed";


  const management =
    canManageMeetings();


  const recording =
    canRecordAttendance();


  meetingDetails.innerHTML = `

    <div class="meeting-details-grid">

      <div class="meeting-meta-box">

        <span class="meeting-meta-label">
          Date
        </span>

        <span class="meeting-meta-value">
          ${escapeHtml(
            formatDate(
              selectedMeeting.date
            )
          )}
        </span>

      </div>


      <div class="meeting-meta-box">

        <span class="meeting-meta-label">
          Venue
        </span>

        <span class="meeting-meta-value">
          ${escapeHtml(
            selectedMeeting.venue ||
            "—"
          )}
        </span>

      </div>


      <div class="meeting-meta-box">

        <span class="meeting-meta-label">
          Status
        </span>

        <span class="meeting-meta-value">
          ${statusBadge(status)}
        </span>

      </div>

    </div>


    <section class="meeting-detail-section">

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
        '<p class="muted">No agenda recorded.</p>'
      }

    </section>

  `;


  /*
   * Management buttons.
   */

  if (editMeeting) {

    editMeeting.hidden =
      !management;

  }


  if (completeMeeting) {

    completeMeeting.hidden =
      !(
        management &&
        status === "upcoming"
      );

  }


  if (cancelMeeting) {

    cancelMeeting.hidden =
      !(
        management &&
        status === "upcoming"
      );

  }


  if (restoreMeeting) {

    restoreMeeting.hidden =
      !(
        management &&
        status === "cancelled"
      );

  }


  if (deleteMeeting) {

    /*
     * Current production DELETE policy is admin-only.
     */
    deleteMeeting.hidden =
      currentRole() !== "admin";

  }


  /*
   * Legacy minutes editor.
   *
   * The production database still has minutes/resolution.
   * These remain supported here for compatibility.
   */
  if (minutesInput) {

    minutesInput.value =
      selectedMeeting.minutes ||
      "";

  }


  if (resolutionInput) {

    resolutionInput.value =
      selectedMeeting.resolution ||
      "";

  }


  if (saveMinutes) {

    saveMinutes.hidden =
      !management;

  }


  /*
   * Readable meeting view.
   */

  renderReadableMeeting();


  if (meetingReadingToolbar) {

    meetingReadingToolbar.hidden =
      false;

  }


  /*
   * Attendance.
   *
   * Detailed recording is only exposed for completed
   * meetings and authorized attendance officers.
   */
  if (meetingAttendance) {

    meetingAttendance.hidden =
      !(
        completed &&
        recording
      );

  }


  if (saveMeetingAttendance) {

    saveMeetingAttendance.hidden =
      !(
        completed &&
        recording
      );

  }


  /*
   * Attendance data is loaded only after a completed meeting
   * is selected.
   */
  if (completed) {

    loadMeetingAttendance()
      .then(
        () => {

          renderReadableMeeting();

        }
      )
      .catch(
        error => {

          console.error(
            "Attendance load failed:",
            error
          );

        }
      );

  }
  else {

    attendanceMembers = [];

    attendanceRows =
      new Map();

    renderAttendanceStats();

  }

}


/* =========================================================
   ATTENDANCE LOAD
========================================================= */

async function loadMeetingAttendance() {

  if (
    !selectedMeeting ||
    !groupId
  ) {

    return;

  }


  const completed =
    normalizeStatus(
      selectedMeeting.status
    ) === "completed";


  if (!completed) {

    return;

  }


  /*
   * Load active group members.
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
   * Load attendance records for the selected meeting.
   */
  const {
    data: rows,
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


  attendanceRows =
    new Map();


  /*
   * Every active member gets an explicit state.
   *
   * No existing record means absent.
   */
  attendanceMembers.forEach(
    member => {

      const existing =
        (rows || []).find(
          row =>
            String(
              row.member_id
            ) ===
            String(
              member.id
            )
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
              existing &&
              existing.status
            )
        }
      );

    }
  );


  renderAttendanceList();

  renderAttendanceStats();

}


/* =========================================================
   ATTENDANCE STATS
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
          row &&
          row.status
        );


      counts[status]++;

    }
  );


  return counts;

}


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

        <strong>
          ${counts.present}
        </strong>

        <span>
          Present
        </span>

      </div>


      <div class="meeting-attendance-stat">

        <strong>
          ${counts.late}
        </strong>

        <span>
          Late
        </span>

      </div>


      <div class="meeting-attendance-stat">

        <strong>
          ${counts.apology}
        </strong>

        <span>
          Apologies
        </span>

      </div>


      <div class="meeting-attendance-stat">

        <strong>
          ${counts.absent}
        </strong>

        <span>
          Absent
        </span>

      </div>


      <div class="meeting-attendance-stat">

        <strong>
          ${attending}
        </strong>

        <span>
          Attending
        </span>

      </div>


      <div class="meeting-attendance-stat">

        <strong>
          ${total > 0 ? required : "—"}
        </strong>

        <span>
          Quorum Required
        </span>

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
                row &&
                row.status
              );


            const memberName =
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
                    ${escapeHtml(
                      memberName
                    )}
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
                              memberName
                            )}"
                          >

                            ${ATTENDANCE_STATUSES
                              .map(
                                value =>
                                  `
                                    <option
                                      value="${value}"
                                      ${
                                        value ===
                                        status
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
                              attendanceLabel(
                                status
                              )
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

          const localRow =
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
                localRow &&
                localRow.status
              )

          };

        }
      );


    /*
     * The current production attendance table uses the
     * meeting/member pair as the logical unique record.
     *
     * RLS remains authoritative.
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
      "Attendance saved successfully."
    );


    setTimeout(
      () => showStatus(""),
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
   CREATE / UPDATE MEETING
========================================================= */

async function saveMeetingForm(event) {

  event.preventDefault();


  clearError();

  showStatus("");


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


    if (
      !(
        currentMember &&
        currentMember.id
      )
    ) {

      throw new Error(
        "Your member record could not be found."
      );

    }


    const title =
      String(
        (
          titleInput &&
          titleInput.value
        ) ||
        ""
      ).trim();


    const date =
      String(
        (
          dateInput &&
          dateInput.value
        ) ||
        ""
      ).trim();


    const venue =
      String(
        (
          venueInput &&
          venueInput.value
        ) ||
        ""
      ).trim();


    const agenda =
      agendaToArray(
        agendaInput &&
        agendaInput.value
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
     * ONLY production columns.
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
        "Meeting scheduled successfully."
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


  /*
   * Reset attendance state before loading the selected
   * meeting's records.
   */
  attendanceMembers = [];

  attendanceRows =
    new Map();


  renderDetails();


  if (selectedMeeting && detailsCard) {

    detailsCard.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


/* =========================================================
   UPDATE MEETING STATUS
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


  if (newStatus !== "completed") {

    attendanceMembers = [];

    attendanceRows =
      new Map();

  }


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
   SAVE LEGACY MINUTES + RESOLUTION
========================================================= */

async function saveMeetingMinutes() {

  if (!canManageMeetings()) {

    throw new Error(
      "Only an admin or secretary can save meeting minutes."
    );

  }


  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  const minutes =
    String(
      (
        minutesInput &&
        minutesInput.value
      ) ||
      ""
    ).trim();


  const resolution =
    String(
      (
        resolutionInput &&
        resolutionInput.value
      ) ||
      ""
    ).trim();


  if (
    minutes.length >
    MAX_MINUTES_LENGTH
  ) {

    throw new Error(
      `Meeting minutes cannot exceed ${MAX_MINUTES_LENGTH.toLocaleString()} characters.`
    );

  }


  if (
    resolution.length >
    MAX_RESOLUTION_LENGTH
  ) {

    throw new Error(
      `Resolution cannot exceed ${MAX_RESOLUTION_LENGTH.toLocaleString()} characters.`
    );

  }


  /*
   * Minutes/resolution are legacy production columns.
   *
   * The future official document workflow belongs to the
   * separate candidate Minutes Storage gate.
   */
  if (saveMinutes) {

    saveMinutes.disabled =
      true;


    saveMinutes.textContent =
      "Saving...";

  }


  try {

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
        .select(
          MEETING_SELECT
        )
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


    renderMetrics();

    renderMeetings();

    renderDetails();


    showStatus(
      "Minutes and resolutions saved successfully."
    );


    setTimeout(
      () => showStatus(""),
      3000
    );

  }
  finally {

    if (saveMinutes) {

      saveMinutes.disabled =
        false;


      saveMinutes.textContent =
        "Save Minutes & Resolutions";

    }

  }

}


/* =========================================================
   DELETE
========================================================= */

async function removeMeeting() {

  if (
    currentRole() !==
    "admin"
  ) {

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


      if (action === "view") {

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

  const refreshMeetingsButton =
    document.getElementById(
      "refreshMeetings"
    );


  if (refreshMeetingsButton) {

    refreshMeetingsButton.addEventListener(
      "click",
      async event => {

        const button =
          event.currentTarget;


        button.disabled =
          true;


        button.textContent =
          "Refreshing…";


        try {

          clearError();

          showStatus(
            "Refreshing meetings..."
          );


          await loadMeetings();


          renderMetrics();

          renderMeetings();

          renderDetails();


          showStatus(
            "Meetings refreshed."
          );


          setTimeout(
            () => showStatus(""),
            2000
          );

        }
        catch (error) {

          showError(error);

        }
        finally {

          button.disabled =
            false;


          button.textContent =
            "Refresh";

        }

      }
    );

  }


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

        setAccordionState(
          true
        );

      }
    );

  }


  if (collapseAllMeetings) {

    collapseAllMeetings.addEventListener(
      "click",
      () => {

        setAccordionState(
          false
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
          "meeting-fullscreen-active"
        );


        const active =
          meetingReadableView.classList.contains(
            "meeting-fullscreen-active"
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

        if (
          normalizeStatus(
            selectedMeeting &&
            selectedMeeting.status
          ) !== "completed"
        ) {

          return;

        }


        renderPrintDocument();

        window.print();

      }
    );

  }


  /*
   * =======================================================
   * ATTENDANCE SELECTOR
   * =======================================================
   */

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


        if (!memberId) {

          return;

        }


        const status =
          String(
            select.value ||
            ""
          )
            .trim()
            .toLowerCase();


        if (
          !ATTENDANCE_STATUSES.includes(
            status
          )
        ) {

          showError(
            new Error(
              "Invalid attendance status selected."
            )
          );

          return;

        }


        const existing =
          attendanceRows.get(
            memberId
          );


        attendanceRows.set(
          memberId,
          {

            ...(existing || {}),

            meeting_id:
              selectedMeeting &&
              selectedMeeting.id,

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

          clearError();

          await saveAttendance();

        }
        catch (error) {

          showError(error);

        }

      }
    );

  }


  if (editMeeting) {

    editMeeting.addEventListener(
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

        clearError();

        showStatus("");

      }
    );

  }


  if (completeMeeting) {

    completeMeeting.addEventListener(
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

  }


  if (cancelMeeting) {

    cancelMeeting.addEventListener(
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

  }


  if (restoreMeeting) {

    restoreMeeting.addEventListener(
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

  }


  if (deleteMeeting) {

    deleteMeeting.addEventListener(
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


  if (saveMinutes) {

    saveMinutes.addEventListener(
      "click",
      async () => {

        try {

          clearError();


          await saveMeetingMinutes();

        }
        catch (error) {

          showError(error);

        }

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

    clearError();


    showStatus(
      "Loading meetings..."
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


    /*
     * Group name is display-only.
     */
    const groupResult =
      await supabase
        .from("groups")
        .select("name")
        .eq(
          "id",
          groupId
        )
        .maybeSingle();


    if (
      !groupResult.error &&
      groupResult.data &&
      groupResult.data.name
    ) {

      groupName =
        groupResult.data.name;

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
     * Client-side limits mirror the current application
     * limits without requiring a schema change.
     */

    if (minutesInput) {

      minutesInput.maxLength =
        MAX_MINUTES_LENGTH;

    }


    if (resolutionInput) {

      resolutionInput.maxLength =
        MAX_RESOLUTION_LENGTH;

    }


    /*
     * Disable/hide creation controls for non-management
     * roles while keeping backend authorization authoritative.
     */

    if (form) {

      form.hidden =
        !canManageMeetings();

    }


    if (saveMinutes) {

      saveMinutes.hidden =
        !canManageMeetings();

    }


    if (form) {

      form.addEventListener(
        "submit",
        saveMeetingForm
      );

    }


    setupButtons();

    setupTableActions();


    /* =====================================================
       DATA
    ====================================================== */

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


    console.log(
      "CHAMA LIVE: meetings initialized"
    );

  }
  catch (error) {

    initialized =
      false;


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
   admin-layout.js remains the sole page boot owner.

   meetings.js intentionally does NOT:

     - attach DOMContentLoaded
     - call initPage() automatically
     - import admin-layout.js

   This prevents duplicate initialization and race
   conditions.
========================================================= */

console.log(
  "CHAMA LIVE: meetings.js ready"
);
