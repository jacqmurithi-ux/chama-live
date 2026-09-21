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

const DELETE_ROLE = "admin";


/* =========================================================
   STATE
========================================================= */

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  assets: [],
  editingId: null
};


/* =========================================================
   DOM
========================================================= */

let elements = {};


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
    groupName: document.getElementById("groupName"),
    status: document.getElementById("status"),
    error: document.getElementById("error"),
    accessDenied: document.getElementById("accessDenied"),
    assetsContent: document.getElementById("assetsContent"),

    totalAssets: document.getElementById("totalAssets"),
    activeAssets: document.getElementById("activeAssets"),
    totalAcquisitionCost:
      document.getElementById("totalAcquisitionCost"),
    totalCurrentValue:
      document.getElementById("totalCurrentValue"),

    assetForm: document.getElementById("assetForm"),
    formTitle: document.getElementById("formTitle"),
    assetId: document.getElementById("assetId"),
    assetName: document.getElementById("assetName"),
    assetCategory: document.getElementById("assetCategory"),
    assetStatus: document.getElementById("assetStatus"),
    acquiredDate: document.getElementById("acquiredDate"),
    assetLocation: document.getElementById("assetLocation"),
    acquisitionCost:
      document.getElementById("acquisitionCost"),
    currentValue:
      document.getElementById("currentValue"),
    assetDescription:
      document.getElementById("assetDescription"),

    saveAsset: document.getElementById("saveAsset"),
    resetAsset: document.getElementById("resetAsset"),

    assetSearch: document.getElementById("assetSearch"),
    assetFilterCategory:
      document.getElementById("assetFilterCategory"),
    assetFilterStatus:
      document.getElementById("assetFilterStatus"),
    refreshAssets:
      document.getElementById("refreshAssets"),

    assetsBody: document.getElementById("assetsBody")
  };
}


/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}

function canManageAssets() {
  return MANAGEMENT_ROLES.includes(
    normalizeRole(state.currentMember?.role)
  );
}

function canDeleteAssets() {
  return (
    normalizeRole(state.currentMember?.role) ===
    DELETE_ROLE
  );
}


/* =========================================================
   GENERAL HELPERS
========================================================= */

