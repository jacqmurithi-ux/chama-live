/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   GROUP-SCOPED CONTRIBUTION RECORDING

   FEATURES
   ---------------------------------------------------------
   1. Uses current authenticated member.
   2. Uses current member.group_id.
   3. Uses members.id for recorded_by.
   4. Uses members.name for display.
   5. Loads persistent contribution types per group.
   6. "Other" reveals a custom contribution type input.
   7. New custom types are saved to contribution_types.
   8. Existing custom types appear next time.
   9. Prevents duplicate custom categories.
  10. Keeps M-Pesa reference support.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: contributions.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let contributionTypes = [];
let members = [];

let isSubmitting = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function showElement(id) {

  const element = $(id);

  if (element) {
    element.hidden = false;
  }
}


function hideElement(id) {

  const element = $(id);

  if (element) {
    element.hidden = true;
  }
}


function setText(id, value) {

  const element = $(id);

  if (element) {
    element.textContent =
      value ?? "";
  }
}


/* =========================================================
   MESSAGE HELPERS
========================================================= */

function showMessage(message, type = "info") {

  const element =
    $("formMessage");

  if (!element) {
    return;
  }

  element.hidden = false;

  element.textContent =
    message;

  element.dataset.type =
    type;
}


function clearMessage() {

  const element =
    $("formMessage");

  if (!element) {
    return;
  }

  element.hidden = true;

  element.textContent = "";

  delete element.dataset.type;
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   DATE
========================================================= */

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
   GROUP CONTEXT
========================================================= */

async function loadContext() {

  currentUser =
    await requireAuth();

  currentMember =
    await getMyMember();

  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );
  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record is not linked to a group."
    );
  }


  currentGroupId =
    currentMember.group_id;


  currentGroup =
    await getMyGroup();


  if (!currentGroup) {

    throw new Error(
      "Unable to load your group."
    );
  }


  console.log(
    "CHAMA LIVE: contribution group context",
    {
      userId:
        currentUser?.id,

      memberId:
        currentMember?.id,

      groupId:
        currentGroupId,

      groupName:
        currentGroup?.name
    }
  );


  renderGroupContext();
}


/* =========================================================
   GROUP DISPLAY
========================================================= */

function renderGroupContext() {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        currentGroup?.name ||
        "CHAMA";
    });


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(element => {

      element.textContent =
        currentMember?.name ||
        "Member";
    });
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const result =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        name,
        status
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (result.error) {
    throw result.error;
  }


  members =
    result.data || [];
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers() {

  const select =
    $("memberId");

  if (!select) {
    return;
  }


  const previousValue =
    select.value;


  select.innerHTML = `
    <option value="">
      Select member
    </option>
  `;


  members
    .filter(member => {

      const status =
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase();

      return (
        !status ||
        status === "active"
      );
    })
    .forEach(member => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        member.id;

      option.textContent =
        member.name ||
        "Unnamed member";

      select.appendChild(
        option
      );
    });


  if (
    previousValue &&
    members.some(
      member =>
        String(member.id) ===
        String(previousValue)
    )
  ) {

    select.value =
      previousValue;
  }
}


/* =========================================================
   LOAD CONTRIBUTION TYPES
========================================================= */

async function loadContributionTypes() {

  const result =
    await supabase
      .from("contribution_types")
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (result.error) {
    throw result.error;
  }


  contributionTypes =
    result.data || [];


  /*
    Ensure the default types exist even if
    this group was created before the migration.
  */

  const defaults = [
    "Monthly",
    "Registration",
    "Welfare",
    "Special"
  ];


  for (
    const name of defaults
  ) {

    const exists =
      contributionTypes.some(
        type =>
          type.name
            ?.trim()
            .toLowerCase() ===
          name.toLowerCase()
      );


    if (!exists) {

      try {

        const inserted =
          await createContributionType(
            name,
            false
          );


        if (inserted) {

          contributionTypes.push(
            inserted
          );
        }

      }
      catch (error) {

        console.warn(
          "Could not create default contribution type:",
          name,
          error
        );
      }
    }
  }


  contributionTypes =
    contributionTypes.sort(
      (a, b) =>
        String(a.name)
          .localeCompare(
            String(b.name)
          )
    );


  renderContributionTypes();
}


/* =========================================================
   RENDER CONTRIBUTION TYPES
========================================================= */

function renderContributionTypes() {

  const select =
    $("contributionType");

  if (!select) {
    return;
  }


  const previousValue =
    select.value;


  select.innerHTML = "";


  const placeholder =
    document.createElement(
      "option"
    );

  placeholder.value = "";

  placeholder.textContent =
    "Select contribution type";

  select.appendChild(
    placeholder
  );


  contributionTypes
    .forEach(type => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        type.name;

      option.textContent =
        type.name;

      select.appendChild(
        option
      );
    });


  const otherOption =
    document.createElement(
      "option"
    );

  otherOption.value =
    "__OTHER__";

  otherOption.textContent =
    "Other";

  select.appendChild(
    otherOption
  );


  if (
    previousValue &&
    Array.from(
      select.options
    ).some(
      option =>
        option.value ===
        previousValue
    )
  ) {

    select.value =
      previousValue;

  }
}


