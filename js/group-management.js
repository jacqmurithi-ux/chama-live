/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT
   RECONCILED CANDIDATE VERSION

   CONTROLLED SCOPE
   ---------------------------------------------------------
   EXISTING
   - Page boot remains owned by admin-layout.js.
   - layout.js imports this module and calls
     initGroupManagement().
   - Group Type maps to groups.category.
   - Subscription uses get_group_subscription().
   - Centralized owner/role context comes from auth.js.
   - Legacy `admin` compatibility role is preserved.
   - Database/RLS remains the authoritative security boundary.

   NEW CANDIDATE
   - Monthly contribution closing-day settings.
   - Group contribution calendar display.
   - Contribution initiative draft creation.
   - Initiative participant configuration.
   - Initiative activation.
   - Initiative read/rendering.

   EXPLICITLY NOT INCLUDED
   - Initiative payment entry.
   - Monthly 2B accounting changes.
   - Direct initiative obligation writes.
   - Direct initiative allocation writes.
   - Database schema changes.
========================================================= */

import {
  supabase,
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let currentGroup = null;

let currentIsOwner = false;

let currentRole = "";

let canManageGroup = false;

let subscription = null;


/*
 * Contribution calendar state.
 */

let contributionSettings = null;


/*
 * Contribution initiative state.
 */

let contributionTypes = [];

let contributionInitiatives = [];


/*
 * Prevent repeated initialization work during the
 * same page lifetime.
 */

let initializationPromise = null;


/* =========================================================
   DOM — EXISTING GROUP MANAGEMENT
========================================================= */

const form =
  document.getElementById(
    "groupForm"
  );

const groupNameEl =
  document.getElementById(
    "groupName"
  );

const groupTypeEl =
  document.getElementById(
    "groupType"
  );

const countryEl =
  document.getElementById(
    "country"
  );

const monthlyContributionEl =
  document.getElementById(
    "monthlyContribution"
  );

const contributionPreviewEl =
  document.getElementById(
    "contributionPreview"
  );

const currentGroupNameEl =
  document.getElementById(
    "currentGroupName"
  );

const memberCountEl =
  document.getElementById(
    "memberCount"
  );

const groupIdEl =
  document.getElementById(
    "groupId"
  );

const statusEl =
  document.getElementById(
    "status"
  );

const errorEl =
  document.getElementById(
    "error"
  );

const saveButton =
  document.getElementById(
    "saveGroup"
  );

const accountCardEl =
  document.querySelector(
    ".account-card"
  );


/* =========================================================
   DOM — CONTRIBUTION CALENDAR
========================================================= */

const contributionCalendarForm =
  document.getElementById(
    "contributionCalendarForm"
  );

const monthlyClosingDayEl =
  document.getElementById(
    "monthlyClosingDay"
  );

const currentContributionCycleEl =
  document.getElementById(
    "currentContributionCycle"
  );

const currentContributionOpeningDateEl =
  document.getElementById(
    "currentContributionOpeningDate"
  );

const currentContributionClosingDateEl =
  document.getElementById(
    "currentContributionClosingDate"
  );

const saveContributionCalendarButton =
  document.getElementById(
    "saveContributionCalendar"
  );


/* =========================================================
   DOM — CONTRIBUTION INITIATIVES
========================================================= */

const initiativeForm =
  document.getElementById(
    "initiativeForm"
  );

const initiativeNameEl =
  document.getElementById(
    "initiativeName"
  );

const initiativeDescriptionEl =
  document.getElementById(
    "initiativeDescription"
  );

const initiativeTypeEl =
  document.getElementById(
    "initiativeType"
  );

const initiativeFrequencyEl =
  document.getElementById(
    "initiativeFrequency"
  );

const initiativeStartDateEl =
  document.getElementById(
    "initiativeStartDate"
  );

const initiativeClosingDateEl =
  document.getElementById(
    "initiativeClosingDate"
  );

const initiativeAmountEl =
  document.getElementById(
    "initiativeAmount"
  );

const createInitiativeButton =
  document.getElementById(
    "createInitiative"
  );

const initiativeListEl =
  document.getElementById(
    "initiativeList"
  );


/* =========================================================
   MESSAGES
========================================================= */

function clearMessages() {

  if (statusEl) {

    statusEl.hidden =
      true;

    statusEl.textContent =
      "";

    statusEl.classList.remove(
      "success",
      "error"
    );

  }


  if (errorEl) {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

  }

}


function showStatus(
  message
) {

  if (!statusEl) {
    return;
  }


  statusEl.textContent =
    message;


  statusEl.classList.remove(
    "error"
  );

  statusEl.classList.add(
    "success"
  );


  statusEl.hidden =
    false;

}


function showError(
  message
) {

  if (!errorEl) {
    return;
  }


  errorEl.textContent =
    message;


  errorEl.hidden =
    false;

}


/* =========================================================
   GENERIC HELPERS
========================================================= */

function normalizeText(
  value
) {

  return String(
    value ??
    ""
  )
    .trim();

}


function escapeHtml(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


function formatMoney(
  amount,
  currency = "KES"
) {

  const numericAmount =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      numericAmount
    )
  ) {

    return "—";

  }


  return (
    `${String(
      currency ||
      "KES"
    ).toUpperCase()} ` +
    numericAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    )
  );

}


