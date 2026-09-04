/* =========================================================
   CHAMA LIVE — DATA MIGRATION
   ISOLATED CANDIDATE

   IMPORT SCOPE
   ---------------------------------------------------------
   ONLY:
     - contributions
     - expenses

   WORKFLOW
   ---------------------------------------------------------
   Upload
      ↓
   Map
      ↓
   Validate
      ↓
   Preview
      ↓
   Explicit confirmation
      ↓
   Import
      ↓
   Verify

   SAFETY
   ---------------------------------------------------------
   - Uses authenticated current member/group context.
   - Never accepts group_id from the UI.
   - Never accepts recorded_by from the UI.
   - Never imports obligations.
   - Never imports allocations.
   - Never imports financial-period state.
   - Never creates members automatically.
   - Never creates financial periods automatically.
   - Contributions use cl_2b_record_contribution().
   - cl_2b_refresh_member() is NOT modified here.
   - No service-role key is used.
   - No DDL is executed.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";


/* =========================================================
   CONSTANTS
========================================================= */

const IMPORTABLE_ENTITY_TYPES = [
  "contribution",
  "expense"
];


const SOURCE_TYPES = [
  "csv"
];


const CONTRIBUTION_PAYMENT_METHODS = [
  "M-Pesa",
  "Cash",
  "Bank transfer"
];


const CONTRIBUTION_TYPE = "monthly";


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


const PROTECTED_FIELD_NAMES = new Set([

  "id",

  "group_id",

  "recorded_by",

  "created_at",

  "updated_at",

  "payment_id",

  "contribution_id",

  "allocation_id",

  "obligation_id",

  "allocation_amount",

  "obligation_amount",

  "financial_period_id",

  "financial_period_status",

  "period_status",

  "accounting_status",

  "accounting_result",

  "normalized_accounting",

  "canonical_accounting",

  "service_role",

  "auth_uid",

  "user_id",

  "auth_user_id"

]);


/*
 * The first implementation deliberately requires the
 * contribution date.
 *
 * Month is derived from contribution_date.
 *
 * If the source also provides a month column, it is
 * validated against the derived month.
 */
const CONTRIBUTION_FIELDS = [

  {
    key: "member_identifier",
    label: "Member identifier",
    required: true
  },

  {
    key: "amount",
    label: "Amount",
    required: true
  },

  {
    key: "contribution_date",
    label: "Contribution date",
    required: true
  },

  {
    key: "month",
    label: "Source month (optional consistency check)",
    required: false
  },

  {
    key: "payment_method",
    label: "Payment method",
    required: true
  },

  {
    key: "reference",
    label: "Reference",
    required: false
  },

  {
    key: "mpesa_reference",
    label: "M-Pesa reference",
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
    key: "contribution_type",
    label: "Contribution type",
    required: false
  }

];


const EXPENSE_FIELDS = [

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
    label: "Expense date",
    required: true
  },

  {
    key: "category",
    label: "Category",
    required: false
  },

  {
    key: "approval_status",
    label: "Approval status",
    required: false
  },

  {
    key: "receipt_url",
    label: "Receipt reference",
    required: false
  }

];


/* =========================================================
   STATE
========================================================= */

const state = {

  user: null,

  member: null,

  group: null,

  file: null,

  sourceHeaders: [],

  sourceRows: [],

  entityType: null,

  mappings: {},

  normalizedRows: [],

  validation: null,

  batchId: null,

  importResults: [],

  verification: null,

  currentStep: "upload",

  busy: false

};


/* =========================================================
   DOM HELPERS
========================================================= */

function byId(id) {

  return document.getElementById(id);

}


