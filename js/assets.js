/* =========================================================
   CHAMA LIVE — ADMIN ASSETS

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Load authenticated group context
   - Load group assets
   - Display asset KPIs
   - Search and filter assets
   - Create assets
   - Edit assets
   - Delete assets
   - Enforce UI management permissions

   DATA SOURCE
   ---------------------------------------------------------
   public.group_assets

   SECURITY
   ---------------------------------------------------------
   - All queries are group scoped.
   - RLS remains authoritative.
   - Management roles:
       admin
       chairperson
       treasurer
   - Delete role:
       admin

   IMPORTANT
   ---------------------------------------------------------
   This module does not modify:
   - RLS
   - privileges
   - database functions
   - authentication rules
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


/* =========================================================
   CONSTANTS
========================================================= */

const ASSET_CATEGORIES = [
  "land",
  "building",
  "vehicle",
  "equipment",
  "livestock",
  "farm",
  "furniture",
  "investment",
  "shares",
  "other"
];


const ASSET_STATUSES = [
  "active",
  "disposed",
  "sold",
  "lost",
  "inactive"
];


const MANAGEMENT_ROLES = [
  "admin",
  "chairperson",
  "treasurer"
];


const DELETE_ROLE =
  "admin";


/* =========================================================
   STATE
========================================================= */

const state = {

  currentMember:
    null,

  groupId:
    null,

  groupName:
    "",

  assets:
    [],

  editingId:
    null

};


/* =========================================================
   DOM
========================================================= */

let elements =
  {};


/* =========================================================
   INITIALIZER
========================================================= */

export async function initPage() {

  cacheElements();

  bindEvents();

  await requireAuth();

  await loadContext();

  resetForm();

  await loadAssets();

}


/* =========================================================
   DOM CACHE
========================================================= */

function cacheElements() {

  elements = {

    groupName:
      document.getElementById(
        "groupName"
      ),

    status:
      document.getElementById(
        "status"
      ),

    error:
      document.getElementById(
        "error"
      ),

    accessDenied:
      document.getElementById(
        "accessDenied"
      ),

    assetsContent:
      document.getElementById(
        "assetsContent"
      ),

    totalAssets:
      document.getElementById(
        "totalAssets"
      ),

    activeAssets:
      document.getElementById(
        "activeAssets"
      ),

    totalAcquisitionCost:
      document.getElementById(
        "totalAcquisitionCost"
      ),

    totalCurrentValue:
      document.getElementById(
        "totalCurrentValue"
      ),

    assetForm:
      document.getElementById(
        "assetForm"
      ),

    formTitle:
      document.getElementById(
        "formTitle"
      ),

    assetId:
      document.getElementById(
        "assetId"
      ),

    assetName:
      document.getElementById(
        "assetName"
      ),

    assetCategory:
      document.getElementById(
        "assetCategory"
      ),

    assetStatus:
      document.getElementById(
        "assetStatus"
      ),

    acquiredDate:
      document.getElementById(
        "acquiredDate"
      ),

    assetLocation:
      document.getElementById(
        "assetLocation"
      ),

    acquisitionCost:
      document.getElementById(
        "acquisitionCost"
      ),

    currentValue:
      document.getElementById(
        "currentValue"
      ),

    assetDescription:
      document.getElementById(
        "assetDescription"
      ),

    saveAsset:
      document.getElementById(
        "saveAsset"
      ),

    resetAsset:
      document.getElementById(
        "resetAsset"
      ),

    assetSearch:
      document.getElementById(
        "assetSearch"
      ),

    assetFilterCategory:
      document.getElementById(
        "assetFilterCategory"
      ),

    assetFilterStatus:
      document.getElementById(
        "assetFilterStatus"
      ),

    refreshAssets:
      document.getElementById(
        "refreshAssets"
      ),

    assetsBody:
      document.getElementById(
        "assetsBody"
      )

  };

}


