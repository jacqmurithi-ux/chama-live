/* =========================================================
   CHAMA LIVE — ASSETS
   =========================================================

   Group asset register.

   LIVE TABLE
   ---------------------------------------------------------
   public.group_assets

   Columns:
     id
     group_id
     asset_name
     category
     description
     acquired_date
     acquisition_cost
     current_value
     location
     status
     created_by
     created_at
     updated_at

   IMPORTANT
   ---------------------------------------------------------
   This module does NOT modify:

     - contributions
     - contribution_obligations
     - contribution_allocations
     - expenses
     - monthly closing
     - financial periods
     - 2B functions

   Asset values are descriptive group-asset information.
   They are NOT accounting transactions.

   SECURITY
   ---------------------------------------------------------
   View:
     authenticated members of the current group.

   Create / update:
     admin
     chairperson
     treasurer

   Delete:
     admin only

   The database/RLS remains authoritative.
========================================================= */

import { supabase } from "./supabase.js";

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

const els = {
  groupName: document.querySelector("#groupName"),

  status: document.querySelector("#status"),
  error: document.querySelector("#error"),
  accessDenied: document.querySelector("#accessDenied"),
  assetsContent: document.querySelector("#assetsContent"),

  totalAssets: document.querySelector("#totalAssets"),
  activeAssets: document.querySelector("#activeAssets"),
  totalAcquisitionCost: document.querySelector(
    "#totalAcquisitionCost"
  ),
  totalCurrentValue: document.querySelector(
    "#totalCurrentValue"
  ),

  assetForm: document.querySelector("#assetForm"),
  formTitle: document.querySelector("#formTitle"),
  assetId: document.querySelector("#assetId"),

  assetName: document.querySelector("#assetName"),
  assetCategory: document.querySelector("#assetCategory"),
  assetStatus: document.querySelector("#assetStatus"),
  acquiredDate: document.querySelector("#acquiredDate"),
  acquisitionCost: document.querySelector("#acquisitionCost"),
  currentValue: document.querySelector("#currentValue"),
  assetLocation: document.querySelector("#assetLocation"),
  assetDescription: document.querySelector(
    "#assetDescription"
  ),

  saveAsset: document.querySelector("#saveAsset"),
  resetAsset: document.querySelector("#resetAsset"),

  assetSearch: document.querySelector("#assetSearch"),
  assetFilterCategory: document.querySelector(
    "#assetFilterCategory"
  ),
  assetFilterStatus: document.querySelector(
    "#assetFilterStatus"
  ),
  refreshAssets: document.querySelector("#refreshAssets"),

  assetsBody: document.querySelector("#assetsBody")
};


/* =========================================================
   LOGGING
========================================================= */

console.log(
  "CHAMA LIVE: assets.js loaded"
);


/* =========================================================
   HELPERS
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
    return "KSh 0.00";
  }

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(amount);
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(
    `${value}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
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


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, char =>
      char.toUpperCase()
    );
}


function showStatus(message) {
  if (!els.status) {
    return;
  }

  els.status.textContent = message;
  els.status.classList.remove("hidden");
  els.status.classList.remove("error");
}


function showError(message) {
  if (!els.error) {
    return;
  }

  els.error.textContent = message;
  els.error.classList.remove("hidden");

  if (els.status) {
    els.status.classList.add("hidden");
  }
}


function clearMessages() {
  if (els.status) {
    els.status.textContent = "";
    els.status.classList.add("hidden");
  }

  if (els.error) {
    els.error.textContent = "";
    els.error.classList.add("hidden");
  }
}


function normalizeError(error) {
  const raw = String(
    error?.message ||
    error?.details ||
    error?.hint ||
    "The operation could not be completed."
  );

  const lower = raw.toLowerCase();

  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized")
  ) {
    return "You do not have permission to perform this asset operation.";
  }

  if (
    lower.includes("violates check constraint") ||
    lower.includes("check constraint")
  ) {
    return "One or more asset values are invalid.";
  }

  if (
    lower.includes("violates foreign key") ||
    lower.includes("foreign key")
  ) {
    return "The selected group or related record is invalid.";
  }

  if (
    lower.includes("duplicate") ||
    lower.includes("unique constraint")
  ) {
    return "This asset conflicts with an existing record.";
  }

  return raw;
}


/* =========================================================
   FORM VALIDATION
========================================================= */

function parseOptionalNumber(
  value,
  label
) {
  const trimmed = String(value ?? "")
    .trim();

  if (trimmed === "") {
    return {
      value: null,
      error: null
    };
  }

  const number = Number(trimmed);

  if (!Number.isFinite(number)) {
    return {
      value: null,
      error: `${label} must be a valid number.`
    };
  }

  if (number < 0) {
    return {
      value: null,
      error: `${label} cannot be negative.`
    };
  }

  return {
    value: number,
    error: null
  };
}


