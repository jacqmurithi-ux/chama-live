/* =========================================================
   CHAMA LIVE — MEETINGS
   E2600 CANDIDATE — STABLE MEETINGS + ATTENDANCE

   FEATURES
   ---------------------------------------------------------
   • Load group meetings
   • Schedule meetings
   • Edit meetings
   • View meeting details
   • Mark completed
   • Cancel meeting
   • Restore cancelled meeting
   • Upload and read official meeting minutes documents
   • Delete meetings
   • Filter by status
   • Upcoming / Completed / Cancelled totals
   •    • Four-state attendance:
       present
       late
       apology
       absent
   • Quorum calculation
   • Safe rendering
   • Group-isolated data

   DATABASE RULE
   ---------------------------------------------------------
   meetings.group_id = currentMember.group_id

   ATTENDANCE DATABASE CONTRACT
   ---------------------------------------------------------
   attendance:
     meeting_id
     member_id
     status

   status MUST be one of:
     present
     late
     apology
     absent

   ATTENDANCE SECURITY
   ---------------------------------------------------------
   The application authorization contract for attendance recording is:
     admin
     secretary

   Members may view attendance but may not write it.

   No direct database schema changes are performed here.

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
const MEETING_MINUTES_BUCKET = "meeting-minutes";
const MAX_MEETING_DOCUMENT_SIZE = 10 * 1024 * 1024;
const MEETING_DOCUMENT_TYPES = Object.freeze([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);


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


const ATTENDANCE_RECORDING_ROLES = Object.freeze(["admin","secretary"]);
const MEETING_OFFICIAL_ROLES = Object.freeze(["admin","secretary","chairperson"]);


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

const dateInput = document.getElementById("meetingDate");
const backDatedInput = null;
const backDatedGroup = null;
const meetingReadableView = document.getElementById("meetingReadableView");
const meetingReadingToolbar = document.getElementById("meetingReadingToolbar");
const meetingPrintDocument = document.getElementById("meetingPrintDocument");
const meetingRecordEditor = document.getElementById("meetingRecordEditor");
const meetingDocumentPanel = document.getElementById("meetingDocumentPanel");
const meetingDocumentMeta = document.getElementById("meetingDocumentMeta");
const meetingDocumentActions = document.getElementById("meetingDocumentActions");
const meetingDocumentFile = document.getElementById("meetingDocumentFile");
const uploadMeetingDocument = document.getElementById("uploadMeetingDocument");
const downloadMeetingDocument = document.getElementById("downloadMeetingDocument");
const meetingDocumentMessage = document.getElementById("meetingDocumentMessage");
const meetingDocumentViewer = document.getElementById("meetingDocumentViewer");


const expandAllMeetings = document.getElementById("expandAllMeetings");
const collapseAllMeetings = document.getElementById("collapseAllMeetings");
const fullscreenMinutes = document.getElementById("fullscreenMinutes");
const printMeetingMinutes = document.getElementById("printMeetingMinutes");

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
let currentMeetingDocument = null;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value || "")
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


  if (status === "completed") {
    return "completed";
  }


  if (status === "cancelled") {
    return "cancelled";
  }


  return "upcoming";

}


function normalizeAttendanceStatus(value) {

  const status =
    String(value || "")
      .trim()
      .toLowerCase();


  return ATTENDANCE_STATUSES.includes(
    status
  )
    ? status
    : "absent";

}


/* =========================================================
   DATE / TIME
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


function getNairobiParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
  return Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type,p.value]));
}

function getToday() {
  const now = getNairobiParts();
  return [now.year,now.month,now.day].join("-");
}

function formatTime(value) {
  if (!value) return "Time not set";
  const parts = String(value).split(":").map(Number);
  if (!Number.isInteger(parts[0]) || !Number.isInteger(parts[1])) return String(value);
  return new Date(2000,0,1,parts[0],parts[1]).toLocaleTimeString("en-KE",{hour:"numeric",minute:"2-digit",hour12:true});
}

function formatMeetingDateTime(dateValue,startTime,endTime) {
  const dateText = formatDate(dateValue);
  if (!startTime) return dateText + " · Time not set";
  return dateText + " · " + formatTime(startTime) + (endTime ? " – " + formatTime(endTime) : "");
}

function timeToMinutes(value) {
  if (!value) return null;
  const parts = String(value).split(":").map(Number);
  if (!Number.isInteger(parts[0]) || !Number.isInteger(parts[1])) return null;
  return parts[0]*60 + parts[1];
}

function isPastSchedule(dateValue,startTime) {
  if (!dateValue || !startTime) return false;
  const now = getNairobiParts();
  const today = [now.year,now.month,now.day].join("-");
  const currentMinutes = Number(now.hour)*60 + Number(now.minute);
  if (dateValue < today) return true;
  return dateValue === today && timeToMinutes(startTime) < currentMinutes;
}

function isMeetingOfficial() {
  return MEETING_OFFICIAL_ROLES.includes(String((currentMember && currentMember.role) || "").trim().toLowerCase());
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
    (error && error.message) ||
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
  editingMeetingId = null;
  if (backDatedInput) backDatedInput.checked = false;
  if (backDatedGroup) backDatedGroup.hidden = !isMeetingOfficial();


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


  if (dateInput) dateInput.value = meeting.date || "";
  if (backDatedInput) backDatedInput.checked = Boolean(meeting.back_dated);
  if (backDatedGroup) backDatedGroup.hidden = !isMeetingOfficial();

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


  form && form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   MEETING SELECT
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
  created_at,
`;


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
        { ascending: false }
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
      (statusFilter && statusFilter.value) ||
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
   ATTENDANCE LABEL
========================================================= */

