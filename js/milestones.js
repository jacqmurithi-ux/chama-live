import { supabase } from "./supabase.js";
import { requireAuth, getMyMember } from "./auth.js";

console.log("CHAMA LIVE: milestones.js loaded");


/* =========================================================
   MANAGEMENT ROLES
========================================================= */

const MANAGEMENT_ROLES = [
  "admin",
  "chairperson",
  "secretary"
];


/* =========================================================
   MILESTONE CATEGORIES
========================================================= */

const MILESTONE_CATEGORIES = [
  "general",
  "investment",
  "property",
  "welfare",
  "business",
  "education",
  "membership",
  "fundraising",
  "infrastructure",
  "other"
];


/* =========================================================
   STATE
========================================================= */

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  plans: [],
  milestones: [],
  editingMilestoneId: null
};


const els = {};


/* =========================================================
   PAGE INITIALIZER
========================================================= */

export async function initPage() {

  injectMilestoneStyles();

  cacheElements();

  bindEvents();


  try {

    await loadContext();

    await loadPlans();

    await loadMilestones();


    console.log(
      "CHAMA LIVE: Milestones context ready",
      {
        groupId: state.groupId,
        groupName: state.groupName,
        role:
          state.currentMember?.role ||
          null
      }
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Milestones initialization failed",
      error
    );


    showMessage(
      normalizeError(error),
      "error"
    );

  }

}


/* =========================================================
   MILESTONE PAGE STYLES
========================================================= */

