/* =========================================================
   CHAMA LIVE — MEETINGS
   Schema-aligned version
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

const deleteMeeting =
  document.getElementById("deleteMeeting");

const minutesInput =
  document.getElementById("minutes");

const resolutionInput =
  document.getElementById("resolution");

const saveMinutes =
  document.getElementById("saveMinutes");


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let meetings = [];

let selectedMeeting = null;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

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

    return value;

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


function showError(error) {

  console.error(
    "CHAMA LIVE Meetings:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load meetings.";

    errorEl.hidden =
      false;

  }

}


function agendaToArray(
  value
) {

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


function agendaToText(
  value
) {

  if (
    Array.isArray(value)
  ) {

    return value.join("\n");

  }


  return String(
    value || ""
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
   LOAD
========================================================= */

async function loadMeetings() {

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

  const upcoming =
    meetings.filter(
      meeting =>
        String(
          meeting.status
        ).toLowerCase() ===
        "upcoming"
    ).length;


  const completed =
    meetings.filter(
      meeting =>
        String(
          meeting.status
        ).toLowerCase() ===
        "completed"
    ).length;


  const cancelled =
    meetings.filter(
      meeting =>
        String(
          meeting.status
        ).toLowerCase() ===
        "cancelled"
    ).length;


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
    ).toLowerCase();


  return meetings.filter(
    meeting => {

      const status =
        String(
          meeting.status ||
          "upcoming"
        ).toLowerCase();


      return (
        filter ===
        "all" ||
        status ===
        filter
      );

    }
  );

}


/* =========================================================
   RENDER
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
                  meeting.status ||
                  "upcoming"
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


  const agenda =
    agendaToText(
      selectedMeeting.agenda
    );


  meetingDetails.innerHTML = `
    <p>
      <strong>Title:</strong>
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
        selectedMeeting.status ||
        "upcoming"
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

}


/* =========================================================
   CREATE / UPDATE MEETING
========================================================= */

async function saveMeetingForm(
  event
) {

  event.preventDefault();


  try {

    const title =
      titleInput?.value
        .trim();


    const date =
      dateInput?.value;


    const venue =
      venueInput?.value
        .trim();


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
        "Saving...";

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


    if (
      selectedMeeting
    ) {

      const {
        error
      } =
        await supabase
          .from("meetings")
          .update(
            payload
          )
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


      if (statusEl) {

        statusEl.textContent =
          "Meeting updated successfully.";

      }

    }
    else {

      payload.status =
        "upcoming";


      const {
        error
      } =
        await supabase
          .from("meetings")
          .insert(
            payload
          );


      if (error) {

        throw error;

      }


      if (statusEl) {

        statusEl.textContent =
          "Meeting scheduled successfully.";

      }

    }


    form?.reset();


    if (dateInput) {

      dateInput.value =
        getToday();

    }


    selectedMeeting =
      null;


    if (detailsCard) {

      detailsCard.hidden =
        true;

    }


    await loadMeetings();

    renderMetrics();

    renderMeetings();

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
        "Schedule Meeting";

    }

  }

}


/* =========================================================
   VIEW
========================================================= */

function viewMeeting(
  id
) {

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
  status
) {

  if (!selectedMeeting) {

    return;

  }


  const {
    error
  } =
    await supabase
      .from("meetings")
      .update({
        status:
          status
      })
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


  await loadMeetings();


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


  renderMetrics();

  renderMeetings();

  renderDetails();

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


  const {
    error
  } =
    await supabase
      .from("meetings")
      .update({

        minutes:
          minutesInput?.value
            ?.trim() ||
          null,

        resolution:
          resolutionInput?.value
            ?.trim() ||
          null

      })
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


  await loadMeetings();


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


  renderDetails();


  if (statusEl) {

    statusEl.textContent =
      "Minutes and resolutions saved.";

  }

}


/* =========================================================
   DELETE
========================================================= */

async function removeMeeting() {

  if (!selectedMeeting) {

    return;

  }


  if (
    !window.confirm(
      "Are you sure you want to delete this meeting?"
    )
  ) {

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


  if (statusEl) {

    statusEl.textContent =
      "Meeting deleted successfully.";

  }

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
   BUTTONS
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


      titleInput.value =
        selectedMeeting.title ||
        "";

      dateInput.value =
        selectedMeeting.date ||
        "";

      venueInput.value =
        selectedMeeting.venue ||
        "";

      agendaInput.value =
        agendaToText(
          selectedMeeting.agenda
        );


      form?.scrollIntoView({
        behavior: "smooth"
      });

    }
  );


  completeMeeting?.addEventListener(
    "click",
    async () => {

      try {

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


  deleteMeeting?.addEventListener(
    "click",
    async () => {

      try {

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

    await requireAuth();


    const member =
      await getMyMember();


    groupId =
      member.group_id;


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


    if (statusEl) {

      statusEl.textContent =
        "Meetings ready.";

    }

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

  }

}


export const initMeetings =
  initPage;


console.log(
  "CHAMA LIVE: meetings.js ready"
);
