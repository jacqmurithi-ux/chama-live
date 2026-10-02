/*
=============================================================
 CHAMA LIVE — INITIATIVES
-------------------------------------------------------------
 Page feature module only.

 BOOT CONTRACT:
 - admin-layout.js owns page boot.
 - This module exports initInitiatives().
 - This module MUST NOT auto-boot.

 IMPORTANT:
 - This page currently does not invent initiative RPCs.
 - This page does not insert accounting records.
 - This page does not directly create initiative obligations.
 - Draft persistence is local to the browser until the
   canonical initiative backend contract is connected.

 Intended lifecycle:
   Draft
      ↓
   Configure Participants
      ↓
   Activate

 Recurring initiatives remain a separate initiative-domain
 lifecycle and are not routed through ordinary monthly
 contribution accounting.
=============================================================
*/

import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getMyGroup
} from "./auth.js";


/* =========================================================
   STATE
   ========================================================= */

let currentGroup = null;
let groupId = null;

let members = [];
let selectedMembers = new Set();

let eventsBound = false;

const DRAFT_STORAGE_KEY = "chama_live_initiative_drafts_v1";


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const dom = {
  statusMessage: document.getElementById("statusMessage"),

  form: document.getElementById("initiativeForm"),

  initiativeName: document.getElementById("initiativeName"),
  initiativeDescription: document.getElementById("initiativeDescription"),

  initiativeType: document.querySelectorAll(
    'input[name="initiativeType"]'
  ),

  targetAmount: document.getElementById("targetAmount"),

  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  endDateGroup: document.getElementById("endDateGroup"),

  participantList: document.getElementById("participantList"),
  participantCount: document.getElementById("participantCount"),

  selectAllParticipantsButton:
    document.getElementById("selectAllParticipantsButton"),

  clearParticipantsButton:
    document.getElementById("clearParticipantsButton"),

  saveDraftButton:
    document.getElementById("saveDraftButton"),

  discardDraftButton:
    document.getElementById("discardDraftButton"),

  activateButton:
    document.getElementById("activateButton"),

  newInitiativeButton:
    document.getElementById("newInitiativeButton"),

  summaryGroup:
    document.getElementById("summaryGroup"),

  summaryType:
    document.getElementById("summaryType"),

  summaryParticipants:
    document.getElementById("summaryParticipants"),

  summaryTarget:
    document.getElementById("summaryTarget"),

  draftList:
    document.getElementById("draftList"),

  workflowDraft:
    document.getElementById("workflowDraft"),

  workflowParticipants:
    document.getElementById("workflowParticipants"),

  workflowActivate:
    document.getElementById("workflowActivate")
};


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function formatCurrency(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number(value));
}


function getSelectedType() {
  const selected = document.querySelector(
    'input[name="initiativeType"]:checked'
  );

  return selected?.value || "one_time";
}


function getSelectedTypeLabel() {
  return getSelectedType() === "recurring"
    ? "Recurring"
    : "One-time";
}


function createDraftId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2)
  ].join("-");
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(message, type = "info") {
  if (!dom.statusMessage) {
    return;
  }

  dom.statusMessage.textContent = message;
  dom.statusMessage.className =
    `status-message visible ${type}`;
}


function clearStatus() {
  if (!dom.statusMessage) {
    return;
  }

  dom.statusMessage.textContent = "";
  dom.statusMessage.className = "status-message";
}


/* =========================================================
   GROUP CONTEXT
   ========================================================= */

async function loadContext() {
  const group = await getMyGroup();

  if (!group) {
    throw new Error(
      "Your group could not be loaded."
    );
  }

  currentGroup = group;

  groupId =
    group.id ??
    group.group_id ??
    null;

  if (!groupId) {
    throw new Error(
      "The current group does not have a valid group ID."
    );
  }

  if (dom.summaryGroup) {
    dom.summaryGroup.textContent =
      group.name ??
      group.group_name ??
      "Current group";
  }
}


