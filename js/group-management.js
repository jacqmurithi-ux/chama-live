/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT
   Reconciled application-layer version

   CONTRACT:
   - Page boot is owned by layout.js.
   - layout.js imports this module and calls
     initGroupManagement().
   - Group Type maps to groups.category.
   - Subscription is read through
     get_group_subscription().
   - No accounting / 2B dependencies belong in this module.
========================================================= */

import {
  supabase,
  getMyGroupId,
  getMyGroup
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentGroup = null;
let subscription = null;


/* =========================================================
   DOM
========================================================= */

const form =
  document.getElementById("groupForm");

const groupNameEl =
  document.getElementById("groupName");

const groupTypeEl =
  document.getElementById("groupType");

const countryEl =
  document.getElementById("country");

const monthlyContributionEl =
  document.getElementById("monthlyContribution");

const contributionPreviewEl =
  document.getElementById("contributionPreview");

const currentGroupNameEl =
  document.getElementById("currentGroupName");

const memberCountEl =
  document.getElementById("memberCount");

const groupIdEl =
  document.getElementById("groupId");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const saveButton =
  document.getElementById("saveGroup");

const accountCardEl =
  document.querySelector(".account-card");


/* =========================================================
   MESSAGES
========================================================= */

function clearMessages() {

  if (statusEl) {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

}


function showStatus(message) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.hidden = false;

}


function showError(message) {

  if (!errorEl) {
    return;
  }

  errorEl.textContent = message;
  errorEl.hidden = false;

}


/* =========================================================
   GROUP LOAD
========================================================= */

async function loadGroup() {

  currentGroup =
    await getMyGroup();

  if (!currentGroup?.id) {

    throw new Error(
      "Group information could not be resolved."
    );

  }

  return currentGroup;

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
      currentGroup.name || "CHAMA";

  }


  if (groupNameEl) {

    groupNameEl.value =
      currentGroup.name || "";

  }


  /*
   * IMPORTANT:
   * UI field is groupType.
   * Database field is groups.category.
   */
  if (groupTypeEl) {

    groupTypeEl.value =
      currentGroup.category || "chama";

  }


  if (countryEl) {

    countryEl.value =
      currentGroup.country || "Kenya";

  }


  if (monthlyContributionEl) {

    monthlyContributionEl.value =
      currentGroup.monthly_contribution ?? 0;

  }


  if (groupIdEl) {

    groupIdEl.textContent =
      currentGroup.id || "—";

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
  } = await supabase
    .from("members")
    .select("id", {
      count: "exact",
      head: true
    })
    .eq("group_id", groupId);


  if (error) {
    throw error;
  }


  if (memberCountEl) {

    memberCountEl.textContent =
      String(count ?? 0);

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
      monthlyContributionEl?.value || 0
    );


  const safeAmount =
    Number.isFinite(amount) &&
    amount >= 0
      ? amount
      : 0;


  contributionPreviewEl.textContent =
    `KSh ${safeAmount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

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

  const groupId =
    currentGroup?.id ||
    await getMyGroupId();


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const {
    data,
    error
  } = await supabase.rpc(
    "get_group_subscription",
    {
      p_group_id: groupId
    }
  );


  if (error) {
    throw error;
  }


  subscription =
    Array.isArray(data)
      ? (data[0] || null)
      : (data || null);


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
   * Prevent duplicate rendering if the initializer is
   * called again during the same page lifetime.
   */
  const existing =
    accountCardEl.querySelector(
      "[data-group-subscription]"
    );


  if (existing) {
    existing.remove();
  }


  const wrapper =
    document.createElement("div");


  wrapper.dataset.groupSubscription =
    "true";

  wrapper.className =
    "contribution-highlight";


  const label =
    document.createElement("span");


  label.className =
    "contribution-highlight-label";

  label.textContent =
    "Subscription";


  wrapper.appendChild(label);


  const rows = [

    [
      "Status",
      subscription?.status || "—"
    ],

    [
      "Pricing tier",
      subscription?.pricing_tier_code || "—"
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
    ]

  ];


  rows.forEach(
    function ([name, value]) {

      const row =
        document.createElement("div");


      const strong =
        document.createElement("strong");


      strong.textContent =
        `${name}: `;


      row.appendChild(strong);


      row.appendChild(
        document.createTextNode(value)
      );


      wrapper.appendChild(row);

    }
  );


  accountCardEl.appendChild(wrapper);

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
    Number(amount);


  if (!Number.isFinite(numericAmount)) {

    return String(amount);

  }


  const code =
    String(
      currency || "KES"
    ).toUpperCase();


  return `${code} ${numericAmount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

}


/* =========================================================
   SAVE GROUP
========================================================= */

async function saveGroup() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const name =
    groupNameEl?.value.trim() || "";


  const category =
    groupTypeEl?.value || "";


  const country =
    countryEl?.value.trim() || "Kenya";


  const monthlyContribution =
    Number(
      monthlyContributionEl?.value || 0
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
    saveButton.disabled = true;
  }


  try {

    const {
      data,
      error
    } = await supabase

      .from("groups")

      .update(payload)

      .eq("id", groupId)

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


  } finally {

    if (saveButton) {
      saveButton.disabled = false;
    }

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
    async function (event) {

      event.preventDefault();

      clearMessages();


      try {

        await saveGroup();

      } catch (error) {

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

    await loadGroup();

    renderGroup();

    await loadMemberCount();

    await loadSubscription();

    renderSubscription();


  } catch (error) {

    console.error(
      "CHAMA LIVE: group management initialization failed",
      error
    );


    showError(
      error?.message ||
      "Unable to load group information."
    );

  }

}