function all(selector) {

  return Array.from(
    document.querySelectorAll(selector)
  );

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(
  message,
  type = "info"
) {

  const element =
    byId("pageStatus");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.className =
    `status-message visible ${type}`;

}


function clearStatus() {

  const element =
    byId("pageStatus");

  if (!element) {
    return;
  }

  element.textContent = "";

  element.className =
    "status-message";

}


/* =========================================================
   STEP UI
========================================================= */

function setStep(step) {

  state.currentStep =
    step;

  const order = [
    "upload",
    "map",
    "validate",
    "preview",
    "confirm",
    "import",
    "verify"
  ];

  const currentIndex =
    order.indexOf(step);


  all("[data-step]")
    .forEach(function (element) {

      const elementStep =
        element.dataset.step;

      const elementIndex =
        order.indexOf(elementStep);

      element.classList.remove(
        "active",
        "complete"
      );

      if (
        elementIndex <
        currentIndex
      ) {

        element.classList.add(
          "complete"
        );

      }

      if (
        elementStep === step
      ) {

        element.classList.add(
          "active"
        );

      }

    });

}


function showOnly(
  sectionId
) {

  const sections = [

    "uploadSection",

    "mappingSection",

    "validationSection",

    "previewSection",

    "confirmationSection",

    "importSection",

    "verificationSection"

  ];


  sections.forEach(function (id) {

    const element =
      byId(id);

    if (!element) {
      return;
    }

    element.hidden =
      id !== sectionId;

  });

}


/* =========================================================
   AUTHENTICATION / GROUP CONTEXT
========================================================= */

async function loadContext() {

  state.user =
    await requireAuth();

  state.member =
    await getCurrentMember();

  state.group =
    await getCurrentGroup();


  if (!state.member?.id) {

    throw new Error(
      "Authenticated member could not be resolved."
    );

  }


  if (!state.member?.group_id) {

    throw new Error(
      "Authenticated member has no group."
    );

  }


  if (!state.group?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  if (
    state.member.group_id !==
    state.group.id
  ) {

    throw new Error(
      "Authenticated member/group context is inconsistent."
    );

  }


  const groupName =
    state.group.name ||
    state.group.group_name ||
    "CHAMA";


  all("[data-group-name]")
    .forEach(function (element) {

      element.textContent =
        groupName;

    });


  all("[data-user-name]")
    .forEach(function (element) {

      element.textContent =
        state.member.name ||
        state.member.full_name ||
        "Member";

    });

}


/* =========================================================
   FILE READING
========================================================= */

function parseCsv(text) {

  const rows = [];

  let row = [];

  let cell = "";

  let inQuotes = false;


  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {

    const char =
      text[index];

    const next =
      text[index + 1];


    if (char === '"') {

      if (
        inQuotes &&
        next === '"'
      ) {

        cell += '"';

        index += 1;

      }

      else {

        inQuotes =
          !inQuotes;

      }

      continue;

    }


    if (
      char === "," &&
      !inQuotes
    ) {

      row.push(cell);

      cell = "";

      continue;

    }


    if (
      (char === "\n" || char === "\r") &&
      !inQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {

        index += 1;

      }

      row.push(cell);

      cell = "";

      if (
        row.some(
          value =>
            String(value).trim() !== ""
        )
      ) {

        rows.push(row);

      }

      row = [];

      continue;

    }


    cell += char;

  }


  if (
    cell !== "" ||
    row.length > 0
  ) {

    row.push(cell);

  }


  if (
    row.some(
      value =>
        String(value).trim() !== ""
    )
  ) {

    rows.push(row);

  }


  return rows;

}


function normalizeHeader(
  value
) {

  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "");

}


function cleanCell(
  value
) {

  return String(
    value ?? ""
  ).trim();

}


function buildSourceRows(
  parsedRows
) {

  if (
    !parsedRows ||
    parsedRows.length === 0
  ) {

    throw new Error(
      "The CSV file is empty."
    );

  }


  const headers =
    parsedRows[0]
      .map(function (value) {

        return cleanCell(value);

      });


  if (
    headers.length === 0 ||
    headers.every(
      value => !value
    )
  ) {

    throw new Error(
      "The CSV header row is empty."
    );

  }


  const duplicateHeaders =
    findDuplicateHeaders(headers);


  if (
    duplicateHeaders.length > 0
  ) {

    throw new Error(
      `Duplicate source columns: ${duplicateHeaders.join(", ")}`
    );

  }


  state.sourceHeaders =
    headers;


  const rows =
    parsedRows
      .slice(1)
      .map(function (
        values,
        index
      ) {

        const object = {};

        headers.forEach(
          function (
            header,
            columnIndex
          ) {

            object[header] =
              cleanCell(
                values[columnIndex]
              );

          }
        );


        return {

          sourceRowNumber:
            index + 2,

          values:
            object

        };

      });


  state.sourceRows =
    rows.filter(
      row =>
        Object.values(
          row.values
        ).some(
          value =>
            String(value).trim() !== ""
        )
    );


  if (
    state.sourceRows.length === 0
  ) {

    throw new Error(
      "The CSV contains no data rows."
    );

  }

}


function findDuplicateHeaders(
  headers
) {

  const seen =
    new Map();

  const duplicates =
    new Set();


  headers.forEach(
    function (header) {

      const key =
        normalizeHeader(header);

      if (!key) {
        return;
      }

      if (seen.has(key)) {

        duplicates.add(
          header
        );

      }

      else {

        seen.set(
          key,
          true
        );

      }

    }
  );


  return Array.from(
    duplicates
  );

}


/* =========================================================
   ENTITY DETECTION
========================================================= */

function detectEntityType() {

  const normalizedHeaders =
    state.sourceHeaders.map(
      normalizeHeader
    );


  const contributionSignals = [
    "member",
    "member_number",
    "membership_number",
    "contribution",
    "contribution_date",
    "payment_method",
    "mpesa_reference"
  ];


  const expenseSignals = [
    "description",
    "expense",
    "expense_date",
    "category",
    "receipt",
    "approval_status"
  ];


  const contributionScore =
    contributionSignals.filter(
      signal =>
        normalizedHeaders.some(
          header =>
            header.includes(signal)
        )
    ).length;


  const expenseScore =
    expenseSignals.filter(
      signal =>
        normalizedHeaders.some(
          header =>
            header.includes(signal)
        )
    ).length;


  if (
    contributionScore === 0 &&
    expenseScore === 0
  ) {

    return null;

  }


  if (
    contributionScore >
    expenseScore
  ) {

    return "contribution";

  }


  if (
    expenseScore >
    contributionScore
  ) {

    return "expense";

  }


  return null;

}


/* =========================================================
   MAPPING
========================================================= */

function renderMapping() {

  const container =
    byId("mappingGrid");

  if (!container) {
    return;
  }


  const fields =
    state.entityType === "contribution"
      ? CONTRIBUTION_FIELDS
      : EXPENSE_FIELDS;


  const options = [
    `<option value="">— Not mapped —</option>`
  ]
    .concat(
      state.sourceHeaders.map(
        function (header) {

          return (
            `<option value="${escapeHtml(header)}">` +
            `${escapeHtml(header)}` +
            `</option>`
          );

        }
      )
    )
    .join("");


  container.innerHTML =
    fields.map(
      function (field) {

        const required =
          field.required
            ? `<span class="mapping-required">*</span>`
            : "";


        return `
          <div class="mapping-field">

            <label for="map_${escapeHtml(field.key)}">

              ${escapeHtml(field.label)}
              ${required}

            </label>

            <select
              id="map_${escapeHtml(field.key)}"
              data-mapping-key="${escapeHtml(field.key)}"
            >
              ${options}
            </select>

            <div class="mapping-source-note">

              ${
                field.required
                  ? "Required"
                  : "Optional"
              }

            </div>

          </div>
        `;

      }
    )
    .join("");


  autoSuggestMappings();

}


function autoSuggestMappings() {

  const fields =
    state.entityType === "contribution"
      ? CONTRIBUTION_FIELDS
      : EXPENSE_FIELDS;


  fields.forEach(
    function (field) {

      const select =
        document.querySelector(
          `[data-mapping-key="${field.key}"]`
        );


      if (!select) {
        return;
      }


      const candidates =
        state.sourceHeaders.filter(
          function (header) {

            return headerMatchesField(
              header,
              field.key
            );

          }
        );


      if (
        candidates.length === 1
      ) {

        select.value =
          candidates[0];

      }

    }
  );

}


function headerMatchesField(
  header,
  fieldKey
) {

  const normalized =
    normalizeHeader(header)
      .replace(/[\s-]+/g, "_");


  const aliases = {

    member_identifier: [
      "member",
      "member_number",
      "membership_number",
      "member_no",
      "membership_no",
      "member_id"
    ],

    amount: [
      "amount",
      "contribution_amount",
      "expense_amount",
      "value"
    ],

    contribution_date: [
      "contribution_date",
      "payment_date",
      "date"
    ],

    month: [
      "month",
      "contribution_month"
    ],

    payment_method: [
      "payment_method",
      "method",
      "payment"
    ],

    reference: [
      "reference",
      "transaction_reference",
      "ref"
    ],

    mpesa_reference: [
      "mpesa_reference",
      "mpesa_ref",
      "mpesa_transaction",
      "mpesa_code"
    ],

    goal: [
      "goal",
      "goal_name"
    ],

    notes: [
      "notes",
      "note",
      "remarks",
      "comment"
    ],

    contribution_type: [
      "contribution_type",
      "type"
    ],

    description: [
      "description",
      "expense_description",
      "expense",
      "details"
    ],

    date: [
      "date",
      "expense_date"
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
      "receipt_reference"
    ]

  };


  return (
    aliases[fieldKey] ||
    []
  ).includes(
    normalized
  );

}


/* =========================================================
   MAPPING COLLECTION
========================================================= */

function collectMappings() {

  const fields =
    state.entityType === "contribution"
      ? CONTRIBUTION_FIELDS
      : EXPENSE_FIELDS;


  const mappings = {};


  fields.forEach(
    function (field) {

      const select =
        document.querySelector(
          `[data-mapping-key="${field.key}"]`
        );


      mappings[field.key] =
        select?.value ||
        null;

    }
  );


  state.mappings =
    mappings;


  return mappings;

}


function getMappedValue(
  row,
  key
) {

  const sourceColumn =
    state.mappings[key];


  if (!sourceColumn) {
    return "";
  }


  return cleanCell(
    row.values[sourceColumn]
  );

}


/* =========================================================
   PROTECTED SOURCE FIELDS
========================================================= */

function detectProtectedFields() {

  const violations = [];


  state.sourceHeaders.forEach(
    function (header) {

      const normalized =
        normalizeHeader(header)
          .replace(/[\s-]+/g, "_");


      if (
        PROTECTED_FIELD_NAMES.has(
          normalized
        )
      ) {

        violations.push(
          header
        );

      }

    }
  );


  return violations;

}


/* =========================================================
   DATA NORMALIZATION
========================================================= */

function parsePositiveAmount(
  value
) {

  const cleaned =
    String(value ?? "")
      .trim()
      .replace(/,/g, "")
      .replace(/\s+/g, "");


  if (!cleaned) {
    return null;
  }


  const amount =
    Number(cleaned);


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    return null;

  }


  return amount;

}


function parseDate(
  value
) {

  const text =
    cleanCell(value);


  if (!text) {
    return null;
  }


  /*
   * ISO date is preferred.
   */
  const isoMatch =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );


  if (isoMatch) {

    const year =
      Number(isoMatch[1]);

    const month =
      Number(isoMatch[2]);

    const day =
      Number(isoMatch[3]);


    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );


    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {

      return (
        `${year.toString().padStart(4, "0")}-` +
        `${month.toString().padStart(2, "0")}-` +
        `${day.toString().padStart(2, "0")}`
      );

    }

  }


  /*
   * Deliberately support common unambiguous
   * slash/dash forms where day/month ordering
   * is obvious from the values.
   */
  const parts =
    text.split(
      /[\/.\-]/
    )
      .map(
        value =>
          Number(value)
      );


  if (
    parts.length === 3 &&
    parts.every(
      value =>
        Number.isInteger(value)
    )
  ) {

    let year;
    let month;
    let day;


    if (
      parts[0] >= 1900 &&
      parts[0] <= 2200
    ) {

      year =
        parts[0];

      month =
        parts[1];

      day =
        parts[2];

    }

    else if (
      parts[2] >= 1900 &&
      parts[2] <= 2200
    ) {

      year =
        parts[2];

      /*
       * DD/MM/YYYY is used for the
       * ambiguous non-US form.
       */
      day =
        parts[0];

      month =
        parts[1];

    }

    else {

      return null;

    }


    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );


    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {

      return null;

    }


    return (
      `${year}-` +
      `${String(month).padStart(2, "0")}-` +
      `${String(day).padStart(2, "0")}`
    );

  }


  return null;

}