/* =========================================================
   MEMBER LOADING
-------------------------------------------------------------
 This is intentionally read-only.

 The exact canonical member-list contract was not previously
 supplied for an Initiatives page, so this implementation
 uses the existing authenticated group context and reads the
 members table directly only for display.

 No initiative records are written.
 No accounting records are written.
========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "Group context is not available."
    );
  }

  /*
   * This query is display-only.
   *
   * We deliberately keep the selected fields conservative.
   * The page does not depend on a specific accounting schema.
   */
  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  members = Array.isArray(data)
    ? data
    : [];

  renderParticipants();
}


/* =========================================================
   MEMBER FIELD HELPERS
   ========================================================= */

function getMemberId(member) {
  return (
    member?.id ??
    member?.member_id ??
    null
  );
}


function getMemberName(member) {
  const fullName =
    member?.full_name ??
    member?.name ??
    [
      member?.first_name,
      member?.last_name
    ]
      .filter(Boolean)
      .join(" ");

  return fullName || "Unnamed member";
}


function getMemberNumber(member) {
  return (
    member?.member_number ??
    member?.membership_number ??
    member?.member_no ??
    ""
  );
}


/* =========================================================
   PARTICIPANTS
   ========================================================= */

function renderParticipants() {
  if (!dom.participantList) {
    return;
  }

  if (!members.length) {
    dom.participantList.innerHTML = `
      <div class="empty-state">
        No group members are available.
      </div>
    `;

    updateParticipantCount();

    return;
  }

  const validIds = new Set(
    members
      .map(getMemberId)
      .filter(Boolean)
      .map(String)
  );

  selectedMembers = new Set(
    [...selectedMembers].filter(id =>
      validIds.has(String(id))
    )
  );

  dom.participantList.innerHTML = members
    .map(member => {
      const memberId = getMemberId(member);

      if (!memberId) {
        return "";
      }

      const id = String(memberId);

      const name = escapeHtml(
        getMemberName(member)
      );

      const memberNumber = escapeHtml(
        getMemberNumber(member)
      );

      const checked = selectedMembers.has(id)
        ? "checked"
        : "";

      return `
        <div
          class="participant-row"
          data-participant-row="${escapeHtml(id)}"
        >

          <div>
            <input
              type="checkbox"
              class="participant-checkbox"
              data-member-id="${escapeHtml(id)}"
              ${checked}
              aria-label="Select ${name}"
            >
          </div>

          <div>
            <span class="participant-name">
              ${name}
            </span>

            ${
              memberNumber
                ? `
                  <span class="participant-number">
                    ${memberNumber}
                  </span>
                `
                : ""
            }
          </div>

          <div class="participant-amount">
            <input
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              class="participant-amount-input"
              data-member-id="${escapeHtml(id)}"
              placeholder="Amount"
              aria-label="Participant amount for ${name}"
              disabled
            >
          </div>

        </div>
      `;
    })
    .join("");

  syncParticipantAmountInputs();
  updateParticipantCount();
}


/* =========================================================
   PARTICIPANT SELECTION
   ========================================================= */

function handleParticipantChange(event) {
  const checkbox =
    event.target.closest(
      ".participant-checkbox"
    );

  if (!checkbox) {
    return;
  }

  const memberId =
    checkbox.dataset.memberId;

  if (!memberId) {
    return;
  }

  if (checkbox.checked) {
    selectedMembers.add(
      String(memberId)
    );
  } else {
    selectedMembers.delete(
      String(memberId)
    );
  }

  syncParticipantAmountInputs();
  updateParticipantCount();
  updateWorkflow();
  updateSummary();
}


function syncParticipantAmountInputs() {
  if (!dom.participantList) {
    return;
  }

  const inputs =
    dom.participantList.querySelectorAll(
      ".participant-amount-input"
    );

  inputs.forEach(input => {
    const memberId =
      String(input.dataset.memberId || "");

    const selected =
      selectedMembers.has(memberId);

    input.disabled = !selected;
  });
}


function updateParticipantCount() {
  const count =
    selectedMembers.size;

  if (!dom.participantCount) {
    return;
  }

  if (count === 0) {
    dom.participantCount.textContent =
      "No members selected";

    return;
  }

  dom.participantCount.textContent =
    `${count} member${count === 1 ? "" : "s"} selected`;
}


