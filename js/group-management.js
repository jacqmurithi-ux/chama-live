/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT

   RECONSTRUCTED APPLICATION-LAYER CANDIDATE
   ---------------------------------------------------------
   STATUS:
     Reconstructed — NOT HISTORICAL SOURCE

   CONTROL:
     NO-APPLY

   VERIFIED CONTRACT:
     auth.js exports:
       - supabase
       - getMyMember()
       - getMyGroupId()
       - getMyGroup()

   GROUP DATABASE CONTRACT:
     groups.name
     groups.category
     groups.country
     groups.monthly_contribution
     groups.description
     groups.phone
     groups.email

   IMPORTANT:
     UI label may say "Group Type".
     DATABASE FIELD IS:
       groups.category

   APPROVED ADDITION:
     - isolated subscription state
     - read-only get_group_subscription RPC
     - Account Card subscription rendering

   NO ACCOUNTING / 2B LOGIC IS ADDED.
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
  document.getElementById(
    "groupManagementForm"
  );

const groupNameEl =
  document.getElementById(
    "groupName"
  );

const categoryEl =
  document.getElementById(
    "category"
  );

const countryEl =
  document.getElementById(
    "country"
  );

const monthlyContributionEl =
  document.getElementById(
    "monthlyContribution"
  );

const descriptionEl =
  document.getElementById(
    "description"
  );

const phoneEl =
  document.getElementById(
    "phone"
  );

const emailEl =
  document.getElementById(
    "email"
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
    "saveGroupButton"
  );


/* =========================================================
   ACCOUNT CARD
========================================================= */

const accountCardEl =
  document.getElementById(
    "accountCard"
  );

const subscriptionStatusEl =
  document.getElementById(
    "subscriptionStatus"
  );

const subscriptionPlanEl =
  document.getElementById(
    "subscriptionPlan"
  );

const subscriptionAmountEl =
  document.getElementById(
    "subscriptionAmount"
  );

const subscriptionNextBillingEl =
  document.getElementById(
    "subscriptionNextBilling"
  );


/* =========================================================
   INIT
========================================================= */

export async function initGroupManagement() {

  clearMessages();

  try {

    await loadGroup();

    renderGroup();

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


/* =========================================================
   LOAD GROUP
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
   RENDER GROUP
========================================================= */

function renderGroup() {

  if (!currentGroup) {

    return;

  }

  if (groupNameEl) {

    groupNameEl.value =
      currentGroup.name || "";

  }

  /*
   * IMPORTANT:
   *
   * The database field is category.
   * Never use groups.type.
   */

  if (categoryEl) {

    categoryEl.value =
      currentGroup.category || "";

  }

  if (countryEl) {

    countryEl.value =
      currentGroup.country || "";

  }

  if (monthlyContributionEl) {

    monthlyContributionEl.value =
      currentGroup.monthly_contribution ?? 0;

  }

  if (descriptionEl) {

    descriptionEl.value =
      currentGroup.description || "";

  }

  if (phoneEl) {

    phoneEl.value =
      currentGroup.phone || "";

  }

  if (emailEl) {

    emailEl.value =
      currentGroup.email || "";

  }

}


/* =========================================================
   UPDATE GROUP
========================================================= */

async function updateGroup() {

  const groupId =
    await getMyGroupId();

  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }

  const payload = {

    name:
      groupNameEl?.value.trim() || "",

    /*
     * VERIFIED DATABASE CONTRACT:
     * category, NOT type.
     */
    category:
      categoryEl?.value.trim() || "",

    country:
      countryEl?.value.trim() ||
      "Kenya",

    monthly_contribution:
      Number(
        monthlyContributionEl?.value || 0
      ),

    description:
      descriptionEl?.value.trim() || "",

    phone:
      phoneEl?.value.trim() || "",

    email:
      emailEl?.value.trim() || ""

  };

  if (!payload.name) {

    throw new Error(
      "Please enter the group name."
    );

  }

  if (
    !Number.isFinite(
      payload.monthly_contribution
    ) ||
    payload.monthly_contribution < 0
  ) {

    throw new Error(
      "Monthly contribution must be zero or greater."
    );

  }

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .update(payload)
      .eq("id", groupId)
      .select()
      .single();

  if (error) {

    throw error;

  }

  currentGroup =
    data;

  return data;

}


/* =========================================================
   FORM SUBMIT
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      clearMessages();

      setSaving(true);

      try {

        await updateGroup();

        renderGroup();

        showStatus(
          "Group information updated successfully."
        );

      } catch (error) {

        console.error(
          "CHAMA LIVE: group update failed",
          error
        );

        showError(
          error?.message ||
          "Unable to update group information."
        );

      } finally {

        setSaving(false);

      }

    }
  );

}


/* =========================================================
   SUBSCRIPTION
   ---------------------------------------------------------
   APPROVED ADDITION ONLY
   ---------------------------------------------------------
   Read-only canonical RPC:
     get_group_subscription
========================================================= */

async function loadSubscription() {

  const groupId =
    await getMyGroupId();

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

  /*
   * Normalize the two common PostgREST
   * RPC response shapes without changing
   * the database contract.
   */
  subscription =
    Array.isArray(data)
      ? (data[0] || null)
      : data || null;

  return subscription;

}


/* =========================================================
   RENDER SUBSCRIPTION
========================================================= */

function renderSubscription() {

  if (!accountCardEl) {

    return;

  }

  accountCardEl.hidden = false;

  if (!subscription) {

    setElementText(
      subscriptionStatusEl,
      "Not available"
    );

    setElementText(
      subscriptionPlanEl,
      "—"
    );

    setElementText(
      subscriptionAmountEl,
      "—"
    );

    setElementText(
      subscriptionNextBillingEl,
      "—"
    );

    return;

  }

  /*
   * The rendering deliberately tolerates
   * either a single RPC row or a normalized
   * object. It does not write subscription
   * data back to Supabase.
   */

  setElementText(
    subscriptionStatusEl,
    subscription.status ??
    subscription.subscription_status ??
    "—"
  );

  setElementText(
    subscriptionPlanEl,
    subscription.plan_name ??
    subscription.plan ??
    "—"
  );

  setElementText(
    subscriptionAmountEl,
    formatAmount(
      subscription.amount ??
      subscription.monthly_amount ??
      subscription.price
    )
  );

  setElementText(
    subscriptionNextBillingEl,
    formatDate(
      subscription.next_billing_date ??
      subscription.current_period_end
    )
  );

}


/* =========================================================
   UI HELPERS
========================================================= */

function setElementText(
  element,
  value
) {

  if (!element) {

    return;

  }

  element.textContent =
    value == null ||
    value === ""
      ? "—"
      : String(value);

}


function formatAmount(
  value
) {

  if (
    value == null ||
    value === ""
  ) {

    return "—";

  }

  const amount =
    Number(value);

  if (!Number.isFinite(amount)) {

    return String(value);

  }

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
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


function setSaving(
  saving
) {

  if (!saveButton) {

    return;

  }

  saveButton.disabled =
    Boolean(saving);

  saveButton.textContent =
    saving
      ? "Saving..."
      : "Save Changes";

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


function clearMessages() {

  if (statusEl) {

    statusEl.textContent =
      "";

    statusEl.hidden =
      true;

  }

  if (errorEl) {

    errorEl.textContent =
      "";

    errorEl.hidden =
      true;

  }

}


/* =========================================================
   AUTO BOOT
========================================================= */

function boot() {

  initGroupManagement()
    .catch((error) => {

      console.error(
        "CHAMA LIVE: group management boot failed",
        error
      );

    });

}


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true
    }
  );

} else {

  boot();

}
