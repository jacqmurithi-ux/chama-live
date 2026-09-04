/* CHAMA LIVE — Data Migration candidate. NO APPLY / NO DEPLOY. */
import { supabase, getMyMember, getMyGroupId, money } from "./auth.js";

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

const FORBIDDEN = new Set([
  "id",
  "group_id",
  "recorded_by",
  "payment_id",
  "obligation_id",
  "allocation_id",
  "contribution_allocations",
  "contribution_obligations",
  "financial_period_id",
  "financial_period",
  "period_status"
]);

const DEF = {
  contribution: [
    [
      "member_identifier",
      "Member identifier",
      "member_match",
      true
    ],
    [
      "amount",
      "Amount",
      "amount_parse",
      true
    ],
    [
      "contribution_date",
      "Contribution date",
      "date_parse",
      true
    ],
    [
      "payment_method",
      "Payment method",
      "direct",
      true
    ],
    [
      "contribution_type",
      "Contribution type",
      "direct",
      false
    ],
    [
      "reference",
      "Reference",
      "direct",
      false
    ],
    [
      "mpesa_reference",
      "M-Pesa reference",
      "direct",
      false
    ],
    [
      "goal",
      "Goal",
      "direct",
      false
    ],
    [
      "notes",
      "Notes",
      "direct",
      false
    ],
    [
      "month",
      "Source month (cross-check only)",
      "direct",
      false
    ]
  ],

  expense: [
    [
      "description",
      "Description",
      "direct",
      true
    ],
    [
      "amount",
      "Amount",
      "amount_parse",
      true
    ],
    [
      "date",
      "Expense date",
      "date_parse",
      true
    ],
    [
      "category",
      "Category",
      "direct",
      false
    ],
    [
      "approval_status",
      "Approval status",
      "direct",
      false
    ],
    [
      "receipt_url",
      "Receipt/reference",
      "direct",
      false
    ]
  ]
};

const state = {
  member: null,
  groupId: null,
  fileName: "",
  sourceType: "",
  entity: "contribution",
  headers: [],
  rows: [],
  staged: [],
  batchId: null,
  mappings: {},
  results: [],
  imported: []
};

const $ = (id) => document.getElementById(id);

const clean = (value) =>
  String(value ?? "").trim();

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function msg(text, kind = "info") {
  const element = $("message");

  if (!element) {
    return;
  }

  element.className = `notice ${kind}`;
  element.textContent = text;
}

function step(currentStep) {
  const order = [
    "upload",
    "mapping",
    "validate",
    "preview",
    "import",
    "verify"
  ];

  document.querySelectorAll(".step").forEach((element) => {
    const index = order.indexOf(element.dataset.step);
    const currentIndex = order.indexOf(currentStep);

    element.classList.toggle(
      "active",
      element.dataset.step === currentStep
    );

    element.classList.toggle(
      "done",
      index !== -1 &&
      currentIndex !== -1 &&
      index < currentIndex
    );
  });
}