function injectMilestoneStyles() {

  if (
    document.getElementById(
      "chama-milestones-styles"
    )
  ) {
    return;
  }


  const style =
    document.createElement("style");


  style.id =
    "chama-milestones-styles";


  style.textContent = `

    /* =====================================================
       PAGE FOUNDATION
    ===================================================== */

    .milestones-page {
      min-width: 0;
    }


    /* =====================================================
       CONTEXT CARD
    ===================================================== */

    .milestones-context-card {
      position: relative;
      overflow: hidden;
    }


    .milestones-context-card::after {
      content: "";
      position: absolute;
      width: 150px;
      height: 150px;
      right: -55px;
      top: -70px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.07);
      pointer-events: none;
    }


    .milestones-context-label {
      display: block;
      margin-bottom: 4px;
      color: #667085;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }


    .milestones-context-value {
      display: block;
      color: #101828;
      font-size: 18px;
      font-weight: 800;
      line-height: 1.3;
    }


    /* =====================================================
       KPI CARDS
    ===================================================== */

    .milestones-kpi-grid {
      display: grid;
      grid-template-columns:
        repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }


    .milestones-kpi {
      position: relative;
      min-width: 0;
      padding: 17px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-sizing: border-box;
      overflow: hidden;
    }


    .milestones-kpi::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: #0f766e;
      opacity: 0.75;
    }


    .milestones-kpi-label {
      display: block;
      margin-bottom: 8px;
      color: #667085;
      font-size: 11px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }


    .milestones-kpi-value {
      display: block;
      color: #101828;
      font-size: 25px;
      font-weight: 850;
      line-height: 1.1;
      letter-spacing: -0.025em;
      overflow-wrap: anywhere;
    }


    .milestones-kpi-subtitle {
      display: block;
      margin-top: 7px;
      color: #98a2b3;
      font-size: 11px;
      line-height: 1.35;
    }


    .milestones-kpi-amount
    .milestones-kpi-value {
      font-size: 21px;
    }


    /* =====================================================
       SECTION HEADINGS
    ===================================================== */

    .milestones-section-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }


    .milestones-section-heading > div {
      min-width: 0;
    }


    .milestones-section-heading h2 {
      margin: 0;
      color: #101828;
      font-size: 18px;
      font-weight: 800;
      line-height: 1.3;
    }


    .milestones-section-heading p {
      margin: 5px 0 0;
      color: #667085;
      font-size: 13px;
      line-height: 1.5;
    }


    /* =====================================================
       FORM
    ===================================================== */

    .milestone-form-card {
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      background: #ffffff;
      overflow: hidden;
    }


    .milestone-form-card .form-header {
      padding: 18px 20px;
      background:
        linear-gradient(
          180deg,
          #f8fafc 0%,
          #ffffff 100%
        );
      border-bottom: 1px solid #edf0f4;
    }


    .milestone-form-card .form-header h2 {
      margin: 0;
      color: #101828;
      font-size: 18px;
      font-weight: 800;
    }


    .milestone-form-card .form-header p {
      margin: 5px 0 0;
      color: #667085;
      font-size: 13px;
      line-height: 1.5;
    }


    .milestone-form-card form {
      padding: 20px;
    }


    .milestone-form-card label {
      color: #344054;
      font-size: 12px;
      font-weight: 750;
    }


    .milestone-form-card input,
    .milestone-form-card select,
    .milestone-form-card textarea {
      border-radius: 10px;
    }


    .milestone-form-card textarea {
      min-height: 105px;
      resize: vertical;
    }


    .milestone-form-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 9px;
      margin-top: 6px;
    }


    .milestone-management-note {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px solid #fed7aa;
      border-radius: 10px;
      background: #fff7ed;
      color: #9a3412;
      font-size: 12px;
      line-height: 1.5;
    }


    /* =====================================================
       FILTER BAR
    ===================================================== */

    .milestones-filter-bar {
      display: grid;
      grid-template-columns:
        minmax(0, 1fr)
        190px
        auto;
      gap: 10px;
      align-items: end;
      margin-bottom: 14px;
    }


    .milestones-filter-field {
      min-width: 0;
    }


    .milestones-filter-field label {
      display: block;
      margin-bottom: 5px;
      color: #667085;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }


    .milestones-filter-field input,
    .milestones-filter-field select {
      width: 100%;
      min-height: 42px;
      box-sizing: border-box;
      border-radius: 10px;
    }


    .milestones-refresh {
      min-height: 42px;
      white-space: nowrap;
    }


    /* =====================================================
       REGISTER
    ===================================================== */

    .milestones-register {
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      background: #ffffff;
      overflow: hidden;
    }


    .milestones-table-wrap {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }


    .milestones-table {
      width: 100%;
      min-width: 900px;
      border-collapse: separate;
      border-spacing: 0;
    }


    .milestones-table th {
      padding: 12px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e5e7eb;
      color: #667085;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.055em;
      text-align: left;
      text-transform: uppercase;
      white-space: nowrap;
    }


    .milestones-table td {
      padding: 14px;
      border-bottom: 1px solid #f1f3f5;
      color: #344054;
      font-size: 12px;
      line-height: 1.45;
      vertical-align: top;
    }


    .milestones-table tbody tr:last-child td {
      border-bottom: 0;
    }


    .milestones-table tbody tr:hover {
      background: #fcfdfd;
    }


    .milestone-title-cell strong {
      display: block;
      color: #101828;
      font-size: 13px;
      font-weight: 800;
    }


    .milestone-title-cell .help-text {
      margin-top: 5px;
      color: #667085;
      font-size: 10px;
    }


    .milestone-plan-cell {
      color: #475467;
      font-weight: 600;
    }


    .milestone-date-cell {
      white-space: nowrap;
      color: #344054;
      font-weight: 650;
    }


    .milestone-description-cell {
      max-width: 220px;
      color: #667085;
    }


    .milestone-amount-cell {
      white-space: nowrap;
      color: #101828;
      font-weight: 800;
    }


    /* =====================================================
       CATEGORY BADGES
    ===================================================== */

    .milestone-category {
      display: inline-flex;
      align-items: center;
      min-height: 25px;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
    }


    .milestone-category.general {
      background: #f2f4f7;
      color: #475467;
    }


    .milestone-category.investment,
    .milestone-category.business {
      background: #ecfdf3;
      color: #027a48;
    }


    .milestone-category.property,
    .milestone-category.infrastructure {
      background: #eff8ff;
      color: #175cd3;
    }


    .milestone-category.welfare {
      background: #fdf2fa;
      color: #c11574;
    }


    .milestone-category.education {
      background: #f4f3ff;
      color: #5925dc;
    }


    .milestone-category.membership {
      background: #fff6ed;
      color: #b54708;
    }


    .milestone-category.fundraising {
      background: #f0fdf9;
      color: #0f766e;
    }


    .milestone-category.other {
      background: #f8fafc;
      color: #475467;
    }


    /* =====================================================
       ACTIONS
    ===================================================== */

    .milestone-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 130px;
    }


    .milestone-actions button {
      min-height: 34px;
      padding: 6px 9px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 750;
    }


    /* =====================================================
       EMPTY STATE
    ===================================================== */

    .milestones-empty {
      padding: 46px 20px !important;
      text-align: center;
    }


    .milestones-empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      border-radius: 14px;
      background: #ecfdf5;
      color: #0f766e;
      font-size: 21px;
      font-weight: 850;
    }


    .milestones-empty-title {
      margin: 0;
      color: #101828;
      font-size: 14px;
      font-weight: 800;
    }


    .milestones-empty-text {
      max-width: 420px;
      margin: 6px auto 0;
      color: #667085;
      font-size: 12px;
      line-height: 1.55;
    }


    /* =====================================================
       MESSAGE
    ===================================================== */

    #message.message.show {
      margin-bottom: 14px;
    }


    /* =====================================================
       MOBILE
    ===================================================== */

    @media (max-width: 900px) {

      .milestones-kpi-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }

      .milestones-filter-bar {
        grid-template-columns:
          minmax(0, 1fr)
          minmax(150px, 190px);
      }

      .milestones-refresh {
        grid-column: 1 / -1;
        width: 100%;
      }

    }


    @media (max-width: 620px) {

      .milestones-kpi-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 9px;
      }


      .milestones-kpi {
        padding: 14px;
        border-radius: 14px;
      }


      .milestones-kpi-value {
        font-size: 21px;
      }


      .milestones-kpi-amount
      .milestones-kpi-value {
        font-size: 17px;
      }


      .milestones-filter-bar {
        grid-template-columns: 1fr;
      }


      .milestones-refresh {
        grid-column: auto;
      }


      .milestone-form-card .form-header,
      .milestone-form-card form {
        padding: 15px;
      }


      .milestones-section-heading {
        display: block;
      }


      .milestones-section-heading h2 {
        font-size: 17px;
      }

    }


    @media (max-width: 380px) {

      .milestones-kpi-grid {
        grid-template-columns: 1fr 1fr;
        gap: 7px;
      }


      .milestones-kpi {
        padding: 12px;
      }


      .milestones-kpi-label {
        font-size: 9px;
      }


      .milestones-kpi-value {
        font-size: 19px;
      }


      .milestones-kpi-amount
      .milestones-kpi-value {
        font-size: 15px;
      }

    }

  `;


  document.head.appendChild(style);

}