function todayString() {
  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function money(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
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


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
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


function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char =>
      char.toUpperCase()
    );
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function normalizeError(error) {
  if (!error) {
    return "Something went wrong.";
  }

  return (
    error.message ||
    error.error_description ||
    error.details ||
    "Something went wrong."
  );
}


/* =========================================================
   STATUS / ERROR UI
========================================================= */

function showStatus(message) {
  if (!elements.status) {
    return;
  }

  elements.status.textContent = message;
  elements.status.classList.remove("hidden");
}


function showError(message) {
  if (!elements.error) {
    return;
  }

  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}


function clearMessages() {
  elements.status?.classList.add("hidden");
  elements.error?.classList.add("hidden");
}


/* =========================================================
   CONTEXT
========================================================= */

async function loadContext() {
  clearMessages();

  state.currentMember =
    await getMyMember();

  if (!state.currentMember) {
    throw new Error(
      "Unable to load your member account."
    );
  }

  if (!state.currentMember.group_id) {
    throw new Error(
      "Your account is not linked to a group."
    );
  }

  state.groupId =
    state.currentMember.group_id;

  const {
    data: group,
    error
  } = await supabase
    .from("groups")
    .select("id,name")
    .eq("id", state.groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!group) {
    throw new Error(
      "Your group could not be found."
    );
  }

  state.groupName =
    group.name ||
    "CHAMA";

  if (elements.groupName) {
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

  if (elements.accessDenied) {
    elements.accessDenied.classList.toggle(
      "hidden",
      allowed
    );
  }

  const controls = [
    elements.assetName,
    elements.assetCategory,
    elements.assetStatus,
    elements.acquiredDate,
    elements.assetLocation,
    elements.acquisitionCost,
    elements.currentValue,
    elements.assetDescription,
    elements.saveAsset
  ];

  controls.forEach(control => {
    if (control) {
      control.disabled = !allowed;
    }
  });
}


/* =========================================================
   LOAD ASSETS
========================================================= */

async function loadAssets() {
  clearMessages();

  if (!state.groupId) {
    return;
  }

  if (elements.assetsBody) {
    elements.assetsBody.innerHTML = `
      <tr>
        <td colspan="8" class="assets-empty">
          <div class="assets-empty-icon">⏳</div>
          <strong>Loading assets…</strong>
          Please wait.
        </td>
      </tr>
    `;
  }

  const {
    data,
    error
  } = await supabase
    .from("group_assets")
    .select(`
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
    `)
    .eq("group_id", state.groupId)
    .order("asset_name", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  state.assets =
    Array.isArray(data)
      ? data
      : [];

  renderKPIs();
  renderAssets();
}


/* =========================================================
   KPIs
========================================================= */

function renderKPIs() {
  const total =
    state.assets.length;

  const active =
    state.assets.filter(
      asset =>
        String(asset.status || "")
          .toLowerCase() === "active"
    ).length;

  const acquisitionCost =
    state.assets.reduce(
      (sum, asset) =>
        sum +
        (Number(asset.acquisition_cost) || 0),
      0
    );

  const currentValue =
    state.assets.reduce(
      (sum, asset) =>
        sum +
        (Number(asset.current_value) || 0),
      0
    );

  if (elements.totalAssets) {
    elements.totalAssets.textContent =
      String(total);
  }

  if (elements.activeAssets) {
    elements.activeAssets.textContent =
      String(active);
  }

  if (elements.totalAcquisitionCost) {
    elements.totalAcquisitionCost.textContent =
      money(acquisitionCost);
  }

  if (elements.totalCurrentValue) {
    elements.totalCurrentValue.textContent =
      money(currentValue);
  }
}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredAssets() {
  const search =
    String(
      elements.assetSearch?.value || ""
    )
      .trim()
      .toLowerCase();

  const category =
    String(
      elements.assetFilterCategory?.value || ""
    )
      .trim()
      .toLowerCase();

  const status =
    String(
      elements.assetFilterStatus?.value || ""
    )
      .trim()
      .toLowerCase();

  return state.assets.filter(
    asset => {
      const searchable = [
        asset.asset_name,
        asset.category,
        asset.description,
        asset.location,
        asset.status
      ]
        .map(value =>
          String(value || "").toLowerCase()
        )
        .join(" ");

      const matchesSearch =
        !search ||
        searchable.includes(search);

      const matchesCategory =
        !category ||
        String(asset.category || "")
          .toLowerCase() === category;

      const matchesStatus =
        !status ||
        String(asset.status || "")
          .toLowerCase() === status;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus
      );
    }
  );
}


/* =========================================================
   RENDER ASSETS
========================================================= */

function renderAssets() {
  if (!elements.assetsBody) {
    return;
  }

  const assets =
    getFilteredAssets();

  if (!assets.length) {
    elements.assetsBody.innerHTML = `
      <tr>
        <td colspan="8" class="assets-empty">
          <div class="assets-empty-icon">🏢</div>

          <strong>
            ${
              state.assets.length
                ? "No matching assets"
                : "No assets recorded yet"
            }
          </strong>

          ${
            state.assets.length
              ? "Try changing your search or filters."
              : "Add the group's first asset using the form."
          }
        </td>
      </tr>
    `;

    return;
  }

  elements.assetsBody.innerHTML =
    assets
      .map(asset => {
        const status =
          String(
            asset.status || "inactive"
          ).toLowerCase();

        const managementActions =
          canManageAssets()
            ? `
              <button
                type="button"
                class="asset-action"
                data-action="edit"
                data-id="${escapeHtml(asset.id)}"
              >
                Edit
              </button>
            `
            : "";

        const deleteAction =
          canDeleteAssets()
            ? `
              <button
                type="button"
                class="asset-action delete"
                data-action="delete"
                data-id="${escapeHtml(asset.id)}"
              >
                Delete
              </button>
            `
            : "";

        return `
          <tr>

            <td>
              <div class="asset-name">
                ${escapeHtml(asset.asset_name || "Unnamed asset")}
              </div>

              ${
                asset.description
                  ? `
                    <div class="asset-description">
                      ${escapeHtml(asset.description)}
                    </div>
                  `
                  : ""
              }
            </td>

            <td>
              ${escapeHtml(
                titleCase(asset.category)
              )}
            </td>

            <td>
              ${escapeHtml(
                formatDate(asset.acquired_date)
              )}
            </td>

            <td>
              ${money(asset.acquisition_cost)}
            </td>

            <td>
              ${money(asset.current_value)}
            </td>

            <td>
              ${escapeHtml(
                asset.location || "—"
              )}
            </td>

            <td>
              <span
                class="asset-status ${escapeHtml(status)}"
              >
                ${escapeHtml(
                  titleCase(status)
                )}
              </span>
            </td>

            <td>
              <div class="asset-actions">
                ${managementActions}
                ${deleteAction}
              </div>
            </td>

          </tr>
        `;
      })
      .join("");
}


/* =========================================================
   FORM HELPERS
========================================================= */

function parseOptionalNumber(
  value,
  label
) {
  const trimmed =
    String(value ?? "").trim();

  if (!trimmed) {
    return null;
  }

  const number =
    Number(trimmed);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    throw new Error(
      `${label} must be a valid non-negative number.`
    );
  }

  return number;
}


function readForm() {
  const assetName =
    String(
      elements.assetName?.value || ""
    ).trim();

  if (!assetName) {
    throw new Error(
      "Asset name is required."
    );
  }

  const category =
    String(
      elements.assetCategory?.value || ""
    )
      .trim()
      .toLowerCase();

  if (
    !ASSET_CATEGORIES.includes(
      category
    )
  ) {
    throw new Error(
      "Please select a valid asset category."
    );
  }

  const status =
    String(
      elements.assetStatus?.value || ""
    )
      .trim()
      .toLowerCase();

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
    asset_name: assetName,

    category,

    status,

    acquired_date:
      elements.acquiredDate?.value ||
      null,

    location:
      String(
        elements.assetLocation?.value || ""
      ).trim() ||
      null,

    acquisition_cost:
      parseOptionalNumber(
        elements.acquisitionCost?.value,
        "Acquisition cost"
      ),

    current_value:
      parseOptionalNumber(
        elements.currentValue?.value,
        "Current value"
      ),

    description:
      String(
        elements.assetDescription?.value || ""
      ).trim() ||
      null
  };
}