function selectAllParticipants() {
  members.forEach(member => {
    const id = getMemberId(member);

    if (id) {
      selectedMembers.add(
        String(id)
      );
    }
  });

  renderParticipants();
  updateWorkflow();
  updateSummary();
}


function clearParticipants() {
  selectedMembers.clear();

  renderParticipants();
  updateWorkflow();
  updateSummary();
}


/* =========================================================
   FORM STATE
   ========================================================= */

function getFormData() {
  const participantAmounts = {};

  if (dom.participantList) {
    dom.participantList
      .querySelectorAll(
        ".participant-amount-input"
      )
      .forEach(input => {
        const memberId =
          input.dataset.memberId;

        if (!memberId) {
          return;
        }

        participantAmounts[
          String(memberId)
        ] = number(input.value);
      });
  }

  return {
    name:
      dom.initiativeName?.value.trim() || "",

    description:
      dom.initiativeDescription?.value.trim() || "",

    type:
      getSelectedType(),

    targetAmount:
      number(dom.targetAmount?.value),

    startDate:
      dom.startDate?.value || "",

    endDate:
      dom.endDate?.value || "",

    participantIds:
      [...selectedMembers],

    participantAmounts
  };
}


function setFormData(data) {
  if (!data) {
    return;
  }

  if (dom.initiativeName) {
    dom.initiativeName.value =
      data.name || "";
  }

  if (dom.initiativeDescription) {
    dom.initiativeDescription.value =
      data.description || "";
  }

  const type =
    data.type === "recurring"
      ? "recurring"
      : "one_time";

  const radio =
    document.querySelector(
      `input[name="initiativeType"][value="${type}"]`
    );

  if (radio) {
    radio.checked = true;
  }

  if (dom.targetAmount) {
    dom.targetAmount.value =
      number(data.targetAmount) || "";
  }

  if (dom.startDate) {
    dom.startDate.value =
      data.startDate || "";
  }

  if (dom.endDate) {
    dom.endDate.value =
      data.endDate || "";
  }

  selectedMembers = new Set(
    Array.isArray(data.participantIds)
      ? data.participantIds.map(String)
      : []
  );

  renderParticipants();

  if (
    data.participantAmounts &&
    dom.participantList
  ) {
    dom.participantList
      .querySelectorAll(
        ".participant-amount-input"
      )
      .forEach(input => {
        const memberId =
          String(input.dataset.memberId || "");

        if (
          Object.prototype.hasOwnProperty.call(
            data.participantAmounts,
            memberId
          )
        ) {
          input.value =
            number(
              data.participantAmounts[memberId]
            ) || "";
        }
      });
  }

  updateSummary();
  updateWorkflow();
}


/* =========================================================
   VALIDATION
   ========================================================= */

function validateDraft() {
  const data = getFormData();

  if (!data.name) {
    return {
      valid: false,
      message:
        "Enter an initiative name."
    };
  }

  if (
    data.startDate &&
    data.endDate &&
    data.endDate < data.startDate
  ) {
    return {
      valid: false,
      message:
        "The end date cannot be before the start date."
    };
  }

  if (data.targetAmount < 0) {
    return {
      valid: false,
      message:
        "The target amount cannot be negative."
    };
  }

  return {
    valid: true,
    data
  };
}


/* =========================================================
   LOCAL DRAFT STORAGE
   ========================================================= */