function monthFromDate(
  dateString
) {

  if (!dateString) {
    return null;
  }


  return dateString.slice(
    0,
    7
  );

}


function isValidMonth(
  value
) {

  return /^\d{4}-(0[1-9]|1[0-2])$/.test(
    String(value || "")
  );

}


/* =========================================================
   MEMBER RESOLUTION
========================================================= */

async function resolveMember(
  identifier
) {

  const clean =
    cleanCell(identifier);


  if (!clean) {

    return {
      status: "error",
      error: "Member identifier is required."
    };

  }


  /*
   * We resolve only inside the authenticated
   * current group.
   *
   * No group_id is accepted from the source file.
   */
  const candidateColumns = [
    "member_number",
    "membership_number",
    "id"
  ];


  for (
    const column of candidateColumns
  ) {

    const {
      data,
      error
    } =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          member_number,
          membership_number,
          name,
          status
        `)
        .eq(
          column,
          clean
        )
        .eq(
          "group_id",
          state.group.id
        )
        .limit(20);


    if (error) {

      throw error;

    }


    if (
      data &&
      data.length > 0
    ) {

      if (
        data.length > 1
      ) {

        return {
          status: "error",
          error:
            `Multiple members matched "${clean}".`
        };

      }


      const member =
        data[0];


      if (
        member.group_id !==
        state.group.id
      ) {

        return {
          status: "error",
          error:
            "Resolved member does not belong to the current group."
        };

      }


      return {
        status: "resolved",
        member
      };

    }

  }


  /*
   * Exact name matching is intentionally allowed
   * only when unique.
   *
   * This is not fuzzy matching.
   */
  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        member_number,
        membership_number,
        name,
        status
      `)
      .eq(
        "group_id",
        state.group.id
      )
      .ilike(
        "name",
        clean
      )
      .limit(20);


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    return {
      status: "error",
      error:
        `Member "${clean}" was not found in the current group.`
    };

  }


  if (
    data.length > 1
  ) {

    return {
      status: "error",
      error:
        `Multiple members matched "${clean}". Use a member number.`
    };

  }


  return {
    status: "resolved",
    member: data[0]
  };

}


/* =========================================================
   GOAL RESOLUTION
========================================================= */

async function resolveGoal(
  value
) {

  const clean =
    cleanCell(value);


  if (!clean) {

    return {
      status: "empty",
      goal: null
    };

  }


  /*
   * Resolve by exact goal name within group.
   *
   * Never accept arbitrary goal_id from the file.
   */
  const {
    data,
    error
  } =
    await supabase
      .from("contribution_goals")
      .select(`
        id,
        group_id,
        name
      `)
      .eq(
        "group_id",
        state.group.id
      )
      .ilike(
        "name",
        clean
      )
      .limit(20);


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    return {
      status: "error",
      error:
        `Goal "${clean}" was not found in the current group.`
    };

  }


  if (
    data.length > 1
  ) {

    return {
      status: "error",
      error:
        `Multiple goals matched "${clean}".`
    };

  }


  return {
    status: "resolved",
    goal: data[0]
  };

}


/* =========================================================
   FINANCIAL PERIOD CHECK
========================================================= */

async function checkFinancialPeriod(
  month
) {

  if (
    !isValidMonth(month)
  ) {

    return {
      status: "error",
      error:
        "A valid YYYY-MM financial month is required."
    };

  }


  const {
    data,
    error
  } =
    await supabase
      .from("financial_periods")
      .select(`
        id,
        group_id,
        period_month,
        status
      `)
      .eq(
        "group_id",
        state.group.id
      )
      .eq(
        "period_month",
        `${month}-01`
      )
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    data &&
    data.length > 0
  ) {

    const period =
      data[0];


    const status =
      String(
        period.status || ""
      )
        .trim()
        .toLowerCase();


    if (
      status === "closed"
    ) {

      return {
        status: "closed",
        period
      };

    }


    return {
      status: "open",
      period
    };

  }


  /*
   * No automatic period creation.
   *
   * Absence is not treated as permission to
   * bypass financial-period controls.
   */
  return {
    status: "not_found"
  };

}


/* =========================================================
   CONTRIBUTION NORMALIZATION
========================================================= */

async function normalizeContribution(
  sourceRow
) {

  const errors = [];

  const warnings = [];


  const memberIdentifier =
    getMappedValue(
      sourceRow,
      "member_identifier"
    );


  const amountRaw =
    getMappedValue(
      sourceRow,
      "amount"
    );


  const dateRaw =
    getMappedValue(
      sourceRow,
      "contribution_date"
    );


  const sourceMonth =
    getMappedValue(
      sourceRow,
      "month"
    );


  const paymentMethod =
    getMappedValue(
      sourceRow,
      "payment_method"
    );


  const reference =
    getMappedValue(
      sourceRow,
      "reference"
    );


  const mpesaReference =
    getMappedValue(
      sourceRow,
      "mpesa_reference"
    );


  const goal =
    getMappedValue(
      sourceRow,
      "goal"
    );


  const notes =
    getMappedValue(
      sourceRow,
      "notes"
    );


  const contributionType =
    getMappedValue(
      sourceRow,
      "contribution_type"
    );


  if (!memberIdentifier) {

    errors.push(
      "Member identifier is required."
    );

  }


  const amount =
    parsePositiveAmount(
      amountRaw
    );


  if (
    amount === null
  ) {

    errors.push(
      "Amount must be a positive number."
    );

  }


  const contributionDate =
    parseDate(
      dateRaw
    );


  if (!contributionDate) {

    errors.push(
      "Contribution date is required and must be a valid date."
    );

  }


  const derivedMonth =
    monthFromDate(
      contributionDate
    );


  if (
    sourceMonth &&
    derivedMonth &&
    sourceMonth !== derivedMonth
  ) {

    errors.push(
      `Source month ${sourceMonth} does not match contribution date month ${derivedMonth}.`
    );

  }


  if (
    paymentMethod &&
    !CONTRIBUTION_PAYMENT_METHODS.includes(
      paymentMethod
    )
  ) {

    errors.push(
      `Invalid payment method "${paymentMethod}".`
    );

  }


  if (!paymentMethod) {

    errors.push(
      "Payment method is required."
    );

  }


  const normalizedContributionType =
    contributionType ||
    CONTRIBUTION_TYPE;


  if (
    normalizedContributionType !==
    CONTRIBUTION_TYPE
  ) {

    errors.push(
      `Contribution type must be "${CONTRIBUTION_TYPE}".`
    );

  }


  if (
    paymentMethod === "M-Pesa"
  ) {

    if (
      reference &&
      mpesaReference &&
      reference !== mpesaReference
    ) {

      errors.push(
        "Reference and M-Pesa reference must match when both are supplied."
      );

    }

  }


  if (
    paymentMethod &&
    paymentMethod !== "M-Pesa" &&
    mpesaReference
  ) {

    errors.push(
      "M-Pesa reference cannot be supplied for non-M-Pesa payments."
    );

  }


  let resolvedMember =
    null;


  if (memberIdentifier) {

    const result =
      await resolveMember(
        memberIdentifier
      );


    if (
      result.status !==
      "resolved"
    ) {

      errors.push(
        result.error
      );

    }

    else {

      resolvedMember =
        result.member;

    }

  }


  let resolvedGoal =
    null;


  if (goal) {

    const result =
      await resolveGoal(
        goal
      );


    if (
      result.status !==
      "resolved"
    ) {

      errors.push(
        result.error
      );

    }

    else {

      resolvedGoal =
        result.goal;

    }

  }


  let period =
    null;


  if (derivedMonth) {

    period =
      await checkFinancialPeriod(
        derivedMonth
      );


    if (
      period.status ===
      "closed"
    ) {

      errors.push(
        `Financial period ${derivedMonth} is closed.`
      );

    }


    if (
      period.status ===
      "not_found"
    ) {

      errors.push(
        `Financial period ${derivedMonth} could not be resolved.`
      );

    }

  }


  if (!reference) {

    warnings.push(
      "Reference is not supplied."
    );

  }


  if (!notes) {

    warnings.push(
      "Notes are not supplied."
    );

  }


  if (
    errors.length === 0 &&
    warnings.length > 0
  ) {

    /*
     * Warnings are allowed by the frozen contract.
     */

  }


  const effectiveReference =
    paymentMethod === "M-Pesa"
      ? (
          mpesaReference ||
          reference ||
          null
        )
      : (
          reference ||
          null
        );


  return {

    entityType:
      "contribution",

    sourceRowNumber:
      sourceRow.sourceRowNumber,

    sourceData:
      sourceRow.values,

    normalizedData: {

      member_id:
        resolvedMember?.id ||
        null,

      member_identifier:
        memberIdentifier,

      amount,

      contribution_date:
        contributionDate,

      month:
        derivedMonth,

      contribution_type:
        normalizedContributionType,

      payment_method:
        paymentMethod,

      reference:
        effectiveReference,

      mpesa_reference:
        paymentMethod === "M-Pesa"
          ? (
              mpesaReference ||
              reference ||
              null
            )
          : null,

      goal_id:
        resolvedGoal?.id ||
        null,

      notes:
        notes ||
        null

    },

    period,

    errors,

    warnings,

    status:
      errors.length > 0
        ? "error"
        : warnings.length > 0
          ? "warning"
          : "valid"

  };

}


