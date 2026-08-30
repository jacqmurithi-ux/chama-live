/* =========================================================
   CHAMA LIVE — MEETINGS
   COMPLETE STABLE VERSION

   FEATURES
   ---------------------------------------------------------
   • Load group meetings
   • Schedule meetings
   • Edit meetings
   • View meeting details
   • Mark completed
   • Cancel meeting
   • Restore cancelled meeting to upcoming
   • Save minutes and resolutions
   • Delete meetings
   • Filter by status
   • Upcoming / Completed / Cancelled totals

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

const venueInput =
  document.getElementById("venue");

const agendaInput =
  document.getElementById("agenda");

const saveButton =
  document.getElementById("saveMeeting");

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

const saveMinutes =
  document.getElementById("saveMinutes");

const cancelEdit =
  document.getElementById("cancelEdit");


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentMember = null;

let meetings = [];

let selectedMeeting = null;

let editingMeetingId = null;

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


function agendaToArray(value) {

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

  if (
    Array.isArray(value)
  ) {

    return value.join("\n");

  }

  return String(
    value || ""
  );

}


function showStatus(message) {

  if (!statusEl) {

    return;

  }

  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Meetings:",
    error
  );

  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      String(error) ||
      "Unable to process meeting.";

    errorEl.hidden =
      false;

  }

}


function clearError() {

  if (errorEl) {

    errorEl.textContent =
      "";

    errorEl.hidden =
      true;

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

  titleInput.value =
    meeting.title || "";

  dateInput.value =
    meeting.date || "";

  venueInput.value =
    meeting.venue || "";

  agendaInput.value =
    agendaToText(
      meeting.agenda
    );

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
      else if (
        status === "cancelled"
      ) {

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

              <td>
                ${escapeHtml(
                  formatDate(
                    meeting.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  meeting.title
                )}
              </td>

              <td>
                ${escapeHtml(
                  meeting.venue ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                )}
              </td>

              <td>

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

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   DETAILS
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

    return;

  }


  const status =
    normalizeStatus(
      selectedMeeting.status
    );


  const agenda =
    agendaToText(
      selectedMeeting.agenda
    );


  meetingDetails.innerHTML = `
    <p>
      <strong>Meeting:</strong>
      ${escapeHtml(
        selectedMeeting.title
      )}
    </p>

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

    <p>
      <strong>Status:</strong>
      ${escapeHtml(
        status
      )}
    </p>

    <p>
      <strong>Agenda:</strong>
    </p>

    <div
      style="
        white-space:pre-wrap;
        margin-bottom:15px;
      "
    >
      ${escapeHtml(
        agenda ||
        "No agenda recorded."
      )}
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


  detailsCard.hidden =
    false;


  /* -------------------------------------------------------
     BUTTON VISIBILITY
  ------------------------------------------------------- */

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

}


/* =========================================================
   CREATE / UPDATE
========================================================= */

async function saveMeetingForm(
  event
) {

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
      dateInput?.value ||
      "";


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


    /* -------------------------------------------------------
       UPDATE
    ------------------------------------------------------- */

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


    /* -------------------------------------------------------
       CREATE
    ------------------------------------------------------- */

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


    form?.reset();


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
      () => {

        showStatus("");

      },
      3000
    );

  }
  catch (error) {

    showError(
      error
    );

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
    () => {

      showStatus("");

    },
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


  await loadMeetings();

  renderDetails();


  showStatus(
    "Minutes and resolutions saved successfully."
  );


  setTimeout(
    () => {

      showStatus("");

    },
    3000
  );

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
    () => {

      showStatus("");

    },
    3000
  );

}


/* =========================================================
   TABLE ACTIONS
========================================================= */

function setupTableActions() {

  meetingRows?.addEventListener(
    "click",
    event => {

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

  statusFilter?.addEventListener(
    "change",
    renderMeetings
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

      dateInput.value =
        getToday();

      setCreateMode();

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

        showError(
          error
        );

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

        showError(
          error
        );

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

        showError(
          error
        );

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

        showError(
          error
        );

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

        showError(
          error
        );

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


    await requireAuth();


    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    console.log(
      "CHAMA LIVE: meetings context",
      {
        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


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


    await loadMeetings();

    renderMetrics();

    renderMeetings();

    renderDetails();


    showStatus(
      "Meetings ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
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

    showError(
      error
    );

  }

}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initMeetings =
  initPage;


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initPage();

    },
    {
      once: true
    }
  );

}
else {

  initPage();

}


console.log(
  "CHAMA LIVE: meetings.js ready"
);
