import {
  supabase,
  getMyMember,
  getMyGroupId,
  money
} from "./auth.js";

const state = {
  member: null,
  groupId: null,
  group: null,
  file: null,
  rows: [],
  headers: [],
  staged: [],
  mapping: {},
  results: [],
  imported: [],
  recoveryBatches: [],
  recoveryMode: false,
  step: "upload"
};

const $ = (id) => document.getElementById(id);

function msg(message, type = "info") {
  const element = $("migrationMessage");
  if (!element) return;

  element.className = `notice ${type}`;
  element.textContent = message;
}

function step(name) {
  state.step = name;

  document.querySelectorAll("[data-step]").forEach((element) => {
    element.classList.toggle(
      "active",
      element.dataset.step === name
    );
  });

  document.querySelectorAll("[data-panel]").forEach((element) => {
    element.classList.toggle(
      "hidden",
      element.dataset.panel !== name
    );
  });
}

function setRecoveryLoading(loading) {
  const element = $("recoveryLoading");
  if (!element) return;

  element.classList.toggle("hidden", !loading);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]/g, "");
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/ksh/gi, "")
    .trim();

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function detectEntityType(headers) {
  const normalized = headers.map(normalizeHeader);

  const contributionSignals = [
    "amount",
    "contribution_date",
    "payment_method",
    "mpesa_reference",
    "reference"
  ];

  const expenseSignals = [
    "description",
    "category",
    "expense_date",
    "date",
    "approval_status"
  ];

  const memberSignals = [
    "member_number",
    "phone",
    "email",
    "full_name",
    "name"
  ];

  const contributionScore = contributionSignals.filter((field) =>
    normalized.includes(field)
  ).length;

  const expenseScore = expenseSignals.filter((field) =>
    normalized.includes(field)
  ).length;

  const memberScore = memberSignals.filter((field) =>
    normalized.includes(field)
  ).length;

  if (
    contributionScore >= expenseScore &&
    contributionScore >= memberScore &&
    contributionScore > 0
  ) {
    return "contribution";
  }

  if (
    expenseScore >= contributionScore &&
    expenseScore >= memberScore &&
    expenseScore > 0
  ) {
    return "expense";
  }

  if (memberScore > 0) {
    return "member";
  }

  return null;
}