function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  /*
   * Date-only values should be parsed as
   * local calendar dates rather than shifted
   * unexpectedly by timezone conversion.
   */

  const text =
    String(
      value
    )
      .slice(
        0,
        10
      );


  const parts =
    text.split(
      "-"
    );


  if (
    parts.length === 3 &&
    parts.every(
      part =>
        /^\d+$/.test(
          part
        )
    )
  ) {

    const year =
      Number(
        parts[0]
      );

    const month =
      Number(
        parts[1]
      );

    const day =
      Number(
        parts[2]
      );


    const date =
      new Date(
        year,
        month - 1,
        day
      );


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return date.toLocaleDateString(
        "en-KE",
        {
          day:
            "2-digit",

          month:
            "short",

          year:
            "numeric"
        }
      );

    }

  }


  return String(
    value
  );

}


function formatDateRange(
  openingDate,
  closingDate
) {

  if (
    !openingDate &&
    !closingDate
  ) {

    return "—";

  }


  return (
    `${formatDate(
      openingDate
    )} – ${formatDate(
      closingDate
    )}`
  );

}


function getInitiativeStatusClass(
  status
) {

  const normalized =
    normalizeText(
      status
    )
      .toLowerCase();


  if (
    [
      "draft",
      "active",
      "closed",
      "cancelled"
    ].includes(
      normalized
    )
  ) {

    return normalized;

  }


  return "draft";

}


function getInitiativeStatusLabel(
  status
) {

  const normalized =
    normalizeText(
      status
    )
      .toLowerCase();


  if (!normalized) {
    return "—";
  }


  return normalized
    .replace(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );

}


/* =========================================================
   AUTHORIZATION / CONTEXT
========================================================= */

async function loadAuthorizationContext() {

  const {
    user,
    member,
    group,
    isOwner,
    role
  } =
    await getMyApplicationContext();


  currentUser =
    user;


  currentMember =
    member;


  currentGroup =
    group;


  currentIsOwner =
    Boolean(
      isOwner
    );


  currentRole =
    String(
      role || ""
    )
      .trim()
      .toLowerCase();


  canManageGroup =
    currentIsOwner ||
    currentRole === "admin";


  return {

    user:
      currentUser,

    member:
      currentMember,

    group:
      currentGroup,

    isOwner:
      currentIsOwner,

    role:
      currentRole,

    canManageGroup:
      canManageGroup

  };

}


/* =========================================================
   APPLY AUTHORIZATION UI
========================================================= */

function applyAuthorizationUI() {

  const controls = [

    saveButton,

    saveContributionCalendarButton,

    createInitiativeButton

  ];


  controls.forEach(
    function (
      control
    ) {

      if (!control) {
        return;
      }


      control.disabled =
        !canManageGroup;

    }
  );


  if (contributionCalendarForm) {

    const field =
      monthlyClosingDayEl;


    if (field) {

      field.disabled =
        !canManageGroup;

    }

  }


  if (initiativeForm) {

    [
      initiativeNameEl,
      initiativeDescriptionEl,
      initiativeTypeEl,
      initiativeFrequencyEl,
      initiativeStartDateEl,
      initiativeClosingDateEl,
      initiativeAmountEl
    ]
      .forEach(
        function (
          field
        ) {

          if (field) {

            field.disabled =
              !canManageGroup;

          }

        }
      );

  }


  if (!canManageGroup) {

    if (saveButton) {

      saveButton.title =
        "Only the group owner or administrator can change group information.";

    }


    if (saveContributionCalendarButton) {

      saveContributionCalendarButton.title =
        "Only the group owner or administrator can change contribution cycle settings.";

    }


    if (createInitiativeButton) {

      createInitiativeButton.title =
        "Only the group owner or administrator can create contribution initiatives.";

    }

  }

  else {

    [
      saveButton,
      saveContributionCalendarButton,
      createInitiativeButton
    ]
      .forEach(
        function (
          control
        ) {

          if (control) {

            control.removeAttribute(
              "title"
            );

          }

        }
      );

  }

}


/* =========================================================
   GROUP RENDER
========================================================= */

function renderGroup() {

  if (!currentGroup) {
    return;
  }


  if (currentGroupNameEl) {

    currentGroupNameEl.textContent =
      currentGroup.name ||
      "CHAMA";

  }


  if (groupNameEl) {

    groupNameEl.value =
      currentGroup.name ||
      "";

  }


  /*
   * IMPORTANT:
   *
   * UI field:
   *     groupType
   *
   * Database field:
   *     groups.category
   *
   * There is no groups.type dependency.
   */

  if (groupTypeEl) {

    groupTypeEl.value =
      currentGroup.category ||
      "Chama";

  }


  if (countryEl) {

    countryEl.value =
      currentGroup.country ||
      "Kenya";

  }


  if (monthlyContributionEl) {

    monthlyContributionEl.value =
      currentGroup.monthly_contribution ??
      0;

  }


  if (groupIdEl) {

    groupIdEl.textContent =
      currentGroup.id ||
      "—";

  }


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      function (
        element
      ) {

        element.textContent =
          currentGroup.name ||
          "CHAMA";

      }
    );


  updateContributionPreview();

}


/* =========================================================
   MEMBER COUNT
========================================================= */