function readDrafts() {
  try {
    const raw =
      localStorage.getItem(
        DRAFT_STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (error) {
    console.warn(
      "Could not read initiative drafts.",
      error
    );

    return [];
  }
}


function writeDrafts(drafts) {
  localStorage.setItem(
    DRAFT_STORAGE_KEY,
    JSON.stringify(drafts)
  );
}


function saveDraft() {
  const result =
    validateDraft();

  if (!result.valid) {
    setStatus(
      result.message,
      "error"
    );

    return;
  }

  const data =
    result.data;

  const drafts =
    readDrafts();

  const draft = {
    id: createDraftId(),

    groupId,

    ...data,

    status: "draft",

    savedAt:
      new Date().toISOString()
  };

  drafts.unshift(draft);

  writeDrafts(drafts);

  renderDraftList();

  setStatus(
    "Initiative draft saved locally. No accounting records were created.",
    "success"
  );
}


function clearCurrentDraft() {
  resetForm();

  setStatus(
    "Current initiative form cleared.",
    "info"
  );
}


function deleteDraft(draftId) {
  const drafts =
    readDrafts();

  const remaining =
    drafts.filter(
      draft =>
        String(draft.id) !==
        String(draftId)
    );

  writeDrafts(remaining);

  renderDraftList();

  setStatus(
    "Saved draft removed from this device.",
    "success"
  );
}


function loadDraft(draftId) {
  const drafts =
    readDrafts();

  const draft =
    drafts.find(
      item =>
        String(item.id) ===
        String(draftId)
    );

  if (!draft) {
    setStatus(
      "The selected draft could not be found.",
      "error"
    );

    return;
  }

  if (
    groupId &&
    draft.groupId &&
    String(draft.groupId) !==
      String(groupId)
  ) {
    setStatus(
      "This draft belongs to another group.",
      "error"
    );

    return;
  }

  setFormData(draft);

  setStatus(
    "Draft loaded. Review the configuration before saving or proceeding.",
    "info"
  );
}


/* =========================================================
   DRAFT LIST
   ========================================================= */

function renderDraftList() {
  if (!dom.draftList) {
    return;
  }

  const drafts =
    readDrafts()
      .filter(draft => {
        if (!groupId) {
          return true;
        }

        return (
          !draft.groupId ||
          String(draft.groupId) ===
            String(groupId)
        );
      });

  if (!drafts.length) {
    dom.draftList.innerHTML = `
      <div class="empty-state">
        No saved drafts.
      </div>
    `;

    return;
  }

  dom.draftList.innerHTML =
    drafts
      .map(draft => {
        const title =
          escapeHtml(
            draft.name ||
            "Untitled initiative"
          );

        const type =
          draft.type === "recurring"
            ? "Recurring"
            : "One-time";

        const participants =
          Array.isArray(
            draft.participantIds
          )
            ? draft.participantIds.length
            : 0;

        const savedAt =
          draft.savedAt
            ? new Date(
                draft.savedAt
              ).toLocaleString("en-KE")
            : "Unknown";

        return `
          <div
            class="draft-item"
            data-draft-id="${escapeHtml(draft.id)}"
          >

            <div class="draft-item-header">

              <div>
                <div class="draft-item-title">
                  ${title}
                </div>

                <div class="draft-item-meta">
                  ${escapeHtml(type)}
                  ·
                  ${participants} participant${participants === 1 ? "" : "s"}
                  ·
                  Saved ${escapeHtml(savedAt)}
                </div>
              </div>

            </div>

            <div class="draft-item-actions">

              <button
                type="button"
                class="btn"
                data-load-draft="${escapeHtml(draft.id)}"
              >
                Load
              </button>

              <button
                type="button"
                class="btn"
                data-delete-draft="${escapeHtml(draft.id)}"
              >
                Delete
              </button>

            </div>

          </div>
        `;
      })
      .join("");
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {
  if (dom.summaryType) {
    dom.summaryType.textContent =
      getSelectedTypeLabel();
  }

  if (dom.summaryParticipants) {
    dom.summaryParticipants.textContent =
      String(selectedMembers.size);
  }

  if (dom.summaryTarget) {
    dom.summaryTarget.textContent =
      formatCurrency(
        number(
          dom.targetAmount?.value
        )
      );
  }
}


/* =========================================================
   WORKFLOW
   ========================================================= */

function updateWorkflow() {
  const hasName =
    Boolean(
      dom.initiativeName?.value.trim()
    );

  const hasParticipants =
    selectedMembers.size > 0;

  dom.workflowDraft?.classList.toggle(
    "active",
    !hasName
  );

  dom.workflowDraft?.classList.toggle(
    "complete",
    hasName
  );

  dom.workflowParticipants?.classList.toggle(
    "active",
    hasName && !hasParticipants
  );

  dom.workflowParticipants?.classList.toggle(
    "complete",
    hasParticipants
  );

  dom.workflowActivate?.classList.toggle(
    "active",
    hasName && hasParticipants
  );
}


/* =========================================================
   INITIATIVE TYPE
   ========================================================= */

function updateInitiativeTypeUI() {
  const recurring =
    getSelectedType() === "recurring";

  /*
   * End date remains optional for both types.
   * This function is intentionally limited to presentation.
   */
  if (dom.endDateGroup) {
    dom.endDateGroup.style.display =
      recurring
        ? ""
        : "";
  }

  updateSummary();
  updateWorkflow();
}


/* =========================================================
   ACTIVATION GATE
   ========================================================= */

function requestActivation() {
  const result =
    validateDraft();

  if (!result.valid) {
    setStatus(
      result.message,
      "error"
    );

    return;
  }

  if (
    result.data.participantIds.length === 0
  ) {
    setStatus(
      "Select at least one participant before activation can be considered.",
      "error"
    );

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do not invent an RPC such as:
   *   activate_initiative()
   *
   * Do not insert directly into an initiative table.
   * Do not create obligations here.
   * Do not create contributions here.
   *
   * The canonical backend contract must be supplied and
   * verified before this gate can be opened.
   */

  setStatus(
    "Activation is currently gated. The canonical initiative backend contract has not yet been connected, so no initiative or accounting records were created.",
    "info"
  );
}


/* =========================================================
   RESET
   ========================================================= */

function resetForm() {
  if (dom.form) {
    dom.form.reset();
  }

  selectedMembers.clear();

  const defaultType =
    document.querySelector(
      'input[name="initiativeType"][value="one_time"]'
    );

  if (defaultType) {
    defaultType.checked = true;
  }

  renderParticipants();
  updateInitiativeTypeUI();
  updateSummary();
  updateWorkflow();
}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function handleDraftListClick(event) {
  const loadButton =
    event.target.closest(
      "[data-load-draft]"
    );

  if (loadButton) {
    loadDraft(
      loadButton.dataset.loadDraft
    );

    return;
  }

  const deleteButton =
    event.target.closest(
      "[data-delete-draft]"
    );

  if (deleteButton) {
    deleteDraft(
      deleteButton.dataset.deleteDraft
    );
  }
}


function handleFormInput() {
  updateSummary();
  updateWorkflow();
}


function handleFormChange(event) {
  if (
    event.target.matches(
      'input[name="initiativeType"]'
    )
  ) {
    updateInitiativeTypeUI();
  }

  updateSummary();
  updateWorkflow();
}


/* =========================================================
   EVENT SETUP
   ========================================================= */

function setupEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;

  dom.form?.addEventListener(
    "input",
    handleFormInput
  );

  dom.form?.addEventListener(
    "change",
    handleFormChange
  );

  dom.participantList?.addEventListener(
    "change",
    handleParticipantChange
  );

  dom.selectAllParticipantsButton?.addEventListener(
    "click",
    selectAllParticipants
  );

  dom.clearParticipantsButton?.addEventListener(
    "click",
    clearParticipants
  );

  dom.saveDraftButton?.addEventListener(
    "click",
    saveDraft
  );

  dom.discardDraftButton?.addEventListener(
    "click",
    clearCurrentDraft
  );

  dom.activateButton?.addEventListener(
    "click",
    requestActivation
  );

  dom.newInitiativeButton?.addEventListener(
    "click",
    resetForm
  );

  dom.draftList?.addEventListener(
    "click",
    handleDraftListClick
  );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initInitiatives() {
  try {
    clearStatus();

    await requireAuth();

    setupEvents();

    await loadContext();

    renderDraftList();

    await loadMembers();

    updateInitiativeTypeUI();
    updateSummary();
    updateWorkflow();

  } catch (error) {
    console.error(
      "Initiatives initialization failed:",
      error
    );

    setStatus(
      error?.message ||
        "The Initiatives page could not be loaded.",
      "error"
    );

    if (dom.participantList) {
      dom.participantList.innerHTML = `
        <div class="empty-state">
          Group members could not be loaded.
        </div>
      `;
    }
  }
}


/* =========================================================
   PUBLIC PAGE INITIALIZER
   ========================================================= */

export {
  initInitiatives
};