/* =========================================================
   CACHE DOM
========================================================= */

function cacheElements() {

  els.groupName =
    document.getElementById(
      "current-group-name"
    );


  els.message =
    document.getElementById(
      "message"
    );


  els.totalMilestones =
    document.getElementById(
      "total-milestones"
    );


  els.upcomingMilestones =
    document.getElementById(
      "upcoming-milestones"
    );


  els.linkedMilestones =
    document.getElementById(
      "linked-milestones"
    );


  els.milestoneAmountKpi =
    document.querySelector(
      ".kpi-card #milestone-amount"
    );


  els.form =
    document.getElementById(
      "milestone-form"
    );


  els.formHeading =
    document.getElementById(
      "milestone-form-heading"
    );


  els.formDescription =
    document.getElementById(
      "milestone-form-description"
    );


  els.title =
    document.getElementById(
      "milestone-title"
    );


  els.category =
    document.getElementById(
      "milestone-category"
    );


  els.plan =
    document.getElementById(
      "milestone-plan"
    );


  els.date =
    document.getElementById(
      "milestone-date"
    );


  els.amount =
    document.querySelector(
      "#milestone-form #milestone-amount"
    );


  els.documentId =
    document.getElementById(
      "milestone-document-id"
    );


  els.description =
    document.getElementById(
      "milestone-description"
    );


  els.createButton =
    document.getElementById(
      "create-milestone-btn"
    );


  els.clearButton =
    document.getElementById(
      "clear-milestone-btn"
    );


  els.managementNote =
    document.getElementById(
      "management-note"
    );


  els.search =
    document.getElementById(
      "milestone-search"
    );


  els.categoryFilter =
    document.getElementById(
      "milestone-category-filter"
    );


  els.refreshButton =
    document.getElementById(
      "refresh-milestones-btn"
    );


  els.body =
    document.getElementById(
      "milestones-body"
    );

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  els.form?.addEventListener(
    "submit",
    handleMilestoneSubmit
  );


  els.clearButton?.addEventListener(
    "click",
    clearForm
  );


  els.refreshButton?.addEventListener(
    "click",
    refreshData
  );


  els.search?.addEventListener(
    "input",
    renderMilestones
  );


  els.categoryFilter?.addEventListener(
    "change",
    renderMilestones
  );


  els.body?.addEventListener(
    "click",
    handleTableAction
  );

}


