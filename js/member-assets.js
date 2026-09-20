/* =========================================================
   CHAMA LIVE — MEMBER ASSETS
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   Read-only view of the authenticated member's group assets.

   LIVE TABLE
   ---------------------------------------------------------
   public.group_assets

   READ FIELDS
   ---------------------------------------------------------
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
   created_at

   SECURITY
   ---------------------------------------------------------
   • Member/group context comes from auth.js.
   • group_id is never accepted from the URL or form.
   • Database/RLS remains authoritative.
   • This module performs SELECT operations only.

   NO INSERT
   NO UPDATE
   NO DELETE
   NO RPC
   NO SCHEMA CHANGE
========================================================= */

import { supabase } from "./supabase.js";

import {
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  groupId: null,
  groupName: "",
  assets: [],
  initialized: false
};


/* =========================================================
   ELEMENTS
========================================================= */

const els = {
  loading:
    document.getElementById(
      "memberAssetsLoading"
    ),

  error:
    document.getElementById(
      "memberAssetsError"
    ),

  content:
    document.getElementById(
      "memberAssetsContent"
    ),

  groupName:
    document.getElementById(
      "memberAssetsGroupName"
    ),

  total:
    document.getElementById(
      "memberAssetTotal"
    ),

  active:
    document.getElementById(
      "memberAssetActive"
    ),

  acquisitionCost:
    document.getElementById(
      "memberAssetAcquisitionCost"
    ),

  currentValue:
    document.getElementById(
      "memberAssetCurrentValue"
    ),

  search:
    document.getElementById(
      "memberAssetSearch"
    ),

  category:
    document.getElementById(
      "memberAssetCategory"
    ),

  status:
    document.getElementById(
      "memberAssetStatus"
    ),

  rows:
    document.getElementById(
      "memberAssetsRows"
    )
};


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function money(value) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return "KSh 0.00";
  }

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const raw =
    String(value);

  const date =
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00`
        : raw
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
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


function displayStatus(status) {
  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (!value) {
    return "Unknown";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}


function normalize(value) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
   UI STATE
========================================================= */

function showLoading() {
  if (els.loading) {
    els.loading.hidden = false;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }
}


function showError(message) {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }

  if (els.error) {
    els.error.textContent =
      message ||
      "Unable to load group assets.";

    els.error.hidden = false;
  }
}


function showContent() {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = false;
  }
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {
  const assets =
    state.assets;

  const activeCount =
    assets.filter(
      asset =>
        normalize(
          asset.status
        ) === "active"
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

  const currentValueTotal =
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

  if (els.total) {
    els.total.textContent =
      String(
        assets.length
      );
  }

  if (els.active) {
    els.active.textContent =
      String(
        activeCount
      );
  }

  if (els.acquisitionCost) {
    els.acquisitionCost.textContent =
      money(
        acquisitionTotal
      );
  }

  if (els.currentValue) {
    els.currentValue.textContent =
      money(
        currentValueTotal
      );
  }
}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredAssets() {
  const search =
    normalize(
      els.search?.value
    );

  const category =
    normalize(
      els.category?.value
    );

  const status =
    normalize(
      els.status?.value
    );

  return state.assets.filter(
    asset => {

      const searchable =
        [
          asset.asset_name,
          asset.category,
          asset.description,
          asset.location,
          asset.status
        ]
          .map(normalize)
          .join(" ");

      if (
        search &&
        !searchable.includes(
          search
        )
      ) {
        return false;
      }

      if (
        category &&
        normalize(
          asset.category
        ) !== category
      ) {
        return false;
      }

      if (
        status &&
        normalize(
          asset.status
        ) !== status
      ) {
        return false;
      }

      return true;
    }
  );
}


/* =========================================================
   EMPTY STATE
========================================================= */

function renderEmptyState() {
  if (!els.rows) {
    return;
  }

  els.rows.innerHTML = `
    <tr>
      <td colspan="8">

        <div class="member-assets-empty">

          <strong>
            No matching assets
          </strong>

          No assets match the current
          search or filters.

        </div>

      </td>
    </tr>
  `;
}


/* =========================================================
   TABLE
========================================================= */

function renderRows() {
  if (!els.rows) {
    return;
  }

  const assets =
    getFilteredAssets();

  if (!assets.length) {
    renderEmptyState();
    return;
  }

  els.rows.innerHTML =
    assets
      .map(
        asset => {

          const statusClass =
            normalize(
              asset.status
            )
              .replace(
                /[^a-z0-9_-]/g,
                ""
              );

          return `
            <tr>

              <td>
                <div class="member-assets-name">
                  ${escapeHtml(
                    asset.asset_name ||
                    "Group Asset"
                  )}
                </div>
              </td>

              <td>
                ${escapeHtml(
                  asset.category ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    asset.acquired_date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    asset.acquisition_cost
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    asset.current_value
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  asset.location ||
                  "—"
                )}
              </td>

              <td>

                <span
                  class="member-assets-status ${escapeHtml(
                    statusClass
                  )}"
                >
                  ${escapeHtml(
                    displayStatus(
                      asset.status
                    )
                  )}
                </span>

              </td>

              <td>

                ${
                  asset.description
                    ? `
                      <div class="member-assets-description">
                        ${escapeHtml(
                          asset.description
                        )}
                      </div>
                    `
                    : "—"
                }

              </td>

            </tr>
          `;
        }
      )
      .join("");
}


/* =========================================================
   LOAD ASSETS
========================================================= */

async function loadAssets() {
  const {
    data,
    error
  } =
    await supabase
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
        created_at
      `)
      .eq(
        "group_id",
        state.groupId
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

  state.assets =
    Array.isArray(data)
      ? data
      : [];
}


/* =========================================================
   FILTER EVENTS
========================================================= */

function bindFilters() {
  els.search?.addEventListener(
    "input",
    renderRows
  );

  els.category?.addEventListener(
    "change",
    renderRows
  );

  els.status?.addEventListener(
    "change",
    renderRows
  );
}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberAssets() {
  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  showLoading();

  try {

    const context =
      await getMyApplicationContext();

    const member =
      context?.member ||
      null;

    const group =
      context?.group ||
      null;

    state.groupId =
      member?.group_id ||
      group?.id ||
      null;

    state.groupName =
      group?.name ||
      "Your Group";

    if (!state.groupId) {
      throw new Error(
        "No group is associated with your member account."
      );
    }

    if (els.groupName) {
      els.groupName.textContent =
        state.groupName;
    }

    await loadAssets();

    renderSummary();

    renderRows();

    bindFilters();

    showContent();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Member Assets",
      error
    );

    showError(
      error?.message ||
      "Unable to load group assets."
    );
  }
}


/* =========================================================
   MODULE STATUS
========================================================= */

console.log(
  "CHAMA LIVE: member-assets.js loaded"
);