function attendanceLabel(status) {

  const normalized =
    normalizeAttendanceStatus(status);


  return (
    ATTENDANCE_STATUS_LABELS[
      normalized
    ] ||
    "Absent"
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
                ${escapeHtml(formatDate(meeting.date))}
                <span class="meeting-time">
                  ${escapeHtml(formatDate(meeting.date))}
                </span>
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
   READABLE MEETING DOCUMENT
========================================================= */

function plainTextToHtml(value) {
  const lines = escapeHtml(value || "").split(/\r?\n/);
  let html = "";
  let listType = null;

  const closeList = () => {
    if (listType) {
      html += "</" + listType + ">";
      listType = null;
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }

    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (heading) {
      closeList();
      html += "<h3>" + heading[1] + "</h3>";
      return;
    }

    if (bullet) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += "<li>" + bullet[1] + "</li>";
      return;
    }

    if (numbered) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += "<li>" + numbered[1] + "</li>";
      return;
    }

    closeList();
    html += "<p>" + trimmed + "</p>";
  });

  closeList();
  return html || '<p class="muted">Not recorded.</p>';
}


function resolutionItems(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => ({
      number: index + 1,
      text: line.replace(/^\d+[.)]\s+/, "").replace(/^[-*•]\s+/, "")
    }));
}


function attendancePeople(status) {
  return attendanceMembers
    .filter(member => normalizeAttendanceStatus((attendanceRows.get(member.id) && attendanceRows.get(member.id).status)) === status)
    .map(member => member.name || "Unnamed member");
}


function renderReadableMeeting() {
  if (!meetingReadableView || !selectedMeeting) return;

  const status = normalizeStatus(selectedMeeting.status);
  const completed = status === "completed";
  const agenda = agendaToArray(selectedMeeting.agenda);
  const minutes = selectedMeeting.minutes || "";
  const resolutions = resolutionItems(selectedMeeting.resolution);
  const present = attendancePeople("present");
  const late = attendancePeople("late");
  const apologies = attendancePeople("apology");
  const absent = attendancePeople("absent");
  const attending = present.length + late.length;
  const required = quorumRequired(attendanceMembers.length);
  const quorumText = attendanceMembers.length
    ? attending + " of " + attendanceMembers.length + " attended; " + required + " required"
    : "Attendance not recorded";

  const agendaHtml = agenda.length
    ? "<ol class=\"meeting-agenda-list\">" + agenda.map(item => "<li>" + escapeHtml(item) + "</li>").join("") + "</ol>"
    : '<p class="muted">No agenda recorded.</p>';

  const minutesHtml = minutes
    ? '<div class="meeting-readable-text">' + plainTextToHtml(minutes) + "</div>"
    : '<p class="muted">No minutes recorded.</p>';

  const resolutionHtml = resolutions.length
    ? resolutions.map(item =>
        '<article class="meeting-resolution-card">' +
          '<div class="meeting-resolution-title">Resolution ' + escapeHtml(String(item.number)) + "</div>" +
          '<div class="meeting-readable-text"><p>' + escapeHtml(item.text) + "</p></div>" +
          '<span class="meeting-outcome">Recorded text</span>' +
        "</article>"
      ).join("")
    : '<p class="muted">No resolutions recorded.</p>';

  const peopleList = (items, empty) =>
    items.length
      ? "<ul>" + items.map(name => "<li>" + escapeHtml(name) + "</li>").join("") + "</ul>"
      : '<p class="muted">' + escapeHtml(empty) + "</p>";

  const section = (id, title, body, open) =>
    '<details class="meeting-accordion" data-meeting-accordion="' + id + '"' + (open ? " open" : "") + ">" +
      "<summary>" + escapeHtml(title) + "</summary>" +
      '<div class="meeting-accordion-body">' + body + "</div>" +
    "</details>";

  const signoff =
    selectedMeeting.chairperson || selectedMeeting.secretary
      ? '<div class="meeting-document-signoff">' +
          (selectedMeeting.chairperson ? '<div class="meeting-signature-line">Chairperson: ' + escapeHtml(selectedMeeting.chairperson) + "</div>" : "") +
          (selectedMeeting.secretary ? '<div class="meeting-signature-line">Secretary: ' + escapeHtml(selectedMeeting.secretary) + "</div>" : "") +
        "</div>"
      : '<p class="muted">Chairperson and secretary sign-off details are not recorded for this meeting.</p>';

  meetingReadableView.innerHTML =
    '<div class="meeting-document-header">' +
      '<div class="meeting-document-kicker">' + escapeHtml(groupName) + "</div>" +
      '<h2 class="meeting-document-title">' + escapeHtml(selectedMeeting.title || "Meeting") + "</h2>" +
      '<div class="meeting-document-meta">' +
        "<span>" + escapeHtml(formatDate(selectedMeeting.date)) + "</span>" +
        "<span>" + escapeHtml(selectedMeeting.venue || "Venue not specified") + "</span>" +
      "</div>" +
      '<div class="meeting-document-status">' + statusBadge(status) + "</div>" +
    "</div>" +
    section("attendance", "Attendance & quorum",
      "<p><strong>Quorum:</strong> " + escapeHtml(quorumText) + "</p>" +
      "<p><strong>Present (" + present.length + "):</strong></p>" + peopleList(present, "None recorded") +
      "<p><strong>Late (" + late.length + "):</strong></p>" + peopleList(late, "None recorded") +
      "<p><strong>Apologies (" + apologies.length + "):</strong></p>" + peopleList(apologies, "None recorded") +
      "<p><strong>Absent (" + absent.length + "):</strong></p>" + peopleList(absent, "None recorded"),
      completed
    ) +
    section("agenda", "Agenda", agendaHtml, false) +
    section("minutes", "Minutes", minutesHtml, completed) +
    section("resolutions", "Resolutions", resolutionHtml, completed) +
    section("actions", "Action items",
      '<p class="muted">No structured action items are currently recorded. This section will use meeting_actions automatically when that structured data exists.</p>',
      false
    ) +
    section("signoff", "Sign-off", signoff, false);

  meetingReadableView.hidden = false;
  if (meetingReadingToolbar) meetingReadingToolbar.hidden = false;
}