/* =========================================================
   LOAD GROUP CONTEXT
========================================================= */

async function loadContext() {

  await requireAuth();


  state.currentMember =
    await getMyMember();


  if (
    !state.currentMember?.group_id
  ) {

    throw new Error(
      "Your member account is not linked to a group."
    );

  }


  state.groupId =
    state.currentMember.group_id;


  const {
    data: group,
    error
  } = await supabase
    .from("groups")
    .select("id, name")
    .eq(
      "id",
      state.groupId
    )
    .maybeSingle();


  if (error) {
    throw error;
  }


  if (!group) {

    throw new Error(
      "Current group could not be loaded."
    );

  }


  state.groupName =
    group.name || "";


  if (els.groupName) {

    els.groupName.textContent =
      state.groupName;

  }


  const canManage =
    isManagementRole();


  if (els.managementNote) {

    els.managementNote.style.display =
      canManage
        ? "none"
        : "block";

  }


  if (els.createButton) {

    els.createButton.disabled =
      !canManage;

  }


  if (!canManage) {

    const fields = [
      els.title,
      els.category,
      els.plan,
      els.date,
      els.amount,
      els.documentId,
      els.description
    ];


    for (
      const field
      of fields
    ) {

      if (field) {
        field.disabled = true;
      }

    }

  }

}


/* =========================================================
   MANAGEMENT ROLE CHECK
========================================================= */

function isManagementRole() {

  const role =
    String(
      state.currentMember?.role || ""
    )
      .trim()
      .toLowerCase();


  return MANAGEMENT_ROLES.includes(
    role
  );

}


/* =========================================================
   LOAD PLANS
========================================================= */

async function loadPlans() {

  const {
    data,
    error
  } = await supabase
    .from("group_plans")
    .select(
      "id, title, status, start_date, target_date"
    )
    .eq(
      "group_id",
      state.groupId
    )
    .order(
      "target_date",
      {
        ascending: true
      }
    );


  if (error) {
    throw error;
  }


  state.plans =
    data || [];


  populatePlanSelect();

}


/* =========================================================
   PLAN SELECT
========================================================= */

function populatePlanSelect() {

  if (!els.plan) {
    return;
  }


  els.plan.innerHTML = "";


  const noPlan =
    document.createElement("option");


  noPlan.value = "";

  noPlan.textContent =
    "No linked plan";


  els.plan.appendChild(
    noPlan
  );


  for (
    const plan
    of state.plans
  ) {

    const option =
      document.createElement("option");


    option.value =
      plan.id;


    option.textContent =
      `${plan.title} (${formatStatus(
        plan.status
      )})`;


    els.plan.appendChild(
      option
    );

  }

}


/* =========================================================
   LOAD MILESTONES
========================================================= */