function moneySafe(value) {
  if (typeof money === "function") {
    return money(value);
  }

  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    maximumFractionDigits: 2
  })}`;
}

function num(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const cleaned = clean(value);

  if (!cleaned) {
    return null;
  }

  const parsed = Number(
    cleaned.replace(/[, ]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function validIso(value) {
  const dateValue = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(dateValue.getTime()) &&
    dateValue.toISOString().slice(0, 10) === value
  );
}

function date(value) {
  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value.toISOString().slice(0, 10);
  }

  const stringValue = clean(value);

  if (!stringValue) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
  ) {
    return validIso(stringValue)
      ? stringValue
      : null;
  }

  const match = stringValue.match(
    /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/
  );

  if (!match) {
    return null;
  }

  const iso =
    `${match[3]}-` +
    `${match[2].padStart(2, "0")}-` +
    `${match[1].padStart(2, "0")}`;

  return validIso(iso)
    ? iso
    : null;
}

function month(value) {
  return value
    ? value.slice(0, 7)
    : null;
}

function normHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csv(text) {
  const output = [];

  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];

    if (quoted) {
      if (
        character === '"' &&
        text[i + 1] === '"'
      ) {
        field += '"';
        i += 1;
        continue;
      }

      if (character === '"') {
        quoted = false;
        continue;
      }

      field += character;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      row.push(field);
      output.push(row);
      row = [];
      field = "";
      continue;
    }

    if (character !== "\r") {
      field += character;
    }
  }

  row.push(field);

  if (
    row.some((value) => clean(value))
  ) {
    output.push(row);
  }

  return output;
}

async function readFile(file) {
  const fileName =
    file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    return csv(await file.text());
  }

  if (fileName.endsWith(".xlsx")) {
    const XLSX = await import(XLSX_URL);

    const workbook = XLSX.read(
      await file.arrayBuffer(),
      {
        type: "array",
        cellDates: true
      }
    );

    const sheetName =
      workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error(
        "Workbook has no sheet."
      );
    }

    return XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName],
      {
        header: 1,
        defval: ""
      }
    );
  }

  throw new Error(
    "Only CSV and XLSX files are supported."
  );
}

function matrixRows(matrix) {
  if (!matrix.length) {
    throw new Error("File is empty.");
  }

  const headers = matrix[0].map(
    (value, index) =>
      clean(value) ||
      `Column ${index + 1}`
  );

  const rows = matrix
    .slice(1)
    .map((array) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          array[index] ?? ""
        ])
      )
    )
    .filter((row) =>
      Object.values(row).some(
        (value) => clean(value)
      )
    );

  if (!rows.length) {
    throw new Error(
      "File contains no data rows."
    );
  }

  return {
    headers,
    rows
  };
}

function autoMap() {
  const headerMap = new Map(
    state.headers.map((header) => [
      normHeader(header),
      header
    ])
  );

  const aliases = {
    member_identifier: [
      "member_identifier",
      "member_id",
      "member_number",
      "membership_number",
      "member",
      "phone",
      "email",
      "name"
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
      "transaction_date",
      "date"
    ],

    payment_method: [
      "payment_method",
      "method",
      "mode"
    ],

    contribution_type: [
      "contribution_type",
      "type"
    ],

    reference: [
      "reference",
      "ref",
      "transaction_reference"
    ],

    mpesa_reference: [
      "mpesa_reference",
      "mpesa_ref",
      "mpesa_code",
      "transaction_code"
    ],

    goal: [
      "goal",
      "goal_name"
    ],

    notes: [
      "notes",
      "note"
    ],

    month: [
      "month",
      "contribution_month"
    ],

    description: [
      "description",
      "expense_description",
      "expense",
      "item"
    ],

    date: [
      "expense_date",
      "date",
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
      "receipt_reference",
      "receipt"
    ]
  };

  for (const [field] of DEF[state.entity]) {
    const alias =
      aliases[field]?.find(
        (candidate) =>
          headerMap.has(candidate)
      );

    if (alias) {
      state.mappings[field] =
        headerMap.get(alias);
    }
  }
}

async function context() {
  state.member =
    await getMyMember();

  state.groupId =
    await getMyGroupId();

  if (
    !state.member?.id ||
    !state.groupId
  ) {
    throw new Error(
      "Authenticated member/group context could not be resolved."
    );
  }
}

async function createBatch() {
  const {
    data,
    error
  } = await supabase
    .from("data_import_batches")
    .insert({
      group_id: state.groupId,
      source_name: state.fileName,
      source_type: state.sourceType,
      status: "uploaded",
      created_by: state.member.id,
      summary: {
        candidate: true,
        entity_type: state.entity,
        row_count: state.rows.length
      }
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  state.batchId = data.id;
}

async function stage() {
  const payload =
    state.rows.map((raw, index) => ({
      batch_id: state.batchId,
      source_sheet: null,
      source_row_number: index + 2,
      entity_type: state.entity,
      raw_data: raw,
      status: "pending"
    }));

  const {
    data,
    error
  } = await supabase
    .from("data_import_rows")
    .insert(payload)
    .select(
      "id,source_row_number,raw_data,status"
    );

  if (error) {
    throw error;
  }

  state.staged = data || [];
}

async function saveMaps() {
  for (
    const [field, source]
    of Object.entries(state.mappings)
  ) {
    if (!source) {
      continue;
    }

    if (FORBIDDEN.has(field)) {
      throw new Error(
        `Forbidden mapping: ${field}`
      );
    }

    const definition =
      DEF[state.entity].find(
        (item) => item[0] === field
      );

    const mappingType =
      definition?.[2] || "direct";

    const {
      error
    } = await supabase
      .from("data_import_mappings")
      .upsert(
        {
          batch_id: state.batchId,
          source_column: source,
          target_field: field,
          mapping_type: mappingType
        },
        {
          onConflict:
            "batch_id,source_column"
        }
      );

    if (error) {
      throw error;
    }
  }
}

function val(raw, field) {
  const source =
    state.mappings[field];

  return source
    ? raw[source]
    : undefined;
}

async function members(identifier) {
  const value = clean(identifier);

  if (!value) {
    return [];
  }

  const columns = [
    "member_number",
    "membership_number",
    "phone",
    "email",
    "name"
  ];

  const output = [];

  for (const column of columns) {
    let query = supabase
      .from("members")
      .select(
        "id,group_id,member_number,membership_number,name,phone,email,status"
      )
      .eq(
        "group_id",
        state.groupId
      );

    if (column === "name") {
      query = query.ilike(
        column,
        value
      );
    } else {
      query = query.eq(
        column,
        value
      );
    }

    const {
      data,
      error
    } = await query.limit(10);

    if (error) {
      throw error;
    }

    output.push(
      ...(data || [])
    );
  }

  return [
    ...new Map(
      output.map((member) => [
        member.id,
        member
      ])
    ).values()
  ];
}

async function goal(value) {
  const searchValue =
    clean(value);

  if (!searchValue) {
    return {
      goalId: null,
      error: null
    };
  }

  const {
    data,
    error
  } = await supabase
    .from("contribution_goals")
    .select("id,name")
    .eq(
      "group_id",
      state.groupId
    )
    .ilike(
      "name",
      searchValue
    )
    .limit(10);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return {
      goalId: null,
      error:
        "Goal could not be resolved within this group."
    };
  }

  if (data.length > 1) {
    return {
      goalId: null,
      error:
        "Multiple goals matched."
    };
  }

  return {
    goalId: data[0].id,
    error: null
  };
}

async function period(monthValue) {
  const {
    data,
    error
  } = await supabase
    .from("financial_periods")
    .select(
      "id,group_id,month,status"
    )
    .eq(
      "group_id",
      state.groupId
    )
    .eq(
      "month",
      monthValue
    )
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function validateContribution(raw) {
  const errors = [];
  const warnings = [];

  const memberIdentifier =
    val(
      raw,
      "member_identifier"
    );

  const amount =
    num(
      val(raw, "amount")
    );

  const contributionDate =
    date(
      val(
        raw,
        "contribution_date"
      )
    );

  const sourceMonth =
    clean(
      val(raw, "month")
    );

  const paymentMethod =
    clean(
      val(
        raw,
        "payment_method"
      )
    );

  const contributionType =
    clean(
      val(
        raw,
        "contribution_type"
      )
    ) || "monthly";

  const reference =
    clean(
      val(raw, "reference")
    ) || null;

  const mpesaReference =
    clean(
      val(
        raw,
        "mpesa_reference"
      )
    ) || null;

  const notes =
    clean(
      val(raw, "notes")
    ) || null;

  if (!clean(memberIdentifier)) {
    errors.push(
      "Member identifier is required."
    );
  }

  if (
    amount === null ||
    amount <= 0
  ) {
    errors.push(
      "Amount must be greater than zero."
    );
  }

  if (!contributionDate) {
    errors.push(
      "Contribution date is required and valid."
    );
  }

  if (
    ![
      "M-Pesa",
      "Cash",
      "Bank transfer"
    ].includes(paymentMethod)
  ) {
    errors.push(
      "Payment method must be M-Pesa, Cash, or Bank transfer."
    );
  }

  if (
    contributionType !== "monthly"
  ) {
    errors.push(
      "Contribution type must be monthly."
    );
  }

  if (
    sourceMonth &&
    contributionDate &&
    sourceMonth !==
      month(contributionDate)
  ) {
    errors.push(
      "Source month does not agree with contribution date."
    );
  }

  if (
    mpesaReference &&
    paymentMethod !== "M-Pesa"
  ) {
    errors.push(
      "M-Pesa reference is allowed only for M-Pesa."
    );
  }

  if (
    paymentMethod === "M-Pesa" &&
    reference &&
    mpesaReference &&
    reference !== mpesaReference
  ) {
    errors.push(
      "Reference and M-Pesa reference disagree."
    );
  }

  const memberMatches =
    await members(
      memberIdentifier
    );

  if (!memberMatches.length) {
    errors.push(
      "Member not found in current group."
    );
  }

  if (
    memberMatches.length > 1
  ) {
    errors.push(
      "Multiple member matches; import is blocked."
    );
  }

  const member =
    memberMatches[0] || null;

  let goalId = null;

  if (val(raw, "goal")) {
    const goalResult =
      await goal(
        val(raw, "goal")
      );

    if (goalResult.error) {
      errors.push(
        goalResult.error
      );
    }

    goalId =
      goalResult.goalId;
  }

  if (contributionDate) {
    const monthValue =
      month(contributionDate);

    const financialPeriod =
      await period(monthValue);

    if (!financialPeriod) {
      errors.push(
        `No financial period exists for ${monthValue}; importer will not create one.`
      );
    } else if (
      financialPeriod.status ===
      "closed"
    ) {
      errors.push(
        `Closed financial period: ${monthValue}.`
      );
    }
  }

  const normalized = {
    member_id:
      member?.id || null,

    amount,

    contribution_date:
      contributionDate,

    month:
      month(contributionDate),

    contribution_type:
      contributionType,

    payment_method:
      paymentMethod,

    reference,

    mpesa_reference:
      paymentMethod === "M-Pesa"
        ? (
            mpesaReference ||
            reference ||
            null
          )
        : null,

    goal_id:
      goalId,

    notes
  };

  if (!reference) {
    warnings.push(
      "Reference absent."
    );
  }

  if (!notes) {
    warnings.push(
      "Notes absent."
    );
  }

  return {
    normalized,
    errors,
    warnings
  };
}

async function validateExpense(raw) {
  const errors = [];
  const warnings = [];

  const description =
    clean(
      val(
        raw,
        "description"
      )
    );

  const amount =
    num(
      val(raw, "amount")
    );

  const expenseDate =
    date(
      val(
        raw,
        "date"
      )
    );

  const category =
    clean(
      val(
        raw,
        "category"
      )
    ) || "other";

  const approvalStatus =
    clean(
      val(
        raw,
        "approval_status"
      )
    ) || "pending";

  const receiptUrl =
    clean(
      val(
        raw,
        "receipt_url"
      )
    ) || null;

  if (!description) {
    errors.push(
      "Description is required."
    );
  }

  if (
    amount === null ||
    amount <= 0
  ) {
    errors.push(
      "Amount must be greater than zero."
    );
  }

  if (!expenseDate) {
    errors.push(
      "Expense date is required and valid."
    );
  }

  if (
    ![
      "meeting",
      "welfare",
      "transport",
      "food",
      "supplies",
      "bank_charges",
      "admin",
      "other"
    ].includes(category)
  ) {
    errors.push(
      "Invalid expense category."
    );
  }

  if (
    ![
      "pending",
      "approved",
      "rejected"
    ].includes(approvalStatus)
  ) {
    errors.push(
      "Invalid approval status."
    );
  }

  if (expenseDate) {
    const monthValue =
      month(expenseDate);

    const financialPeriod =
      await period(monthValue);

    if (!financialPeriod) {
      errors.push(
        `No financial period exists for ${monthValue}; importer will not create one.`
      );
    } else if (
      financialPeriod.status ===
      "closed"
    ) {
      errors.push(
        `Closed financial period: ${monthValue}.`
      );
    }
  }

  if (!receiptUrl) {
    warnings.push(
      "Receipt/reference absent."
    );
  }

  return {
    normalized: {
      description,
      amount,
      date: expenseDate,
      category,
      approval_status:
        approvalStatus,
      receipt_url: receiptUrl,
      __idempotency_key:
        crypto.randomUUID()
    },
    errors,
    warnings
  };
}

function duplicateKey(normalized) {
  if (
    state.entity ===
    "contribution"
  ) {
    return [
      normalized.member_id,
      normalized.amount,
      normalized.contribution_date,
      normalized.payment_method,
      normalized.reference || "",
      normalized.mpesa_reference || ""
    ]
      .join("|")
      .toLowerCase();
  }

  return [
    normalized.description,
    normalized.amount,
    normalized.date,
    normalized.category
  ]
    .join("|")
    .toLowerCase();
}

async function validate() {
  const required =
    DEF[state.entity]
      .filter(
        (definition) =>
          definition[3] &&
          !state.mappings[
            definition[0]
          ]
      );

  if (required.length) {
    throw new Error(
      `Required mappings missing: ${required
        .map(
          (definition) =>
            definition[1]
        )
        .join(", ")}.`
    );
  }

  await saveMaps();

  const seen = new Set();

  state.results = [];

  for (const stagedRow of state.staged) {
    let result;

    try {
      result =
        state.entity ===
        "contribution"
          ? await validateContribution(
              stagedRow.raw_data
            )
          : await validateExpense(
              stagedRow.raw_data
            );

      const key =
        duplicateKey(
          result.normalized
        );

      if (seen.has(key)) {
        result.errors.push(
          "Duplicate row inside upload."
        );
      } else {
        seen.add(key);
      }

      /*
       * Stable client-side idempotency UUID.
       * This UUID is generated once for this
       * validation pass and persisted in
       * normalized_data.
       */
      result.normalized.__idempotency_key =
        crypto.randomUUID();
    } catch (error) {
      result = {
        normalized: {},
        errors: [
          error.message ||
            "Validation failed."
        ],
        warnings: []
      };
    }

    state.results.push({
      ...result,
      rowId: stagedRow.id,
      row: stagedRow.source_row_number,
      status:
        result.errors.length
          ? "error"
          : result.warnings.length
            ? "warning"
            : "valid"
    });
  }

  for (const result of state.results) {
    const {
      error
    } = await supabase
      .from("data_import_rows")
      .update({
        status: result.status,
        normalized_data:
          result.normalized,
        error_message:
          [
            ...result.errors,
            ...result.warnings
          ].join(" | ") || null
      })
      .eq(
        "id",
        result.rowId
      )
      .eq(
        "batch_id",
        state.batchId
      );

    if (error) {
      throw error;
    }
  }

  const errors =
    state.results.filter(
      (result) =>
        result.status === "error"
    ).length;

  const warnings =
    state.results.filter(
      (result) =>
        result.status === "warning"
    ).length;

  const total =
    state.results.reduce(
      (sum, result) =>
        sum +
        (
          Number(
            result.normalized.amount
          ) || 0
        ),
      0
    );

  const {
    error
  } = await supabase
    .from("data_import_batches")
    .update({
      status:
        errors
          ? "validating"
          : "ready",

      summary: {
        candidate: true,
        entity_type:
          state.entity,
        total_rows:
          state.results.length,
        valid_rows:
          state.results.length -
          errors -
          warnings,
        warning_rows:
          warnings,
        error_rows:
          errors,
        total_amount:
          total,
        ready_to_import:
          errors
            ? 0
            : state.results.length
      }
    })
    .eq(
      "id",
      state.batchId
    )
    .eq(
      "group_id",
      state.groupId
    );

  if (error) {
    throw error;
  }

  render();
  step("preview");

  msg(
    errors
      ? `Validation blocked import: ${errors} fatal row(s). No partial import is permitted.`
      : `Validation passed: ${state.results.length} row(s) ready for review.`,
    errors
      ? "error"
      : "success"
  );
}

function render() {
  const errors =
    state.results.filter(
      (result) =>
        result.status === "error"
    ).length;

  const warnings =
    state.results.filter(
      (result) =>
        result.status === "warning"
    ).length;

  const valid =
    state.results.length -
    errors -
    warnings;

  const total =
    state.results.reduce(
      (sum, result) =>
        sum +
        (
          Number(
            result.normalized.amount
          ) || 0
        ),
      0
    );

  const duplicateCount =
    state.results.filter(
      (result) =>
        result.errors.some(
          (message) =>
            /duplicate/i.test(
              message
            )
        ) ||
        result.warnings.some(
          (message) =>
            /duplicate/i.test(
              message
            )
        )
    ).length;

  if ($("stats")) {
    $("stats").innerHTML = [
      ["Rows", state.results.length],
      ["Valid", valid],
      ["Warnings", warnings],
      ["Errors", errors],
      ["Duplicates", duplicateCount],
      ["Amount", moneySafe(total)]
    ]
      .map(
        ([label, value]) =>
          `<div class="stat">
             <span class="muted">${esc(label)}</span>
             <b>${esc(value)}</b>
           </div>`
      )
      .join("");
  }

  if ($("validationMessage")) {
    $("validationMessage").innerHTML =
      errors
        ? `
          <div class="notice error">
            Import is blocked until every fatal validation error is resolved.
          </div>
        `
        : `
          <div class="notice success">
            No fatal validation errors remain.
            Review every row and the confirmation statement.
          </div>
        `;
  }

  if ($("preview")) {
    $("preview").innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Source row</th>
            <th>Status</th>
            <th>Normalized data</th>
            <th>Messages</th>
          </tr>
        </thead>
        <tbody>
          ${state.results
            .map(
              (result) => `
                <tr>
                  <td>${esc(result.row)}</td>
                  <td>
                    <span class="pill ${esc(
                      result.status
                    )}">
                      ${esc(result.status)}
                    </span>
                  </td>
                  <td class="mono">
                    ${esc(
                      JSON.stringify(
                        result.normalized
                      )
                    )}
                  </td>
                  <td>
                    ${esc(
                      [
                        ...result.errors,
                        ...result.warnings
                      ].join(" | ") || "—"
                    )}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  if ($("confirm")) {
    $("confirm").disabled =
      errors > 0 ||
      !state.results.length;
  }

  const confirmationTotal =
    state.results.reduce(
      (sum, result) =>
        sum +
        (
          Number(
            result.normalized.amount
          ) || 0
        ),
      0
    );

  if ($("confirmSummary")) {
    $("confirmSummary").textContent =
      `Confirming ${state.results.length} ${state.entity} row(s), total ${moneySafe(
        confirmationTotal
      )}. No closed-period row will import; no financial period will be created.`;
  }
}