function readForm() {
  const assetName =
    els.assetName?.value.trim() || "";

  const category =
    els.assetCategory?.value || "";

  const status =
    els.assetStatus?.value || "";

  const acquiredDate =
    els.acquiredDate?.value || null;

  const location =
    els.assetLocation?.value.trim() || null;

  const description =
    els.assetDescription?.value.trim() || null;

  if (!assetName) {
    throw new Error(
      "Asset name is required."
    );
  }

  if (!ASSET_CATEGORIES.includes(category)) {
    throw new Error(
      "Please select a valid asset category."
    );
  }

  if (!ASSET_STATUSES.includes(status)) {
    throw new Error(
      "Please select a valid asset status."
    );
  }

  const acquisition =
    parseOptionalNumber(
      els.acquisitionCost?.value,
      "Acquisition cost"
    );

  if (acquisition.error) {
    throw new Error(
      acquisition.error
    );
  }

  const current =
    parseOptionalNumber(
      els.currentValue?.value,
      "Current value"
    );

  if (current.error) {
    throw new Error(
      current.error
    );
  }

  return {
    asset_name: assetName,
    category,
    description,
    acquired_date: acquiredDate,
    acquisition_cost: acquisition.value,
    current_value: current.value,
    location,
    status
  };
}


/* =========================================================
   AUTH / GROUP CONTEXT
========================================================= */

async function loadContext() {
  const member = await getMyMember();

  if (!member) {
    throw new Error(
      "Your CHAMA LIVE member account could not be resolved."
    );
  }

  if (!member.group_id) {
    throw new Error(
      "Your member account is not linked to a group."
    );
  }

  state.currentMember = member;
  state.groupId = member.group_id;

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
      "Your current group could not be found."
    );
  }

  state.groupName =
    group.name || "Current Group";

  if (els.groupName) {
    els.groupName.textContent =
      state.groupName;
  }

  updateManagementUI();

  console.log(
    "CHAMA LIVE: Assets context",
    {
      groupId: state.groupId,
      groupName: state.groupName,
      role: state.currentMember.role,
      canManage: canManageAssets(),
      canDelete: canDeleteAssets()
    }
  );
}


/* =========================================================
   MANAGEMENT UI
========================================================= */

function updateManagementUI() {
  const allowed =
    canManageAssets();

  if (els.assetForm) {
    els.assetForm
      .querySelectorAll("input,select,textarea,button")
      .forEach(element => {
        element.disabled = !allowed;
      });
  }

  if (els.accessDenied) {
    els.accessDenied.classList.toggle(
      "hidden",
      allowed
    );
  }

  if (els.saveAsset) {
    els.saveAsset.disabled =
      !allowed;
  }
}


/* =========================================================
   LOAD ASSETS
========================================================= */

async function loadAssets() {
  if (!state.groupId) {
    return;
  }

  clearMessages();

  const {
    data,
    error
  } = await supabase
    .from("group_assets")
    .select(
      [
        "id",
        "group_id",
        "asset_name",
        "category",
        "description",
        "acquired_date",
        "acquisition_cost",
        "current_value",
        "location",
        "status",
        "created_by",
        "created_at",
        "updated_at"
      ].join(",")
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
    throw error;
  }

  state.assets =
    Array.isArray(data)
      ? data
      : [];

  renderAll();
}


/* =========================================================
   KPI
========================================================= */

function renderKpis() {
  const assets =
    state.assets;

  const total =
    assets.length;

  const active =
    assets.filter(
      asset =>
        asset.status === "active"
    ).length;

  const acquisitionTotal =
    assets.reduce(
      (sum, asset) =>
        sum +
        (
          Number(
            asset.acquisition_cost
          ) || 0
        ),
      0
    );

  const currentTotal =
    assets.reduce(
      (sum, asset) =>
        sum +
        (
          Number(
            asset.current_value
          ) || 0
        ),
      0
    );

  if (els.totalAssets) {
    els.totalAssets.textContent =
      String(total);
  }

  if (els.activeAssets) {
    els.activeAssets.textContent =
      String(active);
  }

  if (els.totalAcquisitionCost) {
    els.totalAcquisitionCost.textContent =
      money(acquisitionTotal);
  }

  if (els.totalCurrentValue) {
    els.totalCurrentValue.textContent =
      money(currentTotal);
  }
}


/* =========================================================
   FILTERING
========================================================= */