function renderPrintDocument() {
  if (!meetingPrintDocument || !selectedMeeting) return;

  const status = normalizeStatus(selectedMeeting.status);
  const resolutions = resolutionItems(selectedMeeting.resolution);
  const present = attendancePeople("present");
  const late = attendancePeople("late");
  const apologies = attendancePeople("apology");
  const absent = attendancePeople("absent");
  const minutes = selectedMeeting.minutes || "";
  const agenda = agendaToArray(selectedMeeting.agenda);
  const generated = new Date().toLocaleDateString("en-KE", {year:"numeric",month:"long",day:"numeric"});

  const list = items => items.length
    ? "<ul>" + items.map(x => "<li>" + escapeHtml(x) + "</li>").join("") + "</ul>"
    : "<p>None recorded.</p>";

  const agendaHtml = agenda.length
    ? "<ol>" + agenda.map(x => "<li>" + escapeHtml(x) + "</li>").join("") + "</ol>"
    : "<p>None recorded.</p>";

  const resolutionTable = resolutions.length
    ? "<table><thead><tr><th>No.</th><th>Resolution</th><th>Outcome</th></tr></thead><tbody>" +
      resolutions.map(item => "<tr><td>" + item.number + "</td><td>" + escapeHtml(item.text) + "</td><td>Recorded text</td></tr>").join("") +
      "</tbody></table>"
    : "<p>No resolutions recorded.</p>";

  meetingPrintDocument.innerHTML =
    '<div class="print-header">' +
      "<div>" + escapeHtml(groupName) + "</div>" +
      "<h1>MINUTES OF " + escapeHtml((selectedMeeting.title || "MEETING").toUpperCase()) + "</h1>" +
      "<p><strong>Date / time:</strong> " + escapeHtml(formatDate(selectedMeeting.date)) + "</p>" +
      "<p><strong>Venue:</strong> " + escapeHtml(selectedMeeting.venue || "Not specified") + "</p>" +
      "<p><strong>Status:</strong> " + escapeHtml(status.toUpperCase()) + "</p>" +
    "</div>" +
    '<section class="print-section"><h2>Attendance and quorum</h2>' +
      "<p><strong>Present:</strong> " + present.length + " · <strong>Late:</strong> " + late.length + " · <strong>Apologies:</strong> " + apologies.length + " · <strong>Absent:</strong> " + absent.length + "</p>" +
      "<p><strong>Present members</strong></p>" + list(present) +
      "<p><strong>Apologies</strong></p>" + list(apologies) +
      "<p><strong>Absent</strong></p>" + list(absent) +
      "<p><strong>Quorum:</strong> " + escapeHtml(attendanceMembers.length ? (present.length + late.length) + " of " + attendanceMembers.length + " attended; " + quorumRequired(attendanceMembers.length) + " required." : "Not recorded.") + "</p>" +
    "</section>" +
    '<section class="print-section"><h2>Agenda</h2>' + agendaHtml + "</section>" +
    '<section class="print-section"><h2>Minutes</h2>' + (minutes ? plainTextToHtml(minutes) : "<p>Not recorded.</p>") + "</section>" +
    '<section class="print-section"><h2>Resolutions</h2>' + resolutionTable + "</section>" +
    '<section class="print-section"><h2>Action items</h2><p>No structured action items are currently recorded.</p></section>' +
    '<section class="print-section"><h2>Next meeting</h2><p>Not recorded.</p></section>' +
    '<section class="print-section"><h2>Sign-off</h2><div class="print-signoff">' +
      '<div class="print-signature">Chairperson</div><div class="print-signature">Secretary</div>' +
    "</div><p>Date: ____________________</p></section>" +
    '<div class="print-footer">Generated on ' + escapeHtml(generated) + " · CHAMA LIVE</div>";
}