async function loadMilestones() {

  const {
    data,
    error
  } = await supabase
    .from("group_milestones")
    .select(
      [
        "id",
        "group_id",
        "plan_id",
        "title",
        "description",
        "milestone_date",
        "category",
        "amount",
        "document_id",
        "created_by",
        "created_at",
        "updated_at"
      ].join(", ")
    )
    .eq(
      "group_id",
      state.groupId
    )
    .order(
      "milestone_date",
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


  state.milestones =
    data || [];


  updateKpis();

  renderMilestones();

}


/* =========================================================
   REFRESH
========================================================= */

async function refreshData() {

  if (els.refreshButton) {

    els.refreshButton.disabled =
      true;

  }


  try {

    await loadPlans();

    await loadMilestones();


    showMessage(
      "Milestones refreshed.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: milestone refresh failed",
      error
    );


    showMessage(
      normalizeError(error),
      "error"
    );

  }

  finally {

    if (els.refreshButton) {

      els.refreshButton.disabled =
        false;

    }

  }

}


/* =========================================================
   FORM SUBMIT
========================================================= */

async function handleMilestoneSubmit(
  event
) {

  event.preventDefault();


  if (state.editingMilestoneId) {

    await updateMilestone();

    return;

  }


  await createMilestone();

}


/* =========================================================
   READ FORM
========================================================= */

function readMilestoneForm() {

  const title =
    els.title.value.trim();


  const category =
    els.category.value;


  const planId =
    els.plan.value ||
    null;


  const milestoneDate =
    els.date.value;


  const description =
    els.description.value.trim();


  const documentId =
    els.documentId.value.trim() ||
    null;


  if (!title) {

    throw new Error(
      "Milestone title is required."
    );

  }


  if (
    !MILESTONE_CATEGORIES.includes(
      category
    )
  ) {

    throw new Error(
      "Invalid milestone category."
    );

  }


  if (!milestoneDate) {

    throw new Error(
      "Milestone date is required."
    );

  }


  let amount = null;


  if (
    els.amount &&
    els.amount.value !== ""
  ) {

    amount =
      Number(
        els.amount.value
      );


    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {

      throw new Error(
        "Amount must be zero or greater."
      );

    }

  }


  if (
    planId &&
    !state.plans.some(
      plan =>
        plan.id === planId
    )
  ) {

    throw new Error(
      "The selected plan does not belong to the current group."
    );

  }


  if (
    documentId &&
    !isUuid(documentId)
  ) {

    throw new Error(
      "Document ID must be a valid UUID when supplied."
    );

  }


  return {
    plan_id: planId,
    title,
    description:
      description || null,
    milestone_date:
      milestoneDate,
    category,
    amount,
    document_id:
      documentId
  };

}


/* =========================================================
   CREATE
========================================================= */

async function createMilestone() {

  if (!isManagementRole()) {

    showMessage(
      "You do not have permission to create milestones.",
      "error"
    );

    return;

  }


  let values;


  try {

    values =
      readMilestoneForm();

  }

  catch (error) {

    showMessage(
      normalizeError(error),
      "error"
    );

    return;

  }


  setFormBusy(true);


  try {

    const payload = {

      group_id:
        state.groupId,

      ...values,

      created_by:
        state.currentMember.id

    };


    const {
      error
    } = await supabase
      .from("group_milestones")
      .insert(
        payload
      );


    if (error) {
      throw error;
    }


    clearForm();

    await loadMilestones();


    showMessage(
      "Milestone created successfully.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: milestone creation failed",
      error
    );


    showMessage(
      normalizeError(error),
      "error"
    );

  }

  finally {

    setFormBusy(false);

  }

}


/* =========================================================
   UPDATE
========================================================= */

async function updateMilestone() {

  if (!isManagementRole()) {

    showMessage(
      "You do not have permission to update milestones.",
      "error"
    );

    return;

  }


  const id =
    state.editingMilestoneId;


  if (!id) {

    showMessage(
      "No milestone is currently selected for editing.",
      "error"
    );

    return;

  }


  const existing =
    state.milestones.find(
      item =>
        item.id === id
    );


  if (!existing) {

    showMessage(
      "Milestone could not be found.",
      "error"
    );

    cancelMilestoneEdit();

    return;

  }


  let values;


  try {

    values =
      readMilestoneForm();

  }

  catch (error) {

    showMessage(
      normalizeError(error),
      "error"
    );

    return;

  }


  setFormBusy(true);


  try {

    const {
      error
    } = await supabase
      .from("group_milestones")
      .update(
        values
      )
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        state.groupId
      );


    if (error) {
      throw error;
    }


    clearForm();

    await loadMilestones();


    showMessage(
      "Milestone updated successfully.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: milestone update failed",
      error
    );


    showMessage(
      normalizeError(error),
      "error"
    );

  }

  finally {

    setFormBusy(false);

  }

}