async function loadMemberCount() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {
    return;
  }


  const {
    count,
    error
  } =
    await supabase

      .from(
        "members"
      )

      .select(
        "id",
        {
          count:
            "exact",

          head:
            true
        }
      )

      .eq(
        "group_id",
        groupId
      );


  if (error) {
    throw error;
  }


  if (memberCountEl) {

    memberCountEl.textContent =
      String(
        count ??
        0
      );

  }

}


/* =========================================================
   CONTRIBUTION PREVIEW
========================================================= */

function updateContributionPreview() {

  if (!contributionPreviewEl) {
    return;
  }


  const amount =
    Number(
      monthlyContributionEl?.value ||
      0
    );


  const safeAmount =
    Number.isFinite(
      amount
    ) &&
    amount >= 0
      ? amount
      : 0;


  contributionPreviewEl.textContent =
    `KSh ${safeAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    )}`;

}


/* =========================================================
   SUBSCRIPTION
========================================================= */

async function loadSubscription() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_group_subscription",
      {
        p_group_id:
          groupId
      }
    );


  if (error) {
    throw error;
  }


  subscription =
    Array.isArray(
      data
    )
      ? (
          data[0] ||
          null
        )
      : (
          data ||
          null
        );


  return subscription;

}


/* =========================================================
   SUBSCRIPTION RENDER
========================================================= */

function renderSubscription() {

  if (!accountCardEl) {
    return;
  }


  const existing =
    accountCardEl.querySelector(
      "[data-group-subscription]"
    );


  if (existing) {

    existing.remove();

  }


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.dataset.groupSubscription =
    "true";


  wrapper.className =
    "subscription-panel";


  const heading =
    document.createElement(
      "h3"
    );


  heading.textContent =
    "Subscription";


  wrapper.appendChild(
    heading
  );


  const grid =
    document.createElement(
      "div"
    );


  grid.className =
    "subscription-grid";


  const rows = [

    [
      "Status",
      subscription?.status ||
      "—"
    ],

    [
      "Pricing tier",
      subscription?.pricing_tier_code ||
      "—"
    ],

    [
      "Group amount",
      formatSubscriptionAmount(
        subscription?.standard_group_amount,
        subscription?.currency
      )
    ],

    [
      "Member login amount",
      formatSubscriptionAmount(
        subscription?.standard_member_login_amount,
        subscription?.currency
      )
    ],

    [
      "Start date",
      formatSubscriptionDate(
        subscription?.started_at
      )
    ]

  ];


  rows.forEach(
    function (
      [
        name,
        value
      ]
    ) {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "subscription-item";


      /*
       * Corrected DOM order:
       *
       * span   = label
       * strong = value
       *
       * This matches the CSS contract in the HTML.
       */

      const label =
        document.createElement(
          "span"
        );


      label.textContent =
        name;


      const valueEl =
        document.createElement(
          "strong"
        );


      valueEl.textContent =
        value;


      item.appendChild(
        label
      );


      item.appendChild(
        valueEl
      );


      grid.appendChild(
        item
      );

    }
  );


  wrapper.appendChild(
    grid
  );


  accountCardEl.appendChild(
    wrapper
  );

}


/* =========================================================
   SUBSCRIPTION DATE FORMAT
========================================================= */

function formatSubscriptionDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric"
    }
  );

}


/* =========================================================
   SUBSCRIPTION AMOUNT FORMAT
========================================================= */

function formatSubscriptionAmount(
  amount,
  currency
) {

  if (
    amount === null ||
    amount === undefined
  ) {

    return "—";

  }


  const numericAmount =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      numericAmount
    )
  ) {

    return String(
      amount
    );

  }


  const code =
    String(
      currency ||
      "KES"
    )
      .toUpperCase();


  return (
    `${code} ` +
    numericAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    )
  );

}


/* =========================================================
   CALENDAR — CLOSING DAY OPTIONS
========================================================= */

function populateClosingDayOptions() {

  if (!monthlyClosingDayEl) {
    return;
  }


  const previousValue =
    monthlyClosingDayEl.value;


  monthlyClosingDayEl.innerHTML =
    "";


  for (
    let day = 1;
    day <= 28;
    day += 1
  ) {

    const option =
      document.createElement(
        "option"
      );


    option.value =
      String(
        day
      );


    option.textContent =
      String(
        day
      );


    monthlyClosingDayEl.appendChild(
      option
    );

  }


  if (
    previousValue &&
    Number(
      previousValue
    ) >= 1 &&
    Number(
      previousValue
    ) <= 28
  ) {

    monthlyClosingDayEl.value =
      previousValue;

  }

}


/* =========================================================
   CALENDAR — LOAD SETTINGS
========================================================= */

async function loadContributionSettings() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_group_contribution_settings",
      {
        p_group_id:
          groupId
      }
    );


  if (error) {
    throw error;
  }


  contributionSettings =
    Array.isArray(
      data
    )
      ? (
          data[0] ||
          null
        )
      : (
          data ||
          null
        );


  return contributionSettings;

}


/* =========================================================
   CALENDAR — RENDER SETTINGS
========================================================= */