/* =========================================================
   EXPENSE NORMALIZATION
========================================================= */

async function normalizeExpense(
  sourceRow
) {

  const errors = [];

  const warnings = [];


  const description =
    getMappedValue(
      sourceRow,
      "description"
    );


  const amountRaw =
    getMappedValue(
      sourceRow,
      "amount"
    );


  const dateRaw =
    getMappedValue(
      sourceRow,
      "date"
    );


  const categoryRaw =
    getMappedValue(
      sourceRow,
      "category"
    );


  const approvalRaw =
    getMappedValue(
      sourceRow,
      "approval_status"
    );


  const receiptUrl =
    getMappedValue(
      sourceRow,
      "receipt_url"
    );


  if (!description) {

    errors.push(
      "Expense description is required."
    );

  }


  const amount =
    parsePositiveAmount(
      amountRaw
    );


  if (
    amount === null
  ) {

    errors.push(
      "Amount must be a positive number."
    );

  }


  const expenseDate =
    parseDate(
      dateRaw
    );


  if (!expenseDate) {

    errors.push(
      "Expense date is required and must be valid."
    );

  }


  const category =
    categoryRaw ||
    "other";


  if (
    !EXPENSE_CATEGORIES.includes(
      category
    )
  ) {

    errors.push(
      `Invalid expense category "${category}".`
    );

  }


  const approvalStatus =
    approvalRaw ||
    "pending";


  if (
    !EXPENSE_APPROVAL_STATUSES.includes(
      approvalStatus
    )
  ) {

    errors.push(
      `Invalid approval status "${approvalStatus}".`
    );

  }


  const month =
    monthFromDate(
      expenseDate
    );


  let period =
    null;


  if (month) {

    period =
      await checkFinancialPeriod(
        month
      );


    if (
      period.status ===
      "closed"
    ) {

      errors.push(
        `Financial period ${month} is closed.`
      );

    }


    if (
      period.status ===
      "not_found"
    ) {

      errors.push(
        `Financial period ${month} could not be resolved.`
      );

    }

  }


  if (!categoryRaw) {

    warnings.push(
      'Category omitted; "other" will be used.'
    );

  }


  if (!approvalRaw) {

    warnings.push(
      'Approval status omitted; "pending" will be used.'
    );

  }


  if (!receiptUrl) {

    warnings.push(
      "Receipt reference is not supplied."
    );

  }


  return {

    entityType:
      "expense",

    sourceRowNumber:
      sourceRow.sourceRowNumber,

    sourceData:
      sourceRow.values,

    normalizedData: {

      description,

      amount,

      date:
        expenseDate,

      category,

      approval_status:
        approvalStatus,

      receipt_url:
        receiptUrl ||
        null

    },

    period,

    errors,

    warnings,

    status:
      errors.length > 0
        ? "error"
        : warnings.length > 0
          ? "warning"
          : "valid"

  };

}


/* =========================================================
   DUPLICATE DETECTION
========================================================= */

function buildDuplicateKey(
  normalizedRow
) {

  const data =
    normalizedRow.normalizedData;


  if (
    normalizedRow.entityType ===
    "contribution"
  ) {

    return [
      "contribution",
      data.member_id,
      data.amount,
      data.contribution_date,
      data.payment_method,
      data.reference || "",
      data.mpesa_reference || ""
    ]
      .join("|")
      .toLowerCase();

  }


  return [
    "expense",
    data.description,
    data.amount,
    data.date,
    data.category
  ]
    .join("|")
    .toLowerCase();

}


function detectInternalDuplicates(
  rows
) {

  const seen =
    new Map();


  rows.forEach(
    function (row) {

      const key =
        buildDuplicateKey(
          row
        );


      if (
        seen.has(key)
      ) {

        const firstRow =
          seen.get(key);


        row.errors.push(
          `Duplicate of source row ${firstRow.sourceRowNumber}.`
        );


        row.status =
          "error";

      }

      else {

        seen.set(
          key,
          row
        );

      }

    }
  );

}


/* =========================================================
   LIVE DUPLICATE DETECTION
========================================================= */

async function detectLiveDuplicates(
  rows
) {

  for (
    const row of rows
  ) {

    if (
      row.errors.length > 0
    ) {

      continue;

    }


    const data =
      row.normalizedData;


    if (
      row.entityType ===
      "contribution"
    ) {

      /*
       * The final idempotency key is generated at
       * import time. Here we detect likely existing
       * duplicates using identifying contribution
       * fields, without bypassing the canonical RPC.
       */
      const {
        data: existing,
        error
      } =
        await supabase
          .from("contributions")
          .select(`
            id,
            group_id,
            member_id,
            amount,
            contribution_date,
            contribution_type,
            payment_method,
            reference
          `)
          .eq(
            "group_id",
            state.group.id
          )
          .eq(
            "member_id",
            data.member_id
          )
          .eq(
            "amount",
            data.amount
          )
          .eq(
            "contribution_date",
            data.contribution_date
          )
          .eq(
            "contribution_type",
            CONTRIBUTION_TYPE
          )
          .eq(
            "payment_method",
            data.payment_method
          )
          .limit(10);


      if (error) {
        throw error;
      }


      if (
        existing &&
        existing.length > 0
      ) {

        row.warnings.push(
          `A likely existing contribution was found for this member/date/amount/payment method.`
        );

      }

    }


    if (
      row.entityType ===
      "expense"
    ) {

      const {
        data: existing,
        error
      } =
        await supabase
          .from("expenses")
          .select(`
            id,
            group_id,
            description,
            amount,
            date,
            category,
            approval_status
          `)
          .eq(
            "group_id",
            state.group.id
          )
          .eq(
            "description",
            data.description
          )
          .eq(
            "amount",
            data.amount
          )
          .eq(
            "date",
            data.date
          )
          .eq(
            "category",
            data.category
          )
          .limit(10);


      if (error) {
        throw error;
      }


      if (
        existing &&
        existing.length > 0
      ) {

        row.warnings.push(
          "A likely existing expense was found with the same description, amount, date and category."
        );

      }

    }

  }

}


