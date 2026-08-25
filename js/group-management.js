import { supabase } from "./supabase.js";


/* -------------------------------------------------------
   ELEMENTS
------------------------------------------------------- */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("groupForm");

const groupNameInput =
  document.getElementById("groupName");

const openingBalanceInput =
  document.getElementById("openingBalance");

const monthlyContributionInput =
  document.getElementById(
    "monthlyContribution"
  );

const saveButton =
  document.getElementById("saveButton");

const currentGroupName =
  document.getElementById(
    "currentGroupName"
  );

const currentOpeningBalance =
  document.getElementById(
    "currentOpeningBalance"
  );

const currentMonthlyContribution =
  document.getElementById(
    "currentMonthlyContribution"
  );


/* -------------------------------------------------------
   STATE
------------------------------------------------------- */

let groupId = null;


/* -------------------------------------------------------
   FORMAT MONEY
------------------------------------------------------- */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


/* -------------------------------------------------------
   ERROR
------------------------------------------------------- */

function showError(error) {

  console.error(error);

  errorEl.textContent =
    error?.message ||
    "Something went wrong.";

  errorEl.hidden = false;

  statusEl.textContent =
    "Unable to load group settings.";

}


/* -------------------------------------------------------
   STATUS
------------------------------------------------------- */

function showStatus(message) {

  statusEl.textContent = message;

}


/* -------------------------------------------------------
   GET GROUP ID
------------------------------------------------------- */

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


/* -------------------------------------------------------
   LOAD GROUP
------------------------------------------------------- */

async function loadGroup() {

  groupId =
    await getGroupId();


  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      opening_balance,
      monthly_contribution
    `)
    .eq("id", groupId)
    .single();


  if (error) {
    throw error;
  }


  if (!data) {

    throw new Error(
      "Group profile could not be found."
    );

  }


  populateForm(data);

}


/* -------------------------------------------------------
   POPULATE FORM
------------------------------------------------------- */

function populateForm(group) {

  groupNameInput.value =
    group.name || "";

  openingBalanceInput.value =
    Number(
      group.opening_balance || 0
    );

  monthlyContributionInput.value =
    Number(
      group.monthly_contribution || 0
    );


  currentGroupName.textContent =
    group.name || "—";

  currentOpeningBalance.textContent =
    money(
      group.opening_balance
    );

  currentMonthlyContribution.textContent =
    money(
      group.monthly_contribution
    );


  showStatus(
    "Group settings loaded."
  );

}


/* -------------------------------------------------------
   SAVE GROUP
------------------------------------------------------- */

async function saveGroup(event) {

  event.preventDefault();


  errorEl.hidden = true;


  const name =
    groupNameInput.value.trim();

  const openingBalance =
    Number(
      openingBalanceInput.value
    );

  const monthlyContribution =
    Number(
      monthlyContributionInput.value
    );


  /* -----------------------------------------------
     VALIDATION
  ------------------------------------------------ */

  if (!name) {

    errorEl.textContent =
      "Please enter the group name.";

    errorEl.hidden = false;

    return;

  }


  if (
    Number.isNaN(openingBalance) ||
    openingBalance < 0
  ) {

    errorEl.textContent =
      "Opening balance must be zero or greater.";

    errorEl.hidden = false;

    return;

  }


  if (
    Number.isNaN(monthlyContribution) ||
    monthlyContribution < 0
  ) {

    errorEl.textContent =
      "Monthly contribution must be zero or greater.";

    errorEl.hidden = false;

    return;

  }


  /* -----------------------------------------------
     DISABLE BUTTON
  ------------------------------------------------ */

  saveButton.disabled = true;

  saveButton.textContent =
    "Saving...";

  showStatus(
    "Saving group settings..."
  );


  try {

    /* ---------------------------------------------
       UPDATE GROUP
    ---------------------------------------------- */

    const {
      data,
      error
    } = await supabase
      .from("groups")
      .update({
        name,
        opening_balance: openingBalance,
        monthly_contribution:
          monthlyContribution
      })
      .eq("id", groupId)
      .select(`
        id,
        name,
        opening_balance,
        monthly_contribution
      `)
      .single();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "The group could not be updated."
      );

    }


    /* ---------------------------------------------
       UPDATE SCREEN
    ---------------------------------------------- */

    populateForm(data);


    showStatus(
      "✓ Group settings saved successfully."
    );


  } catch (error) {

    showError(error);

  } finally {

    saveButton.disabled = false;

    saveButton.textContent =
      "Save Changes";

  }

}


/* -------------------------------------------------------
   EVENT
------------------------------------------------------- */

form.addEventListener(
  "submit",
  saveGroup
);


/* -------------------------------------------------------
   INITIALIZE
------------------------------------------------------- */

async function init() {

  try {

    showStatus(
      "Loading group settings..."
    );

    await loadGroup();

  } catch (error) {

    showError(error);

  }

}


init();
