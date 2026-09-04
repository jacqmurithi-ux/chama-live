/* =========================================================
   CHAMA LIVE — DATA MIGRATION
   COMPLETE CANDIDATE
   =========================================================

   PURPOSE
   ---------------------------------------------------------
   Controlled migration of:

     1. Contributions
     2. Expenses

   Workflow:

     Upload
        ↓
     Map
        ↓
     Stage
        ↓
     Validate
        ↓
     Preview
        ↓
     Explicit Confirmation
        ↓
     Import
        ↓
     Verify

   IMPORTANT SAFETY RULES
   ---------------------------------------------------------
   - Production schema is NOT modified by this file.
   - No financial periods are created.
   - Closed periods cannot be bypassed.
   - contribution_allocations are NEVER inserted directly.
   - contribution_obligations are NEVER inserted directly.
   - Contributions use canonical:
       cl_2b_record_contribution(...)
   - Group identity comes from authenticated context.
   - No group_id is accepted from URL/localStorage/forms.
   - No service-role key is used.
   - Historical data does NOT bypass financial controls.
   - Only contributions and expenses may be imported.
   - Other entity types are rejected.
   - Import confirmation is explicit.
   - Post-import verification is mandatory.

   ========================================================= */

import {
  supabase,
  getMyMember,
  getMyGroupId,
  money
} from "./auth.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const ALLOWED_ENTITY_TYPES = [
  "contribution",
  "expense"
];

const ALLOWED_SOURCE_TYPES = [
  "csv",
  "xlsx"
];

const CONTRIBUTION_TYPES = [
  "monthly"
];

const PAYMENT_METHODS = [
  "M-Pesa",
  "Cash",
  "Bank transfer"
];

const EXPENSE_CATEGORIES = [
  "meeting",
  "welfare",
  "transport",
  "food",
  "supplies",
  "bank_charges",
  "admin",
  "other"
];

const EXPENSE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected"
];

const MAPPING_TYPES = [
  "direct",
  "member_match",
  "date_parse",
  "amount_parse",
  "month_to_date",
  "constant",
  "ignore",
  "custom"
];


/* =========================================================
   STATE
========================================================= */

const state = {
  user: null,
  member: null,
  groupId: null,

  file: null,
  sourceType: null,
  sourceName: null,

  sheetName: null,

  headers: [],
  sourceRows: [],

  entityType: "contribution",

  mappings: {},

  batchId: null,

  stagedRows: [],
  validationRows: [],

  validated: false,
  ready: false,
  confirmed: false,
  importing: false,

  importedCount: 0,
  failedCount: 0,

  importResults: []
};


/* =========================================================
   DOM HELPERS
========================================================= */

function $(selector) {
  return document.querySelector(selector);
}


function $all(selector) {
  return Array.from(
    document.querySelectorAll(selector)
  );
}


function setText(selector, value) {

  const element = $(selector);

  if (element) {
    element.textContent =
      value == null
        ? ""
        : String(value);
  }

}


function show(selector) {

  const element = $(selector);

  if (element) {
    element.hidden = false;
  }

}


function hide(selector) {

  const element = $(selector);

  if (element) {
    element.hidden = true;
  }

}


function setDisabled(selector, disabled) {

  const element = $(selector);

  if (element) {
    element.disabled = Boolean(disabled);
  }

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   STATUS / MESSAGE
========================================================= */

function showMessage(
  message,
  type = "info"
) {

  const element =
    $("#migrationMessage") ||
    $("#message") ||
    $(".migration-message");

  if (!element) {
    console[type === "error" ? "error" : "log"](
      message
    );
    return;
  }

  element.textContent = message;

  element.dataset.type = type;

  element.hidden = false;
}


function clearMessage() {

  const element =
    $("#migrationMessage") ||
    $("#message") ||
    $(".migration-message");

  if (element) {
    element.textContent = "";
    element.hidden = true;
    delete element.dataset.type;
  }

}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);


async function initialize() {

  try {

    showMessage(
      "Loading your group migration context...",
      "info"
    );

    state.member =
      await getMyMember();

    state.groupId =
      await getMyGroupId();

    if (!state.member?.id) {
      throw new Error(
        "Your member account could not be resolved."
      );
    }

    if (!state.groupId) {
      throw new Error(
        "Your group could not be resolved."
      );
    }

    bindEvents();

    updateEntityUI();

    updateStepUI(1);

    clearMessage();

  }
  catch (error) {

    console.error(
      "DATA MIGRATION INITIALIZATION ERROR",
      error
    );

    showMessage(
      error?.message ||
      "Unable to initialize Data Migration.",
      "error"
    );

  }

}


/* =========================================================
   EVENT BINDING
========================================================= */

function bindEvents() {

  const fileInput =
    $("#fileInput") ||
    $("#migrationFile");

  if (fileInput) {

    fileInput.addEventListener(
      "change",
      handleFileSelection
    );

  }


  const entitySelect =
    $("#entityType") ||
    $("#migrationEntityType");

  if (entitySelect) {

    entitySelect.addEventListener(
      "change",
      () => {

        state.entityType =
          entitySelect.value;

        updateEntityUI();

        if (state.sourceRows.length) {
          buildMappingUI();
        }

      }
    );

  }


  const validateButton =
    $("#validateButton") ||
    $("#validateImport");

  if (validateButton) {

    validateButton.addEventListener(
      "click",
      validateMigration
    );

  }


  const confirmCheckbox =
    $("#confirmImport") ||
    $("#explicitConfirmation");

  if (confirmCheckbox) {

    confirmCheckbox.addEventListener(
      "change",
      () => {

        state.confirmed =
          Boolean(confirmCheckbox.checked);

        updateImportButton();

      }
    );

  }


  const importButton =
    $("#importButton") ||
    $("#executeImport");

  if (importButton) {

    importButton.addEventListener(
      "click",
      executeImport
    );

  }


  const resetButton =
    $("#resetButton") ||
    $("#resetMigration");

  if (resetButton) {

    resetButton.addEventListener(
      "click",
      resetMigration
    );

  }

}


/* =========================================================
   ENTITY UI
========================================================= */

function updateEntityUI() {

  const entity =
    state.entityType;

  const label =
    entity === "expense"
      ? "Expenses"
      : "Contributions";

  setText(
    "#selectedEntityLabel",
    label
  );

  setText(
    "#entityDescription",
    entity === "expense"
      ? "Import expense records only."
      : "Import contribution payment records through the canonical 2B accounting path."
  );

}


/* =========================================================
   FILE SELECTION
========================================================= */

async function handleFileSelection(event) {

  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  try {

    clearMessage();

    resetFileState();

    state.file = file;

    state.sourceName =
      file.name;

    state.sourceType =
      detectSourceType(file);

    if (
      !ALLOWED_SOURCE_TYPES.includes(
        state.sourceType
      )
    ) {

      throw new Error(
        "Only CSV and XLSX files are supported."
      );

    }

    setText(
      "#fileName",
      file.name
    );

    setText(
      "#fileSize",
      formatBytes(file.size)
    );

    showMessage(
      "Reading file...",
      "info"
    );

    const parsed =
      await parseFile(file);

    if (
      !parsed ||
      !Array.isArray(parsed.rows) ||
      parsed.rows.length === 0
    ) {

      throw new Error(
        "The selected file contains no usable data rows."
      );

    }

    state.headers =
      parsed.headers;

    state.sourceRows =
      parsed.rows;

    state.sheetName =
      parsed.sheetName || null;

    await createBatch();

    await stageRows();

    buildMappingUI();

    updatePreviewStats();

    updateStepUI(2);

    showMessage(
      `File loaded successfully: ${state.sourceRows.length} data row(s).`,
      "success"
    );

  }
  catch (error) {

    console.error(
      "FILE IMPORT ERROR",
      error
    );

    resetFileState();

    showMessage(
      error?.message ||
      "Unable to read the selected file.",
      "error"
    );

  }

}