/* =========================================================
   BEGIN EDIT
========================================================= */

function beginMilestoneEdit(id) {

  if (!isManagementRole()) {

    showMessage(
      "You do not have permission to edit milestones.",
      "error"
    );

    return;

  }


  const milestone =
    state.milestones.find(
      item =>
        item.id === id
    );


  if (!milestone) {

    showMessage(
      "Milestone could not be found.",
      "error"
    );

    return;

  }


  state.editingMilestoneId =
    milestone.id;


  if (els.title) {

    els.title.value =
      milestone.title || "";

  }


  if (els.category) {

    els.category.value =
      MILESTONE_CATEGORIES.includes(
        milestone.category
      )
        ? milestone.category
        : "general";

  }


  if (els.plan) {

    els.plan.value =
      milestone.plan_id || "";

  }


  if (els.date) {

    els.date.value =
      milestone.milestone_date || "";

  }


  if (els.amount) {

    els.amount.value =
      milestone.amount === null ||
      milestone.amount === undefined
        ? ""
        : milestone.amount;

  }


  if (els.documentId) {

    els.documentId.value =
      milestone.document_id || "";

  }


  if (els.description) {

    els.description.value =
      milestone.description || "";

  }


  setEditMode(true);


  els.form?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });


  showMessage(
    `Editing milestone "${milestone.title}".`,
    "success"
  );

}


/* =========================================================
   CANCEL EDIT
========================================================= */

function cancelMilestoneEdit() {

  state.editingMilestoneId =
    null;


  clearForm();

  setEditMode(false);

}


/* =========================================================
   EDIT MODE
========================================================= */

function setEditMode(editing) {

  if (els.formHeading) {

    els.formHeading.textContent =
      editing
        ? "Edit Milestone"
        : "Create Milestone";

  }


  if (els.formDescription) {

    els.formDescription.textContent =
      editing
        ? "Update the selected milestone in the current authenticated group."
        : "Add a new milestone to the current authenticated group.";

  }


  if (els.createButton) {

    els.createButton.textContent =
      editing
        ? "Update Milestone"
        : "Create Milestone";

  }


  if (els.clearButton) {

    els.clearButton.textContent =
      editing
        ? "Cancel Edit"
        : "Clear";

  }

}


/* =========================================================
   TABLE ACTION
========================================================= */

async function handleTableAction(event) {

  const button =
    event.target.closest(
      "button[data-action]"
    );


  if (!button) {
    return;
  }


  const milestoneId =
    button.dataset.id;


  const action =
    button.dataset.action;


  if (!milestoneId) {
    return;
  }


  if (action === "edit") {

    beginMilestoneEdit(
      milestoneId
    );

    return;

  }


  if (action === "delete") {

    await deleteMilestone(
      milestoneId
    );

  }

}


/* =========================================================
   DELETE
========================================================= */

async function deleteMilestone(id) {

  if (!isManagementRole()) {

    showMessage(
      "You do not have permission to delete milestones.",
      "error"
    );

    return;

  }


  const milestone =
    state.milestones.find(
      item =>
        item.id === id
    );


  if (!milestone) {

    showMessage(
      "Milestone could not be found.",
      "error"
    );

    return;

  }


  const confirmed =
    window.confirm(
      `Delete milestone "${milestone.title}"? This action cannot be undone.`
    );


  if (!confirmed) {
    return;
  }


  try {

    const {
      error
    } = await supabase
      .from("group_milestones")
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        state.groupId
      );


    if (error) {
      throw error;
    }


    if (
      state.editingMilestoneId ===
      id
    ) {

      cancelMilestoneEdit();

    }


    await loadMilestones();


    showMessage(
      "Milestone deleted successfully.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: milestone deletion failed",
      error
    );


    showMessage(
      normalizeError(error),
      "error"
    );

  }

}


/* =========================================================
   KPI UPDATE
========================================================= */