/* =========================================================
   VALIDATION
========================================================= */

async function validateRows() {

  const protectedFields =
    detectProtectedFields();


  if (
    protectedFields.length > 0
  ) {

    throw new Error(
      `Protected source fields detected: ${protectedFields.join(", ")}`
    );

  }


  const mappings =
    collectMappings();


  const fields =
    state.entityType === "contribution"
      ? CONTRIBUTION_FIELDS
      : EXPENSE_FIELDS;


  const mappingErrors = [];


  fields.forEach(
    function (field) {

      if (
        field.required &&
        !mappings[field.key]
      ) {

        mappingErrors.push(
          `Required field "${field.label}" has not been mapped.`
        );

      }

    }
  );


  if (
    mappingErrors.length > 0
  ) {

    throw new Error(
      mappingErrors.join(" ")
    );

  }


  const normalizedRows = [];


  for (
    const sourceRow of
      state.sourceRows
  ) {

    const normalized =
      state.entityType ===
        "contribution"
        ? await normalizeContribution(
            sourceRow
          )
        : await normalizeExpense(
            sourceRow
          );


    normalizedRows.push(
      normalized
    );

  }


  detectInternalDuplicates(
    normalizedRows
  );


  await detectLiveDuplicates(
    normalizedRows
  );


  normalizedRows.forEach(
    function (row) {

      if (
        row.errors.length > 0
      ) {

        row.status =
          "error";

      }

      else if (
        row.warnings.length > 0
      ) {

        row.status =
          "warning";

      }

      else {

        row.status =
          "valid";

      }

    }
  );


  state.normalizedRows =
    normalizedRows;


  const errors =
    normalizedRows.filter(
      row =>
        row.status === "error"
    );


  const warnings =
    normalizedRows.filter(
      row =>
        row.status === "warning"
    );


  const valid =
    normalizedRows.filter(
      row =>
        row.status === "valid"
    );


  state.validation = {

    total:
      normalizedRows.length,

    valid:
      valid.length,

    warnings:
      warnings.length,

    errors:
      errors.length,

    ready:
      errors.length === 0 &&
      normalizedRows.length > 0

  };


  renderValidation();


  return state.validation;

}


/* =========================================================
   VALIDATION UI
========================================================= */

function renderValidation() {

  const summary =
    byId(
      "validationSummary"
    );


  const errorsPanel =
    byId(
      "validationErrorsPanel"
    );


  const errorsList =
    byId(
      "validationErrors"
    );


  const warningsPanel =
    byId(
      "validationWarningsPanel"
    );


  const warningsList =
    byId(
      "validationWarnings"
    );


  const validation =
    state.validation;


  if (!validation) {
    return;
  }


  const errorRows =
    state.normalizedRows.filter(
      row =>
        row.errors.length > 0
    );


  const warningRows =
    state.normalizedRows.filter(
      row =>
        row.warnings.length > 0
    );


  summary.innerHTML = [

    summaryBox(
      "Total rows",
      validation.total
    ),

    summaryBox(
      "Valid",
      validation.valid,
      "success"
    ),

    summaryBox(
      "Warnings",
      validation.warnings,
      "warning"
    ),

    summaryBox(
      "Errors",
      validation.errors,
      "error"
    ),

    summaryBox(
      "Duplicates",
      countDuplicateRows()
    ),

    summaryBox(
      "Ready",
      validation.ready
        ? validation.total
        : 0,
      validation.ready
        ? "success"
        : "error"
    )

  ].join("");


  errorsPanel.hidden =
    errorRows.length === 0;


  errorsList.innerHTML =
    errorRows
      .slice(0, 100)
      .map(
        row =>
          `<li>
            Row ${row.sourceRowNumber}:
            ${escapeHtml(row.errors.join(" "))}
          </li>`
      )
      .join("");


  warningsPanel.hidden =
    warningRows.length === 0;


  warningsList.innerHTML =
    warningRows
      .slice(0, 100)
      .map(
        row =>
          `<li>
            Row ${row.sourceRowNumber}:
            ${escapeHtml(row.warnings.join(" "))}
          </li>`
      )
      .join("");


  byId(
    "previewButton"
  ).disabled =
    !validation.ready;

}


function summaryBox(
  label,
  value,
  modifier = ""
) {

  return `
    <div class="summary-box ${modifier}">

      <div class="summary-label">
        ${escapeHtml(label)}
      </div>

      <div class="summary-value">
        ${escapeHtml(value)}
      </div>

    </div>
  `;

}


function countDuplicateRows() {

  return state.normalizedRows.filter(
    row =>
      row.errors.some(
        error =>
          error.includes(
            "Duplicate"
          )
      )
  ).length;

}


/* =========================================================
   STAGING
========================================================= */

async function createBatch() {

  if (!state.group?.id) {

    throw new Error(
      "Current group context is missing."
    );

  }


  /*
   * The authenticated database policies remain
   * authoritative. We still send the current
   * group because the staging schema requires it,
   * but it is derived exclusively from auth context.
   */
  const {
    data,
    error
  } =
    await supabase
      .from("data_import_batches")
      .insert({

        group_id:
          state.group.id,

        created_by:
          state.member.id,

        source_type:
          "csv",

        source_name:
          state.file?.name ||
          "migration.csv",

        status:
          "uploaded"

      })
      .select(
        "id"
      )
      .single();


  if (error) {

    throw error;

  }


  if (!data?.id) {

    throw new Error(
      "Migration batch was not created."
    );

  }


  state.batchId =
    data.id;


  return data.id;

}


/* =========================================================
   STAGING MAPPINGS
========================================================= */

async function stageMappings() {

  if (!state.batchId) {

    throw new Error(
      "Migration batch does not exist."
    );

  }


  const rows =
    Object.entries(
      state.mappings
    )
      .filter(
        ([, sourceColumn]) =>
          Boolean(sourceColumn)
      )
      .map(
        (
          [
            targetField,
            sourceColumn
          ]
        ) => {

          return {

            batch_id:
              state.batchId,

            source_column:
              sourceColumn,

            target_entity:
              state.entityType,

            target_field:
              targetField,

            mapping_type:
              "direct"

          };

        }
      );


  if (
    rows.length === 0
  ) {

    throw new Error(
      "No migration mappings were selected."
    );

  }


  const {
    error
  } =
    await supabase
      .from("data_import_mappings")
      .insert(
        rows
      );


  if (error) {

    throw error;

  }

}


/* =========================================================
   STAGING ROWS
========================================================= */

async function stageRows() {

  if (!state.batchId) {

    throw new Error(
      "Migration batch does not exist."
    );

  }


  const rows =
    state.normalizedRows
      .map(
        function (row) {

          return {

            batch_id:
              state.batchId,

            entity_type:
              row.entityType,

            source_row_number:
              row.sourceRowNumber,

            source_data:
              row.sourceData,

            normalized_data:
              row.normalizedData,

            status:
              row.status === "valid" ||
              row.status === "warning"
                ? row.status
                : "error",

            error_message:
              row.errors.length > 0
                ? row.errors.join(" ")
                : null

          };

        }
      );


  const chunkSize =
    250;


  for (
    let index = 0;
    index < rows.length;
    index += chunkSize
  ) {

    const chunk =
      rows.slice(
        index,
        index + chunkSize
      );


    const {
      error
    } =
      await supabase
        .from("data_import_rows")
        .insert(
          chunk
        );


    if (error) {

      throw error;

    }

  }

}


/* =========================================================
   BATCH STATUS
========================================================= */

async function updateBatchStatus(
  status,
  summary = {}
) {

  if (!state.batchId) {
    return;
  }


  const payload = {

    status,

    summary

  };


  if (
    status === "importing"
  ) {

    payload.started_at =
      new Date().toISOString();

  }


  if (
    status === "completed"
  ) {

    payload.completed_at =
      new Date().toISOString();

  }


  const {
    error
  } =
    await supabase
      .from("data_import_batches")
      .update(
        payload
      )
      .eq(
        "id",
        state.batchId
      );


  if (error) {

    throw error;

  }

}