/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(
  role
) {

  return String(
    role || ""
  )
    .trim()
    .toLowerCase();

}


function canManageAssets() {

  return MANAGEMENT_ROLES.includes(
    normalizeRole(
      state.currentMember?.role
    )
  );

}


function canDeleteAssets() {

  return (
    normalizeRole(
      state.currentMember?.role
    ) ===
    DELETE_ROLE
  );

}


/* =========================================================
   GENERAL HELPERS
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


function money(
  value
) {

  const amount =
    Number(value);


  if (
    !Number.isFinite(
      amount
    )
  ) {

    return "KSh 0";

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
    new Date(
      `${value}T00:00:00`
    );


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
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

}


function escapeHtml(
  value
) {

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


function titleCase(
  value
) {

  return String(
    value || ""
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );

}


/* =========================================================
   MESSAGES
========================================================= */

function showStatus(
  message
) {

  if (!elements.status) {
    return;
  }


  elements.status.hidden =
    !message;

  elements.status.textContent =
    message || "";

}


function showError(
  message
) {

  if (!elements.error) {
    return;
  }


  elements.error.hidden =
    !message;

  elements.error.textContent =
    message || "";

}


function clearMessages() {

  showStatus("");

  showError("");

}


function normalizeError(
  error
) {

  return (
    error?.message ||
    error?.details ||
    error?.hint ||
    "Something went wrong."
  );

}


/* =========================================================
   FORM VALIDATION
========================================================= */

function parseOptionalNumber(
  value,
  label
) {

  if (
    value ===
    "" ||
    value ===
    null ||
    value ===
    undefined
  ) {

    return null;

  }


  const number =
    Number(value);


  if (
    !Number.isFinite(
      number
    )
  ) {

    throw new Error(
      `${label} must be a valid number.`
    );

  }


  if (
    number < 0
  ) {

    throw new Error(
      `${label} cannot be negative.`
    );

  }


  return number;

}