/* =========================================================
   SOURCE TYPE
========================================================= */

function detectSourceType(file) {

  const name =
    String(file.name || "")
      .toLowerCase();

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return "xlsx";
  }

  if (
    name.endsWith(".csv")
  ) {
    return "csv";
  }

  return null;
}


/* =========================================================
   FILE PARSING
========================================================= */

async function parseFile(file) {

  if (
    state.sourceType === "csv"
  ) {

    return parseCsvFile(file);

  }

  if (
    state.sourceType === "xlsx"
  ) {

    return parseXlsxFile(file);

  }

  throw new Error(
    "Unsupported file type."
  );

}


/* =========================================================
   CSV PARSER
========================================================= */

async function parseCsvFile(file) {

  const text =
    await file.text();

  const lines =
    splitCsvLines(text);

  if (!lines.length) {
    throw new Error(
      "CSV file is empty."
    );
  }

  const rows =
    lines.map(parseCsvLine);

  const headers =
    rows.shift()
      .map(normalizeHeader)
      .filter(Boolean);

  if (!headers.length) {
    throw new Error(
      "CSV file has no usable column headers."
    );
  }

  const dataRows =
    rows
      .filter(row =>
        row.some(
          value =>
            String(value ?? "").trim() !== ""
        )
      )
      .map(row => {

        const object = {};

        headers.forEach(
          (header, index) => {

            object[header] =
              row[index] ?? "";

          }
        );

        return object;

      });

  return {
    headers,
    rows: dataRows,
    sheetName: null
  };

}


/* =========================================================
   CSV LINE SPLITTING
========================================================= */

function splitCsvLines(text) {

  const lines = [];

  let current = "";
  let quoted = false;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char =
      text[i];

    const next =
      text[i + 1];

    if (
      char === '"' &&
      quoted &&
      next === '"'
    ) {

      current += '""';

      i++;

      continue;
    }

    if (char === '"') {

      quoted = !quoted;

      current += char;

      continue;
    }

    if (
      (char === "\n" || char === "\r") &&
      !quoted
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {
        i++;
      }

      lines.push(current);

      current = "";

      continue;
    }

    current += char;

  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}


/* =========================================================
   CSV LINE PARSER
========================================================= */

function parseCsvLine(line) {

  const values = [];

  let value = "";

  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {

    const char =
      line[i];

    const next =
      line[i + 1];

    if (
      char === '"' &&
      quoted &&
      next === '"'
    ) {

      value += '"';

      i++;

      continue;
    }

    if (char === '"') {

      quoted = !quoted;

      continue;
    }

    if (
      char === "," &&
      !quoted
    ) {

      values.push(value);

      value = "";

      continue;
    }

    value += char;

  }

  values.push(value);

  return values;
}


/* =========================================================
   XLSX PARSER
========================================================= */

async function parseXlsxFile(file) {

  const XLSX =
    await loadXlsxLibrary();

  const buffer =
    await file.arrayBuffer();

  const workbook =
    XLSX.read(
      buffer,
      {
        type: "array",
        cellDates: true
      }
    );

  if (
    !workbook.SheetNames?.length
  ) {

    throw new Error(
      "The XLSX workbook contains no sheets."
    );

  }

  const sheetName =
    workbook.SheetNames[0];

  const sheet =
    workbook.Sheets[sheetName];

  const matrix =
    XLSX.utils.sheet_to_json(
      sheet,
      {
        header: 1,
        defval: "",
        raw: false
      }
    );

  if (
    !Array.isArray(matrix) ||
    matrix.length < 2
  ) {

    throw new Error(
      "The selected XLSX sheet contains no usable data."
    );

  }

  const headers =
    matrix[0]
      .map(normalizeHeader)
      .filter(Boolean);

  const rows =
    matrix
      .slice(1)
      .filter(row =>
        row.some(
          value =>
            String(value ?? "").trim() !== ""
        )
      )
      .map(row => {

        const object = {};

        headers.forEach(
          (header, index) => {

            object[header] =
              row[index] ?? "";

          }
        );

        return object;

      });

  return {
    headers,
    rows,
    sheetName
  };

}


/* =========================================================
   XLSX LIBRARY
========================================================= */

let xlsxPromise = null;

async function loadXlsxLibrary() {

  if (xlsxPromise) {
    return xlsxPromise;
  }

  xlsxPromise =
    import(
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm"
    );

  return xlsxPromise;
}


/* =========================================================
   HEADER NORMALIZATION
========================================================= */

function normalizeHeader(value) {

  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

}


/* =========================================================
   CREATE STAGING BATCH
========================================================= */

