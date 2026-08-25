import { supabase } from "./supabase.js";


/* =====================================================
   ELEMENTS
===================================================== */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const meetingForm =
  document.getElementById("meetingForm");

const titleInput =
  document.getElementById("title");

const dateInput =
  document.getElementById("meetingDate");

const venueInput =
  document.getElementById("venue");

const agendaInput =
  document.getElementById("agenda");

const saveMeetingButton =
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

const minutesInput =
  document.getElementById("minutes");

const resolutionInput =
  document.getElementById("resolution");

const editButton =
  document.getElementById("editMeeting");

const completeButton =
  document.getElementById("completeMeeting");

const cancelButton =
  document.getElementById("cancelMeeting");

const deleteButton =
  document.getElementById("deleteMeeting");

const saveMinutesButton =
  document.getElementById("saveMinutes");


/* =====================================================
   STATE
===================================================== */

let groupId = null;

let meetings = [];

let selectedMeeting = null;


/* =====================================================
   HELPERS
===================================================== */

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


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =====================================================
   ERROR
===================================================== */

function showError(error) {

  console.error(
    "Meetings error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to load meetings.";

  errorEl.hidden =
    false;

}


/* =====================================================
   GET GROUP
===================================================== */

async function getGroupId() {

  const {
    data,
    error
  } = await supabase.rpc(
    "my_group_id"
  );

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }

  return data;

}


/* =====================================================
   LOAD MEETINGS
===================================================== */