function renderContributionSettings() {

  if (!contributionSettings) {

    if (monthlyClosingDayEl) {

      monthlyClosingDayEl.value =
        "5";

    }


    if (currentContributionCycleEl) {

      currentContributionCycleEl.textContent =
        "Not configured";

    }


    if (currentContributionOpeningDateEl) {

      currentContributionOpeningDateEl.textContent =
        "—";

    }


    if (currentContributionClosingDateEl) {

      currentContributionClosingDateEl.textContent =
        "—";

    }


    return;

  }


  const closingDay =
    Number(
      contributionSettings.monthly_closing_day ??
      contributionSettings.closing_day ??
      5
    );


  if (monthlyClosingDayEl) {

    monthlyClosingDayEl.value =
      String(
        closingDay
      );

  }


  const openingDate =
    contributionSettings.current_opening_date ??
    contributionSettings.opening_date ??
    null;


  const closingDate =
    contributionSettings.current_closing_date ??
    contributionSettings.closing_date ??
    null;


  if (currentContributionOpeningDateEl) {

    currentContributionOpeningDateEl.textContent =
      formatDate(
        openingDate
      );

  }


  if (currentContributionClosingDateEl) {

    currentContributionClosingDateEl.textContent =
      formatDate(
        closingDate
      );

  }


  if (currentContributionCycleEl) {

    currentContributionCycleEl.textContent =
      formatDateRange(
        openingDate,
        closingDate
      );

  }

}


/* =========================================================
   CALENDAR — SAVE SETTINGS
========================================================= */

async function saveContributionSettings() {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can change contribution cycle settings."
    );

  }


  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const closingDay =
    Number(
      monthlyClosingDayEl?.value
    );


  if (
    !Number.isInteger(
      closingDay
    ) ||
    closingDay < 1 ||
    closingDay > 28
  ) {

    throw new Error(
      "Monthly closing day must be between 1 and 28."
    );

  }


  if (saveContributionCalendarButton) {

    saveContributionCalendarButton.disabled =
      true;

  }


  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "update_group_contribution_settings",
        {
          p_group_id:
            groupId,

          p_monthly_closing_day:
            closingDay
        }
      );


    if (error) {
      throw error;
    }


    contributionSettings =
      Array.isArray(
        data
      )
        ? (
            data[0] ||
            null
          )
        : (
            data ||
            null
          );


    /*
     * The RPC may return the updated settings,
     * or the result may be empty. Reload the
     * authoritative representation in either case.
     */

    if (!contributionSettings) {

      await loadContributionSettings();

    }


    renderContributionSettings();


    showStatus(
      "Monthly contribution cycle saved successfully."
    );

  }

  finally {

    applyAuthorizationUI();

  }

}


/* =========================================================
   INITIATIVE — LOAD CONTRIBUTION TYPES
========================================================= */

async function loadContributionTypes() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  /*
   * Candidate read only.
   *
   * The database/RLS layer remains authoritative.
   * No contribution type is created or changed here.
   */

  const {
    data,
    error
  } =
    await supabase

      .from(
        "contribution_types"
      )

      .select(
        "id,group_id,code,name"
      )

      .eq(
        "group_id",
        groupId
      )

      .order(
        "name",
        {
          ascending:
            true
        }
      );


  if (error) {
    throw error;
  }


  contributionTypes =
    Array.isArray(
      data
    )
      ? data
      : [];


  renderContributionTypes();


  return contributionTypes;

}


/* =========================================================
   INITIATIVE — RENDER TYPES
========================================================= */

function renderContributionTypes() {

  if (!initiativeTypeEl) {
    return;
  }


  const previousValue =
    initiativeTypeEl.value;


  initiativeTypeEl.innerHTML =
    "";


  const placeholder =
    document.createElement(
      "option"
    );


  placeholder.value =
    "";


  placeholder.textContent =
    contributionTypes.length
      ? "Select contribution type"
      : "No contribution types available";


  initiativeTypeEl.appendChild(
    placeholder
  );


  contributionTypes.forEach(
    function (
      type
    ) {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        type.id;


      option.textContent =
        type.name ||
        type.code ||
        "Contribution";


      initiativeTypeEl.appendChild(
        option
      );

    }
  );


  if (
    previousValue &&
    contributionTypes.some(
      type =>
        String(
          type.id
        ) ===
        String(
          previousValue
        )
    )
  ) {

    initiativeTypeEl.value =
      previousValue;

  }

}


/* =========================================================
   INITIATIVE — LOAD INITIATIVES
========================================================= */

async function loadContributionInitiatives() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  /*
   * Candidate read path.
   *
   * No accounting records are written.
   */

  const {
    data,
    error
  } =
    await supabase

      .from(
        "contribution_initiatives"
      )

      .select(
        [
          "id",
          "group_id",
          "contribution_type_id",
          "name",
          "description",
          "start_date",
          "closing_date",
          "default_amount",
          "frequency",
          "status",
          "created_by",
          "created_at",
          "updated_at"
        ].join(",")
      )

      .eq(
        "group_id",
        groupId
      )

      .order(
        "created_at",
        {
          ascending:
            false
        }
      );


  if (error) {
    throw error;
  }


  contributionInitiatives =
    Array.isArray(
      data
    )
      ? data
      : [];


  renderContributionInitiatives();


  return contributionInitiatives;

}