async function createBatch() {

  if (!state.groupId) {
    throw new Error(
      "Authenticated group context is unavailable."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from("data_import_batches")
    .insert({
      group_id: state.groupId,
      source_name: state.sourceName,
      source_type: state.sourceType,
      status: "uploaded",
      summary: {
        entity_type:
          state.entityType,
        source_name:
          state.sourceName,
        source_type:
          state.sourceType,
        row_count:
          state.sourceRows.length
      }
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error(
      "Migration batch could not be created."
    );
  }

  state.batchId =
    data.id;

}


/* =========================================================
   UPDATE BATCH STATUS
========================================================= */

async function updateBatchStatus(
  status,
  summary = {}
) {

  if (!state.batchId) {
    return;
  }

  const {
    error
  } = await supabase
    .from("data_import_batches")
    .update({
      status,
      summary: {
        ...summary,
        entity_type:
          state.entityType,
        source_name:
          state.sourceName,
        source_type:
          state.sourceType
      }
    })
    .eq(
      "id",
      state.batchId
    );

  if (error) {
    throw error;
  }

}


/* =========================================================
   STAGE SOURCE ROWS
========================================================= */

async function stageRows() {

  if (!state.batchId) {
    throw new Error(
      "Migration batch does not exist."
    );
  }

  await updateBatchStatus(
    "analyzing",
    {
      row_count:
        state.sourceRows.length
    }
  );

  const payload =
    state.sourceRows.map(
      (row, index) => ({
        batch_id:
          state.batchId,

        source_sheet:
          state.sheetName,

        source_row_number:
          index + 2,

        entity_type:
          state.entityType,

        raw_data:
          row,

        normalized_data:
          null,

        status:
          "pending"
      })
    );

  const chunkSize = 500;

  for (
    let start = 0;
    start < payload.length;
    start += chunkSize
  ) {

    const chunk =
      payload.slice(
        start,
        start + chunkSize
      );

    const {
      error
    } = await supabase
      .from("data_import_rows")
      .insert(chunk);

    if (error) {
      throw error;
    }

  }

  const {
    data,
    error
  } = await supabase
    .from("data_import_rows")
    .select(`
      id,
      batch_id,
      source_sheet,
      source_row_number,
      entity_type,
      raw_data,
      normalized_data,
      status,
      error_message,
      target_id
    `)
    .eq(
      "batch_id",
      state.batchId
    )
    .order(
      "source_row_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  state.stagedRows =
    data || [];

}


/* =========================================================
   MAPPING UI
========================================================= */

function buildMappingUI() {

  const container =
    $("#mappingFields") ||
    $("#mappingContainer") ||
    $("#mappingTable");

  if (!container) {
    return;
  }

  const fields =
    state.entityType === "contribution"
      ? contributionMappingFields()
      : expenseMappingFields();

  container.innerHTML = fields
    .map(field => {

      const selected =
        autoMapField(field);

      state.mappings[field.key] =
        selected;

      return `
        <div class="mapping-row">
          <label>
            <span>${escapeHtml(field.label)}</span>

            <select
              data-target-field="${escapeHtml(field.key)}"
              class="mapping-select"
            >

              <option value="">
                -- Not mapped --
              </option>

              ${state.headers
                .map(header => `
                  <option
                    value="${escapeHtml(header)}"
                    ${selected === header ? "selected" : ""}
                  >
                    ${escapeHtml(header)}
                  </option>
                `)
                .join("")}

            </select>
          </label>
        </div>
      `;

    })
    .join("");

  $all(".mapping-select")
    .forEach(select => {

      select.addEventListener(
        "change",
        event => {

          const field =
            event.target.dataset.targetField;

          state.mappings[field] =
            event.target.value || null;

        }
      );

    });

  show(
    "#mappingSection"
  );

}


/* =========================================================
   CONTRIBUTION MAPPING FIELDS
========================================================= */

function contributionMappingFields() {

  return [
    {
      key: "member",
      label: "Member",
      required: true
    },
    {
      key: "amount",
      label: "Amount",
      required: true
    },
    {
      key: "contribution_date",
      label: "Contribution Date",
      required: true
    },
    {
      key: "payment_method",
      label: "Payment Method",
      required: true
    },
    {
      key: "contribution_type",
      label: "Contribution Type",
      required: false
    },
    {
      key: "reference",
      label: "Reference",
      required: false
    },
    {
      key: "mpesa_reference",
      label: "M-Pesa Reference",
      required: false
    },
    {
      key: "goal",
      label: "Goal",
      required: false
    },
    {
      key: "notes",
      label: "Notes",
      required: false
    },
    {
      key: "month",
      label: "Source Month",
      required: false
    }
  ];

}


/* =========================================================
   EXPENSE MAPPING FIELDS
========================================================= */

function expenseMappingFields() {

  return [
    {
      key: "description",
      label: "Description",
      required: true
    },
    {
      key: "amount",
      label: "Amount",
      required: true
    },
    {
      key: "date",
      label: "Expense Date",
      required: true
    },
    {
      key: "category",
      label: "Category",
      required: false
    },
    {
      key: "approval_status",
      label: "Approval Status",
      required: false
    },
    {
      key: "receipt_url",
      label: "Receipt URL",
      required: false
    }
  ];

}


/* =========================================================
   AUTO MAPPING
========================================================= */

function autoMapField(field) {

  const aliases = {
    member: [
      "member",
      "member_name",
      "name",
      "member_number",
      "membership_number",
      "phone",
      "email"
    ],

    amount: [
      "amount",
      "contribution_amount",
      "expense_amount",
      "paid",
      "payment",
      "value"
    ],

    contribution_date: [
      "contribution_date",
      "payment_date",
      "date",
      "transaction_date"
    ],

    payment_method: [
      "payment_method",
      "method",
      "payment_mode"
    ],

    contribution_type: [
      "contribution_type",
      "type"
    ],

    reference: [
      "reference",
      "transaction_reference",
      "receipt_number"
    ],

    mpesa_reference: [
      "mpesa_reference",
      "mpesa_code",
      "mpesa",
      "mpesa_receipt"
    ],

    goal: [
      "goal",
      "goal_name",
      "contribution_goal"
    ],

    notes: [
      "notes",
      "note",
      "remarks",
      "comment"
    ],

    month: [
      "month",
      "contribution_month",
      "payment_month"
    ],

    description: [
      "description",
      "expense",
      "expense_description",
      "details",
      "particulars"
    ],

    date: [
      "date",
      "expense_date",
      "transaction_date"
    ],

    category: [
      "category",
      "expense_category"
    ],

    approval_status: [
      "approval_status",
      "status"
    ],

    receipt_url: [
      "receipt_url",
      "receipt",
      "receipt_link"
    ]
  };

  const candidates =
    aliases[field.key] || [];

  for (
    const candidate of candidates
  ) {

    if (
      state.headers.includes(
        candidate
      )
    ) {

      return candidate;

    }

  }

  return null;
}


/* =========================================================
   VALIDATION
========================================================= */

async function validateMigration() {

  if (!state.batchId) {

    showMessage(
      "Load a file before validating.",
      "error"
    );

    return;

  }

  try {

    setValidationBusy(true);

    clearMessage();

    state.validated = false;
    state.ready = false;

    await updateBatchStatus(
      "validating"
    );

    const mappingErrors =
      validateRequiredMappings();

    if (mappingErrors.length) {

      await markAllRowsError(
        mappingErrors.join("; ")
      );

      throw new Error(
        mappingErrors.join(" ")
      );

    }

    const rows =
      [];

    for (
      const stagedRow of state.stagedRows
    ) {

      const result =
        state.entityType === "contribution"
          ? await validateContributionRow(
              stagedRow
            )
          : await validateExpenseRow(
              stagedRow
            );

      rows.push(result);

    }

    state.validationRows =
      rows;

    await persistValidationResults();

    const summary =
      buildValidationSummary();

    state.validated = true;

    state.ready =
      summary.errors === 0 &&
      summary.valid +
      summary.warnings ===
      summary.total;

    await updateBatchStatus(
      state.ready
        ? "ready"
        : "validating",
      summary
    );

    renderValidationSummary(
      summary
    );

    renderValidationRows(
      rows
    );

    updateStepUI(
      state.ready ? 4 : 3
    );

    updateImportButton();

    if (state.ready) {

      showMessage(
        "Validation passed. The batch is ready for explicit confirmation.",
        "success"
      );

    }
    else {

      showMessage(
        "Validation found blocking errors. No records can be imported.",
        "error"
      );

    }

  }
  catch (error) {

    console.error(
      "VALIDATION ERROR",
      error
    );

    showMessage(
      error?.message ||
      "Validation failed.",
      "error"
    );

  }
  finally {

    setValidationBusy(false);

  }

}


/* =========================================================
   REQUIRED MAPPINGS
========================================================= */

function validateRequiredMappings() {

  const required =
    state.entityType === "contribution"
      ? [
          "member",
          "amount",
          "contribution_date",
          "payment_method"
        ]
      : [
          "description",
          "amount",
          "date"
        ];

  const errors = [];

  for (
    const field of required
  ) {

    if (
      !state.mappings[field]
    ) {

      errors.push(
        `Required field "${field}" is not mapped.`
      );

    }

  }

  return errors;
}


/* =========================================================
   CONTRIBUTION VALIDATION
========================================================= */

async function validateContributionRow(
  stagedRow
) {

  const raw =
    stagedRow.raw_data || {};

  const errors = [];
  const warnings = [];

  const normalized = {};

  /* -------------------------------------------------------
     MEMBER
  ------------------------------------------------------- */

  const memberIdentifier =
    getMappedValue(
      raw,
      "member"
    );

  if (
    !String(memberIdentifier ?? "").trim()
  ) {

    errors.push(
      "Member identifier is required."
    );

  }
  else {

    const member =
      await resolveMember(
        memberIdentifier
      );

    if (!member) {

      errors.push(
        `Member "${memberIdentifier}" could not be resolved within the current group.`
      );

    }
    else {

      normalized.member_id =
        member.id;

      normalized.member_name =
        member.name ||
        memberIdentifier;

    }

  }


  /* -------------------------------------------------------
     AMOUNT
  ------------------------------------------------------- */

  const amountValue =
    getMappedValue(
      raw,
      "amount"
    );

  const amount =
    parseAmount(
      amountValue
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    errors.push(
      "Contribution amount must be a number greater than zero."
    );

  }
  else {

    normalized.amount =
      amount;

  }


  /* -------------------------------------------------------
     CONTRIBUTION DATE
  ------------------------------------------------------- */

  const dateValue =
    getMappedValue(
      raw,
      "contribution_date"
    );

  const contributionDate =
    parseDate(
      dateValue
    );

  if (!contributionDate) {

    errors.push(
      "Contribution date is required and must be a valid date."
    );

  }
  else {

    normalized.contribution_date =
      contributionDate;

  }


  /* -------------------------------------------------------
     PAYMENT METHOD
  ------------------------------------------------------- */

  const paymentMethod =
    normalizePaymentMethod(
      getMappedValue(
        raw,
        "payment_method"
      )
    );

  if (
    !PAYMENT_METHODS.includes(
      paymentMethod
    )
  ) {

    errors.push(
      `Invalid payment method. Allowed values: ${PAYMENT_METHODS.join(", ")}.`
    );

  }
  else {

    normalized.payment_method =
      paymentMethod;

  }


  /* -------------------------------------------------------
     CONTRIBUTION TYPE
  ------------------------------------------------------- */

  let contributionType =
    String(
      getMappedValue(
        raw,
        "contribution_type"
      ) || ""
    )
      .trim()
      .toLowerCase();

  if (!contributionType) {

    contributionType =
      "monthly";

    warnings.push(
      "Contribution type omitted; monthly will be used."
    );

  }

  if (
    !CONTRIBUTION_TYPES.includes(
      contributionType
    )
  ) {

    errors.push(
      "Only monthly contributions are supported by the live canonical contribution function."
    );

  }

  normalized.contribution_type =
    contributionType;


  /* -------------------------------------------------------
     REFERENCE
  ------------------------------------------------------- */

  const reference =
    cleanNullable(
      getMappedValue(
        raw,
        "reference"
      )
    );

  normalized.reference =
    reference;


  /* -------------------------------------------------------
     M-PESA REFERENCE
  ------------------------------------------------------- */

  const mpesaReference =
    cleanNullable(
      getMappedValue(
        raw,
        "mpesa_reference"
      )
    );

  if (
    paymentMethod === "M-Pesa"
  ) {

    if (
      reference &&
      mpesaReference &&
      reference !== mpesaReference
    ) {

      errors.push(
        "Reference and M-Pesa reference do not match."
      );

    }

    normalized.mpesa_reference =
      mpesaReference || reference;

  }
  else {

    if (mpesaReference) {

      errors.push(
        "M-Pesa reference cannot be supplied for a non-M-Pesa payment."
      );

    }

    normalized.mpesa_reference =
      null;

  }


  /* -------------------------------------------------------
     GOAL
  ------------------------------------------------------- */

  const goalValue =
    cleanNullable(
      getMappedValue(
        raw,
        "goal"
      )
    );

  if (goalValue) {

    const goal =
      await resolveGoal(
        goalValue
      );

    if (!goal) {

      errors.push(
        `Contribution goal "${goalValue}" could not be resolved within the current group.`
      );

    }
    else {

      normalized.goal_id =
        goal.id;

    }

  }
  else {

    normalized.goal_id =
      null;

  }


  /* -------------------------------------------------------
     NOTES
  ------------------------------------------------------- */

  normalized.notes =
    cleanNullable(
      getMappedValue(
        raw,
        "notes"
      )
    );


  /* -------------------------------------------------------
     SOURCE MONTH
     -------------------------------------------------------
     Month is derived from contribution_date.

     If source also supplies month, it must agree.
  ------------------------------------------------------- */

  const sourceMonth =
    cleanNullable(
      getMappedValue(
        raw,
        "month"
      )
    );

  const derivedMonth =
    contributionDate
      ? contributionDate.slice(
          0,
          7
        )
      : null;

  if (
    sourceMonth &&
    derivedMonth
  ) {

    const normalizedSourceMonth =
      normalizeMonth(
        sourceMonth
      );

    if (
      !normalizedSourceMonth ||
      normalizedSourceMonth !==
        derivedMonth
    ) {

      errors.push(
        `Source month "${sourceMonth}" does not agree with contribution date "${contributionDate}".`
      );

    }

  }

  normalized.month =
    derivedMonth;


  /* -------------------------------------------------------
     FINANCIAL PERIOD
  ------------------------------------------------------- */

  if (
    normalized.month &&
    normalized.group_id !== false
  ) {

    const period =
      await getFinancialPeriod(
        normalized.month
      );

    if (!period) {

      errors.push(
        `Financial period ${normalized.month} does not exist for this group.`
      );

    }
    else if (
      String(period.status)
        .toLowerCase() ===
      "closed"
    ) {

      errors.push(
        `Financial period ${normalized.month} is closed.`
      );

    }

  }


  /* -------------------------------------------------------
     DUPLICATE CHECK
  ------------------------------------------------------- */

  if (
    errors.length === 0
  ) {

    const duplicate =
      await detectContributionDuplicate(
        normalized
      );

    if (duplicate) {

      errors.push(
        duplicate
      );

    }

  }


  const status =
    errors.length
      ? "error"
      : warnings.length
        ? "warning"
        : "valid";

  return {
    staged_id:
      stagedRow.id,

    source_row_number:
      stagedRow.source_row_number,

    status,

    errors,

    warnings,

    normalized_data:
      normalized,

    error_message:
      [
        ...errors,
        ...warnings
      ].join(" ")
  };

}


/* =========================================================
   EXPENSE VALIDATION
========================================================= */

async function validateExpenseRow(
  stagedRow
) {

  const raw =
    stagedRow.raw_data || {};

  const errors = [];
  const warnings = [];

  const normalized = {};


  /* -------------------------------------------------------
     DESCRIPTION
  ------------------------------------------------------- */

  const description =
    String(
      getMappedValue(
        raw,
        "description"
      ) ?? ""
    ).trim();

  if (!description) {

    errors.push(
      "Expense description is required."
    );

  }
  else {

    normalized.description =
      description;

  }


  /* -------------------------------------------------------
     AMOUNT
  ------------------------------------------------------- */

  const amount =
    parseAmount(
      getMappedValue(
        raw,
        "amount"
      )
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    errors.push(
      "Expense amount must be a number greater than zero."
    );

  }
  else {

    normalized.amount =
      amount;

  }


  /* -------------------------------------------------------
     DATE
  ------------------------------------------------------- */

  const expenseDate =
    parseDate(
      getMappedValue(
        raw,
        "date"
      )
    );

  if (!expenseDate) {

    errors.push(
      "Expense date is required and must be valid."
    );

  }
  else {

    normalized.date =
      expenseDate;

  }


  /* -------------------------------------------------------
     CATEGORY
  ------------------------------------------------------- */

  let category =
    String(
      getMappedValue(
        raw,
        "category"
      ) || ""
    )
      .trim()
      .toLowerCase();

  if (!category) {

    category =
      "other";

    warnings.push(
      "Expense category omitted; other will be used."
    );

  }

  if (
    !EXPENSE_CATEGORIES.includes(
      category
    )
  ) {

    errors.push(
      `Invalid expense category "${category}".`
    );

  }

  normalized.category =
    category;


  /* -------------------------------------------------------
     APPROVAL STATUS
  ------------------------------------------------------- */

  let approvalStatus =
    String(
      getMappedValue(
        raw,
        "approval_status"
      ) || ""
    )
      .trim()
      .toLowerCase();

  if (!approvalStatus) {

    approvalStatus =
      "pending";

    warnings.push(
      "Approval status omitted; pending will be used."
    );

  }

  if (
    !EXPENSE_APPROVAL_STATUSES.includes(
      approvalStatus
    )
  ) {

    errors.push(
      `Invalid approval status "${approvalStatus}".`
    );

  }

  normalized.approval_status =
    approvalStatus;


  /* -------------------------------------------------------
     RECEIPT URL
  ------------------------------------------------------- */

  const receiptUrl =
    cleanNullable(
      getMappedValue(
        raw,
        "receipt_url"
      )
    );

  if (
    receiptUrl &&
    !looksLikeSafeUrl(
      receiptUrl
    )
  ) {

    errors.push(
      "Receipt URL is not a valid HTTP(S) URL."
    );

  }

  normalized.receipt_url =
    receiptUrl;


  /* -------------------------------------------------------
     FINANCIAL PERIOD
  ------------------------------------------------------- */

  const month =
    expenseDate
      ? expenseDate.slice(
          0,
          7
        )
      : null;

  normalized.month =
    month;

  if (month) {

    const period =
      await getFinancialPeriod(
        month
      );

    if (!period) {

      errors.push(
        `Financial period ${month} does not exist for this group.`
      );

    }
    else if (
      String(period.status)
        .toLowerCase() ===
      "closed"
    ) {

      errors.push(
        `Financial period ${month} is closed.`
      );

    }

  }


  /* -------------------------------------------------------
     DUPLICATE / LIKELY DUPLICATE
  ------------------------------------------------------- */

  if (
    errors.length === 0
  ) {

    const duplicate =
      await detectExpenseDuplicate(
        normalized
      );

    if (duplicate) {

      warnings.push(
        duplicate
      );

    }

  }


  const status =
    errors.length
      ? "error"
      : warnings.length
        ? "warning"
        : "valid";

  return {
    staged_id:
      stagedRow.id,

    source_row_number:
      stagedRow.source_row_number,

    status,

    errors,

    warnings,

    normalized_data:
      normalized,

    error_message:
      [
        ...errors,
        ...warnings
      ].join(" ")
  };

}


/* =========================================================
   MAPPED VALUE
========================================================= */

function getMappedValue(
  raw,
  targetField
) {

  const sourceColumn =
    state.mappings[targetField];

  if (!sourceColumn) {
    return null;
  }

  return raw?.[sourceColumn];
}


/* =========================================================
   MEMBER RESOLUTION
========================================================= */

async function resolveMember(
  identifier
) {

  const value =
    String(
      identifier ?? ""
    ).trim();

  if (!value) {
    return null;
  }

  /*
   * IMPORTANT:
   * Every lookup is constrained to the authenticated
   * group. No client-supplied group ID is accepted.
   */

  const columns = [
    "id",
    "group_id",
    "member_number",
    "membership_number",
    "name",
    "phone",
    "email",
    "status"
  ];

  const fields =
    [
      ["member_number", value],
      ["membership_number", value],
      ["phone", value],
      ["email", value]
    ];

  for (
    const [
      field,
      candidate
    ] of fields
  ) {

    const {
      data,
      error
    } = await supabase
      .from("members")
      .select(columns.join(","))
      .eq(
        "group_id",
        state.groupId
      )
      .eq(
        field,
        candidate
      )
      .limit(2);

    if (error) {
      throw error;
    }

    if (
      data?.length === 1
    ) {

      return data[0];

    }

    if (
      data?.length > 1
    ) {

      throw new Error(
        `Multiple members matched ${field} "${candidate}".`
      );

    }

  }


  /*
   * Exact normalized name lookup.
   *
   * Deliberately no fuzzy matching.
   */

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(columns.join(","))
    .eq(
      "group_id",
      state.groupId
    )
    .ilike(
      "name",
      value
    )
    .limit(2);

  if (error) {
    throw error;
  }

  if (
    data?.length === 1
  ) {

    return data[0];

  }

  if (
    data?.length > 1
  ) {

    throw new Error(
      `Multiple members matched name "${value}".`
    );

  }

  return null;
}


/* =========================================================
   GOAL RESOLUTION
========================================================= */

async function resolveGoal(
  identifier
) {

  const value =
    String(
      identifier ?? ""
    ).trim();

  if (!value) {
    return null;
  }

  /*
   * Try exact UUID first.
   */

  if (
    isUuid(value)
  ) {

    const {
      data,
      error
    } = await supabase
      .from("contribution_goals")
      .select("id,group_id,name")
      .eq(
        "id",
        value
      )
      .eq(
        "group_id",
        state.groupId
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  /*
   * Resolve by name only inside current group.
   *
   * The query intentionally remains exact rather than
   * fuzzy to prevent ambiguous historical imports.
   */

  const {
    data,
    error
  } = await supabase
    .from("contribution_goals")
    .select("id,group_id,name")
    .eq(
      "group_id",
      state.groupId
    )
    .ilike(
      "name",
      value
    )
    .limit(2);

  if (error) {
    throw error;
  }

  if (
    data?.length === 1
  ) {

    return data[0];

  }

  if (
    data?.length > 1
  ) {

    throw new Error(
      `Multiple contribution goals matched "${value}".`
    );

  }

  return null;
}


/* =========================================================
   FINANCIAL PERIOD
========================================================= */

async function getFinancialPeriod(
  month
) {

  if (
    !state.groupId ||
    !month
  ) {
    return null;
  }

  const {
    data,
    error
  } = await supabase
    .from("financial_periods")
    .select(`
      id,
      group_id,
      month,
      status
    `)
    .eq(
      "group_id",
      state.groupId
    )
    .eq(
      "month",
      month
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}


/* =========================================================
   CONTRIBUTION DUPLICATE CHECK
========================================================= */

async function detectContributionDuplicate(
  contribution
) {

  if (
    !contribution.member_id ||
    !contribution.amount ||
    !contribution.contribution_date
  ) {

    return null;

  }

  let query =
    supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_date,
        payment_method,
        reference,
        mpesa_reference
      `)
      .eq(
        "group_id",
        state.groupId
      )
      .eq(
        "member_id",
        contribution.member_id
      )
      .eq(
        "amount",
        contribution.amount
      )
      .eq(
        "contribution_date",
        contribution.contribution_date
      )
      .eq(
        "payment_method",
        contribution.payment_method
      )
      .limit(2);

  const {
    data,
    error
  } = await query;

  if (error) {

    /*
     * Do not convert database query failures into a
     * duplicate warning. A security/data-access failure
     * must block validation.
     */

    throw error;

  }

  if (
    data?.length
  ) {

    return (
      "A matching contribution already exists in the current group for this member, amount, date, and payment method."
    );

  }

  return null;
}


/* =========================================================
   EXPENSE DUPLICATE CHECK
========================================================= */

async function detectExpenseDuplicate(
  expense
) {

  if (
    !expense.description ||
    !expense.amount ||
    !expense.date
  ) {

    return null;

  }

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select(`
      id,
      group_id,
      description,
      amount,
      date,
      category
    `)
    .eq(
      "group_id",
      state.groupId
    )
    .eq(
      "amount",
      expense.amount
    )
    .eq(
      "date",
      expense.date
    )
    .ilike(
      "description",
      expense.description
    )
    .limit(2);

  if (error) {
    throw error;
  }

  if (
    data?.length
  ) {

    return (
      "A likely duplicate expense already exists with the same description, amount, and date."
    );

  }

  return null;
}


/* =========================================================
   PERSIST VALIDATION RESULTS
========================================================= */

async function persistValidationResults() {

  for (
    const result of state.validationRows
  ) {

    const {
      error
    } = await supabase
      .from("data_import_rows")
      .update({
        normalized_data:
          result.normalized_data,

        status:
          result.status,

        error_message:
          result.error_message || null
      })
      .eq(
        "id",
        result.staged_id
      )
      .eq(
        "batch_id",
        state.batchId
      );

    if (error) {
      throw error;
    }

  }

}


/* =========================================================
   SAVE MAPPINGS
========================================================= */

async function saveMappings() {

  if (!state.batchId) {
    return;
  }

  const payload =
    Object.entries(
      state.mappings
    )
      .filter(
        ([, sourceColumn]) =>
          Boolean(sourceColumn)
      )
      .map(
        ([targetField, sourceColumn]) => ({
          batch_id:
            state.batchId,

          source_column:
            sourceColumn,

          target_field:
            targetField,

          mapping_type:
            mappingTypeFor(
              targetField
            )
        })
      );

  if (!payload.length) {
    return;
  }

  const {
    error
  } = await supabase
    .from("data_import_mappings")
    .upsert(
      payload,
      {
        onConflict:
          "batch_id,source_column"
      }
    );

  if (error) {
    throw error;
  }

}


/* =========================================================
   MAPPING TYPE
========================================================= */

function mappingTypeFor(
  targetField
) {

  if (
    targetField === "member"
  ) {
    return "member_match";
  }

  if (
    targetField === "amount"
  ) {
    return "amount_parse";
  }

  if (
    targetField === "contribution_date" ||
    targetField === "date"
  ) {
    return "date_parse";
  }

  return "direct";
}


/* =========================================================
   VALIDATION SUMMARY
========================================================= */

function buildValidationSummary() {

  const total =
    state.validationRows.length;

  const errors =
    state.validationRows.filter(
      row =>
        row.status === "error"
    ).length;

  const warnings =
    state.validationRows.filter(
      row =>
        row.status === "warning"
    ).length;

  const valid =
    state.validationRows.filter(
      row =>
        row.status === "valid"
    ).length;

  return {
    total,
    valid,
    warnings,
    errors,

    ready_to_import:
      valid + warnings,

    entity_type:
      state.entityType
  };

}


/* =========================================================
   VALIDATION SUMMARY UI
========================================================= */

function renderValidationSummary(
  summary
) {

  setText(
    "#totalRows",
    summary.total
  );

  setText(
    "#validRows",
    summary.valid
  );

  setText(
    "#warningRows",
    summary.warnings
  );

  setText(
    "#errorRows",
    summary.errors
  );

  setText(
    "#readyRows",
    summary.ready_to_import
  );

  show(
    "#validationSection"
  );

}


/* =========================================================
   VALIDATION ROWS UI
========================================================= */

function renderValidationRows(
  rows
) {

  const container =
    $("#validationRows") ||
    $("#validationTableBody");

  if (!container) {
    return;
  }

  container.innerHTML =
    rows.map(row => {

      const messages =
        [
          ...(row.errors || []),
          ...(row.warnings || [])
        ];

      return `
        <tr>
          <td>
            ${escapeHtml(
              row.source_row_number
            )}
          </td>

          <td>
            ${escapeHtml(
              row.status
            )}
          </td>

          <td>
            ${messages.length
              ? escapeHtml(
                  messages.join(" ")
                )
              : "Ready"}
          </td>
        </tr>
      `;

    }).join("");

}


/* =========================================================
   EXPLICIT CONFIRMATION
========================================================= */

function getConfirmationSummary() {

  const rows =
    state.validationRows
      .filter(
        row =>
          row.status === "valid" ||
          row.status === "warning"
      );

  const totalAmount =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.normalized_data?.amount ||
          0
        ),
      0
    );

  const months =
    [
      ...new Set(
        rows
          .map(
            row =>
              row.normalized_data?.month
          )
          .filter(Boolean)
      )
    ]
      .sort();

  return {
    count:
      rows.length,

    totalAmount,

    months,

    warnings:
      rows.filter(
        row =>
          row.status === "warning"
      ).length
  };

}


/* =========================================================
   CONFIRMATION UI
========================================================= */

function renderConfirmation() {

  const summary =
    getConfirmationSummary();

  setText(
    "#confirmCount",
    summary.count
  );

  setText(
    "#confirmAmount",
    money(
      summary.totalAmount
    )
  );

  setText(
    "#confirmMonths",
    summary.months.join(", ") ||
    "None"
  );

  setText(
    "#confirmWarnings",
    summary.warnings
  );

  show(
    "#confirmationSection"
  );

}


/* =========================================================
   IMPORT BUTTON
========================================================= */

function updateImportButton() {

  const button =
    $("#importButton") ||
    $("#executeImport");

  if (!button) {
    return;
  }

  const enabled =
    state.ready &&
    state.confirmed &&
    !state.importing;

  button.disabled =
    !enabled;

}


/* =========================================================
   EXECUTE IMPORT
========================================================= */

async function executeImport() {

  if (
    !state.ready
  ) {

    showMessage(
      "The migration is not ready for import.",
      "error"
    );

    return;

  }

  if (
    !state.confirmed
  ) {

    showMessage(
      "Explicit confirmation is required before importing.",
      "error"
    );

    return;

  }

  if (
    state.importing
  ) {
    return;
  }

  /*
   * Re-read the confirmation state from the actual control.
   */

  const confirmation =
    $("#confirmImport") ||
    $("#explicitConfirmation");

  if (
    confirmation &&
    !confirmation.checked
  ) {

    showMessage(
      "Please explicitly confirm the migration.",
      "error"
    );

    return;

  }

  try {

    state.importing =
      true;

    updateImportButton();

    await saveMappings();

    await updateBatchStatus(
      "importing",
      buildValidationSummary()
    );

    updateStepUI(5);

    renderConfirmation();

    showMessage(
      "Import started. Each financial record is being processed through the existing controls.",
      "info"
    );

    state.importedCount = 0;
    state.failedCount = 0;
    state.importResults = [];

    const rows =
      state.validationRows.filter(
        row =>
          row.status === "valid" ||
          row.status === "warning"
      );

    /*
     * IMPORTANT:
     *
     * There is intentionally no generic normalized_data
     * INSERT here.
     *
     * Contributions use cl_2b_record_contribution().
     * Expenses use the existing expenses table path.
     */

    for (
      const row of rows
    ) {

      try {

        const result =
          state.entityType === "contribution"
            ? await importContribution(
                row
              )
            : await importExpense(
                row
              );

        state.importedCount++;

        state.importResults.push({
          staged_id:
            row.staged_id,

          source_row_number:
            row.source_row_number,

          status:
            "imported",

          target_id:
            result.target_id,

          result
        });

        await markRowImported(
          row.staged_id,
          result.target_id
        );

      }
      catch (error) {

        state.failedCount++;

        state.importResults.push({
          staged_id:
            row.staged_id,

          source_row_number:
            row.source_row_number,

          status:
            "error",

          error:
            error?.message ||
            "Import failed."
        });

        await markRowImportError(
          row.staged_id,
          error?.message ||
          "Import failed."
        );

        /*
         * Stop immediately.
         *
         * This avoids silently continuing after a financial
         * import failure.
         *
         * Earlier successfully imported rows remain explicitly
         * reported as imported. There is no false claim of
         * browser-wide transaction atomicity.
         */

        throw new Error(
          `Import stopped at source row ${row.source_row_number}: ${
            error?.message ||
            "Import failed."
          }`
        );

      }

    }


    await updateBatchStatus(
      "completed",
      {
        ...buildValidationSummary(),

        imported:
          state.importedCount,

        failed:
          state.failedCount
      }
    );

    updateStepUI(6);

    showMessage(
      `Import completed successfully: ${state.importedCount} record(s) imported.`,
      "success"
    );

    await verifyImportedData();

  }
  catch (error) {

    console.error(
      "IMPORT ERROR",
      error
    );

    try {

      await updateBatchStatus(
        state.importedCount > 0
          ? "completed_with_errors"
          : "failed",
        {
          ...buildValidationSummary(),

          imported:
            state.importedCount,

          failed:
            state.failedCount,

          error:
            error?.message ||
            "Import failed."
        }
      );

    }
    catch (statusError) {

      console.error(
        "Unable to update batch failure status",
        statusError
      );

    }

    showMessage(
      error?.message ||
      "Import failed.",
      "error"
    );

  }
  finally {

    state.importing =
      false;

    updateImportButton();

  }

}


/* =========================================================
   IMPORT CONTRIBUTION
========================================================= */

async function importContribution(
  row
) {

  const data =
    row.normalized_data;

  if (
    !data?.member_id ||
    !data?.amount ||
    !data?.contribution_date
  ) {

    throw new Error(
      "Contribution normalized data is incomplete."
    );

  }

  /*
   * Generate a UUID idempotency/payment ID locally.
   *
   * It is generated per staged row and persisted through
   * the canonical payment call.
   *
   * The canonical function remains authoritative.
   */

  const paymentId =
    crypto.randomUUID();

  const {
    data: result,
    error
  } = await supabase.rpc(
    "cl_2b_record_contribution",
    {
      p_payment_id:
        paymentId,

      p_group_id:
        state.groupId,

      p_member_id:
        data.member_id,

      p_amount:
        data.amount,

      p_contribution_date:
        data.contribution_date,

      p_contribution_type:
        data.contribution_type ||
        "monthly",

      p_payment_method:
        data.payment_method,

      p_reference:
        data.reference ||
        null,

      p_mpesa_reference:
        data.mpesa_reference ||
        null,

      p_goal_id:
        data.goal_id ||
        null,

      p_notes:
        data.notes ||
        null
    }
  );

  if (error) {
    throw error;
  }

  if (
    !result ||
    result.ok !== true
  ) {

    throw new Error(
      result?.error ||
      "Canonical contribution recording did not confirm success."
    );

  }

  return {
    target_id:
      result.payment_id ||
      paymentId,

    canonical_result:
      result
  };

}


/* =========================================================
   IMPORT EXPENSE
========================================================= */

async function importExpense(
  row
) {

  const data =
    row.normalized_data;

  if (
    !data?.description ||
    !data?.amount ||
    !data?.date
  ) {

    throw new Error(
      "Expense normalized data is incomplete."
    );

  }

  /*
   * No group_id is taken from migration data.
   *
   * The group comes exclusively from authenticated context.
   *
   * recorded_by is intentionally not supplied by the client.
   * Existing database logic resolves/validates it.
   */

  const {
    data: inserted,
    error
  } = await supabase
    .from("expenses")
    .insert({
      group_id:
        state.groupId,

      description:
        data.description,

      category:
        data.category ||
        "other",

      amount:
        data.amount,

      date:
        data.date,

      receipt_url:
        data.receipt_url ||
        null,

      approval_status:
        data.approval_status ||
        "pending"
    })
    .select(`
      id,
      group_id,
      description,
      category,
      amount,
      date,
      receipt_url,
      approval_status
    `)
    .single();

  if (error) {
    throw error;
  }

  if (
    !inserted?.id
  ) {

    throw new Error(
      "Expense insert did not return a target record."
    );

  }

  /*
   * Verify group ownership immediately.
   */

  if (
    inserted.group_id !==
    state.groupId
  ) {

    throw new Error(
      "Expense verification failed: group mismatch."
    );

  }

  return {
    target_id:
      inserted.id,

    record:
      inserted
  };

}


/* =========================================================
   MARK ROW IMPORTED
========================================================= */

async function markRowImported(
  stagedId,
  targetId
) {

  const {
    error
  } = await supabase
    .from("data_import_rows")
    .update({
      status:
        "imported",

      target_id:
        targetId,

      error_message:
        null
    })
    .eq(
      "id",
      stagedId
    )
    .eq(
      "batch_id",
      state.batchId
    );

  if (error) {
    throw error;
  }

}


/* =========================================================
   MARK ROW IMPORT ERROR
========================================================= */

async function markRowImportError(
  stagedId,
  message
) {

  const {
    error
  } = await supabase
    .from("data_import_rows")
    .update({
      status:
        "error",

      error_message:
        message
    })
    .eq(
      "id",
      stagedId
    )
    .eq(
      "batch_id",
      state.batchId
    );

  if (error) {
    console.error(
      "Unable to mark migration row as error",
      error
    );
  }

}


/* =========================================================
   POST-IMPORT VERIFICATION
========================================================= */

async function verifyImportedData() {

  const imported =
    state.importResults.filter(
      result =>
        result.status ===
        "imported"
    );

  const verification = {
    total:
      imported.length,

    verified:
      0,

    failed:
      0,

    failures:
      []
  };


  for (
    const result of imported
  ) {

    try {

      if (
        state.entityType ===
        "contribution"
      ) {

        await verifyContribution(
          result.target_id
        );

      }
      else {

        await verifyExpense(
          result.target_id
        );

      }

      verification.verified++;

    }
    catch (error) {

      verification.failed++;

      verification.failures.push({
        source_row_number:
          result.source_row_number,

        target_id:
          result.target_id,

        error:
          error?.message ||
          "Verification failed."
      });

    }

  }


  renderVerification(
    verification
  );


  if (
    verification.failed === 0
  ) {

    showMessage(
      `Import and verification complete. ${verification.verified} record(s) verified.`,
      "success"
    );

  }
  else {

    showMessage(
      `Import completed, but ${verification.failed} record(s) failed post-import verification.`,
      "error"
    );

  }

  return verification;

}


/* =========================================================
   VERIFY CONTRIBUTION
========================================================= */

async function verifyContribution(
  paymentId
) {

  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      id,
      group_id,
      member_id,
      amount,
      contribution_date,
      payment_method,
      contribution_type
    `)
    .eq(
      "id",
      paymentId
    )
    .eq(
      "group_id",
      state.groupId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "Imported contribution was not found."
    );

  }

  if (
    data.group_id !==
    state.groupId
  ) {

    throw new Error(
      "Contribution group verification failed."
    );

  }

  if (
    !data.member_id
  ) {

    throw new Error(
      "Contribution member verification failed."
    );

  }

  if (
    Number(data.amount) <= 0
  ) {

    throw new Error(
      "Contribution amount verification failed."
    );

  }

  if (
    !data.contribution_date
  ) {

    throw new Error(
      "Contribution date verification failed."
    );

  }

  /*
   * The canonical contribution function already refreshed
   * accounting. We deliberately do NOT insert or rebuild
   * allocations here.
   */

  return data;
}


/* =========================================================
   VERIFY EXPENSE
========================================================= */

async function verifyExpense(
  expenseId
) {

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select(`
      id,
      group_id,
      description,
      category,
      amount,
      date,
      approval_status
    `)
    .eq(
      "id",
      expenseId
    )
    .eq(
      "group_id",
      state.groupId
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "Imported expense was not found."
    );

  }

  if (
    data.group_id !==
    state.groupId
  ) {

    throw new Error(
      "Expense group verification failed."
    );

  }

  if (
    Number(data.amount) <= 0
  ) {

    throw new Error(
      "Expense amount verification failed."
    );

  }

  if (
    !data.date
  ) {

    throw new Error(
      "Expense date verification failed."
    );

  }

  return data;
}


/* =========================================================
   VERIFICATION UI
========================================================= */

function renderVerification(
  verification
) {

  setText(
    "#verifiedCount",
    verification.verified
  );

  setText(
    "#verificationFailed",
    verification.failed
  );

  const container =
    $("#verificationResults");

  if (!container) {
    return;
  }

  if (
    verification.failures.length === 0
  ) {

    container.innerHTML =
      "<p>All imported records passed verification.</p>";

    return;

  }

  container.innerHTML =
    verification.failures
      .map(
        failure => `
          <div class="verification-error">
            <strong>
              Row ${escapeHtml(
                failure.source_row_number
              )}
            </strong>

            <span>
              ${escapeHtml(
                failure.error
              )}
            </span>
          </div>
        `
      )
      .join("");

}


/* =========================================================
   MARK ALL ROWS ERROR
========================================================= */

async function markAllRowsError(
  message
) {

  if (!state.batchId) {
    return;
  }

  const {
    error
  } = await supabase
    .from("data_import_rows")
    .update({
      status:
        "error",

      error_message:
        message
    })
    .eq(
      "batch_id",
      state.batchId
    );

  if (error) {
    throw error;
  }

}


/* =========================================================
   RESET FILE STATE
========================================================= */

function resetFileState() {

  state.file = null;
  state.sourceType = null;
  state.sourceName = null;
  state.sheetName = null;

  state.headers = [];
  state.sourceRows = [];

  state.mappings = {};

  state.batchId = null;

  state.stagedRows = [];
  state.validationRows = [];

  state.validated = false;
  state.ready = false;
  state.confirmed = false;

  state.importing = false;

  state.importedCount = 0;
  state.failedCount = 0;

  state.importResults = [];

}


/* =========================================================
   RESET ENTIRE MIGRATION
========================================================= */

function resetMigration() {

  const confirmed =
    window.confirm(
      "Reset this migration screen? Staged migration data already saved in the database will not be deleted automatically."
    );

  if (!confirmed) {
    return;
  }

  resetFileState();

  const fileInput =
    $("#fileInput") ||
    $("#migrationFile");

  if (fileInput) {
    fileInput.value = "";
  }

  const confirmation =
    $("#confirmImport") ||
    $("#explicitConfirmation");

  if (confirmation) {
    confirmation.checked = false;
  }

  hide(
    "#mappingSection"
  );

  hide(
    "#validationSection"
  );

  hide(
    "#confirmationSection"
  );

  hide(
    "#verificationSection"
  );

  clearMessage();

  updateStepUI(1);

}


/* =========================================================
   VALIDATION BUSY STATE
========================================================= */

function setValidationBusy(
  busy
) {

  setDisabled(
    "#validateButton",
    busy
  );

  setDisabled(
    "#validateImport",
    busy
  );

  if (busy) {

    showMessage(
      "Validating migration rows. No financial records are being imported.",
      "info"
    );

  }

}


/* =========================================================
   PREVIEW STATS
========================================================= */

function updatePreviewStats() {

  setText(
    "#totalRows",
    state.sourceRows.length
  );

  setText(
    "#validRows",
    "—"
  );

  setText(
    "#warningRows",
    "—"
  );

  setText(
    "#errorRows",
    "—"
  );

  setText(
    "#readyRows",
    "—"
  );

}


/* =========================================================
   STEP UI
========================================================= */

function updateStepUI(
  activeStep
) {

  $all(
    "[data-step]"
  )
    .forEach(element => {

      const step =
        Number(
          element.dataset.step
        );

      element.classList.toggle(
        "active",
        step === activeStep
      );

      element.classList.toggle(
        "completed",
        step < activeStep
      );

    });

  setText(
    "#currentStep",
    activeStep
  );

}


/* =========================================================
   DATE PARSER
========================================================= */

function parseDate(value) {

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime()
    )
  ) {

    return formatDate(
      value
    );

  }

  const raw =
    String(
      value ?? ""
    ).trim();

  if (!raw) {
    return null;
  }

  /*
   * ISO date.
   */

  const iso =
    raw.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

  if (iso) {

    const year =
      Number(iso[1]);

    const month =
      Number(iso[2]);

    const day =
      Number(iso[3]);

    if (
      isValidDateParts(
        year,
        month,
        day
      )
    ) {

      return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-");

    }

    return null;
  }


  /*
   * DD/MM/YYYY or DD-MM-YYYY
   */

  const dmy =
    raw.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
    );

  if (dmy) {

    const day =
      Number(dmy[1]);

    const month =
      Number(dmy[2]);

    const year =
      Number(dmy[3]);

    if (
      isValidDateParts(
        year,
        month,
        day
      )
    ) {

      return [
        String(year),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0")
      ].join("-");

    }

    return null;
  }


  /*
   * MM/DD/YYYY
   *
   * Only accept when unambiguous enough to parse.
   */

  const slash =
    raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    );

  if (slash) {

    const first =
      Number(slash[1]);

    const second =
      Number(slash[2]);

    const year =
      Number(slash[3]);

    if (
      first > 12 &&
      second <= 12
    ) {

      if (
        isValidDateParts(
          year,
          second,
          first
        )
      ) {

        return [
          String(year),
          String(second).padStart(2, "0"),
          String(first).padStart(2, "0")
        ].join("-");

      }

    }

    /*
     * If both are <= 12, the format is ambiguous.
     * Do not guess.
     */

    if (
      first <= 12 &&
      second <= 12
    ) {

      return null;

    }

  }


  /*
   * Last controlled fallback.
   */

  const parsed =
    new Date(raw);

  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {

    return formatDate(
      parsed
    );

  }

  return null;
}