async function loadMeetings() {

  const {
    data,
    error
  } = await supabase
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
        ascending: true
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


/* =====================================================
   METRICS
===================================================== */

function renderMetrics() {

  let upcoming = 0;

  let completed = 0;

  let cancelled = 0;


  meetings.forEach(
    meeting => {

      const status =
        String(
          meeting.status ||
          "upcoming"
        ).toLowerCase();


      if (
        status ===
        "upcoming"
      ) {

        upcoming++;

      }
      else if (
        status ===
        "completed"
      ) {

        completed++;

      }
      else if (
        status ===
        "cancelled"
      ) {

        cancelled++;

      }

    }
  );


  upcomingCount.textContent =
    upcoming;

  completedCount.textContent =
    completed;

  cancelledCount.textContent =
    cancelled;

}


/* =====================================================
   FILTER
===================================================== */

function getFilteredMeetings() {

  const selected =
    String(
      statusFilter.value
    ).toLowerCase();


  if (
    selected ===
    "all"
  ) {

    return meetings;

  }


  return meetings.filter(
    meeting =>
      String(
        meeting.status ||
        "upcoming"
      ).toLowerCase() ===
      selected
  );

}


/* =====================================================
   RENDER TABLE
===================================================== */

function renderMeetings() {

  const filtered =
    getFilteredMeetings();


  if (
    !filtered.length
  ) {

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
    filtered.map(
      meeting => {

        const status =
          String(
            meeting.status ||
            "upcoming"
          ).toLowerCase();


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
              <strong>
                ${escapeHtml(
                  meeting.title
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                meeting.venue ||
                "—"
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  status
                )}
              </strong>
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


/* =====================================================
   CREATE MEETING
===================================================== */

async function createMeeting(
  event
) {

  event.preventDefault();


  try {

    errorEl.hidden =
      true;


    const title =
      titleInput.value.trim();

    const date =
      dateInput.value;

    const venue =
      venueInput.value.trim();

    const agendaText =
      agendaInput.value.trim();


    if (!title) {

      throw new Error(
        "Please enter a meeting title."
      );

    }


    if (!date) {

      throw new Error(
        "Please select a meeting date."
      );

    }


    saveMeetingButton.disabled =
      true;

    saveMeetingButton.textContent =
      "Saving...";


    /*
      meetings.agenda is a
      PostgreSQL text[] column.

      Convert textarea lines into
      an array.
    */

    const agenda =
      agendaText
        ? agendaText
            .split("\n")
            .map(
              line =>
                line.trim()
            )
            .filter(
              Boolean
            )
        : [];


    const {
      error
    } = await supabase
      .from("meetings")
      .insert({

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
          agenda,

        status:
          "upcoming"

      });


    if (error) {
      throw error;
    }


    meetingForm.reset();

    setDefaultDate();


    await loadMeetings();

    renderMetrics();

    renderMeetings();


    statusEl.textContent =
      "Meeting scheduled successfully.";

  }
  catch (error) {

    showError(
      error
    );

  }
  finally {

    saveMeetingButton.disabled =
      false;

    saveMeetingButton.textContent =
      "Schedule Meeting";

  }

}


/* =====================================================
   SELECT MEETING
===================================================== */

function selectMeeting(
  id
) {

  selectedMeeting =
    meetings.find(
      meeting =>
        meeting.id ===
        id
    );


  if (
    !selectedMeeting
  ) {

    return;

  }


  detailsCard.hidden =
    false;


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
        selectedMeeting.status
      )}
    </p>

    <p>
      <strong>Agenda:</strong>
    </p>

    ${
      Array.isArray(
        selectedMeeting.agenda
      )
        ? `
          <ul>
            ${
              selectedMeeting.agenda
                .map(
                  item =>
                    `<li>${escapeHtml(item)}</li>`
                )
                .join("")
            }
          </ul>
        `
        : `
          <p>
            ${escapeHtml(
              selectedMeeting.agenda ||
              "No agenda recorded."
            )}
          </p>
        `
    }

  `;


  minutesInput.value =
    selectedMeeting.minutes ||
    "";

  resolutionInput.value =
    selectedMeeting.resolution ||
    "";


  /*
    Only allow completing/cancelling
    an upcoming meeting.
  */

  const status =
    String(
      selectedMeeting.status ||
      ""
    ).toLowerCase();


  completeButton.disabled =
    status !==
    "upcoming";


  cancelButton.disabled =
    status !==
    "upcoming";

}


/* =====================================================
   UPDATE MEETING
===================================================== */

async function updateMeeting(
  updates
) {

  if (
    !selectedMeeting
  ) {

    return;

  }


  const {
    error
  } = await supabase
    .from("meetings")
    .update(
      updates
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


  await loadMeetings();

  renderMetrics();

  renderMeetings();


  selectMeeting(
    selectedMeeting.id
  );

}


/* =====================================================
   CHANGE STATUS
===================================================== */

async function changeStatus(
  status
) {

  if (
    !selectedMeeting
  ) {

    return;

  }


  try {

    errorEl.hidden =
      true;


    await updateMeeting({

      status:
        status

    });


    statusEl.textContent =
      `Meeting marked ${status}.`;


  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   SAVE MINUTES
===================================================== */

async function saveMinutes() {

  if (
    !selectedMeeting
  ) {

    return;

  }


  try {

    errorEl.hidden =
      true;


    saveMinutesButton.disabled =
      true;

    saveMinutesButton.textContent =
      "Saving...";


    await updateMeeting({

      minutes:
        minutesInput.value.trim() ||
        null,

      resolution:
        resolutionInput.value.trim() ||
        null

    });


    statusEl.textContent =
      "Minutes and resolutions saved successfully.";


  }
  catch (error) {

    showError(
      error
    );

  }
  finally {

    saveMinutesButton.disabled =
      false;

    saveMinutesButton.textContent =
      "Save Minutes & Resolutions";

  }

}


/* =====================================================
   EDIT MEETING
===================================================== */

async function editMeeting() {

  if (
    !selectedMeeting
  ) {

    return;

  }


  const title =
    window.prompt(
      "Meeting title:",
      selectedMeeting.title
    );


  if (
    title ===
    null
  ) {

    return;

  }


  const venue =
    window.prompt(
      "Venue:",
      selectedMeeting.venue ||
      ""
    );


  if (
    venue ===
    null
  ) {

    return;

  }


  try {

    errorEl.hidden =
      true;


    await updateMeeting({

      title:
        title.trim(),

      venue:
        venue.trim() ||
        null

    });


    statusEl.textContent =
      "Meeting updated successfully.";

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   DELETE
===================================================== */

async function deleteMeeting() {

  if (
    !selectedMeeting
  ) {

    return;

  }


  const confirmed =
    window.confirm(
      "Are you sure you want to delete this meeting?"
    );


  if (!confirmed) {
    return;
  }


  try {

    errorEl.hidden =
      true;


    const {
      error
    } = await supabase
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

    detailsCard.hidden =
      true;


    await loadMeetings();

    renderMetrics();

    renderMeetings();


    statusEl.textContent =
      "Meeting deleted successfully.";

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   TABLE CLICK
===================================================== */

function handleTableClick(
  event
) {

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

    selectMeeting(
      button.dataset.id
    );

  }

}


/* =====================================================
   DEFAULT DATE
===================================================== */

function setDefaultDate() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  dateInput.value =
    `${year}-${month}-${day}`;

}


/* =====================================================
   EVENTS
===================================================== */

meetingForm.addEventListener(
  "submit",
  createMeeting
);


statusFilter.addEventListener(
  "change",
  renderMeetings
);


meetingRows.addEventListener(
  "click",
  handleTableClick
);


editButton.addEventListener(
  "click",
  editMeeting
);


completeButton.addEventListener(
  "click",
  () =>
    changeStatus(
      "completed"
    )
);


cancelButton.addEventListener(
  "click",
  () =>
    changeStatus(
      "cancelled"
    )
);


deleteButton.addEventListener(
  "click",
  deleteMeeting
);


saveMinutesButton.addEventListener(
  "click",
  saveMinutes
);


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    errorEl.hidden =
      true;


    statusEl.textContent =
      "Loading meetings...";


    setDefaultDate();


    groupId =
      await getGroupId();


    await loadMeetings();


    renderMetrics();

    renderMeetings();


    statusEl.textContent =
      `Meetings loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`;

  }
  catch (error) {

    showError(
      error
    );

    statusEl.textContent =
      "Unable to load meetings.";

  }

}


/* =====================================================
   START
===================================================== */

init();