/* =========================================================
   INITIATIVE — TYPE LOOKUP
========================================================= */

function getContributionTypeName(
  contributionTypeId
) {

  const match =
    contributionTypes.find(
      type =>
        String(
          type.id
        ) ===
        String(
          contributionTypeId
        )
    );


  if (!match) {
    return "—";
  }


  return (
    match.name ||
    match.code ||
    "—"
  );

}


/* =========================================================
   INITIATIVE — RENDER
========================================================= */

function renderContributionInitiatives() {

  if (!initiativeListEl) {
    return;
  }


  initiativeListEl.innerHTML =
    "";


  if (
    !contributionInitiatives.length
  ) {

    const empty =
      document.createElement(
        "div"
      );


    empty.className =
      "initiative-empty";


    empty.textContent =
      "No contribution initiatives have been created yet.";


    initiativeListEl.appendChild(
      empty
    );


    return;

  }


  contributionInitiatives.forEach(
    function (
      initiative
    ) {

      initiativeListEl.appendChild(
        createInitiativeCard(
          initiative
        )
      );

    }
  );

}


/* =========================================================
   INITIATIVE — CARD
========================================================= */

function createInitiativeCard(
  initiative
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "initiative-card";


  card.dataset.initiativeId =
    initiative.id;


  const header =
    document.createElement(
      "div"
    );


  header.className =
    "initiative-card-header";


  const heading =
    document.createElement(
      "div"
    );


  heading.className =
    "initiative-card-heading";


  const title =
    document.createElement(
      "h3"
    );


  title.textContent =
    initiative.name ||
    "Untitled initiative";


  heading.appendChild(
    title
  );


  if (
    initiative.description
  ) {

    const description =
      document.createElement(
        "p"
      );


    description.textContent =
      initiative.description;


    heading.appendChild(
      description
    );

  }


  const status =
    document.createElement(
      "span"
    );


  status.className =
    "initiative-status " +
    getInitiativeStatusClass(
      initiative.status
    );


  status.textContent =
    getInitiativeStatusLabel(
      initiative.status
    );


  header.appendChild(
    heading
  );


  header.appendChild(
    status
  );


  card.appendChild(
    header
  );


  const meta =
    document.createElement(
      "div"
    );


  meta.className =
    "initiative-meta";


  appendInitiativeMeta(
    meta,
    "Contribution Type",
    getContributionTypeName(
      initiative.contribution_type_id
    )
  );


  appendInitiativeMeta(
    meta,
    "Amount",
    formatMoney(
      initiative.default_amount
    )
  );


  appendInitiativeMeta(
    meta,
    "Frequency",
    getInitiativeStatusLabel(
      initiative.frequency
    )
  );


  appendInitiativeMeta(
    meta,
    "Start",
    formatDate(
      initiative.start_date
    )
  );


  appendInitiativeMeta(
    meta,
    "Closing",
    formatDate(
      initiative.closing_date
    )
  );


  card.appendChild(
    meta
  );


  /*
   * Participant count is intentionally displayed
   * as a separate placeholder until participant
   * read reconciliation is completed.
   *
   * This prevents inventing a count from data that
   * the current read contract has not yet established.
   */

  const actions =
    document.createElement(
      "div"
    );


  actions.className =
    "initiative-actions";


  if (
    String(
      initiative.status
    ).toLowerCase() ===
    "draft"
  ) {

    if (canManageGroup) {

      const manageButton =
        document.createElement(
          "button"
        );


      manageButton.type =
        "button";


      manageButton.className =
        "btn btn-secondary";


      manageButton.textContent =
        "Manage Members";


      manageButton.dataset.action =
        "manage-members";


      manageButton.dataset.initiativeId =
        initiative.id;


      actions.appendChild(
        manageButton
      );


      const activateButton =
        document.createElement(
          "button"
        );


      activateButton.type =
        "button";


      activateButton.className =
        "btn btn-primary";


      activateButton.textContent =
        "Activate Initiative";


      activateButton.dataset.action =
        "activate-initiative";


      activateButton.dataset.initiativeId =
        initiative.id;


      actions.appendChild(
        activateButton
      );

    }

  }


  if (
    actions.children.length
  ) {

    card.appendChild(
      actions
    );

  }


  return card;

}


/* =========================================================
   INITIATIVE — META HELPER
========================================================= */

function appendInitiativeMeta(
  parent,
  label,
  value
) {

  const item =
    document.createElement(
      "div"
    );


  item.className =
    "initiative-meta-item";


  const labelEl =
    document.createElement(
      "span"
    );


  labelEl.textContent =
    label;


  const valueEl =
    document.createElement(
      "strong"
    );


  valueEl.textContent =
    value;


  item.appendChild(
    labelEl
  );


  item.appendChild(
    valueEl
  );


  parent.appendChild(
    item
  );

}


/* =========================================================
   INITIATIVE — CREATE DRAFT
========================================================= */