/* =========================================================
   PREVIEW
========================================================= */

function renderPreview() {

  const summary =
    byId(
      "previewSummary"
    );


  const body =
    byId(
      "previewTableBody"
    );


  const rows =
    state.normalizedRows;


  const valid =
    rows.filter(
      row =>
        row.status === "valid"
    );


  const warnings =
    rows.filter(
      row =>
        row.status === "warning"
    );


  const errors =
    rows.filter(
      row =>
        row.status === "error"
    );


  const contributionRows =
    rows.filter(
      row =>
        row.entityType ===
        "contribution"
    );


  const expenseRows =
    rows.filter(
      row =>
        row.entityType ===
        "expense"
    );


  const contributionTotal =
    contributionRows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.normalizedData.amount ||
          0
        ),
      0
    );


  const expenseTotal =
    expenseRows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.normalizedData.amount ||
          0
        ),
      0
    );


  summary.innerHTML = [

    summaryBox(
      "Total rows",
      rows.length
    ),

    summaryBox(
      "Valid",
      valid.length,
      "success"
    ),

    summaryBox(
      "Warnings",
      warnings.length,
      "warning"
    ),

    summaryBox(
      "Errors",
      errors.length,
      "error"
    ),

    summaryBox(
      "Contribution total",
      formatMoney(
        contributionTotal
      )
    ),

    summaryBox(
      "Expense total",
      formatMoney(
        expenseTotal
      )
    )

  ].join("");


  body.innerHTML =
    rows
      .map(
        function (row) {

          const data =
            row.normalizedData;


          const isContribution =
            row.entityType ===
            "contribution";


          const subject =
            isContribution
              ? (
                  resolveMemberDisplay(
                    data.member_id
                  )
                )
              : data.description;


          const date =
            isContribution
              ? data.contribution_date
              : data.date;


          const month =
            isContribution
              ? data.month
              : monthFromDate(
                  data.date
                );


          const payment =
            isContribution
              ? data.payment_method
              : "—";


          const period =
            row.period?.status ||
            "unresolved";


          const statusClass =
            row.status === "valid"
              ? "status-valid"
              : row.status === "warning"
                ? "status-warning"
                : "status-error";


          return `
            <tr>

              <td>
                ${escapeHtml(row.sourceRowNumber)}
              </td>

              <td>
                ${escapeHtml(row.entityType)}
              </td>

              <td>
                ${escapeHtml(subject || "—")}
              </td>

              <td>
                ${escapeHtml(
                  formatMoney(
                    data.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(date || "—")}
              </td>

              <td>
                ${escapeHtml(month || "—")}
              </td>

              <td>
                ${escapeHtml(payment)}
              </td>

              <td>
                ${escapeHtml(period)}
              </td>

              <td>

                <span class="status-badge ${statusClass}">
                  ${escapeHtml(row.status)}
                </span>

              </td>

            </tr>
          `;

        }
      )
      .join("");


  byId(
    "confirmReviewButton"
  ).disabled =
    errors.length > 0;

}


function resolveMemberDisplay(
  memberId
) {

  const row =
    state.normalizedRows.find(
      candidate =>
        candidate.normalizedData
          ?.member_id ===
        memberId
    );


  return (
    row?.normalizedData
      ?.member_identifier ||
    memberId ||
    "—"
  );

}


/* =========================================================
   CONFIRMATION
========================================================= */

function renderConfirmation() {

  const rows =
    state.normalizedRows;


  const contributionRows =
    rows.filter(
      row =>
        row.entityType ===
        "contribution"
    );


  const expenseRows =
    rows.filter(
      row =>
        row.entityType ===
        "expense"
    );


  const contributionTotal =
    contributionRows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.normalizedData.amount ||
          0
        ),
      0
    );


  const expenseTotal =
    expenseRows.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.normalizedData.amount ||
          0
        ),
      0
    );


  const months =
    Array.from(
      new Set(
        rows
          .map(
            row =>
              row.entityType ===
                "contribution"
                ? row.normalizedData.month
                : monthFromDate(
                    row.normalizedData.date
                  )
          )
          .filter(Boolean)
      )
    )
      .sort();


  byId(
    "confirmationSummary"
  ).innerHTML = [

    reconciliationItem(
      "Contributions",
      contributionRows.length
    ),

    reconciliationItem(
      "Contribution total",
      formatMoney(
        contributionTotal
      )
    ),

    reconciliationItem(
      "Expenses",
      expenseRows.length
    ),

    reconciliationItem(
      "Expense total",
      formatMoney(
        expenseTotal
      )
    ),

    reconciliationItem(
      "Affected months",
      months.join(", ") || "None"
    ),

    reconciliationItem(
      "Rows",
      rows.length
    ),

    reconciliationItem(
      "Warnings",
      rows.filter(
        row =>
          row.warnings.length > 0
      ).length
    ),

    reconciliationItem(
      "Closed-period imports",
      0
    )

  ].join("");


  byId(
    "confirmationCheckbox"
  ).checked =
    false;


  byId(
    "startImportButton"
  ).disabled =
    true;

}


function reconciliationItem(
  label,
  value
) {

  return `
    <div class="reconciliation-item">

      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${escapeHtml(value)}
      </strong>

    </div>
  `;

}


/* =========================================================
   CONTRIBUTION IMPORT
========================================================= */

function generatePaymentId() {

  /*
   * UUID generated client-side solely as the
   * canonical payment idempotency key.
   *
   * It is NOT an allocation ID.
   * It is NOT an obligation ID.
   */
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {

    return crypto.randomUUID();

  }


  throw new Error(
    "Secure UUID generation is unavailable. Contribution import stopped."
  );

}


async function importContribution(
  row
) {

  const data =
    row.normalizedData;


  if (
    !data.member_id
  ) {

    throw new Error(
      `Source row ${row.sourceRowNumber} has no resolved member.`
    );

  }


  if (
    !data.contribution_date
  ) {

    throw new Error(
      `Source row ${row.sourceRowNumber} has no contribution date.`
    );

  }


  const paymentId =
    generatePaymentId();


  /*
   * IMPORTANT:
   *
   * This is the only contribution write path.
   *
   * The importer does NOT:
   *   - insert contributions directly
   *   - insert obligations
   *   - insert allocations
   *   - call a second allocator
   *
   * The canonical live function remains authoritative.
   */
  const {
    data: result,
    error
  } =
    await supabase.rpc(
      "cl_2b_record_contribution",
      {

        p_payment_id:
          paymentId,

        p_group_id:
          state.group.id,

        p_member_id:
          data.member_id,

        p_amount:
          data.amount,

        p_contribution_date:
          data.contribution_date,

        p_contribution_type:
          CONTRIBUTION_TYPE,

        p_payment_method:
          data.payment_method,

        p_reference:
          data.reference,

        p_mpesa_reference:
          data.mpesa_reference,

        p_goal_id:
          data.goal_id,

        p_notes:
          data.notes

      }
    );


  if (error) {

    throw error;

  }


  if (
    !result?.ok
  ) {

    throw new Error(
      result?.error ||
      `Canonical contribution recording failed for source row ${row.sourceRowNumber}.`
    );

  }


  return {

    sourceRowNumber:
      row.sourceRowNumber,

    entityType:
      "contribution",

    paymentId:
      result.payment_id ||
      paymentId,

    replay:
      Boolean(
        result.replay
      ),

    result

  };

}


/* =========================================================
   EXPENSE IMPORT
========================================================= */