function filteredAssets() {
  const search =
    String(
      els.assetSearch?.value || ""
    )
      .trim()
      .toLowerCase();

  const category =
    els.assetFilterCategory?.value || "";

  const status =
    els.assetFilterStatus?.value || "";

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
        !haystack.includes(search)
      ) {
        return false;
      }

      if (
        category &&
        asset.category !== category
      ) {
        return false;
      }

      if (
        status &&
        asset.status !== status
      ) {
        return false;
      }

      return true;
    }
  );
}


/* =========================================================
   TABLE
========================================================= */

function renderAssetsTable() {
  if (!els.assetsBody) {
    return;
  }

  const assets =
    filteredAssets();

  if (!assets.length) {
    els.assetsBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="assets-empty">
            <div class="assets-empty-icon">🏢</div>
            <strong>No assets found.</strong>
            ${
              state.assets.length
                ? "Try changing your filters."
                : "Your group has no assets recorded yet."
            }
          </div>
        </td>
      </tr>
    `;

    return;
  }

  els.assetsBody.innerHTML =
    assets
      .map(asset => {

        const status =
          ASSET_STATUSES.includes(
            asset.status
          )
            ? asset.status
            : "inactive";

        const description =
          asset.description
            ? escapeHtml(
                asset.description
              )
            : "—";

        const location =
          asset.location
            ? escapeHtml(
                asset.location
              )
            : "—";

        const acquired =
          formatDate(
            asset.acquired_date
          );

        const cost =
          asset.acquisition_cost == null
            ? "—"
            : money(
                asset.acquisition_cost
              );

        const current =
          asset.current_value == null
            ? "—"
            : money(
                asset.current_value
              );

        const actions =
          canManageAssets()
            ? `
              <div class="asset-actions">
                <button
                  class="asset-action"
                  type="button"
                  data-action="edit"
                  data-id="${escapeHtml(asset.id)}"
                >
                  Edit
                </button>

                ${
                  canDeleteAssets()
                    ? `
                      <button
                        class="asset-action delete"
                        type="button"
                        data-action="delete"
                        data-id="${escapeHtml(asset.id)}"
                      >
                        Delete
                      </button>
                    `
                    : ""
                }
              </div>
            `
            : "—";

        return `
          <tr>

            <td>
              <div class="asset-name">
                ${escapeHtml(
                  asset.asset_name
                )}
              </div>

              <div class="asset-description">
                ${description}
              </div>
            </td>

            <td>
              ${escapeHtml(
                titleCase(
                  asset.category
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                acquired
              )}
            </td>

            <td>
              ${escapeHtml(cost)}
            </td>

            <td>
              ${escapeHtml(current)}
            </td>

            <td>
              ${location}
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
              ${actions}
            </td>

          </tr>
        `;
      })
      .join("");
}


/* =========================================================
   RENDER
========================================================= */

function renderAll() {
  renderKpis();
  renderAssetsTable();
}


/* =========================================================
   RESET FORM
========================================================= */

function resetForm() {
  state.editingId = null;

  if (els.assetId) {
    els.assetId.value = "";
  }

  if (els.formTitle) {
    els.formTitle.textContent =
      "Add Asset";
  }

  if (els.assetName) {
    els.assetName.value = "";
  }

  if (els.assetCategory) {
    els.assetCategory.value =
      "other";
  }

  if (els.assetStatus) {
    els.assetStatus.value =
      "active";
  }

  if (els.acquiredDate) {
    els.acquiredDate.value =
      todayString();
  }

  if (els.acquisitionCost) {
    els.acquisitionCost.value =
      "";
  }

  if (els.currentValue) {
    els.currentValue.value =
      "";
  }

  if (els.assetLocation) {
    els.assetLocation.value =
      "";
  }

  if (els.assetDescription) {
    els.assetDescription.value =
      "";
  }

  if (els.saveAsset) {
    els.saveAsset.textContent =
      "Save Asset";
  }
}


/* =========================================================
   EDIT FORM
========================================================= */

function startEdit(asset) {
  if (!canManageAssets()) {
    showError(
      "You do not have permission to edit assets."
    );

    return;
  }

  state.editingId =
    asset.id;

  if (els.assetId) {
    els.assetId.value =
      asset.id;
  }

  if (els.formTitle) {
    els.formTitle.textContent =
      "Edit Asset";
  }

  if (els.assetName) {
    els.assetName.value =
      asset.asset_name || "";
  }

  if (els.assetCategory) {
    els.assetCategory.value =
      ASSET_CATEGORIES.includes(
        asset.category
      )
        ? asset.category
        : "other";
  }

  if (els.assetStatus) {
    els.assetStatus.value =
      ASSET_STATUSES.includes(
        asset.status
      )
        ? asset.status
        : "active";
  }

  if (els.acquiredDate) {
    els.acquiredDate.value =
      asset.acquired_date || "";
  }

  if (els.acquisitionCost) {
    els.acquisitionCost.value =
      asset.acquisition_cost ?? "";
  }

  if (els.currentValue) {
    els.currentValue.value =
      asset.current_value ?? "";
  }

  if (els.assetLocation) {
    els.assetLocation.value =
      asset.location || "";
  }

  if (els.assetDescription) {
    els.assetDescription.value =
      asset.description || "";
  }

  if (els.saveAsset) {
    els.saveAsset.textContent =
      "Update Asset";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   SAVE ASSET
========================================================= */

async function saveAsset(event) {
  event.preventDefault();

  clearMessages();

  if (!canManageAssets()) {
    showError(
      "You do not have permission to manage assets."
    );

    return;
  }

  try {
    const payload =
      readForm();

    if (!state.groupId) {
      throw new Error(
        "Current group context is unavailable."
      );
    }

    if (state.editingId) {

      const {
        error
      } = await supabase
        .from("group_assets")
        .update(payload)
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

    } else {

      const insertPayload = {
        ...payload,
        group_id:
          state.groupId,
        created_by:
          state.currentMember.id
      };

      const {
        error
      } = await supabase
        .from("group_assets")
        .insert(
          insertPayload
        );

      if (error) {
        throw error;
      }

      showStatus(
        "Asset added successfully."
      );
    }

    resetForm();

    await loadAssets();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Asset save failed",
      error
    );

    showError(
      normalizeError(error)
    );
  }
}


/* =========================================================
   DELETE ASSET
========================================================= */

async function deleteAsset(assetId) {
  if (!canDeleteAssets()) {
    showError(
      "Only an admin can delete assets."
    );

    return;
  }

  const asset =
    state.assets.find(
      item =>
        item.id === assetId
    );

  if (!asset) {
    showError(
      "The selected asset could not be found."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Delete "${asset.asset_name}" from the group asset register?`
    );

  if (!confirmed) {
    return;
  }

  clearMessages();

  try {

    const {
      error
    } = await supabase
      .from("group_assets")
      .delete()
      .eq(
        "id",
        assetId
      )
      .eq(
        "group_id",
        state.groupId
      );

    if (error) {
      throw error;
    }

    showStatus(
      "Asset deleted successfully."
    );

    if (
      state.editingId === assetId
    ) {
      resetForm();
    }

    await loadAssets();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Asset delete failed",
      error
    );

    showError(
      normalizeError(error)
    );
  }
}