/* =========================================================
   DATE VALIDATION
========================================================= */

function isValidDateParts(
  year,
  month,
  day
) {

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {

    return false;

  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );

}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatDate(
  date
) {

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
   MONTH NORMALIZATION
========================================================= */

function normalizeMonth(
  value
) {

  const raw =
    String(
      value ?? ""
    ).trim();

  const match =
    raw.match(
      /^(\d{4})[-\/](\d{1,2})$/
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  if (
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return [
    String(year),
    String(month).padStart(2, "0")
  ].join("-");
}


/* =========================================================
   AMOUNT PARSER
========================================================= */

function parseAmount(
  value
) {

  if (
    typeof value === "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : NaN;

  }

  let raw =
    String(
      value ?? ""
    )
      .trim();

  if (!raw) {
    return NaN;
  }

  /*
   * Remove common currency labels and whitespace.
   */

  raw =
    raw
      .replace(
        /KSh|KES|Shillings?/gi,
        ""
      )
      .replace(
        /\s/g,
        ""
      );

  /*
   * Reject accounting-style negative values explicitly.
   */

  if (
    /^\(.*\)$/.test(raw)
  ) {

    return NaN;

  }

  /*
   * Remove commas.
   */

  raw =
    raw.replace(
      /,/g,
      ""
    );

  const amount =
    Number(raw);

  return Number.isFinite(
    amount
  )
    ? amount
    : NaN;
}


/* =========================================================
   PAYMENT METHOD NORMALIZATION
========================================================= */

function normalizePaymentMethod(
  value
) {

  const raw =
    String(
      value ?? ""
    )
      .trim()
      .toLowerCase();

  if (
    raw === "m-pesa" ||
    raw === "mpesa" ||
    raw === "m pesa"
  ) {
    return "M-Pesa";
  }

  if (
    raw === "cash"
  ) {
    return "Cash";
  }

  if (
    raw === "bank transfer" ||
    raw === "bank_transfer" ||
    raw === "bank"
  ) {
    return "Bank transfer";
  }

  return String(
    value ?? ""
  ).trim();
}


/* =========================================================
   NULL CLEANING
========================================================= */

function cleanNullable(
  value
) {

  const result =
    String(
      value ?? ""
    ).trim();

  return result
    ? result
    : null;
}


/* =========================================================
   SAFE URL
========================================================= */

function looksLikeSafeUrl(
  value
) {

  try {

    const url =
      new URL(
        String(value)
      );

    return (
      url.protocol ===
        "https:" ||
      url.protocol ===
        "http:"
    );

  }
  catch {

    return false;

  }

}


/* =========================================================
   UUID
========================================================= */

function isUuid(
  value
) {

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(
      String(value)
    );

}


/* =========================================================
   FILE SIZE
========================================================= */

function formatBytes(
  bytes
) {

  const value =
    Number(bytes || 0);

  if (
    value < 1024
  ) {

    return `${value} B`;

  }

  if (
    value < 1024 * 1024
  ) {

    return `${(
      value / 1024
    ).toFixed(1)} KB`;

  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;

}


/* =========================================================
   EXPORT STATE FOR DEBUGGING
   ---------------------------------------------------------
   Read-only diagnostic access.
========================================================= */

window.CHAMA_LIVE_DATA_MIGRATION =
  Object.freeze({
    getState() {

      return {
        groupId:
          state.groupId,

        entityType:
          state.entityType,

        sourceName:
          state.sourceName,

        sourceType:
          state.sourceType,

        batchId:
          state.batchId,

        sourceRowCount:
          state.sourceRows.length,

        validationRowCount:
          state.validationRows.length,

        validated:
          state.validated,

        ready:
          state.ready,

        importing:
          state.importing,

        importedCount:
          state.importedCount,

        failedCount:
          state.failedCount
      };

    }
  });


/* =========================================================
   END
========================================================= */