async function importExpense(
  row
) {

  const data =
    row.normalizedData;


  /*
   * recorded_by is deliberately omitted.
   *
   * Existing database trigger/function is
   * responsible for resolving the authenticated
   * member inside the supplied current group.
   */
  const payload = {

    group_id:
      state.group.id,

    description:
      data.description,

    amount:
      data.amount,

    date:
      data.date,

    category:
      data.category,

    approval_status:
      data.approval_status

  };


  if (
    data.receipt_url
  ) {

    payload.receipt_url =
      data.receipt_url;

  }


  const {
    data: inserted,
    error
  } =
    await supabase
      .from("expenses")
      .insert(
        payload
      )
      .select(`
        id,
        group_id,
        description,
        amount,
        date,
        category,
        approval_status,
        recorded_by
      `)
      .single();


  if (error) {

    throw error;

  }


  if (!inserted?.id) {

    throw new Error(
      `Expense insertion returned no record for source row ${row.sourceRowNumber}.`
    );

  }


  if (
    inserted.group_id !==
    state.group.id
  ) {

    throw new Error(
      `Expense group verification failed for source row ${row.sourceRowNumber}.`
    );

  }


  return {

    sourceRowNumber:
      row.sourceRowNumber,

    entityType:
      "expense",

    expenseId:
      inserted.id,

    inserted

  };

}


/* =========================================================
   IMPORT
========================================================= */

async function executeImport() {

  if (state.busy) {
    return;
  }


  state.busy =
    true;


  try {

    setStep(
      "import"
    );

    showOnly(
      "importSection"
    );

    showStatus(
      "Import started. No unvalidated rows will be imported.",
      "info"
    );


    await updateBatchStatus(
      "importing",
      {
        total:
          state.normalizedRows.length,

        contribution_count:
          state.normalizedRows.filter(
            row =>
              row.entityType ===
              "contribution"
          ).length,

        expense_count:
          state.normalizedRows.filter(
            row =>
              row.entityType ===
              "expense"
          ).length

      }
    );


    /*
     * Stage only after explicit confirmation.
     */
    await stageMappings();

    await stageRows();


    const results = [];


    const rowsToImport =
      state.normalizedRows.filter(
        row =>
          row.status === "valid" ||
          row.status === "warning"
      );


    renderImportProgress(
      0,
      rowsToImport.length,
      results
    );


    for (
      let index = 0;
      index < rowsToImport.length;
      index += 1
    ) {

      const row =
        rowsToImport[index];


      /*
       * Re-check row state immediately before
       * financial write.
       */
      if (
        row.errors.length > 0
      ) {

        throw new Error(
          `Import safety check failed for source row ${row.sourceRowNumber}.`
        );

      }


      /*
       * Closed-period safety check is repeated
       * immediately before writing.
       */
      const month =
        row.entityType ===
          "contribution"
          ? row.normalizedData.month
          : monthFromDate(
              row.normalizedData.date
            );


      const period =
        await checkFinancialPeriod(
          month
        );


      if (
        period.status !==
        "open"
      ) {

        throw new Error(
          `Financial period ${month} is no longer open. Import stopped before writing source row ${row.sourceRowNumber}.`
        );

      }


      let result;


      if (
        row.entityType ===
        "contribution"
      ) {

        result =
          await importContribution(
            row
          );

      }

      else if (
        row.entityType ===
        "expense"
      ) {

        result =
          await importExpense(
            row
          );

      }

      else {

        throw new Error(
          `Unsupported migration entity type "${row.entityType}".`
        );

      }


      results.push(
        result
      );


      renderImportProgress(
        index + 1,
        rowsToImport.length,
        results
      );

    }


    state.importResults =
      results;


    await updateBatchStatus(
      "completed",
      {
        total:
          state.normalizedRows.length,

        imported:
          results.length,

        contribution_imported:
          results.filter(
            result =>
              result.entityType ===
              "contribution"
          ).length,

        expense_imported:
          results.filter(
            result =>
              result.entityType ===
              "expense"
          ).length

      }
    );


    byId(
      "verifyButton"
    ).disabled =
      false;


    showStatus(
      "Import completed. Verification is now required.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: migration import failed",
      error
    );


    try {

      await updateBatchStatus(
        "failed",
        {
          error:
            error.message
        }
      );

    }

    catch (
      statusError
    ) {

      console.error(
        "CHAMA LIVE: failed to update migration batch status",
        statusError
      );

    }


    showStatus(
      error.message ||
      "Migration failed.",
      "error"
    );

  }

  finally {

    state.busy =
      false;

  }

}


/* =========================================================
   IMPORT PROGRESS
========================================================= */

function renderImportProgress(
  completed,
  total,
  results
) {

  const container =
    byId(
      "importProgress"
    );


  const contributions =
    results.filter(
      result =>
        result.entityType ===
        "contribution"
    ).length;


  const expenses =
    results.filter(
      result =>
        result.entityType ===
        "expense"
    ).length;


  container.innerHTML = [

    summaryBox(
      "Processed",
      `${completed} / ${total}`
    ),

    summaryBox(
      "Contributions",
      contributions
    ),

    summaryBox(
      "Expenses",
      expenses
    ),

    summaryBox(
      "Failures",
      0,
      "success"
    )

  ].join("");

}


/* =========================================================
   VERIFICATION
========================================================= */

async function verifyImport() {

  if (
    !state.batchId
  ) {

    throw new Error(
      "Migration batch is missing."
    );

  }


  setStep(
    "verify"
  );

  showOnly(
    "verificationSection"
  );


  showStatus(
    "Verifying imported records.",
    "info"
  );


  const verification = {

    batchRows:
      0,

    importedRows:
      state.importResults.length,

    contributionVerified:
      0,

    expenseVerified:
      0,

    groupFailures:
      0,

    missingFailures:
      0,

    closedPeriodFailures:
      0

  };


  /*
   * Verify every imported contribution.
   */
  for (
    const result of
      state.importResults
  ) {

    if (
      result.entityType ===
      "contribution"
    ) {

      const {
        data,
        error
      } =
        await supabase
          .from("contributions")
          .select(`
            id,
            group_id,
            member_id,
            amount,
            contribution_date,
            contribution_type,
            payment_method
          `)
          .eq(
            "id",
            result.paymentId
          )
          .limit(1);


      if (error) {
        throw error;
      }


      if (
        !data ||
        data.length === 0
      ) {

        verification.missingFailures +=
          1;

        continue;

      }


      const contribution =
        data[0];


      if (
        contribution.group_id !==
        state.group.id
      ) {

        verification.groupFailures +=
          1;

        continue;

      }


      if (
        contribution.amount !==
        state.normalizedRows.find(
          row =>
            row.sourceRowNumber ===
            result.sourceRowNumber
        )?.normalizedData.amount
      ) {

        verification.missingFailures +=
          1;

        continue;

      }


      const month =
        monthFromDate(
          contribution.contribution_date
        );


      const period =
        await checkFinancialPeriod(
          month
        );


      if (
        period.status ===
        "closed"
      ) {

        /*
         * This is not expected because the
         * canonical function rejects closed periods.
         */
        verification.closedPeriodFailures +=
          1;

        continue;

      }


      verification.contributionVerified +=
        1;

    }


    if (
      result.entityType ===
      "expense"
    ) {

      const {
        data,
        error
      } =
        await supabase
          .from("expenses")
          .select(`
            id,
            group_id,
            description,
            amount,
            date,
            category,
            approval_status,
            recorded_by
          `)
          .eq(
            "id",
            result.expenseId
          )
          .limit(1);


      if (error) {
        throw error;
      }


      if (
        !data ||
        data.length === 0
      ) {

        verification.missingFailures +=
          1;

        continue;

      }


      const expense =
        data[0];


      if (
        expense.group_id !==
        state.group.id
      ) {

        verification.groupFailures +=
          1;

        continue;

      }


      const sourceRow =
        state.normalizedRows.find(
          row =>
            row.sourceRowNumber ===
            result.sourceRowNumber
        );


      if (
        !sourceRow
      ) {

        verification.missingFailures +=
          1;

        continue;

      }


      if (
        Number(expense.amount) !==
        Number(
          sourceRow.normalizedData.amount
        )
      ) {

        verification.missingFailures +=
          1;

        continue;

      }


      verification.expenseVerified +=
        1;

    }

  }


  verification.ok =
    verification.missingFailures === 0 &&
    verification.groupFailures === 0 &&
    verification.closedPeriodFailures === 0 &&
    verification.contributionVerified +
      verification.expenseVerified ===
      state.importResults.length;


  state.verification =
    verification;


  byId(
    "verificationSummary"
  ).innerHTML = [

    reconciliationItem(
      "Imported rows",
      verification.importedRows
    ),

    reconciliationItem(
      "Contributions verified",
      verification.contributionVerified
    ),

    reconciliationItem(
      "Expenses verified",
      verification.expenseVerified
    ),

    reconciliationItem(
      "Group failures",
      verification.groupFailures
    ),

    reconciliationItem(
      "Missing records",
      verification.missingFailures
    ),

    reconciliationItem(
      "Closed-period failures",
      verification.closedPeriodFailures
    ),

    reconciliationItem(
      "Verification",
      verification.ok
        ? "PASS"
        : "FAIL"
    )

  ].join("");


  if (
    verification.ok
  ) {

    showStatus(
      "Migration verification PASSED.",
      "success"
    );

  }

  else {

    showStatus(
      "Migration verification FAILED. Review the reconciliation before taking any further action.",
      "error"
    );

  }

}