async function createInitiative() {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can create contribution initiatives."
    );

  }


  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const name =
    normalizeText(
      initiativeNameEl?.value
    );


  const description =
    normalizeText(
      initiativeDescriptionEl?.value
    ) ||
    null;


  const contributionTypeId =
    initiativeTypeEl?.value ||
    "";


  const frequency =
    initiativeFrequencyEl?.value ||
    "";


  const startDate =
    initiativeStartDateEl?.value ||
    "";


  const closingDate =
    initiativeClosingDateEl?.value ||
    "";


  const amount =
    Number(
      initiativeAmountEl?.value
    );


  if (!name) {

    throw new Error(
      "Initiative name is required."
    );

  }


  if (!contributionTypeId) {

    throw new Error(
      "Contribution type is required."
    );

  }


  if (
    frequency !== "one_time" &&
    frequency !== "monthly"
  ) {

    throw new Error(
      "Initiative frequency is invalid."
    );

  }


  if (!startDate) {

    throw new Error(
      "Initiative start date is required."
    );

  }


  if (!closingDate) {

    throw new Error(
      "Initiative closing date is required."
    );

  }


  if (
    closingDate <
    startDate
  ) {

    throw new Error(
      "Initiative closing date cannot be before the start date."
    );

  }


  if (
    !Number.isFinite(
      amount
    ) ||
    amount < 0
  ) {

    throw new Error(
      "Initiative amount must be a valid non-negative amount."
    );

  }


  if (createInitiativeButton) {

    createInitiativeButton.disabled =
      true;

  }


  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "create_contribution_initiative",
        {
          p_group_id:
            groupId,

          p_name:
            name,

          p_description:
            description,

          p_contribution_type_id:
            contributionTypeId,

          p_start_date:
            startDate,

          p_closing_date:
            closingDate,

          p_default_amount:
            amount,

          p_frequency:
            frequency,

          p_request_id:
            crypto.randomUUID()
        }
      );


    if (error) {
      throw error;
    }


    /*
     * The RPC owns initiative creation.
     *
     * Reload the authoritative list instead of
     * attempting to construct a local accounting
     * record from the returned payload.
     */

    await loadContributionInitiatives();


    initiativeForm?.reset();


    showStatus(
      "Draft contribution initiative created successfully."
    );


    return data;

  }

  finally {

    applyAuthorizationUI();

  }

}


/* =========================================================
   INITIATIVE — LOAD MEMBERS
========================================================= */

async function loadInitiativeMembers(
  initiativeId
) {

  if (!initiativeId) {

    throw new Error(
      "Initiative ID is required."
    );

  }


  /*
   * Candidate read-only query.
   *
   * This is used only for the member configuration
   * interface. The actual write remains owned by
   * set_contribution_initiative_members().
   */

  const {
    data,
    error
  } =
    await supabase

      .from(
        "contribution_initiative_members"
      )

      .select(
        "id,initiative_id,member_id,amount,effective_from,effective_to,status"
      )

      .eq(
        "initiative_id",
        initiativeId
      )

      .order(
        "created_at",
        {
          ascending:
            true
        }
      );


  if (error) {
    throw error;
  }


  return Array.isArray(
    data
  )
    ? data
    : [];

}


/* =========================================================
   INITIATIVE — LOAD GROUP MEMBERS
========================================================= */

async function loadGroupMembers() {

  const groupId =
    currentGroup?.id;


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

      .from(
        "members"
      )

      .select(
        "id,group_id,name,full_name,first_name,last_name,status"
      )

      .eq(
        "group_id",
        groupId
      )

      .order(
        "created_at",
        {
          ascending:
            true
        }
      );


  if (error) {
    throw error;
  }


  return Array.isArray(
    data
  )
    ? data
    : [];

}


/* =========================================================
   INITIATIVE — MEMBER DISPLAY NAME
========================================================= */

function getMemberDisplayName(
  member
) {

  if (
    member?.name
  ) {

    return member.name;

  }


  if (
    member?.full_name
  ) {

    return member.full_name;

  }


  const combined =
    [
      member?.first_name,
      member?.last_name
    ]
      .filter(
        Boolean
      )
      .join(
        " "
      );


  return (
    combined ||
    member?.id ||
    "Member"
  );

}


/* =========================================================
   INITIATIVE — MEMBER CONFIGURATION
========================================================= */