/* =========================================================
   RESET FORM
========================================================= */

function resetForm() {
  state.editingId =
    null;

  if (elements.assetForm) {
    elements.assetForm.reset();
  }

  if (elements.assetId) {
    elements.assetId.value =
      "";
  }

  if (elements.formTitle) {
    elements.formTitle.textContent =
      "Add Asset";
  }

  if (elements.assetCategory) {
    elements.assetCategory.value =
      "other";
  }

  if (elements.assetStatus) {
    elements.assetStatus.value =
      "active";
  }

  if (elements.acquiredDate) {
    elements.acquiredDate.value =
      todayString();
  }

  if (elements.saveAsset) {
    elements.saveAsset.textContent =
      "Save Asset";
  }

  updateManagementUI();
}


/* =========================================================
   EDIT ASSET
========================================================= */

function editAsset(id) {
  if (!canManageAssets()) {
    showError(
      "You do not have permission to edit assets."
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

  state.editingId =
    asset.id;

  elements.assetId.value =
    asset.id;

  elements.assetName.value =
    asset.asset_name || "";

  elements.assetCategory.value =
    ASSET_CATEGORIES.includes(
      asset.category
    )
      ? asset.category
      : "other";

  elements.assetStatus.value =
    ASSET_STATUSES.includes(
      asset.status
    )
      ? asset.status
      : "active";

  elements.acquiredDate.value =
    asset.acquired_date || "";

  elements.assetLocation.value =
    asset.location || "";

  elements.acquisitionCost.value =
    asset.acquisition_cost ??
    "";

  elements.currentValue.value =
    asset.current_value ??
    "";

  elements.assetDescription.value =
    asset.description || "";

  elements.formTitle.textContent =
    "Edit Asset";

  elements.saveAsset.textContent =
    "Update Asset";

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   SAVE ASSET
========================================================= */

async function saveAsset() {
  if (!canManageAssets()) {
    throw new Error(
      "You do not have permission to manage assets."
    );
  }

  const payload =
    readForm();

  const editingId =
    state.editingId ||
    elements.assetId?.value ||
    null;

  if (editingId) {
    const {
      error
    } = await supabase
      .from("group_assets")
      .update(payload)
      .eq("id", editingId)
      .eq("group_id", state.groupId);

    if (error) {
      throw error;
    }

    showStatus(
      "Asset updated successfully."
    );
  } else {
    const {
      data: userData
    } = await supabase.auth.getUser();

    const createdBy =
      userData?.user?.id ||
      null;

    const insertPayload = {
      ...payload,
      group_id: state.groupId,
      created_by: createdBy
    };

    const {
      error
    } = await supabase
      .from("group_assets")
      .insert(insertPayload);

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


/* =========================================================
   DELETE ASSET
========================================================= */

async function deleteAsset(id) {
  if (!canDeleteAssets()) {
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
      `Delete "${asset.asset_name}"? This cannot be undone.`
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await supabase
    .from("group_assets")
    .delete()
    .eq("id", id)
    .eq("group_id", state.groupId);

  if (error) {
    throw error;
  }

  showStatus(
    "Asset deleted successfully."
  );

  if (
    String(state.editingId) ===
    String(id)
  ) {
    resetForm();
  }

  await loadAssets();
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  if (
    elements.assetForm?.dataset.bound ===
    "true"
  ) {
    return;
  }

  elements.assetForm.dataset.bound =
    "true";

  elements.assetForm.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      clearMessages();

      if (elements.saveAsset) {
        elements.saveAsset.disabled =
          true;
      }

      try {
        await saveAsset();
      } catch (error) {
        console.error(
          "CHAMA LIVE: Asset save failed:",
          error
        );

        showError(
          normalizeError(error)
        );
      } finally {
        updateManagementUI();
      }
    }
  );


  elements.resetAsset?.addEventListener(
    "click",
    () => {
      clearMessages();
      resetForm();
    }
  );


  elements.refreshAssets?.addEventListener(
    "click",
    async () => {
      clearMessages();

      elements.refreshAssets.disabled =
        true;

      try {
        await loadAssets();

        showStatus(
          "Assets refreshed."
        );
      } catch (error) {
        console.error(
          "CHAMA LIVE: Asset refresh failed:",
          error
        );

        showError(
          normalizeError(error)
        );
      } finally {
        elements.refreshAssets.disabled =
          false;
      }
    }
  );


  elements.assetSearch?.addEventListener(
    "input",
    renderAssets
  );


  elements.assetFilterCategory?.addEventListener(
    "change",
    renderAssets
  );


  elements.assetFilterStatus?.addEventListener(
    "change",
    renderAssets
  );


  elements.assetsBody?.addEventListener(
    "click",
    async event => {
      const button =
        event.target.closest(
          "[data-action]"
        );

      if (!button) {
        return;
      }

      const action =
        button.dataset.action;

      const id =
        button.dataset.id;

      if (!id) {
        return;
      }

      clearMessages();

      try {
        if (action === "edit") {
          editAsset(id);
        }

        if (action === "delete") {
          await deleteAsset(id);
        }
      } catch (error) {
        console.error(
          "CHAMA LIVE: Asset action failed:",
          error
        );

        showError(
          normalizeError(error)
        );
      }
    }
  );
}