/* =========================================================
   MONEY
========================================================= */

function formatMoney(
  amount
) {

  return (
    "KSh " +
    Number(
      amount || 0
    ).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   FILE HANDLING
========================================================= */

async function handleFile(
  file
) {

  if (!file) {
    return;
  }


  const name =
    String(
      file.name ||
      ""
    )
      .toLowerCase();


  if (
    !name.endsWith(".csv")
  ) {

    showStatus(
      "Only CSV files are accepted by this candidate.",
      "error"
    );

    return;

  }


  state.file =
    file;


  clearStatus();


  try {

    const text =
      await file.text();


    const parsed =
      parseCsv(text);


    buildSourceRows(
      parsed
    );


    state.entityType =
      detectEntityType();


    if (
      !IMPORTABLE_ENTITY_TYPES.includes(
        state.entityType
      )
    ) {

      throw new Error(
        "The source file could not be identified as a Contributions or Expenses import."
      );

    }


    state.mappings = {};


    renderMapping();


    setStep(
      "map"
    );

    showOnly(
      "mappingSection"
    );


    showStatus(
      `${file.name}: ${state.sourceRows.length} source rows loaded as ${state.entityType}.`,
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: file parsing failed",
      error
    );


    resetMigrationState(
      false
    );


    showOnly(
      "uploadSection"
    );

    setStep(
      "upload"
    );


    showStatus(
      error.message ||
      "The source file could not be read.",
      "error"
    );

  }

}


/* =========================================================
   RESET
========================================================= */

function resetMigrationState(
  preserveContext = true
) {

  const context = {

    user:
      state.user,

    member:
      state.member,

    group:
      state.group

  };


  Object.keys(
    state
  ).forEach(
    function (key) {

      state[key] =
        Array.isArray(
          state[key]
        )
          ? []
          : null;

    }
  );


  state.currentStep =
    "upload";

  state.busy =
    false;


  if (preserveContext) {

    state.user =
      context.user;

    state.member =
      context.member;

    state.group =
      context.group;

  }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  const fileInput =
    byId(
      "fileInput"
    );


  const chooseFileButton =
    byId(
      "chooseFileButton"
    );


  const uploadZone =
    byId(
      "uploadZone"
    );


  chooseFileButton.addEventListener(
    "click",
    function () {

      fileInput.click();

    }
  );


  fileInput.addEventListener(
    "change",
    function () {

      const file =
        fileInput.files?.[0];

      handleFile(
        file
      );

    }
  );


  [
    "dragenter",
    "dragover"
  ]
    .forEach(
      eventName => {

        uploadZone.addEventListener(
          eventName,
          function (event) {

            event.preventDefault();

            uploadZone.classList.add(
              "dragover"
            );

          }
        );

      }
    );


  [
    "dragleave",
    "drop"
  ]
    .forEach(
      eventName => {

        uploadZone.addEventListener(
          eventName,
          function (event) {

            event.preventDefault();

            uploadZone.classList.remove(
              "dragover"
            );

          }
        );

      }
    );


  uploadZone.addEventListener(
    "drop",
    function (event) {

      const file =
        event.dataTransfer
          ?.files?.[0];

      handleFile(
        file
      );

    }
  );


  byId(
    "backToUploadButton"
  ).addEventListener(
    "click",
    function () {

      showOnly(
        "uploadSection"
      );

      setStep(
        "upload"
      );

      clearStatus();

    }
  );


  byId(
    "validateButton"
  ).addEventListener(
    "click",
    async function () {

      if (state.busy) {
        return;
      }


      state.busy =
        true;


      try {

        showStatus(
          "Validating source rows. No financial writes are being performed.",
          "info"
        );


        setStep(
          "validate"
        );

        showOnly(
          "validationSection"
        );


        await validateRows();


        if (
          state.validation.ready
        ) {

          showStatus(
            "Validation passed. You can review the import preview.",
            "success"
          );

        }

        else {

          showStatus(
            "Validation found blocking errors. Nothing is ready to import.",
            "error"
          );

        }

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: validation failed",
          error
        );


        showStatus(
          error.message ||
          "Validation failed.",
          "error"
        );

      }

      finally {

        state.busy =
          false;

      }

    }
  );


  byId(
    "backToMappingButton"
  ).addEventListener(
    "click",
    function () {

      showOnly(
        "mappingSection"
      );

      setStep(
        "map"
      );

    }
  );


  byId(
    "previewButton"
  ).addEventListener(
    "click",
    function () {

      renderPreview();

      setStep(
        "preview"
      );

      showOnly(
        "previewSection"
      );

      showStatus(
        "Preview ready. No records have been imported.",
        "info"
      );

    }
  );


  byId(
    "backToValidationButton"
  ).addEventListener(
    "click",
    function () {

      showOnly(
        "validationSection"
      );

      setStep(
        "validate"
      );

    }
  );


  byId(
    "confirmReviewButton"
  ).addEventListener(
    "click",
    function () {

      renderConfirmation();

      setStep(
        "confirm"
      );

      showOnly(
        "confirmationSection"
      );

      showStatus(
        "Review the final reconciliation before authorizing import.",
        "warning"
      );

    }
  );


  byId(
    "backToPreviewButton"
  ).addEventListener(
    "click",
    function () {

      showOnly(
        "previewSection"
      );

      setStep(
        "preview"
      );

    }
  );


  byId(
    "confirmationCheckbox"
  ).addEventListener(
    "change",
    function () {

      byId(
        "startImportButton"
      ).disabled =
        !this.checked;

    }
  );


  byId(
    "startImportButton"
  ).addEventListener(
    "click",
    async function () {

      if (
        !byId(
          "confirmationCheckbox"
        ).checked
      ) {

        showStatus(
          "Explicit confirmation is required.",
          "error"
        );

        return;

      }


      await executeImport();

    }
  );


  byId(
    "verifyButton"
  ).addEventListener(
    "click",
    async function () {

      if (state.busy) {
        return;
      }


      state.busy =
        true;


      try {

        await verifyImport();

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: verification failed",
          error
        );


        showStatus(
          error.message ||
          "Verification failed.",
          "error"
        );

      }

      finally {

        state.busy =
          false;

      }

    }
  );


  byId(
    "newMigrationButton"
  ).addEventListener(
    "click",
    function () {

      window.location.reload();

    }
  );

}


/* =========================================================
   BOOT
========================================================= */

async function boot() {

  try {

    await loadContext();

    setupEvents();

    showOnly(
      "uploadSection"
    );

    setStep(
      "upload"
    );


    showStatus(
      "Authenticated migration workspace ready.",
      "success"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: data migration boot failed",
      error
    );


    showStatus(
      error.message ||
      "Data Migration could not be initialized.",
      "error"
    );

  }

}


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true
    }
  );

}

else {

  boot();

}