function setAccordionState(open) {
  if (!meetingReadableView) return;
  meetingReadableView.querySelectorAll("[data-meeting-accordion]").forEach(item => {
    item.open = open;
  });
}


/* =========================================================
   MEETING MINUTES DOCUMENT
========================================================= */

function sanitizeDocumentFilename(name) {
  const base = String(name || "minutes").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "minutes").slice(0, 180);
}

function setDocumentMessage(message, isError = false) {
  if (!meetingDocumentMessage) return;
  meetingDocumentMessage.textContent = message || "";
  meetingDocumentMessage.style.color = isError ? "#9f1239" : "";
}

async function createMinutesSignedUrl(filePath, download = false) {
  const { data, error } = await supabase.storage
    .from(MEETING_MINUTES_BUCKET)
    .createSignedUrl(filePath, 600, download ? { download: true } : undefined);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("The minutes document could not be opened.");
  return data.signedUrl;
}

async function loadMeetingDocument() {
  currentMeetingDocument = null;
  if (!selectedMeeting || !meetingDocumentPanel) return;
  const completed = normalizeStatus(selectedMeeting.status) === "completed";
  meetingDocumentPanel.hidden = !completed;
  if (!completed) return;

  const { data, error } = await supabase
    .from("meeting_documents")
    .select("id, group_id, meeting_id, file_path, file_name, file_type, file_size, uploaded_by, uploaded_at, version, replaced_at")
    .eq("group_id", groupId)
    .eq("meeting_id", selectedMeeting.id)
    .is("replaced_at", null)
    .maybeSingle();
  if (error) throw error;
  currentMeetingDocument = data || null;
  renderMeetingDocument();
}

function renderMeetingDocument() {
  if (!meetingDocumentPanel || !selectedMeeting) return;
  const completed = normalizeStatus(selectedMeeting.status) === "completed";
  meetingDocumentPanel.hidden = !completed;
  if (!completed) return;

  const official = isMeetingOfficial();
  if (meetingDocumentActions) meetingDocumentActions.hidden = !official;
  if (meetingDocumentFile) meetingDocumentFile.value = "";
  if (uploadMeetingDocument) uploadMeetingDocument.textContent = currentMeetingDocument ? "Replace Minutes" : "Upload Minutes";
  if (downloadMeetingDocument) downloadMeetingDocument.hidden = !currentMeetingDocument;
  if (meetingDocumentMeta) {
    meetingDocumentMeta.innerHTML = currentMeetingDocument
      ? "<span><strong>" + escapeHtml(currentMeetingDocument.file_name) + "</strong></span><span>Version " + escapeHtml(currentMeetingDocument.version) + "</span><span>" + escapeHtml(formatDate(currentMeetingDocument.uploaded_at)) + "</span>"
      : "<span>No official minutes document has been uploaded.</span>";
  }
  if (meetingDocumentViewer) {
    meetingDocumentViewer.hidden = true;
    meetingDocumentViewer.innerHTML = "";
  }
  setDocumentMessage(currentMeetingDocument ? "The current official minutes are available to group members." : (official ? "Upload a PDF or Word document, up to 10 MB." : "The meeting has no official minutes document yet."));

  if (currentMeetingDocument && currentMeetingDocument.file_type === "application/pdf") {
    createMinutesSignedUrl(currentMeetingDocument.file_path)
      .then(url => {
        if (!meetingDocumentViewer || !currentMeetingDocument) return;
        meetingDocumentViewer.innerHTML = '<iframe title="Meeting minutes PDF" src="' + escapeHtml(url) + '"></iframe>';
        meetingDocumentViewer.hidden = false;
      })
      .catch(error => setDocumentMessage(error?.message || "Unable to preview the minutes document.", true));
  } else if (currentMeetingDocument) {
    if (meetingDocumentViewer) {
      meetingDocumentViewer.innerHTML = '<div class="meeting-document-empty">Word minutes are ready to download. In-browser Word rendering is not required for the first release.</div>';
      meetingDocumentViewer.hidden = false;
    }
  }
}