async function showInitiativeMemberConfiguration(
  initiativeId
) {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can configure initiative members."
    );

  }


  const initiative =
    contributionInitiatives.find(
      item =>
        String(
          item.id
        ) ===
        String(
          initiativeId
        )
    );


  if (!initiative) {

    throw new Error(
      "The selected initiative could not be found."
    );

  }


  if (
    String(
      initiative.status
    ).toLowerCase() !==
    "draft"
  ) {

    throw new Error(
      "Members can only be configured while an initiative is in draft status."
    );

  }


  const [
    members,
    participants
  ] =
    await Promise.all([
      loadGroupMembers(),
      loadInitiativeMembers(
        initiativeId
      )
    ]);


  const card =
    initiativeListEl?.querySelector(
      `[data-initiative-id="${CSS.escape(
        String(
          initiativeId
        )
      )}"]`
    );


  if (!card) {
    return;
  }


  const existingPanel =
    card.querySelector(
      ".initiative-members-panel"
    );


  if (existingPanel) {

    existingPanel.remove();

    return;

  }


  const participantMap =
    new Map(
      participants.map(
        participant => [
          String(
            participant.member_id
          ),
          participant
        ]
      )
    );


  const panel =
    document.createElement(
      "div"
    );


  panel.className =
    "initiative-members-panel";


  const heading =
    document.createElement(
      "h4"
    );


  heading.textContent =
    "Configure Initiative Members";


  panel.appendChild(
    heading
  );


  const list =
    document.createElement(
      "div"
    );


  list.className =
    "initiative-member-list";


  members.forEach(
    function (
      member
    ) {

      const row =
        document.createElement(
          "label"
        );


      row.className =
        "initiative-member-row";


      const name =
        document.createElement(
          "span"
        );


      name.className =
        "initiative-member-name";


      name.textContent =
        getMemberDisplayName(
          member
        );


      const input =
        document.createElement(
          "input"
        );


      input.type =
        "number";


      input.min =
        "0";


      input.step =
        "0.01";


      input.inputMode =
        "decimal";


      input.placeholder =
        "Amount";


      input.dataset.memberId =
        member.id;


      const participant =
        participantMap.get(
          String(
            member.id
          )
        );


      if (participant) {

        input.value =
          participant.amount ??
          "";

      }


      row.appendChild(
        name
      );


      row.appendChild(
        input
      );


      list.appendChild(
        row
      );

    }
  );


  panel.appendChild(
    list
  );


  const actions =
    document.createElement(
      "div"
    );


  actions.className =
    "initiative-actions";


  const saveButton =
    document.createElement(
      "button"
    );


  saveButton.type =
    "button";


  saveButton.className =
    "btn btn-primary";


  saveButton.textContent =
    "Save Members";


  saveButton.dataset.action =
    "save-members";


  saveButton.dataset.initiativeId =
    initiativeId;


  actions.appendChild(
    saveButton
  );


  panel.appendChild(
    actions
  );


  card.appendChild(
    panel
  );

}


/* =========================================================
   INITIATIVE — SAVE MEMBERS
========================================================= */

async function saveInitiativeMembers(
  initiativeId,
  panel
) {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can configure initiative members."
    );

  }


  const inputs =
    panel.querySelectorAll(
      "input[data-member-id]"
    );


  const members = [];


  inputs.forEach(
    function (
      input
    ) {

      const amount =
        Number(
          input.value
        );


      /*
       * Blank means the member is not participating.
       */

      if (
        input.value === ""
      ) {

        return;

      }


      if (
        !Number.isFinite(
          amount
        ) ||
        amount < 0
      ) {

        throw new Error(
          "Each participant amount must be a valid non-negative amount."
        );

      }


      members.push({

        member_id:
          input.dataset.memberId,

        amount

      });

    }
  );


  const button =
    panel.querySelector(
      '[data-action="save-members"]'
    );


  if (button) {

    button.disabled =
      true;

  }


  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "set_contribution_initiative_members",
        {
          p_initiative_id:
            initiativeId,

          p_members:
            members,

          p_request_id:
            crypto.randomUUID()
        }
      );


    if (error) {
      throw error;
    }


    showStatus(
      "Initiative members saved successfully."
    );


    /*
     * Refresh the card/list from the database.
     */

    await loadContributionInitiatives();


    return data;

  }

  finally {

    applyAuthorizationUI();

  }

}


/* =========================================================
   INITIATIVE — ACTIVATE
========================================================= */

async function activateInitiative(
  initiativeId
) {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can activate contribution initiatives."
    );

  }


  const initiative =
    contributionInitiatives.find(
      item =>
        String(
          item.id
        ) ===
        String(
          initiativeId
        )
    );


  if (!initiative) {

    throw new Error(
      "The selected initiative could not be found."
    );

  }


  if (
    String(
      initiative.status
    ).toLowerCase() !==
    "draft"
  ) {

    throw new Error(
      "Only draft initiatives can be activated."
    );

  }


  const confirmed =
    window.confirm(
      [
        "Activate this contribution initiative?",
        "",
        "Activation will create the accounting obligations",
        "for the configured participants.",
        "",
        "The initiative's accounting terms become active",
        "and cannot be silently rewritten afterward."
      ].join(
        "\n"
      )
    );


  if (!confirmed) {
    return;
  }


  const actionButton =
    initiativeListEl?.querySelector(
      `[data-action="activate-initiative"][data-initiative-id="${CSS.escape(
        String(
          initiativeId
        )
      )}"]`
    );


  if (actionButton) {

    actionButton.disabled =
      true;

  }


  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "activate_contribution_initiative",
        {
          p_initiative_id:
            initiativeId,

          p_request_id:
            crypto.randomUUID()
        }
      );


    if (error) {
      throw error;
    }


    await loadContributionInitiatives();


    showStatus(
      "Contribution initiative activated successfully."
    );


    return data;

  }

  finally {

    applyAuthorizationUI();

  }

}


/* =========================================================
   INITIATIVE — EVENT DELEGATION
========================================================= */

if (initiativeListEl) {

  initiativeListEl.addEventListener(
    "click",
    async function (
      event
    ) {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {
        return;
      }


      const action =
        button.dataset.action;


      const initiativeId =
        button.dataset.initiativeId;


      if (!initiativeId) {
        return;
      }


      clearMessages();


      try {

        if (
          action ===
          "manage-members"
        ) {

          await showInitiativeMemberConfiguration(
            initiativeId
          );

          return;

        }


        if (
          action ===
          "save-members"
        ) {

          const panel =
            button.closest(
              ".initiative-members-panel"
            );


          if (!panel) {
            return;
          }


          await saveInitiativeMembers(
            initiativeId,
            panel
          );

          return;

        }


        if (
          action ===
          "activate-initiative"
        ) {

          await activateInitiative(
            initiativeId
          );

        }

      }

      catch (
        error
      ) {

        console.error(
          "CHAMA LIVE: initiative action failed",
          error
        );


        showError(
          error?.message ||
          "Unable to complete the initiative action."
        );

      }

    }
  );

}


