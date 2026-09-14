/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT
   COMPLETE VISUAL + SCHEMA-ALIGNED VERSION

   DATABASE
   ---------------------------------------------------------
   groups.name
   groups.category
   groups.country
   groups.monthly_contribution

   IMPORTANT:
       There is NO groups.type column.

       UI:
           Group Type

       DATABASE:
           groups.category

   GROUP CONTEXT
   ---------------------------------------------------------
       currentMember.group_id
                ↓
             groups.id

   This keeps Group Management consistent with:
       Dashboard
       Members
       Contributions
       Expenses
       Meetings
       Reports
       Monthly Closing

   SUBSCRIPTION
   ---------------------------------------------------------
       Read-only group subscription context.

       Canonical RPC:
           get_group_subscription(p_group_id)

       Subscription state is isolated from:
           group

       No subscription mutation is performed here.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: group-management.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("groupForm");

const groupNameInput =
  document.getElementById("groupName");

const groupTypeInput =
  document.getElementById("groupType");

const countryInput =
  document.getElementById("country");

const monthlyContributionInput =
  document.getElementById(
    "monthlyContribution"
  );

const contributionPreviewEl =
  document.getElementById(
    "contributionPreview"
  );

const saveButton =
  document.getElementById("saveGroup");

const groupIdEl =
  document.getElementById("groupId");

const memberCountEl =
  document.getElementById("memberCount");

const currentGroupNameEl =
  document.getElementById(
    "currentGroupName"
  );


/* =========================================================
   ACCOUNT CARD
========================================================= */

const accountCardEl =
  document.querySelector(
    ".account-card"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let group = null;

/*
   Isolated subscription state.

   This must never be merged into `group`.
*/
let subscription = null;

let initialized = false;


/* =========================================================
   MONEY FORMATTER
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


/* =========================================================
   STATUS
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


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Group Management:",
    error
  );


  if (!errorEl) {

    return;

  }


  let message =
    error?.message ||
    String(error) ||
    "Unable to process group information.";


  /*
     Friendly handling of the old
     groups.type schema mistake.
  */

  if (
    message.toLowerCase().includes(
      "groups.type"
    )
  ) {

    message =
      "The group type must use the database field 'category'. This page has been aligned to that schema.";

  }


  errorEl.textContent =
    message;

  errorEl.hidden =
    false;

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (!errorEl) {

    return;

  }

  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  /*
     IMPORTANT

     The canonical group fields are:

       id
       name
       category
       country
       monthly_contribution
       created_at

     DO NOT change category to type.
  */

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        category,
        country,
        monthly_contribution,
        created_at
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Group record could not be found."
    );

  }


  group =
    data;


  console.log(
    "CHAMA LIVE: group loaded",
    group
  );

}


/* =========================================================
   LOAD MEMBER COUNT
========================================================= */

async function loadMemberCount() {

  if (!groupId) {

    return;

  }


  const {
    count,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id",
        {
          count: "exact",
          head: true
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
      Number(count || 0);

  }

}


/* =========================================================
   LOAD SUBSCRIPTION
========================================================= */

async function loadSubscription() {

  subscription =
    null;


  if (!groupId) {

    return;

  }


  /*
     Read-only canonical subscription contract.

     No fallback query is introduced.
     No subscription table is accessed directly.
  */

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

    /*
       Subscription is an additive informational surface.

       A subscription-read failure must not prevent the
       established Group Management workflow from loading.
    */

    console.warn(
      "CHAMA LIVE: subscription information unavailable",
      error
    );

    return;

  }


  /*
     The RPC returns TABLE rows.

     Preserve only the first group-scoped result.
  */

  subscription =
    Array.isArray(data)
      ? (
          data[0] ||
          null
        )
      : (
          data ||
          null
        );


  console.log(
    "CHAMA LIVE: subscription loaded",
    subscription
  );

}


/* =========================================================
   RENDER SUBSCRIPTION
========================================================= */