/* =========================================================
   CREATE CONTRIBUTION TYPE
========================================================= */

async function createContributionType(
  name,
  showErrors = true
) {

  const cleanedName =
    String(name || "")
      .trim()
      .replace(/\s+/g, " ");


  if (!cleanedName) {

    if (showErrors) {

      throw new Error(
        "Please enter the other contribution type."
      );
    }

    return null;
  }


  /*
    Check existing category first.
    This prevents duplicates such as:

    Christmas Fund
    christmas fund
    CHRISTMAS FUND
  */

  const existing =
    contributionTypes.find(
      type =>
        String(type.name || "")
          .trim()
          .toLowerCase() ===
        cleanedName.toLowerCase()
    );


  if (existing) {

    return existing;
  }


  const result =
    await supabase
      .from("contribution_types")
      .insert({
        group_id:
          currentGroupId,

        name:
          cleanedName,

        created_by:
          currentMember.id
      })
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
      `)
      .single();


  if (result.error) {

    /*
      If another user created the same
      category at almost the same time,
      retrieve it instead of failing.
    */

    const retry =
      await supabase
        .from("contribution_types")
        .select(`
          id,
          group_id,
          name,
          created_by,
          created_at
        `)
        .eq(
          "group_id",
          currentGroupId
        )
        .ilike(
          "name",
          cleanedName
        )
        .limit(1)
        .maybeSingle();


    if (
      !retry.error &&
      retry.data
    ) {

      return retry.data;
    }


    if (showErrors) {
      throw result.error;
    }

    return null;
  }


  return result.data;
}


/* =========================================================
   OTHER TYPE UI
========================================================= */

function updateOtherTypeVisibility() {

  const select =
    $("contributionType");

  const container =
    $("otherContributionTypeContainer");

  const input =
    $("otherContributionType");


  if (!select) {
    return;
  }


  const isOther =
    select.value ===
    "__OTHER__";


  if (container) {

    container.hidden =
      !isOther;
  }


  if (input) {

    input.required =
      isOther;


    if (!isOther) {

      input.value = "";
    }
  }


  if (isOther && input) {

    setTimeout(
      () => input.focus(),
      0
    );
  }
}


/* =========================================================
   GET SELECTED TYPE
========================================================= */

async function getSelectedContributionType() {

  const select =
    $("contributionType");


  if (!select) {

    throw new Error(
      "Contribution Type field was not found."
    );
  }


  const value =
    String(
      select.value || ""
    ).trim();


  if (!value) {

    throw new Error(
      "Please select a contribution type."
    );
  }


  if (value !== "__OTHER__") {

    return value;
  }


  const input =
    $("otherContributionType");


  const customName =
    String(
      input?.value || ""
    )
      .trim()
      .replace(/\s+/g, " ");


  if (!customName) {

    throw new Error(
      "Please enter the other contribution type."
    );
  }


  const type =
    await createContributionType(
      customName,
      true
    );


  if (!type) {

    throw new Error(
      "Unable to create contribution type."
    );
  }


  /*
    Add it to local state so it immediately
    becomes available in the dropdown.
  */

  const alreadyLoaded =
    contributionTypes.some(
      item =>
        String(item.id) ===
        String(type.id)
    );


  if (!alreadyLoaded) {

    contributionTypes.push(
      type
    );

    contributionTypes =
      contributionTypes.sort(
        (a, b) =>
          String(a.name)
            .localeCompare(
              String(b.name)
            )
      );

    renderContributionTypes();
  }


  return type.name;
}


/* =========================================================
   VALIDATE AMOUNT
========================================================= */

function getAmount() {

  const input =
    $("amount");

  if (!input) {

    throw new Error(
      "Amount field was not found."
    );
  }


  const amount =
    Number(
      String(
        input.value || ""
      ).replace(/,/g, "")
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    throw new Error(
      "Please enter a valid contribution amount."
    );
  }


  return amount;
}


/* =========================================================
   VALIDATE MEMBER
========================================================= */

function getMemberId() {

  const select =
    $("memberId");

  if (!select) {

    throw new Error(
      "Member field was not found."
    );
  }


  const memberId =
    String(
      select.value || ""
    ).trim();


  if (!memberId) {

    throw new Error(
      "Please select a member."
    );
  }


  const member =
    members.find(
      item =>
        String(item.id) ===
        memberId
    );


  if (!member) {

    throw new Error(
      "Selected member does not belong to this group."
    );
  }


  return memberId;
}


/* =========================================================
   CONTRIBUTION DATE
========================================================= */

function getContributionDate() {

  const input =
    $("contributionDate");

  const value =
    String(
      input?.value || ""
    ).trim();


  if (!value) {

    throw new Error(
      "Please select a contribution date."
    );
  }


  return value;
}


/* =========================================================
   PAYMENT METHOD
========================================================= */

function getPaymentMethod() {

  const select =
    $("paymentMethod");

  return String(
    select?.value || ""
  ).trim();
}


/* =========================================================
   M-PESA REFERENCE
========================================================= */

function getMpesaReference() {

  const input =
    $("mpesaReference");

  return String(
    input?.value || ""
  ).trim();
}


/* =========================================================
   INSERT CONTRIBUTION
========================================================= */

async function insertContribution(data) {

  /*
    IMPORTANT DATABASE RULE

    contributions.recorded_by
    references members.id.

    Therefore:
        recorded_by = currentMember.id

    NOT:
        currentUser.id
  */


  const payload = {

    group_id:
      currentGroupId,

    member_id:
      data.memberId,

    amount:
      data.amount,

    contribution_type:
      data.contributionType,

    payment_method:
      data.paymentMethod || null,

    contribution_date:
      data.contributionDate,

    recorded_by:
      currentMember.id,

    notes:
      data.notes || null
  };


  /*
    Only include reference if the
    existing database accepts it.

    The project previously had schema
    differences around M-Pesa references,
    so we first use the canonical
    payment/reference field only when
    the form provides it.
  */

  if (data.mpesaReference) {

    payload.reference =
      data.mpesaReference;
  }


  let result =
    await supabase
      .from("contributions")
      .insert(payload)
      .select()
      .single();


  /*
    Compatibility fallback.

    If the database does not contain
    reference, retry without it.
  */

  if (
    result.error &&
    data.mpesaReference &&
    /reference|column/i.test(
      result.error.message || ""
    )
  ) {

    delete payload.reference;


    result =
      await supabase
        .from("contributions")
        .insert(payload)
        .select()
        .single();
  }


  if (result.error) {
    throw result.error;
  }


  return result.data;
}


/* =========================================================
   FORM RESET
========================================================= */

function resetForm() {

  const form =
    $("contributionForm");


  if (form) {

    form.reset();
  }


  const dateInput =
    $("contributionDate");


  if (dateInput) {

    dateInput.value =
      getToday();
  }


  updateOtherTypeVisibility();

  clearMessage();
}


/* =========================================================
   SET SUBMIT STATE
========================================================= */

function setSubmitting(
  submitting
) {

  isSubmitting =
    submitting;


  const button =
    $("saveContribution");


  if (!button) {
    return;
  }


  button.disabled =
    submitting;


  button.textContent =
    submitting
      ? "Saving..."
      : "Record Contribution";
}


/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  if (isSubmitting) {
    return;
  }


  try {

    clearMessage();

    setSubmitting(true);


    const memberId =
      getMemberId();


    const amount =
      getAmount();


    const contributionDate =
      getContributionDate();


    const paymentMethod =
      getPaymentMethod();


    const mpesaReference =
      getMpesaReference();


    const contributionType =
      await getSelectedContributionType();


    const notes =
      String(
        $("notes")?.value || ""
      ).trim();


    await insertContribution({

      memberId,

      amount,

      contributionDate,

      contributionType,

      paymentMethod,

      mpesaReference,

      notes

    });


    showMessage(
      "Contribution recorded successfully.",
      "success"
    );


    resetForm();


    /*
      Keep success message after reset.
    */

    showMessage(
      "Contribution recorded successfully.",
      "success"
    );


  }
  catch (error) {

    console.error(
      "CHAMA LIVE: failed to record contribution",
      error
    );


    showMessage(
      error?.message ||
      "Unable to record contribution.",
      "error"
    );

  }
  finally {

    setSubmitting(false);
  }
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  const form =
    $("contributionForm");


  if (
    form &&
    form.dataset.bound !== "true"
  ) {

    form.dataset.bound =
      "true";


    form.addEventListener(
      "submit",
      handleSubmit
    );
  }


  const typeSelect =
    $("contributionType");


  if (
    typeSelect &&
    typeSelect.dataset.bound !== "true"
  ) {

    typeSelect.dataset.bound =
      "true";


    typeSelect.addEventListener(
      "change",
      updateOtherTypeVisibility
    );
  }
}


/* =========================================================
   INIT
========================================================= */

export async function initContributions() {

  try {

    console.log(
      "CHAMA LIVE: initializing Contributions..."
    );


    await loadContext();


    await loadMembers();


    renderMembers();


    await loadContributionTypes();


    const dateInput =
      $("contributionDate");


    if (
      dateInput &&
      !dateInput.value
    ) {

      dateInput.value =
        getToday();
    }


    setupEvents();


    updateOtherTypeVisibility();


    console.log(
      "CHAMA LIVE: Contributions initialized",
      {
        groupId:
          currentGroupId,

        members:
          members.length,

        contributionTypes:
          contributionTypes.length
      }
    );

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: Contributions initialization failed",
      error
    );


    showMessage(
      error?.message ||
      "Unable to initialize Contributions.",
      "error"
    );
  }
}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshContributions() {

  try {

    if (!currentGroupId) {

      await loadContext();
    }


    await loadMembers();

    renderMembers();


    await loadContributionTypes();


    updateOtherTypeVisibility();

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: Contributions refresh failed",
      error
    );


    showMessage(
      error?.message ||
      "Unable to refresh contribution data.",
      "error"
    );
  }
}


/* =========================================================
   MODULE READY
========================================================= */

console.log(
  "CHAMA LIVE: contributions module ready"
);