function updateKpis() {

  const milestones =
    state.milestones;


  const today =
    todayString();


  const upcoming =
    milestones.filter(
      milestone =>
        milestone.milestone_date >=
        today
    ).length;


  const linked =
    milestones.filter(
      milestone =>
        Boolean(
          milestone.plan_id
        )
    ).length;


  const totalAmount =
    milestones.reduce(
      (
        sum,
        milestone
      ) =>
        sum +
        numericAmount(
          milestone.amount
        ),
      0
    );


  if (els.totalMilestones) {

    els.totalMilestones.textContent =
      String(
        milestones.length
      );

  }


  if (els.upcomingMilestones) {

    els.upcomingMilestones.textContent =
      String(
        upcoming
      );

  }


  if (els.linkedMilestones) {

    els.linkedMilestones.textContent =
      String(
        linked
      );

  }


  if (els.milestoneAmountKpi) {

    els.milestoneAmountKpi.textContent =
      formatCurrency(
        totalAmount
      );

  }

}


/* =========================================================
   RENDER MILESTONES
========================================================= */

function renderMilestones() {

  if (!els.body) {
    return;
  }


  const search =
    String(
      els.search?.value || ""
    )
      .trim()
      .toLowerCase();


  const category =
    els.categoryFilter?.value ||
    "";


  const filtered =
    state.milestones.filter(
      milestone => {

        if (
          category &&
          milestone.category !==
            category
        ) {

          return false;

        }


        if (!search) {
          return true;
        }


        const planTitle =
          getPlanTitle(
            milestone.plan_id
          );


        const haystack = [

          milestone.title,

          milestone.description,

          milestone.category,

          planTitle

        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


        return haystack.includes(
          search
        );

      }
    );


  if (!filtered.length) {

    const hasFilters =
      Boolean(
        search ||
        category
      );


    els.body.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="milestones-empty"
        >

          <div
            class="milestones-empty-icon"
            aria-hidden="true"
          >
            ${hasFilters ? "⌕" : "✓"}
          </div>

          <p class="milestones-empty-title">
            ${
              hasFilters
                ? "No matching milestones"
                : "No milestones yet"
            }
          </p>

          <p class="milestones-empty-text">
            ${
              hasFilters
                ? "Try changing the search or category filter."
                : "Create the first milestone to start tracking important group targets and planned achievements."
            }
          </p>

        </td>

      </tr>

    `;

    return;

  }


  els.body.innerHTML =
    filtered
      .map(
        milestone => {

          const planTitle =
            getPlanTitle(
              milestone.plan_id
            );


          const createdDate =
            formatDateTime(
              milestone.created_at
            );


          const categoryClass =
            String(
              milestone.category ||
                ""
            )
              .toLowerCase()
              .replace(
                /[^a-z0-9_-]/g,
                ""
              );


          return `

            <tr>

              <td
                class="milestone-title-cell"
              >

                <strong>
                  ${escapeHtml(
                    milestone.title
                  )}
                </strong>

                ${
                  milestone.document_id
                    ? `
                      <div class="help-text">
                        Document attached
                      </div>
                    `
                    : ""
                }

              </td>


              <td>

                <span
                  class="milestone-category ${escapeHtml(
                    categoryClass
                  )}"
                >
                  ${escapeHtml(
                    formatStatus(
                      milestone.category
                    )
                  )}
                </span>

              </td>


              <td
                class="milestone-plan-cell"
              >

                ${escapeHtml(
                  planTitle ||
                    "No linked plan"
                )}

              </td>


              <td
                class="milestone-date-cell"
              >

                ${escapeHtml(
                  formatDate(
                    milestone.milestone_date
                  )
                )}

              </td>


              <td
                class="milestone-amount-cell"
              >

                ${
                  milestone.amount ===
                    null ||
                  milestone.amount ===
                    undefined
                    ? "—"
                    : escapeHtml(
                        formatCurrency(
                          milestone.amount
                        )
                      )
                }

              </td>


              <td
                class="milestone-description-cell"
              >

                ${escapeHtml(
                  milestone.description ||
                    "No description"
                )}

              </td>


              <td>

                ${escapeHtml(
                  createdDate
                )}

              </td>


              <td>

                <div
                  class="milestone-actions"
                >

                  ${
                    isManagementRole()
                      ? `

                        <button
                          type="button"
                          class="btn-secondary"
                          data-action="edit"
                          data-id="${escapeHtml(
                            milestone.id
                          )}"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          class="btn-danger"
                          data-action="delete"
                          data-id="${escapeHtml(
                            milestone.id
                          )}"
                        >
                          Delete
                        </button>

                      `
                      : "—"
                  }

                </div>

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =========================================================
   CLEAR FORM
========================================================= */

function clearForm() {

  els.form?.reset();


  if (els.category) {

    els.category.value =
      "general";

  }


  if (els.plan) {

    els.plan.value =
      "";

  }


  if (els.amount) {

    els.amount.value =
      "";

  }


  if (els.documentId) {

    els.documentId.value =
      "";

  }


  if (els.description) {

    els.description.value =
      "";

  }


  state.editingMilestoneId =
    null;


  setEditMode(false);

}


/* =========================================================
   FORM BUSY
========================================================= */

function setFormBusy(busy) {

  if (!els.createButton) {
    return;
  }


  els.createButton.disabled =
    busy ||
    !isManagementRole();


  els.createButton.textContent =
    busy
      ? (
          state.editingMilestoneId
            ? "Updating..."
            : "Creating..."
        )
      : (
          state.editingMilestoneId
            ? "Update Milestone"
            : "Create Milestone"
        );


  if (els.clearButton) {

    els.clearButton.disabled =
      busy;

  }

}


/* =========================================================
   PLAN TITLE
========================================================= */

function getPlanTitle(planId) {

  if (!planId) {
    return "";
  }


  const plan =
    state.plans.find(
      item =>
        item.id === planId
    );


  return (
    plan?.title ||
    "Linked plan"
  );

}


/* =========================================================
   NUMERIC AMOUNT
========================================================= */

function numericAmount(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return 0;

  }


  const number =
    Number(value);


  return Number.isFinite(
    number
  )
    ? number
    : 0;

}