function renderSubscription() {

  if (!accountCardEl) {

    return;

  }


  /*
     Remove only the panel previously created by this
     subscription renderer.

     Existing Account Card markup remains untouched.
  */

  accountCardEl
    .querySelector(
      "[data-chama-subscription-panel]"
    )
    ?.remove();


  /*
     Do not invent a business status when the canonical
     subscription read returned no record.

     The existing Account Card remains exactly as it was.
  */

  if (!subscription) {

    return;

  }


  const panel =
    document.createElement("div");

  panel.className =
    "account-box";

  panel.dataset.chamaSubscriptionPanel =
    "true";


  /* -------------------------------------------------------
     STATUS
  ------------------------------------------------------- */

  const statusRow =
    document.createElement("div");

  statusRow.className =
    "account-status";


  const dot =
    document.createElement("span");

  dot.className =
    "account-dot";


  const statusText =
    document.createElement("span");


  const status =
    String(
      subscription.status ||
      "unknown"
    )
      .trim()
      .toLowerCase();


  const displayStatus =
    status
      ? (
          status.charAt(0).toUpperCase() +
          status.slice(1)
        )
      : "Unknown";


  statusText.textContent =
    `Subscription: ${displayStatus}`;


  statusRow.append(
    dot,
    statusText
  );


  panel.append(
    statusRow
  );


  /* -------------------------------------------------------
     DESCRIPTION
  ------------------------------------------------------- */

  const description =
    document.createElement("p");

  description.className =
    "muted";

  description.textContent =
    "Current subscription context for this group.";


  panel.append(
    description
  );


  /* -------------------------------------------------------
     SUBSCRIPTION CONTEXT
  ------------------------------------------------------- */

  const list =
    document.createElement("ul");

  list.className =
    "context-list";


  function addContextItem(
    label,
    value
  ) {

    const item =
      document.createElement("li");

    const check =
      document.createElement("span");

    check.className =
      "context-check";

    check.textContent =
      "✓";


    const text =
      document.createElement("span");

    text.textContent =
      `${label}: ${value}`;


    item.append(
      check,
      text
    );

    list.append(
      item
    );

  }


  const tier =
    String(
      subscription.pricing_tier_code ||
      "—"
    );


  const currency =
    String(
      subscription.currency ||
      "KES"
    );


  const groupAmount =
    Number(
      subscription.standard_group_amount ||
      0
    );


  const memberLoginAmount =
    Number(
      subscription.standard_member_login_amount ||
      0
    );


  const startedAt =
    subscription.started_at
      ? new Date(
          subscription.started_at
        ).toLocaleDateString(
          "en-KE"
        )
      : "—";


  addContextItem(
    "Pricing tier",
    tier
  );


  addContextItem(
    "Group amount",
    `${currency} ${groupAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )}`
  );


  addContextItem(
    "Member login amount",
    `${currency} ${memberLoginAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )}`
  );


  addContextItem(
    "Started",
    startedAt
  );


  panel.append(
    list
  );


  accountCardEl.append(
    panel
  );

}


/* =========================================================
   UPDATE CONTRIBUTION PREVIEW
========================================================= */

function updateContributionPreview() {

  if (!contributionPreviewEl) {

    return;

  }


  const amount =
    Number(
      monthlyContributionInput?.value ||
      0
    );


  contributionPreviewEl.textContent =
    money(amount);

}


/* =========================================================
   RENDER GROUP
========================================================= */

function renderGroup() {

  if (!group) {

    return;

  }


  /* -------------------------------------------------------
     GROUP NAME
  ------------------------------------------------------- */

  if (groupNameInput) {

    groupNameInput.value =
      group.name ||
      "";

  }


  /* -------------------------------------------------------
     GROUP TYPE

     UI:
         groupType

     DATABASE:
         category
  ------------------------------------------------------- */

  if (groupTypeInput) {

    const category =
      String(
        group.category ||
        "chama"
      )
        .trim()
        .toLowerCase();


    const optionExists =
      Array.from(
        groupTypeInput.options
      )
      .some(
        option =>
          option.value ===
          category
      );


    if (optionExists) {

      groupTypeInput.value =
        category;

    }
    else {

      groupTypeInput.value =
        "other";

    }

  }


  /* -------------------------------------------------------
     COUNTRY
  ------------------------------------------------------- */

  if (countryInput) {

    countryInput.value =
      group.country ||
      "Kenya";

  }


  /* -------------------------------------------------------
     MONTHLY CONTRIBUTION
  ------------------------------------------------------- */

  if (
    monthlyContributionInput
  ) {

    monthlyContributionInput.value =
      Number(
        group.monthly_contribution ||
        0
      );

  }


  /* -------------------------------------------------------
     GROUP ID
  ------------------------------------------------------- */

  if (groupIdEl) {

    groupIdEl.textContent =
      group.id ||
      "—";

  }


  /* -------------------------------------------------------
     GROUP NAME OVERVIEW
  ------------------------------------------------------- */

  if (currentGroupNameEl) {

    currentGroupNameEl.textContent =
      group.name ||
      "—";

  }


  updateContributionPreview();

}