async function uploadMeetingMinutesDocument() {
  if (!selectedMeeting) throw new Error("Select a meeting first.");
  if (!isMeetingOfficial()) throw new Error("Only the admin, chairperson, or secretary can upload meeting minutes.");
  if (normalizeStatus(selectedMeeting.status) !== "completed") throw new Error("Minutes can only be uploaded after the meeting is completed.");
  const file = meetingDocumentFile?.files?.[0];
  if (!file) throw new Error("Choose a PDF or Word minutes document first.");
  if (file.size <= 0 || file.size > MAX_MEETING_DOCUMENT_SIZE) throw new Error("The minutes document must be larger than 0 bytes and no more than 10 MB.");
  if (!MEETING_DOCUMENT_TYPES.includes(file.type)) throw new Error("Only PDF and Word (.docx) minutes documents are allowed.");

  const safeName = sanitizeDocumentFilename(file.name);
  const path = groupId + "/" + selectedMeeting.id + "/" + Date.now() + "-" + crypto.randomUUID() + "-" + safeName;
  if (uploadMeetingDocument) { uploadMeetingDocument.disabled = true; uploadMeetingDocument.textContent = "Uploading..."; }
  setDocumentMessage("Uploading minutes...");
  try {
    const { error: uploadError } = await supabase.storage.from(MEETING_MINUTES_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) throw userError || new Error("Your session could not be verified.");

    const { data: row, error: rpcError } = await supabase.rpc("replace_meeting_document", {
      p_group_id: groupId,
      p_meeting_id: selectedMeeting.id,
      p_file_path: path,
      p_file_name: safeName,
      p_file_type: file.type,
      p_file_size: file.size,
      p_uploaded_by: currentMember.id
    });
    if (rpcError) {
      await supabase.storage.from(MEETING_MINUTES_BUCKET).remove([path]);
      throw rpcError;
    }
    currentMeetingDocument = row;
    renderMeetingDocument();
    setDocumentMessage("Minutes uploaded successfully.");
  } finally {
    if (uploadMeetingDocument) { uploadMeetingDocument.disabled = false; uploadMeetingDocument.textContent = currentMeetingDocument ? "Replace Minutes" : "Upload Minutes"; }
  }
}

async function downloadMeetingMinutesDocument() {
  if (!currentMeetingDocument) return;
  const url = await createMinutesSignedUrl(currentMeetingDocument.file_path, true);
  window.open(url, "_blank", "noopener,noreferrer");
}


/* =========================================================
   RENDER DETAILS
========================================================= */