function readForm() {

  const assetName =
    elements.assetName.value.trim();

  const category =
    elements.assetCategory.value;

  const status =
    elements.assetStatus.value;

  const acquiredDate =
    elements.acquiredDate.value ||
    null;

  const location =
    elements.assetLocation.value.trim();

  const acquisitionCost =
    parseOptionalNumber(
      elements.acquisitionCost.value,
      "Acquisition cost"
    );

  const currentValue =
    parseOptionalNumber(
      elements.currentValue.value,
      "Current value"
    );

  const description =
    elements.assetDescription.value.trim();


  if (!assetName) {

    throw new Error(
      "Asset name is required."
    );

  }


  if (
    !ASSET_CATEGORIES.includes(
      category
    )
  ) {

    throw new Error(
      "Please select a valid asset category."
    );

  }


  if (
    !ASSET_STATUSES.includes(
      status
    )
  ) {

    throw new Error(
      "Please select a valid asset status."
    );

  }


  return {

    asset_name:
      assetName,

    category:
      category,

    status:
      status,

    acquired_date:
      acquiredDate,

    location:
      location || null,

    acquisition_cost:
      acquisitionCost,

    current_value:
      currentValue,

    description:
      description || null

  };

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadContext() {

  const member =
    await getMyMember();


  if (
    !member
  ) {

    throw new Error(
      "Your member account could not be loaded."
    );

  }


  if (
    !member.group_id
  ) {

    throw new Error(
      "Your account is not linked to a group."
    );

  }


  state.currentMember =
    member;

  state.groupId =
    member.group_id;


  const {
    data: group,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "id,name"
      )
      .eq(
        "id",
        state.groupId
      )
      .maybeSingle();


  if (error) {

    throw error;

  }


  state.groupName =
    group?.name ||
    "CHAMA";


  if (
    elements.groupName
  ) {

    elements.groupName.textContent =
      state.groupName;

  }


  updateManagementUI();

}


/* =========================================================
   MANAGEMENT UI
========================================================= */

function updateManagementUI() {

  const allowed =
    canManageAssets();


  if (
    elements.accessDenied
  ) {

    elements.accessDenied.hidden =
      allowed;

  }


  const formControls =
    elements.assetForm
      ?.querySelectorAll(
        "input, select, textarea, button"
      ) || [];


  formControls.forEach(
    control => {

      control.disabled =
        !allowed;

    }
  );


  if (
    elements.saveAsset
  ) {

    elements.saveAsset.disabled =
      !allowed;

  }


  if (
    elements.resetAsset
  ) {

    elements.resetAsset.disabled =
      !allowed;

  }

}


/* =========================================================
   LOAD ASSETS
========================================================= */

async function loadAssets() {

  if (
    !state.groupId
  ) {

    return;

  }


  clearMessages();

  showStatus(
    "Loading assets…"
  );


  const {
    data,
    error
  } =
    await supabase
      .from("group_assets")
      .select(
        `
          id,
          group_id,
          asset_name,
          category,
          description,
          acquired_date,
          acquisition_cost,
          current_value,
          location,
          status,
          created_by,
          created_at,
          updated_at
        `
      )
      .eq(
        "group_id",
        state.groupId
      )
      .order(
        "asset_name",
        {
          ascending: true
        }
      );


  if (error) {

    showError(
      normalizeError(
        error
      )
    );

    if (
      elements.assetsBody
    ) {

      elements.assetsBody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-state"
          >
            Unable to load assets.
          </td>
        </tr>
      `;

    }

    return;

  }


  state.assets =
    Array.isArray(
      data
    )
      ? data
      : [];


  updateKpis();

  renderAssets();

  showStatus("");

}


/* =========================================================
   KPI
========================================================= */

function updateKpis() {

  const assets =
    state.assets;


  const total =
    assets.length;


  const active =
    assets.filter(
      asset =>
        asset.status ===
        "active"
    ).length;


  const acquisitionTotal =
    assets.reduce(
      (
        total,
        asset
      ) =>
        total +
        (
          Number(
            asset.acquisition_cost
          ) || 0
        ),
      0
    );


  const currentTotal =
    assets.reduce(
      (
        total,
        asset
      ) =>
        total +
        (
          Number(
            asset.current_value
          ) || 0
        ),
      0
    );


  if (
    elements.totalAssets
  ) {

    elements.totalAssets.textContent =
      total.toLocaleString(
        "en-KE"
      );

  }


  if (
    elements.activeAssets
  ) {

    elements.activeAssets.textContent =
      active.toLocaleString(
        "en-KE"
      );

  }


  if (
    elements.totalAcquisitionCost
  ) {

    elements.totalAcquisitionCost.textContent =
      money(
        acquisitionTotal
      );

  }


  if (
    elements.totalCurrentValue
  ) {

    elements.totalCurrentValue.textContent =
      money(
        currentTotal
      );

  }

}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredAssets() {

  const search =
    (
      elements.assetSearch?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const category =
    elements.assetFilterCategory?.value ||
    "";


  const status =
    elements.assetFilterStatus?.value ||
    "";


  return state.assets.filter(
    asset => {

      const haystack = [
        asset.asset_name,
        asset.category,
        asset.description,
        asset.location,
        asset.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


      if (
        search &&
        !haystack.includes(
          search
        )
      ) {

        return false;

      }


      if (
        category &&
        asset.category !==
          category
      ) {

        return false;

      }


      if (
        status &&
        asset.status !==
          status
      ) {

        return false;

      }


      return true;

    }
  );

}


/* =========================================================
   TABLE RENDERING
========================================================= */

function renderAssets() {

  if (
    !elements.assetsBody
  ) {

    return;

  }


  const assets =
    getFilteredAssets();


  if (
    assets.length === 0
  ) {

    elements.assetsBody.innerHTML = `
      <tr>
        <td
          colspan="8"
          class="empty-state"
        >
          No assets match the current filters.
        </td>
      </tr>
    `;

    return;

  }


  elements.assetsBody.innerHTML =
    assets
      .map(
        asset => {

          const statusClass =
            `status-${escapeHtml(
              asset.status || "inactive"
            )}`;


          const editButton =
            canManageAssets()
              ? `
                <button
                  type="button"
                  class="btn-secondary asset-action"
                  data-action="edit"
                  data-id="${escapeHtml(
                    asset.id
                  )}"
                >
                  Edit
                </button>
              `
              : "";


          const deleteButton =
            canDeleteAssets()
              ? `
                <button
                  type="button"
                  class="btn-danger asset-action"
                  data-action="delete"
                  data-id="${escapeHtml(
                    asset.id
                  )}"
                >
                  Delete
                </button>
              `
              : "";


          return `
            <tr>

              <td>
                <div class="asset-name">
                  ${escapeHtml(
                    asset.asset_name
                  )}
                </div>

                ${
                  asset.description
                    ? `
                      <div class="asset-description">
                        ${escapeHtml(
                          asset.description
                        )}
                      </div>
                    `
                    : ""
                }
              </td>

              <td>
                ${escapeHtml(
                  titleCase(
                    asset.category
                  )
                )}
              </td>

              <td>
                ${formatDate(
                  asset.acquired_date
                )}
              </td>

              <td>
                ${money(
                  asset.acquisition_cost
                )}
              </td>

              <td>
                ${money(
                  asset.current_value
                )}
              </td>

              <td>
                ${
                  asset.location
                    ? escapeHtml(
                        asset.location
                      )
                    : "—"
                }
              </td>

              <td>
                <span
                  class="status-badge ${statusClass}"
                >
                  ${escapeHtml(
                    titleCase(
                      asset.status
                    )
                  )}
                </span>
              </td>

              <td>
                <div class="actions">
                  ${editButton}
                  ${deleteButton}
                </div>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   FORM RESET