function duplicateKey(row, entityType) {
  if (entityType === "member") {
    return [
      normalizeValue(row.member_number),
      normalizeValue(row.phone),
      normalizeValue(row.email),
      normalizeValue(row.full_name || row.name)
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
  }

  if (entityType === "expense") {
    return [
      normalizeValue(row.date || row.expense_date),
      normalizeValue(row.description),
      parseAmount(row.amount),
      normalizeValue(row.category)
    ]
      .join("|")
      .toLowerCase();
  }

  throw new Error(`Unsupported migration entity: ${entityType}`);
}

function getMappedValue(row, field) {
  const sourceHeader = state.mapping[field];

  if (!sourceHeader) {
    return "";
  }

  return row[sourceHeader];
}

function buildContribution(row) {
  return {
    amount: parseAmount(
      getMappedValue(row, "amount")
    ),
    contribution_date:
      normalizeValue(
        getMappedValue(row, "contribution_date")
      ) || null,
    contribution_type:
      normalizeValue(
        getMappedValue(row, "contribution_type")
      ) || "monthly",
    payment_method:
      normalizeValue(
        getMappedValue(row, "payment_method")
      ) || "M-Pesa",
    member_id:
      normalizeValue(
        getMappedValue(row, "member_id")
      ) || null,
    reference:
      normalizeValue(
        getMappedValue(row, "reference")
      ) || null,
    mpesa_reference:
      normalizeValue(
        getMappedValue(row, "mpesa_reference")
      ) || null,
    goal_id:
      normalizeValue(
        getMappedValue(row, "goal_id")
      ) || null,
    notes:
      normalizeValue(
        getMappedValue(row, "notes")
      ) || null
  };
}

function buildExpense(row) {
  return {
    date:
      normalizeValue(
        getMappedValue(row, "date")
      ) || null,
    description:
      normalizeValue(
        getMappedValue(row, "description")
      ),
    category:
      normalizeValue(
        getMappedValue(row, "category")
      ),
    amount: parseAmount(
      getMappedValue(row, "amount")
    ),
    approval_status:
      normalizeValue(
        getMappedValue(row, "approval_status")
      ) || "pending"
  };
}

function buildMemberPreview(row) {
  return {
    member_number:
      normalizeValue(
        getMappedValue(row, "member_number")
      ),
    full_name:
      normalizeValue(
        getMappedValue(row, "full_name")
      ) ||
      normalizeValue(
        getMappedValue(row, "name")
      ),
    phone:
      normalizeValue(
        getMappedValue(row, "phone")
      ),
    email:
      normalizeValue(
        getMappedValue(row, "email")
      ),
    role:
      normalizeValue(
        getMappedValue(row, "role")
      ),
    status:
      normalizeValue(
        getMappedValue(row, "status")
      ),
    onboarding_status:
      normalizeValue(
        getMappedValue(row, "onboarding_status")
      )
  };
}

async function context() {
  state.member = await getMyMember();

  if (!state.member) {
    throw new Error(
      "Could not resolve the authenticated member."
    );
  }

  state.groupId = await getMyGroupId();

  if (!state.groupId) {
    throw new Error(
      "Could not resolve the authenticated group."
    );
  }

  const { data, error } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      category,
      country,
      monthly_contribution
    `)
    .eq("id", state.groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.group = data;
}

async function loadRecoverableBatches() {
  if (!state.groupId) {
    return [];
  }

  const { data, error } = await supabase
    .from("data_import_batches")
    .select(`
      id,
      entity_type,
      source_file_name,
      source_type,
      status,
      created_at,
      completed_at,
      failed_at
    `)
    .eq("group_id", state.groupId)
    .in(
      "entity_type",
      ["contribution", "expense", "member"]
    )
    .in(
      "status",
      ["staged", "validated", "importing", "failed"]
    )
    .order("created_at", {
      ascending: false
    })
    .limit(20);

  if (error) {
    throw error;
  }

  state.recoveryBatches = data || [];

  return state.recoveryBatches;
}

function renderRecoveryBatches() {
  const container = $("recoveryList");

  if (!container) {
    return;
  }

  if (!state.recoveryBatches.length) {
    container.innerHTML = `
      <div class="notice info">
        No recoverable migration batches were found.
      </div>
    `;
    return;
  }

  container.innerHTML = state.recoveryBatches
    .map((batch) => {
      const status = escapeHtml(batch.status);
      const entityType = escapeHtml(
        batch.entity_type
      );
      const sourceFile = escapeHtml(
        batch.source_file_name || "Unknown source"
      );

      return `
        <div class="recovery-item">
          <div class="recovery-item-main">
            <strong>${sourceFile}</strong>

            <div class="muted">
              ${entityType}
              · ${status}
              · ${escapeHtml(
                formatDate(batch.created_at)
              )}
            </div>
          </div>

          <button
            type="button"
            class="secondary"
            data-recover-batch="${escapeHtml(batch.id)}"
          >
            Recover
          </button>
        </div>
      `;
    })
    .join("");
}

async function recoverBatch(batchId) {
  if (!batchId) {
    throw new Error(
      "No migration batch was selected."
    );
  }

  if (!state.groupId) {
    throw new Error(
      "Authenticated group context is unavailable."
    );
  }

  const { data: batch, error: batchError } =
    await supabase
      .from("data_import_batches")
      .select("*")
      .eq("id", batchId)
      .eq("group_id", state.groupId)
      .maybeSingle();

  if (batchError) {
    throw batchError;
  }

  if (!batch) {
    throw new Error(
      "The selected migration batch could not be found."
    );
  }

  const { data: rows, error: rowsError } =
    await supabase
      .from("data_import_rows")
      .select("*")
      .eq("batch_id", batchId)
      .order("row_number", {
        ascending: true
      });

  if (rowsError) {
    throw rowsError;
  }

  const { data: mappings, error: mappingsError } =
    await supabase
      .from("data_import_mappings")
      .select("*")
      .eq("batch_id", batchId);

  if (mappingsError) {
    throw mappingsError;
  }

  state.recoveryMode = true;
  state.file = null;

  state.staged = rows || [];
  state.results = rows || [];
  state.imported = rows
    ? rows.filter(
        (row) =>
          row.status === "imported" ||
          row.status === "completed"
      )
    : [];

  state.mapping = {};

  (mappings || []).forEach((mapping) => {
    if (
      mapping.source_column &&
      mapping.target_field
    ) {
      state.mapping[mapping.target_field] =
        mapping.source_column;
    }
  });

  if (batch.entity_type) {
    state.entityType = batch.entity_type;
  }

  renderMapping();
  render();

  step("preview");

  msg(
    `Migration batch recovered: ${
      batch.source_file_name || batch.id
    }.`,
    "success"
  );
}

function renderMapping() {
  const container = $("mappingTable");

  if (!container) {
    return;
  }

  if (!state.headers.length) {
    container.innerHTML = `
      <div class="notice info">
        No source columns are currently loaded.
      </div>
    `;
    return;
  }

  const targetFields = [
    "member_number",
    "full_name",
    "name",
    "phone",
    "email",
    "role",
    "status",
    "onboarding_status",
    "amount",
    "contribution_date",
    "contribution_type",
    "payment_method",
    "member_id",
    "reference",
    "mpesa_reference",
    "goal_id",
    "notes",
    "date",
    "description",
    "category",
    "approval_status"
  ];

  container.innerHTML = `
    <div class="mapping-grid">
      ${targetFields
        .map((field) => {
          const selected =
            state.mapping[field] || "";

          return `
            <label class="mapping-row">
              <span>${escapeHtml(field)}</span>

              <select
                data-map-field="${escapeHtml(field)}"
              >
                <option value="">Not mapped</option>

                ${state.headers
                  .map(
                    (header) => `
                      <option
                        value="${escapeHtml(header)}"
                        ${
                          selected === header
                            ? "selected"
                            : ""
                        }
                      >
                        ${escapeHtml(header)}
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPreview() {
  const container = $("previewTable");

  if (!container) {
    return;
  }

  if (!state.staged.length) {
    container.innerHTML = `
      <div class="notice info">
        No staged rows are available for preview.
      </div>
    `;
    return;
  }

  const rows = state.staged.slice(0, 100);

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Entity</th>
            <th>Status</th>
            <th>Preview</th>
          </tr>
        </thead>

        <tbody>
          ${rows
            .map((row, index) => {
              const status =
                row.status ||
                row.validation_status ||
                "staged";

              return `
                <tr>
                  <td>${index + 1}</td>

                  <td>
                    ${escapeHtml(
                      state.entityType || "—"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(status)}
                  </td>

                  <td>
                    <pre>${escapeHtml(
                      JSON.stringify(
                        row.normalized_data ||
                          row.raw_data ||
                          row,
                        null,
                        2
                      )
                    )}</pre>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function render() {
  renderPreview();

  const groupName = $("migrationGroupName");

  if (groupName && state.group) {
    groupName.textContent =
      state.group.name || "Current Group";
  }

  const entityType = $("migrationEntityType");

  if (entityType && state.entityType) {
    entityType.textContent =
      state.entityType;
  }
}

async function parseCsv(file) {
  const text = await file.text();

  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim());

  if (!lines.length) {
    throw new Error(
      "The selected CSV file is empty."
    );
  }

  const headers = lines[0]
    .split(",")
    .map((header) =>
      header.trim()
    );

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");

    return headers.reduce(
      (result, header, index) => {
        result[header] =
          values[index] === undefined
            ? ""
            : values[index].trim();

        return result;
      },
      {}
    );
  });

  return {
    headers,
    rows
  };
}

function prepareRows(rows) {
  return rows.map((row, index) => ({
    row_number: index + 1,
    raw_data: row,
    normalized_data: row,
    status: "staged"
  }));
}

async function handleFile(file) {
  if (!file) {
    return;
  }

  state.file = file;
  state.recoveryMode = false;

  const parsed = await parseCsv(file);

  state.headers = parsed.headers;
  state.rows = parsed.rows;
  state.staged = prepareRows(parsed.rows);

  state.entityType =
    detectEntityType(state.headers);

  if (!state.entityType) {
    throw new Error(
      "Could not determine whether the file contains members, contributions or expenses."
    );
  }

  state.mapping = {};

  state.headers.forEach((header) => {
    const normalized = normalizeHeader(
      header
    );

    state.mapping[normalized] = header;
  });

  renderMapping();
  render();

  step("mapping");

  msg(
    `${state.rows.length} rows loaded for ${state.entityType} migration. Review the mapping before continuing.`,
    "success"
  );
}

function bind() {
  const fileInput = $("migrationFile");

  if (fileInput) {
    fileInput.addEventListener(
      "change",
      async (event) => {
        try {
          const file =
            event.target.files?.[0];

          await handleFile(file);
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Could not process the selected file.",
            "error"
          );
        }
      }
    );
  }

  const loadRecoveryButton =
    $("loadRecovery");

  if (loadRecoveryButton) {
    loadRecoveryButton.addEventListener(
      "click",
      async () => {
        try {
          setRecoveryLoading(true);

          await loadRecoverableBatches();

          renderRecoveryBatches();

          msg(
            "Recoverable migration batches loaded.",
            "success"
          );
        } catch (error) {
          console.error(error);

          renderRecoveryBatches();

          msg(
            error.message ||
              "Could not load recoverable batches.",
            "error"
          );
        } finally {
          setRecoveryLoading(false);
        }
      }
    );
  }

  const recoveryList =
    $("recoveryList");

  if (recoveryList) {
    recoveryList.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target.closest(
            "[data-recover-batch]"
          );

        if (!button) {
          return;
        }

        try {
          await recoverBatch(
            button.dataset.recoverBatch
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Could not recover the selected migration batch.",
            "error"
          );
        }
      }
    );
  }

  const mappingTable =
    $("mappingTable");

  if (mappingTable) {
    mappingTable.addEventListener(
      "change",
      (event) => {
        const field =
          event.target.dataset.mapField;

        if (!field) {
          return;
        }

        state.mapping[field] =
          event.target.value;

        renderPreview();
      }
    );
  }

  const nextButton =
    $("continueToPreview");

  if (nextButton) {
    nextButton.addEventListener(
      "click",
      () => {
        state.staged =
          state.rows.map((row, index) => {
            let normalized;

            if (
              state.entityType ===
              "contribution"
            ) {
              normalized =
                buildContribution(row);
            } else if (
              state.entityType ===
              "expense"
            ) {
              normalized =
                buildExpense(row);
            } else {
              normalized =
                buildMemberPreview(row);
            }

            return {
              row_number: index + 1,
              raw_data: row,
              normalized_data:
                normalized,
              status: "staged"
            };
          });

        renderPreview();

        step("preview");

        msg(
          "Preview generated. No member target rows are written from this screen.",
          "success"
        );
      }
    );
  }

  const backButton =
    $("backToMapping");

  if (backButton) {
    backButton.addEventListener(
      "click",
      () => {
        step("mapping");
      }
    );
  }

  const refreshRecovery =
    $("refreshRecovery");

  if (refreshRecovery) {
    refreshRecovery.addEventListener(
      "click",
      async () => {
        try {
          setRecoveryLoading(true);

          await loadRecoverableBatches();

          renderRecoveryBatches();

          msg(
            "Recoverable migration batches refreshed.",
            "success"
          );
        } catch (error) {
          console.error(error);

          renderRecoveryBatches();

          msg(
            error.message ||
              "Could not refresh recoverable batches.",
            "error"
          );
        } finally {
          setRecoveryLoading(false);
        }
      }
    );
  }
}

async function init() {
  try {
    step("upload");

    await context();

    bind();

    try {
      setRecoveryLoading(true);

      await loadRecoverableBatches();

      renderRecoveryBatches();
    } catch (recoveryError) {
      console.warn(
        "Recovery batch lookup unavailable:",
        recoveryError
      );

      renderRecoveryBatches();
    } finally {
      setRecoveryLoading(false);
    }

    render();

    msg(
      "Authenticated group context resolved. Contributions and expenses can be imported after validation and explicit confirmation. Members can be mapped, validated and previewed only; no member target write is permitted.",
      "success"
    );
  } catch (error) {
    console.error(error);

    msg(
      error.message ||
        "Could not initialize Data Migration.",
      "error"
    );
  }
}

init();