async function importContribution(result) {
  const normalized =
    result.normalized;

  /*
   * IMPORTANT:
   * This intentionally calls the exact
   * hardened 11-parameter overload.
   */
  const {
    data,
    error
  } = await supabase.rpc(
    "cl_2b_record_contribution",
    {
      p_payment_id:
        normalized.__idempotency_key,

      p_group_id:
        state.groupId,

      p_member_id:
        normalized.member_id,

      p_amount:
        normalized.amount,

      p_contribution_date:
        normalized.contribution_date,

      p_contribution_type:
        normalized.contribution_type,

      p_payment_method:
        normalized.payment_method,

      p_reference:
        normalized.reference,

      p_mpesa_reference:
        normalized.mpesa_reference,

      p_goal_id:
        normalized.goal_id,

      p_notes:
        normalized.notes
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

async function importExpense(result) {
  const normalized =
    result.normalized;

  /*
   * Expenses do not currently have a
   * dedicated canonical payment RPC.
   *
   * Therefore the candidate uses the
   * supplied UUID as the expense primary key.
   * On retry after an ambiguous network
   * response, a duplicate UUID is looked up
   * and compared field-by-field.
   */
  normalized.__idempotency_key =
    normalized.__idempotency_key ||
    crypto.randomUUID();

  const payload = {
    id:
      normalized.__idempotency_key,

    group_id:
      state.groupId,

    description:
      normalized.description,

    amount:
      normalized.amount,

    date:
      normalized.date,

    category:
      normalized.category,

    approval_status:
      normalized.approval_status,

    receipt_url:
      normalized.receipt_url,

    recorded_by:
      state.member.id
  };

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .insert(payload)
    .select(
      "id,group_id,amount,date,category,approval_status"
    )
    .single();

  if (!error) {
    return data;
  }

  /*
   * A duplicate primary key can mean that the
   * original request succeeded but its response
   * was lost. Verify the existing row rather
   * than blindly inserting again.
   */
  if (error.code === "23505") {
    const {
      data: existing,
      error: lookupError
    } = await supabase
      .from("expenses")
      .select(
        "id,group_id,amount,date,category,approval_status,description,receipt_url"
      )
      .eq(
        "id",
        normalized.__idempotency_key
      )
      .eq(
        "group_id",
        state.groupId
      )
      .limit(1);

    if (lookupError) {
      throw lookupError;
    }

    if (
      existing?.length === 1
    ) {
      const existingExpense =
        existing[0];

      const same =
        existingExpense.description ===
          normalized.description &&
        Number(
          existingExpense.amount
        ) ===
          Number(
            normalized.amount
          ) &&
        existingExpense.date ===
          normalized.date &&
        existingExpense.category ===
          normalized.category &&
        existingExpense.approval_status ===
          normalized.approval_status &&
        existingExpense.receipt_url ===
          normalized.receipt_url;

      if (!same) {
        throw new Error(
          "Expense idempotency key already exists for different data."
        );
      }

      return existingExpense;
    }
  }

  throw error;
}

async function markRowImported(
  result,
  targetId
) {
  const {
    error
  } = await supabase
    .from("data_import_rows")
    .update({
      status: "imported",
      target_id: targetId,
      error_message: null
    })
    .eq(
      "id",
      result.rowId
    )
    .eq(
      "batch_id",
      state.batchId
    );

  if (!error) {
    return;
  }

  /*
   * The update may have succeeded while
   * the response was lost. Re-read before
   * treating the operation as failed.
   */
  const {
    data: check,
    error: checkError
  } = await supabase
    .from("data_import_rows")
    .select(
      "status,target_id"
    )
    .eq(
      "id",
      result.rowId
    )
    .eq(
      "batch_id",
      state.batchId
    )
    .limit(1);

  if (checkError) {
    throw checkError;
  }

  const rowState =
    check?.[0];

  if (
    rowState?.status !==
      "imported" ||
    rowState?.target_id !==
      targetId
  ) {
    throw error;
  }
}

async function runImport() {
  if (
    state.results.some(
      (result) =>
        result.status === "error"
    )
  ) {
    throw new Error(
      "Fatal validation errors remain."
    );
  }

  /*
   * IMPORTANT:
   *
   * The browser performs rows individually.
   * Therefore this is NOT a whole-batch
   * PostgreSQL transaction.
   *
   * Previously committed rows remain committed
   * if a later row fails.
   *
   * Recovery is achieved through:
   *   - stable contribution idempotency UUIDs
   *   - stable expense UUIDs
   *   - import-row state
   *   - duplicate/replay verification
   *
   * A future whole-batch transaction, if required,
   * must be implemented server-side as an explicitly
   * authenticated database operation. It must not
   * be faked in browser JavaScript.
   */

  const start =
    new Date().toISOString();

  const {
    error: beginError
  } = await supabase
    .from("data_import_batches")
    .update({
      status: "importing",
      started_at: start
    })
    .eq(
      "id",
      state.batchId
    )
    .eq(
      "group_id",
      state.groupId
    );

  if (beginError) {
    throw beginError;
  }

  state.imported = [];

  try {
    for (
      const result
      of state.results
    ) {
      /*
       * Recovery:
       * if a previous attempt already marked
       * the row imported, do not import it again.
       */
      if (
        result.status ===
        "imported"
      ) {
        continue;
      }

      const importedRecord =
        state.entity ===
        "contribution"
          ? await importContribution(
              result
            )
          : await importExpense(
              result
            );

      const targetId =
        state.entity ===
        "expense"
          ? importedRecord.id
          : (
              importedRecord?.payment_id ||
              importedRecord?.id ||
              result.normalized
                .__idempotency_key
            );

      state.imported.push({
        r: result,
        result: importedRecord
      });

      await markRowImported(
        result,
        targetId
      );

      result.status =
        "imported";
    }

    /*
     * Mark the batch completed only after
     * every row has been successfully imported
     * and its staging row has been marked imported.
     */
    const {
      error: completeError
    } = await supabase
      .from("data_import_batches")
      .update({
        status: "completed",
        completed_at:
          new Date().toISOString(),

        summary: {
          candidate: true,
          entity_type:
            state.entity,

          total_rows:
            state.results.length,

          imported_rows:
            state.results.filter(
              (result) =>
                result.status ===
                "imported"
            ).length,

          total_amount:
            state.results
              .filter(
                (result) =>
                  result.status ===
                  "imported"
              )
              .reduce(
                (sum, result) =>
                  sum +
                  (
                    Number(
                      result.normalized
                        .amount
                    ) || 0
                  ),
                0
              )
        }
      })
      .eq(
        "id",
        state.batchId
      )
      .eq(
        "group_id",
        state.groupId
      );

    if (completeError) {
      throw completeError;
    }

    /*
     * Verification follows the completion
     * state update. If verification fails,
     * the UI explicitly reports that the
     * batch must not be treated as reconciled.
     */
    await verify();
  } catch (error) {
    /*
     * Do not attempt destructive rollback
     * from the browser.
     *
     * Existing successful rows remain safely
     * committed and can be reconciled/retried
     * using their stable identifiers.
     */
    await supabase
      .from("data_import_batches")
      .update({
        status: "failed",
        completed_at:
          new Date().toISOString()
      })
      .eq(
        "id",
        state.batchId
      )
      .eq(
        "group_id",
        state.groupId
      );

    throw error;
  }
}

async function verify() {
  const checks = [];

  for (
    const imported
    of state.imported
  ) {
    const normalized =
      imported.r.normalized;

    let query;

    if (
      state.entity ===
      "expense"
    ) {
      query = supabase
        .from("expenses")
        .select(
          "id,group_id,amount,date,category,approval_status"
        )
        .eq(
          "id",
          imported.result.id
        )
        .eq(
          "group_id",
          state.groupId
        )
        .limit(1);
    } else {
      const contributionId =
        imported.result?.payment_id ||
        imported.result?.id ||
        normalized.__idempotency_key;

      query = supabase
        .from("contributions")
        .select(
          "id,group_id,member_id,amount,contribution_date,contribution_type,payment_method"
        )
        .eq(
          "id",
          contributionId
        )
        .eq(
          "group_id",
          state.groupId
        )
        .limit(1);
    }

    const {
      data,
      error
    } = await query;

    checks.push({
      row:
        imported.r.row,

      ok:
        !error &&
        !!data?.length,

      detail:
        error?.message ||
        (
          data?.length
            ? "Verified in current group."
            : "Target record not found."
        )
    });
  }

  const bad =
    checks.filter(
      (check) => !check.ok
    ).length;

  if ($("verifyCard")) {
    $("verifyCard").classList.remove(
      "hidden"
    );
  }

  if ($("verifyResult")) {
    $("verifyResult").innerHTML = `
      <div class="notice ${
        bad
          ? "error"
          : "success"
      }">
        ${
          bad
            ? `${bad} verification check(s) failed.`
            : `All ${checks.length} imported row(s) verified in the current group.`
        }
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source row</th>
              <th>Verified</th>
              <th>Detail</th>
            </tr>
          </thead>

          <tbody>
            ${checks
              .map(
                (check) => `
                  <tr>
                    <td>${esc(
                      check.row
                    )}</td>

                    <td>
                      ${
                        check.ok
                          ? "YES"
                          : "NO"
                      }
                    </td>

                    <td>
                      ${esc(
                        check.detail
                      )}
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  step("verify");

  msg(
    bad
      ? "Import finished but verification failed; do not treat the batch as reconciled."
      : "Import and verification completed successfully.",
    bad
      ? "error"
      : "success"
  );
}

function renderMapping() {
  if (!$("mapping")) {
    return;
  }

  $("mapping").innerHTML =
    DEF[state.entity]
      .map(
        ([
          field,
          label,
          mappingType,
          required
        ]) => `
          <div>
            <label>
              ${esc(label)}
              ${required ? "*" : ""}
            </label>

            <select data-field="${esc(
              field
            )}">
              <option value="">
                — Not mapped —
              </option>

              ${state.headers
                .map(
                  (header) => `
                    <option
                      value="${esc(
                        header
                      )}"
                      ${
                        state.mappings[
                          field
                        ] === header
                          ? "selected"
                          : ""
                      }
                    >
                      ${esc(header)}
                    </option>
                  `
                )
                .join("")}
            </select>

            <p class="note">
              ${esc(mappingType)}
            </p>
          </div>
        `
      )
      .join("");
}

function bind() {
  if ($("entity")) {
    $("entity").addEventListener(
      "change",
      (event) => {
        state.entity =
          event.target.value;

        /*
         * Prevent mappings from the previous
         * entity type from leaking into the new
         * entity type.
         */
        state.mappings = {};
        state.results = [];
        state.staged = [];
      }
    );
  }

  if ($("file")) {
    $("file").addEventListener(
      "change",
      (event) => {
        const file =
          event.target.files?.[0];

        if ($("fileInfo")) {
          $("fileInfo").textContent =
            file
              ? `${file.name} — ${file.size.toLocaleString()} bytes`
              : "";
        }
      }
    );
  }

  if ($("stage")) {
    $("stage").addEventListener(
      "click",
      async () => {
        try {
          const file =
            $("file").files?.[0];

          if (!file) {
            throw new Error(
              "Select a CSV or XLSX file first."
            );
          }

          state.fileName =
            file.name;

          state.sourceType =
            file.name
              .toLowerCase()
              .endsWith(".xlsx")
              ? "xlsx"
              : "csv";

          /*
           * Reset candidate state for a new
           * upload while preserving the resolved
           * authenticated group context.
           */
          state.batchId = null;
          state.staged = [];
          state.results = [];
          state.imported = [];

          const parsed =
            matrixRows(
              await readFile(file)
            );

          state.headers =
            parsed.headers;

          state.rows =
            parsed.rows;

          state.mappings = {};

          autoMap();

          await createBatch();
          await stage();
          await saveMaps();

          if ($("mappingCard")) {
            $("mappingCard").classList.remove(
              "hidden"
            );
          }

          renderMapping();
          step("mapping");

          msg(
            `Staged ${state.rows.length} row(s). No target financial record has been imported.`,
            "success"
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Unable to stage file.",
            "error"
          );
        }
      }
    );
  }

  if ($("mapping")) {
    $("mapping").addEventListener(
      "change",
      (event) => {
        if (
          !event.target.dataset.field
        ) {
          return;
        }

        state.mappings[
          event.target.dataset.field
        ] =
          event.target.value ||
          null;
      }
    );
  }

  if ($("validate")) {
    $("validate").addEventListener(
      "click",
      async () => {
        try {
          await validate();

          if ($("validationCard")) {
            $("validationCard").classList.remove(
              "hidden"
            );
          }
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Validation failed.",
            "error"
          );
        }
      }
    );
  }

  if ($("confirm")) {
    $("confirm").addEventListener(
      "click",
      () => {
        if ($("confirmCard")) {
          $("confirmCard").classList.remove(
            "hidden"
          );
        }

        if ($("check")) {
          $("check").checked = false;
        }

        if ($("import")) {
          $("import").disabled = true;
        }

        step("import");
      }
    );
  }

  if ($("check")) {
    $("check").addEventListener(
      "change",
      (event) => {
        if ($("import")) {
          $("import").disabled =
            !event.target.checked;
        }
      }
    );
  }

  if ($("import")) {
    $("import").addEventListener(
      "click",
      async () => {
        try {
          if (
            !$("check")?.checked
          ) {
            return;
          }

          await runImport();
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Import failed.",
            "error"
          );
        }
      }
    );
  }
}

(async () => {
  try {
    bind();

    await context();

    msg(
      "Authenticated group context resolved. Candidate is limited to contributions and expenses.",
      "success"
    );
  } catch (error) {
    console.error(error);

    if ($("stage")) {
      $("stage").disabled = true;
    }

    msg(
      error.message ||
        "Authentication/group context failed.",
      "error"
    );
  }
})();