/* =========================================================
   SAVE GROUP
========================================================= */

async function saveGroup() {

  if (!canManageGroup) {

    throw new Error(
      "Only the group owner or administrator can change group information."
    );

  }


  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const name =
    groupNameEl?.value
      .trim() ||
    "";


  const category =
    groupTypeEl?.value ||
    "";


  const country =
    countryEl?.value
      .trim() ||
    "Kenya";


  const monthlyContribution =
    Number(
      monthlyContributionEl?.value ||
      0
    );


  if (!name) {

    throw new Error(
      "Group name is required."
    );

  }


  if (!category) {

    throw new Error(
      "Group type is required."
    );

  }


  if (
    !Number.isFinite(
      monthlyContribution
    ) ||
    monthlyContribution < 0
  ) {

    throw new Error(
      "Monthly contribution must be a valid non-negative amount."
    );

  }


  const payload = {

    name,

    category,

    country,

    monthly_contribution:
      monthlyContribution

  };


  if (saveButton) {

    saveButton.disabled =
      true;

  }


  try {

    const {
      data,
      error
    } =
      await supabase

        .from(
          "groups"
        )

        .update(
          payload
        )

        .eq(
          "id",
          groupId
        )

        .select(
          "id,name,category,monthly_contribution,country"
        )

        .single();


    if (error) {
      throw error;
    }


    currentGroup =
      data;


    renderGroup();


    showStatus(
      "Group information saved successfully."
    );

  }

  finally {

    applyAuthorizationUI();

  }

}


/* =========================================================
   EVENTS — EXISTING
========================================================= */

if (monthlyContributionEl) {

  monthlyContributionEl.addEventListener(
    "input",
    updateContributionPreview
  );

}


if (form) {

  form.addEventListener(
    "submit",
    async function (
      event
    ) {

      event.preventDefault();

      clearMessages();


      try {

        await saveGroup();

      }

      catch (
        error
      ) {

        console.error(
          "CHAMA LIVE: group update failed",
          error
        );


        showError(
          error?.message ||
          "Unable to save group information."
        );

      }

    }
  );

}


/* =========================================================
   EVENTS — CALENDAR
========================================================= */

if (contributionCalendarForm) {

  contributionCalendarForm.addEventListener(
    "submit",
    async function (
      event
    ) {

      event.preventDefault();

      clearMessages();


      try {

        await saveContributionSettings();

      }

      catch (
        error
      ) {

        console.error(
          "CHAMA LIVE: contribution calendar update failed",
          error
        );


        showError(
          error?.message ||
          "Unable to save contribution cycle settings."
        );

      }

    }
  );

}


/* =========================================================
   EVENTS — INITIATIVE CREATION
========================================================= */

if (initiativeForm) {

  initiativeForm.addEventListener(
    "submit",
    async function (
      event
    ) {

      event.preventDefault();

      clearMessages();


      try {

        await createInitiative();

      }

      catch (
        error
      ) {

        console.error(
          "CHAMA LIVE: initiative creation failed",
          error
        );


        showError(
          error?.message ||
          "Unable to create contribution initiative."
        );

      }

    }
  );

}


/* =========================================================
   INITIALIZER
========================================================= */

export async function initGroupManagement() {

  /*
   * Prevent duplicate initialization if the layout
   * module calls the page initializer more than once.
   */

  if (initializationPromise) {

    return initializationPromise;

  }


  initializationPromise =
    initializeGroupManagement();


  return initializationPromise;

}


/* =========================================================
   INITIALIZATION IMPLEMENTATION
========================================================= */

async function initializeGroupManagement() {

  clearMessages();


  try {

    /*
     * Resolve the complete application context once.
     */

    await loadAuthorizationContext();


    if (!currentGroup?.id) {

      throw new Error(
        "Group information could not be resolved."
      );

    }


    /*
     * Apply authorization state before rendering
     * management controls.
     */

    applyAuthorizationUI();


    /*
     * Existing group-management functionality.
     */

    renderGroup();


    await loadMemberCount();


    await loadSubscription();


    renderSubscription();


    /*
     * New monthly contribution calendar.
     */

    populateClosingDayOptions();


    await loadContributionSettings();


    renderContributionSettings();


    /*
     * New contribution initiatives.
     */

    await loadContributionTypes();


    await loadContributionInitiatives();


    /*
     * Re-apply authorization after all controls
     * have been initialized.
     */

    applyAuthorizationUI();

  }

  catch (
    error
  ) {

    console.error(
      "CHAMA LIVE: group management initialization failed",
      error
    );


    /*
     * A failed context must never leave management
     * controls appearing editable.
     */

    canManageGroup =
      false;


    applyAuthorizationUI();


    showError(
      error?.message ||
      "Unable to load group information."
    );

  }

}
