/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT
   RECONCILED APPLICATION-LAYER VERSION

   CONTROLLED SCOPE
   ---------------------------------------------------------
   - Page boot is owned by layout.js.
   - layout.js imports this module and calls
     initGroupManagement().
   - Group Type maps to groups.category.
   - Subscription is read through
     get_group_subscription().
   - Centralized owner/role context comes from auth.js.
   - Legacy `admin` compatibility role is preserved.
   - Database/RLS remains the authoritative security boundary.
   - No accounting / 2B dependencies belong in this module.
   - No database changes are made by this file.
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


/* =========================================================
   DOM
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
   MESSAGES
========================================================= */

function clearMessages() {

  if (statusEl) {

    statusEl.hidden =
      true;

    statusEl.textContent =
      "";

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
   AUTHORIZATION / CONTEXT
========================================================= */

/*
 * Centralized context boundary.
 *
 * auth.js is responsible for resolving:
 *
 *     user
 *     member
 *     group
 *     isOwner
 *     role
 *
 * This module must not independently resolve
 * owner_user_id or calculate ownership.
 *
 * Existing compatibility rule:
 *
 *     owner
 *       OR
 *     legacy admin
 *
 * may use the group-management UI.
 *
 * The database remains the authoritative security
 * boundary for the actual groups UPDATE operation.
 */

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

  if (!saveButton) {
    return;
  }


  saveButton.disabled =
    !canManageGroup;


  if (!canManageGroup) {

    saveButton.title =
      "Only the group owner or administrator can change group information.";

  }

  else {

    saveButton.removeAttribute(
      "title"
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
      "chama";

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
=========================================================

   Verified RPC:

     get_group_subscription(uuid)

   Verified returned fields:

     subscription_id
     group_id
     status
     started_at
     pricing_tier_code
     standard_group_amount
     standard_member_login_amount
     currency

========================================================= */

async function loadSubscription() {

  /*
   * The centralized application context has already
   * resolved the current group.
   *
   * Do not call getMyGroupId() again.
   */

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


  /*
   * Prevent duplicate rendering if the initializer
   * is called again during the same page lifetime.
   */

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


  /*
   * Reuse the subscription styling already defined
   * by group-management.html.
   */

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


      const label =
        document.createElement(
          "strong"
        );


      label.textContent =
        name;


      const valueEl =
        document.createElement(
          "span"
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
   SAVE GROUP
========================================================= */

async function saveGroup() {

  /*
   * Frontend authorization gate only.
   *
   * This is NOT the security boundary.
   *
   * The database RLS policy remains authoritative.
   *
   * Compatibility rule:
   *
   *     owner
   *       OR
   *     legacy admin
   */

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


  /*
   * IMPORTANT:
   *
   * groupType → category
   *
   * There is no groups.type field.
   */

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
   EVENTS
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

      catch (error) {

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
   INITIALIZER
========================================================= */

export async function initGroupManagement() {

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
     * Apply frontend authorization state before
     * rendering the management form.
     */

    applyAuthorizationUI();


    renderGroup();


    await loadMemberCount();


    await loadSubscription();


    renderSubscription();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: group management initialization failed",
      error
    );


    /*
     * A failed context must never leave the form
     * appearing editable.
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