function renderDetails() {

  if (
    !detailsCard ||
    !meetingDetails
  ) {
    return;
  }


  if (!selectedMeeting) {

    detailsCard.hidden =
      true;


    if (meetingAttendance) {
      meetingAttendance.hidden =
        true;
    }


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


  const agendaHtml =
    agenda.length
      ? `
        <ol class="meeting-agenda-list">

          ${agenda
            .map(
              item => `
                <li>
                  ${escapeHtml(item)}
                </li>
              `
            )
            .join("")}

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
          ${escapeHtml(
            selectedMeeting.title ||
            "Untitled Meeting"
          )}
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
        <span class="meeting-meta-label">Date &amp; time</span>
        <span class="meeting-meta-value">
          ${escapeHtml(formatDate(selectedMeeting.date))}
        </span>
      </div>

      <div class="meeting-meta-box">
        <span class="meeting-meta-label">Venue</span>

        <span class="meeting-meta-value">
          ${escapeHtml(
            selectedMeeting.venue ||
            "Not specified"
          )}
        </span>
      </div>


      <div class="meeting-meta-box">
        <span class="meeting-meta-label">
          Status
        </span>

        <span class="meeting-meta-value">
          ${escapeHtml(status)}
        </span>
      </div>

    </div>


    <div class="meeting-agenda-box">

      <div class="meeting-subtitle">
        Agenda
      </div>

      ${agendaHtml}

    </div>
  `;


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


  detailsCard.hidden = false;

  const official = isMeetingOfficial();
  if (meetingRecordEditor) meetingRecordEditor.hidden = !official;
  if (saveMinutes) saveMinutes.hidden = !official;
  if (editMeeting) editMeeting.hidden = !official;
  if (printMeetingMinutes) printMeetingMinutes.hidden = status !== "completed";

  loadMeetingDocument().catch(showError);

  renderReadableMeeting();
  renderPrintDocument();


  if (completeMeeting) {

    completeMeeting.hidden =
      status !== "upcoming";

  }


  if (cancelMeeting) {

    cancelMeeting.hidden =
      status === "cancelled" ||
      status === "completed";

  }


  if (restoreMeeting) {

    restoreMeeting.hidden =
      status !== "cancelled";

  }


  if (deleteMeeting) {

    deleteMeeting.hidden =
      false;

  }


  loadMeetingAttendance()
    .then(() => {
      renderReadableMeeting();
      renderPrintDocument();
    })
    .catch(showError);

}


/* =========================================================
   QUORUM
========================================================= */

function quorumRequired(memberCount) {

  const total =
    Number(memberCount || 0);


  return (
    Math.floor(total / 2) +
    1
  );

}


/* =========================================================
   ATTENDANCE STATS
========================================================= */

function getAttendanceCounts() {

  const rows =
    [...attendanceRows.values()];


  return {

    present:
      rows.filter(
        row =>
          normalizeAttendanceStatus(
            row.status
          ) === "present"
      ).length,

    late:
      rows.filter(
        row =>
          normalizeAttendanceStatus(
            row.status
          ) === "late"
      ).length,

    apology:
      rows.filter(
        row =>
          normalizeAttendanceStatus(
            row.status
          ) === "apology"
      ).length,

    absent:
      rows.filter(
        row =>
          normalizeAttendanceStatus(
            row.status
          ) === "absent"
      ).length

  };

}


function renderAttendanceStats() {

  if (!meetingAttendanceStats) {
    return;
  }


  const total =
    attendanceMembers.length;


  const counts =
    getAttendanceCounts();


  const attending =
    counts.present +
    counts.late;


  const required =
    quorumRequired(total);


  const quorumMet =
    total > 0 &&
    attending >= required;


  meetingAttendanceStats.innerHTML = `

    <div class="meeting-meta-box">

      <span class="meeting-meta-label">
        Attendance
      </span>

      <span class="meeting-meta-value">
        Present ${counts.present}
        · Late ${counts.late}
        · Apologies ${counts.apology}
        · Absent ${counts.absent}
      </span>

    </div>


    <div class="meeting-meta-box">

      <span class="meeting-meta-label">
        Quorum
      </span>

      <span class="meeting-meta-value">

        ${attending} / ${required}

        ·

        ${
          quorumMet
            ? "Quorum met"
            : "Quorum not met"
        }

      </span>

    </div>
  `;


}


/* =========================================================
   RENDER ATTENDANCE LIST
   ---------------------------------------------------------
   AUTHORITATIVE MODEL
   ---------------------------------------------------------
   Every active member receives exactly one explicit
   attendance selector.

   There is NO checkbox semantics.

   The officer explicitly records one of:

     Present
     Late
     Apology
     Absent

   Existing database attendance, when present, is used.
   Otherwise the initial UI state is Absent.

   This does NOT write anything to the database until the
   officer presses "Save Attendance".
========================================================= */

function renderAttendanceList() {

  if (!meetingAttendanceList) {
    return;
  }


  if (!attendanceMembers.length) {

    meetingAttendanceList.innerHTML = `
      <p class="muted">
        No active group members found.
      </p>
    `;

    renderAttendanceStats();

    return;

  }


  meetingAttendanceList.innerHTML =
    attendanceMembers
      .map(
        member => {

          const row =
            attendanceRows.get(
              member.id
            );


          const currentStatus =
            normalizeAttendanceStatus(
              (row && row.status)
            );


          const memberNumber =
            member.member_number ||
            member.membership_number ||
            "";


          return `
            <div
              class="meeting-attendance-row"
              data-attendance-row="${escapeHtml(
                member.id
              )}"
            >

              <div>

                <strong>
                  ${escapeHtml(
                    member.name ||
                    "Unnamed member"
                  )}
                </strong>


                <small class="muted">

                  ${escapeHtml(
                    memberNumber
                  )}

                  ${(row && row.status)
                    ? " · " + attendanceLabel(row.status)
                    : " · No response"
                  }

                </small>

              </div>


              <label
                class="meeting-attendance-status"
              >

                <span class="muted">
                  Attendance
                </span>


                <select
                  data-attendance-status="${escapeHtml(
                    member.id
                  )}"
                  aria-label="Attendance status for ${escapeHtml(
                    member.name ||
                    "member"
                  )}"
                >

                  <option
                    value="present"
                    ${
                      currentStatus === "present"
                        ? "selected"
                        : ""
                    }
                  >
                    Present
                  </option>


                  <option
                    value="late"
                    ${
                      currentStatus === "late"
                        ? "selected"
                        : ""
                    }
                  >
                    Late
                  </option>


                  <option
                    value="apology"
                    ${
                      currentStatus === "apology"
                        ? "selected"
                        : ""
                    }
                  >
                    Apology
                  </option>


                  <option
                    value="absent"
                    ${
                      currentStatus === "absent"
                        ? "selected"
                        : ""
                    }
                  >
                    Absent
                  </option>

                </select>

              </label>

            </div>
          `;

        }
      )
      .join("");


  renderAttendanceStats();

}


/* =========================================================
   LOAD MEETING ATTENDANCE
========================================================= */

async function loadMeetingAttendance() {

  if (!selectedMeeting || !groupId || !meetingAttendance) {
    return;
  }

  const role =
    String((currentMember && currentMember.role) || "").trim().toLowerCase();

  const official = MEETING_OFFICIAL_ROLES.includes(role);

  if (normalizeStatus(selectedMeeting.status) !== "completed") {
    meetingAttendance.hidden = true;
    return;
  }

  const [membersResult, attendanceResult] =
    await Promise.all([

      supabase
        .from("members")
        .select("id, name, member_number, membership_number")
        .eq("group_id", groupId)
        .eq("status", "active")
        .eq("onboarding_status", "active")
        .order("name", { ascending: true }),

      supabase
        .from("attendance")
        .select("member_id, status")
        .eq("meeting_id", selectedMeeting.id)

    ]);

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (attendanceResult.error) {
    throw attendanceResult.error;
  }

  attendanceMembers =
    Array.isArray(membersResult.data)
      ? membersResult.data
      : [];

  attendanceRows =
    new Map(
      (attendanceResult.data || []).map(
        row => [
          row.member_id,
          {
            member_id: row.member_id,
            status: normalizeAttendanceStatus(row.status)
          }
        ]
      )
    );

  meetingAttendance.hidden = !official;
  renderAttendanceList();
  renderReadableMeeting();
  renderPrintDocument();
}

/* =========================================================
   READ ATTENDANCE FORM
========================================================= */

function collectAttendanceRows() {

  if (
    !selectedMeeting ||
    !meetingAttendanceList
  ) {
    return [];
  }


  return attendanceMembers.map(
    member => {

      const selector =
        `select[data-attendance-status="${CSS.escape(
          member.id
        )}"]`;


      const statusSelect =
        meetingAttendanceList.querySelector(
          selector
        );


      if (!statusSelect) {

        throw new Error(
          `Attendance selector is missing for ${
            member.name ||
            "a group member"
          }.`
        );

      }


      const status =
        String(
          statusSelect.value ||
          ""
        )
          .trim()
          .toLowerCase();


      if (
        !ATTENDANCE_STATUSES.includes(
          status
        )
      ) {

        throw new Error(
          `Invalid attendance status for ${
            member.name ||
            "a group member"
          }.`
        );

      }


      return {

        meeting_id:
          selectedMeeting.id,

        member_id:
          member.id,

        status

      };

    }
  );

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
      "Complete the meeting before recording actual attendance."
    );

  }


  const role =
    String(
      (currentMember && currentMember.role) ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !ATTENDANCE_RECORDING_ROLES.includes(
      role
    )
  ) {

    throw new Error(
      "You are not authorized to record attendance."
    );

  }


  if (!attendanceMembers.length) {

    throw new Error(
      "There are no active members to record."
    );

  }


  if (!saveMeetingAttendance) {

    throw new Error(
      "Attendance save control is unavailable."
    );

  }


  saveMeetingAttendance.disabled =
    true;


  saveMeetingAttendance.textContent =
    "Saving Attendance...";


  try {

    const rows =
      collectAttendanceRows();


    if (!rows.length) {

      throw new Error(
        "No attendance records were prepared."
      );

    }


    /*
     * Every active member must have exactly one valid
     * attendance state.
     */

    const invalid =
      rows.find(
        row =>
          !ATTENDANCE_STATUSES.includes(
            row.status
          )
      );


    if (invalid) {

      throw new Error(
        "Each member must have a valid attendance status."
      );

    }


    /*
     * The attendance table has a unique constraint on:
     *
     *   meeting_id + member_id
     *
     * Therefore upsert is used to create or replace the
     * official attendance record for each member.
     *
     * This writes ONLY to public.attendance.
     *
     * It does not touch accounting tables.
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


    /*
     * Re-read the authoritative database state after saving.
     *
     * This ensures the displayed statistics are based on
     * what the backend actually accepted, not merely the
     * browser's local state.
     */

    const {
      data,
      error: reloadError
    } =
      await supabase
        .from("attendance")
        .select(
          "member_id, status"
        )
        .eq(
          "meeting_id",
          selectedMeeting.id
        );


    if (reloadError) {
      throw reloadError;
    }


    attendanceRows =
      new Map(
        (data || [])
          .map(
            row =>
              [
                row.member_id,
                {
                  member_id:
                    row.member_id,

                  status:
                    normalizeAttendanceStatus(
                      row.status
                    )
                }
              ]
          )
      );


    renderAttendanceList();


    showStatus(
      "Attendance saved successfully."
    );


    setTimeout(
      () => showStatus(""),
      2500
    );

  }
  finally {

    saveMeetingAttendance.disabled =
      false;


    saveMeetingAttendance.textContent =
      "Save Attendance";

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


    if (!(currentMember && currentMember.id)) {

      throw new Error(
        "Your member record could not be found."
      );

    }


    const title =
      String(
        (titleInput && titleInput.value) ||
        ""
      ).trim();


    const date = String((dateInput && dateInput.value) || "").trim();
    const startTime = String((startTimeInput && startTimeInput.value) || "").trim();
    const endTime = String((endTimeInput && endTimeInput.value) || "").trim();
    const backDated = Boolean((backDatedInput && backDatedInput.checked));


    const venue =
      String(
        (venueInput && venueInput.value) ||
        ""
      ).trim();


    const agenda =
      agendaToArray(
        (agendaInput && agendaInput.value)
      );


    if (!title) {

      throw new Error(
        "Please enter a meeting title."
      );

    }


    if (!date) {
      throw new Error("Please select the meeting date.");
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

      date: date,

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


    /* =====================================================
       RESET FORM
    ====================================================== */

    if (form) form.reset();


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


  /*
   * Reset attendance state before loading the newly selected
   * meeting. This prevents one meeting's records from
   * temporarily appearing against another meeting.
   */

  attendanceMembers = [];

  attendanceRows =
    new Map();


  renderDetails();


  if (selectedMeeting) {

    detailsCard && detailsCard.scrollIntoView({
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


  /*
   * Attendance becomes available immediately after the
   * meeting is marked completed.
   */

  if (
    newStatus !== "completed"
  ) {

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
   SAVE MINUTES + RESOLUTION
========================================================= */

async function saveMeetingMinutes() {

  if (!selectedMeeting) {

    throw new Error(
      "Select a meeting first."
    );

  }


  const minutes =
    String(
      (minutesInput && minutesInput.value) ||
      ""
    ).trim();


  const resolution =
    String(
      (resolutionInput && resolutionInput.value) ||
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

  const refreshMeetingsButton = document.getElementById("refreshMeetings");
  if (refreshMeetingsButton) refreshMeetingsButton.addEventListener(
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


  if (statusFilter) statusFilter.addEventListener(
    "change",
    renderMeetings
  );

  if (expandAllMeetings) expandAllMeetings.addEventListener("click", () => setAccordionState(true));
  if (collapseAllMeetings) collapseAllMeetings.addEventListener("click", () => setAccordionState(false));

  if (fullscreenMinutes) fullscreenMinutes.addEventListener("click", () => {
    (meetingReadableView && meetingReadableView.classList).toggle("meeting-fullscreen-active");
    const active = (meetingReadableView && meetingReadableView.classList).contains("meeting-fullscreen-active");
    fullscreenMinutes.textContent = active ? "Exit full-screen" : "Full-screen reading";
  });

  if (printMeetingMinutes) printMeetingMinutes.addEventListener("click", () => {
    if (normalizeStatus((selectedMeeting && selectedMeeting.status)) !== "completed") return;
    renderPrintDocument();
    window.print();
  });




  /*
   * =======================================================
   * EXPLICIT FOUR-STATE ATTENDANCE
   * =======================================================
   *
   * Changing a selector updates local state only.
   *
   * Nothing is written to Supabase until the officer presses
   * "Save Attendance".
   */

  if (meetingAttendanceList) meetingAttendanceList.addEventListener(
    "change",
    event => {

      const select =
        event.target.closest(
          "select[data-attendance-status]"
        );


      if (!select) {
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


      /*
       * Preserve any existing row information while changing
       * only its authoritative attendance status.
       */

      const existing =
        attendanceRows.get(
          memberId
        );


      attendanceRows.set(
        memberId,
        {
          ...(existing || {}),

          meeting_id:
            (selectedMeeting && selectedMeeting.id),

          member_id:
            memberId,

          status
        }
      );


      renderAttendanceStats();

    }
  );


  if (saveMeetingAttendance) saveMeetingAttendance.addEventListener(
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


  if (editMeeting) editMeeting.addEventListener(
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


  if (cancelEdit) cancelEdit.addEventListener(
    "click",
    () => {

      if (form) form.reset();


      if (dateInput) {
        dateInput.value =
          getToday();
      }


      setCreateMode();

      clearError();

      showStatus("");

    }
  );


  if (completeMeeting) completeMeeting.addEventListener(
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


  if (cancelMeeting) cancelMeeting.addEventListener(
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


  if (restoreMeeting) restoreMeeting.addEventListener(
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


  if (deleteMeeting) deleteMeeting.addEventListener(
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


  if (uploadMeetingDocument) uploadMeetingDocument.addEventListener("click", async () => {
    try { clearError(); await uploadMeetingMinutesDocument(); } catch (error) { showError(error); setDocumentMessage(error?.message || "Upload failed.", true); }
  });

  if (downloadMeetingDocument) downloadMeetingDocument.addEventListener("click", async () => {
    try { clearError(); await downloadMeetingMinutesDocument(); } catch (error) { showError(error); }
  });

  if (saveMinutes) saveMinutes.addEventListener(
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


    const groupResult = await supabase.from("groups").select("name").eq("id", groupId).maybeSingle();
    if (!groupResult.error && (groupResult.data && groupResult.data.name)) {
      groupName = groupResult.data.name;
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

    if (dateInput) dateInput.value = getToday();
    if (startTimeInput) startTimeInput.value = "14:00";
    if (backDatedGroup) backDatedGroup.hidden = !isMeetingOfficial();


    /*
     * Client-side limits.
     *
     * These mirror the agreed application limits without
     * requiring a database schema change.
     */

    if (minutesInput) {

      minutesInput.maxLength =
        MAX_MINUTES_LENGTH;

    }


    if (resolutionInput) {

      resolutionInput.maxLength =
        MAX_RESOLUTION_LENGTH;

    }


    if (form) form.addEventListener(
      "submit",
      saveMeetingForm
    );


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

   meetings.js intentionally does NOT attach its own
   DOMContentLoaded handler and does NOT call initPage()
   automatically.

   This prevents a race between module auto-initialization
   and layout.js dynamic initialization.
========================================================= */

console.log(
  "CHAMA LIVE: meetings.js ready"
);