/* =========================================================
   TABLE ACTIONS
========================================================= */

function handleTableClick(event) {
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

  const asset =
    state.assets.find(
      item =>
        item.id === id
    );

  if (!asset) {
    showError(
      "The selected asset could not be found."
    );

    return;
  }

  if (action === "edit") {
    startEdit(asset);
    return;
  }

  if (action === "delete") {
    deleteAsset(id);
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  els.assetForm?.addEventListener(
    "submit",
    saveAsset
  );

  els.resetAsset?.addEventListener(
    "click",
    () => {
      clearMessages();
      resetForm();
    }
  );

  els.refreshAssets?.addEventListener(
    "click",
    async () => {
      try {
        await loadAssets();

        showStatus(
          "Asset register refreshed."
        );
      } catch (error) {
        showError(
          normalizeError(error)
        );
      }
    }
  );

  els.assetSearch?.addEventListener(
    "input",
    renderAssetsTable
  );

  els.assetFilterCategory?.addEventListener(
    "change",
    renderAssetsTable
  );

  els.assetFilterStatus?.addEventListener(
    "change",
    renderAssetsTable
  );

  els.assetsBody?.addEventListener(
    "click",
    handleTableClick
  );
}


/* =========================================================
   BOOT
========================================================= */

async function boot() {

  console.log(
    "CHAMA LIVE: Assets boot starting"
  );

  clearMessages();

  try {

    await requireAuth();

    await loadContext();

    resetForm();

    await loadAssets();

    console.log(
      "CHAMA LIVE: Assets ready",
      {
        groupId: state.groupId,
        groupName: state.groupName,
        role:
          state.currentMember?.role,
        assets:
          state.assets.length
      }
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE: Assets boot failed",
      error
    );

    if (els.assetsContent) {
      els.assetsContent.classList.add(
        "hidden"
      );
    }

    showError(
      normalizeError(error)
    );
  }
}


/* =========================================================
   START
========================================================= */

bindEvents();

boot();


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: assets.js ready"
);