/* =========================================================
   CURRENCY
========================================================= */

function formatCurrency(value) {

  return `KSh ${numericAmount(
    value
  ).toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;

}


/* =========================================================
   DATE
========================================================= */

function formatDate(value) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      `${value}T00:00:00`
    );


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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   DATE + TIME
========================================================= */

function formatDateTime(value) {

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


  return date.toLocaleString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


/* =========================================================
   STATUS
========================================================= */

function formatStatus(value) {

  if (!value) {
    return "";
  }


  return String(value)
    .replaceAll(
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
   TODAY
========================================================= */

function todayString() {

  const date =
    new Date();


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${year}-${month}-${day}`;

}


/* =========================================================
   UUID
========================================================= */

function isUuid(value) {

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

}


/* =========================================================
   HTML ESCAPE
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


/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeError(error) {

  if (!error) {

    return (
      "An unexpected error occurred."
    );

  }


  const message =
    String(
      error.message || ""
    ).trim();


  if (!message) {

    return (
      "The requested operation could not be completed."
    );

  }


  if (
    message.includes(
      "row-level security"
    ) ||
    message.includes(
      "permission denied"
    ) ||
    message.includes(
      "not allowed"
    )
  ) {

    return (
      "You do not have permission to perform this operation for the current group."
    );

  }


  if (
    message.includes(
      "foreign key"
    ) ||
    (
      message.includes(
        "violates"
      ) &&
      message.includes(
        "constraint"
      )
    )
  ) {

    return (
      "The milestone references data that is not valid for the current group."
    );

  }


  return message.length > 220
    ? `${message.slice(
        0,
        217
      )}...`
    : message;

}


/* =========================================================
   PAGE MESSAGE
========================================================= */

function showMessage(
  message,
  type = "success"
) {

  if (!els.message) {
    return;
  }


  els.message.textContent =
    message;


  els.message.className =
    `message show ${type}`;


  window.clearTimeout(
    showMessage.timer
  );


  showMessage.timer =
    window.setTimeout(
      () => {

        if (!els.message) {
          return;
        }


        els.message.className =
          "message";


        els.message.textContent =
          "";

      },
      5000
    );

}


console.log(
  "CHAMA LIVE: milestones.js ready"
);