========================================================= */

function resetForm() {

  state.editingId =
    null;


  if (
    !elements.assetForm
  ) {

    return;

  }


  elements.assetForm.reset();


  if (
    elements.assetId
  ) {

    elements.assetId.value =
      "";

  }


  if (
    elements.formTitle
  ) {

    elements.formTitle.textContent =
      "Add Asset";

  }


  if (
    elements.assetCategory
  ) {

    elements.assetCategory.value =
      "other";

  }


  if (
    elements.assetStatus
  ) {

    elements.assetStatus.value =
      "active";

  }


  if (
    elements.acquiredDate
  ) {

    elements.acquiredDate.value =
      todayString();

  }


  updateManagementUI();

}


/* =========================================================
   EDIT ASSET
========================================================= */

function editAsset(
  id
) {

  if (
    !canManageAssets()
  ) {

    return;

  }


  const asset =
    state.assets.find(
      item =>
        String(item.id) ===
        String(id)
    );


  if (!asset) {

    showError(
      "The selected asset could not be found."
    );

    return;

  }


  state.editingId =
    asset.id;


  elements.assetId.value =
    asset.id;


  elements.assetName.value =
    asset.asset_name ||
    "";


  elements.assetCategory.value =
    asset.category ||
    "other";


  elements.assetStatus.value =
    asset.status ||
    "active";


  elements.acquiredDate.value =
    asset.acquired_date ||
    "";


  elements.assetLocation.value =
    asset.location ||
    "";


  elements.acquisitionCost.value =
    asset.acquisition_cost ??
    "";


  elements.currentValue.value =
    asset.current_value ??
    "";


  elements.assetDescription.value =
    asset.description ||
    "";


  if (
    elements.formTitle
  ) {

    elements.formTitle.textContent =
      "Edit Asset";

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   SAVE ASSET
========================================================= */

async function saveAsset() {

  if (
    !canManageAssets()
  ) {

    showError(
      "You do not have permission to manage assets."
    );

    return;

  }


  clearMessages();


  let payload;


  try {

    payload =
      readForm();

  }

  catch (error) {

    showError(
      normalizeError(
        error
      )
    );

    return;

  }


  const isEditing =
    Boolean(
      state.editingId
    );


  if (
    elements.saveAsset
  ) {

    elements.saveAsset.disabled =
      true;

    elements.saveAsset.textContent =
      isEditing
        ? "Saving…"
        : "Adding…";

  }


  try {

    if (
      isEditing
    ) {

      const {
        error
      } =
        await supabase
          .from("group_assets")
          .update(
            payload
          )
          .eq(
            "id",
            state.editingId
          )
          .eq(
            "group_id",
            state.groupId
          );


      if (error) {

        throw error;

      }


      showStatus(
        "Asset updated successfully."
      );

    }

    else {

      const {
        error
      } =
        await supabase
          .from("group_assets")
          .insert({
            ...payload,
            group_id:
              state.groupId,
            created_by:
              state.currentMember?.id ||
              null
          });


      if (error) {

        throw error;

      }


      showStatus(
        "Asset added successfully."
      );

    }


    resetForm();

    await loadAssets();

  }

  catch (error) {

    showError(
      normalizeError(
        error
      )
    );

  }

  finally {

    if (
      elements.saveAsset
    ) {

      elements.saveAsset.disabled =
        !canManageAssets();

      elements.saveAsset.textContent =
        "Save Asset";

    }

  }

}


/* =========================================================
   DELETE ASSET
========================================================= */

async function deleteAsset(
  id
) {

  if (
    !canDeleteAssets()
  ) {

    showError(
      "Only an admin can delete assets."
    );

    return;

  }


  const asset =
    state.assets.find(
      item =>
        String(item.id) ===
        String(id)
    );


  if (!asset) {

    showError(
      "The selected asset could not be found."
    );

    return;

  }


  const confirmed =
    window.confirm(
      `Delete "${asset.asset_name}"? This action cannot be undone.`
    );


  if (!confirmed) {

    return;

  }


  clearMessages();

  showStatus(
    "Deleting asset…"
  );


  try {

    const {
      error
    } =
      await supabase
        .from("group_assets")
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
      state.editingId ===
      id
    ) {

      resetForm();

    }


    await loadAssets();

    showStatus(
      "Asset deleted successfully."
    );

  }

  catch (error) {

    showError(
      normalizeError(
        error
      )
    );

  }

}


/* =========================================================
   EVENT HANDLERS
========================================================= */

function bindEvents() {

  if (
    elements.assetForm
  ) {

    elements.assetForm.addEventListener(
      "submit",
      event => {

        event.preventDefault();

        saveAsset();

      }
    );

  }


  if (
    elements.resetAsset
  ) {

    elements.resetAsset.addEventListener(
      "click",
      () => {

        clearMessages();

        resetForm();

      }
    );

  }


  if (
    elements.refreshAssets
  ) {

    elements.refreshAssets.addEventListener(
      "click",
      () => {

        loadAssets();

      }
    );

  }


  if (
    elements.assetSearch
  ) {

    elements.assetSearch.addEventListener(
      "input",
      renderAssets
    );

  }


  if (
    elements.assetFilterCategory
  ) {

    elements.assetFilterCategory.addEventListener(
      "change",
      renderAssets
    );

  }


  if (
    elements.assetFilterStatus
  ) {

    elements.assetFilterStatus.addEventListener(
      "change",
      renderAssets
    );

  }


  if (
    elements.assetsBody
  ) {

    elements.assetsBody.addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            ".asset-action"
          );


        if (!button) {

          return;

        }


        const action =
          button.dataset.action;


        const id =
          button.dataset.id;


        if (
          action ===
          "edit"
        ) {

          editAsset(
            id
          );

        }


        if (
          action ===
          "delete"
        ) {

          deleteAsset(
            id
          );

        }

      }
    );

  }

}