/* =========================================================
   SAVE GROUP
========================================================= */

async function saveGroup(event) {

  event.preventDefault();


  try {

    clearError();

    showStatus("");


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    /* -------------------------------------------------------
       READ FORM
    ------------------------------------------------------- */

    const name =
      String(
        groupNameInput?.value ||
        ""
      )
        .trim();


    /*
       UI label:

           Group Type

       Database:

           category
    */

    const category =
      String(
        groupTypeInput?.value ||
        ""
      )
        .trim()
        .toLowerCase();


    const country =
      String(
        countryInput?.value ||
        ""
      )
        .trim();


    const monthlyContribution =
      Number(
        monthlyContributionInput?.value ||
        0
      );


    /* -------------------------------------------------------
       VALIDATION
    ------------------------------------------------------- */

    if (!name) {

      throw new Error(
        "Please enter the group name."
      );

    }


    if (!category) {

      throw new Error(
        "Please select the group type."
      );

    }


    if (!country) {

      throw new Error(
        "Please enter the country."
      );

    }


    if (
      !Number.isFinite(
        monthlyContribution
      )
    ) {

      throw new Error(
        "Please enter a valid monthly contribution."
      );

    }


    if (
      monthlyContribution < 0
    ) {

      throw new Error(
        "Monthly contribution cannot be negative."
      );

    }


    /* -------------------------------------------------------
       BUTTON STATE
    ------------------------------------------------------- */

    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    showStatus(
      "Saving group information..."
    );


    /* -------------------------------------------------------
       DATABASE PAYLOAD

       IMPORTANT:
           category NOT type.
    ------------------------------------------------------- */

    const payload = {

      name:
        name,

      category:
        category,

      country:
        country,

      monthly_contribution:
        monthlyContribution

    };


    console.log(
      "CHAMA LIVE: updating group",
      {
        groupId,
        payload
      }
    );


    /* -------------------------------------------------------
       UPDATE GROUP
    ------------------------------------------------------- */

    const {
      data,
      error
    } =
      await supabase
        .from("groups")
        .update(
          payload
        )
        .eq(
          "id",
          groupId
        )
        .select(`
          id,
          name,
          category,
          country,
          monthly_contribution,
          created_at
        `)
        .single();


    if (error) {

      throw error;

    }


    if (!data) {

      throw new Error(
        "Group information was not updated."
      );

    }


    group =
      data;


    /* -------------------------------------------------------
       RENDER UPDATED DATA
    ------------------------------------------------------- */

    renderGroup();


    showStatus(
      "✓ Group information updated successfully."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      3000
    );


  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Changes";

    }

  }

}


/* =========================================================
   SETUP EVENTS
========================================================= */

function setupEvents() {

  form?.addEventListener(
    "submit",
    saveGroup
  );


  monthlyContributionInput
    ?.addEventListener(
      "input",
      updateContributionPreview
    );


  monthlyContributionInput
    ?.addEventListener(
      "change",
      updateContributionPreview
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: group management already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading group information..."
    );


    /* -------------------------------------------------------
       AUTHENTICATION
    ------------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /* -------------------------------------------------------
       MEMBER CONTEXT
    ------------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /* -------------------------------------------------------
       GROUP CONTEXT
       
       Canonical CHAMA LIVE relationship:

           member.group_id
                  ↓
             groups.id
    ------------------------------------------------------- */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    console.log(
      "CHAMA LIVE: group management context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


    /* -------------------------------------------------------
       EVENTS
    ------------------------------------------------------- */

    setupEvents();


    /* -------------------------------------------------------
       DATA
    ------------------------------------------------------- */

    await loadGroup();

    await loadMemberCount();

    await loadSubscription();


    /* -------------------------------------------------------
       RENDER
    ------------------------------------------------------- */

    renderGroup();

    renderSubscription();


    showStatus(
      "Group information ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2000
    );


    console.log(
      "CHAMA LIVE: group management initialized"
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

export const initGroupManagement =
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
  "CHAMA LIVE: group-management.js ready"
);

